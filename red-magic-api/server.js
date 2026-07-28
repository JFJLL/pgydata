require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const { loadReleaseManifest, normalizeSha256 } = require("./lib/release-manifest");
const QRCode = require("qrcode");
const { sendVerificationCode } = require("./lib/sms-provider");
const {
  centsFromYuan,
  decryptWechatResource,
  escapeHtml,
  sha256,
  verifyAlipaySignature,
  verifyWechatSignature,
} = require("./lib/payment-crypto");
const { createAlipayPage, createWechatNativeOrder, readRequiredFile } = require("./lib/payment-gateways");

const app = express();
const PORT = Number(process.env.PORT || 3050);
const BASE_URL = (process.env.BASE_URL || "https://magiorix.red-magic.cn").replace(/\/$/, "");
const DEFAULT_GIFT_BALANCE = Number(process.env.DEFAULT_GIFT_BALANCE || 100);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "red-magic-api.sqlite");
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const ASSET_VERSION = "1.1.9";
const INSTALLER_FILE_NAME = "magiorix-desktop-1.1.9-windows.exe";
const INSTALLER_DOWNLOAD_URL = "https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-1.1.9-windows.exe";
const INSTALLER_SHA256 = (process.env.INSTALLER_SHA256 || "C874C2166E7C0EBBC2AD427028FB3060441D9A20D33239077B30F3887C5E16BA").trim();
const RELEASE_MANIFEST_PATH = process.env.RELEASE_MANIFEST_PATH
  || path.join(__dirname, "public", "releases", "windows", "latest.json");
const RELEASE_MANIFEST = loadReleaseManifest(RELEASE_MANIFEST_PATH);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "redmagic2026";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SMS_CODE_TTL_MS = 5 * 60 * 1000;
const SMS_SEND_INTERVAL_MS = 60 * 1000;
const PAYMENT_TOKEN_TTL_MS = 30 * 60 * 1000;
const adminSessions = new Map();
let mutationRequestTail = Promise.resolve();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, "public", "assets", "desktop", ASSET_VERSION), { recursive: true });
fs.mkdirSync(path.join(__dirname, "public", "downloads"), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

function logFilePath(date = new Date()) {
  return path.join(LOG_DIR, `server-${date.toISOString().slice(0, 10)}.log`);
}

function normalizeLogValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (value === undefined) return null;
  return value;
}

function writeLog(level, event, details = {}) {
  const entry = {
    time: nowIso(),
    level,
    event,
    ...Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, normalizeLogValue(value)]),
    ),
  };
  const line = `${JSON.stringify(entry)}\n`;
  fs.promises.appendFile(logFilePath(), line, "utf8").catch((err) => {
    console.error("Failed to write log:", err);
  });
}

function logInfo(event, details = {}) {
  writeLog("info", event, details);
}

function logWarn(event, details = {}) {
  writeLog("warn", event, details);
}

function logError(event, details = {}) {
  writeLog("error", event, details);
}

function requestLogInfo(req) {
  return {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent") || "",
  };
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function success(res, data = {}, message = "操作成功") {
  return res.json({ code: 200, message, data });
}

function fail(res, code, message, data = null) {
  return res.json({ code, message, data });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 64;
}

function smsCodeSecret() {
  const secret = String(process.env.SMS_CODE_SECRET || "");
  if (secret.length < 16) throw new Error("SMS_CODE_SECRET 未配置或长度不足");
  return secret;
}

function hashSmsCode(phone, purpose, code) {
  return crypto.createHmac("sha256", smsCodeSecret()).update(`${phone}:${purpose}:${code}`).digest("hex");
}

function generateSmsCode() {
  if (process.env.NODE_ENV === "test" && /^\d{4}$/.test(process.env.SMS_TEST_CODE || "")) {
    return process.env.SMS_TEST_CODE;
  }
  return crypto.randomInt(0, 10000).toString().padStart(4, "0");
}

function safeTimingEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || "") || !/^[a-f0-9]{64}$/.test(right || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  if (user.password_hash.startsWith("$2")) return bcrypt.compare(password, user.password_hash);
  const passwordOk = password === user.password_hash;
  if (passwordOk) {
    await dbRun("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
      await bcrypt.hash(password, 10),
      nowIso(),
      user.id,
    ]);
  }
  return passwordOk;
}

function parsePositiveAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseAdjustmentAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const amount = n > 0 ? Math.floor(n) : Math.ceil(n);
  return amount === 0 ? null : amount;
}

