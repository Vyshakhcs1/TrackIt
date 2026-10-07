import type { AnalyticsMetricKey, AnalyticsRangeKey, AnalyticsData } from '../../features/analytics/domain/models/AnalyticsData';
import type { HealthDataPayload } from '../data/HealthDataPayload';
import { localDateKey, shiftDateKey, startOfLocalDay } from './dateKeys';
import type { DeviceMetricKey, DeviceMetricRow } from './healthConnectTypes';
import { deviceMetricKeys } from './healthConnectTypes';

const rangeShape: Record<AnalyticsRangeKey, { days: number; bucket: AnalyticsData['metrics']['steps']['ranges']['7d']['bucket'] }> = {
  '7d': { days: 7, bucket: 'day' },
  '30d': { days: 30, bucket: '5d' },
  '3m': { days: 90, bucket: '2w' },
};

function analyticsValue(metric: DeviceMetricKey, value: number): number {
  return metric === 'sleep' ? value / 60 : value;
}

function weekdayInitial(dateKey: string): string {
  return startOfLocalDay(dateKey).toLocaleDateString('en-US', { weekday: 'narrow' });
}

// Replaces steps, sleep and calories values; goals, units and labels stay as stored.
export function applyDeviceMetrics(
  payload: HealthDataPayload,
  rows: DeviceMetricRow[],
  now: Date = new Date(),
): HealthDataPayload {
  const todayKey = localDateKey(now);
  const byMetric = new Map<DeviceMetricKey, Map<string, DeviceMetricRow>>();
  for (const metric of deviceMetricKeys) {
    byMetric.set(metric, new Map());
  }
  for (const row of rows) {
    byMetric.get(row.metricKey)?.set(row.date, row);
  }
  const todayRow = (metric: DeviceMetricKey) => byMetric.get(metric)?.get(todayKey);

  const steps = todayRow('steps');
  const calories = todayRow('calories');
  const sleep = todayRow('sleep');
  const stepsValue = steps?.value ?? 0;
  const caloriesValue = calories?.value ?? 0;
  const sleepMinutes = sleep?.value ?? 0;

  const goals = payload.today.dailyBalance.goals.map(goal => {
    const value = goal.metric === 'steps'
      ? stepsValue
      : goal.metric === 'calories'
        ? caloriesValue
        : goal.metric === 'sleep'
          ? sleepMinutes
          : null;
    return value === null ? goal : { ...goal, value, goalMet: value >= goal.goal };
  });

  const today: HealthDataPayload['today'] = {
    ...payload.today,
    dailyBalance: { goals },
    metrics: {
      ...payload.today.metrics,
      steps: {
        ...payload.today.metrics.steps,
        value: stepsValue,
        recordedAt: steps?.recordedAt ?? payload.today.metrics.steps.recordedAt,
      },
      calories: {
        ...payload.today.metrics.calories,
        value: caloriesValue,
        recordedAt: calories?.recordedAt ?? payload.today.metrics.calories.recordedAt,
      },
      sleep: {
        ...payload.today.metrics.sleep,
        durationMinutes: sleepMinutes,
        // Health Connect does not provide a sleep score.
        score: 0,
        stages: {
          deepMinutes: sleep?.deepMinutes ?? 0,
          remMinutes: sleep?.remMinutes ?? 0,
          lightMinutes: sleep?.lightMinutes ?? 0,
          awakeMinutes: sleep?.awakeMinutes ?? 0,
        },
        recordedAt: sleep?.recordedAt ?? payload.today.metrics.sleep.recordedAt,
      },
    },
  };

  const metrics = { ...payload.analytics.metrics };
  for (const metric of deviceMetricKeys) {
    const existing = metrics[metric as AnalyticsMetricKey];
    if (!existing) {
      continue;
    }
    const daily = byMetric.get(metric) as Map<string, DeviceMetricRow>;
    const ranges = {} as AnalyticsData['metrics'][AnalyticsMetricKey]['ranges'];
    for (const [rangeKey, shape] of Object.entries(rangeShape) as [AnalyticsRangeKey, (typeof rangeShape)[AnalyticsRangeKey]][]) {
      const startDate = shiftDateKey(todayKey, 1 - shape.days);
      ranges[rangeKey] = {
        startDate,
        endDate: todayKey,
        bucket: existing.ranges[rangeKey]?.bucket ?? shape.bucket,
        points: Array.from({ length: shape.days }, (_, index) => {
          const date = shiftDateKey(startDate, index);
          const row = daily.get(date);
          return {
            date,
            ...(rangeKey === '7d' ? { label: weekdayInitial(date) } : {}),
            value: row ? analyticsValue(metric, row.value) : 0,
            ...(row ? {} : { isPlaceholder: true }),
          };
        }),
      };
    }
    const current = daily.get(todayKey);
    metrics[metric as AnalyticsMetricKey] = {
      ...existing,
      currentValue: current ? analyticsValue(metric, current.value) : 0,
      ranges,
    };
  }

  return { ...payload, today, analytics: { ...payload.analytics, metrics } };
}

export function deviceHistoryStartDate(now: Date = new Date()): string {
  return shiftDateKey(localDateKey(now), -89);
}
