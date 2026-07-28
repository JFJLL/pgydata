const assert = require("node:assert/strict");
const crypto = require("crypto");
const { after, before, describe, test } = require("node:test");
const { alipayCanonicalPayload } = require("../lib/payment-crypto");
const { startApi } = require("./api-test-helpers");

let fixture;
let phoneSequence = 10;
const password = "TestPass123";

function nextPhone() {
  phoneSequence += 1;
  return `1390000${String(phoneSequence).padStart(4, "0")}`;
}

async function sendCode(phone, purpose = "register") {
  return fixture.api("/api/auth/sms/send", { method: "POST", body: { phone, purpose } });
}

async function register(phone = nextPhone()) {
  assert.equal((await sendCode(phone)).data.code, 200);
  const result = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
  assert.equal(result.data.code, 200);
  return { phone, token: result.data.data.token };
}

async function balance(token) {
  const result = await fixture.api("/api/shumiao/balance", { headers: { satoken: token } });
  assert.equal(result.data.code, 200);
  return result.data.data.balance;
}

async function createOrder(token, packageId = "points_1000") {
  const result = await fixture.api("/api/shumiao/recharge", { method: "POST", headers: { satoken: token }, body: { packageId } });
  assert.equal(result.data.code, 200);
  return { ...result.data.data, token: new URL(result.data.data.payUrl).pathname.split("/").pop() };
}

function encryptWechatResource(payload) {
  const key = Buffer.from("12345678901234567890123456789012");
  const nonce = "0123456789ab";
  const associatedData = "transaction";
  const cipher = crypto.createCipheriv("aes-256-gcm", key, Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString("base64");
  return { algorithm: "AEAD_AES_256_GCM", ciphertext, nonce, associated_data: associatedData };
}

async function wechatNotify(payload, validSignature = true) {
  const body = JSON.stringify({ id: crypto.randomUUID(), event_type: "TRANSACTION.SUCCESS", resource: encryptWechatResource(payload) });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(8).toString("hex");
  let signature = crypto.sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), fixture.privateKey).toString("base64");
  if (!validSignature) signature = `${signature.slice(0, -2)}xx`;
  return fixture.api("/order", { method: "POST", body, headers: {
    "Content-Type": "application/json",
    "Wechatpay-Timestamp": timestamp,
    "Wechatpay-Nonce": nonce,
    "Wechatpay-Signature": signature,
    "Wechatpay-Serial": "platform-serial",
  } });
}

function alipayBody(params, validSignature = true) {
  const sign = crypto.sign("RSA-SHA256", Buffer.from(alipayCanonicalPayload(params)), fixture.privateKey).toString("base64");
  return new URLSearchParams({ ...params, sign: validSignature ? sign : `${sign.slice(0, -2)}xx`, sign_type: "RSA2" }).toString();
}

