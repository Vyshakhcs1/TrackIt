export type AnalyticsMetricKey =
  | 'weight'
  | 'steps'
  | 'water'
  | 'sleep'
  | 'calories';

export type AnalyticsRangeKey = '7d' | '30d' | '3m';
export type AnalyticsBucket = 'day' | '5d' | '2w';

export interface AnalyticsPoint {
  date: string;
  label?: string;
  value: number;
  displayValue?: string;
  isPlaceholder?: boolean;
}

export interface AnalyticsRange {
  startDate: string;
  endDate: string;
  bucket: AnalyticsBucket;
  points: AnalyticsPoint[];
}

export interface AnalyticsMetricData {
  label: string;
  unit: string;
  currentValue: number;
  goalValue: number;
  ranges: Record<AnalyticsRangeKey, AnalyticsRange>;
}

export interface AnalyticsData {
  defaultMetric: AnalyticsMetricKey;
  defaultRange: AnalyticsRangeKey;
  availableMetrics: AnalyticsMetricKey[];
  availableRanges: AnalyticsRangeKey[];
  metrics: Record<AnalyticsMetricKey, AnalyticsMetricData>;
}