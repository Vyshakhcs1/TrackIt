import { httpClient } from './httpClient';
import type { HealthDataPayload } from '../data/HealthDataPayload';
import {
  parseServerChanges,
  parseSyncResponse,
  type ServerChangesResponse,
  type SyncChange,
  type SyncResponse,
} from '../data/syncContract';

export async function getAllHealthData(userId: string): Promise<HealthDataPayload> {
  const response = await httpClient.get<HealthDataPayload>('/fetchAllData', {
    headers: { 'x-user-id': userId },
  });
  return response.data;
}

export async function syncHealthData(
  userId: string,
  payload: HealthDataPayload,
  changes: SyncChange[] = [],
): Promise<SyncResponse> {
  const response = await httpClient.post('/syncLocalToServer', { ...payload, sync: { changes } }, {
    headers: { 'x-user-id': userId },
  });
  return parseSyncResponse(response.data);
}

export async function getServerChanges(
  userId: string,
  cursor: string | null,
): Promise<ServerChangesResponse | null> {
  const response = await httpClient.get('/fetchChanges', {
    headers: { 'x-user-id': userId },
    params: cursor ? { since: cursor } : undefined,
  });
  return parseServerChanges(response.data);
}