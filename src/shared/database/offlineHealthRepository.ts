import type { DB } from '@op-engineering/op-sqlite';
import type {
  AnalyticsData,
  AnalyticsMetricKey,
  AnalyticsRangeKey,
  AnalyticsBucket,
  AnalyticsPoint,
} from '../../features/analytics/domain/models/AnalyticsData';
import type { AuthUser } from '../../features/auth/domain/models/AuthUser';
import type { TodayData, TodayGoalMetric } from '../../features/home/domain/models/TodayData';
import type {
  LogMetricData,
  WeightMeasurement,
  LogMetricKey,
  MeasurementFilter,
  ComingSoonMetric,
} from '../../features/metrics/domain/models/LogMetricData';
import { getAllHealthData } from '../api/healthDataApi';
import type { HealthDataPayload } from '../data/HealthDataPayload';
import { decideServerChange, deviceChangeRecordId } from '../data/syncConflicts';
import type {
  ConflictChoice,
  ServerChange,
  ServerChangesResponse,
  ServerRecordState,
  SyncChange,
  SyncConflictItem,
  SyncRecordKind,
  SyncRecordResult,
} from '../data/syncContract';
import { applyDeviceMetrics, deviceHistoryStartDate } from '../health/deviceMetricsOverlay';
import type {
  DeviceDailyValue,
  DeviceMetricKey,
  DeviceMetricRow,
} from '../health/healthConnectTypes';
import {
  createConflictTables,
  createDeviceHealthTables,
  createHealthSchemaV2,
  getHealthDatabase,
  type HealthDbTransaction,
} from './healthDatabase';

export interface PendingRecordChange {
  recordId: string;
  metricKey: string;
  recordType: string;
  recordDate: string;
  value: number | null;
  unit: string | null;
  note: string | null;
  payload: unknown;
  operation: 'upsert' | 'delete';
}

export interface LoadedHealthData {
  payload: HealthDataPayload;
  pendingCount: number;
}

export interface PendingSyncChange {
  operationId: string;
  recordId: string;
  operation: 'upsert' | 'delete';
  createdAt: string;
}

type DbRow = Record<string, unknown>;
type RecordType = 'today' | 'analytics' | 'measurement';
type SyncStatus = 'pending' | 'synced' | 'failed';
type MetricRecordInput = {
  userId: string;
  recordId: string;
  metricKey: string;
  recordType: RecordType;
  recordDate: string;
  value: number | null;
  unit: string | null;
  note?: string | null;
  updatedAt: string;
  syncStatus: SyncStatus;
  deletedAt?: string | null;
  rangeKey?: string | null;
  pointIndex?: number | null;
  label?: string | null;
  displayValue?: string | null;
  recordedAt?: string | null;
  createdAt?: string | null;
  source?: string | null;
  durationMinutes?: number | null;
  score?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  lightMinutes?: number | null;
  awakeMinutes?: number | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function text(row: DbRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) {
    throw new Error(`Health database row is missing ${key}.`);
  }
  return String(value);
}

function nullableText(row: DbRow, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}

