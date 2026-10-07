import { open, type DB } from '@op-engineering/op-sqlite';

export type HealthDbTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];

const currentSchemaVersion = 4;
let databasePromise: Promise<DB> | null = null;

export async function createConflictTables(
  transaction: HealthDbTransaction,
): Promise<void> {
  await transaction.execute(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      user_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('weight', 'water')),
      record_date TEXT NOT NULL,
      local_operation TEXT NOT NULL CHECK (local_operation IN ('upsert', 'delete')),
      local_value REAL,
      local_note TEXT,
      local_measured_at TEXT,
      server_value REAL,
      server_note TEXT,
      server_measured_at TEXT,
      server_deleted INTEGER NOT NULL DEFAULT 0,
      server_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, record_id)
    )
  `);
  await transaction.execute(`
    CREATE TABLE IF NOT EXISTS server_sync_state (
      user_id TEXT PRIMARY KEY NOT NULL,
      cursor TEXT
    )
  `);
}

export async function createDeviceHealthTables(
  transaction: HealthDbTransaction,
): Promise<void> {
  await transaction.execute(`
    CREATE TABLE IF NOT EXISTS device_daily_metrics (
      user_id TEXT NOT NULL,
      metric_key TEXT NOT NULL CHECK (metric_key IN ('steps', 'sleep', 'calories')),
      record_date TEXT NOT NULL,
      value REAL NOT NULL,
      deep_minutes REAL,
      rem_minutes REAL,
      light_minutes REAL,
      awake_minutes REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, metric_key, record_date)
    )
  `);
  await transaction.execute(`
    CREATE TABLE IF NOT EXISTS device_sync_state (
      user_id TEXT PRIMARY KEY NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      synced_revision INTEGER NOT NULL DEFAULT 0,
      backfilled_days INTEGER NOT NULL DEFAULT 0,
      last_imported_at TEXT
    )
  `);
  await transaction.execute(`
    CREATE TABLE IF NOT EXISTS health_connect_writeback (
      operation_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('weight', 'water')),
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
      created_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `);
  await transaction.execute(
    'CREATE INDEX IF NOT EXISTS idx_device_daily_metrics_user_date ON device_daily_metrics(user_id, record_date)',
  );
  await transaction.execute(
    'CREATE INDEX IF NOT EXISTS idx_health_connect_writeback_user_created ON health_connect_writeback(user_id, created_at)',
  );
}

export async function createHealthSchemaV2(
  transaction: HealthDbTransaction,
): Promise<void> {
  await transaction.execute(`
    CREATE TABLE local_users (
      user_id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await transaction.execute(`
    CREATE TABLE metric_goals (
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      goal_value REAL NOT NULL,
      unit TEXT NOT NULL,
      goal_met INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      server_version TEXT,
      PRIMARY KEY (user_id, scope, metric_key),
      FOREIGN KEY (user_id) REFERENCES local_users(user_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE metric_records (
      user_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      record_type TEXT NOT NULL CHECK (record_type IN ('today', 'analytics', 'measurement')),
      record_date TEXT NOT NULL,
      value REAL,
      unit TEXT,
      note TEXT,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      server_version TEXT,
      deleted_at TEXT,
      range_key TEXT,
      point_index INTEGER,
      label TEXT,
      display_value TEXT,
      recorded_at TEXT,
      created_at TEXT,
      source TEXT,
      duration_minutes REAL,
      score REAL,
      deep_minutes REAL,
      rem_minutes REAL,
      light_minutes REAL,
      awake_minutes REAL,
      PRIMARY KEY (user_id, record_id),
      FOREIGN KEY (user_id) REFERENCES local_users(user_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE analytics_metrics (
      user_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      label TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_value REAL NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (user_id, metric_key),
      FOREIGN KEY (user_id) REFERENCES local_users(user_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE analytics_ranges (
      user_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      range_key TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      bucket TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (user_id, metric_key, range_key),
      FOREIGN KEY (user_id, metric_key)
        REFERENCES analytics_metrics(user_id, metric_key) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE user_health_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      today_date TEXT NOT NULL,
      water_increment_ml REAL NOT NULL,
      sync_now_enabled INTEGER NOT NULL,
      analytics_default_metric TEXT NOT NULL,
      analytics_default_range TEXT NOT NULL,
      log_supported_metric TEXT NOT NULL,
      draft_metric TEXT NOT NULL,
      draft_value REAL NOT NULL,
      draft_unit TEXT NOT NULL,
      draft_timestamp TEXT NOT NULL,
      draft_note TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES local_users(user_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE health_data_options (
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      option_value TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (user_id, category, option_value),
      FOREIGN KEY (user_id) REFERENCES local_users(user_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(`
    CREATE TABLE sync_outbox (
      operation_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
      created_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      FOREIGN KEY (user_id, record_id)
        REFERENCES metric_records(user_id, record_id) ON DELETE CASCADE
    )
  `);
  await transaction.execute(
    'CREATE INDEX idx_metric_records_user_metric_date ON metric_records(user_id, metric_key, record_date)',
  );
  await transaction.execute(
    'CREATE INDEX idx_sync_outbox_user_created ON sync_outbox(user_id, created_at)',
  );
}

async function initializeDatabase(): Promise<DB> {
  const database = open({ name: 'trackit.db' });
  await database.execute('PRAGMA foreign_keys = ON');
  const versionResult = await database.execute('PRAGMA user_version');
  const version = Number(versionResult.rows[0]?.user_version ?? 0);

  if (version > currentSchemaVersion) {
    throw new Error(`Database version ${version} is newer than this app supports.`);
  }

  if (version === 0) {
    await database.transaction(async transaction => {
      await createHealthSchemaV2(transaction);
      await createDeviceHealthTables(transaction);
      await createConflictTables(transaction);
      await transaction.execute(`PRAGMA user_version = ${currentSchemaVersion}`);
    });
  }

  return database;
}

export function getHealthDatabase(): Promise<DB> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}