function parsePageParams(query) {
  const rawPage = Number(query.page || 1);
  const rawPageSize = Number(query.pageSize || query.limit || 10);
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(100, Math.floor(rawPageSize)) : 10,
  };
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map((item) => Number.parseInt(item, 10) || 0);
  const right = String(b || "0").split(".").map((item) => Number.parseInt(item, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function ensureColumn(table, column, definition) {
  const columns = await dbAll(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeJsonParse(value, fallback = null) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truncateString(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parsePositiveInteger(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeTaskId(value) {
  const taskId = String(value ?? "").trim();
  return taskId ? truncateString(taskId, 128) : "";
}

function normalizeConsumeTaskIdentity(body = {}) {
  const rawDetail = body.detail && typeof body.detail === "object" ? body.detail : null;
  const taskId = normalizeTaskId(body.taskId ?? rawDetail?.taskId);
  const itemIndex = parsePositiveInteger(body.itemIndex ?? rawDetail?.itemIndex);
  if (!taskId) {
    return { taskId: null, itemIndex: null, invalid: false };
  }
  return { taskId, itemIndex, invalid: !itemIndex };
}

function normalizeConsumeDetail(body = {}) {
  const raw = body.detail || body.details || body.taskDetail || null;
  if (!raw || typeof raw !== "object") {
    return { detailType: "", detailSummary: "", detailJson: "" };
  }
  const inputType = ["manual", "xlsx"].includes(raw.inputType) ? raw.inputType : "";
  const taskId = normalizeTaskId(body.taskId ?? raw.taskId);
  const itemIndex = parsePositiveInteger(body.itemIndex ?? raw.itemIndex);
  const pluginId = truncateString(raw.pluginId || "", 64);
  const taskType = truncateString(raw.taskType || "", 64);
  const fileName = truncateString(raw.fileName || "", 180);
  const sourceRows = Array.isArray(raw.sourceRows) ? raw.sourceRows : [];
  const urls = Array.isArray(raw.urls) ? raw.urls : [];
  const rows = sourceRows.length > 0 ? sourceRows : urls;
  const normalizedRows = rows.slice(0, 2000).map((item) => truncateString(item, 1000));
  const detail = {
    inputType,
    taskId,
    itemIndex,
    pluginId,
    taskType,
    fileName,
    totalRows: Number(raw.totalRows || rows.length || urls.length || 0),
    validCount: Number(raw.validCount || urls.length || 0),
    rows: normalizedRows,
    truncated: rows.length > normalizedRows.length,
  };
  const label = inputType === "manual" ? "手动输入" : inputType === "xlsx" ? "xlsx上传" : "任务提交";
  const detailSummary = truncateString(
    `${label}${fileName ? `：${fileName}` : ""}${taskId ? `，任务 ${taskId}` : ""}，${detail.validCount || normalizedRows.length} 条`,
    240,
  );
  return {
    detailType: inputType,
    detailSummary,
    detailJson: truncateString(JSON.stringify(detail), 200000),
  };
}

function normalizeTransactionView(value) {
  const view = String(value || "tasks").trim().toLowerCase();
  if (view === "legacy" || view === "all") return view;
  return "tasks";
}

function adminRequestSource(req) {
  return truncateString(`${req.method} ${req.path} ip=${req.ip || "-"}`, 240);
}

function sanitizeAdminConsumeDetail(detail, summary = "", fallback = {}) {
  const parsed = detail && typeof detail === "object" ? detail : safeJsonParse(detail, null);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    summary: summary || fallback.summary || "",
    inputType: parsed.inputType || fallback.inputType || "",
    pluginId: parsed.pluginId || "",
    taskType: parsed.taskType || "",
    fileName: parsed.fileName || "",
    totalRows: Number(parsed.totalRows || 0),
    validCount: Number(parsed.validCount || 0),
    taskId: parsed.taskId || fallback.taskId || "",
    itemIndex: parsed.itemIndex ? Number(parsed.itemIndex) : null,
    itemCount: fallback.itemCount ?? null,
    itemRange: fallback.itemRange || "",
    startedAt: fallback.startedAt || "",
    finishedAt: fallback.finishedAt || "",
    truncated: Boolean(parsed.truncated),
  };
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toYuan(value) {
  const n = Number(value || 0);
  return Number(n.toFixed(2));
}

function trendPercent(series) {
  if (!series || series.length < 2) return 0;
  const current = Number(series[series.length - 1] || 0);
  const previous = Number(series[series.length - 2] || 0);
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function toUserInfo(user, account) {
  return {
    id: user.id,
    phone: user.phone,
    username: user.nickname || `用户${String(user.id).padStart(4, "0")}`,
    nickname: user.nickname || `用户${String(user.id).padStart(4, "0")}`,
    avatar: user.avatar || "",
    email: user.email || "",
    status: Number(user.status ?? 1),
    balance: account ? Number(account.balance || 0) : 0,
    createdAt: user.created_at,
    deletedAt: user.deleted_at || null,
  };
}

function toExportTemplate(row) {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    fieldKeys: parseJsonArray(row.field_keys),
    sort: Number(row.sort_order || 0),
    isDefault: Number(row.is_default || 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getDefaultClientMenus() {
  return [
    {
      id: "xhs",
      name: "小红书",
      icon: "solar:shop-2-bold-duotone",
      children: [
        {
          id: "collect-pgy-blogger",
          name: "蒲公英博主采集",
          icon: "solar:user-bold-duotone",
          path: "/database/xhs/pgy-blogger",
          component: "pages/database/xhs/pgy-blogger/index.tsx",
        },
        {
          id: "collect-pgy-note",
          name: "蒲公英笔记采集",
          icon: "solar:document-text-bold-duotone",
          path: "/database/xhs/pgy-blog",
          component: "pages/database/xhs/pgy-blog/index.tsx",
        },
      ],
    },
    {
      id: "douyin",
      name: "抖音",
      icon: "solar:play-circle-bold-duotone",
      children: [
        {
          id: "douyin-starmap-blogger",
          name: "星图主页采集",
          icon: "solar:user-id-bold-duotone",
          path: "/database/starmap/blogger",
          component: "pages/database/starmap/blogger/index.tsx",
        },
      ],
    },
  ];
}

async function initDb() {
  await dbRun("PRAGMA foreign_keys = ON");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      nickname TEXT,
      avatar TEXT,
      email TEXT,
      status INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await ensureColumn("users", "email", "TEXT");
  await ensureColumn("users", "deleted_at", "TEXT");
  await ensureColumn("users", "last_active_at", "TEXT");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      provider_request_id TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await ensureColumn("sms_codes", "failed_attempts", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("sms_codes", "locked_at", "TEXT");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_codes_phone_created ON sms_codes (phone, created_at DESC)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_sms_codes_verify ON sms_codes (phone, purpose, used_at, expires_at, created_at DESC)");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS shumiao_accounts (
      user_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS shumiao_packages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      total_count INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await ensureColumn("shumiao_packages", "amount_cents", "INTEGER");
  await ensureColumn("shumiao_packages", "enabled", "INTEGER NOT NULL DEFAULT 0");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS consume_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      count INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT,
      detail_type TEXT,
      detail_summary TEXT,
      detail_json TEXT,
      task_id TEXT,
      item_index INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await ensureColumn("consume_records", "detail_type", "TEXT");
  await ensureColumn("consume_records", "detail_summary", "TEXT");
  await ensureColumn("consume_records", "detail_json", "TEXT");
  await ensureColumn("consume_records", "task_id", "TEXT");
  await ensureColumn("consume_records", "item_index", "INTEGER");
  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_consume_records_task_identity
    ON consume_records (user_id, task_id, item_index)
    WHERE task_id IS NOT NULL AND item_index IS NOT NULL
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS recharge_orders (
      order_no TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      package_id TEXT NOT NULL,
      amount REAL NOT NULL,
      total_count INTEGER NOT NULL,
      code_url TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await ensureColumn("recharge_orders", "amount_cents", "INTEGER");
  await ensureColumn("recharge_orders", "channel", "TEXT");
  await ensureColumn("recharge_orders", "payment_token_hash", "TEXT");
  await ensureColumn("recharge_orders", "payment_token_expires_at", "TEXT");
  await ensureColumn("recharge_orders", "merchant_id", "TEXT");
  await ensureColumn("recharge_orders", "app_id", "TEXT");
  await ensureColumn("recharge_orders", "platform_transaction_id", "TEXT");
  await ensureColumn("recharge_orders", "paid_at", "TEXT");
  await ensureColumn("recharge_orders", "credited_at", "TEXT");
  await ensureColumn("recharge_orders", "failed_reason", "TEXT");
  await ensureColumn("recharge_orders", "expires_at", "TEXT");
  await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_orders_payment_token ON recharge_orders (payment_token_hash) WHERE payment_token_hash IS NOT NULL");
  await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_orders_platform_tx ON recharge_orders (channel, platform_transaction_id) WHERE platform_transaction_id IS NOT NULL");

  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_balance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_username TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_user_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_username TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      request_source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS export_templates (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      field_keys TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, platform, name)
    )
  `);

  const createdAt = nowIso();
  await dbRun("UPDATE shumiao_packages SET enabled = 0");
  const packages = [
    ["points_1000", "10元积分包", 10, 1000, 50, 1],
    ["points_10000", "100元积分包", 100, 10000, 550, 2],
    ["points_50000", "500元积分包", 500, 50000, 2800, 3],
    ["points_100000", "1000元积分包", 1000, 100000, 6000, 4],
  ];

  for (const item of packages) {
    await dbRun(
      `INSERT INTO shumiao_packages
        (id, title, amount, amount_cents, total_count, sort_order, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         amount = excluded.amount,
         amount_cents = excluded.amount_cents,
         total_count = excluded.total_count,
         sort_order = excluded.sort_order,
         enabled = 1`,
      [...item, createdAt],
    );
  }
}

async function ensureAccount(userId, initialBalance = 0) {
  const existing = await dbGet("SELECT * FROM shumiao_accounts WHERE user_id = ?", [userId]);
  if (existing) return existing;

  const createdAt = nowIso();
  await dbRun(
    `INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [userId, initialBalance, createdAt, createdAt],
  );
  return dbGet("SELECT * FROM shumiao_accounts WHERE user_id = ?", [userId]);
}

async function issueToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await dbRun(
    `INSERT INTO user_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [userId, token, addDaysIso(30), nowIso()],
  );
  return token;
}

async function buildLoginData(user) {
  const account = await ensureAccount(user.id, 0);
  const token = await issueToken(user.id);
  return {
    token,
    userInfo: toUserInfo(user, account),
  };
}

const authRequired = asyncHandler(async (req, res, next) => {
  const token = req.get("satoken");
  if (!token) return fail(res, 401, "登录已过期");

  const row = await dbGet(
    `SELECT
       t.token,
       t.expires_at,
       u.id,
       u.phone,
       u.password_hash,
       u.nickname,
       u.avatar,
       u.email,
       u.status,
       u.deleted_at,
       u.created_at,
       u.updated_at
     FROM user_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token = ?`,
    [token],
  );

  if (!row || Number(row.status) !== 1 || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) await dbRun("DELETE FROM user_tokens WHERE token = ?", [token]);
    return fail(res, 401, "登录已过期");
  }

  req.token = token;
  req.user = {
    id: row.id,
    phone: row.phone,
    password_hash: row.password_hash,
    nickname: row.nickname,
    avatar: row.avatar,
    email: row.email,
    status: row.status,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return next();
});

const adminRequired = asyncHandler(async (req, res, next) => {
  const header = req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : "";
  const session = token ? adminSessions.get(token) : null;

  if (!session || session.expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return fail(res, 401, "管理员登录已过期");
  }

  req.admin = { username: session.username };
  return next();
});

function serializeDatabaseMutations(req, res, next) {
  const methodWrites = !new Set(["GET", "HEAD", "OPTIONS"]).has(req.method);
  const getWrites = /^\/pay\/[^/]+\/(?:alipay|wechat)$/.test(req.path)
    || /^\/api\/shumiao\/order\//.test(req.path);
  if (!methodWrites && !getWrites) return next();

  let releaseSlot;
  const slot = new Promise((resolve) => { releaseSlot = resolve; });
  const previous = mutationRequestTail;
  mutationRequestTail = previous.then(() => slot);
  return previous.then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseSlot();
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  }).catch(next);
}

let settlementQueue = Promise.resolve();

function settleRechargeOrder(input) {
  const run = settlementQueue.then(() => settleRechargeOrderInternal(input));
  settlementQueue = run.catch(() => {});
  return run;
}

async function settleRechargeOrderInternal({ orderNo, channel, amountCents, merchantId, appId, transactionId }) {
  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const order = await dbGet("SELECT * FROM recharge_orders WHERE order_no = ?", [orderNo]);
    if (!order) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "订单不存在" };
    }
    if (order.channel !== channel) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "支付渠道不匹配" };
    }
    if (Number(order.amount_cents) !== Number(amountCents)) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "支付金额不匹配" };
    }
    if ((order.merchant_id && order.merchant_id !== merchantId) || (order.app_id && order.app_id !== appId)) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "商户或应用不匹配" };
    }
    if (Number(order.status) === 1 && order.credited_at) {
      await dbRun("COMMIT");
      return { ok: true, duplicated: true, order };
    }
    if (Number(order.status) !== 0) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "订单已关闭" };
    }
    if (!order.expires_at || new Date(order.expires_at).getTime() <= Date.now()) {
      await dbRun("UPDATE recharge_orders SET status = 2, failed_reason = ?, updated_at = ? WHERE order_no = ?", ["订单已过期", nowIso(), orderNo]);
      await dbRun("COMMIT");
      return { ok: false, reason: "订单已过期" };
    }
    const transactionOwner = await dbGet(
      "SELECT order_no FROM recharge_orders WHERE channel = ? AND platform_transaction_id = ? AND order_no <> ?",
      [channel, transactionId, orderNo],
    );
    if (transactionOwner) {
      await dbRun("ROLLBACK");
      return { ok: false, reason: "平台交易号已绑定其他订单" };
    }
    const account = await ensureAccount(order.user_id, 0);
    const nextBalance = Number(account.balance || 0) + Number(order.total_count || 0);
    const paidAt = nowIso();
    await dbRun("UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?", [nextBalance, paidAt, order.user_id]);
    const updated = await dbRun(
      `UPDATE recharge_orders
       SET status = 1, platform_transaction_id = ?, paid_at = ?, credited_at = ?, failed_reason = NULL, updated_at = ?
       WHERE order_no = ? AND status = 0 AND credited_at IS NULL`,
      [transactionId, paidAt, paidAt, paidAt, orderNo],
    );
    if (updated.changes !== 1) throw new Error("订单状态并发更新失败");
    await dbRun("COMMIT");
    return { ok: true, duplicated: false, balance: nextBalance };
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function handleWechatNotify(req, res) {
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const timestamp = req.get("Wechatpay-Timestamp") || "";
  const nonce = req.get("Wechatpay-Nonce") || "";
  const signature = req.get("Wechatpay-Signature") || "";
  const serial = req.get("Wechatpay-Serial") || "";
  const expectedSerial = String(process.env.WECHAT_PAY_PLATFORM_SERIAL_NO || "").trim();
  const notificationAgeMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  let publicKey;
  try {
    publicKey = readRequiredFile("WECHAT_PAY_PLATFORM_CERT_PATH");
  } catch {
    return res.status(503).json({ code: "FAIL", message: "支付验签配置缺失" });
  }
  if (!Number.isFinite(notificationAgeMs) || notificationAgeMs > 5 * 60 * 1000
    || !expectedSerial || serial !== expectedSerial
    || !verifyWechatSignature({ timestamp, nonce, body, signature, publicKey })) {
    return res.status(401).json({ code: "FAIL", message: "签名验证失败" });
  }

  let notification;
  try {
    const envelope = JSON.parse(body);
    notification = decryptWechatResource(envelope.resource, String(process.env.WECHAT_PAY_API_V3_KEY || ""));
  } catch {
    return res.status(400).json({ code: "FAIL", message: "通知报文无效" });
  }
  if (notification.trade_state !== "SUCCESS") return res.json({ code: "SUCCESS", message: "成功" });
  const expectedMerchant = String(process.env.WECHAT_PAY_MCH_ID || "").trim();
  const expectedApp = String(process.env.WECHAT_PAY_APP_ID || "").trim();
  if (notification.mchid !== expectedMerchant || notification.appid !== expectedApp) {
    return res.status(400).json({ code: "FAIL", message: "商户或应用不匹配" });
  }
  const settled = await settleRechargeOrder({
    orderNo: String(notification.out_trade_no || ""),
    channel: "wechat",
    amountCents: Number(notification.amount && notification.amount.total),
    merchantId: notification.mchid,
    appId: notification.appid,
    transactionId: String(notification.transaction_id || ""),
  });
  if (!settled.ok) return res.status(400).json({ code: "FAIL", message: settled.reason });
  return res.json({ code: "SUCCESS", message: "成功" });
}

async function handleAlipayNotify(req, res) {
  let publicKey;
  try {
    publicKey = readRequiredFile("ALIPAY_PUBLIC_KEY_PATH");
  } catch {
    return res.status(503).send("failure");
  }
  if (!verifyAlipaySignature(req.body, publicKey)) return res.status(400).send("failure");
  const expectedApp = String(process.env.ALIPAY_APP_ID || "").trim();
  const expectedMerchant = String(process.env.ALIPAY_SELLER_ID || "").trim();
  if (req.body.app_id !== expectedApp || req.body.seller_id !== expectedMerchant) return res.status(400).send("failure");
  if (!new Set(["TRADE_SUCCESS", "TRADE_FINISHED"]).has(req.body.trade_status)) return res.send("success");
  const settled = await settleRechargeOrder({
    orderNo: String(req.body.out_trade_no || ""),
    channel: "alipay",
    amountCents: centsFromYuan(req.body.total_amount),
    merchantId: req.body.seller_id,
    appId: req.body.app_id,
    transactionId: String(req.body.trade_no || ""),
  });
  return res.status(settled.ok ? 200 : 400).send(settled.ok ? "success" : "failure");
}

app.set("trust proxy", true);
app.use(serializeDatabaseMutations);
app.post("/order", express.raw({ type: "application/json", limit: "1mb" }), asyncHandler(handleWechatNotify));
app.post("/order/alipay/notify", express.urlencoded({ extended: false, limit: "1mb" }), asyncHandler(handleAlipayNotify));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, satoken, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    if (res.statusCode >= 400) {
      logWarn("http_request_failed", {
        ...requestLogInfo(req),
        statusCode: res.statusCode,
        durationMs,
      });
    } else if (durationMs >= 2000) {
      logInfo("http_request_slow", {
        ...requestLogInfo(req),
        statusCode: res.statusCode,
        durationMs,
      });
    }
  });
  return next();
});
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));
app.use("/downloads", express.static(path.join(__dirname, "public", "downloads")));
app.use("/pay", express.static(path.join(__dirname, "public", "pay"), { index: false }));
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/emagic-logo.png", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "emagic-logo.png"));
});
app.get("/download/latest", (req, res) => {
  return res.redirect(302, INSTALLER_DOWNLOAD_URL);
});
app.get("/admin", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});
app.use("/admin", express.static(path.join(__dirname, "public", "admin")));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");

  if (!phone || !password) return fail(res, 400, "手机号和密码不能为空");

  const user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) return fail(res, 400, "账号不存在");
  if (Number(user.status) !== 1) return fail(res, 400, "账号已注销");
  if (!user.password_hash) return fail(res, 400, "密码错误");

  const passwordOk = await verifyPassword(user, password);
  if (!passwordOk) return fail(res, 400, "密码错误");
  return success(res, await buildLoginData(user));
}));

app.post("/api/auth/sms/send", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const purpose = String(req.body.purpose || "").trim();
  if (!isValidPhone(phone)) return fail(res, 400, "请输入正确的手机号");
  if (!new Set(["register", "reset_password"]).has(purpose)) return fail(res, 400, "短信用途不支持");

  const user = await dbGet("SELECT id, status FROM users WHERE phone = ?", [phone]);
  if (purpose === "register" && user) return fail(res, 409, "手机号已注册");
  if (purpose === "reset_password" && (!user || Number(user.status) !== 1)) return fail(res, 400, "账号不存在或已注销");

  const code = generateSmsCode();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SMS_CODE_TTL_MS).toISOString();
  let insertedId;
  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const previous = await dbGet("SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1", [phone]);
    if (previous) {
      const retryAfterMs = SMS_SEND_INTERVAL_MS - (Date.now() - new Date(previous.created_at).getTime());
      if (retryAfterMs > 0) {
        await dbRun("ROLLBACK");
        return fail(res, 429, `请 ${Math.ceil(retryAfterMs / 1000)} 秒后再获取验证码`, { retryAfter: Math.ceil(retryAfterMs / 1000) });
      }
    }
    const inserted = await dbRun(
      `INSERT INTO sms_codes (phone, purpose, code_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [phone, purpose, hashSmsCode(phone, purpose, code), expiresAt, createdAt],
    );
    insertedId = inserted.lastID;
    await dbRun("COMMIT");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }

  try {
    const result = await sendVerificationCode({ phone, code });
    await dbRun("UPDATE sms_codes SET provider_request_id = ? WHERE id = ?", [result.requestId || null, insertedId]);
  } catch (err) {
    await dbRun("DELETE FROM sms_codes WHERE id = ? AND used_at IS NULL", [insertedId]).catch(() => {});
    logWarn("sms_send_failed", { phoneSuffix: phone.slice(-4), purpose, providerCode: err.providerCode || "" });
    return fail(res, 503, "验证码发送失败，请稍后重试");
  }
  return success(res, { expiresIn: 300, retryAfter: 60 }, "验证码已发送");
}));

app.post("/api/auth/sms/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");
  if (!phone) return fail(res, 400, "手机号不能为空");
  if (!password) return fail(res, 400, "密码不能为空");

  const user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) return fail(res, 400, "账号不存在，请先使用验证码注册");
  if (Number(user.status) !== 1) return fail(res, 400, "账号已注销");
  if (!await verifyPassword(user, password)) return fail(res, 400, "手机号或密码错误");

  return success(res, await buildLoginData(user));
}));

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const password = String(req.body.password || "");
  if (!isValidPhone(phone)) return fail(res, 400, "请输入正确的手机号");
  if (!/^\d{4}$/.test(code)) return fail(res, 400, "请输入 4 位验证码");
  if (!validatePassword(password)) return fail(res, 400, "密码长度必须在 8 到 64 个字符之间");
  const verifiedHash = hashSmsCode(phone, "register", code);
  let user;

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const existing = await dbGet("SELECT id FROM users WHERE phone = ?", [phone]);
    if (existing) {
      await dbRun("ROLLBACK");
      return fail(res, 409, "手机号已注册");
    }
    const sms = await dbGet(
      `SELECT * FROM sms_codes
       WHERE phone = ? AND purpose = 'register' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (!sms || new Date(sms.expires_at).getTime() <= Date.now()) {
      await dbRun("ROLLBACK");
      return fail(res, 400, "验证码已过期，请重新获取");
    }
    if (sms.locked_at || Number(sms.failed_attempts || 0) >= 5) {
      await dbRun("ROLLBACK");
      return fail(res, 429, "验证码错误次数过多，请重新获取");
    }
    if (!safeTimingEqualHex(sms.code_hash, verifiedHash)) {
      const failedAttempts = Number(sms.failed_attempts || 0) + 1;
      await dbRun(
        "UPDATE sms_codes SET failed_attempts = ?, locked_at = ? WHERE id = ? AND used_at IS NULL",
        [failedAttempts, failedAttempts >= 5 ? nowIso() : null, sms.id],
      );
      await dbRun("COMMIT");
      return fail(res, 400, "验证码错误");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const usedAt = nowIso();
    const consumed = await dbRun("UPDATE sms_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", [usedAt, sms.id]);
    if (consumed.changes !== 1) throw new Error("验证码已使用");
    const inserted = await dbRun(
      `INSERT INTO users (phone, password_hash, nickname, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [phone, passwordHash, `用户${phone.slice(-4)}`, usedAt, usedAt],
    );
    await ensureAccount(inserted.lastID, DEFAULT_GIFT_BALANCE);
    user = await dbGet("SELECT * FROM users WHERE id = ?", [inserted.lastID]);
    await dbRun("COMMIT");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    if (String(err.message).includes("UNIQUE")) return fail(res, 409, "手机号已注册");
    throw err;
  }
  return success(res, await buildLoginData(user), "注册成功");
}));

