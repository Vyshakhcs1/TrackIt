import type { AuthUser } from '../../features/auth/domain/models/AuthUser';
import { flushHealthConnectWriteBack } from '../health/healthConnectWriteBackService';
import {
  saveUserHealthDataChange as saveLocalHealthDataChange,
  type PendingRecordChange,
} from '../database/offlineHealthRepository';
import type { HealthDataPayload } from './HealthDataPayload';

export {
  acknowledgePendingChanges,
  applyServerChanges,
  getOpenConflicts,
  getPendingSyncCount,
  getPendingSyncChanges,
  getServerCursor,
  getSyncChangeDetails,
  loadHealthDataForUser,
  recordSyncConflicts,
  resolveSyncConflict,
} from '../database/offlineHealthRepository';
export type {
  LoadedHealthData,
  PendingRecordChange,
} from '../database/offlineHealthRepository';

export async function saveUserHealthDataChange(
  user: AuthUser,
  payload: HealthDataPayload,
  change: PendingRecordChange,
): Promise<number> {
  const pendingCount = await saveLocalHealthDataChange(user, payload, change);
  // Local SQLite is committed first; the Health Connect write is best effort and retried later.
  flushHealthConnectWriteBack(user.id).catch(() => undefined);
  return pendingCount;
}