function numberValue(row: DbRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Health database row has an invalid ${key}.`);
  }
  return value;
}

function rowByKey(rows: DbRow[], key: string, value: string): DbRow | undefined {
  return rows.find(row => String(row[key]) === value);
}

function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mergeWeightHistoryIntoRange(
  range: AnalyticsData['metrics']['weight']['ranges'][AnalyticsRangeKey],
  weightHistory: DbRow[],
): AnalyticsData['metrics']['weight']['ranges'][AnalyticsRangeKey] {
  if (!range.points.length || !weightHistory.length) {
    return range;
  }

  const pointsByDate = new Map(range.points.map(point => [point.date, point]));
  for (const record of weightHistory.slice().reverse()) {
    const date = localDateKey(text(record, 'recorded_at'));
    if (date < range.startDate) {
      continue;
    }
    const existing = pointsByDate.get(date);
    pointsByDate.set(date, existing
      ? { ...existing, value: numberValue(record, 'value') }
      : { date, value: numberValue(record, 'value') });
  }

  const allPoints = [...pointsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const capacity = range.points.length;
  const latestWeightDate = localDateKey(text(weightHistory[0], 'recorded_at'));
  const shouldKeepLatest = latestWeightDate > range.endDate;
  const visiblePoints = allPoints.length > capacity
    ? shouldKeepLatest
      ? allPoints.slice(allPoints.length - capacity)
      : allPoints.slice(0, capacity)
    : allPoints;

  return {
    ...range,
    startDate: visiblePoints[0]?.date ?? range.startDate,
    endDate: visiblePoints[visiblePoints.length - 1]?.date ?? range.endDate,
    points: visiblePoints,
  };
}

async function writeMetricRecord(
  transaction: HealthDbTransaction,
  record: MetricRecordInput,
): Promise<void> {
  const values = [
    record.userId,
    record.recordId,
    record.metricKey,
    record.recordType,
    record.recordDate,
    record.value,
    record.unit,
    record.note ?? null,
    record.updatedAt,
    record.syncStatus,
    record.deletedAt ?? null,
    record.rangeKey ?? null,
    record.pointIndex ?? null,
    record.label ?? null,
    record.displayValue ?? null,
    record.recordedAt ?? null,
    record.createdAt ?? null,
    record.source ?? null,
    record.durationMinutes ?? null,
    record.score ?? null,
    record.deepMinutes ?? null,
    record.remMinutes ?? null,
    record.lightMinutes ?? null,
    record.awakeMinutes ?? null,
  ];
  const columns = `
    user_id, record_id, metric_key, record_type, record_date, value, unit, note,
    updated_at, sync_status, deleted_at, range_key, point_index, label, display_value,
    recorded_at, created_at, source, duration_minutes, score, deep_minutes, rem_minutes,
    light_minutes, awake_minutes`;
  const placeholders = new Array(24).fill('?').join(', ');
  await transaction.execute(
    `INSERT OR IGNORE INTO metric_records (${columns}) VALUES (${placeholders})`,
    values,
  );
  await transaction.execute(
    `UPDATE metric_records SET
      metric_key = ?, record_type = ?, record_date = ?, value = ?, unit = ?, note = ?,
      updated_at = ?, sync_status = ?, deleted_at = ?, range_key = ?, point_index = ?,
      label = ?, display_value = ?, recorded_at = ?, created_at = ?, source = ?,
      duration_minutes = ?, score = ?, deep_minutes = ?, rem_minutes = ?,
      light_minutes = ?, awake_minutes = ?
     WHERE user_id = ? AND record_id = ?`,
    [
      record.metricKey,
      record.recordType,
      record.recordDate,
      record.value,
      record.unit,
      record.note ?? null,
      record.updatedAt,
      record.syncStatus,
      record.deletedAt ?? null,
      record.rangeKey ?? null,
      record.pointIndex ?? null,
      record.label ?? null,
      record.displayValue ?? null,
      record.recordedAt ?? null,
      record.createdAt ?? null,
      record.source ?? null,
      record.durationMinutes ?? null,
      record.score ?? null,
      record.deepMinutes ?? null,
      record.remMinutes ?? null,
      record.lightMinutes ?? null,
      record.awakeMinutes ?? null,
      record.userId,
      record.recordId,
    ],
  );
}

async function insertOutboxOperation(
  transaction: HealthDbTransaction,
  userId: string,
  recordId: string,
  operation: 'upsert' | 'delete',
  createdAt: string,
): Promise<void> {
  await transaction.execute(
    `INSERT OR IGNORE INTO sync_outbox
      (operation_id, user_id, record_id, operation, created_at, attempt_count, last_error)
     VALUES (?, ?, ?, ?, ?, 0, NULL)
    `,
    [`${userId}:${recordId}`, userId, recordId, operation, createdAt],
  );
  await transaction.execute(
    `UPDATE sync_outbox
     SET operation = ?, created_at = ?, attempt_count = 0, last_error = NULL
     WHERE operation_id = ?`,
    [operation, createdAt, `${userId}:${recordId}`],
  );
}

async function writePayloadRows(
  transaction: HealthDbTransaction,
  user: Pick<AuthUser, 'id' | 'displayName' | 'email'>,
  payload: HealthDataPayload,
  updatedAt: string,
): Promise<void> {
  const latestWeight = payload.logMetric.history.reduce<WeightMeasurement | null>(
    (latest, record) =>
      !latest || Date.parse(record.measuredAt) > Date.parse(latest.measuredAt)
        ? record
        : latest,
    null,
  );
  const todayData = latestWeight
    ? {
        ...payload.today,
        metrics: {
          ...payload.today.metrics,
          weight: {
            ...payload.today.metrics.weight,
            value: latestWeight.value,
            recordedAt: latestWeight.measuredAt,
          },
        },
      }
    : payload.today;

  await transaction.execute(
    `INSERT OR IGNORE INTO local_users (user_id, display_name, email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.displayName, user.email, updatedAt, updatedAt],
  );
  await transaction.execute(
    'UPDATE local_users SET display_name = ?, email = ?, updated_at = ? WHERE user_id = ?',
    [user.displayName, user.email, updatedAt, user.id],
  );

  const todayGoalPositions = new Map(
    payload.today.dailyBalance.goals.map((goal, index) => [goal.metric, index]),
  );
  const todayMetricEntries = Object.entries(payload.today.metrics) as [
    keyof TodayData['metrics'],
    TodayData['metrics'][keyof TodayData['metrics']],
  ][];
  const persistedTodayMetricEntries = Object.entries(todayData.metrics) as [
    keyof TodayData['metrics'],
    TodayData['metrics'][keyof TodayData['metrics']],
  ][];
  for (const [metricKey, metric] of persistedTodayMetricEntries) {
    const goalValue = 'goalMinutes' in metric ? metric.goalMinutes : metric.goal;
    const unit = 'unit' in metric ? metric.unit : 'minutes';
    const position = todayGoalPositions.get(metricKey as TodayGoalMetric) ?? 100;
    const dailyGoal = payload.today.dailyBalance.goals.find(goal => goal.metric === metricKey);
    await transaction.execute(
      `INSERT OR IGNORE INTO metric_goals
        (user_id, scope, metric_key, goal_value, unit, goal_met, position, updated_at, sync_status)
       VALUES (?, 'today', ?, ?, ?, ?, ?, ?, 'synced')`,
      [user.id, metricKey, goalValue, unit, dailyGoal ? Number(dailyGoal.goalMet) : null, position, updatedAt],
    );
    await transaction.execute(
      `UPDATE metric_goals SET goal_value = ?, unit = ?, goal_met = ?, position = ?
       WHERE user_id = ? AND scope = 'today' AND metric_key = ?`,
      [goalValue, unit, dailyGoal ? Number(dailyGoal.goalMet) : null, position, user.id, metricKey],
    );
  }

  const analyticsMetricEntries = Object.entries(payload.analytics.metrics) as [
    AnalyticsMetricKey,
    AnalyticsData['metrics'][AnalyticsMetricKey],
  ][];
  for (const [position, [metricKey, metric]] of analyticsMetricEntries.entries()) {
    await transaction.execute(
      `INSERT OR IGNORE INTO metric_goals
        (user_id, scope, metric_key, goal_value, unit, position, updated_at, sync_status)
       VALUES (?, 'analytics', ?, ?, ?, ?, ?, 'synced')`,
      [user.id, metricKey, metric.goalValue, metric.unit, position, updatedAt],
    );
    await transaction.execute(
      `UPDATE metric_goals SET goal_value = ?, unit = ?, position = ?
       WHERE user_id = ? AND scope = 'analytics' AND metric_key = ?`,
      [metric.goalValue, metric.unit, position, user.id, metricKey],
    );
  }

  await transaction.execute('DELETE FROM analytics_metrics WHERE user_id = ?', [user.id]);
  await transaction.execute(
    "DELETE FROM metric_records WHERE user_id = ? AND record_type = 'analytics'",
    [user.id],
  );
  for (const [position, [metricKey, metric]] of analyticsMetricEntries.entries()) {
    await transaction.execute(
      `INSERT INTO analytics_metrics
        (user_id, metric_key, label, unit, current_value, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, metricKey, metric.label, metric.unit, metric.currentValue, position],
    );
    for (const [rangePosition, [rangeKey, range]] of Object.entries(metric.ranges).entries()) {
      await transaction.execute(
        `INSERT INTO analytics_ranges
          (user_id, metric_key, range_key, start_date, end_date, bucket, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, metricKey, rangeKey, range.startDate, range.endDate, range.bucket, rangePosition],
      );
      for (const [pointIndex, point] of range.points.entries()) {
        await writeMetricRecord(transaction, {
          userId: user.id,
          recordId: `analytics:${metricKey}:${rangeKey}:${point.date}`,
          metricKey,
          recordType: 'analytics',
          recordDate: point.date,
          value: point.value,
          unit: metric.unit,
          updatedAt,
          syncStatus: 'synced',
          rangeKey,
          pointIndex,
          label: point.label,
          displayValue: point.displayValue,
        });
      }
    }
  }

  for (const [metricKey, metric] of todayMetricEntries) {
    const isSleep = 'durationMinutes' in metric;
    const value = isSleep ? metric.durationMinutes : metric.value;
    const unit = 'unit' in metric ? metric.unit : 'minutes';
    await writeMetricRecord(transaction, {
      userId: user.id,
      recordId: `today:${metricKey}:${payload.today.date}`,
      metricKey,
      recordType: 'today',
      recordDate: payload.today.date,
      value,
      unit,
      updatedAt: metric.recordedAt,
      syncStatus: 'synced',
      recordedAt: metric.recordedAt,
      durationMinutes: isSleep ? metric.durationMinutes : null,
      score: isSleep ? metric.score : null,
      deepMinutes: isSleep ? metric.stages.deepMinutes : null,
      remMinutes: isSleep ? metric.stages.remMinutes : null,
      lightMinutes: isSleep ? metric.stages.lightMinutes : null,
      awakeMinutes: isSleep ? metric.stages.awakeMinutes : null,
    });
  }

  const { draft } = payload.logMetric;
  await transaction.execute(
    `INSERT OR REPLACE INTO user_health_settings
      (user_id, today_date, water_increment_ml, sync_now_enabled,
       analytics_default_metric, analytics_default_range, log_supported_metric,
       draft_metric, draft_value, draft_unit, draft_timestamp, draft_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      payload.today.date,
      payload.today.quickActions.waterIncrementMl,
      payload.today.quickActions.syncNowEnabled ? 1 : 0,
      payload.analytics.defaultMetric,
      payload.analytics.defaultRange,
      payload.logMetric.supportedMetric,
      draft.metric,
      draft.value,
      draft.unit,
      draft.timestamp,
      draft.note,
    ],
  );

  await transaction.execute('DELETE FROM health_data_options WHERE user_id = ?', [user.id]);
  const options: [string, readonly string[]][] = [
    ['analytics_metrics', payload.analytics.availableMetrics],
    ['analytics_ranges', payload.analytics.availableRanges],
    ['coming_soon_metrics', payload.logMetric.comingSoonMetrics],
    ['measurement_filters', payload.logMetric.filters],
  ];
  for (const [category, values] of options) {
    for (const [position, optionValue] of values.entries()) {
      await transaction.execute(
        `INSERT INTO health_data_options (user_id, category, option_value, position)
         VALUES (?, ?, ?, ?)`,
        [user.id, category, optionValue, position],
      );
    }
  }

  for (const record of payload.logMetric.history) {
    await writeMetricRecord(transaction, {
      userId: user.id,
      recordId: record.id,
      metricKey: record.metric,
      recordType: 'measurement',
      recordDate: record.measuredAt.slice(0, 10),
      value: record.value,
      unit: record.unit,
      note: record.note,
      updatedAt: record.createdAt,
      syncStatus: record.syncStatus ? 'synced' : 'pending',
      recordedAt: record.measuredAt,
      createdAt: record.createdAt,
      source: record.source,
    });
  }
}

async function migrateV1ToV2(database: DB): Promise<void> {
  const [usersResult, recordsResult, goalsResult, outboxResult] = await Promise.all([
    database.execute('SELECT * FROM local_users'),
    database.execute('SELECT * FROM metric_records'),
    database.execute('SELECT * FROM metric_goals'),
    database.execute('SELECT * FROM sync_outbox'),
  ]);
  const users = usersResult.rows as DbRow[];
  const legacyRecords = recordsResult.rows as DbRow[];
  const legacyGoals = goalsResult.rows as DbRow[];
  const legacyOutbox = outboxResult.rows as DbRow[];

  await database.execute('PRAGMA foreign_keys = OFF');
  try {
    await database.transaction(async transaction => {
      await transaction.execute('DROP TABLE sync_outbox');
      await transaction.execute('DROP TABLE metric_records');
      await transaction.execute('DROP TABLE metric_goals');
      await transaction.execute('DROP TABLE local_users');
      await createHealthSchemaV2(transaction);

      for (const userRow of users) {
        const userId = text(userRow, 'user_id');
        let payload: HealthDataPayload;
        try {
          payload = JSON.parse(text(userRow, 'health_data_json')) as HealthDataPayload;
        } catch {
          throw new Error(`Could not migrate health data for local user ${userId}; the database was left unchanged.`);
        }
        const user: Pick<AuthUser, 'id' | 'displayName' | 'email'> = {
          id: userId,
          displayName: text(userRow, 'display_name'),
          email: text(userRow, 'email'),
        };
        await writePayloadRows(transaction, user, payload, text(userRow, 'updated_at'));
        await transaction.execute(
          'UPDATE local_users SET created_at = ?, updated_at = ? WHERE user_id = ?',
          [text(userRow, 'created_at'), text(userRow, 'updated_at'), userId],
        );

        const userRecords = legacyRecords.filter(row => String(row.user_id) === userId);
        const userOutbox = legacyOutbox.filter(row => String(row.user_id) === userId);
        for (const oldRecord of userRecords) {
          const recordId = text(oldRecord, 'record_id');
          if (String(oldRecord.record_type) === 'measurement') {
            const existsInSnapshot = payload.logMetric.history.some(record => record.id === recordId);
            if (!existsInSnapshot) {
              let deletedRecord: WeightMeasurement;
              try {
                deletedRecord = JSON.parse(text(oldRecord, 'payload_json')) as WeightMeasurement;
              } catch {
                throw new Error(`Could not migrate deleted measurement ${recordId}; the database was left unchanged.`);
              }
              await writeMetricRecord(transaction, {
                userId,
                recordId,
                metricKey: deletedRecord.metric,
                recordType: 'measurement',
                recordDate: deletedRecord.measuredAt.slice(0, 10),
                value: deletedRecord.value,
                unit: deletedRecord.unit,
                note: deletedRecord.note,
                updatedAt: deletedRecord.createdAt,
                syncStatus: 'pending',
                deletedAt: nullableText(oldRecord, 'deleted_at') ?? nowIso(),
                recordedAt: deletedRecord.measuredAt,
                createdAt: deletedRecord.createdAt,
                source: deletedRecord.source,
              });
            }
          }
          await transaction.execute(
            `UPDATE metric_records
             SET sync_status = ?, server_version = ?, updated_at = ?, deleted_at = COALESCE(?, deleted_at)
             WHERE user_id = ? AND record_id = ?`,
            [
              text(oldRecord, 'sync_status'),
              nullableText(oldRecord, 'server_version') ?? null,
              text(oldRecord, 'updated_at'),
              nullableText(oldRecord, 'deleted_at') ?? null,
              userId,
              recordId,
            ],
          );
        }

        for (const oldGoal of legacyGoals.filter(row => String(row.user_id) === userId)) {
          await transaction.execute(
            `UPDATE metric_goals SET sync_status = ?, server_version = ?, updated_at = ?
             WHERE user_id = ? AND scope = ? AND metric_key = ?`,
            [
              String(oldGoal.sync_status ?? 'synced'),
              nullableText(oldGoal, 'server_version') ?? null,
              String(oldGoal.updated_at ?? userRow.updated_at),
              userId,
              String(oldGoal.scope),
              String(oldGoal.metric_key),
            ],
          );
        }

        for (const oldOperation of userOutbox) {
          await transaction.execute(
            `INSERT INTO sync_outbox
              (operation_id, user_id, record_id, operation, created_at, attempt_count, last_error)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              text(oldOperation, 'operation_id'),
              userId,
              text(oldOperation, 'record_id'),
              text(oldOperation, 'operation'),
              text(oldOperation, 'created_at'),
              Number(oldOperation.attempt_count ?? 0),
              nullableText(oldOperation, 'last_error') ?? null,
            ],
          );
        }
      }

      const foreignKeyIssues = await transaction.execute('PRAGMA foreign_key_check');
      if (foreignKeyIssues.rows.length > 0) {
        throw new Error('Health database migration failed its foreign-key check; the database was left unchanged.');
      }
      await transaction.execute('PRAGMA user_version = 2');
    });
  } finally {
    await database.execute('PRAGMA foreign_keys = ON');
  }
}

