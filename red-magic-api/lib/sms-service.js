const crypto = require("crypto");
const { SMS_PURPOSES, sendVerificationCode } = require("./sms-provider");

const DEFAULT_LIMITS = {
  phone: [
    [60 * 1000, 1],
    [60 * 60 * 1000, 5],
    [24 * 60 * 60 * 1000, 10],
  ],
  ip: [
    [60 * 1000, 5],
    [60 * 60 * 1000, 30],
    [24 * 60 * 60 * 1000, 100],
  ],
};

class SmsServiceError extends Error {
  constructor(code, message = "验证码错误或已失效") {
    super(message);
    this.name = "SmsServiceError";
    this.code = code;
  }
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

function hashCode(secret, code) {
  return hmac(secret, `code:${code}`);
}

function normalizePhone(phone) {
  const value = String(phone || "").trim();
  return /^1\d{10}$/.test(value) ? value : "";
}

function normalizePurpose(purpose) {
  const value = String(purpose || "").trim().toLowerCase();
  return SMS_PURPOSES.has(value) ? value : "";
}

function safeProviderCode(error) {
  const code = String(error?.providerCode || "PROVIDER_ERROR").trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(code) ? code : "PROVIDER_ERROR";
}

function isEqualHash(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function limitsFromEnvironment() {
  const cooldown = Number(process.env.SMS_PHONE_COOLDOWN_MS);
  if (!Number.isFinite(cooldown) || cooldown < 0) return DEFAULT_LIMITS;
  return {
    phone: [
      [cooldown, 1],
      [60 * 60 * 1000, 5],
      [24 * 60 * 60 * 1000, 10],
    ],
    ip: DEFAULT_LIMITS.ip,
  };
}

function createSmsService({
  db,
  withTransaction,
  provider = sendVerificationCode,
  clock = () => new Date(),
  codeGenerator = () => String(crypto.randomInt(0, 10000)).padStart(4, "0"),
  secret = process.env.SMS_SECRET || "",
  ipSecret = process.env.SMS_IP_HASH_SECRET || secret,
  limits,
  codeTtlMs = Number(process.env.SMS_CODE_TTL_MS || 5 * 60 * 1000),
} = {}) {
  if (!db || typeof withTransaction !== "function") throw new Error("短信服务缺少数据库事务依赖");
  if (!secret) throw new Error("SMS_SECRET 未配置");
  const effectiveLimits = limits || limitsFromEnvironment();

  function now() {
    const value = clock();
    return value instanceof Date ? value : new Date(value);
  }

  function nowIso() {
    return now().toISOString();
  }

  async function countSince(tx, column, value, sinceIso) {
    const allowedColumn = column === "phone" ? "phone" : "source_ip_hash";
    const row = await tx.get(
      `SELECT COUNT(*) AS count FROM sms_codes WHERE ${allowedColumn} = ? AND created_at >= ?`,
      [value, sinceIso],
    );
    return Number(row?.count || 0);
  }

  async function assertLimits(tx, phone, ipHash, currentTime) {
    for (const [windowMs, limit] of effectiveLimits.phone) {
      const since = new Date(currentTime.getTime() - windowMs).toISOString();
      if (await countSince(tx, "phone", phone, since) >= limit) {
        throw new SmsServiceError("rate_limited", "请求过于频繁，请稍后再试");
      }
    }
    for (const [windowMs, limit] of effectiveLimits.ip) {
      const since = new Date(currentTime.getTime() - windowMs).toISOString();
      if (await countSince(tx, "source_ip_hash", ipHash, since) >= limit) {
        throw new SmsServiceError("rate_limited", "请求过于频繁，请稍后再试");
      }
    }
  }

  async function send({ phone, purpose, ip }) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPurpose = normalizePurpose(purpose);
    if (!normalizedPhone) throw new SmsServiceError("invalid_phone", "手机号格式不正确");
    if (!normalizedPurpose) throw new SmsServiceError("invalid_purpose", "验证码用途不合法");
    const ipHash = hmac(ipSecret || secret, ip || "unknown");
    const currentTime = now();
    const code = codeGenerator();
    const reservation = await withTransaction(async (tx) => {
      await assertLimits(tx, normalizedPhone, ipHash, currentTime);
      const createdAt = currentTime.toISOString();
      const expiresAt = new Date(currentTime.getTime() + codeTtlMs).toISOString();
      await tx.run(
        `UPDATE sms_codes
         SET status = 'invalidated', used_at = ?
         WHERE phone = ? AND purpose = ? AND status IN ('sent', 'reserved')`,
        [createdAt, normalizedPhone, normalizedPurpose],
      );
      const result = await tx.run(
        `INSERT INTO sms_codes
          (phone, purpose, code_hash, status, attempts, source_ip_hash, expires_at, created_at)
         VALUES (?, ?, ?, 'reserved', 0, ?, ?, ?)`,
        [normalizedPhone, normalizedPurpose, hashCode(secret, code), ipHash, expiresAt, createdAt],
      );
      return { id: result.lastID, code };
    });

    try {
      const providerResult = await provider({ phone: normalizedPhone, code, purpose: normalizedPurpose });
      await withTransaction(async (tx) => {
        const updated = await tx.run(
          `UPDATE sms_codes
           SET status = 'sent', provider_request_id = ?
           WHERE id = ? AND status = 'reserved'`,
          [String(providerResult?.requestId || "").slice(0, 128), reservation.id],
        );
        if (Number(updated.changes || 0) !== 1) throw new SmsServiceError("reservation_lost");
      });
      return {
        sent: true,
        debugCode: process.env.NODE_ENV === "test" && process.env.SMS_TEST_MODE === "1"
          ? String(providerResult?.debugCode || code)
          : undefined,
      };
    } catch (error) {
      await withTransaction(async (tx) => {
        await tx.run(
          `UPDATE sms_codes
           SET status = 'failed', provider_error_code = ?
           WHERE id = ? AND status = 'reserved'`,
          [safeProviderCode(error), reservation.id],
        );
      });
      return { sent: false };
    }
  }

  async function findLatestSent(tx, phone, purpose) {
    return tx.get(
      `SELECT * FROM sms_codes
       WHERE phone = ? AND purpose = ? AND status = 'sent'
       ORDER BY id DESC LIMIT 1`,
      [phone, purpose],
    );
  }

  async function checkCode({ phone, purpose, code }) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPurpose = normalizePurpose(purpose);
    const normalizedCode = String(code || "").trim();
    if (!normalizedPhone || !normalizedPurpose || !/^\d{4}$/.test(normalizedCode)) {
      throw new SmsServiceError("invalid_code");
    }
    const currentTime = now();
    const result = await withTransaction(async (tx) => {
      const row = await findLatestSent(tx, normalizedPhone, normalizedPurpose);
      if (!row || Number(row.attempts || 0) >= 5 || new Date(row.expires_at).getTime() <= currentTime.getTime()) {
        if (row && Number(row.attempts || 0) < 5 && new Date(row.expires_at).getTime() <= currentTime.getTime()) {
          await tx.run("UPDATE sms_codes SET status = 'expired' WHERE id = ? AND status = 'sent'", [row.id]);
        }
        return { valid: false, row: null };
      }
      if (!isEqualHash(row.code_hash, hashCode(secret, normalizedCode))) {
        const nextAttempts = Number(row.attempts || 0) + 1;
        await tx.run(
          `UPDATE sms_codes SET attempts = ?, status = ?, locked_at = ? WHERE id = ? AND status = 'sent'`,
          [nextAttempts, nextAttempts >= 5 ? "locked" : "sent", nextAttempts >= 5 ? nowIso() : null, row.id],
        );
        return { valid: false, row: null };
      }
      return { valid: true, row };
    });
    if (!result.valid) throw new SmsServiceError("invalid_code");
    return { phone: normalizedPhone, purpose: normalizedPurpose, code: normalizedCode, row: result.row };
  }

