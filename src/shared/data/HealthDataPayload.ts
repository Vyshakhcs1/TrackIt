import type { TodayData } from '../../features/home/domain/models/TodayData';
import type { AnalyticsData } from '../../features/analytics/domain/models/AnalyticsData';
import type { LogMetricData } from '../../features/metrics/domain/models/LogMetricData';

export interface HealthDataPayload {
  today: TodayData;
  logMetric: LogMetricData;
  analytics: AnalyticsData;
}