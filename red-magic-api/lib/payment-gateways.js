const crypto = require("crypto");
const fs = require("fs");
const { buildAlipayPagePayForm } = require("./payment-crypto");

function readRequiredFile(envName) {
  const filePath = String(process.env[envName] || "").trim();
  if (!filePath) throw new Error(`${envName} 未配置`);
  return fs.readFileSync(filePath, "utf8");
}

function wechatConfig() {
  return {
    appId: String(process.env.WECHAT_PAY_APP_ID || "").trim(),
    merchantId: String(process.env.WECHAT_PAY_MCH_ID || "").trim(),
    merchantSerial: String(process.env.WECHAT_PAY_MCH_SERIAL_NO || "").trim(),
    privateKey: readRequiredFile("WECHAT_PAY_PRIVATE_KEY_PATH"),
    notifyUrl: String(process.env.WECHAT_PAY_NOTIFY_URL || "").trim(),
  };
}

function assertPresent(config, fields, label) {
  for (const field of fields) {
    if (!config[field]) throw new Error(`${label} ${field} 未配置`);
  }
}

async function createWechatNativeOrder({ orderNo, amountCents, description, expiresAt }) {
  const config = wechatConfig();
  assertPresent(config, ["appId", "merchantId", "merchantSerial", "notifyUrl"], "微信支付");
  if (process.env.NODE_ENV === "test" && process.env.PAYMENT_TEST_MODE === "1") {
    return { codeUrl: `weixin://wxpay/bizpayurl?pr=${orderNo}`, merchantId: config.merchantId, appId: config.appId };
  }
  const pathname = "/v3/pay/transactions/native";
  const body = JSON.stringify({
    appid: config.appId,
    mchid: config.merchantId,
    description,
    out_trade_no: orderNo,
    notify_url: config.notifyUrl,
    time_expire: expiresAt,
    amount: { total: amountCents, currency: "CNY" },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(`POST\n${pathname}\n${timestamp}\n${nonce}\n${body}\n`, "utf8"),
    config.privateKey,
  ).toString("base64");
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.merchantSerial}",signature="${signature}"`;
  const response = await fetch(`https://api.mch.weixin.qq.com${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
      "User-Agent": "magiorix-red-magic-api/1.1.9",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.code_url) {
    throw new Error(`微信支付下单失败：${result.message || response.status}`);
  }
  return { codeUrl: result.code_url, merchantId: config.merchantId, appId: config.appId };
}

function createAlipayPage({ orderNo, amountCents, subject, expiresAt }) {
  const appId = String(process.env.ALIPAY_APP_ID || "").trim();
  const merchantId = String(process.env.ALIPAY_SELLER_ID || "").trim();
  const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || "").trim();
  const returnUrl = String(process.env.ALIPAY_RETURN_URL || "").trim();
  const privateKey = readRequiredFile("ALIPAY_PRIVATE_KEY_PATH");
  assertPresent({ appId, merchantId, notifyUrl, returnUrl }, ["appId", "merchantId", "notifyUrl", "returnUrl"], "支付宝");
  return {
    html: buildAlipayPagePayForm({ appId, privateKey, notifyUrl, returnUrl, orderNo, amountCents, subject, expiresAt }),
    appId,
    merchantId,
  };
}

module.exports = {
  createAlipayPage,
  createWechatNativeOrder,
  readRequiredFile,
};
