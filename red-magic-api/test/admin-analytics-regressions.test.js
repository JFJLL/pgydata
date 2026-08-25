const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");
const { runMigrations } = require("../lib/database-migrations");
const { parseAnalyticsPeriod, queryUsersAnalytics } = require("../lib/admin-analytics");

function execute(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.run(sql, params, function done(error) { db.close(() => error ? reject(error) : resolve(this)); });
  });
}
function createDb(file) {
  const db = new sqlite3.Database(file);
  return {
    run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function done(error) { error ? reject(error) : resolve(this); })); },
    get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))); },
    all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))); },
    close() { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); },
  };
}
async function register(context, phone) {
  const sms = await requestJson(context.baseUrl, "/api/auth/sms/send", { method: "POST", body: { phone, purpose: "register" } });
  const result = await requestJson(context.baseUrl, "/api/auth/register", { method: "POST", body: { phone, code: sms.body.data.debugCode, password: "password123" } });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}
async function adminHeaders(context) {
  const result = await requestJson(context.baseUrl, "/api/admin/login", { method: "POST", body: { username: "admin", password: "test-admin-password" } });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return { Authorization: `Bearer ${result.body.data.token}` };
}

test("event capabilities distinguish unavailable, pre-coverage and partial coverage instead of fake zero", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000611");
    const headers = authHeaders(user.token);
    const event = { eventId: "evt_capability_0001", eventName: "task_complete", appVersion: "2.0.0-test", module: "pgy", itemCount: 2, successCount: 1, errorCount: 1 };
    const inserted = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [event] } });
    assert.equal(inserted.body.code, 200);
    await execute(context.dbPath, "UPDATE client_events SET created_at = '2026-08-25T00:00:00.000Z'");
    const admin = await adminHeaders(context);
    const partial = await requestJson(context.baseUrl, "/api/admin/analytics/usage?from=2026-08-25&to=2026-08-25", { headers: admin });
    const partialEvents = partial.body.data.eventAnalytics;
    assert.equal(partialEvents.capabilities.taskLifecycle.available, true);
    assert.equal(partialEvents.capabilities.taskLifecycle.periodStatus, "partial");
    assert.equal(partialEvents.tasksCompleted, 1);
    assert.equal(partialEvents.capabilities.appOpen.available, false);
    assert.equal(partialEvents.appOpens, null);
    assert.equal(partialEvents.capabilities.update.available, false);
    assert.equal(partialEvents.updateSuccess, null);
    const before = await requestJson(context.baseUrl, "/api/admin/analytics/usage?from=2026-08-01&to=2026-08-01", { headers: admin });
    assert.equal(before.body.data.eventAnalytics.capabilities.taskLifecycle.periodStatus, "before");
    assert.equal(before.body.data.eventAnalytics.tasksCompleted, null);
  });
});

test("canonical feature grain merges pgy blog and note aliases without duplicating users", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000612");
    const userId = user.userInfo.id;
    await execute(context.dbPath, "INSERT INTO consume_records (user_id, count, balance_after, task_id, plugin_id, task_type, created_at) VALUES (?, 2, 98, 'blog-task', 'pgy', 'blog', '2026-08-25T00:00:00.000Z')", [userId]);
    await execute(context.dbPath, "INSERT INTO consume_records (user_id, count, balance_after, task_id, plugin_id, task_type, created_at) VALUES (?, 3, 95, 'note-task', 'pgy', 'note', '2026-08-25T00:10:00.000Z')", [userId]);
    const usage = await requestJson(context.baseUrl, "/api/admin/analytics/usage?from=2026-08-25&to=2026-08-25", { headers: await adminHeaders(context) });
    const rows = usage.body.data.coreCollection.byFeature.filter((row) => row.featureKey === "pgy-note");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].users, 1);
    assert.equal(rows[0].tasks, 2);
    assert.equal(rows[0].items, 5);
  });
});

