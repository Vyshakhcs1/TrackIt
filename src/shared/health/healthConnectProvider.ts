import { Platform } from 'react-native';
import {
  SdkAvailabilityStatus,
  aggregateGroupByPeriod,
  deleteRecordsByUuids,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';
import { shiftDateKey, startOfLocalDay } from './dateKeys';
import type { DeviceDailyValue, DeviceMetricKey } from './healthConnectTypes';
import { summarizeSleepByWakeDate } from './sleepNormalizer';

export type HealthConnectAvailability = 'available' | 'unavailable' | 'update_required';

export interface HealthConnectAccess {
  steps: boolean;
  sleep: boolean;
  calories: boolean;
  history: boolean;
  writeWeight: boolean;
  writeWater: boolean;
}

export const healthConnectPackage = 'com.google.android.apps.healthdata';

const requestedPermissions = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'write', recordType: 'Weight' },
  { accessType: 'write', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'ReadHealthDataHistory' },
] as const;

const sleepPageSize = 500;

export async function getHealthConnectAvailability(): Promise<HealthConnectAvailability> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return 'update_required';
  }
  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    return 'unavailable';
  }
  await initialize();
  return 'available';
}

export async function getHealthConnectAccess(): Promise<HealthConnectAccess> {
  const granted = await getGrantedPermissions();
  const has = (accessType: string, recordType: string) =>
    granted.some(
      permission => permission.accessType === accessType && permission.recordType === recordType,
    );
  return {
    steps: has('read', 'Steps'),
    sleep: has('read', 'SleepSession'),
    calories: has('read', 'ActiveCaloriesBurned'),
    history: has('read', 'ReadHealthDataHistory'),
    writeWeight: has('write', 'Weight'),
    writeWater: has('write', 'Hydration'),
  };
}

export async function requestHealthConnectAccess(): Promise<void> {
  await requestPermission([...requestedPermissions]);
}

async function fetchAggregatedDays(
  metric: 'steps' | 'calories',
  startDate: string,
): Promise<DeviceDailyValue[]> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: startOfLocalDay(startDate).toISOString(),
    endTime: new Date().toISOString(),
  };
  const timeRangeSlicer = { period: 'DAYS' as const, length: 1 };

  if (metric === 'steps') {
    const groups = await aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter,
      timeRangeSlicer,
    });
    return groups.map(group => ({
      date: group.startTime.slice(0, 10),
      value: Math.round(group.result.COUNT_TOTAL),
    }));
  }

  const groups = await aggregateGroupByPeriod({
    recordType: 'ActiveCaloriesBurned',
    timeRangeFilter,
    timeRangeSlicer,
  });
  return groups.map(group => ({
    date: group.startTime.slice(0, 10),
    value: Math.round(group.result.ACTIVE_CALORIES_TOTAL.inKilocalories),
  }));
}

async function fetchSleepDays(startDate: string): Promise<DeviceDailyValue[]> {
  // Start a day early so a session that began before the window still counts for its wake date.
  const startTime = startOfLocalDay(shiftDateKey(startDate, -1)).toISOString();
  const endTime = new Date().toISOString();
  const sessions = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
      pageSize: sleepPageSize,
      pageToken,
    });
    sessions.push(...page.records);
    pageToken = page.pageToken;
  } while (pageToken);

  return summarizeSleepByWakeDate(sessions).filter(day => day.date >= startDate);
}

// Returns one value per day from startDate through now; callers keep only the window they asked for.
export async function fetchDeviceDailyValues(
  metric: DeviceMetricKey,
  startDate: string,
): Promise<DeviceDailyValue[]> {
  return metric === 'sleep' ? fetchSleepDays(startDate) : fetchAggregatedDays(metric, startDate);
}

export async function writeWeightRecord(
  clientRecordId: string,
  kilograms: number,
  measuredAt: string,
  version: number,
): Promise<void> {
  await insertRecords([
    {
      recordType: 'Weight',
      time: measuredAt,
      weight: { value: kilograms, unit: 'kilograms' },
      metadata: { clientRecordId, clientRecordVersion: version },
    },
  ]);
}

export async function writeHydrationRecord(
  clientRecordId: string,
  startTime: string,
  endTime: string,
  milliliters: number,
  version: number,
): Promise<void> {
  await insertRecords([
    {
      recordType: 'Hydration',
      startTime,
      endTime,
      volume: { value: milliliters, unit: 'milliliters' },
      metadata: { clientRecordId, clientRecordVersion: version },
    },
  ]);
}

export async function deleteClientRecord(
  recordType: 'Weight' | 'Hydration',
  clientRecordId: string,
): Promise<void> {
  await deleteRecordsByUuids(recordType, [], [clientRecordId]);
}
