import axios from 'axios';
import { httpClient } from '../../../shared/api/httpClient';
import type { AuthUser } from '../domain/models/AuthUser';

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthUser> {
  try {
    const response = await httpClient.post<AuthUser>('/login', {
      email: email.trim(),
      password,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError<{ error?: unknown }>(error)) {
      const apiError = error.response?.data?.error;
      if (typeof apiError === 'string' && apiError.trim()) {
        throw new Error(apiError);
      }
      if (!error.response) {
        throw new Error('Unable to connect to the login server. Check that it is running.');
      }
    }

    throw new Error('Unable to sign in. Please try again.');
  }
}