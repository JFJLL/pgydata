const test = require("node:test");
const assert = require("node:assert/strict");
const { claimPendingOrder, reconcileOnce } = require("../lib/recharge-reconciliation");
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");

function fakeDb(rows) {
  return {
    async all(sql, params) {
      if (!sql.includes("FROM recharge_orders")) return [];
      return rows.filter((row) => Number(row.status) === 0).slice(0, Number(params?.[1] || 20));
    },
    async get(sql, params) {
      if (sql.includes("FROM recharge_orders")) {
        return rows.find((row) => row.orderNo === params[0] || row.order_no === params[0]) || null;
      }
      return null;
    },
    async run(sql, params) {
      const row = rows.find((item) => item.orderNo === params[3] || item.order_no === params[3])
        || rows.find((item) => item.orderNo === params[5] || item.order_no === params[5]);
      if (!row) return { changes: 0 };
      if (sql.includes("SET last_query_at")) {
        const [nowIso, expiryNow, expiryQueryAt, orderNo, requiredStatus, cutoffIso] = params;
        if (row.orderNo !== orderNo || Number(row.status) !== Number(requiredStatus)) return { changes: 0 };
        if (row.lastQueryAt && row.lastQueryAt > cutoffIso) return { changes: 0 };
        if (sql.includes("OR expiry_query_at IS NULL") && row.expires_at && row.expires_at <= expiryNow && row.expiry_query_at) {
          return { changes: 0 };
        }
        row.lastQueryAt = nowIso;
        row.last_query_at = nowIso;
        row.queryAttempts = Number(row.queryAttempts || row.query_attempts || 0) + 1;
        row.query_attempts = row.queryAttempts;
        if (row.expires_at && row.expires_at <= expiryNow && !row.expiry_query_at) {
          row.expiry_query_at = expiryQueryAt;
          row.expiryQueryAt = expiryQueryAt;
        }
        return { changes: 1 };
      }
      if (sql.includes("SET last_query_status")) {
        const [status, reason, close, closedStatus, updatedAt, orderNo, requiredStatus] = params;
        if (row.orderNo !== orderNo || Number(row.status) !== Number(requiredStatus)) return { changes: 0 };
        row.last_query_status = status;
        row.lastQueryStatus = status;
        row.manual_review_reason = reason;
        row.manualReviewReason = reason;
        if (Number(close) === 1) row.status = Number(closedStatus);
        row.updated_at = updatedAt;
        return { changes: 1 };
      }
      return { changes: 0 };
    },
  };
}

function pendingRow(orderNo, overrides = {}) {
  return {
    orderNo,
    order_no: orderNo,
    status: 0,
    channel: "alipay",
    created_at: "2026-08-03T11:00:00.000Z",
    expires_at: "2026-08-03T11:30:00.000Z",
    last_query_status: null,
    lastQueryAt: null,
    queryAttempts: 0,
    ...overrides,
  };
}

