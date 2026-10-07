import type { HealthDataPayload } from '../src/shared/data/HealthDataPayload';
import { applyDeviceMetrics } from '../src/shared/health/deviceMetricsOverlay';
import type { DeviceMetricRow } from '../src/shared/health/healthConnectTypes';

const now = new Date(2026, 9, 7, 12, 0);

const emptyRanges = {
  '7d': { startDate: '', endDate: '', bucket: 'day' as const, points: [] },
  '30d': { startDate: '', endDate: '', bucket: '5d' as const, points: [] },
  '3m': { startDate: '', endDate: '', bucket: '2w' as const, points: [] },
};

const metric = (unit: string, goalValue: number) => ({
  label: unit,
  unit,
  currentValue: 999,
  goalValue,
  ranges: emptyRanges,
});

const payload = {
  today: {
    date: '2026-10-04',
    dailyBalance: {
      goals: [
        { metric: 'steps', value: 111, goal: 8000, unit: 'steps', goalMet: false },
        { metric: 'water', value: 1750, goal: 2500, unit: 'ml', goalMet: false },
        { metric: 'calories', value: 222, goal: 650, unit: 'kcal', goalMet: false },
        { metric: 'sleep', value: 333, goal: 480, unit: 'minutes', goalMet: false },
      ],
    },
    metrics: {
      steps: { value: 111, goal: 8000, unit: 'steps', recordedAt: '2026-10-04T10:00:00Z' },
      water: { value: 1750, goal: 2500, unit: 'ml', recordedAt: '2026-10-04T10:00:00Z' },
      weight: { value: 72, unit: 'kg', goal: 70, recordedAt: '2026-10-04T10:00:00Z' },
      sleep: {
        durationMinutes: 333,
        goalMinutes: 480,
        score: 88,
        stages: { deepMinutes: 1, remMinutes: 1, lightMinutes: 1, awakeMinutes: 1 },
        recordedAt: '2026-10-04T10:00:00Z',
      },
      calories: { value: 222, goal: 650, unit: 'kcal', recordedAt: '2026-10-04T10:00:00Z' },
    },
    quickActions: { waterIncrementMl: 250, syncNowEnabled: true },
  },
  logMetric: {},
  analytics: {
    defaultMetric: 'weight',
    defaultRange: '7d',
    availableMetrics: ['weight', 'steps', 'water', 'sleep', 'calories'],
    availableRanges: ['7d', '30d', '3m'],
    metrics: {
      weight: metric('kg', 70),
      steps: metric('steps', 8000),
      water: metric('ml', 2500),
      sleep: metric('h', 8),
      calories: metric('kcal', 650),
    },
  },
} as unknown as HealthDataPayload;

const row = (metricKey: DeviceMetricRow['metricKey'], date: string, value: number): DeviceMetricRow => ({
  metricKey,
  date,
  value,
  deepMinutes: 60,
  remMinutes: 90,
  lightMinutes: 200,
  awakeMinutes: 20,
  recordedAt: '2026-10-07T08:00:00.000Z',
});

describe('applyDeviceMetrics', () => {
  it('replaces steps, sleep and calories and keeps weight and water as stored', () => {
    const result = applyDeviceMetrics(
      payload,
      [row('steps', '2026-10-07', 9000), row('sleep', '2026-10-07', 450), row('calories', '2026-10-07', 700)],
      now,
    );

    expect(result.today.metrics.steps.value).toBe(9000);
    expect(result.today.metrics.calories.value).toBe(700);
    expect(result.today.metrics.sleep.durationMinutes).toBe(450);
    expect(result.today.metrics.sleep.stages.deepMinutes).toBe(60);
    expect(result.today.metrics.water.value).toBe(1750);
    expect(result.today.metrics.weight.value).toBe(72);
    expect(result.analytics.metrics.water).toBe(payload.analytics.metrics.water);

    const goals = Object.fromEntries(result.today.dailyBalance.goals.map(goal => [goal.metric, goal]));
    expect(goals.steps).toMatchObject({ value: 9000, goalMet: true });
    expect(goals.sleep).toMatchObject({ value: 450, goalMet: false });
    expect(goals.water.value).toBe(1750);
  });

  it('shows zero and placeholders instead of stored values when there is no device data', () => {
    const result = applyDeviceMetrics(payload, [], now);

    expect(result.today.metrics.steps.value).toBe(0);
    expect(result.today.metrics.sleep.durationMinutes).toBe(0);
    expect(result.analytics.metrics.steps.currentValue).toBe(0);
    expect(result.analytics.metrics.steps.ranges['7d'].points.every(point => point.isPlaceholder)).toBe(true);
  });

  it('builds 7, 30 and 90 day ranges ending today with sleep in hours', () => {
    const result = applyDeviceMetrics(
      payload,
      [row('sleep', '2026-10-07', 450), row('steps', '2026-10-05', 4000)],
      now,
    );
    const { ranges } = result.analytics.metrics.sleep;

    expect(ranges['7d'].points).toHaveLength(7);
    expect(ranges['30d'].points).toHaveLength(30);
    expect(ranges['3m'].points).toHaveLength(90);
    expect(ranges['7d'].endDate).toBe('2026-10-07');
    expect(ranges['7d'].startDate).toBe('2026-10-01');
    expect(ranges['7d'].points[6]).toMatchObject({ date: '2026-10-07', value: 7.5 });
    expect(result.analytics.metrics.sleep.currentValue).toBe(7.5);
    expect(result.analytics.metrics.steps.ranges['7d'].points[4]).toMatchObject({
      date: '2026-10-05',
      value: 4000,
    });
  });
});
