import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../app/store/hooks';
import {
  loggedOut,
  loginFailed,
  loginStarted,
  loginSucceeded,
  sessionRestored,
} from '../../../../app/store/slices/authSlice';
import { healthDataCleared } from '../../../../app/store/slices/healthDataSlice';
import {
  clearSessionUser,
  readSessionUser,
  writeSessionUser,
} from '../../data/sessionStorage';
import { loginWithCredentials } from '../../data/authRepository';
import type { AuthUser } from '../../domain/models/AuthUser';

const splashMinimumDurationMs = 2500;

export function useAuthViewModel() {
  const dispatch = useAppDispatch();
  const { user, status, error } = useAppSelector(state => state.auth);

  const restoreSession = useCallback(async () => {
    const [restoredUser] = await Promise.all([
      readSessionUser().catch(() => null),
      new Promise<void>(resolve => setTimeout(resolve, splashMinimumDurationMs)),
    ]);
    dispatch(sessionRestored(restoredUser));
  }, [dispatch]);

  const login = useCallback(async (email: string, password: string) => {
    dispatch(loginStarted());
    let authenticatedUser: AuthUser;
    try {
      authenticatedUser = await loginWithCredentials(email, password);
    } catch (loginError) {
      dispatch(
        loginFailed(
          loginError instanceof Error ? loginError.message : 'Unable to sign in. Please try again.',
        ),
      );
      return false;
    }

    try {
      await writeSessionUser(authenticatedUser);
      dispatch(loginSucceeded(authenticatedUser));
      return true;
    } catch {
      dispatch(loginFailed('Unable to save the session on this device.'));
      return false;
    }
  }, [dispatch]);

  const logout = useCallback(async () => {
    await clearSessionUser().catch(() => undefined);
    dispatch(loggedOut());
    dispatch(healthDataCleared());
  }, [dispatch]);

  return {
    user,
    status,
    error,
    restoreSession,
    login,
    logout,
  };
}