  async function consumeCodeInTransaction(tx, { phone, purpose, code }) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedPurpose = normalizePurpose(purpose);
    const normalizedCode = String(code || "").trim();
    if (!normalizedPhone || !normalizedPurpose || !/^\d{4}$/.test(normalizedCode)) {
      throw new SmsServiceError("invalid_code");
    }
    const row = await findLatestSent(tx, normalizedPhone, normalizedPurpose);
    const currentTime = now();
    if (!row || Number(row.attempts || 0) >= 5 || new Date(row.expires_at).getTime() <= currentTime.getTime()) {
      throw new SmsServiceError("invalid_code");
    }
    if (!isEqualHash(row.code_hash, hashCode(secret, normalizedCode))) {
      const nextAttempts = Number(row.attempts || 0) + 1;
      await tx.run(
        `UPDATE sms_codes SET attempts = ?, status = ?, locked_at = ? WHERE id = ? AND status = 'sent'`,
        [nextAttempts, nextAttempts >= 5 ? "locked" : "sent", nextAttempts >= 5 ? nowIso() : null, row.id],
      );
      throw new SmsServiceError("invalid_code");
    }
    const consumed = await tx.run(
      `UPDATE sms_codes SET status = 'used', used_at = ? WHERE id = ? AND status = 'sent'`,
      [nowIso(), row.id],
    );
    if (Number(consumed.changes || 0) !== 1) throw new SmsServiceError("invalid_code");
    return row;
  }

  return {
    checkCode,
    consumeCodeInTransaction,
    send,
  };
}

module.exports = {
  DEFAULT_LIMITS,
  SmsServiceError,
  createSmsService,
  hashCode,
  hmac,
  normalizePhone,
};