let schemaReadyPromise: Promise<void> | null = null;

async function getReadyDatabase(): Promise<DB> {
  const database = await getHealthDatabase();
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const result = await database.execute('PRAGMA user_version');
      let version = Number(result.rows[0]?.user_version ?? 0);
      if (version === 1) {
        await migrateV1ToV2(database);
        version = 2;
      }
      if (version === 2) {
        await database.transaction(async transaction => {
          await createDeviceHealthTables(transaction);
          await transaction.execute('PRAGMA user_version = 3');
        });
        version = 3;
      }
      if (version === 3) {
        await database.transaction(async transaction => {
          await createConflictTables(transaction);
          await transaction.execute('PRAGMA user_version = 4');
        });
        version = 4;
      }
      if (version !== 4) {
        throw new Error(`Unsupported health database version ${version}.`);
      }
    })().catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  await schemaReadyPromise;
  return database;
}

async function seedUserData(user: AuthUser): Promise<HealthDataPayload> {
  const database = await getReadyDatabase();
  const payload = await getAllHealthData(user.id);
  // Steps, sleep and calories come from Health Connect, not the API.
  const apiOwnedPayload = applyDeviceMetrics(payload, []);
  await database.transaction(async transaction => {
    await writePayloadRows(transaction, user, apiOwnedPayload, nowIso());
    for (const record of payload.logMetric.history.filter(item => !item.syncStatus)) {
      await insertOutboxOperation(transaction, user.id, record.id, 'upsert', record.createdAt);
    }
  });
  return apiOwnedPayload;
}

