import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TodayData } from '../../../features/home/domain/models/TodayData';
import type { AnalyticsData } from '../../../features/analytics/domain/models/AnalyticsData';
import type {
  LogMetricData,
  WeightMeasurement,
} from '../../../features/metrics/domain/models/LogMetricData';
import type { HealthDataPayload } from '../../../shared/data/HealthDataPayload';

type HealthDataLoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface HealthDataState {
  today: TodayData | null;
  logMetric: LogMetricData | null;
  analytics: AnalyticsData | null;
  pendingSyncCount: number;
  autoSyncEnabled: boolean;
  status: HealthDataLoadStatus;
  error: string | null;
}

const initialState: HealthDataState = {
  today: null,
  logMetric: null,
  analytics: null,
  pendingSyncCount: 0,
  autoSyncEnabled: false,
  status: 'idle',
  error: null,
};

const healthDataSlice = createSlice({
  name: 'healthData',
  initialState,
  reducers: {
    healthDataLoadStarted(state) {
      state.status = 'loading';
      state.error = null;
    },
    healthDataLoadSucceeded(state, action: PayloadAction<HealthDataPayload>) {
      state.today = action.payload.today;
      state.logMetric = action.payload.logMetric;
      state.analytics = action.payload.analytics;
      state.status = 'succeeded';
      state.error = null;
    },
    healthDataLoadFailed(state, action: PayloadAction<string>) {
      state.status = 'failed';
      state.error = action.payload;
    },
    syncQueueCountChanged(state, action: PayloadAction<number>) {
      state.pendingSyncCount = action.payload;
    },
    autoSyncPreferenceChanged(state, action: PayloadAction<boolean>) {
      state.autoSyncEnabled = action.payload;
    },
    healthDataCleared() {
      return initialState;
    },
    waterIncremented(state, action: PayloadAction<number>) {
      if (!state.today) {
        return;
      }

      const water = state.today.metrics.water;
      water.value = Math.min(water.goal, water.value + action.payload);

      const waterGoal = state.today.dailyBalance.goals.find(
        goal => goal.metric === 'water',
      );
      if (waterGoal) {
        waterGoal.value = water.value;
      }
    },
    weightMeasurementAdded(state, action: PayloadAction<WeightMeasurement>) {
      if (!state.logMetric) {
        return;
      }

      state.logMetric.history.unshift(action.payload);
      state.logMetric.draft = {
        metric: action.payload.metric,
        value: action.payload.value,
        unit: action.payload.unit,
        timestamp: action.payload.measuredAt,
        note: action.payload.note,
      };
    },
    weightDraftUpdated(
      state,
      action: PayloadAction<Partial<Pick<LogMetricData['draft'], 'value' | 'note'>>>,
    ) {
      if (!state.logMetric) {
        return;
      }

      Object.assign(state.logMetric.draft, action.payload);
    },
    weightMeasurementUpdated(
      state,
      action: PayloadAction<Pick<WeightMeasurement, 'id' | 'value' | 'note'>>,
    ) {
      if (!state.logMetric) {
        return;
      }

      const record = state.logMetric.history.find(
        measurement => measurement.id === action.payload.id,
      );
      if (!record) {
        return;
      }

      record.value = action.payload.value;
      record.note = action.payload.note;
      record.syncStatus = false;

      const latestMeasurement = getLatestWeight(state.logMetric.history);
      if (latestMeasurement) {
        state.logMetric.draft = {
          metric: latestMeasurement.metric,
          value: latestMeasurement.value,
          unit: latestMeasurement.unit,
          timestamp: latestMeasurement.measuredAt,
          note: latestMeasurement.note,
        };
      }
    },
    weightMeasurementDeleted(state, action: PayloadAction<string>) {
      if (!state.logMetric) {
        return;
      }

      state.logMetric.history = state.logMetric.history.filter(
        record => record.id !== action.payload,
      );

      const latestMeasurement = getLatestWeight(state.logMetric.history);
      if (latestMeasurement) {
        state.logMetric.draft = {
          metric: latestMeasurement.metric,
          value: latestMeasurement.value,
          unit: latestMeasurement.unit,
          timestamp: latestMeasurement.measuredAt,
          note: latestMeasurement.note,
        };
      }
    },
  },
});

function getLatestWeight(
  history: WeightMeasurement[],
): WeightMeasurement | undefined {
  return history.reduce<WeightMeasurement | undefined>((latest, measurement) => {
    if (
      !latest ||
      Date.parse(measurement.measuredAt) > Date.parse(latest.measuredAt)
    ) {
      return measurement;
    }

    return latest;
  }, undefined);
}

export const {
  healthDataLoadFailed,
  healthDataCleared,
  healthDataLoadStarted,
  healthDataLoadSucceeded,
  autoSyncPreferenceChanged,
  syncQueueCountChanged,
  waterIncremented,
  weightDraftUpdated,
  weightMeasurementAdded,
  weightMeasurementDeleted,
  weightMeasurementUpdated,
} = healthDataSlice.actions;

export default healthDataSlice.reducer;