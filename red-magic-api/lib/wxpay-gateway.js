const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// WeChat Pay (V3 NATIVE) provider adapter, mirroring the reference project's
// raw-crypto implementation. No third-party SDK is required.
//
// Test mode (NODE_ENV=test && WXPAY_TEST_MODE=1) swaps the outbound calls for
// deterministic fake responses and accepts HMAC-signed test notifications,
// mirroring ALIPAY_TEST_MODE so the full order -> notify -> settle pipeline can
// run in the test suite without touching WeChat.

const WXPAY_TEST_SIGN_KEY = "red-magic-test-wxpay-sign-key-v1";
const WXPAY_TEST_APP_ID = "wxtest0000000000000000";
const WXPAY_TEST_MCH_ID = "1900000001";
const WXPAY_TEST_API_V3_KEY = "0123456789abcdef0123456789abcdef";
const DEFAULT_GATEWAY = "https://api.mch.weixin.qq.com";

function readKey(envName, inlineEnvName) {
  const filePath = String(process.env[envName] || "").trim();
  if (filePath) return fs.readFileSync(path.resolve(filePath), "utf8");
  return String(process.env[inlineEnvName] || "").trim();
}

function normalizePemKey(rawKey, defaultType) {
  const key = String(rawKey || "").trim();
  if (!key) return "";
  if (key.includes("-----BEGIN")) return key;
  const clean = key.replace(/\s+/g, "");
  const chunks = clean.match(/.{1,64}/g);
  if (!chunks) return key;
  return `-----BEGIN ${defaultType}-----\n${chunks.join("\n")}\n-----END ${defaultType}-----`;
}

