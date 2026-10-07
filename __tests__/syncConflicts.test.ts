import { decideServerChange, partitionSyncResults } from '../src/shared/data/syncConflicts';
import type { SyncRecordResult } from '../src/shared/data/syncContract';

const change = (recordId: string) => ({ recordId });

describe('partitionSyncResults', () => {
  it('treats a response without per-record results as fully accepted', () => {
    const uploaded = [change('a'), change('b')];

    expect(partitionSyncResults(uploaded, undefined)).toEqual({
      accepted: uploaded,
      conflicts: [],
      retry: [],
    });
  });

  it('separates accepted, conflicting and unanswered changes', () => {
    const server = { value: 71.2, deleted: false };
    const results: SyncRecordResult[] = [
      { recordId: 'a', status: 'accepted', version: 'v1' },
      { recordId: 'b', status: 'conflict', version: 'v2', server },
      { recordId: 'c', status: 'rejected' },
    ];

    const partition = partitionSyncResults(
      [change('a'), change('b'), change('c'), change('d')],
      results,
    );

    expect(partition.accepted).toEqual([change('a')]);
    expect(partition.conflicts).toEqual([{ change: change('b'), result: results[1] }]);
    expect(partition.retry).toEqual([change('c'), change('d')]);
  });

  it('keeps a conflict without server data queued instead of losing the edit', () => {
    const partition = partitionSyncResults([change('a')], [
      { recordId: 'a', status: 'conflict', version: 'v2' },
    ]);

    expect(partition.conflicts).toHaveLength(0);
    expect(partition.retry).toEqual([change('a')]);
  });

  it('always accepts the device metrics marker', () => {
    const partition = partitionSyncResults([change('device')], []);

    expect(partition.accepted).toEqual([change('device')]);
  });
});

describe('decideServerChange', () => {
  const base = { hasPendingLocal: false, hasOpenConflict: false, localVersion: 'v1', serverVersion: 'v2' };

  it('applies a newer server version when there is no local edit', () => {
    expect(decideServerChange(base)).toBe('apply');
  });

  it('ignores a version the device already has', () => {
    expect(decideServerChange({ ...base, serverVersion: 'v1' })).toBe('ignore');
  });

  it('flags a conflict instead of overwriting a pending local edit', () => {
    expect(decideServerChange({ ...base, hasPendingLocal: true })).toBe('conflict');
  });

  it('does not conflict when the pending edit is already based on the server version', () => {
    expect(decideServerChange({ ...base, hasPendingLocal: true, serverVersion: 'v1' })).toBe('ignore');
  });

  it('keeps an open conflict open when the server changes again', () => {
    expect(decideServerChange({ ...base, hasOpenConflict: true })).toBe('conflict');
  });
});
