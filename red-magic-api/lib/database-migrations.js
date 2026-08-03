const LATEST_SCHEMA_VERSION = 3;

const LEGACY_PACKAGE_IDS = new Set([
  "pkg_990",
  "pkg_2990",
  "pkg_9900",
]);

function nowIso() {
  return new Date().toISOString();
}

async function tableColumns(db, table) {
  return db.all(`PRAGMA table_info(${table})`);
}

async function ensureColumn(db, table, column, definition) {
  const columns = await tableColumns(db, table);
  if (columns.some((item) => item.name === column)) return false;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

async function ensureLegacySchema(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      nickname TEXT,
      avatar TEXT,
      email TEXT,
      status INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await ensureColumn(db, "users", "email", "TEXT");
  await ensureColumn(db, "users", "deleted_at", "TEXT");
  await ensureColumn(db, "users", "last_active_at", "TEXT");

  await db.run(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS shumiao_accounts (
      user_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS shumiao_packages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      total_count INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS consume_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      count INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT,
      detail_type TEXT,
      detail_summary TEXT,
      detail_json TEXT,
      task_id TEXT,
      item_index INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await ensureColumn(db, "consume_records", "detail_type", "TEXT");
  await ensureColumn(db, "consume_records", "detail_summary", "TEXT");
  await ensureColumn(db, "consume_records", "detail_json", "TEXT");
  await ensureColumn(db, "consume_records", "task_id", "TEXT");
  await ensureColumn(db, "consume_records", "item_index", "INTEGER");
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_consume_records_task_identity
    ON consume_records (user_id, task_id, item_index)
    WHERE task_id IS NOT NULL AND item_index IS NOT NULL
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS recharge_orders (
      order_no TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      package_id TEXT NOT NULL,
      amount REAL NOT NULL,
      total_count INTEGER NOT NULL,
      code_url TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS admin_balance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_username TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS admin_user_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_username TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      request_source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS export_templates (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      field_keys TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, platform, name)
    )
  `);
}

async function ensureTransactionIdentityIsUnique(db) {
  const conflicts = await db.all(`
    SELECT channel, platform_transaction_id, COUNT(*) AS count
    FROM recharge_orders
    WHERE channel IS NOT NULL
      AND platform_transaction_id IS NOT NULL
      AND TRIM(platform_transaction_id) <> ''
    GROUP BY channel, platform_transaction_id
    HAVING COUNT(*) > 1
  `);
  if (conflicts.length > 0) {
    const first = conflicts[0];
    throw new Error(`duplicate platform transaction identity: ${first.channel}:${first.platform_transaction_id}`);
  }
}

async function applyVersion2(db, clock) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      source_ip_hash TEXT,
      provider_request_id TEXT,
      provider_error_code TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      locked_at TEXT
    )
  `);
  await db.run("CREATE INDEX IF NOT EXISTS idx_sms_codes_phone_purpose_created ON sms_codes(phone, purpose, created_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_sms_codes_ip_created ON sms_codes(source_ip_hash, created_at)");

  for (const [column, definition] of [
    ["amount_cents", "INTEGER"],
    ["base_count", "INTEGER"],
    ["gift_count", "INTEGER"],
    ["enabled", "INTEGER"],
  ]) {
    await ensureColumn(db, "shumiao_packages", column, definition);
  }
  await db.run(`
    UPDATE shumiao_packages
    SET amount_cents = CASE WHEN amount_cents IS NULL OR amount_cents = 0 THEN CAST(ROUND(COALESCE(amount, 0) * 100, 0) AS INTEGER) ELSE amount_cents END,
        base_count = CASE WHEN base_count IS NULL THEN total_count ELSE base_count END,
        gift_count = CASE WHEN gift_count IS NULL THEN 0 ELSE gift_count END,
        enabled = CASE WHEN enabled IS NULL THEN 0 ELSE enabled END
  `);

  const packageRows = [
    ["pkg_10", "10元 / 50积分", 10, 1000, 50, 0, 50, 1],
    ["pkg_100", "100元 / 550积分", 100, 10000, 500, 50, 550, 2],
    ["pkg_500", "500元 / 2800积分", 500, 50000, 2500, 300, 2800, 3],
    ["pkg_1000", "1000元 / 6000积分", 1000, 100000, 5000, 1000, 6000, 4],
  ];
  for (const [id, title, amount, amountCents, baseCount, giftCount, totalCount, sortOrder] of packageRows) {
    await db.run(
      `INSERT INTO shumiao_packages
        (id, title, amount, amount_cents, base_count, gift_count, total_count, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         amount = excluded.amount,
         amount_cents = excluded.amount_cents,
         base_count = excluded.base_count,
         gift_count = excluded.gift_count,
         total_count = excluded.total_count,
         enabled = excluded.enabled,
         sort_order = excluded.sort_order`,
      [id, title, amount, amountCents, baseCount, giftCount, totalCount, 1, sortOrder, clock()],
    );
  }
  await db.run(`
    UPDATE shumiao_packages
    SET enabled = 0
    WHERE id NOT IN ('pkg_10', 'pkg_100', 'pkg_500', 'pkg_1000')
  `);

  for (const [column, definition] of [
    ["amount_cents", "INTEGER"],
    ["base_count", "INTEGER"],
    ["gift_count", "INTEGER"],
    ["channel", "TEXT"],
    ["payment_token_hash", "TEXT"],
    ["payment_token_expires_at", "TEXT"],
    ["merchant_id", "TEXT"],
    ["app_id", "TEXT"],
    ["platform_transaction_id", "TEXT"],
    ["paid_at", "TEXT"],
    ["credited_at", "TEXT"],
    ["failed_reason", "TEXT"],
    ["expires_at", "TEXT"],
    ["last_query_at", "TEXT"],
    ["query_attempts", "INTEGER"],
    ["last_query_status", "TEXT"],
  ]) {
    await ensureColumn(db, "recharge_orders", column, definition);
  }
  await db.run(`
    UPDATE recharge_orders
    SET amount_cents = CASE WHEN amount_cents IS NULL OR amount_cents = 0 THEN CAST(ROUND(COALESCE(amount, 0) * 100, 0) AS INTEGER) ELSE amount_cents END,
        base_count = CASE WHEN base_count IS NULL THEN total_count ELSE base_count END,
        gift_count = CASE WHEN gift_count IS NULL THEN 0 ELSE gift_count END,
        channel = CASE WHEN channel IS NULL OR TRIM(channel) = '' THEN 'legacy' ELSE channel END,
        query_attempts = COALESCE(query_attempts, 0)
  `);
  await ensureTransactionIdentityIsUnique(db);
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_orders_platform_transaction
    ON recharge_orders(channel, platform_transaction_id)
    WHERE channel IS NOT NULL
      AND platform_transaction_id IS NOT NULL
      AND TRIM(platform_transaction_id) <> ''
  `);
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_orders_payment_token
    ON recharge_orders(payment_token_hash)
    WHERE payment_token_hash IS NOT NULL AND TRIM(payment_token_hash) <> ''
  `);
}

async function applyVersion3(db) {
  await ensureColumn(db, "recharge_orders", "expiry_query_at", "TEXT");
  await ensureColumn(db, "recharge_orders", "manual_review_reason", "TEXT");
}

async function runMigrations(db, options = {}) {
  const clock = options.clock || nowIso;
  await db.run("PRAGMA foreign_keys = ON");
  await db.run("BEGIN IMMEDIATE TRANSACTION");
  try {
    await db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const latest = await db.get("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    if (Number(latest.version) > LATEST_SCHEMA_VERSION) {
      throw new Error(`database schema ${latest.version} is newer than supported ${LATEST_SCHEMA_VERSION}`);
    }
    if (Number(latest.version) < 1) {
      await ensureLegacySchema(db);
      await db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [1, "legacy-compatible-schema", clock()]);
    }
    const afterLegacy = await db.get("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    if (Number(afterLegacy.version) < 2) {
      await applyVersion2(db, clock);
      await db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [2, "magiorix-1.2.0-auth-alipay", clock()]);
    }
    const afterVersion2 = await db.get("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    if (Number(afterVersion2.version) < 3) {
      await applyVersion3(db);
      await db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [3, "magiorix-1.2.0-reconciliation-hardening", clock()]);
    }
    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK").catch(() => {});
    throw error;
  }
}

module.exports = {
  LATEST_SCHEMA_VERSION,
  runMigrations,
};
