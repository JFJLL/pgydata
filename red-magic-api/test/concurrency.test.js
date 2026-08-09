const test = require("node:test");
const assert = require("node:assert/strict");
const { authHeaders, requestForm, requestJson, withServer } = require("./api-test-helpers");

async function register(context, phone) {
  const send = await requestJson(context.baseUrl, "/api/auth/sms/send", {
    method: "POST",
    body: { phone, purpose: "register" },
  });
  assert.equal(send.body.code, 200, JSON.stringify(send.body));
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone, code: send.body.data.debugCode, password: "password123" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

function notifyFields(orderNo) {
  return {
    out_trade_no: orderNo,
    trade_no: "TRADE-CONCURRENT-001",
    trade_status: "TRADE_SUCCESS",
    total_amount: "10.00",
    seller_id: "test-merchant",
    app_id: "test-app",
    gmt_payment: "2026-08-03 12:00:00",
    sign: "test-signature",
  };
}

test("20 concurrent consumes and repeated payment notifications remain serialized and idempotent", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000300");
    const headers = authHeaders(user.token);
    const order = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    assert.equal(order.body.code, 200, JSON.stringify(order.body));
    const orderNo = order.body.data.orderNo;

    const consumeRequests = Array.from({ length: 20 }, (_, index) => requestJson(context.baseUrl, "/api/shumiao/consume", {
      method: "POST",
      headers,
      body: {
        count: 1,
        taskId: `concurrent-task-${index}`,
        itemIndex: 1,
        remark: "concurrency-test",
      },
    }));
    const notifyRequests = Array.from({ length: 20 }, () => requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(orderNo),
    ));
    const [consumes, notifications] = await Promise.all([
      Promise.all(consumeRequests),
      Promise.all(notifyRequests),
    ]);

    assert.equal(consumes.filter((item) => item.response.status === 200 && item.body.code === 200).length, 20);
    assert.ok(consumes.every((item) => item.body.data?.duplicated === false));
    assert.ok(notifications.every((item) => item.response.status === 200 && item.text === "success"));

    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 130);
    const records = await requestJson(context.baseUrl, "/api/shumiao/consume-records?pageSize=100", { headers });
    assert.equal(records.body.data.total, 20);
    const paid = await requestJson(context.baseUrl, `/api/shumiao/order/${orderNo}`, { headers });
    assert.equal(paid.body.data.status, 1);
    assert.equal(paid.body.data.platformTransactionId, "TRADE-CONCURRENT-001");

    const duplicateBodies = await Promise.all([
      requestJson(context.baseUrl, "/api/shumiao/consume", {
        method: "POST",
        headers,
        body: { count: 1, taskId: "same-task", itemIndex: 1 },
      }),
      requestJson(context.baseUrl, "/api/shumiao/consume", {
        method: "POST",
        headers,
        body: { count: 1, taskId: "same-task", itemIndex: 1 },
      }),
    ]);
    assert.equal(duplicateBodies.filter((item) => item.body.code === 200).length, 2);
    assert.equal(duplicateBodies.filter((item) => item.body.data?.duplicated === true).length, 1);
    const finalBalance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(finalBalance.body.data.balance, 129);
    const finalRecords = await requestJson(context.baseUrl, "/api/shumiao/consume-records?pageSize=100", { headers });
    assert.equal(finalRecords.body.data.total, 21);
  });
});