async function loadOptions(
  database: DB,
  userId: string,
  category: string,
): Promise<string[]> {
  const result = await database.execute(
    'SELECT option_value FROM health_data_options WHERE user_id = ? AND category = ? ORDER BY position',
    [userId, category],
  );
  return result.rows.map(row => String(row.option_value));
}

async function loadPayloadFromRows(
  database: DB,
  userId: string,
): Promise<HealthDataPayload> {
  const [settingsResult, goalsResult, recordsResult, analyticsResult, rangesResult] = await Promise.all([
    database.execute('SELECT * FROM user_health_settings WHERE user_id = ?', [userId]),
    database.execute('SELECT * FROM metric_goals WHERE user_id = ?', [userId]),
    database.execute('SELECT * FROM metric_records WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    database.execute('SELECT * FROM analytics_metrics WHERE user_id = ? ORDER BY position', [userId]),
    database.execute('SELECT * FROM analytics_ranges WHERE user_id = ? ORDER BY position', [userId]),
  ]);
  const settings = settingsResult.rows[0] as DbRow | undefined;
  if (!settings) {
    throw new Error(`Health settings are missing for local user ${userId}.`);
  }
  const goals = goalsResult.rows as DbRow[];
  const records = recordsResult.rows as DbRow[];
  const analyticsMetrics = analyticsResult.rows as DbRow[];
  const analyticsRanges = rangesResult.rows as DbRow[];
  const todayRecords = records.filter(row => String(row.record_type) === 'today');
  const measurements = records
    .filter(row => String(row.record_type) === 'measurement')
    .sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)));

  const todayMetric = (metricKey: string): DbRow => {
    const row = rowByKey(todayRecords, 'metric_key', metricKey);
    if (!row) {
      throw new Error(`Today's ${metricKey} record is missing for local user ${userId}.`);
    }
    return row;
  };
  const todayGoal = (metricKey: string): DbRow => {
    const row = goals.find(item => String(item.scope) === 'today' && String(item.metric_key) === metricKey);
    if (!row) {
      throw new Error(`Today's ${metricKey} goal is missing for local user ${userId}.`);
    }
    return row;
  };
  const dailyGoals = goals
    .filter(row => String(row.scope) === 'today' && ['steps', 'water', 'calories', 'sleep'].includes(String(row.metric_key)))
    .sort((left, right) => numberValue(left, 'position') - numberValue(right, 'position'))
    .map(row => {
      const metricKey = text(row, 'metric_key') as TodayGoalMetric;
      const value = numberValue(todayMetric(metricKey), 'value');
      const goal = numberValue(row, 'goal_value');
      return {
        metric: metricKey,
        value,
        goal,
        unit: text(row, 'unit'),
        goalMet: row.goal_met === null || row.goal_met === undefined
          ? value >= goal
          : numberValue(row, 'goal_met') === 1,
      };
    });

  const stepsRecord = todayMetric('steps');
  const waterRecord = todayMetric('water');
  const weightRecord = todayMetric('weight');
  const weightHistory = measurements.filter(row => String(row.metric_key) === 'weight');
  const latestWeight = weightHistory[0];
  const sleepRecord = todayMetric('sleep');
  const caloriesRecord = todayMetric('calories');
  const today: TodayData = {
    date: text(settings, 'today_date'),
    dailyBalance: { goals: dailyGoals },
    metrics: {
      steps: {
        value: numberValue(stepsRecord, 'value'),
        goal: numberValue(todayGoal('steps'), 'goal_value'),
        unit: text(stepsRecord, 'unit'),
        recordedAt: text(stepsRecord, 'recorded_at'),
      },
      water: {
        value: numberValue(waterRecord, 'value'),
        goal: numberValue(todayGoal('water'), 'goal_value'),
        unit: text(waterRecord, 'unit'),
        recordedAt: text(waterRecord, 'recorded_at'),
      },
      weight: {
        value: latestWeight ? numberValue(latestWeight, 'value') : numberValue(weightRecord, 'value'),
        unit: text(weightRecord, 'unit'),
        goal: numberValue(todayGoal('weight'), 'goal_value'),
        recordedAt: latestWeight ? text(latestWeight, 'recorded_at') : text(weightRecord, 'recorded_at'),
      },
      sleep: {
        durationMinutes: numberValue(sleepRecord, 'duration_minutes'),
        goalMinutes: numberValue(todayGoal('sleep'), 'goal_value'),
        score: numberValue(sleepRecord, 'score'),
        stages: {
          deepMinutes: numberValue(sleepRecord, 'deep_minutes'),
          remMinutes: numberValue(sleepRecord, 'rem_minutes'),
          lightMinutes: numberValue(sleepRecord, 'light_minutes'),
          awakeMinutes: numberValue(sleepRecord, 'awake_minutes'),
        },
        recordedAt: text(sleepRecord, 'recorded_at'),
      },
      calories: {
        value: numberValue(caloriesRecord, 'value'),
        goal: numberValue(todayGoal('calories'), 'goal_value'),
        unit: text(caloriesRecord, 'unit'),
        recordedAt: text(caloriesRecord, 'recorded_at'),
      },
    },
    quickActions: {
      waterIncrementMl: numberValue(settings, 'water_increment_ml'),
      syncNowEnabled: numberValue(settings, 'sync_now_enabled') === 1,
    },
  };

  const analyticsMetricValues = await Promise.all(
    analyticsMetrics.map(async metricRow => {
      const metricKey = text(metricRow, 'metric_key') as AnalyticsMetricKey;
      const metricRanges = analyticsRanges.filter(row => String(row.metric_key) === metricKey);
      const ranges = {} as AnalyticsData['metrics'][AnalyticsMetricKey]['ranges'];
      for (const rangeRow of metricRanges) {
        const rangeKey = text(rangeRow, 'range_key') as AnalyticsRangeKey;
        const pointResult = await database.execute(
          `SELECT * FROM metric_records
           WHERE user_id = ? AND record_type = 'analytics' AND metric_key = ? AND range_key = ?
           ORDER BY point_index`,
          [userId, metricKey, rangeKey],
        );
        const points: AnalyticsPoint[] = pointResult.rows.map(row => ({
          date: String(row.record_date),
          ...(row.label === null || row.label === undefined ? {} : { label: String(row.label) }),
          value: Number(row.value),
          ...(row.display_value === null || row.display_value === undefined
            ? {}
            : { displayValue: String(row.display_value) }),
        }));
        ranges[rangeKey] = {
          startDate: text(rangeRow, 'start_date'),
          endDate: text(rangeRow, 'end_date'),
          bucket: text(rangeRow, 'bucket') as AnalyticsBucket,
          points,
        };
      }
      const goal = goals.find(row => String(row.scope) === 'analytics' && String(row.metric_key) === metricKey);
      if (!goal) {
        throw new Error(`Analytics goal ${metricKey} is missing for local user ${userId}.`);
      }
      return [metricKey, {
        label: text(metricRow, 'label'),
        unit: text(metricRow, 'unit'),
        currentValue: numberValue(metricRow, 'current_value'),
        goalValue: numberValue(goal, 'goal_value'),
        ranges,
      }] as const;
    }),
  );
  const analyticsMetricsByKey = Object.fromEntries(analyticsMetricValues) as AnalyticsData['metrics'];
  if (latestWeight) {
    const weightAnalytics = analyticsMetricsByKey.weight;
    analyticsMetricsByKey.weight = {
      ...weightAnalytics,
      currentValue: numberValue(latestWeight, 'value'),
      ranges: Object.fromEntries(
        Object.entries(weightAnalytics.ranges).map(([rangeKey, range]) => [
          rangeKey,
          mergeWeightHistoryIntoRange(range, weightHistory),
        ]),
      ) as AnalyticsData['metrics']['weight']['ranges'],
    };
  }
  const [availableMetrics, availableRanges] = await Promise.all([
    loadOptions(database, userId, 'analytics_metrics'),
    loadOptions(database, userId, 'analytics_ranges'),
  ]);
  const analytics: AnalyticsData = {
    defaultMetric: text(settings, 'analytics_default_metric') as AnalyticsMetricKey,
    defaultRange: text(settings, 'analytics_default_range') as AnalyticsRangeKey,
    availableMetrics: availableMetrics as AnalyticsMetricKey[],
    availableRanges: availableRanges as AnalyticsRangeKey[],
    metrics: analyticsMetricsByKey,
  };

  const [comingSoonMetrics, filters] = await Promise.all([
    loadOptions(database, userId, 'coming_soon_metrics'),
    loadOptions(database, userId, 'measurement_filters'),
  ]);
  const logMetric: LogMetricData = {
    supportedMetric: text(settings, 'log_supported_metric') as LogMetricKey,
    comingSoonMetrics: comingSoonMetrics as ComingSoonMetric[],
    draft: {
      metric: text(settings, 'draft_metric') as LogMetricKey,
      value: numberValue(settings, 'draft_value'),
      unit: text(settings, 'draft_unit') as 'kg',
      timestamp: text(settings, 'draft_timestamp'),
      note: text(settings, 'draft_note'),
    },
    history: measurements.map(row => ({
      id: text(row, 'record_id'),
      metric: text(row, 'metric_key') as LogMetricKey,
      value: numberValue(row, 'value'),
      unit: text(row, 'unit') as 'kg',
      measuredAt: text(row, 'recorded_at'),
      createdAt: text(row, 'created_at'),
      note: String(row.note ?? ''),
      syncStatus: String(row.sync_status) === 'synced',
      source: text(row, 'source') as 'manual',
    })),
    filters: filters as MeasurementFilter[],
  };

  return applyDeviceMetrics(
    { today, logMetric, analytics },
    await loadDeviceMetricRows(database, userId),
  );
}

