import { useAppSelector } from '../../../../app/store/hooks';
import { selectCurrentWeight } from '../../../../app/store/selectors/healthDataSelectors';
import type {
  AnalyticsData,
  AnalyticsMetricKey,
  AnalyticsRange,
  AnalyticsRangeKey,
} from '../../domain/models/AnalyticsData';
import type { TodayData } from '../../../home/domain/models/TodayData';
import type { LogMetricData } from '../../../metrics/domain/models/LogMetricData';

export interface AnalyticsMetricAppearance {
  accent: string;
  accentDark: string;
  icon: React.ReactNode;
}

export interface AnalyticsSummaryStat {
  label: string;
  value: string;
  sub: string;
  badge?: string;
  type: 'average' | 'goal' | 'peak' | 'total';
}

export interface AnalyticsMetricViewModel {
  key: AnalyticsMetricKey;
  label: string;
  chipValue: string;
  accent: string;
  accentDark: string;
  icon: React.ReactNode;
  category: string;
  value: string;
  unit: string;
  delta: string;
  goal: string;
  goalPosition: number;
  bars: {
    label: string;
    value: number;
    displayValue: string;
    achieved: boolean;
  }[];
  inspectLabels: string[];
  stats: AnalyticsSummaryStat[];
}

const dayMilliseconds = 24 * 60 * 60 * 1000;

interface LocalMetricOverride {
  value: number;
  isPlaceholder: boolean;
}

