const test = require("node:test");
const assert = require("node:assert/strict");
const { authHeaders, requestJson, requestForm, withServer } = require("./api-test-helpers");

async function register(context, phone = "13800000300") {
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone, password: "password123" },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

function notifyFields(outTradeNo, tradeNo, overrides = {}) {
  return {
    app_id: "test-app",
    seller_id: "test-merchant",
    out_trade_no: outTradeNo,
    trade_no: tradeNo,
    total_amount: "50.00",
    trade_status: "TRADE_SUCCESS",
    gmt_payment: "2026-08-01 12:00:00",
    sign: "test-signature",
    ...overrides,
  };
}

test("GET /api/shumiao/packages returns 5 tiered packages with accurate first recharge bonus", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000301");
    const headers = authHeaders(user.token);

    const res = await requestJson(context.baseUrl, "/api/shumiao/packages", { headers });
    assert.equal(res.body.code, 200);
    const pkgs = res.body.data;
    assert.equal(pkgs.length, 5);

    const expected = [
      { id: "pkg_10", amountCents: 1000, baseCount: 50, giftCount: 0, regularTotalCount: 50, promoCount: 0, payableTotalCount: 50, recommended: false, scene: "轻量体验" },
      { id: "pkg_50", amountCents: 5000, baseCount: 250, giftCount: 30, regularTotalCount: 280, promoCount: 50, payableTotalCount: 330, recommended: false, scene: "灵活补充" },
      { id: "pkg_100", amountCents: 10000, baseCount: 500, giftCount: 100, regularTotalCount: 600, promoCount: 100, payableTotalCount: 700, recommended: true, scene: "高频推荐" },
      { id: "pkg_500", amountCents: 50000, baseCount: 2500, giftCount: 800, regularTotalCount: 3300, promoCount: 300, payableTotalCount: 3600, recommended: false, scene: "持续创作" },
      { id: "pkg_1000", amountCents: 100000, baseCount: 5000, giftCount: 2000, regularTotalCount: 7000, promoCount: 300, payableTotalCount: 7300, recommended: false, scene: "团队与高频使用" },
    ];

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const act = pkgs[i];
      assert.equal(act.id, exp.id);
      assert.equal(act.amountCents, exp.amountCents);
      assert.equal(act.baseCount, exp.baseCount);
      assert.equal(act.giftCount, exp.giftCount);
      assert.equal(act.regularTotalCount, exp.regularTotalCount);
      assert.equal(act.promotionCount, exp.promoCount);
      assert.equal(act.payableTotalCount, exp.payableTotalCount);
      assert.equal(act.recommended, exp.recommended);
      assert.equal(act.scene, exp.scene);
      assert.equal(act.firstRechargeEligible, true);
    }
  });
});

test("POST /api/shumiao/recharge freezes first recharge snapshot and creates correct order", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000302");
    const headers = authHeaders(user.token);

    // 100元首次充值
    const created100 = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_100", channel: "alipay" },
    });
    assert.equal(created100.body.code, 200);
    const order100 = created100.body.data;
    assert.equal(order100.amountCents, 10000);
    assert.equal(order100.baseCount, 500);
    assert.equal(order100.giftCount, 100);
    assert.equal(order100.promotionCode, "first_recharge_v1");
    assert.equal(order100.promotionCount, 100);
    assert.equal(order100.totalCount, 700);

    // 查询订单详情也带快照
    const detail = await requestJson(context.baseUrl, `/api/shumiao/order/${order100.orderNo}`, { headers });
    assert.equal(detail.body.data.promotionCode, "first_recharge_v1");
    assert.equal(detail.body.data.promotionCount, 100);
    assert.equal(detail.body.data.totalCount, 700);
  });
});

test("First recharge promo concurrency and pending conflict protection", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000303");
    const headers = authHeaders(user.token);

    // 创建第一笔首充优惠订单（未支付）
    const firstOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_100", channel: "alipay" },
    });
    assert.equal(firstOrder.body.code, 200);

    // 当已有待支付首充订单时，再次发起首充订单返回 409 明确冲突
    const secondOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_50", channel: "alipay" },
    });
    assert.equal(secondOrder.body.code, 409, JSON.stringify(secondOrder.body));
    assert.match(secondOrder.body.message, /待支付的首充优惠订单/);

    // 关闭第一笔订单
    const closeRes = await requestJson(context.baseUrl, `/api/shumiao/order/${firstOrder.body.data.orderNo}/close`, {
      method: "POST",
      headers,
    });
    assert.equal(closeRes.body.data.closed, true);

    // 资格恢复，可以重新创建首充订单
    const thirdOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_50", channel: "alipay" },
    });
    assert.equal(thirdOrder.body.code, 200);
    assert.equal(thirdOrder.body.data.promotionCount, 50);
    assert.equal(thirdOrder.body.data.totalCount, 330);
  });
});

test("After first recharge is paid, subsequent orders and package list lose first promo", async () => {
  await withServer({}, {
    ALIPAY_TEST_MODE: "1",
    ALIPAY_TEST_MERCHANT_ID: "test-merchant",
    ALIPAY_TEST_APP_ID: "test-app",
  }, async (context) => {
    const user = await register(context, "13800000304");
    const headers = authHeaders(user.token);

    // 充值 50 元首充
    const order = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_50", channel: "alipay" },
    });
    assert.equal(order.body.data.totalCount, 330);

    // 支付成功回调通知
    const notifyRes = await requestForm(
      context.baseUrl,
      "/api/shumiao/alipay/notify",
      notifyFields(order.body.data.orderNo, "TRADE-PROMO-001", { total_amount: "50.00" }),
    );
    assert.equal(notifyRes.text, "success");

    const balanceRes = await requestJson(context.baseUrl, "/api/shumiao/balance", { headers });
    assert.equal(balanceRes.body.data.balance, 100 + 330); // 初始100 + 首充330

    // 套餐列表变为非首充
    const pkgsRes = await requestJson(context.baseUrl, "/api/shumiao/packages", { headers });
    const pkgs = pkgsRes.body.data;
    for (const p of pkgs) {
      assert.equal(p.firstRechargeEligible, false);
      assert.equal(p.promotionCount, 0);
      assert.equal(p.payableTotalCount, p.regularTotalCount);
    }

    // 再次创建 100 元订单，无首充加赠
    const nextOrder = await requestJson(context.baseUrl, "/api/shumiao/recharge", {
      method: "POST",
      headers,
      body: { packageId: "pkg_100", channel: "alipay" },
    });
    assert.equal(nextOrder.body.data.promotionCode, null);
    assert.equal(nextOrder.body.data.promotionCount, 0);
    assert.equal(nextOrder.body.data.totalCount, 600);
  });
});