export async function loadHealthDataForUser(user: AuthUser): Promise<LoadedHealthData> {
  const database = await getReadyDatabase();
  const userResult = await database.execute('SELECT user_id FROM local_users WHERE user_id = ?', [user.id]);
  if (userResult.rows.length === 0) {
    await seedUserData(user);
  }
  const payload = await loadPayloadFromRows(database, user.id);
  return { payload, pendingCount: await countPendingSync(database, user.id) };
}

export async function saveUserHealthDataChange(
  user: AuthUser,
  payload: HealthDataPayload,
  change: PendingRecordChange,
): Promise<number> {
  const database = await getReadyDatabase();
  const updatedAt = nowIso();
  await database.transaction(async transaction => {
    await writePayloadRows(transaction, user, payload, updatedAt);
    if (change.recordType === 'measurement' && change.operation === 'delete') {
      const record = change.payload as WeightMeasurement;
      await writeMetricRecord(transaction, {
        userId: user.id,
        recordId: change.recordId,
        metricKey: change.metricKey,
        recordType: 'measurement',
        recordDate: change.recordDate,
        value: change.value,
        unit: change.unit,
        note: change.note,
        updatedAt,
        syncStatus: 'pending',
        deletedAt: updatedAt,
        recordedAt: record.measuredAt,
        createdAt: record.createdAt,
        source: record.source,
      });
    } else if (change.recordType === 'today') {
      await transaction.execute(
        `UPDATE metric_records SET sync_status = 'pending', updated_at = ?
         WHERE user_id = ? AND record_id = ?`,
        [updatedAt, user.id, change.recordId],
      );
    }
    await insertOutboxOperation(transaction, user.id, change.recordId, change.operation, updatedAt);
    if (change.metricKey === 'weight' && change.recordType === 'measurement') {
      await enqueueWriteBack(transaction, user.id, change.recordId, 'weight', change.operation, updatedAt);
    } else if (change.metricKey === 'water' && change.recordType === 'today') {
      await enqueueWriteBack(transaction, user.id, change.recordId, 'water', 'upsert', updatedAt);
    }
  });
  return countPendingSync(database, user.id);
}

export async function getPendingSyncCount(userId: string): Promise<number> {
  const database = await getReadyDatabase();
  return countPendingSync(database, userId);
}

export async function getPendingSyncChanges(userId: string): Promise<PendingSyncChange[]> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    `SELECT operation_id, record_id, operation, created_at
     FROM sync_outbox WHERE user_id = ? ORDER BY created_at`,
    [userId],
  );
  const changes: PendingSyncChange[] = result.rows.map(row => ({
    operationId: String(row.operation_id),
    recordId: String(row.record_id),
    operation: String(row.operation) as PendingSyncChange['operation'],
    createdAt: String(row.created_at),
  }));
  const device = await readDeviceSyncState(database, userId);
  if (device && device.revision > device.syncedRevision) {
    changes.push({
      operationId: `${userId}:${deviceChangeRecordId}`,
      recordId: deviceChangeRecordId,
      operation: 'upsert',
      createdAt: String(device.revision),
    });
  }
  return changes;
}

