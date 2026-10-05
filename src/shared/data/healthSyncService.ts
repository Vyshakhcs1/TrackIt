import type { AuthUser } from '../../features/auth/domain/models/AuthUser';
import type { HealthDataPayload } from './HealthDataPayload';
import { syncHealthData } from '../api/healthDataApi';
import {
  acknowledgePendingChanges,
  getPendingSyncChanges,
  loadHealthDataForUser,
  type LoadedHealthData,
} from './healthDataRepository';

export interface HealthSyncResult {
  loaded: LoadedHealthData;
  uploadedCount: number;
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

async function performSync(user: AuthUser): Promise<HealthSyncResult> {
  const pendingChanges = await getPendingSyncChanges(user.id);
  if (!pendingChanges.length) {
    return {
      loaded: await loadHealthDataForUser(user),
      uploadedCount: 0,
    };
  }

  const localHealthData = await loadHealthDataForUser(user);
  const upsertRecordIds = new Set(
    pendingChanges
      .filter(change => change.operation === 'upsert')
      .map(change => change.recordId),
  );
  await syncHealthData(user.id, payloadForSync(localHealthData.payload, upsertRecordIds));

  const loaded = await acknowledgePendingChanges(user.id, pendingChanges);
  if (!loaded) {
    throw new Error('Unable to acknowledge uploaded changes for this user.');
  }
  return { loaded, uploadedCount: pendingChanges.length };
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