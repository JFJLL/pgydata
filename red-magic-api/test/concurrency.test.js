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

test("consume records aggregate one row per task submission like the admin backend", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000401");
    const headers = authHeaders(user.token);
    const order = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    assert.equal(order.body.code, 200, JSON.stringify(order.body));
    await requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(order.body.data.orderNo),
    );

    // 同一任务提交 3 条明细（每条 1 积分），应聚合为 1 条流水；再提交另一个任务 2 条。
    for (const [taskId, itemIndex] of [["task-a", 1], ["task-a", 2], ["task-a", 3], ["task-b", 1], ["task-b", 2]]) {
      const consume = await requestJson(context.baseUrl, "/api/shumiao/consume", {
        method: "POST",
        headers,
        body: { count: 1, taskId, itemIndex, remark: "aggregation-test" },
      });
      assert.equal(consume.body.code, 200, JSON.stringify(consume.body));
    }

    const records = await requestJson(context.baseUrl, "/api/shumiao/consume-records?pageSize=100", { headers });
    assert.equal(records.body.code, 200, JSON.stringify(records.body));
    assert.equal(records.body.data.total, 2, "两个任务应聚合为两条流水");
    const rows = records.body.data.list;
    assert.deepEqual(rows.map((row) => row.consumeCount), [2, 3], "任务聚合后的消耗应为明细之和");
    assert.deepEqual(rows.map((row) => row.itemCount), [2, 3]);
    assert.ok(rows.every((row) => row.balanceBefore === row.balanceAfter + row.consumeCount));

    // 无任务标识的历史记录仍按条展示。
    const legacy = await requestJson(context.baseUrl, "/api/shumiao/consume", {
      method: "POST",
      headers,
      body: { count: 5, remark: "legacy-consume" },
    });
    assert.equal(legacy.body.code, 200, JSON.stringify(legacy.body));
    const afterLegacy = await requestJson(context.baseUrl, "/api/shumiao/consume-records?pageSize=100", { headers });
    assert.equal(afterLegacy.body.data.total, 3);
    const legacyRow = afterLegacy.body.data.list.find((row) => row.consumeCount === 5);
    assert.ok(legacyRow, "无任务标识的消耗应单独成条");
  });
});