describe("magiorix 1.1.9 auth and payment", { concurrency: false }, () => {
  before(async () => { fixture = await startApi(); });
  after(async () => { await fixture.stop(); });

  test("短信发送返回 5 分钟有效期且不返回验证码", async () => {
    const result = await sendCode(nextPhone());
    assert.equal(result.data.code, 200);
    assert.deepEqual(result.data.data, { expiresIn: 300, retryAfter: 60 });
  });

  test("同手机号 60 秒内不能重发", async () => {
    const phone = nextPhone();
    assert.equal((await sendCode(phone)).data.code, 200);
    const repeated = await sendCode(phone);
    assert.equal(repeated.data.code, 429);
    assert.ok(repeated.data.data.retryAfter > 0);
  });

  test("过期验证码不能注册且不创建用户", async () => {
    const phone = nextPhone();
    await sendCode(phone);
    await fixture.dbRun("UPDATE sms_codes SET expires_at = ? WHERE phone = ?", [new Date(Date.now() - 1000).toISOString(), phone]);
    const result = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
    assert.equal(result.data.code, 400);
    assert.match(result.data.message, /过期/);
    const legacy = await fixture.api("/api/auth/sms/login", { method: "POST", body: { phone, password } });
    assert.match(legacy.data.message, /不存在/);
  });

  test("错误验证码不消费正确验证码", async () => {
    const phone = nextPhone();
    await sendCode(phone);
    const wrong = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "9999", password } });
    assert.equal(wrong.data.code, 400);
    const right = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
    assert.equal(right.data.code, 200);
  });

  test("验证码连续错误 5 次后锁定且正确码也不能使用", async () => {
    const phone = nextPhone();
    await sendCode(phone);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "9999", password } });
      assert.equal(wrong.data.code, 400);
    }
    const locked = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
    assert.equal(locked.data.code, 429);
    assert.match(locked.data.message, /错误次数过多/);
  });

  test("并发 20 次错误验证码无 500 且最多 5 次进入校验", async () => {
    const phone = nextPhone();
    await sendCode(phone);
    const attempts = await Promise.all(Array.from({ length: 20 }, () => fixture.api("/api/auth/register", {
      method: "POST",
      body: { phone, code: "9999", password },
    })));
    const codes = attempts.map((item) => item.data.code);
    assert.equal(codes.filter((codeValue) => codeValue === 400).length, 5);
    assert.equal(codes.filter((codeValue) => codeValue === 429).length, 15);
    assert.equal(codes.filter((codeValue) => codeValue === 500).length, 0);
    const correct = await fixture.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
    assert.equal(correct.data.code, 429);
  });

  test("验证码一次性且重置密码撤销旧 token", async () => {
    const user = await register();
    await fixture.dbRun("UPDATE sms_codes SET created_at = ? WHERE phone = ?", [new Date(Date.now() - 61000).toISOString(), user.phone]);
    assert.equal((await sendCode(user.phone, "reset_password")).data.code, 200);
    const reset = await fixture.api("/api/auth/password/reset", { method: "POST", body: { phone: user.phone, code: "1234", newPassword: "ChangedPass123" } });
    assert.equal(reset.data.code, 200);
    const replay = await fixture.api("/api/auth/password/reset", { method: "POST", body: { phone: user.phone, code: "1234", newPassword: "AnotherPass123" } });
    assert.equal(replay.data.code, 400);
    assert.equal((await fixture.api("/api/auth/info", { headers: { satoken: user.token } })).data.code, 401);
    assert.equal((await fixture.api("/api/auth/login", { method: "POST", body: { phone: user.phone, password: "ChangedPass123" } })).data.code, 200);
  });

  test("重复手机号不能注册", async () => {
    const user = await register();
    const result = await sendCode(user.phone);
    assert.equal(result.data.code, 409);
  });

  test("旧短信登录接口不再无验证码建号", async () => {
    const result = await fixture.api("/api/auth/sms/login", { method: "POST", body: { phone: nextPhone(), password } });
    assert.equal(result.data.code, 400);
    assert.match(result.data.message, /先使用验证码注册/);
  });

  test("新用户初始积分为 100 且密码登录兼容", async () => {
    const user = await register();
    assert.equal(await balance(user.token), 100);
    assert.equal((await fixture.api("/api/auth/login", { method: "POST", body: { phone: user.phone, password } })).data.code, 200);
  });

  test("只返回四个整数分新套餐", async () => {
    const user = await register();
    const result = await fixture.api("/api/shumiao/packages", { headers: { satoken: user.token } });
    assert.deepEqual(result.data.data.map(({ amountCents, totalCount }) => [amountCents, totalCount]), [[1000, 50], [10000, 550], [50000, 2800], [100000, 6000]]);
  });

  test("微信非法签名不入账", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    assert.equal((await fixture.api(`/pay/${order.token}/wechat`)).response.status, 200);
    const result = await wechatNotify({ appid: "wx-test-app", mchid: "wx-test-merchant", out_trade_no: order.orderNo, transaction_id: "wx-bad-sign", trade_state: "SUCCESS", amount: { total: 1000 } }, false);
    assert.equal(result.response.status, 401);
    assert.equal(await balance(user.token), 100);
  });

  test("微信错金额不入账", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.api(`/pay/${order.token}/wechat`);
    const result = await wechatNotify({ appid: "wx-test-app", mchid: "wx-test-merchant", out_trade_no: order.orderNo, transaction_id: "wx-wrong-amount", trade_state: "SUCCESS", amount: { total: 999 } });
    assert.equal(result.response.status, 400);
    assert.equal(await balance(user.token), 100);
  });

  test("微信合法通知重放两次只到账一次", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.api(`/pay/${order.token}/wechat`);
    const payload = { appid: "wx-test-app", mchid: "wx-test-merchant", out_trade_no: order.orderNo, transaction_id: "wx-valid-replay", trade_state: "SUCCESS", amount: { total: 1000 } };
    const [first, replay] = await Promise.all([wechatNotify(payload), wechatNotify(payload)]);
    assert.equal(first.response.status, 200);
    assert.equal(replay.response.status, 200);
    assert.equal(await balance(user.token), 150);
  });

  test("过期订单收到合法通知也不入账", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.api(`/pay/${order.token}/wechat`);
    await fixture.dbRun("UPDATE recharge_orders SET expires_at = ? WHERE order_no = ?", [new Date(Date.now() - 1000).toISOString(), order.orderNo]);
    const result = await wechatNotify({ appid: "wx-test-app", mchid: "wx-test-merchant", out_trade_no: order.orderNo, transaction_id: "wx-expired", trade_state: "SUCCESS", amount: { total: 1000 } });
    assert.equal(result.response.status, 400);
    assert.equal(await balance(user.token), 100);
  });

  test("查询过期 pending 订单会关闭并停止继续轮询", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.dbRun("UPDATE recharge_orders SET expires_at = ? WHERE order_no = ?", [new Date(Date.now() - 1000).toISOString(), order.orderNo]);
    const result = await fixture.api(`/api/shumiao/order/${order.orderNo}`, { headers: { satoken: user.token } });
    assert.equal(result.data.data.status, 2);
    assert.match(result.data.data.failedReason, /过期/);
    assert.equal(await balance(user.token), 100);
  });

  test("支付宝非法签名不入账", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    assert.equal((await fixture.api(`/pay/${order.token}/alipay`)).response.status, 200);
    const params = { app_id: "alipay-test-app", seller_id: "alipay-test-seller", out_trade_no: order.orderNo, trade_no: "ali-bad-sign", trade_status: "TRADE_SUCCESS", total_amount: "10.00" };
    const result = await fixture.api("/order/alipay/notify", { method: "POST", body: alipayBody(params, false), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(result.response.status, 400);
    assert.equal(await balance(user.token), 100);
  });

  test("支付宝缺少 seller ID 时在付款前拒绝创建支付页", async () => {
    const isolated = await startApi({ ALIPAY_SELLER_ID: "" });
    try {
      const phone = nextPhone();
      assert.equal((await isolated.api("/api/auth/sms/send", { method: "POST", body: { phone, purpose: "register" } })).data.code, 200);
      const registered = await isolated.api("/api/auth/register", { method: "POST", body: { phone, code: "1234", password } });
      const order = await isolated.api("/api/shumiao/recharge", {
        method: "POST",
        headers: { satoken: registered.data.data.token },
        body: { packageId: "points_1000" },
      });
      const payToken = new URL(order.data.data.payUrl).pathname.split("/").pop();
      const page = await isolated.api(`/pay/${payToken}/alipay`);
      assert.equal(page.response.status, 503);
      assert.match(page.data, /暂未配置/);
    } finally {
      await isolated.stop();
    }
  });

  test("支付宝支付页使用本地订单剩余有效期而非重新计满 30 分钟", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.dbRun("UPDATE recharge_orders SET expires_at = ? WHERE order_no = ?", [new Date(Date.now() + 10 * 60 * 1000).toISOString(), order.orderNo]);
    const page = await fixture.api(`/pay/${order.token}/alipay`);
    assert.equal(page.response.status, 200);
    assert.match(page.data, /timeout_express/);
    assert.doesNotMatch(page.data, /30m/);
  });

  test("支付宝错金额不入账", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.api(`/pay/${order.token}/alipay`);
    const params = { app_id: "alipay-test-app", seller_id: "alipay-test-seller", out_trade_no: order.orderNo, trade_no: "ali-wrong-amount", trade_status: "TRADE_SUCCESS", total_amount: "9.99" };
    const result = await fixture.api("/order/alipay/notify", { method: "POST", body: alipayBody(params), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(result.response.status, 400);
    assert.equal(await balance(user.token), 100);
  });

  test("支付宝合法通知重放两次只到账一次", async () => {
    const user = await register();
    const order = await createOrder(user.token);
    await fixture.api(`/pay/${order.token}/alipay`);
    const params = { app_id: "alipay-test-app", seller_id: "alipay-test-seller", out_trade_no: order.orderNo, trade_no: "ali-valid-replay", trade_status: "TRADE_SUCCESS", total_amount: "10.00" };
    const body = alipayBody(params);
    assert.equal((await fixture.api("/order/alipay/notify", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).response.status, 200);
    assert.equal((await fixture.api("/order/alipay/notify", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).response.status, 200);
    assert.equal(await balance(user.token), 150);
  });
});