app.post("/api/auth/password/reset", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const password = String(req.body.password || req.body.newPassword || "");
  if (!isValidPhone(phone)) return fail(res, 400, "请输入正确的手机号");
  if (!/^\d{4}$/.test(code)) return fail(res, 400, "请输入 4 位验证码");
  if (!validatePassword(password)) return fail(res, 400, "新密码长度必须在 8 到 64 个字符之间");
  const verifiedHash = hashSmsCode(phone, "reset_password", code);

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const user = await dbGet("SELECT id, status FROM users WHERE phone = ?", [phone]);
    if (!user || Number(user.status) !== 1) {
      await dbRun("ROLLBACK");
      return fail(res, 400, "账号不存在或已注销");
    }
    const sms = await dbGet(
      `SELECT * FROM sms_codes
       WHERE phone = ? AND purpose = 'reset_password' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (!sms || new Date(sms.expires_at).getTime() <= Date.now()) {
      await dbRun("ROLLBACK");
      return fail(res, 400, "验证码已过期，请重新获取");
    }
    if (sms.locked_at || Number(sms.failed_attempts || 0) >= 5) {
      await dbRun("ROLLBACK");
      return fail(res, 429, "验证码错误次数过多，请重新获取");
    }
    if (!safeTimingEqualHex(sms.code_hash, verifiedHash)) {
      const failedAttempts = Number(sms.failed_attempts || 0) + 1;
      await dbRun(
        "UPDATE sms_codes SET failed_attempts = ?, locked_at = ? WHERE id = ? AND used_at IS NULL",
        [failedAttempts, failedAttempts >= 5 ? nowIso() : null, sms.id],
      );
      await dbRun("COMMIT");
      return fail(res, 400, "验证码错误");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const updatedAt = nowIso();
    const consumed = await dbRun("UPDATE sms_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", [updatedAt, sms.id]);
    if (consumed.changes !== 1) throw new Error("验证码已使用");
    await dbRun("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [passwordHash, updatedAt, user.id]);
    await dbRun("DELETE FROM user_tokens WHERE user_id = ?", [user.id]);
    await dbRun("COMMIT");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }
  return success(res, {}, "密码已重置，请重新登录");
}));

app.get("/api/auth/info", authRequired, asyncHandler(async (req, res) => {
  const account = await ensureAccount(req.user.id, 0);
  return success(res, toUserInfo(req.user, account));
}));

app.put("/api/auth/profile", authRequired, asyncHandler(async (req, res) => {
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "nickname")) {
    const nickname = String(req.body.nickname || "").trim();
    if (!nickname) return fail(res, 400, "昵称不能为空");
    if (nickname.length > 30) return fail(res, 400, "昵称不能超过 30 个字符");
    updates.nickname = nickname;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "avatar")) {
    updates.avatar = String(req.body.avatar || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
    const email = String(req.body.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "邮箱格式不正确");
    updates.email = email;
  }
  if (Object.keys(updates).length === 0) return fail(res, 400, "没有可修改的资料");

  const fields = Object.keys(updates);
  const values = fields.map((key) => updates[key]);
  values.push(nowIso(), req.user.id);
  await dbRun(
    `UPDATE users SET ${fields.map((key) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    values,
  );
  const user = await dbGet("SELECT * FROM users WHERE id = ?", [req.user.id]);
  const account = await ensureAccount(req.user.id, 0);
  return success(res, toUserInfo(user, account));
}));

