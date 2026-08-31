const test = require("node:test");
const assert = require("node:assert/strict");
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");

async function register(context, phone = "13800000200") {
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone, password: "password123" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

async function createOrder(context, headers, packageId = "pkg_10", channel = "alipay") {
  const created = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
    method: "POST",
    headers,
    body: { packageId, channel },
  });
  assert.equal(created.body.code, 200, JSON.stringify(created.body));
  return created.body.data;
}

async function fetchBalance(context, headers) {
  const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
  assert.equal(balance.body.code, 200, JSON.stringify(balance.body));
  return balance.body.data.balance;
}

test("GET /recharge serves the recharge center single page", async () => {
  await withServer({}, {}, async (context) => {
    const response = await fetch(`${context.baseUrl}/recharge`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    const html = await response.text();
    assert.match(html, /magiorix/);
    assert.match(html, /app\.js/);
    assert.match(html, /style\.css/);
  });
});

test("GET /recharge/ (with trailing slash) serves the recharge center too", async () => {
  await withServer({}, {}, async (context) => {
    const response = await fetch(`${context.baseUrl}/recharge/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /app\.js/);
  });
});

test("Recharge frontend contracts enforce clean card layout, credit first, and amount second", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appJs = fs.readFileSync(path.join(__dirname, "../public/recharge/app.js"), "utf8");
  const styleCss = fs.readFileSync(path.join(__dirname, "../public/recharge/style.css"), "utf8");

  // 1. Removed unnecessary clutter cards and notes
  assert.doesNotMatch(appJs, /recharge-head-note/);
  assert.doesNotMatch(appJs, /balance-side/);
  assert.doesNotMatch(appJs, /确认订单前可随时返回重新选择/);
  assert.doesNotMatch(appJs, /package-title/);

  // 2. Package cards render credit (pointsDisplay) BEFORE amount (amountFormatted)
  const creditIndex = appJs.indexOf("<div class=\"package-credit\"><strong>' + pointsDisplay");
  const amountIndex = appJs.indexOf("<div class=\"package-amount\"><span>¥</span>' + amountFormatted");
  assert.ok(creditIndex > 0, "package-credit should be present");
  assert.ok(amountIndex > 0, "package-amount should be present");
  assert.ok(creditIndex < amountIndex, "package-credit must precede package-amount");

  // 3. Points formatting is base + extra when extra > 0, otherwise base
  assert.match(appJs, /extra > 0/);
  assert.ok(appJs.includes("fmtCount(pkg.baseCount) + '+' + fmtCount(extra)"));

  // 4. CSS typography hierarchy: package-credit is larger (28px) than package-amount (15px)
  assert.ok(styleCss.includes(".package-credit strong{font-size:28px"));
  assert.ok(styleCss.includes(".package-amount{margin-top:6px;color:#2c2022;font-size:15px"));
});

test("GET /pay/return renders the polling result page", async () => {
  await withServer({}, {}, async (context) => {
    const returned = await fetch(`${context.baseUrl}/pay/return?out_trade_no=RM-X`);
    assert.equal(returned.status, 200);
    assert.match(returned.headers.get("content-type") || "", /text\/html/);
    const html = await returned.text();
    assert.match(html, /支付结果/);
    assert.match(html, /magiorix-recharge-auth/);
    assert.match(html, /out_trade_no/);
    assert.match(returned.headers.get("content-security-policy") || "", /connect-src 'self'/);
  });
});

test("close pending order with definitive unpaid status closes it", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_QUERY_STATUS: "WAIT_BUYER_PAY",
  }, async (context) => {
    const user = await register(context, "13800000201");
    const headers = authHeaders(user.token);
    const created = await createOrder(context, headers);
    assert.equal(created.status, 0);

    const closed = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(closed.body.code, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.data.closed, true);
    assert.equal(closed.body.data.paidOnClose, undefined);
    assert.equal(closed.body.data.order.status, 2);
    assert.equal(closed.body.message, "订单已关闭");

    const balance = await fetchBalance(context, headers);
    assert.equal(balance, 100);
  });
});

test("close order that was already paid on the gateway credits the balance", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_QUERY_STATUS: "TRADE_SUCCESS",
  }, async (context) => {
    const user = await register(context, "13800000202");
    const headers = authHeaders(user.token);
    const created = await createOrder(context, headers);
    assert.equal(created.status, 0);

    const closed = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(closed.body.code, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.data.paidOnClose, true);
    assert.equal(closed.body.data.closed, undefined);
    assert.equal(closed.body.data.order.status, 1);
    assert.equal(closed.body.message, "订单已支付，积分已到账");

    const balance = await fetchBalance(context, headers);
    assert.equal(balance, 150);
  });
});

test("close order with gateway error never closes and keeps the order pending", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_QUERY_ERROR: "1",
  }, async (context) => {
    const user = await register(context, "13800000203");
    const headers = authHeaders(user.token);
    const created = await createOrder(context, headers);
    assert.equal(created.status, 0);

    const closed = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(closed.body.code, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.data.closed, undefined);
    assert.equal(closed.body.data.paidOnClose, undefined);
    assert.equal(closed.body.data.order.status, 0);
    assert.match(String(closed.body.data.order.lastQueryStatus || ""), /^ERROR:/);

    const balance = await fetchBalance(context, headers);
    assert.equal(balance, 100);
  });
});

test("close non-existent order returns 404", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000204");
    const headers = authHeaders(user.token);
    const closed = await requestJson(context.baseUrl, "/api/shumiao/order/RM-NOT-EXIST/close", {
      method: "POST",
      headers,
    });
    assert.equal(closed.body.code, 404);
    assert.equal(closed.body.message, "订单不存在");
  });
});

test("close already-processed order is idempotent", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_QUERY_STATUS: "WAIT_BUYER_PAY",
  }, async (context) => {
    const user = await register(context, "13800000205");
    const headers = authHeaders(user.token);
    const created = await createOrder(context, headers);

    const first = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(first.body.data.closed, true);

    const second = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(second.body.code, 200, JSON.stringify(second.body));
    assert.equal(second.body.message, "订单已处理，无需关闭");
    assert.equal(second.body.data.order.status, 2);
    assert.equal(second.body.data.closed, undefined);
  });
});

test("close pending wxpay order with definitive unpaid status closes it", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    WXPAY_TEST_MODE: "1",
    WXPAY_TEST_QUERY_STATE: "NOTPAY",
  }, async (context) => {
    const user = await register(context, "13800000206");
    const headers = authHeaders(user.token);
    const created = await createOrder(context, headers, "pkg_10", "wxpay");
    assert.equal(created.channel, "wxpay");
    assert.equal(created.status, 0);

    const closed = await requestJson(context.baseUrl, `/api/shumiao/order/${created.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(closed.body.code, 200, JSON.stringify(closed.body));
    assert.equal(closed.body.data.closed, true);
    assert.equal(closed.body.data.order.status, 2);
    assert.equal(closed.body.message, "订单已关闭");
  });
});
