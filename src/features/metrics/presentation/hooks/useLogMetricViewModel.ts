import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../../app/store/hooks';
import {
  syncQueueCountChanged,
  weightDraftUpdated,
  weightMeasurementAdded,
  weightMeasurementDeleted,
  weightMeasurementUpdated,
} from '../../../../app/store/slices/healthDataSlice';
import { saveUserHealthDataChange } from '../../../../shared/data/healthDataRepository';
import type {
  ComingSoonMetric,
  LogMetricKey,
  WeightMeasurement,
} from '../../domain/models/LogMetricData';
import type { HealthDataPayload } from '../../../../shared/data/HealthDataPayload';

export type MetricTab = 'Weight' | 'Body Fat %' | 'Blood Pressure';
export type WeightUnit = 'kg' | 'lbs';

export interface MeasurementRecordViewModel {
  id: string;
  value: string;
  unit: string;
  timestamp: string;
  note: string;
  synced: boolean;
}

const metricLabels: Record<LogMetricKey | ComingSoonMetric, MetricTab> = {
  weight: 'Weight',
  bodyFatPercent: 'Body Fat %',
  bloodPressure: 'Blood Pressure',
};

const poundsPerKilogram = 2.2046226218;

function formatRecordTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return `${dateLabel} • ${timeLabel}`;
}

function formatWeight(valueInKg: number, unit: WeightUnit): string {
  const value = unit === 'kg' ? valueInKg : valueInKg * poundsPerKilogram;
  return value.toFixed(1);
}

function getWeightInKg(value: number, unit: WeightUnit): number {
  const valueInKg = unit === 'kg' ? value : value / poundsPerKilogram;
  return Math.round(valueInKg * 10) / 10;
}

function toRecordViewModel(record: WeightMeasurement): MeasurementRecordViewModel {
  return {
    id: record.id,
    value: record.value.toFixed(1),
    unit: record.unit,
    timestamp: formatRecordTimestamp(record.measuredAt),
    note: record.note,
    synced: record.syncStatus,
  };
}