app.get("/api/auth/perms-menus", authRequired, asyncHandler(async (req, res) => {
  return success(res, {
    permissions: [],
    menus: getDefaultClientMenus(),
    organization: null,
  });
}));

app.post("/api/auth/logout", authRequired, asyncHandler(async (req, res) => {
  await dbRun("DELETE FROM user_tokens WHERE token = ?", [req.token]);
  return success(res, {});
}));

app.post("/api/auth/delete-account", authRequired, asyncHandler(async (req, res) => {
  const deletedAt = nowIso();
  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    await dbRun(
      "UPDATE users SET status = 0, deleted_at = ?, updated_at = ? WHERE id = ?",
      [deletedAt, deletedAt, req.user.id],
    );
    await dbRun("DELETE FROM user_tokens WHERE user_id = ?", [req.user.id]);
    await dbRun("COMMIT");
    return success(res, { deletedAt }, "账号已注销");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }
}));

function normalizeTemplatePlatform(platform) {
  const value = String(platform || "").trim();
  return ["starmap", "pgy", "pgy-blogger", "pgy-notebook", "douyin"].includes(value) ? value : "";
}

function normalizeTemplatePayload(body, partial = false) {
  const payload = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, "platform")) {
    payload.platform = normalizeTemplatePlatform(body.platform);
    if (!payload.platform) return { error: "模板平台不合法" };
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    payload.name = String(body.name || "").trim();
    if (!payload.name) return { error: "模板名称不能为空" };
    if (payload.name.length > 30) return { error: "模板名称不能超过 30 个字符" };
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "fieldKeys")) {
    const fieldKeys = Array.isArray(body.fieldKeys) ? body.fieldKeys.map((item) => String(item).trim()).filter(Boolean) : [];
    if (fieldKeys.length === 0) return { error: "模板字段不能为空" };
    payload.fieldKeys = fieldKeys;
  }
  if (Object.prototype.hasOwnProperty.call(body, "isDefault")) {
    payload.isDefault = body.isDefault === true;
  }
  return { payload };
}

app.get("/api/export-templates", authRequired, asyncHandler(async (req, res) => {
  const platform = normalizeTemplatePlatform(req.query.platform);
  if (!platform) return fail(res, 400, "模板平台不合法");
  const rows = await dbAll(
    `SELECT * FROM export_templates
     WHERE user_id = ? AND platform = ?
     ORDER BY is_default DESC, sort_order ASC, created_at DESC`,
    [req.user.id, platform],
  );
  return success(res, rows.map(toExportTemplate));
}));

