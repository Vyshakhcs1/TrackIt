import type { SyncRecordResult } from './syncContract';

export const deviceChangeRecordId = 'device';

interface UploadedChange {
  recordId: string;
}

export interface PartitionedResults<T extends UploadedChange> {
  accepted: T[];
  conflicts: { change: T; result: SyncRecordResult }[];
  retry: T[];
}

// A response without per-record results means the server accepted everything.
export function partitionSyncResults<T extends UploadedChange>(
  uploaded: T[],
  results: SyncRecordResult[] | undefined,
): PartitionedResults<T> {
  if (!results) {
    return { accepted: uploaded, conflicts: [], retry: [] };
  }

  const byRecord = new Map(results.map(result => [result.recordId, result]));
  const partition: PartitionedResults<T> = { accepted: [], conflicts: [], retry: [] };
  for (const change of uploaded) {
    if (change.recordId === deviceChangeRecordId) {
      partition.accepted.push(change);
      continue;
    }
    const result = byRecord.get(change.recordId);
    if (result?.status === 'accepted') {
      partition.accepted.push(change);
    } else if (result?.status === 'conflict' && result.server) {
      partition.conflicts.push({ change, result });
    } else {
      partition.retry.push(change);
    }
  }
  return partition;
}

export type ServerChangeDecision = 'apply' | 'ignore' | 'conflict';

// A pulled server change never overwrites a local edit based on an older version.
export function decideServerChange(input: {
  hasPendingLocal: boolean;
  hasOpenConflict: boolean;
  localVersion: string | null;
  serverVersion: string;
}): ServerChangeDecision {
  if (input.hasOpenConflict) {
    return 'conflict';
  }
  if (!input.hasPendingLocal) {
    return input.localVersion === input.serverVersion ? 'ignore' : 'apply';
  }
  return input.localVersion === input.serverVersion ? 'ignore' : 'conflict';
}