export async function acknowledgePendingChanges(
  userId: string,
  uploadedChanges: PendingSyncChange[],
  serverVersions: ReadonlyMap<string, string> = new Map(),
): Promise<LoadedHealthData | null> {
  const database = await getReadyDatabase();
  const userResult = await database.execute('SELECT user_id FROM local_users WHERE user_id = ?', [userId]);
  if (!userResult.rows.length) {
    return null;
  }
  await database.transaction(async transaction => {
    for (const change of uploadedChanges) {
      if (change.recordId === deviceChangeRecordId) {
        await transaction.execute(
          `UPDATE device_sync_state SET synced_revision = MAX(synced_revision, ?)
           WHERE user_id = ?`,
          [Number(change.createdAt), userId],
        );
        continue;
      }
      const queuedResult = await transaction.execute(
        `SELECT operation_id FROM sync_outbox
         WHERE user_id = ? AND operation_id = ? AND record_id = ?
           AND operation = ? AND created_at = ?`,
        [userId, change.operationId, change.recordId, change.operation, change.createdAt],
      );
      if (!queuedResult.rows.length) {
        continue;
      }

      const recordResult = await transaction.execute(
        `SELECT deleted_at FROM metric_records
         WHERE user_id = ? AND record_id = ?`,
        [userId, change.recordId],
      );
      if (!recordResult.rows.length) {
        continue;
      }

      const isDeleted = recordResult.rows[0].deleted_at !== null;
      if (change.operation === 'delete') {
        if (!isDeleted) {
          continue;
        }
        await transaction.execute(
          'DELETE FROM metric_records WHERE user_id = ? AND record_id = ?',
          [userId, change.recordId],
        );
      } else {
        if (isDeleted) {
          continue;
        }
        await transaction.execute(
          `UPDATE metric_records SET sync_status = 'synced', server_version = COALESCE(?, updated_at)
           WHERE user_id = ? AND record_id = ?`,
          [serverVersions.get(change.recordId) ?? null, userId, change.recordId],
        );
      }

      await transaction.execute(
        `DELETE FROM sync_outbox
         WHERE user_id = ? AND operation_id = ? AND operation = ? AND created_at = ?`,
        [userId, change.operationId, change.operation, change.createdAt],
      );
    }
  });
  const [payload, pendingCount] = await Promise.all([
    loadPayloadFromRows(database, userId),
    getPendingSyncCount(userId),
  ]);
  return { payload, pendingCount };
}

interface DeviceSyncState {
  revision: number;
  syncedRevision: number;
  backfilledDays: number;
  lastImportedAt: string | null;
}

async function readDeviceSyncState(
  database: DB,
  userId: string,
): Promise<DeviceSyncState | null> {
  const result = await database.execute(
    'SELECT revision, synced_revision, backfilled_days, last_imported_at FROM device_sync_state WHERE user_id = ?',
    [userId],
  );
  const row = result.rows[0] as DbRow | undefined;
  if (!row) {
    return null;
  }
  return {
    revision: Number(row.revision),
    syncedRevision: Number(row.synced_revision),
    backfilledDays: Number(row.backfilled_days),
    lastImportedAt: nullableText(row, 'last_imported_at') ?? null,
  };
}

async function countPendingSync(database: DB, userId: string): Promise<number> {
  const [outbox, device] = await Promise.all([
    database.execute('SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id = ?', [userId]),
    readDeviceSyncState(database, userId),
  ]);
  const deviceDirty = device && device.revision > device.syncedRevision ? 1 : 0;
  return Number(outbox.rows[0]?.count ?? 0) + deviceDirty;
}

async function loadDeviceMetricRows(database: DB, userId: string): Promise<DeviceMetricRow[]> {
  const result = await database.execute(
    'SELECT * FROM device_daily_metrics WHERE user_id = ? AND record_date >= ?',
    [userId, deviceHistoryStartDate()],
  );
  return (result.rows as DbRow[]).map(row => ({
    metricKey: text(row, 'metric_key') as DeviceMetricKey,
    date: text(row, 'record_date'),
    value: numberValue(row, 'value'),
    deepMinutes: Number(row.deep_minutes ?? 0),
    remMinutes: Number(row.rem_minutes ?? 0),
    lightMinutes: Number(row.light_minutes ?? 0),
    awakeMinutes: Number(row.awake_minutes ?? 0),
    recordedAt: text(row, 'updated_at'),
  }));
}

export interface DeviceImportState {
  backfilledDays: number;
  lastImportedAt: string | null;
}

export async function getDeviceImportState(userId: string): Promise<DeviceImportState> {
  const database = await getReadyDatabase();
  const state = await readDeviceSyncState(database, userId);
  return {
    backfilledDays: state?.backfilledDays ?? 0,
    lastImportedAt: state?.lastImportedAt ?? null,
  };
}

// Replaces one metric's rows in a date window; returns true when anything differed.
export async function replaceDeviceDailyMetrics(
  userId: string,
  metricKey: DeviceMetricKey,
  startDate: string,
  endDate: string,
  values: DeviceDailyValue[],
): Promise<boolean> {
  const database = await getReadyDatabase();
  let changed = false;
  await database.transaction(async transaction => {
    const existingResult = await transaction.execute(
      `SELECT * FROM device_daily_metrics
       WHERE user_id = ? AND metric_key = ? AND record_date >= ? AND record_date <= ?`,
      [userId, metricKey, startDate, endDate],
    );
    const existing = new Map(
      (existingResult.rows as DbRow[]).map(row => [text(row, 'record_date'), row]),
    );
    const incoming = new Map(
      values
        .filter(item => item.value > 0 && item.date >= startDate && item.date <= endDate)
        .map(item => [item.date, item]),
    );

    for (const date of existing.keys()) {
      if (!incoming.has(date)) {
        await transaction.execute(
          `DELETE FROM device_daily_metrics
           WHERE user_id = ? AND metric_key = ? AND record_date = ?`,
          [userId, metricKey, date],
        );
        changed = true;
      }
    }

    for (const [date, item] of incoming) {
      const previous = existing.get(date);
      const same = previous !== undefined
        && Number(previous.value) === item.value
        && Number(previous.deep_minutes ?? 0) === (item.deepMinutes ?? 0)
        && Number(previous.rem_minutes ?? 0) === (item.remMinutes ?? 0)
        && Number(previous.light_minutes ?? 0) === (item.lightMinutes ?? 0)
        && Number(previous.awake_minutes ?? 0) === (item.awakeMinutes ?? 0);
      if (same) {
        continue;
      }
      await transaction.execute(
        `INSERT OR REPLACE INTO device_daily_metrics
          (user_id, metric_key, record_date, value, deep_minutes, rem_minutes,
           light_minutes, awake_minutes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          metricKey,
          date,
          item.value,
          item.deepMinutes ?? null,
          item.remMinutes ?? null,
          item.lightMinutes ?? null,
          item.awakeMinutes ?? null,
          nowIso(),
        ],
      );
      changed = true;
    }

    if (changed) {
      await transaction.execute('INSERT OR IGNORE INTO device_sync_state (user_id) VALUES (?)', [userId]);
      await transaction.execute(
        'UPDATE device_sync_state SET revision = revision + 1 WHERE user_id = ?',
        [userId],
      );
    }
  });
  return changed;
}

export async function recordDeviceImport(userId: string, backfilledDays: number): Promise<void> {
  const database = await getReadyDatabase();
  await database.transaction(async transaction => {
    await transaction.execute('INSERT OR IGNORE INTO device_sync_state (user_id) VALUES (?)', [userId]);
    await transaction.execute(
      `UPDATE device_sync_state
       SET backfilled_days = MAX(backfilled_days, ?), last_imported_at = ?
       WHERE user_id = ?`,
      [backfilledDays, nowIso(), userId],
    );
  });
}

export interface PendingWriteBack {
  operationId: string;
  recordId: string;
  kind: 'weight' | 'water';
  operation: 'upsert' | 'delete';
  createdAt: string;
}

export interface WriteBackSource {
  value: number;
  recordDate: string;
  recordedAt: string | null;
  deleted: boolean;
}

async function enqueueWriteBack(
  transaction: HealthDbTransaction,
  userId: string,
  recordId: string,
  kind: PendingWriteBack['kind'],
  operation: PendingWriteBack['operation'],
  createdAt: string,
): Promise<void> {
  await transaction.execute(
    `INSERT OR REPLACE INTO health_connect_writeback
      (operation_id, user_id, record_id, kind, operation, created_at, attempt_count, last_error)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [`${userId}:${recordId}`, userId, recordId, kind, operation, createdAt],
  );
}

export async function getPendingWriteBacks(userId: string): Promise<PendingWriteBack[]> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    `SELECT operation_id, record_id, kind, operation, created_at
     FROM health_connect_writeback WHERE user_id = ? ORDER BY created_at`,
    [userId],
  );
  return (result.rows as DbRow[]).map(row => ({
    operationId: text(row, 'operation_id'),
    recordId: text(row, 'record_id'),
    kind: text(row, 'kind') as PendingWriteBack['kind'],
    operation: text(row, 'operation') as PendingWriteBack['operation'],
    createdAt: text(row, 'created_at'),
  }));
}

export async function loadWriteBackSource(
  userId: string,
  recordId: string,
): Promise<WriteBackSource | null> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    `SELECT value, record_date, recorded_at, deleted_at FROM metric_records
     WHERE user_id = ? AND record_id = ?`,
    [userId, recordId],
  );
  const row = result.rows[0] as DbRow | undefined;
  if (!row || row.value === null || row.value === undefined) {
    return null;
  }
  return {
    value: Number(row.value),
    recordDate: text(row, 'record_date'),
    recordedAt: nullableText(row, 'recorded_at') ?? null,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
  };
}

