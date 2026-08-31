const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");

function execute(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.run(sql, params, function done(error) {
      db.close((closeError) => error ? reject(error) : closeError ? reject(closeError) : resolve(this));
    });
  });
}

async function register(context, phone) {
  const sent = await requestJson(context.baseUrl, "/api/auth/sms/send", { method: "POST", body: { phone, purpose: "register" } });
  const result = await requestJson(context.baseUrl, "/api/auth/register", { method: "POST", body: { phone, code: sent.body.data.debugCode, password: "password123" } });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

async function adminHeaders(context) {
  const result = await requestJson(context.baseUrl, "/api/admin/login", { method: "POST", body: { username: "admin", password: "test-admin-password" } });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return { Authorization: `Bearer ${result.body.data.token}` };
}

test("analytics uses consume records for activity, UTC+8 day edges, grouped tasks and credited finance", async () => {
  await withServer({}, {}, async (context) => {
    const active = await register(context, "13800000411");
    const tokenOnly = await register(context, "13800000412");
    const activeId = active.userInfo.id;
    const tokenOnlyId = tokenOnly.userInfo.id;
    await execute(context.dbPath, "UPDATE users SET created_at = ?, updated_at = ? WHERE id = ?", ["2026-08-24T16:00:00.000Z", "2026-08-24T16:00:00.000Z", activeId]);
    await execute(context.dbPath, "UPDATE users SET created_at = ?, updated_at = ? WHERE id = ?", ["2026-08-24T16:00:00.000Z", "2026-08-24T16:00:00.000Z", tokenOnlyId]);
    const inserts = [
      [activeId, 2, 98, "task-a", 1, "pgy", "blogger", 5, 2, "2026-08-24T15:59:59.000Z"],
      [activeId, 3, 95, "task-a", 2, "pgy", "blogger", 5, 3, "2026-08-24T16:00:00.000Z"],
      [activeId, 1, 94, null, null, "mystery", "alpha", null, null, "2026-08-24T16:01:00.000Z"],
    ];
    for (const row of inserts) await execute(context.dbPath, "INSERT INTO consume_records (user_id, count, balance_after, task_id, item_index, plugin_id, task_type, planned_count, valid_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row);
    await execute(context.dbPath, "INSERT INTO recharge_orders (order_no, user_id, package_id, amount, amount_cents, base_count, gift_count, promotion_code, promotion_count, total_count, code_url, status, channel, created_at, updated_at, credited_at) VALUES ('credited-a', ?, 'pkg_10', 10, 1000, 50, 0, 'first_recharge_v1', 10, 60, 'x', 1, 'alipay', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z')", [activeId]);
    await execute(context.dbPath, "INSERT INTO recharge_orders (order_no, user_id, package_id, amount, amount_cents, base_count, gift_count, promotion_count, total_count, code_url, status, channel, created_at, updated_at, credited_at) VALUES ('credited-w', ?, 'pkg_100', 100, 10000, 500, 100, 0, 600, 'x', 1, 'wxpay', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z')", [activeId]);
    await execute(context.dbPath, "INSERT INTO recharge_orders (order_no, user_id, package_id, amount, amount_cents, base_count, gift_count, promotion_count, total_count, code_url, status, channel, created_at, updated_at) VALUES ('pending', ?, 'pkg_10', 10, 1000, 50, 0, 0, 50, 'x', 0, 'alipay', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z')", [activeId]);
    await execute(context.dbPath, "INSERT INTO recharge_orders (order_no, user_id, package_id, amount, amount_cents, base_count, gift_count, promotion_count, total_count, code_url, status, channel, created_at, updated_at) VALUES ('closed', ?, 'pkg_10', 10, 1000, 50, 0, 0, 50, 'x', 2, 'alipay', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z')", [activeId]);
    const headers = await adminHeaders(context);
    const beforeBoundary = await requestJson(context.baseUrl, "/api/admin/analytics/usage?from=2026-08-24&to=2026-08-24", { headers });
    assert.equal(beforeBoundary.body.data.coreCollection.collectedItems, 2);
    const atBoundary = await requestJson(context.baseUrl, "/api/admin/analytics/usage?from=2026-08-25&to=2026-08-25", { headers });
    assert.equal(atBoundary.body.data.coreCollection.collectedItems, 4);
    assert.equal(atBoundary.body.data.coreCollection.effectiveTasks, 2);
    assert.ok(atBoundary.body.data.coreCollection.byFeature.some((row) => row.featureLabel.includes("其他 / mystery · alpha")));
    const overview = await requestJson(context.baseUrl, "/api/admin/analytics/overview?from=2026-08-25&to=2026-08-25", { headers });
    assert.equal(overview.body.data.kpis.effectiveActiveUsers.value, 1);
    assert.equal(overview.body.data.kpis.rechargeRevenueYuan.value, 110);
    const finance = await requestJson(context.baseUrl, "/api/admin/analytics/finance?from=2026-08-25&to=2026-08-25", { headers });
    assert.equal(finance.body.data.recharge.revenueYuan, 110);
    assert.equal(finance.body.data.recharge.creditedOrders, 2);
    assert.equal(finance.body.data.recharge.pendingOrders, 1);
    assert.equal(finance.body.data.recharge.closedOrders, 1);
    assert.equal(finance.body.data.recharge.paymentConversionRate, 50);
    assert.equal(finance.body.data.recharge.byChannel.find((row) => row.channel === "alipay").revenueYuan, 10);
    assert.equal(finance.body.data.recharge.byChannel.find((row) => row.channel === "wxpay").revenueYuan, 100);
    assert.equal(finance.body.data.recharge.firstRechargePromo.extraPoints, 10);
    const ordinary = await requestJson(context.baseUrl, "/api/admin/analytics/overview?range=30d", { headers: authHeaders(active.token) });
    assert.notEqual(ordinary.body.code, 200);
  });
});

test("client event endpoint is authenticated, bounded, idempotent and has no free-form data channel", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000413");
    const headers = authHeaders(user.token);
    const event = { eventId: "evt_analytics_test_0001", eventName: "task_complete", appVersion: "1.4.2", module: "pgy", pluginId: "pgy", taskType: "blogger", itemCount: 2, successCount: 2, durationMs: 1200 };
    const unauthenticated = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", body: { events: [event] } });
    assert.equal(unauthenticated.body.code, 401);
    const first = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [event] } });
    assert.equal(first.body.code, 200); assert.equal(first.body.data.inserted, 1);
    const replay = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [event] } });
    assert.equal(replay.body.data.inserted, 0); assert.equal(replay.body.data.duplicated, 1);
    const badName = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [{ ...event, eventId: "evt_analytics_test_0002", eventName: "click_everything" }] } });
    assert.equal(badName.body.code, 400);
    const sensitive = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [{ ...event, eventId: "evt_analytics_test_0003", cookie: "forbidden" }] } });
    assert.equal(sensitive.body.code, 400);
    const negative = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: [{ ...event, eventId: "evt_analytics_test_0004", durationMs: -1 }] } });
    assert.equal(negative.body.code, 400);
    const excessive = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers, body: { events: Array.from({ length: 21 }, (_, index) => ({ ...event, eventId: `evt_analytics_batch_${String(index).padStart(4, "0")}` })) } });
    assert.equal(excessive.body.code, 400);
    const headersAdmin = await adminHeaders(context);
    const usage = await requestJson(context.baseUrl, "/api/admin/analytics/usage?range=30d", { headers: headersAdmin });
    assert.equal(usage.body.data.eventAnalytics.available, true);
    assert.equal(usage.body.data.eventAnalytics.tasksCompleted, 1);
  });
});
