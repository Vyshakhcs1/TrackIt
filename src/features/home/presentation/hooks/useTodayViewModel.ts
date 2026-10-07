import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAppDispatch, useAppSelector } from '../../../../app/store/hooks';
import { selectCurrentWeight } from '../../../../app/store/selectors/healthDataSelectors';
import {
  healthDataLoadFailed,
  healthDataLoadStarted,
  healthDataLoadSucceeded,
  syncQueueCountChanged,
} from '../../../../app/store/slices/healthDataSlice';
import {
  loadHealthDataForUser,
  saveUserHealthDataChange,
} from '../../../../shared/data/healthDataRepository';
import { syncPendingHealthData } from '../../../../shared/data/healthSyncService';
import { useHealthConnect } from '../../../../shared/health/useHealthConnect';
import { useSyncConflicts } from '../../../../shared/data/useSyncConflicts';
import type { TodayGoalMetric } from '../../domain/models/TodayData';

const goalLabels: Record<TodayGoalMetric, string> = {
  steps: 'Steps',
  water: 'Hydration',
  calories: 'Calories',
  sleep: 'Sleep Duration',
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

function formatGoal(metric: TodayGoalMetric, goal: number): string {
  switch (metric) {
    case 'steps':
      return `${goal / 1000}k`;
    case 'water':
      return `${goal.toLocaleString('en-IN')} ml`;
    case 'calories':
      return `${goal} kcal`;
    case 'sleep':
      return formatDuration(goal);
  }
}

function formatGoalValue(metric: TodayGoalMetric, value: number): string {
  return metric === 'sleep'
    ? formatDuration(value)
    : value.toLocaleString('en-IN');
}

function getProgress(value: number, goal: number): number {
  if (goal <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (value / goal) * 100));
}

function formatDate(dateValue: string, includeYear: boolean): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  });
}

