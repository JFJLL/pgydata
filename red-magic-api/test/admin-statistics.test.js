const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();
const { authHeaders, requestForm, requestJson, withServer } = require("./api-test-helpers");

async function register(context) {
  const send = await requestJson(context.baseUrl, "/api/auth/sms/send", {
    method: "POST",
    body: { phone: "13800000400", purpose: "register" },
  });
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone: "13800000400", code: send.body.data.debugCode, password: "password123" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

async function loginAdmin(context) {
  const result = await requestJson(context.baseUrl, "/api/admin/login", {
    method: "POST",
    body: { username: "admin", password: "test-admin-password" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data.token;
}

function notify(orderNo, tradeNo, amount, status = "TRADE_SUCCESS") {
  return {
    out_trade_no: orderNo,
    trade_no: tradeNo,
    trade_status: status,
    total_amount: amount,
    seller_id: "test-merchant",
    app_id: "test-app",
    gmt_payment: "2026-08-03 12:00:00",
    sign: "test-signature",
  };
}

function updateCreditedAt(dbPath, orderNo, creditedAt) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openError) => {
      if (openError) return reject(openError);
      db.run("UPDATE recharge_orders SET credited_at = ? WHERE order_no = ?", [creditedAt, orderNo], (error) => {
        db.close((closeError) => {
          if (error) return reject(error);
          if (closeError) return reject(closeError);
          resolve();
        });
      });
    });
  });
}

test("admin recharge statistics only count credited cents and expose created orders separately", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context);
    const headers = authHeaders(user.token);
    const create = async (packageId) => {
      const result = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
        method: "POST",
        headers,
        body: { packageId },
      });
      assert.equal(result.body.code, 200, JSON.stringify(result.body));
      return result.body.data;
    };

    const unpaid = await create("pkg_10");
    const closed = await create("pkg_100");
    const closedResponse = await requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notify(closed.orderNo, "TRADE-CLOSED-STAT", "100.00", "TRADE_CLOSED"),
    );
    assert.equal(closedResponse.text, "success");
    const creditedTen = await create("pkg_10");
    const creditedHundred = await create("pkg_100");
    assert.equal((await requestJson(context.baseUrl, `/api/shumiao/order/${unpaid.orderNo}`, { headers })).body.data.status, 0);
    assert.equal(closedResponse.text, "success");
    for (const [order, tradeNo, amount] of [
      [creditedTen, "TRADE-STAT-10", "10.00"],
      [creditedHundred, "TRADE-STAT-100", "100.00"],
    ]) {
      const response = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notify(order.orderNo, tradeNo, amount));
      assert.equal(response.text, "success");
      const replay = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notify(order.orderNo, tradeNo, amount));
      assert.equal(replay.text, "success");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await updateCreditedAt(context.dbPath, creditedTen.orderNo, new Date(today.getTime() - 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000).toISOString());

    const ordinaryStats = await requestJson(context.baseUrl, "/api/statistics/admin-dashboard", { headers });
    assert.ok([401, 403].includes(ordinaryStats.body.code), JSON.stringify(ordinaryStats.body));

    const safeStats = await requestJson(context.baseUrl, "/api/statistics/dashboard", { headers });
    assert.equal(safeStats.response.status, 200, JSON.stringify(safeStats.body));
    assert.equal(safeStats.body.data.users.total, 0);
    assert.equal(safeStats.body.data.finance.recharge.totalAmountYuan, 0);
    assert.equal(safeStats.body.data.finance.recharge.totalOrders, 0);
    assert.equal(safeStats.body.data.finance.recharge.createdOrders.total, 0);

    const adminToken = await loginAdmin(context);
    const stats = await requestJson(context.baseUrl, "/api/statistics/admin-dashboard", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(stats.response.status, 200, JSON.stringify(stats.body));
    assert.equal(stats.body.code, 200, JSON.stringify(stats.body));
    const recharge = stats.body.data.finance.recharge;
    assert.equal(recharge.totalAmountYuan, 110);
    assert.equal(recharge.todayAmountYuan, 100);
    assert.equal(recharge.weekAmountYuan, 110);
    assert.equal(recharge.totalOrders, 2);
    assert.equal(recharge.todayOrders, 1);
    assert.equal(recharge.createdOrders.total, 4);
    assert.equal(recharge.createdOrders.today, 4);
    assert.equal(stats.body.data.finance.profit.available, false);
    assert.equal(stats.body.data.finance.profit.totalProfitYuan, 0);
  });
});
