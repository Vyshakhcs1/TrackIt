import axios from 'axios';
import { Platform } from 'react-native';

export function createHttpClient(baseURL?: string) {
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

const apiHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const httpClient = createHttpClient(`http://${apiHost}:3000`);