export type LogMetricKey = 'weight';
export type ComingSoonMetric = 'bodyFatPercent' | 'bloodPressure';
export type MeasurementFilter = 'all' | 'pending' | 'synced';

export interface WeightDraft {
  metric: LogMetricKey;
  value: number;
  unit: 'kg';
  timestamp: string;
  note: string;
}

export interface WeightMeasurement {
  id: string;
  metric: LogMetricKey;
  value: number;
  unit: 'kg';
  measuredAt: string;
  createdAt: string;
  note: string;
  syncStatus: boolean;
  source: 'manual';
}

export interface LogMetricData {
  supportedMetric: LogMetricKey;
  comingSoonMetrics: ComingSoonMetric[];
  draft: WeightDraft;
  history: WeightMeasurement[];
  filters: MeasurementFilter[];
}