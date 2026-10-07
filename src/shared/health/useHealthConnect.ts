import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import {
  healthConnectStatusChanged,
  healthDataLoadSucceeded,
  syncQueueCountChanged,
} from '../../app/store/slices/healthDataSlice';
import { loadHealthDataForUser } from '../data/healthDataRepository';
import { refreshDeviceHealthData } from './healthConnectImportService';
import { requestHealthConnectAccess } from './healthConnectProvider';
import { flushHealthConnectWriteBack } from './healthConnectWriteBackService';

export function useHealthConnect() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);
  const status = useAppSelector(state => state.healthData.healthConnectStatus);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    try {
      // Seeds the local user first so device rows always have an account to attach to.
      await loadHealthDataForUser(user);
      const result = await refreshDeviceHealthData(user);
      dispatch(healthConnectStatusChanged(result.status));
      if (result.changed) {
        const loaded = await loadHealthDataForUser(user);
        dispatch(healthDataLoadSucceeded(loaded.payload));
        dispatch(syncQueueCountChanged(loaded.pendingCount));
      }
      flushHealthConnectWriteBack(user.id).catch(() => undefined);
    } catch {
      dispatch(healthConnectStatusChanged('error'));
    }
  }, [dispatch, user]);

  const connect = useCallback(async () => {
    try {
      await requestHealthConnectAccess();
    } catch {
      dispatch(healthConnectStatusChanged('error'));
      return;
    }
    await refresh();
  }, [dispatch, refresh]);

  return { status, refresh, connect };
}
