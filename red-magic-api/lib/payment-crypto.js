const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function centsFromYuan(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [yuan, fraction = ""] = text.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function verifyWechatSignature({ timestamp, nonce, body, signature, publicKey }) {
  if (!timestamp || !nonce || !signature || !publicKey) return false;
  try {
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`, "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

function decryptWechatResource(resource, apiV3Key) {
  if (!resource || !apiV3Key || Buffer.byteLength(apiV3Key) !== 32) {
    throw new Error("微信支付 APIv3 密钥配置无效");
  }
  const encrypted = Buffer.from(String(resource.ciphertext || ""), "base64");
  if (encrypted.length <= 16) throw new Error("微信支付通知密文无效");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

function alipayCanonicalPayload(params) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== undefined && params[key] !== null && String(params[key]) !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function verifyAlipaySignature(params, publicKey) {
  if (!params || !params.sign || !publicKey) return false;
  try {
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(alipayCanonicalPayload(params), "utf8"),
      publicKey,
      Buffer.from(params.sign, "base64"),
    );
  } catch {
    return false;
  }
}

function signAlipayParameters(params, privateKey) {
  return crypto.sign("RSA-SHA256", Buffer.from(alipayCanonicalPayload(params), "utf8"), privateKey).toString("base64");
}

function buildAlipayPagePayForm({ appId, privateKey, notifyUrl, returnUrl, orderNo, amountCents, subject, expiresAt }) {
  const remainingMinutes = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000));
  const params = {
    app_id: appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    version: "1.0",
    notify_url: notifyUrl,
    return_url: returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: orderNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: (amountCents / 100).toFixed(2),
      timeout_express: `${remainingMinutes}m`,
      subject,
    }),
  };
  params.sign = signAlipayParameters(params, privateKey);
  const inputs = Object.entries(params).map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join("");
  return `<!doctype html><html><body><form id="pay" method="post" action="https://openapi.alipay.com/gateway.do">${inputs}</form><script>document.getElementById("pay").submit()</script></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

module.exports = {
  alipayCanonicalPayload,
  buildAlipayPagePayForm,
  centsFromYuan,
  decryptWechatResource,
  escapeHtml,
  sha256,
  signAlipayParameters,
  verifyAlipaySignature,
  verifyWechatSignature,
};
