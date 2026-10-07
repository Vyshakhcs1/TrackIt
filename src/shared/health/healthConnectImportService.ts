import type { AuthUser } from '../../features/auth/domain/models/AuthUser';
import {
  getDeviceImportState,
  recordDeviceImport,
  replaceDeviceDailyMetrics,
} from '../database/offlineHealthRepository';
import { localDateKey, shiftDateKey } from './dateKeys';
import {
  fetchDeviceDailyValues,
  getHealthConnectAccess,
  getHealthConnectAvailability,
} from './healthConnectProvider';
import type { DeviceMetricKey, HealthConnectStatus } from './healthConnectTypes';

export interface DeviceRefreshResult {
  status: HealthConnectStatus;
  changed: boolean;
}

const fullBackfillDays = 90;
const withoutHistoryDays = 30;
const rollingRefreshDays = 7;
const chunkDays = 30;

let activeRefresh: Promise<DeviceRefreshResult> | null = null;

async function importMetric(
  userId: string,
  metric: DeviceMetricKey,
  startDate: string,
  endDate: string,
): Promise<boolean> {
  const fetched = await fetchDeviceDailyValues(metric, startDate);
  // Chunks bound how many rows are written per transaction.
  let changed = false;
  for (let cursor = startDate; cursor <= endDate; cursor = shiftDateKey(cursor, chunkDays)) {
    const chunkEnd = shiftDateKey(cursor, chunkDays - 1) < endDate
      ? shiftDateKey(cursor, chunkDays - 1)
      : endDate;
    const values = fetched.filter(day => day.date >= cursor && day.date <= chunkEnd);
    if (await replaceDeviceDailyMetrics(userId, metric, cursor, chunkEnd, values)) {
      changed = true;
    }
  }
  return changed;
}

async function performRefresh(user: AuthUser, now: Date): Promise<DeviceRefreshResult> {
  const availability = await getHealthConnectAvailability();
  if (availability === 'unavailable') {
    return { status: 'unavailable', changed: false };
  }
  if (availability === 'update_required') {
    return { status: 'update_required', changed: false };
  }

  const access = await getHealthConnectAccess();
  const metrics = (['steps', 'sleep', 'calories'] as const).filter(metric => access[metric]);
  if (!metrics.length) {
    return { status: 'permission_needed', changed: false };
  }

  const state = await getDeviceImportState(user.id);
  const maximumDays = access.history ? fullBackfillDays : withoutHistoryDays;
  const lookbackDays = state.backfilledDays < maximumDays ? maximumDays : rollingRefreshDays;
  const today = localDateKey(now);
  const startDate = shiftDateKey(today, 1 - lookbackDays);

  let changed = false;
  for (const metric of metrics) {
    if (await importMetric(user.id, metric, startDate, today)) {
      changed = true;
    }
  }
  await recordDeviceImport(user.id, lookbackDays);

  return { status: metrics.length === 3 ? 'ready' : 'partial', changed };
}

export function refreshDeviceHealthData(
  user: AuthUser,
  now: Date = new Date(),
): Promise<DeviceRefreshResult> {
  if (!activeRefresh) {
    activeRefresh = performRefresh(user, now).finally(() => {
      activeRefresh = null;
    });
  }
  return activeRefresh;
}
