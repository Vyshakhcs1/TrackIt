import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import healthDataReducer from './slices/healthDataSlice';

export const appStore = configureStore({
  reducer: {
    auth: authReducer,
    healthData: healthDataReducer,
  },
});

export type RootState = ReturnType<typeof appStore.getState>;
export type AppDispatch = typeof appStore.dispatch;