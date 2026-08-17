const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  createWxpayGateway,
  configFromEnv,
  decryptWxpayResource,
  encryptWxpayResource,
  mapWxpayTradeState,
  normalizeTradeResponse,
  verifyWxpaySignature,
  WXPAY_TEST_APP_ID,
  WXPAY_TEST_MCH_ID,
  WXPAY_TEST_API_V3_KEY,
} = require("../lib/wxpay-gateway");
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");

function testGateway(overrides = {}) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTestMode = process.env.WXPAY_TEST_MODE;
  process.env.NODE_ENV = "test";
  process.env.WXPAY_TEST_MODE = "1";
  try {
    return createWxpayGateway({ config: { ...configFromEnv(), ...overrides } });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTestMode === undefined) delete process.env.WXPAY_TEST_MODE;
    else process.env.WXPAY_TEST_MODE = previousTestMode;
  }
}

test("wxpay authorization header is a signed WECHATPAY2 token", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const { buildAuthorizationHeader } = require("../lib/wxpay-gateway");
  const header = buildAuthorizationHeader({
    method: "POST",
    pathname: "/v3/pay/transactions/native",
    body: { amount: { total: 1000, currency: "CNY" } },
    mchId: "1900000001",
    serialNo: "SERIAL",
    privateKey,
  });
  assert.match(header, /^WECHATPAY2-SHA256-RSA2048 /);
  const fields = Object.fromEntries(
    header.replace(/^WECHATPAY2-SHA256-RSA2048 /, "").split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value.replace(/^"|"$/g, "")];
    }),
  );
  assert.equal(fields.mchid, "1900000001");
  assert.equal(fields.serial_no, "SERIAL");
  const message = `POST\n/v3/pay/transactions/native\n${fields.timestamp}\n${fields.nonce_str}\n${JSON.stringify({ amount: { total: 1000, currency: "CNY" } })}\n`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  assert.equal(verifier.verify(publicKey, fields.signature, "base64"), true);
});

test("wxpay notification signature verification and AES-GCM resource round-trip", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const rawBody = JSON.stringify({ event_type: "TRANSACTION.SUCCESS" });
  const timestamp = "1700000000";
  const nonce = "abc123";
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  const signature = signer.sign(privateKey, "base64");
  assert.equal(verifyWxpaySignature({ timestamp, nonce, body: rawBody, signature, publicKey }), true);
  assert.equal(verifyWxpaySignature({ timestamp, nonce, body: rawBody + "x", signature, publicKey }), false);

  const nonce12 = "0123456789ab";
  const ciphertext = encryptWxpayResource({
    plainObject: { out_trade_no: "RM-1", amount: { total: 1000 } },
    nonce: nonce12,
    associated_data: "transaction",
    apiV3Key: WXPAY_TEST_API_V3_KEY,
  });
  const decrypted = decryptWxpayResource({
    ciphertext,
    nonce: nonce12,
    associated_data: "transaction",
    apiV3Key: WXPAY_TEST_API_V3_KEY,
  });
  assert.equal(decrypted.out_trade_no, "RM-1");
  assert.equal(decrypted.amount.total, 1000);
  assert.throws(() => decryptWxpayResource({
    ciphertext,
    nonce: nonce12,
    associated_data: "transaction",
    apiV3Key: "short",
  }), /32 字节/);
});

test("wxpay trade states normalize to the unified vocabulary", () => {
  assert.equal(mapWxpayTradeState("SUCCESS"), "TRADE_SUCCESS");
  assert.equal(mapWxpayTradeState("NOTPAY"), "WAIT_BUYER_PAY");
  assert.equal(mapWxpayTradeState("USERPAYING"), "WAIT_BUYER_PAY");
  assert.equal(mapWxpayTradeState("CLOSED"), "TRADE_CLOSED");
  assert.equal(mapWxpayTradeState("REVOKED"), "TRADE_CLOSED");
  assert.equal(mapWxpayTradeState("PAYERROR"), "TRADE_CLOSED");
  assert.equal(mapWxpayTradeState(""), "");
});

test("wxpay query responses normalize to the settlement contract", () => {
  const normalized = normalizeTradeResponse({
    out_trade_no: "RM-1",
    transaction_id: "WX-1",
    trade_state: "SUCCESS",
    amount: { total: 1000, currency: "CNY" },
    mchid: "1900000001",
    appid: "wxtest0000000000000000",
    success_time: "2026-08-03T12:00:00+08:00",
  });
  assert.deepEqual(normalized, {
    outTradeNo: "RM-1",
    tradeNo: "WX-1",
    totalAmount: "10.00",
    amountFen: 1000,
    tradeStatus: "TRADE_SUCCESS",
    sellerId: "1900000001",
    appId: "wxtest0000000000000000",
    gmtPayment: "2026-08-03T12:00:00+08:00",
  });
});