test("reconciliation claims one pending order atomically", async () => {
  const rows = [pendingRow("RM-1")];
  const db = fakeDb(rows);
  const [first, second] = await Promise.all([
    claimPendingOrder({ db, orderNo: "RM-1", now: "2026-08-03T12:00:00.000Z", minIntervalMs: 15000 }),
    claimPendingOrder({ db, orderNo: "RM-1", now: "2026-08-03T12:00:00.000Z", minIntervalMs: 15000 }),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(rows[0].queryAttempts, 1);
});

test("an expired order gets a final query and only definitive unpaid closes", async () => {
  const unpaidRows = [pendingRow("RM-EXPIRED-UNPAID", { expires_at: "2026-08-03T11:59:00.000Z" })];
  const unpaidResults = await reconcileOnce({
    db: fakeDb(unpaidRows),
    gateway: { async queryTrade() { return { outTradeNo: "RM-EXPIRED-UNPAID", tradeStatus: "TRADE_CLOSED" }; } },
    settle: async () => { throw new Error("unpaid order must not settle"); },
    now: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(unpaidResults, [{ orderNo: "RM-EXPIRED-UNPAID", status: "TRADE_CLOSED", expired: true }]);
  assert.equal(unpaidRows[0].status, 2);
  assert.equal(unpaidRows[0].expiry_query_at, "2026-08-03T12:00:00.000Z");

  const paidRows = [pendingRow("RM-EXPIRED-PAID", { expires_at: "2026-08-03T11:59:00.000Z" })];
  let settledInput;
  const paidResults = await reconcileOnce({
    db: fakeDb(paidRows),
    gateway: {
      async queryTrade() {
        return {
          outTradeNo: "RM-EXPIRED-PAID",
          tradeNo: "TRADE-PAID",
          totalAmount: "10.00",
          tradeStatus: "TRADE_SUCCESS",
          gmtPayment: "2026-08-03 11:59:30",
        };
      },
    },
    settle: async (input) => { settledInput = input; return { idempotent: false }; },
    now: "2026-08-03T12:00:00.000Z",
  });
  assert.equal(paidResults[0].status, "TRADE_SUCCESS");
  assert.equal(settledInput.transactionId, "TRADE-PAID");
  assert.equal(paidRows[0].status, 0);

  const errorRows = [pendingRow("RM-EXPIRED-ERROR", { expires_at: "2026-08-03T11:59:00.000Z" })];
  const errorResults = await reconcileOnce({
    db: fakeDb(errorRows),
    gateway: { async queryTrade() { throw new Error("temporary gateway failure"); } },
    settle: async () => { throw new Error("must not settle after query failure"); },
    now: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(errorResults, [{ orderNo: "RM-EXPIRED-ERROR", status: "ERROR" }]);
  assert.equal(errorRows[0].status, 0);
  assert.equal(errorRows[0].last_query_status, "ERROR:QUERY_FAILED");
});

test("orders older than 24 hours are queried once before structured manual review", async () => {
  const rows = [pendingRow("RM-STALE", {
    created_at: "2026-08-01T12:00:00.000Z",
    expires_at: "2026-08-01T12:30:00.000Z",
  })];
  let queryCount = 0;
  const results = await reconcileOnce({
    db: fakeDb(rows),
    gateway: {
      async queryTrade() {
        queryCount += 1;
        return { outTradeNo: "RM-STALE", tradeStatus: "WAIT_BUYER_PAY" };
      },
    },
    settle: async () => { throw new Error("must not settle uncertain order"); },
    now: "2026-08-03T12:00:00.000Z",
    maxAgeMs: 24 * 60 * 60 * 1000,
  });
  assert.deepEqual(results, [{ orderNo: "RM-STALE", status: "MANUAL_REVIEW", reason: "MAX_AGE:WAIT_BUYER_PAY" }]);
  assert.equal(queryCount, 1);
  assert.equal(rows[0].last_query_status, "MANUAL_REVIEW:MAX_AGE");
  assert.equal(rows[0].manual_review_reason, "MAX_AGE:WAIT_BUYER_PAY");
});

test("automatic reconciliation does not repeat an expired query, while a manual retry remains available", async () => {
  const rows = [pendingRow("RM-EXPIRED-RETRY", {
    expires_at: "2026-08-03T11:59:00.000Z",
  })];
  let queryCount = 0;
  const gateway = {
    async queryTrade() {
      queryCount += 1;
      return { outTradeNo: "RM-EXPIRED-RETRY", tradeStatus: "WAIT_BUYER_PAY" };
    },
  };

  const first = await reconcileOnce({
    db: fakeDb(rows),
    gateway,
    settle: async () => { throw new Error("uncertain order must not settle"); },
    now: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(first, [{ orderNo: "RM-EXPIRED-RETRY", status: "EXPIRED:WAIT_BUYER_PAY" }]);

  const second = await reconcileOnce({
    db: fakeDb(rows),
    gateway,
    settle: async () => { throw new Error("uncertain order must not settle"); },
    now: "2026-08-03T12:01:00.000Z",
  });
  assert.deepEqual(second, []);
  assert.equal(queryCount, 1);

  const manualRetry = await claimPendingOrder({
    db: fakeDb(rows),
    orderNo: "RM-EXPIRED-RETRY",
    now: "2026-08-03T12:02:00.000Z",
    minIntervalMs: 15000,
    allowExpiredRetry: true,
  });
  assert.ok(manualRetry);
  assert.equal(rows[0].queryAttempts, 2);
});

test("an expired order with a final query becomes manual review after max age without another gateway call", async () => {
  const rows = [pendingRow("RM-EXPIRED-STALE", {
    created_at: "2026-08-01T12:00:00.000Z",
    expires_at: "2026-08-01T12:30:00.000Z",
    expiry_query_at: "2026-08-01T12:31:00.000Z",
  })];
  let queryCount = 0;
  const results = await reconcileOnce({
    db: fakeDb(rows),
    gateway: { async queryTrade() { queryCount += 1; return { tradeStatus: "WAIT_BUYER_PAY" }; } },
    settle: async () => { throw new Error("manual review order must not settle"); },
    now: "2026-08-03T12:00:00.000Z",
    maxAgeMs: 24 * 60 * 60 * 1000,
  });
  assert.deepEqual(results, [{
    orderNo: "RM-EXPIRED-STALE",
    status: "MANUAL_REVIEW",
    reason: "MAX_AGE:EXPIRY_QUERY_ALREADY_ATTEMPTED",
  }]);
  assert.equal(queryCount, 0);
  assert.equal(rows[0].last_query_status, "MANUAL_REVIEW:MAX_AGE");
});

test("a query for another order is retryable and cannot close or credit the local order", async () => {
  const rows = [pendingRow("RM-MISMATCH", { expires_at: "2026-08-03T11:59:00.000Z" })];
  const results = await reconcileOnce({
    db: fakeDb(rows),
    gateway: { async queryTrade() { return { outTradeNo: "RM-OTHER", tradeStatus: "TRADE_CLOSED" }; } },
    settle: async () => { throw new Error("must not settle mismatched order"); },
    now: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(results, [{ orderNo: "RM-MISMATCH", status: "ERROR" }]);
  assert.equal(rows[0].status, 0);
  assert.equal(rows[0].last_query_status, "ERROR:QUERY_FAILED");
});

async function register(context, phone) {
  const send = await requestJson(context.baseUrl, "/api/auth/sms/send", {
    method: "POST",
    body: { phone, purpose: "register" },
  });
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone, code: send.body.data.debugCode, password: "password123" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

test("server-side query settles only verified success and keeps buyer-pending orders open", async () => {
  await withServer({}, { ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS" }, async (context) => {
    const user = await register(context, "13800000200");
    const headers = authHeaders(user.token);
    const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${created.body.data.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.code, 200, JSON.stringify(queried.body));
    assert.equal(queried.body.data.status, 1);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
  });

  await withServer({}, { ALIPAY_TEST_QUERY_STATUS: "WAIT_BUYER_PAY" }, async (context) => {
    const user = await register(context, "13800000201");
    const headers = authHeaders(user.token);
    const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${created.body.data.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.data.status, 0);
    assert.equal(queried.body.data.lastQueryStatus, "WAIT_BUYER_PAY");
  });
});
