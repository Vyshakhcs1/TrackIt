import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthStatus, AuthUser } from '../../../features/auth/domain/models/AuthUser';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'restoring',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionRestored(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? 'signedIn' : 'signedOut';
      state.error = null;
    },
    loginStarted(state) {
      state.status = 'signingIn';
      state.error = null;
    },
    loginSucceeded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = 'signedIn';
      state.error = null;
    },
    loginFailed(state, action: PayloadAction<string>) {
      state.user = null;
      state.status = 'signedOut';
      state.error = action.payload;
    },
    loggedOut(state) {
      state.user = null;
      state.status = 'signedOut';
      state.error = null;
    },
  },
});

export const {
  loggedOut,
  loginFailed,
  loginStarted,
  loginSucceeded,
  sessionRestored,
} = authSlice.actions;

export default authSlice.reducer;