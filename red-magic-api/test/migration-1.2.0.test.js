const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();
const { runMigrations, LATEST_SCHEMA_VERSION } = require("../lib/database-migrations");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(":memory:", (error) => error ? reject(error) : resolve(db));
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

function adapter(db) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
        if (error) return reject(error);
        resolve(this);
      }));
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    },
  };
}

async function seedLegacySchema(db) {
  const d = adapter(db);
  await d.run(`CREATE TABLE users (
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
  )`);
  await d.run(`CREATE TABLE user_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await d.run(`CREATE TABLE shumiao_accounts (
    user_id INTEGER PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await d.run(`CREATE TABLE shumiao_packages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    total_count INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  await d.run(`CREATE TABLE recharge_orders (
    order_no TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    package_id TEXT NOT NULL,
    amount REAL NOT NULL,
    total_count INTEGER NOT NULL,
    code_url TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await d.run("INSERT INTO users (phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)", ["13800000000", "legacy-hash", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);
  await d.run("INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at) VALUES (1, 77, ?, ?)", ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);
  await d.run("INSERT INTO shumiao_packages (id, title, amount, total_count, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["legacy_pkg", "旧套餐", 9.9, 100, 1, "2026-01-01T00:00:00.000Z"]);
  await d.run("INSERT INTO recharge_orders (order_no, user_id, package_id, amount, total_count, code_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["legacy-order", 1, "legacy_pkg", 9.9, 100, "legacy", 0, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);
  return d;
}

test("1.2.0 migration upgrades legacy schema, preserves data, and is idempotent", async () => {
  const db = await openDatabase();
  try {
    const d = await seedLegacySchema(db);
    await runMigrations(d);
    const migration = await d.get("SELECT MAX(version) AS version FROM schema_migrations");
    assert.equal(migration.version, LATEST_SCHEMA_VERSION);
    const user = await d.get("SELECT phone, password_hash FROM users WHERE id = 1");
    assert.deepEqual(user, { phone: "13800000000", password_hash: "legacy-hash" });
    assert.equal((await d.get("SELECT balance FROM shumiao_accounts WHERE user_id = 1")).balance, 77);
    const smsColumns = await d.all("PRAGMA table_info(sms_codes)");
    assert.ok(smsColumns.some((column) => column.name === "code_hash"));
    assert.ok(smsColumns.some((column) => column.name === "source_ip_hash"));
    const orderColumns = await d.all("PRAGMA table_info(recharge_orders)");
    for (const name of ["amount_cents", "channel", "payment_token_hash", "merchant_id", "app_id", "platform_transaction_id", "credited_at", "last_query_at", "query_attempts", "expiry_query_at", "manual_review_reason", "promotion_code", "promotion_count"]) {
      assert.ok(orderColumns.some((column) => column.name === name), `missing ${name}`);
    }
    const packageColumns = await d.all("PRAGMA table_info(shumiao_packages)");
    assert.ok(packageColumns.some((c) => c.name === "scene"));
    assert.ok(packageColumns.some((c) => c.name === "recommended"));

    const packages = await d.all("SELECT id, scene, amount_cents, base_count, gift_count, total_count, recommended, enabled FROM shumiao_packages ORDER BY sort_order, id");
    const enabledPkgs = packages.filter((row) => Number(row.enabled) === 1);
    assert.equal(enabledPkgs.length, 5);
    assert.deepEqual(enabledPkgs.map((p) => p.id), ["pkg_10", "pkg_50", "pkg_100", "pkg_500", "pkg_1000"]);
    assert.equal(enabledPkgs.find((p) => p.id === "pkg_100").recommended, 1);
    assert.equal(enabledPkgs.filter((p) => p.recommended === 1).length, 1);
    assert.equal(packages.find((row) => row.id === "legacy_pkg").enabled, 0);
    assert.equal((await d.get("SELECT amount_cents FROM shumiao_packages WHERE id = 'legacy_pkg'")).amount_cents, 990);
    const before = await d.get("SELECT COUNT(*) AS count FROM schema_migrations");
    await runMigrations(d);
    const after = await d.get("SELECT COUNT(*) AS count FROM schema_migrations");
    assert.equal(after.count, before.count);
    assert.equal((await d.get("SELECT balance FROM shumiao_accounts WHERE user_id = 1")).balance, 77);
  } finally {
    await closeDatabase(db);
  }
});

test("migration failure rolls back schema changes and preserves the legacy database", async () => {
  const db = await openDatabase();
  try {
    const d = await seedLegacySchema(db);
    await d.run("ALTER TABLE recharge_orders ADD COLUMN channel TEXT");
    await d.run("ALTER TABLE recharge_orders ADD COLUMN platform_transaction_id TEXT");
    await d.run("UPDATE recharge_orders SET channel = 'alipay', platform_transaction_id = 'duplicate'");
    await d.run("INSERT INTO recharge_orders (order_no, user_id, package_id, amount, total_count, code_url, status, created_at, updated_at, channel, platform_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ["legacy-order-2", 1, "legacy_pkg", 9.9, 100, "legacy", 0, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "alipay", "duplicate"]);
    await assert.rejects(() => runMigrations(d), /duplicate|transaction/i);
    assert.equal(await d.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sms_codes'"), undefined);
    assert.equal(await d.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"), undefined);
    assert.equal((await d.get("SELECT balance FROM shumiao_accounts WHERE user_id = 1")).balance, 77);
  } finally {
    await closeDatabase(db);
  }
});