test("retention cohorts require the target UTC+8 natural day to have ended", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-retention-"));
  const db = createDb(path.join(tempDir, "retention.sqlite"));
  try {
    await runMigrations(db, { clock: () => "2026-08-01T00:00:00.000Z" });
    const users = [
      ["13800000621", "2026-08-16T16:00:00.000Z"], // CST Aug 17, D7 target Aug 24: mature
      ["13800000622", "2026-08-17T16:00:00.000Z"], // CST Aug 18, D7 target Aug 25: ongoing
      ["13800000623", "2026-08-23T16:00:00.000Z"], // CST Aug 24, D1 target Aug 25: ongoing
      ["13800000624", "2026-07-24T16:00:00.000Z"], // CST Jul 25, D30 target Aug 24: mature
      ["13800000625", "2026-07-25T16:00:00.000Z"], // CST Jul 26, D30 target Aug 25: ongoing
    ];
    for (const [phone, createdAt] of users) await db.run("INSERT INTO users (phone, password_hash, nickname, status, created_at, updated_at) VALUES (?, 'x', ?, 1, ?, ?)", [phone, phone, createdAt, createdAt]);
    await db.run("INSERT INTO consume_records (user_id, count, balance_after, created_at) VALUES (1, 1, 0, '2026-08-23T16:00:00.000Z')");
    await db.run("INSERT INTO consume_records (user_id, count, balance_after, created_at) VALUES (2, 1, 0, '2026-08-24T16:00:00.000Z')");
    await db.run("INSERT INTO consume_records (user_id, count, balance_after, created_at) VALUES (3, 1, 0, '2026-08-24T16:00:00.000Z')");
    await db.run("INSERT INTO consume_records (user_id, count, balance_after, created_at) VALUES (4, 1, 0, '2026-08-23T16:00:00.000Z')");
    await db.run("INSERT INTO consume_records (user_id, count, balance_after, created_at) VALUES (5, 1, 0, '2026-08-24T16:00:00.000Z')");
    const now = new Date("2026-08-25T07:00:00.000Z");
    const d1 = await queryUsersAnalytics(db, parseAnalyticsPeriod({ from: "2026-08-24", to: "2026-08-24" }, now), now);
    const d7 = await queryUsersAnalytics(db, parseAnalyticsPeriod({ from: "2026-08-17", to: "2026-08-18" }, now), now);
    const d30 = await queryUsersAnalytics(db, parseAnalyticsPeriod({ from: "2026-07-25", to: "2026-07-26" }, now), now);
    assert.equal(d1.retention.d1.cohortSize, 0);
    assert.equal(d7.retention.d7.cohortSize, 1);
    assert.equal(d7.retention.d7.retainedUsers, 1);
    assert.equal(d30.retention.d30.cohortSize, 1);
    assert.equal(d30.retention.d30.retainedUsers, 1);
  } finally {
    await db.close(); fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("desktop lifecycle reporters use persisted terminal state, automatic appVersion, and sanitized transaction detail UI", () => {
  const root = path.resolve(__dirname, "..", "..");
  const desktop = fs.readFileSync(path.join(root, "app-source", "dist-electron", "index.js"), "utf8");
  const kol = fs.readFileSync(path.join(root, "app-source", "pgy-kol", "pgy-kol-service.mjs"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "red-magic-api", "public", "admin", "admin.js"), "utf8");
  const adminHtml = fs.readFileSync(path.join(root, "red-magic-api", "public", "admin", "index.html"), "utf8");
  assert.match(desktop, /appVersion: ye\.getVersion\(\)/);
  assert.match(desktop, /const pgyFinalTask = await pgyCollectionHistory\.getTask/);
  assert.match(desktop, /pgyTaskAnalytics\.terminal\(/);
  assert.doesNotMatch(desktop, /o === 0\) this\.reportAnalyticsEvent\("task_start"/);
  assert.match(kol, /finished\.status === "completed"/);
  assert.match(kol, /finished\.status === "cancelled"/);
  assert.match(kol, /finished\.status === "failed"/);
  assert.match(kol, /finished\.counts\?\.unique/);
  assert.doesNotMatch(kol, /finished\.counts\?\.total|finished\.counts\?\.success|finished\.counts\?\.failed/);
  assert.match(adminJs, /data-transaction-detail/);
  assert.match(adminJs, /showTransactionDetail/);
  assert.doesNotMatch(adminJs, /detail\.rows/);
  assert.match(adminHtml, /transactionDetailModal/);
});
