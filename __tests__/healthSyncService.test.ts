import type { AuthUser } from '../src/features/auth/domain/models/AuthUser';
import type { HealthDataPayload } from '../src/shared/data/HealthDataPayload';
import type {
  LoadedHealthData,
  PendingSyncChange,
} from '../src/shared/database/offlineHealthRepository';

jest.mock('../src/shared/data/healthDataRepository', () => ({
  acknowledgePendingChanges: jest.fn(),
  applyServerChanges: jest.fn(),
  getPendingSyncChanges: jest.fn(),
  getServerCursor: jest.fn(),
  getSyncChangeDetails: jest.fn(),
  loadHealthDataForUser: jest.fn(),
  recordSyncConflicts: jest.fn(),
}));

jest.mock('../src/shared/api/healthDataApi', () => ({
  getServerChanges: jest.fn(),
  syncHealthData: jest.fn(),
}));

import { syncHealthData } from '../src/shared/api/healthDataApi';
import {
  acknowledgePendingChanges,
  getPendingSyncChanges,
  getSyncChangeDetails,
  loadHealthDataForUser,
  recordSyncConflicts,
} from '../src/shared/data/healthDataRepository';
import { syncPendingHealthData } from '../src/shared/data/healthSyncService';

const user: AuthUser = {
  id: 'usr_sync_test',
  displayName: 'Sync Test User',
  email: 'sync@example.com',
  accessToken: 'unused-by-sync-endpoint',
};

const pendingChanges: PendingSyncChange[] = [
  {
    operationId: `${user.id}:weight-1`,
    recordId: 'weight-1',
    operation: 'upsert',
    createdAt: '2026-10-05T08:00:00.000Z',
  },
  {
    operationId: `${user.id}:weight-2`,
    recordId: 'weight-2',
    operation: 'delete',
    createdAt: '2026-10-05T08:05:00.000Z',
  },
];

const payload = {
  today: {},
  analytics: {},
  logMetric: {
    history: [
      {
        id: 'weight-1',
        metric: 'weight',
        value: 72.1,
        unit: 'kg',
        measuredAt: '2026-10-05T08:00:00.000Z',
        createdAt: '2026-10-05T08:00:00.000Z',
        note: '',
        syncStatus: false,
        source: 'manual',
      },
      {
        id: 'weight-unchanged',
        metric: 'weight',
        value: 72.4,
        unit: 'kg',
        measuredAt: '2026-10-04T08:00:00.000Z',
        createdAt: '2026-10-04T08:00:00.000Z',
        note: '',
        syncStatus: false,
        source: 'manual',
      },
    ],
  },
} as unknown as HealthDataPayload;

const loaded: LoadedHealthData = { payload, pendingCount: pendingChanges.length };

describe('syncPendingHealthData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPendingSyncChanges).mockResolvedValue(pendingChanges);
    jest.mocked(loadHealthDataForUser).mockResolvedValue(loaded);
    jest.mocked(getSyncChangeDetails).mockResolvedValue([]);
  });

  it('keeps pending changes queued when the sync request fails', async () => {
    jest.mocked(syncHealthData).mockRejectedValue(new Error('Server unavailable'));

    await expect(syncPendingHealthData(user)).rejects.toThrow('Server unavailable');

    expect(acknowledgePendingChanges).not.toHaveBeenCalled();
  });

  it('acknowledges only the operations included in the successful request', async () => {
    const acknowledged: LoadedHealthData = { payload, pendingCount: 0 };
    jest.mocked(syncHealthData).mockResolvedValue({});
    jest.mocked(acknowledgePendingChanges).mockResolvedValue(acknowledged);

    await expect(syncPendingHealthData(user)).resolves.toEqual({
      loaded: acknowledged,
      uploadedCount: pendingChanges.length,
      conflictCount: 0,
    });

    expect(syncHealthData).toHaveBeenCalledWith(user.id, expect.objectContaining({
      logMetric: expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ id: 'weight-1', syncStatus: true }),
          expect.objectContaining({ id: 'weight-unchanged', syncStatus: false }),
        ]),
      }),
    }), []);
    expect(acknowledgePendingChanges).toHaveBeenCalledWith(user.id, pendingChanges, expect.any(Map));
  });

  it('keeps conflicted changes out of the acknowledgement and stores them for review', async () => {
    const serverState = { value: 71.2, deleted: false };
    const acknowledged: LoadedHealthData = { payload, pendingCount: 0 };
    jest.mocked(syncHealthData).mockResolvedValue({
      results: [
        { recordId: 'weight-1', status: 'accepted', version: 'v7' },
        { recordId: 'weight-2', status: 'conflict', version: 'v9', server: serverState },
      ],
    });
    jest.mocked(acknowledgePendingChanges).mockResolvedValue(acknowledged);

    await expect(syncPendingHealthData(user)).resolves.toMatchObject({
      uploadedCount: 1,
      conflictCount: 1,
    });

    expect(recordSyncConflicts).toHaveBeenCalledWith(user.id, [
      expect.objectContaining({
        change: pendingChanges[1],
        result: expect.objectContaining({ recordId: 'weight-2', version: 'v9' }),
      }),
    ]);
    expect(acknowledgePendingChanges).toHaveBeenCalledWith(
      user.id,
      [pendingChanges[0]],
      new Map([['weight-1', 'v7']]),
    );
  });
});