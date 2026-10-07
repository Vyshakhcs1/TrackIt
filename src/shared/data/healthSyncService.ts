import type { AuthUser } from '../../features/auth/domain/models/AuthUser';
import type { HealthDataPayload } from './HealthDataPayload';
import { getServerChanges, syncHealthData } from '../api/healthDataApi';
import {
  acknowledgePendingChanges,
  applyServerChanges,
  getPendingSyncChanges,
  getServerCursor,
  getSyncChangeDetails,
  loadHealthDataForUser,
  recordSyncConflicts,
  type LoadedHealthData,
} from './healthDataRepository';
import { partitionSyncResults } from './syncConflicts';

export interface HealthSyncResult {
  loaded: LoadedHealthData;
  uploadedCount: number;
  conflictCount: number;
}

const activeSyncs = new Map<string, Promise<HealthSyncResult>>();

function payloadForSync(
  payload: HealthDataPayload,
  upsertRecordIds: Set<string>,
): HealthDataPayload {
  return {
    ...payload,
    logMetric: {
      ...payload.logMetric,
      history: payload.logMetric.history.map(record =>
        upsertRecordIds.has(record.id) ? { ...record, syncStatus: true } : record,
      ),
    },
  };
}

// Best effort: a failed pull must not fail an upload that already succeeded.
export async function pullServerChanges(user: AuthUser): Promise<boolean> {
  try {
    const response = await getServerChanges(user.id, await getServerCursor(user.id));
    if (!response) {
      return false;
    }
    return (await applyServerChanges(user.id, response)) > 0;
  } catch {
    return false;
  }
}

async function performSync(user: AuthUser): Promise<HealthSyncResult> {
  const pendingChanges = await getPendingSyncChanges(user.id);
  if (!pendingChanges.length) {
    await pullServerChanges(user);
    return {
      loaded: await loadHealthDataForUser(user),
      uploadedCount: 0,
      conflictCount: 0,
    };
  }

  const localHealthData = await loadHealthDataForUser(user);
  const upsertRecordIds = new Set(
    pendingChanges
      .filter(change => change.operation === 'upsert')
      .map(change => change.recordId),
  );
  const changes = (await getSyncChangeDetails(user.id, pendingChanges)) ?? [];
  const response = await syncHealthData(
    user.id,
    payloadForSync(localHealthData.payload, upsertRecordIds),
    changes,
  );

  const { accepted, conflicts } = partitionSyncResults(pendingChanges, response?.results);
  await recordSyncConflicts(user.id, conflicts);
  const versions = new Map(
    (response?.results ?? [])
      .filter(result => result.status === 'accepted' && result.version)
      .map(result => [result.recordId, result.version as string]),
  );
  const acknowledged = await acknowledgePendingChanges(user.id, accepted, versions);
  if (!acknowledged) {
    throw new Error('Unable to acknowledge uploaded changes for this user.');
  }

  const pulled = await pullServerChanges(user);
  return {
    loaded: pulled ? await loadHealthDataForUser(user) : acknowledged,
    uploadedCount: accepted.length,
    conflictCount: conflicts.length,
  };
}

export async function syncPendingHealthData(user: AuthUser): Promise<HealthSyncResult> {
  const activeSync = activeSyncs.get(user.id);
  if (activeSync) {
    return activeSync;
  }

  const sync = performSync(user);
  activeSyncs.set(user.id, sync);
  try {
    return await sync;
  } finally {
    if (activeSyncs.get(user.id) === sync) {
      activeSyncs.delete(user.id);
    }
  }
}