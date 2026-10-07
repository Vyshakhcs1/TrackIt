export type SyncRecordKind = 'weight' | 'water';

// One queued local edit, sent with the server version it was based on.
export interface SyncChange {
  operationId: string;
  recordId: string;
  kind: SyncRecordKind;
  operation: 'upsert' | 'delete';
  baseVersion: string | null;
  date: string;
  value: number | null;
  note: string | null;
  measuredAt: string | null;
}

export interface ServerRecordState {
  value: number | null;
  note?: string | null;
  measuredAt?: string | null;
  deleted: boolean;
}

export interface SyncRecordResult {
  recordId: string;
  status: 'accepted' | 'conflict' | 'rejected';
  version?: string;
  server?: ServerRecordState;
}

export interface SyncResponse {
  results?: SyncRecordResult[];
}

export interface ServerChange extends ServerRecordState {
  recordId: string;
  kind: SyncRecordKind;
  version: string;
  date: string;
}

export interface ServerChangesResponse {
  cursor: string;
  changes: ServerChange[];
}

export interface SyncConflictItem {
  recordId: string;
  kind: SyncRecordKind;
  date: string;
  localOperation: 'upsert' | 'delete';
  local: { value: number | null; note: string | null; measuredAt: string | null };
  server: ServerRecordState;
  serverVersion: string;
}

export type ConflictChoice = 'mine' | 'server';

export function parseSyncResponse(value: unknown): SyncResponse {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const { results } = value as { results?: unknown };
  return Array.isArray(results) ? { results: results as SyncRecordResult[] } : {};
}

export function parseServerChanges(value: unknown): ServerChangesResponse | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { cursor, changes } = value as { cursor?: unknown; changes?: unknown };
  if (typeof cursor !== 'string' || !Array.isArray(changes)) {
    return null;
  }
  return { cursor, changes: changes as ServerChange[] };
}