// Keeps the row when a newer edit replaced this operation while it was in flight.
export async function completeWriteBack(operation: PendingWriteBack): Promise<void> {
  const database = await getReadyDatabase();
  await database.execute(
    'DELETE FROM health_connect_writeback WHERE operation_id = ? AND created_at = ?',
    [operation.operationId, operation.createdAt],
  );
}

export async function failWriteBack(operationId: string, message: string): Promise<void> {
  const database = await getReadyDatabase();
  await database.execute(
    `UPDATE health_connect_writeback
     SET attempt_count = attempt_count + 1, last_error = ? WHERE operation_id = ?`,
    [message, operationId],
  );
}

function recordKind(metricKey: string): SyncRecordKind | null {
  return metricKey === 'weight' || metricKey === 'water' ? metricKey : null;
}

// Describes each queued edit with the server version it was based on.
export async function getSyncChangeDetails(
  userId: string,
  changes: PendingSyncChange[],
): Promise<SyncChange[]> {
  const database = await getReadyDatabase();
  const details: SyncChange[] = [];
  for (const change of changes) {
    if (change.recordId === deviceChangeRecordId) {
      continue;
    }
    const result = await database.execute(
      `SELECT metric_key, record_date, value, note, recorded_at, server_version
       FROM metric_records WHERE user_id = ? AND record_id = ?`,
      [userId, change.recordId],
    );
    const row = result.rows[0] as DbRow | undefined;
    const kind = row ? recordKind(String(row.metric_key)) : null;
    if (!row || !kind) {
      continue;
    }
    details.push({
      operationId: change.operationId,
      recordId: change.recordId,
      kind,
      operation: change.operation,
      baseVersion: nullableText(row, 'server_version') ?? null,
      date: text(row, 'record_date'),
      value: row.value === null || row.value === undefined ? null : Number(row.value),
      note: nullableText(row, 'note') ?? null,
      measuredAt: kind === 'weight' ? nullableText(row, 'recorded_at') ?? null : null,
    });
  }
  return details;
}

async function applyServerState(
  transaction: HealthDbTransaction,
  userId: string,
  kind: SyncRecordKind,
  recordId: string,
  date: string,
  state: ServerRecordState,
  version: string,
): Promise<void> {
  const now = nowIso();
  if (kind === 'weight') {
    if (state.deleted) {
      await transaction.execute(
        'DELETE FROM metric_records WHERE user_id = ? AND record_id = ?',
        [userId, recordId],
      );
      await enqueueWriteBack(transaction, userId, recordId, 'weight', 'delete', now);
      return;
    }
    if (state.value === null) {
      return;
    }
    const existing = await transaction.execute(
      'SELECT recorded_at, created_at FROM metric_records WHERE user_id = ? AND record_id = ?',
      [userId, recordId],
    );
    const row = existing.rows[0] as DbRow | undefined;
    await writeMetricRecord(transaction, {
      userId,
      recordId,
      metricKey: 'weight',
      recordType: 'measurement',
      recordDate: date,
      value: state.value,
      unit: 'kg',
      note: state.note ?? '',
      updatedAt: now,
      syncStatus: 'synced',
      recordedAt: state.measuredAt ?? (row ? nullableText(row, 'recorded_at') : undefined) ?? now,
      createdAt: (row ? nullableText(row, 'created_at') : undefined) ?? now,
      source: 'manual',
    });
    await enqueueWriteBack(transaction, userId, recordId, 'weight', 'upsert', now);
  } else {
    if (state.value === null) {
      return;
    }
    await transaction.execute(
      `UPDATE metric_records SET value = ?, sync_status = 'synced', updated_at = ?
       WHERE user_id = ? AND record_id = ?`,
      [state.value, now, userId, recordId],
    );
    await enqueueWriteBack(transaction, userId, recordId, 'water', 'upsert', now);
  }
  await transaction.execute(
    'UPDATE metric_records SET server_version = ? WHERE user_id = ? AND record_id = ?',
    [version, userId, recordId],
  );
}

