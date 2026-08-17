const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const sqlite3 = require("sqlite3").verbose();
const { createAlipayGateway, normalizeTradeResponse } = require("../lib/alipay-gateway");
const { authHeaders, requestForm, requestJson, withServer } = require("./api-test-helpers");

test("installed official alipay-sdk v4 exposes the required CommonJS client methods", () => {
  const sdk = require("alipay-sdk");
  assert.equal(typeof sdk.AlipaySdk, "function");
  assert.equal(typeof sdk.AlipaySdk.prototype.pageExecute, "function");
  assert.equal(typeof sdk.AlipaySdk.prototype.exec, "function");
  assert.equal(typeof sdk.AlipaySdk.prototype.checkNotifySign, "function");
});

test("Alipay SDK v4 dependency injection uses named-compatible client and normalized responses", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const calls = { page: [], notify: [], query: [] };
  const sdk = {
    pageExecute(...args) {
      calls.page.push(args);
      return "<form>alipay</form>";
    },
    async checkNotifySign(params) {
      calls.notify.push(params);
      return true;
    },
    async exec(...args) {
      calls.query.push(args);
      return {
        alipayTradeQueryResponse: {
          outTradeNo: "RM-SDK",
          tradeNo: "TRADE-SDK",
          totalAmount: "10.00",
          tradeStatus: "TRADE_SUCCESS",
        },
      };
    },
  };
  try {
    const gateway = createAlipayGateway({
      sdk,
      config: {
        appId: "test-app",
        merchantId: "test-merchant",
        gateway: "https://openapi.alipay.com/gateway.do",
        notifyUrl: "https://example.test/notify",
        returnUrl: "https://example.test/return",
      },
    });
    const page = await gateway.createPagePay({
      orderNo: "RM-SDK",
      amountCents: 1000,
      subject: "积分充值",
      expiresAt: "2026-08-03T12:30:00.000Z",
    });
    assert.equal(page, "<form>alipay</form>");
    assert.equal(calls.page[0][0], "alipay.trade.page.pay");
    assert.equal(calls.page[0][1], "GET");
    assert.equal(calls.page[0][2].bizContent.out_trade_no, "RM-SDK");
    assert.equal(calls.page[0][2].notifyUrl, "https://example.test/notify");
    assert.equal(await gateway.verifyNotification({ sign: "valid" }), true);
    const query = await gateway.queryTrade({ orderNo: "RM-SDK" });
    assert.deepEqual(query, {
      outTradeNo: "RM-SDK",
      tradeNo: "TRADE-SDK",
      totalAmount: "10.00",
      tradeStatus: "TRADE_SUCCESS",
      sellerId: "",
      appId: "",
      gmtPayment: "",
    });
    assert.equal(calls.query[0][0], "alipay.trade.query");
    assert.deepEqual(calls.query[0][1], { bizContent: { out_trade_no: "RM-SDK" } });
    assert.deepEqual(calls.query[0][2], { validateSign: true });
    assert.deepEqual(normalizeTradeResponse({
      out_trade_no: "RM-SNAKE",
      trade_no: "TRADE-SNAKE",
      total_amount: "10.00",
      trade_status: "WAIT_BUYER_PAY",
    }), {
      outTradeNo: "RM-SNAKE",
      tradeNo: "TRADE-SNAKE",
      totalAmount: "10.00",
      tradeStatus: "WAIT_BUYER_PAY",
      sellerId: "",
      appId: "",
      gmtPayment: "",
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

async function register(context, phone = "13800000100") {
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

function readRechargeOrder(dbPath, orderNo) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openError) => {
      if (openError) return reject(openError);
      db.get("SELECT * FROM recharge_orders WHERE order_no = ?", [orderNo], (error, row) => {
        db.close((closeError) => {
          if (error) return reject(error);
          if (closeError) return reject(closeError);
          resolve(row);
        });
      });
    });
  });
}

function notifyFields(orderNo, tradeNo, overrides = {}) {
  return {
    out_trade_no: orderNo,
    trade_no: tradeNo,
    trade_status: "TRADE_SUCCESS",
    total_amount: "10.00",
    seller_id: "test-merchant",
    app_id: "test-app",
    gmt_payment: "2026-08-03 12:00:00",
    sign: "test-signature",
    ...overrides,
  };
}