app.post("/api/export-templates", authRequired, asyncHandler(async (req, res) => {
  const { payload, error } = normalizeTemplatePayload(req.body);
  if (error) return fail(res, 400, error);

  const existing = await dbGet(
    "SELECT COUNT(*) AS count FROM export_templates WHERE user_id = ? AND platform = ?",
    [req.user.id, payload.platform],
  );
  const maxSort = await dbGet(
    "SELECT COALESCE(MAX(sort_order), -1) AS sortOrder FROM export_templates WHERE user_id = ? AND platform = ?",
    [req.user.id, payload.platform],
  );
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const isDefault = payload.isDefault === true || Number(existing.count || 0) === 0;

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (isDefault) {
      await dbRun(
        "UPDATE export_templates SET is_default = 0, updated_at = ? WHERE user_id = ? AND platform = ?",
        [createdAt, req.user.id, payload.platform],
      );
    }
    await dbRun(
      `INSERT INTO export_templates
        (id, user_id, platform, name, field_keys, sort_order, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user.id,
        payload.platform,
        payload.name,
        JSON.stringify(payload.fieldKeys),
        Number(maxSort.sortOrder || -1) + 1,
        isDefault ? 1 : 0,
        createdAt,
        createdAt,
      ],
    );
    await dbRun("COMMIT");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    if (String(err && err.message).includes("UNIQUE")) return fail(res, 409, "模板名已存在");
    throw err;
  }
  const row = await dbGet("SELECT * FROM export_templates WHERE id = ? AND user_id = ?", [id, req.user.id]);
  return success(res, toExportTemplate(row));
}));

app.get("/api/export-templates/:id", authRequired, asyncHandler(async (req, res) => {
  const row = await dbGet("SELECT * FROM export_templates WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!row) return fail(res, 404, "模板不存在");
  return success(res, toExportTemplate(row));
}));

app.patch("/api/export-templates/:id", authRequired, asyncHandler(async (req, res) => {
  const current = await dbGet("SELECT * FROM export_templates WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!current) return fail(res, 404, "模板不存在");
  const { payload, error } = normalizeTemplatePayload(req.body, true);
  if (error) return fail(res, 400, error);
  const updates = [];
  const values = [];
  if (payload.name !== undefined) {
    updates.push("name = ?");
    values.push(payload.name);
  }
  if (payload.fieldKeys !== undefined) {
    updates.push("field_keys = ?");
    values.push(JSON.stringify(payload.fieldKeys));
  }
  const updatedAt = nowIso();
  const setDefault = payload.isDefault === true;
  if (setDefault) {
    updates.push("is_default = 1");
  }
  if (updates.length === 0 && !setDefault) return fail(res, 400, "没有可修改的模板字段");

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (setDefault) {
      await dbRun(
        "UPDATE export_templates SET is_default = 0, updated_at = ? WHERE user_id = ? AND platform = ?",
        [updatedAt, req.user.id, current.platform],
      );
    }
    values.push(updatedAt, req.params.id, req.user.id);
    await dbRun(
      `UPDATE export_templates SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`,
      values,
    );
    await dbRun("COMMIT");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    if (String(err && err.message).includes("UNIQUE")) return fail(res, 409, "模板名已存在");
    throw err;
  }
  const row = await dbGet("SELECT * FROM export_templates WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  return success(res, toExportTemplate(row));
}));

app.delete("/api/export-templates/:id", authRequired, asyncHandler(async (req, res) => {
  const row = await dbGet("SELECT * FROM export_templates WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!row) return fail(res, 404, "模板不存在");
  await dbRun("DELETE FROM export_templates WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  return success(res, {});
}));

app.get("/api/shumiao/balance", authRequired, asyncHandler(async (req, res) => {
  const account = await ensureAccount(req.user.id, 0);
  return success(res, { balance: Number(account.balance || 0) });
}));

app.get("/api/shumiao/packages", authRequired, asyncHandler(async (req, res) => {
  const rows = await dbAll(
    `SELECT id, id AS packageId, title, amount_cents AS amountCents,
            amount_cents / 100.0 AS amount, total_count AS totalCount
     FROM shumiao_packages
     WHERE enabled = 1
     ORDER BY sort_order ASC, amount ASC`,
  );
  return success(res, rows);
}));

app.get("/api/shumiao/check-balance", authRequired, asyncHandler(async (req, res) => {
  const count = parsePositiveAmount(req.query.count) || 0;
  const account = await ensureAccount(req.user.id, 0);
  const balance = Number(account.balance || 0);
  return success(res, {
    balance,
    required: count,
    shortage: Math.max(0, count - balance),
    sufficient: balance >= count,
  });
}));

app.post("/api/shumiao/consume", authRequired, asyncHandler(async (req, res) => {
  const count = parsePositiveAmount(req.body.count ?? req.body.amount ?? req.body.quantity);
  if (!count) return fail(res, 400, "扣费数量不能为空");
  const detail = normalizeConsumeDetail(req.body);
  const taskIdentity = normalizeConsumeTaskIdentity(req.body);
  if (taskIdentity.invalid) return fail(res, 400, "携带 taskId 时 itemIndex 必须为正整数");

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (taskIdentity.taskId && taskIdentity.itemIndex) {
      const existing = await dbGet(
        `SELECT id, count, balance_after AS balanceAfter, created_at AS createdAt
         FROM consume_records
         WHERE user_id = ? AND task_id = ? AND item_index = ?`,
        [req.user.id, taskIdentity.taskId, taskIdentity.itemIndex],
      );
      if (existing) {
        await dbRun("COMMIT");
        return success(res, {
          balance: Number(existing.balanceAfter || 0),
          duplicated: true,
          taskId: taskIdentity.taskId,
          itemIndex: taskIdentity.itemIndex,
          recordId: existing.id,
          createdAt: existing.createdAt,
        });
      }
    }

    const account = await ensureAccount(req.user.id, 0);
    const balance = Number(account.balance || 0);
    if (balance < count) {
      await dbRun("ROLLBACK");
      return fail(res, 400, `积分余额不足：当前 ${balance}，本次需要 ${count}，还差 ${count - balance}`, {
        balance,
        required: count,
        shortage: count - balance,
      });
    }

    const nextBalance = balance - count;
    const createdAt = nowIso();
    await dbRun(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, req.user.id],
    );
    await dbRun(
      `UPDATE users SET last_active_at = ?, updated_at = ? WHERE id = ?`,
      [createdAt, createdAt, req.user.id],
    );
    await dbRun(
      `INSERT INTO consume_records
        (user_id, count, balance_after, remark, detail_type, detail_summary, detail_json, task_id, item_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        count,
        nextBalance,
        req.body.remark || "",
        detail.detailType,
        detail.detailSummary,
        detail.detailJson,
        taskIdentity.taskId,
        taskIdentity.itemIndex,
        createdAt,
      ],
    );
    await dbRun("COMMIT");
    return success(res, {
      balance: nextBalance,
      duplicated: false,
      taskId: taskIdentity.taskId,
      itemIndex: taskIdentity.itemIndex,
    });
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }
}));

app.get("/api/shumiao/recharge-records", authRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const offset = (page - 1) * pageSize;
  const totalRow = await dbGet("SELECT COUNT(*) AS total FROM recharge_orders WHERE user_id = ?", [req.user.id]);
  const list = await dbAll(
    `SELECT order_no AS orderNo, package_id AS packageId, amount, amount_cents AS amountCents,
            total_count AS totalCount, code_url AS codeUrl, channel, status,
            paid_at AS paidAt, credited_at AS creditedAt, failed_reason AS failedReason,
            created_at AS createdAt
     FROM recharge_orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, pageSize, offset],
  );
  return success(res, { list, total: totalRow.total, page, pageSize });
}));

app.get("/api/shumiao/consume-records", authRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const offset = (page - 1) * pageSize;
  const totalRow = await dbGet("SELECT COUNT(*) AS total FROM consume_records WHERE user_id = ?", [req.user.id]);
  const list = await dbAll(
    `SELECT id, count, balance_after AS balanceAfter, remark, created_at AS createdAt
     FROM consume_records
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, pageSize, offset],
  );
  return success(res, { list, total: totalRow.total, page, pageSize });
}));

app.post("/api/shumiao/recharge", authRequired, asyncHandler(async (req, res) => {
  const packageId = String(req.body.packageId || "");
  const pkg = await dbGet("SELECT * FROM shumiao_packages WHERE id = ? AND enabled = 1", [packageId]);
  if (!pkg) return fail(res, 400, "套餐不存在");

  const orderNo = `RM${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const paymentToken = crypto.randomBytes(32).toString("base64url");
  const payBaseUrl = (process.env.PAY_BASE_URL || BASE_URL).replace(/\/$/, "");
  const payUrl = `${payBaseUrl}/pay/${paymentToken}`;
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + PAYMENT_TOKEN_TTL_MS).toISOString();
  await dbRun(
    `INSERT INTO recharge_orders
      (order_no, user_id, package_id, amount, amount_cents, total_count, code_url, status,
       payment_token_hash, payment_token_expires_at, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [orderNo, req.user.id, pkg.id, Number(pkg.amount_cents) / 100, pkg.amount_cents, pkg.total_count,
      payUrl, sha256(paymentToken), expiresAt, expiresAt, createdAt, createdAt],
  );

  return success(res, {
    orderNo,
    payUrl,
    codeUrl: payUrl,
    amount: Number(pkg.amount_cents) / 100,
    amountCents: Number(pkg.amount_cents),
    totalCount: pkg.total_count,
    status: 0,
    expiresAt,
  });
}));