function withRealGatewayEnv(callback) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTestMode = process.env.WXPAY_TEST_MODE;
  process.env.NODE_ENV = "production";
  delete process.env.WXPAY_TEST_MODE;
  try {
    return callback();
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTestMode === undefined) delete process.env.WXPAY_TEST_MODE;
    else process.env.WXPAY_TEST_MODE = previousTestMode;
  }
}

test("real wxpay gateway signs native order requests and reads code_url", () => withRealGatewayEnv(async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/v3/pay/transactions/native")) {
      return new Response(JSON.stringify({ code_url: "weixin://wxpay/bizpayurl?pr=abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 500 });
  };
  const gateway = createWxpayGateway({
    config: {
      appId: "wxa1b2c3",
      mchId: "1900000002",
      serialNo: "SERIAL-2",
      privateKey: crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      }).privateKey,
      apiV3Key: WXPAY_TEST_API_V3_KEY,
      publicKey: "PUBLIC",
      gateway: "https://api.mch.weixin.qq.com",
      timeoutMs: 5000,
      notifyUrl: "https://example.test/wxpay/notify",
    },
    fetch: fetchImpl,
  });
  const codeUrl = await gateway.createQrCode({
    orderNo: "RM-REAL-1",
    amountCents: 1000,
    description: "积分充值 50 积分",
  });
  assert.equal(codeUrl, "weixin://wxpay/bizpayurl?pr=abc");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.headers.Authorization, /^WECHATPAY2-SHA256-RSA2048 /);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.out_trade_no, "RM-REAL-1");
  assert.equal(body.amount.total, 1000);
  assert.equal(body.amount.currency, "CNY");
  assert.equal(body.notify_url, "https://example.test/wxpay/notify");
}));

test("real wxpay gateway query handles success and 404 order-not-exist", () => withRealGatewayEnv(async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/v3/pay/transactions/out-trade-no/RM-REAL-2")) {
      return new Response(JSON.stringify({
        out_trade_no: "RM-REAL-2",
        transaction_id: "WX-REAL-2",
        trade_state: "SUCCESS",
        amount: { total: 500, currency: "CNY" },
        mchid: "1900000002",
        appid: "wxa1b2c3",
        success_time: "2026-08-03T12:00:00+08:00",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ code: "ORDER_NOT_EXIST" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  const gateway = createWxpayGateway({
    config: {
      appId: "wxa1b2c3",
      mchId: "1900000002",
      serialNo: "SERIAL-2",
      privateKey: crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      }).privateKey,
      apiV3Key: WXPAY_TEST_API_V3_KEY,
      publicKey: "PUBLIC",
      gateway: "https://api.mch.weixin.qq.com",
      timeoutMs: 5000,
      notifyUrl: "",
    },
    fetch: fetchImpl,
  });
  const paid = await gateway.queryOrder({ orderNo: "RM-REAL-2" });
  assert.equal(paid.tradeStatus, "TRADE_SUCCESS");
  assert.equal(paid.tradeNo, "WX-REAL-2");
  assert.equal(paid.amountFen, 500);
  const missing = await gateway.queryOrder({ orderNo: "RM-MISSING" });
  assert.equal(missing.tradeStatus, "TRADE_NOT_EXIST");
  assert.equal(missing.tradeNo, "");
}));

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

async function createWxpayOrder(context, headers, packageId = "pkg_10") {
  const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
    method: "POST",
    headers,
    body: { packageId, channel: "wxpay" },
  });
  assert.equal(created.body.code, 200, JSON.stringify(created.body));
  return created.body.data;
}

async function postWxpayNotify(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/shumiao/wxpay/notify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...payload.headers },
    body: payload.rawBody,
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body, text };
}

