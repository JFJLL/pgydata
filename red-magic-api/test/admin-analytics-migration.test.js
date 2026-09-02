const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();
const { runMigrations, LATEST_SCHEMA_VERSION } = require("../lib/database-migrations");

function openDatabase(file) {
  const db = new sqlite3.Database(file);
  return {
    run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function done(error) { if (error) reject(error); else resolve(this); })); },
    get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))); },
    all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))); },
    close() { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); },
  };
}

test("v4 database upgrades to v6 without losing records and safely backfills analytics columns", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-v5-"));
  const db = openDatabase(path.join(tempDir, "legacy.sqlite"));
  try {
    await db.run("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    for (let version = 1; version <= 4; version += 1) await db.run("INSERT INTO schema_migrations VALUES (?, ?, ?)", [version, `v${version}`, "2026-08-01T00:00:00.000Z"]);
    await db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)");
    await db.run("INSERT INTO users VALUES (1, '2026-08-01T00:00:00.000Z')");
    await db.run("CREATE TABLE consume_records (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, count INTEGER NOT NULL, balance_after INTEGER NOT NULL, detail_type TEXT, detail_summary TEXT, detail_json TEXT, task_id TEXT, item_index INTEGER, created_at TEXT NOT NULL)");
    await db.run("INSERT INTO consume_records VALUES (1, 1, 3, 97, 'xlsx', 'old', ?, 'task-1', 1, '2026-08-01T00:00:00.000Z')", [JSON.stringify({ pluginId: "pgy", taskType: "blogger", totalRows: 5, validCount: 3 })]);
    await db.run("INSERT INTO consume_records VALUES (2, 1, 1, 96, 'manual', 'invalid', '{bad json', NULL, NULL, '2026-08-01T00:01:00.000Z')");
    await db.run("CREATE TABLE recharge_orders (order_no TEXT PRIMARY KEY, created_at TEXT, status INTEGER, credited_at TEXT, channel TEXT)");
    await db.run("INSERT INTO recharge_orders VALUES ('legacy-order', '2026-08-01T00:00:00.000Z', 1, '2026-08-01T00:00:00.000Z', 'legacy')");
    await db.run("CREATE TABLE shumiao_accounts (user_id INTEGER PRIMARY KEY, balance INTEGER)");
    await db.run("INSERT INTO shumiao_accounts VALUES (1, 96)");
    await db.run("CREATE TABLE admin_balance_adjustments (id INTEGER PRIMARY KEY, user_id INTEGER, delta INTEGER, created_at TEXT)");

    await runMigrations(db, { clock: () => "2026-08-02T00:00:00.000Z" });
    assert.equal(LATEST_SCHEMA_VERSION, 6);
    assert.equal((await db.get("SELECT MAX(version) AS version FROM schema_migrations")).version, 6);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM users")).count, 1);
    assert.equal((await db.get("SELECT balance FROM shumiao_accounts WHERE user_id = 1")).balance, 96);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM recharge_orders")).count, 1);
    const filled = await db.get("SELECT plugin_id, task_type, planned_count, valid_count FROM consume_records WHERE id = 1");
    assert.deepEqual(filled, { plugin_id: "pgy", task_type: "blogger", planned_count: 5, valid_count: 3 });
    const invalid = await db.get("SELECT plugin_id, task_type, planned_count, valid_count FROM consume_records WHERE id = 2");
    assert.deepEqual(invalid, { plugin_id: null, task_type: null, planned_count: null, valid_count: null });
    assert.equal((await db.get("SELECT detail_json AS json FROM consume_records WHERE id = 1")).json.includes("pluginId"), true);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM client_events")).count, 0);
    assert.ok((await db.all("PRAGMA index_list('client_events')")).some((row) => row.name.includes("idx_client_events_name_created")));
    assert.ok((await db.all("PRAGMA index_list('diagnostic_reports')")).some((row) => row.name.includes("idx_diag_user_id")));

    await runMigrations(db, { clock: () => "2026-08-03T00:00:00.000Z" });
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM consume_records")).count, 2);
    assert.equal((await db.get("SELECT balance FROM shumiao_accounts WHERE user_id = 1")).balance, 96);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 6")).count, 1);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