app.get("/api/shumiao/order/:orderNo", authRequired, asyncHandler(async (req, res) => {
  let order = await dbGet(
    `SELECT order_no AS orderNo, package_id AS packageId, amount, amount_cents AS amountCents,
            total_count AS totalCount, code_url AS codeUrl, channel, status,
            paid_at AS paidAt, credited_at AS creditedAt, failed_reason AS failedReason,
            expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
     FROM recharge_orders
     WHERE user_id = ? AND order_no = ?`,
    [req.user.id, req.params.orderNo],
  );
  if (!order) return fail(res, 404, "订单不存在");
  if (Number(order.status) === 0 && order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) {
    const updatedAt = nowIso();
    await dbRun(
      "UPDATE recharge_orders SET status = 2, failed_reason = ?, updated_at = ? WHERE user_id = ? AND order_no = ? AND status = 0",
      ["订单已过期", updatedAt, req.user.id, req.params.orderNo],
    );
    order = { ...order, status: 2, failedReason: "订单已过期", updatedAt };
  }
  return success(res, order);
}));

async function paymentOrderByToken(token) {
  return dbGet("SELECT * FROM recharge_orders WHERE payment_token_hash = ?", [sha256(token)]);
}

async function claimPaymentChannel(order, channel, merchantId, appId) {
  const result = await dbRun(
    `UPDATE recharge_orders
     SET channel = ?, merchant_id = ?, app_id = ?, failed_reason = NULL, updated_at = ?
     WHERE order_no = ? AND status = 0 AND (channel IS NULL OR channel = ?)`,
    [channel, merchantId, appId, nowIso(), order.order_no, channel],
  );
  return result.changes === 1;
}

app.get("/pay/:token", asyncHandler(async (req, res) => {
  const order = await paymentOrderByToken(req.params.token);
  if (!order) return res.status(404).send("支付页面不存在");
  if (Number(order.status) === 1) return res.send("<!doctype html><meta charset=utf-8><title>支付成功</title><p>支付成功，积分已到账，可返回 magiorix。</p>");
  if (Number(order.status) !== 0 || new Date(order.payment_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).send("支付凭证已失效，请返回 magiorix 重新创建订单");
  }
  const template = fs.readFileSync(path.join(__dirname, "public", "pay", "index.html"), "utf8");
  return res.type("html").send(template
    .replaceAll("{{ORDER_NO}}", escapeHtml(order.order_no))
    .replaceAll("{{AMOUNT}}", (Number(order.amount_cents) / 100).toFixed(2))
    .replaceAll("{{TOTAL_COUNT}}", String(Number(order.total_count)))
    .replaceAll("{{TOKEN}}", encodeURIComponent(req.params.token)));
}));

app.get("/pay/:token/alipay", asyncHandler(async (req, res) => {
  const order = await paymentOrderByToken(req.params.token);
  if (!order || Number(order.status) !== 0 || new Date(order.payment_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).send("支付凭证已失效");
  }
  let page;
  try {
    page = createAlipayPage({
      orderNo: order.order_no,
      amountCents: Number(order.amount_cents),
      subject: `magiorix ${order.total_count} 积分`,
      expiresAt: order.expires_at,
    });
  } catch (err) {
    logError("alipay_create_failed", { orderNo: order.order_no, error: err });
    return res.status(503).send("支付宝支付暂未配置，请稍后重试");
  }
  if (!await claimPaymentChannel(order, "alipay", page.merchantId, page.appId)) return res.status(409).send("订单已选择其他支付方式");
  return res.type("html").send(page.html);
}));