test("WeChat Pay order creation, notify settlement, idempotency and cross-order guards", async () => {
  await withServer({}, { WXPAY_TEST_MODE: "1" }, async (context) => {
    const user = await register(context, "13800000300");
    const headers = authHeaders(user.token);

    const order = await createWxpayOrder(context, headers);
    assert.equal(order.channel, "wxpay");
    assert.equal(order.amountCents, 1000);
    assert.equal(order.totalCount, 50);
    assert.match(order.codeUrl, /^weixin:\/\/wxpay\/bizpayurl/);
    assert.equal(order.payUrl, order.codeUrl);

    const records = await requestJson(context.baseUrl, "/api/shumiao/recharge-records?page=1&pageSize=10", { headers });
    assert.equal(records.body.data.list[0].channel, "wxpay");

    const gateway = testGateway();
    const payload = gateway.buildTestNotifyPayload({
      orderNo: order.orderNo,
      transactionId: "WX-TRADE-001",
      amountFen: 1000,
    });
    const first = await postWxpayNotify(context.baseUrl, payload);
    assert.equal(first.response.status, 200, first.text);
    assert.equal(first.body.code, "SUCCESS");

    const replay = await postWxpayNotify(context.baseUrl, payload);
    assert.equal(replay.response.status, 200, replay.text);
    assert.equal(replay.body.code, "SUCCESS");

    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
    const paid = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}`, { headers });
    assert.equal(paid.body.data.status, 1);
    assert.equal(paid.body.data.platformTransactionId, "WX-TRADE-001");

    // The same WeChat transaction id cannot settle a different order.
    const other = await createWxpayOrder(context, headers);
    const cross = await postWxpayNotify(context.baseUrl, gateway.buildTestNotifyPayload({
      orderNo: other.orderNo,
      transactionId: "WX-TRADE-001",
      amountFen: 1000,
    }));
    assert.equal(cross.response.status, 400, cross.text);
    assert.equal(cross.body.code, "FAIL");
    const unchanged = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(unchanged.body.data.balance, 150);
  });
});

test("WeChat Pay notify rejects bad signatures, wrong amount, wrong merchant and wrong app", async () => {
  await withServer({}, { WXPAY_TEST_MODE: "1" }, async (context) => {
    const user = await register(context, "13800000301");
    const headers = authHeaders(user.token);
    const gateway = testGateway();

    const order = await createWxpayOrder(context, headers);
    const badSignature = await postWxpayNotify(context.baseUrl, {
      ...gateway.buildTestNotifyPayload({ orderNo: order.orderNo, transactionId: "WX-BAD-SIGN", amountFen: 1000 }),
      headers: { "wechatpay-signature": "deadbeef" },
    });
    assert.equal(badSignature.response.status, 400);

    const wrongAmount = await postWxpayNotify(context.baseUrl, gateway.buildTestNotifyPayload({
      orderNo: order.orderNo,
      transactionId: "WX-BAD-AMOUNT",
      amountFen: 999,
    }));
    assert.equal(wrongAmount.response.status, 400);

    const wrongMerchant = testGateway({ mchId: "OTHER-MCH" });
    const wrongMch = await postWxpayNotify(context.baseUrl, wrongMerchant.buildTestNotifyPayload({
      orderNo: order.orderNo,
      transactionId: "WX-BAD-MCH",
      amountFen: 1000,
    }));
    assert.equal(wrongMch.response.status, 400);

    const wrongApp = testGateway({ appId: "OTHER-APP" });
    const wrongAppNotify = await postWxpayNotify(context.baseUrl, wrongApp.buildTestNotifyPayload({
      orderNo: order.orderNo,
      transactionId: "WX-BAD-APP",
      amountFen: 1000,
    }));
    assert.equal(wrongAppNotify.response.status, 400);

    const unknownOrder = await postWxpayNotify(context.baseUrl, gateway.buildTestNotifyPayload({
      orderNo: "RM-NOT-LOCAL",
      transactionId: "WX-BAD-ORDER",
      amountFen: 1000,
    }));
    assert.equal(unknownOrder.response.status, 400);

    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });
});

test("WeChat Pay closed notification closes the local order without crediting", async () => {
  await withServer({}, { WXPAY_TEST_MODE: "1" }, async (context) => {
    const user = await register(context, "13800000302");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const gateway = testGateway();
    const closed = await postWxpayNotify(context.baseUrl, gateway.buildTestNotifyPayload({
      orderNo: order.orderNo,
      transactionId: "WX-CLOSED-1",
      amountFen: 1000,
      tradeState: "CLOSED",
    }));
    assert.equal(closed.response.status, 200, closed.text);
    assert.equal(closed.body.code, "SUCCESS");
    const closedOrder = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}`, { headers });
    assert.equal(closedOrder.body.data.status, 2);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });
});

