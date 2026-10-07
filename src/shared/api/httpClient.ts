import axios from 'axios';
import { Platform } from 'react-native';
import { attachRetry, defaultRetryOptions, type RetryOptions } from './retry';

export function createHttpClient(
  baseURL?: string,
  retry: RetryOptions | false = defaultRetryOptions,
) {
  const client = axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  if (retry) {
    attachRetry(client, retry);
  }
  return client;
}

const apiHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const httpClient = createHttpClient(`http://${apiHost}:3000`);