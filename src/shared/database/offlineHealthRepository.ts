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
import {
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
      const version = Number(result.rows[0]?.user_version ?? 0);
      if (version === 1) {
        await migrateV1ToV2(database);
      } else if (version !== 2) {
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
  await database.transaction(async transaction => {
    await writePayloadRows(transaction, user, payload, nowIso());
    for (const record of payload.logMetric.history.filter(item => !item.syncStatus)) {
      await insertOutboxOperation(transaction, user.id, record.id, 'upsert', record.createdAt);
    }
  });
  return payload;
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

  return { today, logMetric, analytics };
}

export async function loadHealthDataForUser(user: AuthUser): Promise<LoadedHealthData> {
  const database = await getReadyDatabase();
  const userResult = await database.execute('SELECT user_id FROM local_users WHERE user_id = ?', [user.id]);
  if (userResult.rows.length === 0) {
    await seedUserData(user);
  }
  const payload = await loadPayloadFromRows(database, user.id);
  const pending = await database.execute(
    'SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id = ?',
    [user.id],
  );
  return { payload, pendingCount: Number(pending.rows[0]?.count ?? 0) };
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
  });
  const pending = await database.execute(
    'SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id = ?',
    [user.id],
  );
  return Number(pending.rows[0]?.count ?? 0);
}

export async function getPendingSyncCount(userId: string): Promise<number> {
  const database = await getReadyDatabase();
  const pending = await database.execute(
    'SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id = ?',
    [userId],
  );
  return Number(pending.rows[0]?.count ?? 0);
}

export async function getPendingSyncChanges(userId: string): Promise<PendingSyncChange[]> {
  const database = await getReadyDatabase();
  const result = await database.execute(
    `SELECT operation_id, record_id, operation, created_at
     FROM sync_outbox WHERE user_id = ? ORDER BY created_at`,
    [userId],
  );
  return result.rows.map(row => ({
    operationId: String(row.operation_id),
    recordId: String(row.record_id),
    operation: String(row.operation) as PendingSyncChange['operation'],
    createdAt: String(row.created_at),
  }));
}

export async function acknowledgePendingChanges(
  userId: string,
  uploadedChanges: PendingSyncChange[],
): Promise<LoadedHealthData | null> {
  const database = await getReadyDatabase();
  const userResult = await database.execute('SELECT user_id FROM local_users WHERE user_id = ?', [userId]);
  if (!userResult.rows.length) {
    return null;
  }
  await database.transaction(async transaction => {
    for (const change of uploadedChanges) {
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
          `UPDATE metric_records SET sync_status = 'synced', server_version = updated_at
           WHERE user_id = ? AND record_id = ?`,
          [userId, change.recordId],
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
