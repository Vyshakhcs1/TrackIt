import {
  completeWriteBack,
  failWriteBack,
  getPendingWriteBacks,
  loadWriteBackSource,
  type PendingWriteBack,
} from '../database/offlineHealthRepository';
import { localDateKey, startOfLocalDay } from './dateKeys';
import {
  deleteClientRecord,
  getHealthConnectAccess,
  getHealthConnectAvailability,
  writeHydrationRecord,
  writeWeightRecord,
} from './healthConnectProvider';

const activeFlushes = new Map<string, Promise<void>>();

async function applyOperation(userId: string, operation: PendingWriteBack): Promise<void> {
  const version = Date.parse(operation.createdAt);
  const source = operation.operation === 'upsert'
    ? await loadWriteBackSource(userId, operation.recordId)
    : null;

  if (operation.kind === 'weight') {
    if (!source || source.deleted) {
      await deleteClientRecord('Weight', operation.recordId);
      return;
    }
    await writeWeightRecord(
      operation.recordId,
      source.value,
      source.recordedAt ?? operation.createdAt,
      version,
    );
    return;
  }

  if (!source) {
    return;
  }
  // One hydration record per day holds the day's total, so a retry replaces it.
  const start = startOfLocalDay(source.recordDate);
  const isToday = source.recordDate === localDateKey(new Date());
  const end = isToday
    ? new Date()
    : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59);
  await writeHydrationRecord(
    operation.recordId,
    start.toISOString(),
    (end.getTime() > start.getTime() ? end : new Date(start.getTime() + 60000)).toISOString(),
    source.value,
    version,
  );
}

async function performFlush(userId: string): Promise<void> {
  const pending = await getPendingWriteBacks(userId);
  if (!pending.length) {
    return;
  }
  if ((await getHealthConnectAvailability()) !== 'available') {
    return;
  }
  const access = await getHealthConnectAccess();

  for (const operation of pending) {
    const allowed = operation.kind === 'weight' ? access.writeWeight : access.writeWater;
    if (!allowed) {
      continue;
    }
    try {
      await applyOperation(userId, operation);
      await completeWriteBack(operation);
    } catch (error) {
      await failWriteBack(
        operation.operationId,
        error instanceof Error ? error.message : 'Health Connect write failed.',
      );
    }
  }
}

// Failures leave the operation queued; client record ids make a retry replace, not duplicate.
export function flushHealthConnectWriteBack(userId: string): Promise<void> {
  const active = activeFlushes.get(userId);
  if (active) {
    return active;
  }
  const flush = performFlush(userId).finally(() => {
    activeFlushes.delete(userId);
  });
  activeFlushes.set(userId, flush);
  return flush;
}
