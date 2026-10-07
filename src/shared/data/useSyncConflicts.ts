import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import {
  healthDataLoadSucceeded,
  syncQueueCountChanged,
} from '../../app/store/slices/healthDataSlice';
import {
  getOpenConflicts,
  loadHealthDataForUser,
  resolveSyncConflict,
} from './healthDataRepository';
import type { ConflictChoice, SyncConflictItem } from './syncContract';

export function useSyncConflicts() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);
  // A new payload object is dispatched after every sync, pull and resolution.
  const loadedToday = useAppSelector(state => state.healthData.today);
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);

  useEffect(() => {
    if (!user) {
      setConflicts([]);
      return;
    }
    let active = true;
    getOpenConflicts(user.id)
      .then(items => {
        if (active) {
          setConflicts(items);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, loadedToday]);

  const resolve = useCallback(async (recordId: string, choice: ConflictChoice) => {
    if (!user) {
      return;
    }
    await resolveSyncConflict(user.id, recordId, choice);
    const loaded = await loadHealthDataForUser(user);
    dispatch(healthDataLoadSucceeded(loaded.payload));
    dispatch(syncQueueCountChanged(loaded.pendingCount));
  }, [dispatch, user]);

  return { conflicts, resolve };
}
