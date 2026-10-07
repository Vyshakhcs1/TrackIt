export type DeviceMetricKey = 'steps' | 'sleep' | 'calories';

export const deviceMetricKeys: readonly DeviceMetricKey[] = ['steps', 'sleep', 'calories'];

// steps: count, calories: active kcal, sleep: minutes asleep.
export interface DeviceDailyValue {
  date: string;
  value: number;
  deepMinutes?: number;
  remMinutes?: number;
  lightMinutes?: number;
  awakeMinutes?: number;
}

export interface DeviceMetricRow extends DeviceDailyValue {
  metricKey: DeviceMetricKey;
  recordedAt: string;
}

export type HealthConnectStatus =
  | 'unknown'
  | 'unavailable'
  | 'update_required'
  | 'permission_needed'
  | 'partial'
  | 'ready'
  | 'error';
