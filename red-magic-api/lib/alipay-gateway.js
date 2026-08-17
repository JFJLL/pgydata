const fs = require("node:fs");
const path = require("node:path");

function readKey(envName) {
  const filePath = String(process.env[envName] || "").trim();
  if (!filePath) throw new Error(`${envName} 未配置`);
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function configFromEnv() {
  const testMode = process.env.NODE_ENV === "test" && process.env.ALIPAY_TEST_MODE === "1";
  return {
    appId: String(process.env.ALIPAY_APP_ID || (testMode ? process.env.ALIPAY_TEST_APP_ID : "") || "").trim(),
    merchantId: String(process.env.ALIPAY_SELLER_ID || (testMode ? process.env.ALIPAY_TEST_MERCHANT_ID : "") || "").trim(),
    gateway: String(process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do").trim(),
    notifyUrl: String(process.env.ALIPAY_NOTIFY_URL || `${process.env.BASE_URL || "https://magiorix.red-magic.cn"}/api/shumiao/alipay/notify`).trim(),
    returnUrl: String(process.env.ALIPAY_RETURN_URL || `${process.env.BASE_URL || "https://magiorix.red-magic.cn"}/pay/return`).trim(),
  };
}

function loadSdk(config) {
  let imported;
  try {
    imported = require("alipay-sdk");
  } catch {
    throw new Error("支付宝 SDK 未安装，请安装并锁定 alipay-sdk v4");
  }
  const AlipaySdk = imported.AlipaySdk
    || imported.default?.AlipaySdk
    || imported.default
    || (typeof imported === "function" ? imported : null);
  if (typeof AlipaySdk !== "function") throw new Error("支付宝 SDK 导出不兼容，未找到 AlipaySdk 构造函数");
  return new AlipaySdk({
    appId: config.appId,
    privateKey: readKey("ALIPAY_PRIVATE_KEY_PATH"),
    alipayPublicKey: readKey("ALIPAY_PUBLIC_KEY_PATH"),
    gateway: config.gateway,
  });
}

function unwrapResponse(result) {
  if (!result || typeof result !== "object") return {};
  const candidates = [
    result.alipay_trade_query_response,
    result.alipayTradeQueryResponse,
    result.response,
    result.body,
    result.data,
    result,
  ];
  return candidates.find((item) => item && typeof item === "object" && !Array.isArray(item)) || {};
}

function pick(source, ...keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") return source[key];
  }
  return "";
}

function normalizeTradeResponse(result) {
  const source = unwrapResponse(result);
  return {
    outTradeNo: String(pick(source, "out_trade_no", "outTradeNo")).trim(),
    tradeNo: String(pick(source, "trade_no", "tradeNo")).trim(),
    totalAmount: String(pick(source, "total_amount", "totalAmount")).trim(),
    tradeStatus: String(pick(source, "trade_status", "tradeStatus")).trim().toUpperCase(),
    sellerId: String(pick(source, "seller_id", "sellerId")).trim(),
    appId: String(pick(source, "app_id", "appId")).trim(),
    gmtPayment: String(pick(source, "gmt_payment", "gmtPayment")).trim(),
  };
}

function normalizeNotification(params) {
  return normalizeTradeResponse(params || {});
}

function assertRealConfig(config) {
  for (const [key, value] of Object.entries(config)) {
    if (["gateway", "notifyUrl", "returnUrl"].includes(key)) continue;
    if (!value) throw new Error(`支付宝 ${key} 未配置`);
  }
}

function createAlipayGateway({ config = configFromEnv(), sdk } = {}) {
  const testMode = process.env.NODE_ENV === "test" && process.env.ALIPAY_TEST_MODE === "1";
  const client = sdk || (!testMode ? loadSdk(config) : null);

  return {
    config,
    normalizeNotification,
    normalizeTradeResponse,
    async createPagePay({ orderNo, amountCents, subject, expiresAt }) {
      if (testMode) {
        return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>支付宝支付</title></head><body><main><h1>支付宝</h1><p>订单 ${String(orderNo).replace(/[<>]/g, "")}</p><p>金额 ${(Number(amountCents) / 100).toFixed(2)} 元</p><p>结果确认中</p></main></body></html>`;
      }
      assertRealConfig(config);
      if (typeof client.pageExecute !== "function") throw new Error("支付宝 SDK 不支持 pageExecute");
      const bizContent = {
        out_trade_no: orderNo,
        product_code: "FAST_INSTANT_TRADE_PAY",
        total_amount: (Number(amountCents) / 100).toFixed(2),
        subject,
        timeout_express: `${Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000))}m`,
      };
      return client.pageExecute("alipay.trade.page.pay", "GET", {
        bizContent,
        notifyUrl: config.notifyUrl,
        returnUrl: config.returnUrl,
      });
    },
    async createQrCode({ orderNo, amountCents, subject, expiresAt }) {
      if (testMode) {
        return `alipay-test://qrcode/${String(orderNo).replace(/[<>]/g, "")}`;
      }
      assertRealConfig(config);
      if (typeof client.exec !== "function") throw new Error("支付宝 SDK 不支持 exec");
      const result = await client.exec("alipay.trade.precreate", {
        bizContent: {
          out_trade_no: orderNo,
          total_amount: (Number(amountCents) / 100).toFixed(2),
          subject,
          timeout_express: `${Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000))}m`,
        },
        notifyUrl: config.notifyUrl,
      });
      const response = result?.alipay_trade_precreate_response
        || result?.response
        || result?.body
        || result
        || {};
      const qrCode = String(pick(response, "qr_code", "qrCode")).trim();
      if (!qrCode) {
        const reason = String(pick(response, "sub_msg", "subMsg", "msg") || "未知错误");
        throw new Error(`支付宝预下单失败：${reason}`);
      }
      return qrCode;
    },
    async verifyNotification(params) {
      if (testMode) return params?.sign === "test-signature";
      assertRealConfig(config);
      if (typeof client.checkNotifySign !== "function") throw new Error("支付宝 SDK 不支持通知验签");
      return Boolean(await client.checkNotifySign(params));
    },
    async queryTrade({ orderNo }) {
      if (testMode) {
        if (process.env.ALIPAY_TEST_QUERY_ERROR === "1") throw new Error("test query failure");
        const status = String(process.env.ALIPAY_TEST_QUERY_STATUS || "WAIT_BUYER_PAY").trim().toUpperCase();
        const hasConfiguredOutTradeNo = Object.prototype.hasOwnProperty.call(process.env, "ALIPAY_TEST_QUERY_OUT_TRADE_NO");
        const hasConfiguredTradeNo = Object.prototype.hasOwnProperty.call(process.env, "ALIPAY_TEST_QUERY_TRADE_NO");
        const hasConfiguredMerchantId = Object.prototype.hasOwnProperty.call(process.env, "ALIPAY_TEST_QUERY_MERCHANT_ID");
        const hasConfiguredAppId = Object.prototype.hasOwnProperty.call(process.env, "ALIPAY_TEST_QUERY_APP_ID");
        return normalizeTradeResponse({
          out_trade_no: hasConfiguredOutTradeNo ? process.env.ALIPAY_TEST_QUERY_OUT_TRADE_NO : orderNo,
          trade_no: isSuccessfulTradeStatus(status)
            ? (hasConfiguredTradeNo ? process.env.ALIPAY_TEST_QUERY_TRADE_NO : `QUERY-${orderNo}`)
            : "",
          trade_status: status,
          total_amount: String(process.env.ALIPAY_TEST_QUERY_AMOUNT || "10.00"),
          seller_id: hasConfiguredMerchantId
            ? process.env.ALIPAY_TEST_QUERY_MERCHANT_ID
            : String(process.env.ALIPAY_TEST_MERCHANT_ID || "test-merchant"),
          app_id: hasConfiguredAppId
            ? process.env.ALIPAY_TEST_QUERY_APP_ID
            : String(process.env.ALIPAY_TEST_APP_ID || "test-app"),
          gmt_payment: "2026-08-03 12:00:00",
        });
      }
      assertRealConfig(config);
      if (typeof client.exec !== "function") throw new Error("支付宝 SDK 不支持 exec");
      const result = await client.exec(
        "alipay.trade.query",
        { bizContent: { out_trade_no: orderNo } },
        { validateSign: true },
      );
      return normalizeTradeResponse(result);
    },
  };
}

function isSuccessfulTradeStatus(status) {
  return ["TRADE_SUCCESS", "TRADE_FINISHED"].includes(String(status || "").trim().toUpperCase());
}

module.exports = {
  configFromEnv,
  createAlipayGateway,
  isSuccessfulTradeStatus,
  normalizeNotification,
  normalizeResponse: normalizeTradeResponse,
  normalizeTradeResponse,
};
