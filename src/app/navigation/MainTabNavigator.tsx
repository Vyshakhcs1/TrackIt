import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  ChartNoAxesColumnIncreasing,
  LayoutDashboard,
  PlusCircle,
} from 'lucide-react-native';
import type { MainTabParamList } from './routes';
import { TodayScreen } from '../../features/home/presentation/screens/TodayScreen';
import { AnalyticsScreen } from '../../features/analytics/presentation/screens/AnalyticsScreen';
import { LogMetricScreen } from '../../features/metrics/presentation/screens/LogMetricScreen';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  autoSyncPreferenceChanged,
  healthDataLoadSucceeded,
  syncQueueCountChanged,
} from '../store/slices/healthDataSlice';
import { readAutoSyncEnabled } from '../../shared/data/autoSyncPreferenceStorage';
import { syncPendingHealthData, pullServerChanges } from '../../shared/data/healthSyncService';
import { loadHealthDataForUser } from '../../shared/data/healthDataRepository';
import { useHealthConnect } from '../../shared/health/useHealthConnect';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TodayTabIcon({ color }: { color: string }) {
  return <LayoutDashboard color={color} size={22} strokeWidth={2} />;
}

function AnalyticsTabIcon({ color }: { color: string }) {
  return <ChartNoAxesColumnIncreasing color={color} size={22} strokeWidth={2} />;
}

function LogMetricTabIcon({ color }: { color: string }) {
  return <PlusCircle color={color} size={22} strokeWidth={2} />;
}

export function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const authUser = useAppSelector(state => state.auth.user);
  const { autoSyncEnabled, pendingSyncCount, status } = useAppSelector(state => state.healthData);
  const network = useNetInfo();
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;
  const userId = authUser?.id;
  const { refresh: refreshHealthConnect } = useHealthConnect();

  useEffect(() => {
    if (!userId || status !== 'succeeded') {
      return;
    }
    refreshHealthConnect();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshHealthConnect();
      }
    });
    return () => subscription.remove();
  }, [refreshHealthConnect, status, userId]);

  useEffect(() => {
    if (!authUser || !isOnline || status !== 'succeeded') {
      return;
    }
    let active = true;
    const pull = async () => {
      if (!(await pullServerChanges(authUser)) || !active) {
        return;
      }
      const loaded = await loadHealthDataForUser(authUser);
      if (active) {
        dispatch(healthDataLoadSucceeded(loaded.payload));
        dispatch(syncQueueCountChanged(loaded.pendingCount));
      }
    };
    pull().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        pull().catch(() => undefined);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [authUser, dispatch, isOnline, status]);

  useEffect(() => {
    if (!userId) {
      dispatch(autoSyncPreferenceChanged(false));
      return;
    }

    let active = true;
    readAutoSyncEnabled(userId)
      .then(enabled => {
        if (active) {
          dispatch(autoSyncPreferenceChanged(enabled));
        }
      })
      .catch(() => {
        if (active) {
          dispatch(autoSyncPreferenceChanged(false));
        }
      });

    return () => {
      active = false;
    };
  }, [dispatch, userId]);

  useEffect(() => {
    if (!authUser || !autoSyncEnabled || !isOnline || !pendingSyncCount || status !== 'succeeded') {
      return;
    }

    let active = true;
    syncPendingHealthData(authUser)
      .then(result => {
        if (active) {
          dispatch(healthDataLoadSucceeded(result.loaded.payload));
          dispatch(syncQueueCountChanged(result.loaded.pendingCount));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [authUser, autoSyncEnabled, dispatch, isOnline, pendingSyncCount, status]);

  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000000',
        tabBarInactiveTintColor: '#45464D',
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
          backgroundColor: 'rgba(248,249,255,0.96)',
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#0B1C30',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Manrope',
          fontSize: 12,
          lineHeight: 16,
          fontWeight: '500',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarLabel: 'Today',
          tabBarIcon: TodayTabIcon,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: AnalyticsTabIcon,
        }}
      />
      <Tab.Screen
        name="LogMetric"
        component={LogMetricScreen}
        options={{
          tabBarLabel: 'Log Metric',
          tabBarIcon: LogMetricTabIcon,
        }}
      />
    </Tab.Navigator>
  );
}