// Returns false when the local record is gone, so the caller keeps the queued change.
async function storeConflict(
  transaction: HealthDbTransaction,
  userId: string,
  recordId: string,
  localOperation: 'upsert' | 'delete',
  server: ServerRecordState,
  serverVersion: string,
): Promise<boolean> {
  const local = await transaction.execute(
    `SELECT metric_key, record_date, value, note, recorded_at
     FROM metric_records WHERE user_id = ? AND record_id = ?`,
    [userId, recordId],
  );
  const row = local.rows[0] as DbRow | undefined;
  const kind = row ? recordKind(String(row.metric_key)) : null;
  if (!row || !kind) {
    return false;
  }
  await transaction.execute(
    `INSERT OR REPLACE INTO sync_conflicts
      (user_id, record_id, kind, record_date, local_operation, local_value, local_note,
       local_measured_at, server_value, server_note, server_measured_at, server_deleted,
       server_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      recordId,
      kind,
      text(row, 'record_date'),
      localOperation,
      row.value === null || row.value === undefined ? null : Number(row.value),
      nullableText(row, 'note') ?? null,
      kind === 'weight' ? nullableText(row, 'recorded_at') ?? null : null,
      server.value,
      server.note ?? null,
      server.measuredAt ?? null,
      server.deleted ? 1 : 0,
      serverVersion,
      nowIso(),
    ],
  );
  await transaction.execute(
    `UPDATE metric_records SET sync_status = 'conflict' WHERE user_id = ? AND record_id = ?`,
    [userId, recordId],
  );
  return true;
}

// Conflicted edits leave the outbox; they are re-queued only if the user keeps their version.
export async function recordSyncConflicts(
  userId: string,
  conflicts: { change: PendingSyncChange; result: SyncRecordResult }[],
): Promise<void> {
  if (!conflicts.length) {
    return;
  }
  const database = await getReadyDatabase();
  await database.transaction(async transaction => {
    for (const { change, result } of conflicts) {
      const queued = await transaction.execute(
        'SELECT operation_id FROM sync_outbox WHERE operation_id = ? AND created_at = ?',
        [change.operationId, change.createdAt],
      );
      if (!queued.rows.length || !result.server) {
        continue;
      }
      const stored = await storeConflict(
        transaction,
        userId,
        change.recordId,
        change.operation,
        result.server,
        result.version ?? 'unknown',
      );
      if (stored) {
        await transaction.execute(
          'DELETE FROM sync_outbox WHERE operation_id = ? AND created_at = ?',
          [change.operationId, change.createdAt],
        );
      }
    }
  });
}

export async function getServerCursor(userId: string): Promise<string | null> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    'SELECT cursor FROM server_sync_state WHERE user_id = ?',
    [userId],
  );
  const row = result.rows[0] as DbRow | undefined;
  return row ? nullableText(row, 'cursor') ?? null : null;
}

async function applyOneServerChange(
  transaction: HealthDbTransaction,
  userId: string,
  change: ServerChange,
): Promise<boolean> {
  const local = await transaction.execute(
    'SELECT server_version FROM metric_records WHERE user_id = ? AND record_id = ?',
    [userId, change.recordId],
  );
  const localRow = local.rows[0] as DbRow | undefined;
  if (!localRow && change.kind === 'water') {
    return false;
  }
  const pending = await transaction.execute(
    'SELECT operation FROM sync_outbox WHERE user_id = ? AND record_id = ?',
    [userId, change.recordId],
  );
  const openConflict = await transaction.execute(
    'SELECT record_id FROM sync_conflicts WHERE user_id = ? AND record_id = ?',
    [userId, change.recordId],
  );
  const decision = decideServerChange({
    hasPendingLocal: pending.rows.length > 0,
    hasOpenConflict: openConflict.rows.length > 0,
    localVersion: localRow ? nullableText(localRow, 'server_version') ?? null : null,
    serverVersion: change.version,
  });

  if (decision === 'apply') {
    await applyServerState(
      transaction,
      userId,
      change.kind,
      change.recordId,
      change.date,
      change,
      change.version,
    );
    return true;
  }
  if (decision === 'ignore') {
    return false;
  }

  if (openConflict.rows.length) {
    await transaction.execute(
      `UPDATE sync_conflicts
       SET server_value = ?, server_note = ?, server_measured_at = ?, server_deleted = ?,
           server_version = ?
       WHERE user_id = ? AND record_id = ?`,
      [
        change.value,
        change.note ?? null,
        change.measuredAt ?? null,
        change.deleted ? 1 : 0,
        change.version,
        userId,
        change.recordId,
      ],
    );
    return true;
  }

  const operation = pending.rows[0]
    ? (String(pending.rows[0].operation) as 'upsert' | 'delete')
    : 'upsert';
  const stored = await storeConflict(
    transaction,
    userId,
    change.recordId,
    operation,
    change,
    change.version,
  );
  if (stored) {
    await transaction.execute(
      'DELETE FROM sync_outbox WHERE user_id = ? AND record_id = ?',
      [userId, change.recordId],
    );
  }
  return stored;
}

// Returns how many records changed locally or became conflicts.
export async function applyServerChanges(
  userId: string,
  response: ServerChangesResponse,
): Promise<number> {
  const database = await getReadyDatabase();
  const user = await database.execute('SELECT user_id FROM local_users WHERE user_id = ?', [userId]);
  if (!user.rows.length) {
    return 0;
  }
  let affected = 0;
  await database.transaction(async transaction => {
    for (const change of response.changes) {
      if (await applyOneServerChange(transaction, userId, change)) {
        affected += 1;
      }
    }
    await transaction.execute(
      'INSERT OR REPLACE INTO server_sync_state (user_id, cursor) VALUES (?, ?)',
      [userId, response.cursor],
    );
  });
  return affected;
}

export async function getOpenConflicts(userId: string): Promise<SyncConflictItem[]> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    'SELECT * FROM sync_conflicts WHERE user_id = ? ORDER BY created_at',
    [userId],
  );
  return (result.rows as DbRow[]).map(row => ({
    recordId: text(row, 'record_id'),
    kind: text(row, 'kind') as SyncRecordKind,
    date: text(row, 'record_date'),
    localOperation: text(row, 'local_operation') as 'upsert' | 'delete',
    local: {
      value: row.local_value === null || row.local_value === undefined ? null : Number(row.local_value),
      note: nullableText(row, 'local_note') ?? null,
      measuredAt: nullableText(row, 'local_measured_at') ?? null,
    },
    server: {
      value: row.server_value === null || row.server_value === undefined ? null : Number(row.server_value),
      note: nullableText(row, 'server_note') ?? null,
      measuredAt: nullableText(row, 'server_measured_at') ?? null,
      deleted: Number(row.server_deleted) === 1,
    },
    serverVersion: text(row, 'server_version'),
  }));
}

export async function resolveSyncConflict(
  userId: string,
  recordId: string,
  choice: ConflictChoice,
): Promise<void> {
  const database = await getReadyDatabase();
  await database.transaction(async transaction => {
    const result = await transaction.execute(
      'SELECT * FROM sync_conflicts WHERE user_id = ? AND record_id = ?',
      [userId, recordId],
    );
    const row = result.rows[0] as DbRow | undefined;
    if (!row) {
      return;
    }
    const now = nowIso();
    const version = text(row, 'server_version');

    if (choice === 'mine') {
      // Re-queue on top of the server's version so the next upload is not a conflict again.
      await transaction.execute(
        `UPDATE metric_records SET server_version = ?, sync_status = 'pending', updated_at = ?
         WHERE user_id = ? AND record_id = ?`,
        [version, now, userId, recordId],
      );
      await insertOutboxOperation(
        transaction,
        userId,
        recordId,
        text(row, 'local_operation') as 'upsert' | 'delete',
        now,
      );
    } else {
      await applyServerState(
        transaction,
        userId,
        text(row, 'kind') as SyncRecordKind,
        recordId,
        text(row, 'record_date'),
        {
          value: row.server_value === null || row.server_value === undefined ? null : Number(row.server_value),
          note: nullableText(row, 'server_note') ?? null,
          measuredAt: nullableText(row, 'server_measured_at') ?? null,
          deleted: Number(row.server_deleted) === 1,
        },
        version,
      );
    }

    await transaction.execute(
      'DELETE FROM sync_conflicts WHERE user_id = ? AND record_id = ?',
      [userId, recordId],
    );
  });
}
