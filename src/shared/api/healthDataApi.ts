import { httpClient } from './httpClient';
import type { HealthDataPayload } from '../data/HealthDataPayload';

export async function getAllHealthData(userId: string): Promise<HealthDataPayload> {
  const response = await httpClient.get<HealthDataPayload>('/fetchAllData', {
    headers: { 'x-user-id': userId },
  });
  return response.data;
}

export async function syncHealthData(
  userId: string,
  payload: HealthDataPayload,
): Promise<void> {
  await httpClient.post('/syncLocalToServer', payload, {
    headers: { 'x-user-id': userId },
  });
}