test("Alipay order, notify and settlement are single-channel and idempotent", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context);
    const headers = authHeaders(user.token);
    const packages = await requestJson(context.baseUrl, "/api/shumiao/packages", { headers });
    assert.equal(packages.body.code, 200);
    assert.deepEqual(packages.body.data.map((item) => [item.amountCents, item.baseCount, item.giftCount, item.totalCount]), [
      [1000, 50, 0, 50],
      [10000, 500, 50, 550],
      [50000, 2500, 300, 2800],
      [100000, 5000, 1000, 6000],
    ]);
    assert.deepEqual(packages.body.data.map((item) => item.shumiaoCount), [50, 500, 2500, 5000]);

    const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    assert.equal(created.body.code, 200, JSON.stringify(created.body));
    const order = created.body.data;
    assert.equal(order.channel, "alipay");
    assert.equal(order.amountCents, 1000);
    assert.equal(order.amount, 1000);
    assert.equal(order.totalCount, 50);
    assert.equal(order.codeUrl, order.payUrl);
    assert.ok(order.qrCode, "支付宝预下单应返回二维码");
    assert.match(order.qrCode, /^alipay-test:\/\/qrcode\//);
    const pendingRecords = await requestJson(context.baseUrl, "/api/shumiao/recharge-records?page=1&pageSize=10", { headers });
    assert.equal(pendingRecords.body.code, 200, JSON.stringify(pendingRecords.body));
    assert.equal(pendingRecords.body.data.list[0].id, order.orderNo);
    assert.equal(pendingRecords.body.data.list[0].amountYuan, 10);
    assert.equal(pendingRecords.body.data.list[0].statusText, "待支付");
    const payUrl = new URL(order.payUrl);
    assert.equal(payUrl.origin, context.baseUrl);
    assert.match(payUrl.pathname, /^\/pay\/[A-Za-z0-9_-]{40,64}$/);
    const paymentToken = payUrl.pathname.slice("/pay/".length);
    const orderRow = await readRechargeOrder(context.dbPath, order.orderNo);
    assert.equal(orderRow.payment_token_hash, crypto.createHash("sha256").update(paymentToken).digest("hex"));
    for (const [field, value] of Object.entries(orderRow)) {
      const text = String(value ?? "");
      assert.equal(text.includes(paymentToken), false, `${field} contains the raw payment token`);
      assert.equal(text.includes(order.payUrl), false, `${field} contains the full payment URL`);
      assert.doesNotMatch(text, /\/pay\/[A-Za-z0-9_-]{40,64}/, `${field} contains a secret payment path`);
    }

    const paymentPage = await fetch(order.payUrl);
    const paymentHtml = await paymentPage.text();
    assert.equal(paymentPage.status, 200);
    assert.equal(paymentPage.headers.get("cache-control"), "no-store");
    assert.equal(paymentPage.headers.get("referrer-policy"), "no-referrer");
    assert.match(paymentPage.headers.get("content-security-policy") || "", /script-src 'unsafe-inline'/);
    assert.match(paymentHtml, /支付宝/);
    assert.doesNotMatch(paymentHtml, /微信|WeChat/i);

    const wrongToken = `${paymentToken.slice(0, -1)}${paymentToken.endsWith("A") ? "B" : "A"}`;
    const wrongPaymentPage = await fetch(`${context.baseUrl}/pay/${wrongToken}`);
    assert.equal(wrongPaymentPage.status, 404);

    const invalidPaymentPage = await fetch(`${context.baseUrl}/pay/not-a-real-token`);
    assert.equal(invalidPaymentPage.status, 404);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const logFiles = fs.existsSync(context.logDir) ? fs.readdirSync(context.logDir) : [];
      const logs = logFiles.map((file) => fs.readFileSync(`${context.logDir}/${file}`, "utf8")).join("\n");
      if (logs.includes("/pay/:paymentToken")) {
        assert.doesNotMatch(logs, /not-a-real-token/);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (attempt === 19) assert.fail("payment token was not redacted in request logs");
    }

    const concurrentNotifies = await Promise.all(Array.from({ length: 20 }, () => requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(order.orderNo, "TRADE-001"),
    )));
    assert.ok(concurrentNotifies.every((item) => item.text === "success"));
    const replay = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(order.orderNo, "TRADE-001"));
    assert.equal(replay.text, "success");

    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
    const paid = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}`, { headers });
    assert.equal(paid.body.data.status, 1);
    assert.equal(paid.body.data.platformTransactionId, "TRADE-001");

    const differentTrade = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(order.orderNo, "TRADE-002"));
    assert.notEqual(differentTrade.text, "success");
    const unchanged = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(unchanged.body.data.balance, 150);

    const emptyTrade = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(order.orderNo, "", { trade_no: "" }));
    assert.notEqual(emptyTrade.text, "success");
  });
});

test("same Alipay trade number cannot settle a different order", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000101");
    const headers = authHeaders(user.token);
    const first = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    const second = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    assert.equal((await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(first.body.data.orderNo, "TRADE-CROSS"))).text, "success");
    const cross = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(second.body.data.orderNo, "TRADE-CROSS"));
    assert.notEqual(cross.text, "success");
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
  });
});

test("a locally closed order can still settle a later verified Alipay success", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000102");
    const headers = authHeaders(user.token);
    const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    const closed = await requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(created.body.data.orderNo, "TRADE-CLOSED", { trade_status: "TRADE_CLOSED" }),
    );
    assert.equal(closed.text, "success");
    const closedOrder = await requestJson(context.baseUrl, `/api/shumiao/order/${created.body.data.orderNo}`, { headers });
    assert.equal(closedOrder.body.data.status, 2);

    const lateSuccess = await requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(created.body.data.orderNo, "TRADE-LATE"),
    );
    assert.equal(lateSuccess.text, "success");
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
  });
});

test("payment negative paths never credit an account and return/query validation is explicit", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000103");
    const headers = authHeaders(user.token);
    const createOrder = async () => {
      const result = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
        method: "POST",
        headers,
        body: { packageId: "pkg_10" },
      });
      assert.equal(result.body.code, 200, JSON.stringify(result.body));
      return result.body.data;
    };
    const assertBalance = async (expected = 100) => {
      const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
      assert.equal(balance.body.data.balance, expected);
    };

    const invalidSignature = await createOrder();
    const badSignature = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(invalidSignature.orderNo, "TRADE-BAD-SIGN", { sign: "wrong" }));
    assert.equal(badSignature.response.status, 400);
    assert.equal(badSignature.text, "failure");

    const wrongApp = await createOrder();
    const wrongAppResponse = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(wrongApp.orderNo, "TRADE-BAD-APP", { app_id: "other-app" }));
    assert.equal(wrongAppResponse.response.status, 400);
    assert.equal(wrongAppResponse.text, "failure");

    const wrongSeller = await createOrder();
    const wrongSellerResponse = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(wrongSeller.orderNo, "TRADE-BAD-SELLER", { seller_id: "other-merchant" }));
    assert.equal(wrongSellerResponse.response.status, 400);
    assert.equal(wrongSellerResponse.text, "failure");

    const wrongAmount = await createOrder();
    const wrongAmountResponse = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(wrongAmount.orderNo, "TRADE-BAD-AMOUNT", { total_amount: "9.99" }));
    assert.equal(wrongAmountResponse.response.status, 400);
    assert.equal(wrongAmountResponse.text, "failure");

    await createOrder();
    const wrongOrderResponse = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields("RM-NOT-LOCAL", "TRADE-BAD-ORDER"));
    assert.equal(wrongOrderResponse.response.status, 400);
    assert.equal(wrongOrderResponse.text, "failure");

    const pending = await createOrder();
    const pendingResponse = await requestForm(context.baseUrl, "/api/shumiao/alipay/notify", notifyFields(pending.orderNo, "TRADE-PENDING", { trade_status: "WAIT_BUYER_PAY" }));
    assert.equal(pendingResponse.response.status, 200);
    assert.equal(pendingResponse.text, "success");
    const returned = await fetch(`${context.baseUrl}/pay/return?out_trade_no=${pending.orderNo}`);
    assert.equal(returned.status, 200);
    await assertBalance();
  });
});

async function assertQueryDoesNotCredit(env, phone) {
  await withServer({}, env, async (context) => {
    const user = await register(context, phone);
    const headers = authHeaders(user.token);
    const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10" },
    });
    const result = await requestJson(context.baseUrl, `/api/shumiao/order/${created.body.data.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(result.body.code, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.status, 0);
    assert.match(result.body.data.lastQueryStatus || "", /^ERROR:/);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });
}

test("active query rejects wrong order, wrong amount, missing trade number and SDK failure", async () => {
  await assertQueryDoesNotCredit({
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
    ALIPAY_TEST_QUERY_OUT_TRADE_NO: "RM-OTHER-ORDER",
  }, "13800000104");
  await assertQueryDoesNotCredit({
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
    ALIPAY_TEST_QUERY_AMOUNT: "9.99",
  }, "13800000105");
  await assertQueryDoesNotCredit({
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
    ALIPAY_TEST_QUERY_TRADE_NO: "",
  }, "13800000106");
  await assertQueryDoesNotCredit({
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
    ALIPAY_TEST_QUERY_ERROR: "1",
  }, "13800000107");
});

test("active query uses the local merchant boundary when Alipay omits optional identity fields", async () => {
  await withServer({}, {
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
    ALIPAY_TEST_QUERY_MERCHANT_ID: "",
    ALIPAY_TEST_QUERY_APP_ID: "",
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
  }, async (context) => {
    const user = await register(context, "13800000108");
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
});