app.get("/pay/:token/wechat", asyncHandler(async (req, res) => {
  const order = await paymentOrderByToken(req.params.token);
  if (!order || Number(order.status) !== 0 || new Date(order.payment_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).send("支付凭证已失效");
  }
  const merchantId = String(process.env.WECHAT_PAY_MCH_ID || "").trim();
  const appId = String(process.env.WECHAT_PAY_APP_ID || "").trim();
  if (!await claimPaymentChannel(order, "wechat", merchantId, appId)) return res.status(409).send("订单已选择其他支付方式");
  try {
    const result = await createWechatNativeOrder({
      orderNo: order.order_no,
      amountCents: Number(order.amount_cents),
      description: `magiorix ${order.total_count} 积分`,
      expiresAt: order.expires_at,
    });
    const qrDataUrl = await QRCode.toDataURL(result.codeUrl, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    return res.type("html").send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>微信支付</title><link rel="stylesheet" href="/pay/pay.css"></head><body><main class="pay-shell"><h1>微信扫码支付</h1><p>订单 ${escapeHtml(order.order_no)}</p><img class="qr" src="${qrDataUrl}" alt="微信支付二维码"><strong>¥${(Number(order.amount_cents) / 100).toFixed(2)}</strong><p>支付后可返回 magiorix，积分会自动到账。</p></main></body></html>`);
  } catch (err) {
    await dbRun("UPDATE recharge_orders SET failed_reason = ?, updated_at = ? WHERE order_no = ? AND status = 0", ["微信支付下单失败", nowIso(), order.order_no]);
    logError("wechat_create_failed", { orderNo: order.order_no, error: err });
    return res.status(503).send("微信支付暂不可用，请稍后重试");
  }
}));

app.get("/order/alipay/return", asyncHandler(async (req, res) => {
  let verified = false;
  try {
    verified = verifyAlipaySignature(req.query, readRequiredFile("ALIPAY_PUBLIC_KEY_PATH"));
  } catch {}
  return res.status(verified ? 200 : 400).send(verified
    ? "<!doctype html><meta charset=utf-8><title>支付结果</title><p>支付结果正在确认，请返回 magiorix 查看积分。</p>"
    : "返回参数验证失败，请回到 magiorix 查看订单状态");
}));

app.get("/api/frontend-assets/latest/desktop", asyncHandler(async (req, res) => {
  const releaseAssets = RELEASE_MANIFEST?.release.assets;
  const assetVersion = releaseAssets?.version || ASSET_VERSION;
  const filePath = path.join(__dirname, "public", "assets", "desktop", assetVersion, "assets.zip");
  if (!fs.existsSync(filePath)) {
    return fail(res, 404, "资源文件不存在", {
      expectedPath: `public/assets/desktop/${assetVersion}/assets.zip`,
    });
  }

  if (releaseAssets) {
    return success(res, {
      version: releaseAssets.version,
      fileName: releaseAssets.fileName,
      downloadUrl: releaseAssets.downloadUrl,
      size: releaseAssets.size,
      checksum: `sha256:${releaseAssets.sha256}`,
      releaseDate: RELEASE_MANIFEST.release.generatedAt,
      releaseNotes: RELEASE_MANIFEST.release.releaseNotes,
    });
  }

  const stat = fs.statSync(filePath);
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });

  return success(res, {
    version: ASSET_VERSION,
    fileName: "assets.zip",
    downloadUrl: `${BASE_URL}/assets/desktop/${ASSET_VERSION}/assets.zip`,
    size: stat.size,
    checksum: `sha256:${hash.digest("hex")}`,
    releaseDate: stat.mtime.toISOString(),
    releaseNotes: ["Σ.magiorix 桌面端资源包"],
  });
}));

app.get("/api/desktop-download/latest", asyncHandler(async (req, res) => {
  const desktopRelease = RELEASE_MANIFEST?.release.desktop;
  const fileName = desktopRelease?.fileName || INSTALLER_FILE_NAME;
  const filePath = path.join(__dirname, "public", "downloads", fileName);
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

  return success(res, {
    version: desktopRelease?.version || ASSET_VERSION,
    fileName,
    downloadUrl: desktopRelease?.downloadUrl || INSTALLER_DOWNLOAD_URL,
    directUrl: desktopRelease?.downloadUrl || INSTALLER_DOWNLOAD_URL,
    size: desktopRelease?.size || (stat ? stat.size : 0),
    checksum: desktopRelease?.sha256 || normalizeSha256(INSTALLER_SHA256),
    releaseDate: desktopRelease ? RELEASE_MANIFEST.release.generatedAt : (stat ? stat.mtime.toISOString() : null),
  });
}));

app.get("/api/desktop-versions/check", asyncHandler(async (req, res) => {
  const currentVersion = String(req.query.currentVersion || "0.0.0").trim();
  const platform = String(req.query.platform || "windows").trim();
  const desktopRelease = RELEASE_MANIFEST?.release.desktop;
  const latestVersion = desktopRelease?.version || ASSET_VERSION;
  if (platform !== "windows") {
    return success(res, {
      hasUpdate: false,
      latestVersion,
      version: latestVersion,
      platform,
    });
  }
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  if (!hasUpdate) {
    return success(res, {
      hasUpdate: false,
      latestVersion,
      version: latestVersion,
    });
  }
  const checksum = desktopRelease?.sha256 || normalizeSha256(INSTALLER_SHA256);
  if (!checksum) return fail(res, 500, "安装包校验值未配置");
  return success(res, {
    hasUpdate: true,
    latestVersion,
    version: latestVersion,
    platform,
    fileName: desktopRelease?.fileName || INSTALLER_FILE_NAME,
    downloadUrl: desktopRelease?.downloadUrl || INSTALLER_DOWNLOAD_URL,
    checksum,
    fileSize: desktopRelease?.size || 0,
    forceUpdate: false,
    updateLog: RELEASE_MANIFEST?.release.releaseNotes.join("\n") || `magiorix ${latestVersion} 更新`,
  });
}));

app.post("/api/admin/login", asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    logWarn("admin_login_failed", {
      username,
      ...requestLogInfo(req),
    });
    return fail(res, 400, "管理员账号或密码错误");
  }

  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, {
    username,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  logInfo("admin_login_success", {
    username,
    ...requestLogInfo(req),
  });

  return success(res, {
    token,
    username,
    expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString(),
  });
}));

app.get("/api/admin/overview", adminRequired, asyncHandler(async (req, res) => {
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const totalUsers = await dbGet("SELECT COUNT(*) AS count FROM users");
  const deletedUsers = await dbGet("SELECT COUNT(*) AS count FROM users WHERE status <> 1");
  const todayUsers = await dbGet(
    "SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?",
    [today.toISOString(), tomorrow.toISOString()],
  );
  const balance = await dbGet("SELECT COALESCE(SUM(balance), 0) AS total FROM shumiao_accounts");
  const adjustments = await dbGet("SELECT COALESCE(SUM(delta), 0) AS total, COUNT(*) AS count FROM admin_balance_adjustments");

  return success(res, {
    users: Number(totalUsers.count || 0),
    deletedUsers: Number(deletedUsers.count || 0),
    todayUsers: Number(todayUsers.count || 0),
    totalBalance: Number(balance.total || 0),
    addedPoints: Number(adjustments.total || 0),
    adjustmentCount: Number(adjustments.count || 0),
  });
}));

app.get("/api/admin/users", adminRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const keyword = String(req.query.keyword || "").trim();
  const like = `%${keyword}%`;
  const where = keyword ? "WHERE u.phone LIKE ? OR u.nickname LIKE ?" : "";
  const params = keyword ? [like, like] : [];
  const offset = (page - 1) * pageSize;

  const total = await dbGet(`SELECT COUNT(*) AS count FROM users u ${where}`, params);
  const rows = await dbAll(
    `SELECT
       u.id,
       u.phone,
       u.nickname,
       u.status,
       u.deleted_at AS deletedAt,
       u.last_active_at AS lastActiveAt,
       u.created_at AS createdAt,
       u.updated_at AS updatedAt,
       COALESCE(a.balance, 0) AS balance
     FROM users u
     LEFT JOIN shumiao_accounts a ON a.user_id = u.id
     ${where}
     ORDER BY u.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return success(res, {
    list: rows.map((row) => ({
      ...row,
      balance: Number(row.balance || 0),
    })),
    total: Number(total.count || 0),
    page,
    pageSize,
  });
}));

app.post("/api/admin/users/:id/add-points", adminRequired, asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const delta = parseAdjustmentAmount(req.body.delta ?? req.body.count ?? req.body.amount ?? req.body.points);
  const remark = String(req.body.remark || (delta < 0 ? "管理员扣积分" : "管理员加积分")).trim();

  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, "用户不存在");
  if (!delta) return fail(res, 400, "积分调整数量不能为空，正数为加积分，负数为扣积分");

  const user = await dbGet("SELECT id, status FROM users WHERE id = ?", [userId]);
  if (!user) return fail(res, 404, "用户不存在");
  if (Number(user.status) !== 1) return fail(res, 400, "账号已注销，不能继续调整积分");

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const account = await ensureAccount(userId, 0);
    const createdAt = nowIso();
    const currentBalance = Number(account.balance || 0);
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) {
      await dbRun("ROLLBACK");
      return fail(res, 400, `积分余额不足，当前余额 ${currentBalance}，不能扣 ${Math.abs(delta)}`);
    }

    await dbRun(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, userId],
    );
    await dbRun(
      `INSERT INTO admin_balance_adjustments
        (admin_username, user_id, delta, balance_after, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.admin.username, userId, delta, nextBalance, remark, createdAt],
    );
    await dbRun("COMMIT");
    logInfo("admin_adjust_points", {
      adminUsername: req.admin.username,
      userId,
      delta,
      balanceAfter: nextBalance,
      ...requestLogInfo(req),
    });

    return success(res, {
      userId,
      delta,
      balance: nextBalance,
    });
  } catch (err) {
    await dbRun("ROLLBACK");
    throw err;
  }
}));

app.post("/api/admin/users/:id/reset-password", adminRequired, asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const newPassword = req.body?.newPassword;
  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, "用户不存在");
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 64) {
    return fail(res, 400, "新密码长度必须在 8 到 64 个字符之间");
  }

  const requestSource = adminRequestSource(req);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const user = await dbGet("SELECT id, phone, status FROM users WHERE id = ?", [userId]);
    if (!user) {
      await dbRun("ROLLBACK");
      return fail(res, 404, "用户不存在");
    }
    if (Number(user.status) !== 1) {
      await dbRun("ROLLBACK");
      return fail(res, 400, "账号已注销，不能重置密码");
    }

    const updatedAt = nowIso();
    await dbRun(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [passwordHash, updatedAt, userId],
    );
    const revokeResult = await dbRun("DELETE FROM user_tokens WHERE user_id = ?", [userId]);
    await dbRun(
      `INSERT INTO admin_user_audit_logs
        (admin_username, user_id, action, request_source, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [req.admin.username, userId, "reset_password", requestSource, updatedAt],
    );
    await dbRun("COMMIT");

    logInfo("admin_reset_password", {
      adminUsername: req.admin.username,
      userId,
      revokedTokens: Number(revokeResult.changes || 0),
      requestSource,
      ...requestLogInfo(req),
    });

    return success(res, {
      userId,
      revokedTokens: Number(revokeResult.changes || 0),
      updatedAt,
    }, "密码已重置，用户已退出全部登录");
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    throw err;
  }
}));