function utcTime(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(utcTime(date));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function dateCount(startDate: string, endDate: string): number {
  return Math.round((utcTime(endDate) - utcTime(startDate)) / dayMilliseconds) + 1;
}

function formatDate(date: string, weekday = false): string {
  return new Date(utcTime(date)).toLocaleDateString('en-GB', {
    ...(weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
  });
}

function formatDuration(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function formatValue(metric: AnalyticsMetricKey, value: number): string {
  if (metric === 'weight') {
    return value.toFixed(1);
  }
  if (metric === 'sleep') {
    return formatDuration(value);
  }
  return Math.round(value).toLocaleString('en-IN');
}

function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shortUnit(metric: AnalyticsMetricKey): string {
  switch (metric) {
    case 'weight':
      return 'kg';
    case 'steps':
      return 'steps';
    case 'water':
      return 'ml';
    case 'sleep':
      return '';
    case 'calories':
      return 'kcal';
  }
}

function meetsGoal(metric: AnalyticsMetricKey, value: number, goal: number): boolean {
  return metric === 'weight' ? value <= goal : value >= goal;
}

function getBucketSize(rangeKey: AnalyticsRangeKey, range: AnalyticsRange): number {
  if (rangeKey === '7d') {
    return 1;
  }
  return range.bucket === '5d' ? 5 : 14;
}

function makeGroups(rangeKey: AnalyticsRangeKey, range: AnalyticsRange) {
  const size = getBucketSize(rangeKey, range);
  const groups: {
    startDate: string;
    endDate: string;
    average: number;
    values: number[];
    hasData: boolean;
  }[] = [];

  for (let index = 0; index < range.points.length; index += size) {
    const points = range.points.slice(index, index + size);
    if (!points.length) {
      continue;
    }
    const values = points.filter(point => !point.isPlaceholder).map(point => point.value);
    groups.push({
      startDate: points[0].date,
      endDate: points[points.length - 1].date,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      values,
      hasData: values.length > 0,
    });
  }
  return groups;
}

function getLocalMetricOverrides(
  metricKey: AnalyticsMetricKey,
  today: TodayData | null,
  logMetric: LogMetricData | null,
  todayDate: string,
  apiTodayValues: Map<AnalyticsMetricKey, number>,
): Map<string, LocalMetricOverride> {
  const overrides = new Map<string, LocalMetricOverride>();
  if (metricKey === 'weight') {
    const history = [...(logMetric?.history ?? [])].sort(
      (left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt),
    );
    for (const record of history) {
      overrides.set(localDateKey(record.measuredAt), {
        value: record.value,
        isPlaceholder: false,
      });
    }
  }

  if (overrides.has(todayDate)) {
    return overrides;
  }

  if (today) {
    const metric = today.metrics[metricKey];
    const recordedAt = metric.recordedAt;
    if (localDateKey(recordedAt) === todayDate) {
      const value = metricKey === 'sleep'
        ? today.metrics.sleep.durationMinutes / 60
        : metricKey === 'weight'
          ? today.metrics.weight.value
          : metricKey === 'steps'
            ? today.metrics.steps.value
            : metricKey === 'water'
              ? today.metrics.water.value
              : today.metrics.calories.value;
      overrides.set(todayDate, { value, isPlaceholder: false });
      return overrides;
    }
  }

  const apiValue = apiTodayValues.get(metricKey);
  overrides.set(todayDate, {
    value: apiValue ?? 0,
    isPlaceholder: apiValue === undefined,
  });
  return overrides;
}

function mergeLocalMetricPoints(
  range: AnalyticsRange,
  overrides: Map<string, LocalMetricOverride>,
  todayDate: string,
): AnalyticsRange {
  const capacity = Math.max(range.points.length, 1);
  const startDate = shiftDate(todayDate, 1 - capacity);
  const pointsByDate = new Map<string, AnalyticsRange['points'][number]>();
  for (const point of range.points) {
    if (point.date >= startDate && point.date <= todayDate) {
      pointsByDate.set(point.date, point);
    }
  }

  for (const [date, override] of overrides) {
    if (date < startDate || date > todayDate) {
      continue;
    }
    const existing = pointsByDate.get(date);
    const point: AnalyticsRange['points'][number] = existing
      ? { ...existing, value: override.value }
      : { date, value: override.value };
    if (override.isPlaceholder) {
      point.isPlaceholder = true;
    } else {
      delete point.isPlaceholder;
    }
    pointsByDate.set(date, point);
  }

  const allPoints = [...pointsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const visiblePoints = allPoints.length > capacity ? allPoints.slice(allPoints.length - capacity) : allPoints;

  return {
    ...range,
    startDate,
    endDate: todayDate,
    points: visiblePoints,
  };
}

function alignOverlappingRangePoints(
  range: AnalyticsRange,
  preferredRanges: AnalyticsRange[],
): AnalyticsRange {
  const preferredPoints = new Map<string, AnalyticsRange['points'][number]>();
  for (const preferredRange of preferredRanges) {
    for (const point of preferredRange.points) {
      preferredPoints.set(point.date, point);
    }
  }

  return {
    ...range,
    points: range.points.map(point => {
      const preferred = preferredPoints.get(point.date);
      if (!preferred) {
        return point;
      }
      const alignedPoint = { ...point, value: preferred.value };
      if (preferred.isPlaceholder) {
        alignedPoint.isPlaceholder = true;
      } else {
        delete alignedPoint.isPlaceholder;
      }
      return alignedPoint;
    }),
  };
}

function alignAnalyticsRanges(
  ranges: AnalyticsData['metrics'][AnalyticsMetricKey]['ranges'],
): AnalyticsData['metrics'][AnalyticsMetricKey]['ranges'] {
  return {
    ...ranges,
    '30d': alignOverlappingRangePoints(ranges['30d'], [ranges['7d']]),
    '3m': alignOverlappingRangePoints(ranges['3m'], [ranges['30d'], ranges['7d']]),
  };
}

function formatTotal(metric: AnalyticsMetricKey, values: number[]): string {
  const total = values.reduce((sum, value) => sum + value, 0);
  switch (metric) {
    case 'weight':
      return `${(values[values.length - 1] - values[0]).toFixed(1)} kg`;
    case 'steps':
      return Math.round(total).toLocaleString('en-IN');
    case 'water':
      return `${(total / 1000).toFixed(1)} L`;
    case 'sleep':
      return formatDuration(total);
    case 'calories':
      return `${Math.round(total).toLocaleString('en-IN')} kcal`;
  }
}

export function useAnalyticsViewModel(
  appearance: Record<AnalyticsMetricKey, AnalyticsMetricAppearance>,
  requestedMetric?: AnalyticsMetricKey,
  requestedRange?: AnalyticsRangeKey,
  requestedBarIndex?: number,
) {
  const { analytics, today, logMetric, status, error } = useAppSelector(
    state => state.healthData,
  );
  const currentWeight = useAppSelector(selectCurrentWeight);
  const todayDate = localDateKey(new Date().toISOString());

  if (!analytics) {
    return {
      status,
      error,
      defaultMetric: 'weight' as AnalyticsMetricKey,
      defaultRange: '7d' as AnalyticsRangeKey,
      availableMetrics: [] as AnalyticsMetricKey[],
      metricLabels: {} as Record<AnalyticsMetricKey, string>,
      metric: null,
      selectedMetric: 'weight' as AnalyticsMetricKey,
      selectedRange: '7d' as AnalyticsRangeKey,
      selectedBarIndex: 0,
    };
  }

  const apiTodayValues = new Map<AnalyticsMetricKey, number>();
  for (const metricKey of analytics.availableMetrics) {
    const ranges = analytics.metrics[metricKey].ranges;
    const todayPoint = ranges['7d'].points.find(point => point.date === todayDate)
      ?? ranges['30d'].points.find(point => point.date === todayDate)
      ?? ranges['3m'].points.find(point => point.date === todayDate);
    if (todayPoint) {
      apiTodayValues.set(metricKey, todayPoint.value);
    }
  }
  const metricsWithLocalUpdates = Object.fromEntries(
    Object.entries(analytics.metrics).map(([metricKey, metricData]) => {
      const key = metricKey as AnalyticsMetricKey;
      const overrides = getLocalMetricOverrides(key, today, logMetric, todayDate, apiTodayValues);
      const locallyUpdatedRanges = Object.fromEntries(
        Object.entries(metricData.ranges).map(([rangeKey, range]) => [
          rangeKey,
          mergeLocalMetricPoints(range, overrides, todayDate),
        ]),
      ) as AnalyticsData['metrics'][AnalyticsMetricKey]['ranges'];
      const ranges = alignAnalyticsRanges(locallyUpdatedRanges);
      return [key, { ...metricData, ranges }];
    }),
  ) as AnalyticsData['metrics'];

  const selectedMetric = requestedMetric ?? analytics.defaultMetric;
  const selectedRange = requestedRange ?? analytics.defaultRange;
  const chipValues = Object.fromEntries(
    analytics.availableMetrics.map(key => {
      const item = metricsWithLocalUpdates[key];
      const value = key === 'weight'
        ? currentWeight?.value ?? item.currentValue
        : item.ranges['7d'].points[item.ranges['7d'].points.length - 1]?.value ?? item.currentValue;
      return [key, `${formatValue(key, value)} ${shortUnit(key)}`.trim()];
    }),
  ) as Record<AnalyticsMetricKey, string>;
  const metricData = metricsWithLocalUpdates[selectedMetric];
  const range = metricData.ranges[selectedRange];
  const points = range.points;
  const goalValue = selectedMetric === 'weight'
    ? today?.metrics.weight.goal ?? metricData.goalValue
    : metricData.goalValue;
  const dataPoints = points.filter(point => !point.isPlaceholder);
  const values = dataPoints.map(point => point.value);
  const groups = makeGroups(selectedRange, range);
  const scaleMaximum = Math.max(goalValue, ...groups.map(group => group.average)) * 1.1;
  const denominator = dateCount(range.startDate, range.endDate);
  const successfulDays = dataPoints.filter(point => meetsGoal(selectedMetric, point.value, goalValue)).length;
  const goalPercent = denominator ? Math.round((successfulDays / denominator) * 100) : 0;
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const peakPoint = dataPoints.reduce(
    (peak, point) => point.value > peak.value ? point : peak,
    dataPoints[0] ?? points[0],
  );
  const firstValue = values[0] ?? 0;
  const lastValue = values[values.length - 1] ?? 0;
  const change = lastValue - firstValue;
  const bars = groups.map(group => ({
    label: selectedRange === '7d'
      ? formatDate(group.startDate, true).slice(0, 1)
      : formatDate(group.startDate),
    value: scaleMaximum ? (group.average / scaleMaximum) * 100 : 0,
    displayValue: formatValue(selectedMetric, group.average),
    achieved: group.hasData && meetsGoal(selectedMetric, group.average, goalValue),
  }));
  const selectedBarIndex = Math.min(
    Math.max(requestedBarIndex ?? bars.length - 1, 0),
    Math.max(bars.length - 1, 0),
  );
  const selectedGroup = groups[selectedBarIndex];
  const currentValue = selectedMetric === 'weight'
    ? currentWeight?.value ?? metricData.currentValue
    : metricData.ranges['7d'].points[metricData.ranges['7d'].points.length - 1]?.value ?? metricData.currentValue;
  const goalText = selectedMetric === 'sleep'
    ? formatDuration(goalValue)
    : `${formatValue(selectedMetric, goalValue)} ${metricData.unit}`;
  const description = selectedMetric === 'weight'
    ? 'Days at or below target'
    : selectedMetric === 'sleep'
      ? 'Nights at goal'
      : 'Days at goal';
  const summaryStats: AnalyticsSummaryStat[] = [
    {
      type: 'average',
      label: selectedMetric === 'sleep' ? 'DAILY SLEEP AVG' : 'RANGE AVERAGE',
      value: formatValue(selectedMetric, average),
      sub: metricData.unit,
    },
    {
      type: 'goal',
      label: 'GOAL SUCCESS',
      value: `${successfulDays}/${denominator}`,
      badge: `${goalPercent}%`,
      sub: description,
    },
    {
      type: 'peak',
      label: 'PEAK',
      value: formatValue(selectedMetric, peakPoint.value),
      sub: formatDate(peakPoint.date),
    },
    {
      type: 'total',
      label: selectedMetric === 'weight' ? 'CHANGE' : 'TOTAL',
      value: formatTotal(selectedMetric, values),
      sub: selectedMetric === 'weight' ? 'First to last point' : `${denominator} days`,
    },
  ];

  return {
    status,
    error,
    defaultMetric: analytics.defaultMetric,
    defaultRange: analytics.defaultRange,
    availableMetrics: analytics.availableMetrics,
    metricLabels: Object.fromEntries(
      analytics.availableMetrics.map(key => [key, analytics.metrics[key].label]),
    ) as Record<AnalyticsMetricKey, string>,
    chipValues,
    selectedMetric,
    selectedRange,
    selectedBarIndex,
    selectedBucketLabel: selectedGroup
      ? selectedGroup.startDate === selectedGroup.endDate
        ? formatDate(selectedGroup.startDate, true)
        : `${formatDate(selectedGroup.startDate)} – ${formatDate(selectedGroup.endDate)}`
      : '',
    metric: {
      key: selectedMetric,
      label: metricData.label,
      chipValue: `${formatValue(selectedMetric, currentValue)} ${shortUnit(selectedMetric)}`.trim(),
      accent: appearance[selectedMetric].accent,
      accentDark: appearance[selectedMetric].accentDark,
      icon: appearance[selectedMetric].icon,
      category: metricData.label,
      value: formatValue(selectedMetric, selectedGroup?.average ?? currentValue),
      unit: metricData.unit,
      delta: selectedMetric === 'weight'
        ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg over range`
        : `${change > 0 ? '+' : ''}${formatValue(selectedMetric, change)} over range`,
      goal: `Goal ${goalText}`,
      goalPosition: scaleMaximum ? (goalValue / scaleMaximum) * 100 : 0,
      bars,
      inspectLabels: groups.map(group => formatDate(group.startDate)),
      stats: summaryStats,
    },
  };
}