export function useTodayViewModel() {
  const dispatch = useAppDispatch();
  const healthData = useAppSelector(state => state.healthData);
  const authUser = useAppSelector(state => state.auth.user);
  const { today: data, status, error, pendingSyncCount } = healthData;
  const loadStateRef = useRef({
    userId: authUser?.id ?? null,
    inFlight: false,
    settled: false,
  });
  const syncInFlightRef = useRef(false);
  const syncToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const currentUserId = authUser?.id ?? null;
  if (loadStateRef.current.userId !== currentUserId) {
    loadStateRef.current = { userId: currentUserId, inFlight: false, settled: false };
  }
  const latestWeight = useAppSelector(selectCurrentWeight);
  const healthConnect = useHealthConnect();
  const syncConflicts = useSyncConflicts();
  const network = useNetInfo();
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;

  useEffect(() => () => {
    if (syncToastTimeoutRef.current) {
      clearTimeout(syncToastTimeoutRef.current);
    }
  }, []);

  const showSyncToast = (message: string) => {
    if (syncToastTimeoutRef.current) {
      clearTimeout(syncToastTimeoutRef.current);
    }
    setSyncToastMessage(message);
    syncToastTimeoutRef.current = setTimeout(() => {
      setSyncToastMessage(null);
      syncToastTimeoutRef.current = null;
    }, 5000);
  };

  useFocusEffect(
    useCallback(() => {
      if (!authUser || loadStateRef.current.inFlight || loadStateRef.current.settled) {
        return;
      }

      const loadState = loadStateRef.current;
      loadState.inFlight = true;
      dispatch(healthDataLoadStarted());
      let active = true;
      loadHealthDataForUser(authUser)
        .then(result => {
          if (!active) {
            return;
          }
          loadState.inFlight = false;
          loadState.settled = true;
          dispatch(healthDataLoadSucceeded(result.payload));
          dispatch(syncQueueCountChanged(result.pendingCount));
        })
        .catch(loadError => {
          if (!active) {
            return;
          }
          loadState.inFlight = false;
          loadState.settled = true;
        dispatch(
          healthDataLoadFailed(
            loadError instanceof Error ? loadError.message : 'Unable to load Today data.',
          ),
        );
        });

      return () => {
        active = false;
        if (!loadState.settled) {
          loadState.inFlight = false;
        }
      };
    }, [authUser, dispatch]),
  );

  const goals = data?.dailyBalance.goals ?? [];
  const goalRows = goals.map(goal => ({
    metric: goal.metric,
    label: goalLabels[goal.metric],
    value: formatGoalValue(goal.metric, goal.value),
    goal: formatGoal(goal.metric, goal.goal),
    progress: getProgress(goal.value, goal.goal),
    isMet: goal.value >= goal.goal,
  }));
  const completedGoals = goalRows.filter(goal => goal.isMet).length;
  const dailyProgress = goalRows.length
    ? Math.round(
        goalRows.reduce((total, goal) => total + goal.progress, 0) /
          goalRows.length,
      )
    : 0;
  const sleepStages = data?.metrics.sleep.stages;
  const sleepMinutes = sleepStages
    ? sleepStages.deepMinutes + sleepStages.remMinutes + sleepStages.lightMinutes
    : 0;
  const sleepEfficiency = data?.metrics.sleep.durationMinutes
    ? Math.round((sleepMinutes / data.metrics.sleep.durationMinutes) * 100)
    : 0;
  const sleep = data?.metrics.sleep;
  const weight = data && latestWeight
    ? { ...data.metrics.weight, value: latestWeight.value }
    : undefined;
  const weightDifference = weight ? Math.abs(weight.value - weight.goal) : 0;

  const addWater = async () => {
    if (!data || !authUser || !healthData.logMetric || !healthData.analytics) {
      return;
    }

    const value = Math.min(
      data.metrics.water.goal,
      data.metrics.water.value + data.quickActions.waterIncrementMl,
    );
    if (value === data.metrics.water.value) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const water = { ...data.metrics.water, value, recordedAt: updatedAt };
    const today = {
      ...data,
      metrics: { ...data.metrics, water },
      dailyBalance: {
        ...data.dailyBalance,
        goals: data.dailyBalance.goals.map(goal =>
          goal.metric === 'water' ? { ...goal, value, goalMet: value >= goal.goal } : goal,
        ),
      },
    };
    const analyticsWater = healthData.analytics.metrics.water;
    const analytics = {
      ...healthData.analytics,
      metrics: {
        ...healthData.analytics.metrics,
        water: {
          ...analyticsWater,
          currentValue: value,
          ranges: Object.fromEntries(
            Object.entries(analyticsWater.ranges).map(([rangeKey, range]) => [
              rangeKey,
              {
                ...range,
                points: range.points.map(point =>
                  point.date === data.date ? { ...point, value } : point,
                ),
              },
            ]),
          ) as typeof analyticsWater.ranges,
        },
      },
    };
    const payload = { today, logMetric: healthData.logMetric, analytics };

    try {
      const pendingCount = await saveUserHealthDataChange(authUser, payload, {
        recordId: `today:water:${data.date}`,
        metricKey: 'water',
        recordType: 'today',
        recordDate: data.date,
        value,
        unit: water.unit,
        note: null,
        payload: water,
        operation: 'upsert',
      });
      dispatch(healthDataLoadSucceeded(payload));
      dispatch(syncQueueCountChanged(pendingCount));
    } catch {
      Alert.alert('Could not save water', 'Your update was not saved. Please try again.');
    }
  };

  const syncNow = async () => {
    if (!authUser || !isOnline) {
      Alert.alert('You are offline', 'Your changes remain safely queued on this device.');
      return;
    }
    if (syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    try {
      const result = await syncPendingHealthData(authUser);
      dispatch(healthDataLoadSucceeded(result.loaded.payload));
      dispatch(syncQueueCountChanged(result.loaded.pendingCount));
      if (result.conflictCount) {
        Alert.alert(
          'Review needed',
          'Some changes conflict with newer data on the server. Choose which version to keep.',
        );
        return;
      }
      if (!result.uploadedCount) {
        Alert.alert('Already synced', 'There are no pending changes to upload.');
        return;
      }

      showSyncToast(
        result.loaded.pendingCount
          ? 'Changes uploaded. Newer updates remain queued.'
          : 'Your local changes were uploaded to the server.',
      );
    } catch {
      Alert.alert('Sync failed', 'Your changes remain queued on this device.');
    } finally {
      syncInFlightRef.current = false;
    }
  };

  return {
    data,
    status,
    error,
    healthConnectStatus: healthConnect.status,
    connectHealthConnect: healthConnect.connect,
    syncConflict: syncConflicts.conflicts[0] ?? null,
    syncConflictCount: syncConflicts.conflicts.length,
    resolveSyncConflict: syncConflicts.resolve,
    dateWithYear: data ? formatDate(data.date, true) : '',
    dateWithoutYear: data ? formatDate(data.date, false) : '',
    goalRows,
    dailyProgress,
    completedGoals,
    totalGoals: goalRows.length,
    ringProgress: goalRows.map(goal => goal.progress),
    waterPercent: data
      ? Math.round(getProgress(data.metrics.water.value, data.metrics.water.goal))
      : 0,
    waterIncrement: data?.quickActions.waterIncrementMl ?? 0,
    canAddWater: data
      ? data.metrics.water.value < data.metrics.water.goal
      : false,
    canSyncNow: isOnline && pendingSyncCount > 0,
    isOnline,
    pendingSyncCount,
    syncToastMessage,
    waterValueLiters: data ? (data.metrics.water.value / 1000).toFixed(2) : '0.00',
    waterGoalLiters: data ? (data.metrics.water.goal / 1000).toFixed(1) : '0.0',
    weightValue: weight ? weight.value.toFixed(1) : '—',
    weightGoalCaption: data ? `Target: ${data.metrics.weight.goal}kg` : '',
    sleepScore: sleep?.score ?? 0,
    sleepStats: sleep
      ? [
          { label: 'ASLEEP', value: formatDuration(sleep.durationMinutes) },
          { label: 'DEEP SLEEP', value: formatDuration(sleep.stages.deepMinutes) },
          { label: 'REM CYCLE', value: formatDuration(sleep.stages.remMinutes) },
          { label: 'LIGHT SLEEP', value: formatDuration(sleep.stages.lightMinutes) },
          { label: 'EFFICIENCY', value: `${sleepEfficiency}%` },
        ]
      : [],
    weightDifferenceText: weight
      ? weight.value === weight.goal
        ? 'Goal reached'
        : weight.value > weight.goal
          ? `${weightDifference.toFixed(1)} kg to go`
          : `${weightDifference.toFixed(1)} kg below goal`
      : 'No measurement',
    sleepEfficiency,
    addWater,
    syncNow,
  };
}