export function useLogMetricViewModel() {
  const dispatch = useAppDispatch();
  const healthData = useAppSelector(state => state.healthData);
  const { today, logMetric, status, error } = healthData;
  const authUser = useAppSelector(state => state.auth.user);
  const currentWeight = useAppSelector(state => {
    const records = state.healthData.logMetric?.history ?? [];
    return records.reduce<WeightMeasurement | null>((latest, record) => {
      if (
        !latest ||
        Date.parse(record.measuredAt) > Date.parse(latest.measuredAt)
      ) {
        return record;
      }
      return latest;
    }, null);
  });
  const [activeMetric, setActiveMetric] = useState<MetricTab | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [editing, setEditing] = useState<MeasurementRecordViewModel | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleting, setDeleting] = useState<MeasurementRecordViewModel | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) {
      return;
    }

    const timeout = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(timeout);
  }, [saved]);

  const records = (logMetric?.history ?? [])
    .slice()
    .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt))
    .map(toRecordViewModel);

  const metricTabs = logMetric
    ? [logMetric.supportedMetric, ...logMetric.comingSoonMetrics].map(
        metric => metricLabels[metric],
      )
    : [];
  const selectedMetric = activeMetric ?? metricTabs[0] ?? 'Weight';

  const draft = logMetric?.draft;
  const draftValue = draft ? formatWeight(draft.value, unit) : '0.0';
  const targetWeight = today?.metrics.weight.goal ?? 0;
  const targetValue = formatWeight(targetWeight, unit);

  const updateWeight = (displayValue: number) => {
    dispatch(
      weightDraftUpdated({ value: getWeightInKg(displayValue, unit) }),
    );
  };

  const adjustWeight = (amount: number) => {
    const currentDisplayValue = draft ? Number(draftValue) : 0;
    const minimum = unit === 'kg' ? 10 : 22;
    updateWeight(Math.max(minimum, Math.round((currentDisplayValue + amount) * 10) / 10));
  };

  const saveMeasurement = async () => {
    if (!draft || !logMetric || !authUser || !healthData.today || !healthData.analytics) {
      return;
    }

    const now = new Date().toISOString();
    const measurement: WeightMeasurement = {
      id: `measurement_${Date.now()}`,
      metric: draft.metric,
      value: draft.value,
      unit: 'kg',
      measuredAt: now,
      createdAt: now,
      note: draft.note,
      syncStatus: false,
      source: 'manual',
    };
    const nextLogMetric = {
      ...logMetric,
      draft: {
        ...draft,
        timestamp: now,
      },
      history: [measurement, ...logMetric.history],
    };
    const nextPayload: HealthDataPayload = {
      today: healthData.today,
      analytics: healthData.analytics,
      logMetric: nextLogMetric,
    };

    try {
      const pendingCount = await saveUserHealthDataChange(authUser, nextPayload, {
        recordId: measurement.id,
        metricKey: 'weight',
        recordType: 'measurement',
        recordDate: measurement.measuredAt.slice(0, 10),
        value: measurement.value,
        unit: measurement.unit,
        note: measurement.note,
        payload: measurement,
        operation: 'upsert',
      });
      dispatch(weightMeasurementAdded(measurement));
      dispatch(syncQueueCountChanged(pendingCount));
      setSaved(true);
    } catch {
      Alert.alert('Could not save measurement', 'The weight was not saved. Please try again.');
    }
  };

  const openEdit = (record: MeasurementRecordViewModel) => {
    setEditing(record);
    setEditValue(record.value);
    setEditNote(record.note);
  };

  const confirmEdit = async () => {
    const existing = logMetric?.history.find(record => record.id === editing?.id);
    if (!editing || !existing || !logMetric || !authUser || !healthData.today || !healthData.analytics) {
      return;
    }

    const value = Number(editValue);
    if (!Number.isFinite(value)) {
      return;
    }

    const updated: WeightMeasurement = {
      ...existing,
      value: getWeightInKg(value, editing.unit as WeightUnit),
      note: editNote,
      syncStatus: false,
    };
    const history = logMetric.history.map(record =>
      record.id === updated.id ? updated : record,
    );
    const latest = history.reduce<WeightMeasurement | null>((current, record) =>
      !current || Date.parse(record.measuredAt) > Date.parse(current.measuredAt)
        ? record
        : current,
    null);
    const nextLogMetric = {
      ...logMetric,
      history,
      draft: latest
        ? {
            metric: latest.metric,
            value: latest.value,
            unit: latest.unit,
            timestamp: latest.measuredAt,
            note: latest.note,
          }
        : logMetric.draft,
    };
    const nextPayload: HealthDataPayload = {
      today: healthData.today,
      analytics: healthData.analytics,
      logMetric: nextLogMetric,
    };

    try {
      const pendingCount = await saveUserHealthDataChange(authUser, nextPayload, {
        recordId: updated.id,
        metricKey: 'weight',
        recordType: 'measurement',
        recordDate: updated.measuredAt.slice(0, 10),
        value: updated.value,
        unit: updated.unit,
        note: updated.note,
        payload: updated,
        operation: 'upsert',
      });
      dispatch(weightMeasurementUpdated({ id: updated.id, value: updated.value, note: updated.note }));
      dispatch(syncQueueCountChanged(pendingCount));
      setEditing(null);
    } catch {
      Alert.alert('Could not update measurement', 'The weight change was not saved. Please try again.');
    }
  };

  const confirmDelete = async () => {
    const existing = logMetric?.history.find(record => record.id === deleting?.id);
    if (!deleting || !existing || !logMetric || !authUser || !healthData.today || !healthData.analytics) {
      return;
    }

    const history = logMetric.history.filter(record => record.id !== deleting.id);
    const latest = history.reduce<WeightMeasurement | null>((current, record) =>
      !current || Date.parse(record.measuredAt) > Date.parse(current.measuredAt)
        ? record
        : current,
    null);
    const nextLogMetric = {
      ...logMetric,
      history,
      draft: latest
        ? {
            metric: latest.metric,
            value: latest.value,
            unit: latest.unit,
            timestamp: latest.measuredAt,
            note: latest.note,
          }
        : logMetric.draft,
    };
    const nextPayload: HealthDataPayload = {
      today: healthData.today,
      analytics: healthData.analytics,
      logMetric: nextLogMetric,
    };

    try {
      const pendingCount = await saveUserHealthDataChange(authUser, nextPayload, {
        recordId: existing.id,
        metricKey: 'weight',
        recordType: 'measurement',
        recordDate: existing.measuredAt.slice(0, 10),
        value: existing.value,
        unit: existing.unit,
        note: existing.note,
        payload: existing,
        operation: 'delete',
      });
      dispatch(weightMeasurementDeleted(existing.id));
      dispatch(syncQueueCountChanged(pendingCount));
      setDeleting(null);
    } catch {
      Alert.alert('Could not delete measurement', 'The measurement was not deleted. Please try again.');
    }
  };

  return {
    activeMetric: selectedMetric,
    setActiveMetric,
    metricTabs,
    unit,
    setUnit,
    draft,
    draftValue,
    updateWeight,
    adjustWeight,
    targetValue,
    note: draft?.note ?? '',
    setNote: (note: string) => dispatch(weightDraftUpdated({ note })),
    records,
    editing,
    editValue,
    setEditValue,
    editNote,
    setEditNote,
    openEdit,
    closeEdit: () => setEditing(null),
    confirmEdit,
    deleting,
    setDeleting,
    confirmDelete,
    saved,
    saveMeasurement,
    status,
    error,
    canRender: logMetric !== null,
    currentWeight: currentWeight?.value ?? null,
    currentWeightUnit: currentWeight?.unit ?? 'kg',
    soonMetricKeys: logMetric?.comingSoonMetrics ?? [],
  };
}