app.get("/api/admin/adjustments", adminRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const offset = (page - 1) * pageSize;
  const total = await dbGet("SELECT COUNT(*) AS count FROM admin_balance_adjustments");
  const rows = await dbAll(
    `SELECT
       a.id,
       a.admin_username AS adminUsername,
       a.user_id AS userId,
       u.phone,
       u.nickname,
       a.delta,
       a.balance_after AS balanceAfter,
       a.remark,
       a.created_at AS createdAt
     FROM admin_balance_adjustments a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );

  return success(res, {
    list: rows,
    total: Number(total.count || 0),
    page,
    pageSize,
  });
}));

app.get("/api/admin/user-transactions", adminRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const view = normalizeTransactionView(req.query.view);
  const keyword = String(req.query.keyword || "").trim();
  const offset = (page - 1) * pageSize;
  const like = `%${keyword}%`;
  const params = keyword ? [like, like, like, like] : [];
  const where = keyword
    ? "WHERE u.phone LIKE ? OR u.nickname LIKE ? OR COALESCE(tx.taskId, '') LIKE ? OR COALESCE(tx.detailSummary, tx.remark, tx.operation, '') LIKE ?"
    : "";
  const sourceSelect = view === "legacy"
    ? "SELECT * FROM legacy_rows"
    : view === "all"
      ? "SELECT * FROM task_rows UNION ALL SELECT * FROM legacy_rows"
      : "SELECT * FROM task_rows";
  const baseSelect = `
    WITH task_groups AS (
      SELECT
        user_id AS userId,
        task_id AS taskId,
        COUNT(*) AS itemCount,
        SUM(count) AS totalCount,
        MIN(item_index) AS firstItemIndex,
        MAX(item_index) AS lastItemIndex,
        MIN(created_at) AS startedAt,
        MAX(created_at) AS finishedAt,
        MAX(id) AS lastRecordId
      FROM consume_records
      WHERE task_id IS NOT NULL AND item_index IS NOT NULL
      GROUP BY user_id, task_id
    ),
    task_rows AS (
      SELECT
        'task-' || g.userId || '-' || g.taskId AS id,
        'task' AS type,
        r.user_id AS userId,
        r.created_at AS createdAt,
        -g.totalCount AS amount,
        r.balance_after AS balanceAfter,
        '任务消耗' AS operation,
        COALESCE(r.remark, '') AS remark,
        COALESCE(r.detail_type, '') AS detailType,
        COALESCE(r.detail_summary, '') AS detailSummary,
        COALESCE(r.detail_json, '') AS detailJson,
        g.taskId AS taskId,
        g.itemCount AS itemCount,
        g.firstItemIndex AS firstItemIndex,
        g.lastItemIndex AS lastItemIndex,
        g.startedAt AS startedAt,
        g.finishedAt AS finishedAt
      FROM task_groups g
      JOIN consume_records r
        ON r.id = g.lastRecordId
    ),
    legacy_rows AS (
      SELECT
        'consume-' || id AS id,
        'legacy' AS type,
        user_id AS userId,
        created_at AS createdAt,
        -count AS amount,
        balance_after AS balanceAfter,
        '采集消耗' AS operation,
        COALESCE(remark, '') AS remark,
        COALESCE(detail_type, '') AS detailType,
        COALESCE(detail_summary, '') AS detailSummary,
        COALESCE(detail_json, '') AS detailJson,
        NULL AS taskId,
        1 AS itemCount,
        NULL AS firstItemIndex,
        NULL AS lastItemIndex,
        created_at AS startedAt,
        created_at AS finishedAt
      FROM consume_records
      WHERE task_id IS NULL OR item_index IS NULL
    )
    SELECT
      tx.id,
      tx.type,
      tx.userId,
      u.phone,
      u.nickname,
      u.status,
      tx.createdAt,
      tx.amount,
      ABS(tx.amount) AS consumedQuota,
      tx.balanceAfter,
      tx.operation,
      tx.remark,
      tx.detailType,
      tx.detailSummary,
      tx.detailJson,
      tx.taskId,
      tx.itemCount,
      tx.firstItemIndex,
      tx.lastItemIndex,
      tx.startedAt,
      tx.finishedAt
    FROM (${sourceSelect}) tx
    LEFT JOIN users u ON u.id = tx.userId
  `;

  const total = await dbGet(`SELECT COUNT(*) AS count FROM (${baseSelect} ${where})`, params);
  const rows = await dbAll(
    `${baseSelect}
     ${where}
     ORDER BY datetime(tx.createdAt) DESC, tx.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return success(res, {
    list: rows.map((row) => {
      const { detailJson, ...rest } = row;
      const detail = sanitizeAdminConsumeDetail(detailJson, row.detailSummary, {
        inputType: row.detailType,
        taskId: row.taskId,
        itemCount: Number(row.itemCount || 0),
        itemRange: row.firstItemIndex && row.lastItemIndex
          ? `${Number(row.firstItemIndex)}-${Number(row.lastItemIndex)}`
          : "",
        startedAt: row.startedAt,
        finishedAt: row.finishedAt || row.createdAt,
      });
      const detailSummary = row.type === "task"
        ? truncateString(
          row.detailSummary
          || `任务 ${row.taskId || "-"} · ${Number(row.itemCount || 0)} 条`,
          240,
        )
        : row.detailSummary;
      return {
        ...rest,
        amount: Number(row.amount || 0),
        consumedQuota: Number(row.consumedQuota || 0),
        balanceAfter: row.balanceAfter === null ? null : Number(row.balanceAfter || 0),
        status: Number(row.status ?? 1),
        itemCount: Number(row.itemCount || 0),
        plannedCount: Number(detail?.totalRows || 0),
        source: detail?.inputType || row.detailType || "",
        fileName: detail?.fileName || "",
        updatedAt: row.finishedAt || row.createdAt,
        detailSummary,
        detail,
      };
    }),
    total: Number(total.count || 0),
    page,
    pageSize,
    view,
  });
}));

app.get("/api/statistics/admin-dashboard", authRequired, asyncHandler(async (req, res) => {
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const weekStart = addDays(today, -6);
  const categories = [];
  const userNewSeries = [];
  const userTotalSeries = [];
  const userActiveSeries = [];
  const rechargeSeries = [];
  const commissionSeries = [];
  const profitSeries = [];

  for (let i = 6; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const nextDay = addDays(day, 1);
    categories.push(dayLabel(day));

    const newUsers = await dbGet(
      "SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?",
      [day.toISOString(), nextDay.toISOString()],
    );
    const totalUsers = await dbGet(
      "SELECT COUNT(*) AS count FROM users WHERE created_at < ?",
      [nextDay.toISOString()],
    );
    const activeUsers = await dbGet(
      `SELECT COUNT(DISTINCT user_id) AS count
       FROM user_tokens
       WHERE created_at >= ? AND created_at < ? AND expires_at > ?`,
      [day.toISOString(), nextDay.toISOString(), nowIso()],
    );
    const recharge = await dbGet(
      "SELECT COALESCE(SUM(amount), 0) AS amount FROM recharge_orders WHERE created_at >= ? AND created_at < ?",
      [day.toISOString(), nextDay.toISOString()],
    );

    const rechargeAmount = toYuan(recharge.amount);
    userNewSeries.push(Number(newUsers.count || 0));
    userTotalSeries.push(Number(totalUsers.count || 0));
    userActiveSeries.push(Number(activeUsers.count || 0));
    rechargeSeries.push(rechargeAmount);
    commissionSeries.push(0);
    profitSeries.push(rechargeAmount);
  }

  const totalUsers = await dbGet("SELECT COUNT(*) AS count FROM users");
  const todayUsers = await dbGet(
    "SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?",
    [today.toISOString(), tomorrow.toISOString()],
  );
  const activeUsers = await dbGet(
    "SELECT COUNT(DISTINCT user_id) AS count FROM user_tokens WHERE expires_at > ?",
    [nowIso()],
  );
  const rechargeTotal = await dbGet("SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM recharge_orders");
  const rechargeToday = await dbGet(
    "SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM recharge_orders WHERE created_at >= ? AND created_at < ?",
    [today.toISOString(), tomorrow.toISOString()],
  );
  const rechargeWeek = await dbGet(
    "SELECT COALESCE(SUM(amount), 0) AS amount FROM recharge_orders WHERE created_at >= ?",
    [weekStart.toISOString()],
  );

  const totalRechargeYuan = toYuan(rechargeTotal.amount);
  const todayRechargeYuan = toYuan(rechargeToday.amount);
  const weekRechargeYuan = toYuan(rechargeWeek.amount);

  return success(res, {
    users: {
      total: Number(totalUsers.count || 0),
      todayNew: Number(todayUsers.count || 0),
      activeCount: Number(activeUsers.count || 0),
      totalTrend: {
        percent: trendPercent(userTotalSeries),
        series: userTotalSeries,
        categories,
      },
      newTrend: {
        percent: trendPercent(userNewSeries),
        series: userNewSeries,
        categories,
      },
      activeTrend: {
        percent: trendPercent(userActiveSeries),
        series: userActiveSeries,
        categories,
      },
    },
    bloggers: {
      xhs: { total: 0 },
      douyin: { total: 0 },
      totalTrend: {
        percent: 0,
        series: categories.map(() => 0),
        categories,
      },
    },
    finance: {
      recharge: {
        totalAmountYuan: totalRechargeYuan,
        todayAmountYuan: todayRechargeYuan,
        weekAmountYuan: weekRechargeYuan,
        todayOrders: Number(rechargeToday.count || 0),
        totalOrders: Number(rechargeTotal.count || 0),
        trend: {
          series: rechargeSeries,
          categories,
        },
      },
      commission: {
        totalAmountYuan: 0,
        settledAmountYuan: 0,
        pendingAmountYuan: 0,
        pendingCount: 0,
        failedCount: 0,
        trend: {
          series: commissionSeries,
          categories,
        },
      },
      profit: {
        totalProfitYuan: totalRechargeYuan,
        todayProfitYuan: todayRechargeYuan,
        weekProfitYuan: weekRechargeYuan,
        trend: {
          series: profitSeries,
          categories,
        },
      },
    },
  });
}));

app.use((req, res) => {
  logWarn("route_not_found", requestLogInfo(req));
  return fail(res, 404, "接口不存在");
});

app.use((err, req, res, next) => {
  console.error(err);
  logError("request_error", {
    ...requestLogInfo(req),
    error: err,
  });
  return res.status(500).json({
    code: 500,
    message: "服务器内部错误",
    data: process.env.NODE_ENV === "production" ? null : { error: err.message },
  });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      logInfo("server_started", {
        port: PORT,
        baseUrl: BASE_URL,
        dbPath: DB_PATH,
        logDir: LOG_DIR,
        nodeEnv: process.env.NODE_ENV || "development",
      });
      console.log(`red-magic-api listening on http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    logError("database_init_failed", { error: err });
    process.exit(1);
  });

process.on("unhandledRejection", (reason) => {
  logError("unhandled_rejection", {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logError("uncaught_exception", { error: err });
  console.error("Uncaught exception:", err);
  process.exit(1);
});