function fenToYuanString(fen) {
  const value = Number(fen);
  if (!Number.isSafeInteger(value) || value < 0) return "0.00";
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function safeTimingEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function buildAuthorizationHeader({ method, pathname, body = "", mchId, serialNo, privateKey }) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const payload = typeof body === "object" && body !== null ? JSON.stringify(body) : String(body || "");
  const message = `${String(method).toUpperCase()}\n${pathname}\n${timestamp}\n${nonceStr}\n${payload}\n`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  const signature = signer.sign(privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

function verifyWxpaySignature({ timestamp, nonce, body = "", signature, publicKey }) {
  if (!timestamp || !nonce || !signature || !publicKey) return false;
  const message = `${String(timestamp)}\n${String(nonce)}\n${String(body || "")}\n`;
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(message);
    return verifier.verify(publicKey, String(signature), "base64");
  } catch (error) {
    return false;
  }
}

function decryptWxpayResource({ ciphertext, nonce, associated_data = "", apiV3Key }) {
  const keyBuffer = Buffer.from(String(apiV3Key || ""), "utf8");
  if (keyBuffer.length !== 32) {
    throw new Error("微信支付回调解密失败：APIv3 密钥长度必须为 32 字节");
  }
  const ciphertextBuffer = Buffer.from(String(ciphertext || ""), "base64");
  if (ciphertextBuffer.length < 16) {
    throw new Error("微信支付回调解密失败：密文长度非法");
  }
  const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
  const data = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, Buffer.from(String(nonce || ""), "utf8"));
  decipher.setAuthTag(authTag);
  if (associated_data) decipher.setAAD(Buffer.from(String(associated_data), "utf8"));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function encryptWxpayResource({ plainObject, nonce, associated_data = "", apiV3Key }) {
  const keyBuffer = Buffer.from(String(apiV3Key || ""), "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, Buffer.from(String(nonce || ""), "utf8"));
  if (associated_data) cipher.setAAD(Buffer.from(String(associated_data), "utf8"));
  const textPayload = typeof plainObject === "string" ? plainObject : JSON.stringify(plainObject);
  const ciphertext = Buffer.concat([cipher.update(textPayload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, authTag]).toString("base64");
}

// Maps the WeChat wire trade_state onto the unified status vocabulary used by
// settlement/reconciliation (SUCCESS -> TRADE_SUCCESS etc).
function mapWxpayTradeState(tradeState) {
  const state = String(tradeState || "").toUpperCase();
  if (state === "SUCCESS") return "TRADE_SUCCESS";
  if (state === "NOTPAY" || state === "USERPAYING") return "WAIT_BUYER_PAY";
  if (state === "CLOSED" || state === "REVOKED" || state === "PAYERROR") return "TRADE_CLOSED";
  return state;
}

function configFromEnv() {
  const testMode = process.env.NODE_ENV === "test" && process.env.WXPAY_TEST_MODE === "1";
  return {
    appId: String(
      process.env.WXPAY_APP_ID
      || (testMode ? WXPAY_TEST_APP_ID : "")
      || ""
    ).trim(),
    mchId: String(
      process.env.WXPAY_MCH_ID
      || (testMode ? WXPAY_TEST_MCH_ID : "")
      || ""
    ).trim(),
    serialNo: String(process.env.WXPAY_SERIAL_NO || "").trim(),
    privateKey: normalizePemKey(readKey("WXPAY_PRIVATE_KEY_PATH", "WXPAY_PRIVATE_KEY"), "PRIVATE KEY"),
    apiV3Key: String(process.env.WXPAY_API_V3_KEY || (testMode ? WXPAY_TEST_API_V3_KEY : "") || "").trim(),
    publicKeyId: String(process.env.WXPAY_PUBLIC_KEY_ID || "").trim(),
    publicKey: normalizePemKey(readKey("WXPAY_PUBLIC_KEY_PATH", "WXPAY_PUBLIC_KEY"), "PUBLIC KEY"),
    gateway: String(process.env.WXPAY_GATEWAY || DEFAULT_GATEWAY).trim().replace(/\/+$/, ""),
    timeoutMs: Number(process.env.WXPAY_TIMEOUT_MS || 5000),
    notifyUrl: String(
      process.env.WXPAY_NOTIFY_URL
      || `${process.env.BASE_URL || "https://magiorix.red-magic.cn"}/api/shumiao/wxpay/notify`
    ).trim(),
  };
}

function assertRealConfig(config) {
  const required = ["appId", "mchId", "serialNo", "privateKey", "apiV3Key", "publicKey"];
  for (const key of required) {
    if (!String(config[key] || "").trim()) throw new Error(`微信支付 ${key} 未配置`);
  }
}

function normalizeTradeResponse(data) {
  const source = data || {};
  const amountFen = Number(source.amount?.total ?? source.amount_fen ?? 0);
  const rawState = String(source.trade_state ?? source.tradeState ?? source.trade_status ?? "").toUpperCase();
  return {
    outTradeNo: String(source.out_trade_no ?? source.outTradeNo ?? "").trim(),
    tradeNo: String(source.transaction_id ?? source.transactionId ?? source.trade_no ?? "").trim(),
    totalAmount: fenToYuanString(amountFen),
    amountFen,
    tradeStatus: mapWxpayTradeState(rawState),
    sellerId: String(source.mchid ?? source.mchId ?? "").trim(),
    appId: String(source.appid ?? source.appId ?? "").trim(),
    gmtPayment: String(source.success_time ?? source.successTime ?? "").trim(),
  };
}

function normalizeNotification(data) {
  return normalizeTradeResponse(data);
}

function createWxpayGateway({ config = configFromEnv(), fetch: fetchImpl } = {}) {
  const testMode = process.env.NODE_ENV === "test" && process.env.WXPAY_TEST_MODE === "1";
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (...args) => globalThis.fetch(...args);

  async function request(method, pathname, body = null) {
    const url = `${config.gateway}${pathname}`;
    const payload = body !== null ? JSON.stringify(body) : "";
    const authHeader = buildAuthorizationHeader({
      method,
      pathname,
      body: payload,
      mchId: config.mchId,
      serialNo: config.serialNo,
      privateKey: config.privateKey,
    });
    const headers = {
      Accept: "application/json",
      Authorization: authHeader,
      "User-Agent": "red-magic-wxpay/1.0",
    };
    if (payload) headers["Content-Type"] = "application/json";

    const response = await doFetch(url, {
      method,
      headers,
      body: payload || undefined,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { raw: text };
      }
    }
    return { status: response.status, ok: response.ok, data };
  }

  const gateway = {
    config,
    normalizeNotification,
    normalizeTradeResponse,
    mapWxpayTradeState,
    async createQrCode({ orderNo, amountCents, description = "积分充值", notifyUrl }) {
      if (testMode) {
        return `weixin://wxpay/bizpayurl?pr=fake-${encodeURIComponent(orderNo)}`;
      }
      assertRealConfig(config);
      const res = await request("POST", "/v3/pay/transactions/native", {
        appid: config.appId,
        mchid: config.mchId,
        description,
        out_trade_no: orderNo,
        notify_url: notifyUrl || config.notifyUrl,
        amount: { total: Number(amountCents), currency: "CNY" },
      });
      if (!res.ok || !res.data?.code_url) {
        const detail = res.data?.message || res.data?.code || `HTTP ${res.status}`;
        throw new Error(`微信支付扫码下单失败：${detail}`);
      }
      return String(res.data.code_url);
    },
    async verifyNotify({ headers, rawBody }) {
      const signature = headers?.["wechatpay-signature"] || headers?.["Wechatpay-Signature"];
      const timestamp = headers?.["wechatpay-timestamp"] || headers?.["Wechatpay-Timestamp"];
      const nonce = headers?.["wechatpay-nonce"] || headers?.["Wechatpay-Nonce"];
      if (!signature || !timestamp || !nonce) return false;
      if (testMode) {
        const expected = crypto
          .createHmac("sha256", WXPAY_TEST_SIGN_KEY)
          .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
          .digest("hex");
        return safeTimingEqual(expected, signature);
      }
      assertRealConfig(config);
      return verifyWxpaySignature({
        timestamp,
        nonce,
        body: rawBody,
        signature,
        publicKey: config.publicKey,
      });
    },
    decryptNotifyResource(resource) {
      return decryptWxpayResource({
        ciphertext: resource?.ciphertext,
        nonce: resource?.nonce,
        associated_data: resource?.associated_data || "",
        apiV3Key: config.apiV3Key,
      });
    },
    async queryOrder({ orderNo }) {
      if (testMode) {
        if (process.env.WXPAY_TEST_QUERY_ERROR === "1") throw new Error("test wxpay query failure");
        const rawState = String(process.env.WXPAY_TEST_QUERY_STATE || "NOTPAY").trim().toUpperCase();
        const hasConfiguredOutTradeNo = Object.prototype.hasOwnProperty.call(process.env, "WXPAY_TEST_QUERY_OUT_TRADE_NO");
        const hasConfiguredTradeNo = Object.prototype.hasOwnProperty.call(process.env, "WXPAY_TEST_QUERY_TRADE_NO");
        const configuredFen = Number(process.env.WXPAY_TEST_QUERY_AMOUNT_FEN || 0);
        const totalFen = Number.isSafeInteger(configuredFen) && configuredFen > 0 ? configuredFen : 1000;
        return normalizeTradeResponse({
          out_trade_no: hasConfiguredOutTradeNo ? process.env.WXPAY_TEST_QUERY_OUT_TRADE_NO : orderNo,
          transaction_id: rawState === "SUCCESS"
            ? (hasConfiguredTradeNo ? process.env.WXPAY_TEST_QUERY_TRADE_NO : `WXQUERY-${orderNo}`)
            : "",
          trade_state: rawState,
          amount: { total: totalFen, currency: "CNY" },
          mchid: config.mchId,
          appid: config.appId,
          success_time: "2026-08-03T12:00:00+08:00",
        });
      }
      assertRealConfig(config);
      const pathname = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(config.mchId)}`;
      const res = await request("GET", pathname);
      if (res.status === 404 || res.data?.code === "ORDER_NOT_EXIST" || res.data?.code === "ORDERNOTEXIST") {
        return { outTradeNo: orderNo, tradeNo: "", totalAmount: "0.00", amountFen: 0, tradeStatus: "TRADE_NOT_EXIST", sellerId: "", appId: "" };
      }
      if (!res.ok) {
        const msg = res.data?.message || res.data?.code || `HTTP ${res.status}`;
        throw new Error(`微信支付查询订单失败：${msg}`);
      }
      return normalizeTradeResponse(res.data);
    },
    // Test-only helper: builds a signed + encrypted notify payload that the
    // test-mode verifyNotify/decryptNotifyResource accept, so the full
    // callback -> settlement pipeline can be exercised end to end.
    buildTestNotifyPayload({ orderNo, transactionId, amountFen, tradeState = "SUCCESS" }) {
      if (!testMode) throw new Error("buildTestNotifyPayload 仅在测试模式可用");
      const nonce = crypto.randomBytes(16).toString("hex");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const tradeData = {
        mchid: config.mchId,
        appid: config.appId,
        out_trade_no: String(orderNo || ""),
        transaction_id: String(transactionId || `WXFAKE${Date.now()}`),
        trade_type: "NATIVE",
        trade_state: String(tradeState || "SUCCESS").toUpperCase(),
        trade_state_desc: String(tradeState || "SUCCESS").toUpperCase() === "SUCCESS" ? "支付成功" : "待支付",
        bank_type: "OTHERS",
        success_time: new Date().toISOString(),
        amount: { total: Number(amountFen || 0), payer_total: Number(amountFen || 0), currency: "CNY", payer_currency: "CNY" },
      };
      const ciphertext = encryptWxpayResource({
        plainObject: tradeData,
        nonce,
        associated_data: "transaction",
        apiV3Key: config.apiV3Key,
      });
      const bodyObj = {
        id: `EVT_${Date.now()}`,
        create_time: new Date().toISOString(),
        resource_type: "encrypt-resource",
        event_type: "TRANSACTION.SUCCESS",
        summary: "支付成功",
        resource: { algorithm: "AEAD_AES_256_GCM", ciphertext, associated_data: "transaction", nonce },
      };
      const rawBody = JSON.stringify(bodyObj);
      const signature = crypto
        .createHmac("sha256", WXPAY_TEST_SIGN_KEY)
        .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
        .digest("hex");
      return {
        rawBody,
        headers: {
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce,
          "wechatpay-signature": signature,
          "wechatpay-serial": "TEST_SERIAL_NO",
        },
      };
    },
  };
  gateway.queryTrade = async ({ orderNo }) => gateway.queryOrder({ orderNo });
  return gateway;
}

module.exports = {
  configFromEnv,
  createWxpayGateway,
  decryptWxpayResource,
  encryptWxpayResource,
  mapWxpayTradeState,
  normalizeNotification,
  normalizeTradeResponse,
  verifyWxpaySignature,
  buildAuthorizationHeader,
  WXPAY_TEST_APP_ID,
  WXPAY_TEST_MCH_ID,
  WXPAY_TEST_API_V3_KEY,
  WXPAY_TEST_SIGN_KEY,
};