test("an Alipay notification cannot settle a WeChat order and vice versa", async () => {
  await withServer({}, { WXPAY_TEST_MODE: "1" }, async (context) => {
    const user = await register(context, "13800000303");
    const headers = authHeaders(user.token);

    const wxOrder = await createWxpayOrder(context, headers);
    const form = new URLSearchParams({
      out_trade_no: wxOrder.orderNo,
      trade_no: "TRADE-ALIPAY-1",
      trade_status: "TRADE_SUCCESS",
      total_amount: "10.00",
      seller_id: "test-merchant",
      app_id: "test-app",
      sign: "test-signature",
    });
    const alipayOnWx = await fetch(`${context.baseUrl}/api/shumiao/alipay/notify`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    assert.equal(await alipayOnWx.text(), "failure");
    const stillPending = await requestJson(context.baseUrl, `/api/shumiao/order/${wxOrder.orderNo}`, { headers });
    assert.equal(stillPending.body.data.status, 0);

    const gateway = testGateway();
    const alipayOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10", channel: "alipay" },
    });
    const wxOnAlipay = await postWxpayNotify(context.baseUrl, gateway.buildTestNotifyPayload({
      orderNo: alipayOrder.body.data.orderNo,
      transactionId: "WX-CROSS-CHANNEL",
      amountFen: 1000,
    }));
    assert.equal(wxOnAlipay.response.status, 400, wxOnAlipay.text);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });
});

test("active WeChat query settles verified success and never credits mismatches", async () => {
  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "SUCCESS",
  }, async (context) => {
    const user = await register(context, "13800000304");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.code, 200, JSON.stringify(queried.body));
    assert.equal(queried.body.data.status, 1);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 150);
  });

  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "SUCCESS",
    WXPAY_TEST_QUERY_OUT_TRADE_NO: "RM-OTHER-ORDER",
  }, async (context) => {
    const user = await register(context, "13800000305");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.code, 200, JSON.stringify(queried.body));
    assert.equal(queried.body.data.status, 0);
    assert.match(queried.body.data.lastQueryStatus || "", /^ERROR:/);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });

  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "SUCCESS",
    WXPAY_TEST_QUERY_AMOUNT_FEN: "999",
  }, async (context) => {
    const user = await register(context, "13800000306");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.data.status, 0);
    assert.match(queried.body.data.lastQueryStatus || "", /^ERROR:/);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });

  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "SUCCESS",
    WXPAY_TEST_QUERY_TRADE_NO: "",
  }, async (context) => {
    const user = await register(context, "13800000307");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.data.status, 0);
    assert.match(queried.body.data.lastQueryStatus || "", /^ERROR:/);
  });

  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "SUCCESS",
    WXPAY_TEST_QUERY_ERROR: "1",
  }, async (context) => {
    const user = await register(context, "13800000308");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.data.status, 0);
    assert.match(queried.body.data.lastQueryStatus || "", /^ERROR:/);
  });

  await withServer({}, {
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "WAIT_BUYER_PAY",
  }, async (context) => {
    const user = await register(context, "13800000309");
    const headers = authHeaders(user.token);
    const order = await createWxpayOrder(context, headers);
    const queried = await requestJson(context.baseUrl, `/api/shumiao/order/${order.orderNo}/query`, {
      method: "POST",
      headers,
    });
    assert.equal(queried.body.code, 200, JSON.stringify(queried.body));
    assert.equal(queried.body.data.status, 0);
    assert.equal(queried.body.data.lastQueryStatus, "WAIT_BUYER_PAY");
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balance.body.data.balance, 100);
  });
});

test("invalid channels are rejected and wxpay stays closed without test config", async () => {
  await withServer({}, { WXPAY_TEST_MODE: "1" }, async (context) => {
    const user = await register(context, "13800000310");
    const headers = authHeaders(user.token);
    const invalid = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10", channel: "paypal" },
    });
    assert.equal(invalid.body.code, 400, JSON.stringify(invalid.body));
    assert.equal(invalid.body.message, "不支持的支付方式");
  });

  // Without WXPAY_TEST_MODE the server never enables WeChat Pay in tests, so
  // an explicit wxpay order fails closed with 503 instead of calling WeChat.
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000311");
    const headers = authHeaders(user.token);
    const wxOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_10", channel: "wxpay" },
    });
    assert.equal(wxOrder.body.code, 503, JSON.stringify(wxOrder.body));
    assert.match(wxOrder.body.message, /微信支付暂未开启/);
  });
});
