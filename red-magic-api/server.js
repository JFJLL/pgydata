require("dotenv").config();

const crypto = require("crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const { loadReleaseManifest, normalizeSha256 } = require("./lib/release-manifest");
const { runMigrations } = require("./lib/database-migrations");
const { createSmsService, SmsServiceError } = require("./lib/sms-service");
const { createAlipayGateway, isSuccessfulTradeStatus, normalizeNotification } = require("./lib/alipay-gateway");
const { createWxpayGateway, normalizeNotification: normalizeWxpayNotification } = require("./lib/wxpay-gateway");
const { ORDER_STATUS, SettlementError, settleRechargeOrder } = require("./lib/recharge-settlement");
const { TaskAuthorizationService } = require("./lib/task-authorization-service");
const {
  claimPendingOrder,
  centsFromAmount,
  isDefinitiveUnpaidStatus,
  reconcileOnce,
  setQueryStatus,
} = require("./lib/recharge-reconciliation");

const app = express();
const PORT = Number(process.env.PORT || 3050);
const BASE_URL = (process.env.BASE_URL || "https://magiorix.red-magic.cn").replace(/\/$/, "");
const REGISTER_BONUS_POINTS = 100;
const AUTH_FAILURE_MESSAGE = "手机号或密码错误";
const REGISTRATION_FAILURE_MESSAGE = "注册信息不可用";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "red-magic-api.sqlite");
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const ASSET_VERSION = "1.2.0";
const INSTALLER_FILE_NAME = "magiorix-desktop-1.2.0-windows.exe";
const INSTALLER_DOWNLOAD_URL = "https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-1.2.0-windows.exe";
const INSTALLER_SHA256 = (process.env.INSTALLER_SHA256 || "").trim();
const RELEASE_MANIFEST_PATH = process.env.RELEASE_MANIFEST_PATH
  || path.join(__dirname, "public", "releases", "windows", "latest.json");
const RELEASE_MANIFEST = loadReleaseManifest(RELEASE_MANIFEST_PATH);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const taskAuthService = new TaskAuthorizationService({
  db: {
    get: dbGet,
    all: dbAll,
    run: dbRun,
  },
  clock: nowIso,
});
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const ADMIN_PASSWORD_PLACEHOLDERS = new Set([
  "replace-me-with-a-long-random-password",
  "请改成强密码",
  "change-me",
  "changeme",
]);
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const LOG_IP_HASH_SECRET = String(
  process.env.LOG_IP_HASH_SECRET
    || process.env.SMS_IP_HASH_SECRET
    || process.env.SMS_SECRET
    || crypto.randomBytes(32).toString("hex"),
);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, "public", "assets", "desktop", ASSET_VERSION), { recursive: true });
fs.mkdirSync(path.join(__dirname, "public", "downloads"), { recursive: true });

const db = new sqlite3.Database(DB_PATH);
db.configure("busyTimeout", Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 5000));

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
    path: requestLogPath(req),
    ip: redactIp(req.ip),
    userAgent: req.get("user-agent") || "",
  };
}

function requestLogPath(req) {
  if (req.route?.path) return String(req.route.path);
  const requestPath = String(req.path || "");
  if (requestPath === "/pay" || requestPath.startsWith("/pay/")) return "/pay/:paymentToken";
  return requestPath;
}

function redactIp(value) {
  const ip = String(value || "").trim();
  if (!ip) return "-";
  return `hmac-sha256:${crypto.createHmac("sha256", LOG_IP_HASH_SECRET).update(ip).digest("hex").slice(0, 16)}`;
}

function rawDbRun(sql, params = []) {
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

const database = {
  run: rawDbRun,
  get: dbGet,
  all: dbAll,
};

let mutationTail = Promise.resolve();
const mutationContext = new AsyncLocalStorage();

function dbRun(sql, params = []) {
  return withMutation((tx) => tx.run(sql, params));
}

function withMutation(callback) {
  if (mutationContext.getStore()) {
    return Promise.reject(new Error("禁止在 mutation 调度器内部再次排队"));
  }
  const operation = mutationTail.then(() => mutationContext.run({ active: true }, () => callback(database)));
  mutationTail = operation.catch(() => {});
  return operation;
}

function withTransaction(callback) {
  return withMutation(async (tx) => {
    await tx.run("BEGIN IMMEDIATE TRANSACTION");
    try {
      const result = await callback(tx);
      await tx.run("COMMIT");
      return result;
    } catch (error) {
      await tx.run("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

function success(res, data = {}, message = "操作成功") {
  return res.json({ code: 200, message, data });
}

function fail(res, code, message, data = null) {
  return res.json({ code, message, data });
}

function failHttp(res, httpCode, code, message, data = null) {
  return res.status(httpCode).json({ code, message, data });
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
  return truncateString(`${req.method} ${req.path} ip=${redactIp(req.ip)}`, 240);
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

function centsToYuan(value) {
  const cents = Number(value || 0);
  return Number.isFinite(cents) ? Number((cents / 100).toFixed(2)) : 0;
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
        {
          id: "pgy-kol-search",
          name: "找博主",
          icon: "solar:users-group-rounded-bold-duotone",
          path: "/pgy-kol-search",
          component: "pages/pgy-kol-search/index.tsx",
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
    {
      id: "points",
      name: "积分中心",
      icon: "solar:wallet-bold-duotone",
      children: [
        {
          id: "points-recharge",
          name: "积分充值",
          icon: "solar:card-2-bold-duotone",
          path: "/shumiao/recharge",
          component: "pages/shumiao/recharge/index.tsx",
        },
        {
          id: "points-records",
          name: "充值记录",
          icon: "solar:history-bold-duotone",
          path: "/shumiao/records",
          component: "pages/shumiao/records/index.tsx",
        },
        {
          id: "points-consume-records",
          name: "消耗记录",
          icon: "solar:bill-list-bold-duotone",
          path: "/shumiao/consume-records",
          component: "pages/shumiao/consume-records/index.tsx",
        },
      ],
    },
  ];
}

async function initDb() {
  await withMutation(() => runMigrations(database));
}

async function ensureAccount(userId, initialBalance = 0, tx = database) {
  const existing = await tx.get("SELECT * FROM shumiao_accounts WHERE user_id = ?", [userId]);
  if (existing) return existing;

  const createdAt = nowIso();
  await tx.run(
    `INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [userId, initialBalance, createdAt, createdAt],
  );
  return tx.get("SELECT * FROM shumiao_accounts WHERE user_id = ?", [userId]);
}

async function issueToken(userId, tx = database) {
  const token = crypto.randomBytes(32).toString("hex");
  await tx.run(
    `INSERT INTO user_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [userId, token, addDaysIso(30), nowIso()],
  );
  return token;
}

async function buildLoginDataInMutation(user, tx) {
  const account = await ensureAccount(user.id, 0, tx);
  const token = await issueToken(user.id, tx);
  return {
    token,
    userInfo: toUserInfo(user, account),
  };
}

async function buildLoginData(user) {
  return withTransaction((tx) => buildLoginDataInMutation(user, tx));
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

const smsService = createSmsService({
  db: database,
  withTransaction,
  secret: process.env.SMS_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-sms-secret"),
  ipSecret: process.env.SMS_IP_HASH_SECRET || process.env.SMS_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-ip-secret"),
});

const smsEnabled = process.env.NODE_ENV === "test"
  ? process.env.SMS_TEST_MODE === "1"
  : process.env.SMS_ENABLED === "1";

const alipayEnabled = process.env.NODE_ENV === "test"
  ? process.env.PAYMENT_TEST_MODE === "1"
  : process.env.ALIPAY_ENABLED === "1";
const wxpayEnabled = process.env.NODE_ENV === "test"
  ? process.env.PAYMENT_TEST_MODE === "1" && process.env.WXPAY_TEST_MODE === "1"
  : process.env.WXPAY_ENABLED === "1";
const paymentEnabled = alipayEnabled || wxpayEnabled;
let alipayGateway;
try {
  alipayGateway = alipayEnabled
    ? createAlipayGateway()
    : {
      config: { appId: "", merchantId: "" },
      async createPagePay() { throw new Error("支付宝支付功能未开启"); },
      async verifyNotification() { return false; },
      async queryTrade() { throw new Error("支付宝查询功能未开启"); },
    };
} catch (error) {
  console.warn("支付宝网关初始化跳过（本地环境缺少证书文件）:", error.message);
  alipayGateway = {
    config: { appId: "", merchantId: "" },
    async createPagePay() { throw new Error("本地环境缺少支付宝证书，无法调起真实支付"); },
    async verifyNotification() { return false; },
    async queryTrade() { throw new Error("本地环境缺少支付宝证书，无法查询真实交易"); },
  };
}

let wxpayGateway;
try {
  wxpayGateway = wxpayEnabled
    ? createWxpayGateway()
    : {
      config: { appId: "", mchId: "" },
      async createQrCode() { throw new Error("微信支付功能未开启"); },
      async verifyNotify() { return false; },
      async decryptNotifyResource() { throw new Error("微信支付功能未开启"); },
      async queryOrder() { throw new Error("微信支付查询功能未开启"); },
    };
} catch (error) {
  console.warn("微信支付网关初始化跳过（本地环境缺少证书文件）:", error.message);
  wxpayGateway = {
    config: { appId: "", mchId: "" },
    async createQrCode() { throw new Error("本地环境缺少微信证书，无法调起真实支付"); },
    async verifyNotify() { return false; },
    async decryptNotifyResource() { throw new Error("本地环境缺少微信证书"); },
    async queryOrder() { throw new Error("本地环境缺少微信证书，无法查询真实交易"); },
  };
}

function trustProxyValue() {
  if (!TRUST_PROXY) return false;
  if (/^\d+$/.test(TRUST_PROXY)) return false;
  return TRUST_PROXY.split(",").map((item) => item.trim()).filter(Boolean);
}

function isAdminPasswordConfigured() {
  return Boolean(
    ADMIN_PASSWORD
    && !ADMIN_PASSWORD_PLACEHOLDERS.has(ADMIN_PASSWORD.toLowerCase()),
  );
}

app.set("trust proxy", trustProxyValue());
// WeChat Pay signs the exact raw request body, so the notify endpoint must
// capture it as a Buffer before the JSON parser runs for every other route.
app.use("/api/shumiao/wxpay/notify", express.raw({ type: "*/*", limit: "1mb" }));
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
app.get("/recharge", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(path.join(__dirname, "public", "recharge", "index.html"));
});
app.use("/recharge", express.static(path.join(__dirname, "public", "recharge")));

function setPaymentHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action https://*.alipay.com https://*.alipayobjects.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
}

function paymentResultPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>支付结果 - magiorix</title>
<style>
  :root{--brand:#d84444;--text:#120f10;--muted:#6b7280;--bg:#faf7f5;--card:#fff;--green:#16a34a;--amber:#b45309}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Inter","Microsoft YaHei","PingFang SC",Arial,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;align-items:center;justify-content:center}
  main{width:100%;max-width:420px;margin:24px;padding:32px;background:var(--card);border:1px solid #eee8e6;border-radius:16px;box-shadow:0 12px 32px rgba(18,15,16,.06);text-align:center}
  .brand{font-size:14px;font-weight:700;letter-spacing:.4px;margin-bottom:22px}
  .brand b{color:var(--brand)}
  h1{font-size:20px;margin:0 0 8px}
  .sub{color:var(--muted);font-size:13px;margin:0 0 20px;line-height:1.6}
  .status{margin:20px 0;font-size:14px;min-height:20px;line-height:1.6}
  .status.paid{color:var(--green);font-weight:700}
  .status.pending{color:var(--amber)}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#f59e0b}
  .dot.green{background:var(--green)}
  button{width:100%;padding:12px 16px;border:0;border-radius:10px;background:var(--brand);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button.secondary{background:#fff;color:var(--text);border:1px solid #eee8e6;margin-top:10px}
</style>
</head>
<body>
<main>
  <div class="brand">Σ.<b>magiorix</b></div>
  <h1>支付结果</h1>
  <p class="sub">正在与支付平台确认订单状态，请稍候…</p>
  <div id="status" class="status pending"><span class="dot"></span>支付结果确认中…</div>
  <button id="recordsBtn" style="display:none">查看充值记录</button>
  <button id="centerBtn" class="secondary" style="display:none">返回充值中心</button>
</main>
<script>
(function(){
  var orderNo = new URLSearchParams(location.search).get("out_trade_no") || "";
  var center = location.origin + "/recharge";
  var records = center + "#/records/recharge";
  function readToken(){
    try{
      var raw = localStorage.getItem("magiorix-recharge-auth");
      if(!raw) return "";
      var parsed = JSON.parse(raw);
      return parsed && parsed.token ? String(parsed.token) : "";
    }catch(e){ return ""; }
  }
  var statusEl = document.getElementById("status");
  var recordsBtn = document.getElementById("recordsBtn");
  var centerBtn = document.getElementById("centerBtn");
  function setStatus(text, paid){
    statusEl.className = "status " + (paid ? "paid" : "pending");
    statusEl.innerHTML = '<span class="dot' + (paid ? " green" : "") + '"></span>' + String(text).replace(/[<>&"]/g, function(ch){
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[ch];
    });
    centerBtn.style.display = "block";
  }
  function showPaid(){
    setStatus("支付成功，积分已到账", true);
    recordsBtn.style.display = "block";
  }
  recordsBtn.addEventListener("click", function(){ location.href = records; });
  centerBtn.addEventListener("click", function(){ location.href = center; });
  if(!orderNo){ setStatus("缺少订单号，请返回充值中心查看订单状态", false); return; }
  var token = readToken();
  if(!token){ setStatus("未登录，请返回充值中心查看订单状态", false); return; }
  var startedAt = Date.now();
  var queryAt = 0;
  var attempts = 0;
  function tick(){
    attempts += 1;
    var url = "/api/shumiao/order/" + encodeURIComponent(orderNo);
    fetch(url, { headers: { satoken: token } })
      .then(function(res){ return res.json().catch(function(){ return {}; }); })
      .then(function(payload){
        if(!payload || payload.code !== 200) throw new Error(payload.message || "查询失败");
        var order = payload.data || {};
        if(Number(order.status) === 1){ showPaid(); return; }
        if(Number(order.status) === 2){ setStatus("订单已关闭", false); return; }
        if(Date.now() - startedAt >= 15000 && Date.now() - queryAt >= 15000){
          queryAt = Date.now();
          fetch(url + "/query", { method: "POST", headers: { satoken: token } }).catch(function(){});
        }
      })
      .catch(function(){})
      .then(function(){
        if(attempts >= 60){ setStatus("支付结果暂未确认，请返回充值中心刷新订单", false); return; }
        setTimeout(tick, 3000);
      });
  }
  tick();
})();
</script>
</body>
</html>`;
}

app.get("/pay/return", (req, res) => {
  setPaymentHeaders(res);
  // 结果页需要轮询同源 API，放开 connect-src 到同源；其余保持与支付页一致的严格 CSP。
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action https://*.alipay.com https://*.alipayobjects.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  return res.type("html").send(paymentResultPageHtml());
});

app.get("/pay/:paymentToken", asyncHandler(async (req, res) => {
  setPaymentHeaders(res);
  const paymentToken = String(req.params.paymentToken || "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(paymentToken)) return res.status(404).send("Not found");
  const order = await dbGet("SELECT * FROM recharge_orders WHERE payment_token_hash = ?", [hashPaymentToken(paymentToken)]);
  if (!order) return res.status(404).send("Not found");
  if (Number(order.status) === ORDER_STATUS.CREDITED) {
    return res.type("html").send("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>支付结果</title></head><body><main><h1>结果确认中</h1><p>订单状态将由客户端刷新确认。</p></main></body></html>");
  }
  if (order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
    return res.status(410).send("订单已过期，请返回客户端重新创建订单");
  }
  if (String(order.channel || "alipay") !== "alipay") {
    return res.type("html").status(400).send("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>支付结果</title></head><body><main><h1>请在客户端完成支付</h1><p>该订单使用微信支付，请返回客户端扫描二维码完成付款。</p></main></body></html>");
  }
  if (!alipayEnabled) return res.status(503).send("支付宝支付暂未开启");
  const page = await alipayGateway.createPagePay({
    orderNo: order.order_no,
    amountCents: Number(order.amount_cents),
    subject: `积分充值 ${Number(order.total_count)} 积分`,
    expiresAt: order.expires_at,
  });
  if (/^https?:\/\//i.test(String(page || ""))) return res.redirect(302, page);
  return res.type("html").send(String(page || ""));
}));

app.post("/api/shumiao/alipay/notify", asyncHandler(async (req, res) => {
  if (!alipayEnabled) return res.status(503).send("failure");
  const verified = await alipayGateway.verifyNotification(req.body || {});
  if (!verified) return res.status(400).send("failure");
  const notification = normalizeNotification(req.body || {});
  const status = notification.tradeStatus;
  if (!isSuccessfulTradeStatus(status)) {
    if (status === "TRADE_CLOSED" && notification.outTradeNo) {
      await withMutation(() => setQueryStatus({ db: database, orderNo: notification.outTradeNo, status, close: true }));
    }
    return res.send("success");
  }
  const amountCents = centsFromAmount(notification.totalAmount);
  if (!amountCents || !notification.tradeNo || !notification.outTradeNo
    || !notification.sellerId || !notification.appId) return res.status(400).send("failure");
  try {
    await settleRechargeOrder({
      db: database,
      withTransaction,
      source: "alipay-notify",
      orderNo: notification.outTradeNo,
      channel: "alipay",
      amountCents,
      merchantId: notification.sellerId,
      appId: notification.appId,
      transactionId: notification.tradeNo,
      paidAt: notification.gmtPayment,
    });
    return res.send("success");
  } catch (error) {
    if (error instanceof SettlementError) return res.status(400).send("failure");
    throw error;
  }
}));

app.post("/api/shumiao/wxpay/notify", asyncHandler(async (req, res) => {
  if (!wxpayEnabled) {
    return res.status(503).json({ code: "FAIL", message: "微信支付暂未开启" });
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  const verified = await wxpayGateway.verifyNotify({ headers: req.headers, rawBody });
  if (!verified) {
    logWarn("wxpay_notify_bad_signature", { ...requestLogInfo(req) });
    return res.status(400).json({ code: "FAIL", message: "签名验证失败" });
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ code: "FAIL", message: "通知体格式错误" });
  }
  if (!payload?.resource) {
    return res.status(400).json({ code: "FAIL", message: "缺少加密资源" });
  }
  let decrypted;
  try {
    decrypted = wxpayGateway.decryptNotifyResource(payload.resource);
  } catch (error) {
    logWarn("wxpay_notify_decrypt_failed", { ...requestLogInfo(req), error: error.message });
    return res.status(400).json({ code: "FAIL", message: "资源解密失败" });
  }
  const notification = normalizeWxpayNotification(decrypted);
  const status = notification.tradeStatus;
  if (!isSuccessfulTradeStatus(status)) {
    if (status === "TRADE_CLOSED" && notification.outTradeNo) {
      await withMutation(() => setQueryStatus({ db: database, orderNo: notification.outTradeNo, status, close: true }));
    }
    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  }
  const amountFen = Number(decrypted?.amount?.total ?? 0);
  if (!Number.isSafeInteger(amountFen) || amountFen <= 0 || !notification.tradeNo || !notification.outTradeNo
    || !notification.sellerId || !notification.appId) {
    return res.status(400).json({ code: "FAIL", message: "交易信息不完整" });
  }
  try {
    await settleRechargeOrder({
      db: database,
      withTransaction,
      source: "wxpay-notify",
      orderNo: notification.outTradeNo,
      channel: "wxpay",
      amountCents: amountFen,
      merchantId: notification.sellerId,
      appId: notification.appId,
      transactionId: notification.tradeNo,
      paidAt: notification.gmtPayment,
    });
    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    if (error instanceof SettlementError) return res.status(400).json({ code: "FAIL", message: error.message });
    throw error;
  }
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");

  if (!phone || !password) return fail(res, 400, "手机号和密码不能为空");

  const user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  if (Number(user.status) !== 1) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  if (!user.password_hash) return fail(res, 400, AUTH_FAILURE_MESSAGE);

  let passwordOk = false;
  if (user.password_hash.startsWith("$2")) {
    passwordOk = await bcrypt.compare(password, user.password_hash);
  } else {
    passwordOk = password === user.password_hash;
    if (passwordOk) {
      await dbRun("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
        await bcrypt.hash(password, 10),
        nowIso(),
        user.id,
      ]);
    }
  }

  if (!passwordOk) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  return success(res, await buildLoginData(user));
}));

app.post("/api/auth/sms/send", asyncHandler(async (req, res) => {
  if (!smsEnabled) return failHttp(res, 503, 503, "短信服务暂未开启，请稍后再试");
  const phone = normalizePhone(req.body.phone);
  const purpose = String(req.body.purpose || "").trim().toLowerCase();
  if (!phone) return fail(res, 400, "手机号格式不正确");
  if (!["register", "reset_password"].includes(purpose)) return fail(res, 400, "验证码用途不合法");

  const existing = await dbGet("SELECT id, status FROM users WHERE phone = ?", [phone]);
  if (purpose === "register" && existing) {
    return fail(res, 400, REGISTRATION_FAILURE_MESSAGE);
  }
  if (purpose === "reset_password" && (!existing || Number(existing.status) !== 1)) {
    return success(res, {}, "如果账号存在，验证码已发送");
  }

  try {
    const result = await smsService.send({ phone, purpose, ip: req.ip });
    if (!result.sent) return failHttp(res, 503, 503, "验证码发送失败，请稍后重试");
    return success(res, {
      ...(result.debugCode ? { debugCode: result.debugCode } : {}),
    }, "如果账号存在，验证码已发送");
  } catch (error) {
    if (error instanceof SmsServiceError) return fail(res, 400, error.message);
    throw error;
  }
}));

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const password = req.body.password;
  if (!phone) return fail(res, 400, "手机号格式不正确");
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail(res, 400, "手机号格式不正确");
  if (typeof password !== "string" || password.length < 8 || password.length > 64) {
    return fail(res, 400, "密码长度必须在 8 到 64 个字符之间");
  }
  // 注册默认使用密码，不再强制短信验证码；仅当调用方显式携带验证码时才校验。
  if (code && !/^\d{4}$/.test(code)) return fail(res, 400, "验证码错误或已失效");
  if (await dbGet("SELECT id FROM users WHERE phone = ?", [phone])) return fail(res, 400, REGISTRATION_FAILURE_MESSAGE);

  try {
    if (code) await smsService.checkCode({ phone, purpose: "register", code });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await withTransaction(async (tx) => {
      if (await tx.get("SELECT id FROM users WHERE phone = ?", [phone])) {
        throw new SmsServiceError("already_registered", REGISTRATION_FAILURE_MESSAGE);
      }
      if (code) await smsService.consumeCodeInTransaction(tx, { phone, purpose: "register", code });
      const createdAt = nowIso();
      const result = await tx.run(
        `INSERT INTO users (phone, password_hash, nickname, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [phone, passwordHash, `用户${phone.slice(-4)}`, createdAt, createdAt],
      );
      await tx.run(
        `INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [result.lastID, REGISTER_BONUS_POINTS, createdAt, createdAt],
      );
      return tx.get("SELECT * FROM users WHERE id = ?", [result.lastID]);
    });
    return success(res, await buildLoginData(user), "注册成功");
  } catch (error) {
    if (error instanceof SmsServiceError) return fail(res, 400, error.message);
    throw error;
  }
}));

app.post("/api/auth/password/reset", asyncHandler(async (req, res) => {
  if (!smsEnabled) return failHttp(res, 503, 503, "短信服务暂未开启，请稍后再试");
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const newPassword = req.body.newPassword;
  if (!phone) return fail(res, 400, "手机号格式不正确");
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 64) {
    return fail(res, 400, "新密码长度必须在 8 到 64 个字符之间");
  }
  if (!/^\d{4}$/.test(code)) return fail(res, 400, "验证码错误或已失效");
  const existing = await dbGet("SELECT id, status FROM users WHERE phone = ?", [phone]);
  if (!existing || Number(existing.status) !== 1) return success(res, {}, "如果账号存在，密码已重置");

  try {
    await smsService.checkCode({ phone, purpose: "reset_password", code });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await withTransaction(async (tx) => {
      const user = await tx.get("SELECT id, status FROM users WHERE phone = ?", [phone]);
      if (!user || Number(user.status) !== 1) return null;
      await smsService.consumeCodeInTransaction(tx, { phone, purpose: "reset_password", code });
      const updatedAt = nowIso();
      await tx.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [passwordHash, updatedAt, user.id]);
      const revoked = await tx.run("DELETE FROM user_tokens WHERE user_id = ?", [user.id]);
      return { revokedTokens: Number(revoked.changes || 0) };
    });
    return success(res, result || {}, "如果账号存在，密码已重置");
  } catch (error) {
    if (error instanceof SmsServiceError) return fail(res, 400, error.message);
    throw error;
  }
}));

app.post("/api/auth/sms/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");
  if (!phone) return fail(res, 400, "手机号不能为空");
  if (!password) return fail(res, 400, "密码不能为空");

  const user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  if (Number(user.status) !== 1) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  if (!user.password_hash) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  const passwordOk = user.password_hash.startsWith("$2")
    ? await bcrypt.compare(password, user.password_hash)
    : password === user.password_hash;
  if (!passwordOk) return fail(res, 400, AUTH_FAILURE_MESSAGE);
  if (!user.password_hash.startsWith("$2")) {
    user.password_hash = await bcrypt.hash(password, 10);
    await withTransaction((tx) => tx.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [user.password_hash, nowIso(), user.id]));
  }
  return success(res, await buildLoginData(user));
}));

app.get("/api/auth/info", authRequired, asyncHandler(async (req, res) => {
  const account = await withMutation((tx) => ensureAccount(req.user.id, 0, tx));
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
  const account = await withMutation((tx) => ensureAccount(req.user.id, 0, tx));
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
  await withTransaction(async (tx) => {
    await tx.run(
      "UPDATE users SET status = 0, deleted_at = ?, updated_at = ? WHERE id = ?",
      [deletedAt, deletedAt, req.user.id],
    );
    await tx.run("DELETE FROM user_tokens WHERE user_id = ?", [req.user.id]);
  });
  return success(res, { deletedAt }, "账号已注销");
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

  try {
    await withTransaction(async (tx) => {
    if (isDefault) {
      await tx.run(
        "UPDATE export_templates SET is_default = 0, updated_at = ? WHERE user_id = ? AND platform = ?",
        [createdAt, req.user.id, payload.platform],
      );
    }
    await tx.run(
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
    });
  } catch (err) {
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

  try {
    await withTransaction(async (tx) => {
      if (setDefault) {
        await tx.run(
        "UPDATE export_templates SET is_default = 0, updated_at = ? WHERE user_id = ? AND platform = ?",
        [updatedAt, req.user.id, current.platform],
      );
      }
      values.push(updatedAt, req.params.id, req.user.id);
      await tx.run(
        `UPDATE export_templates SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`,
        values,
      );
    });
  } catch (err) {
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

function hashPaymentToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createPaymentToken() {
  return crypto.randomBytes(32).toString("base64url");
}

const FIRST_RECHARGE_PROMO_CODE = "first_recharge_v1";

function isFirstRechargePromoEnabled() {
  return process.env.FIRST_RECHARGE_PROMO_ENABLED !== "0";
}

function calculateFirstRechargeBonus(amountCents, baseCount) {
  if (!isFirstRechargePromoEnabled()) return 0;
  if (Number(amountCents) < 5000) return 0;
  return Math.min(300, Math.floor(Number(baseCount) * 0.20));
}

async function checkUserFirstRechargeEligible(userId, txOrDb) {
  const db = txOrDb || database;
  const paidRow = await db.get(
    "SELECT COUNT(*) AS count FROM recharge_orders WHERE user_id = ? AND status = 1",
    [userId],
  );
  return Number(paidRow?.count || 0) === 0;
}

function paymentOrderView(row) {
  if (!row) return null;
  const status = Number(row.status ?? 0);
  const amount = Number(row.amount || 0);
  const amountCents = Number(row.amountCents ?? row.amount_cents ?? 0);
  const orderNo = row.orderNo || row.order_no;
  return {
    id: orderNo,
    orderNo,
    packageId: row.packageId || row.package_id,
    amount,
    amountCents,
    amountYuan: Number.isFinite(amountCents) && amountCents > 0 ? amountCents / 100 : amount,
    baseCount: Number(row.baseCount ?? row.base_count ?? 0),
    giftCount: Number(row.giftCount ?? row.gift_count ?? 0),
    promotionCode: row.promotionCode || row.promotion_code || null,
    promotionCount: Number(row.promotionCount ?? row.promotion_count ?? 0),
    totalCount: Number(row.totalCount ?? row.total_count ?? 0),
    channel: row.channel || "alipay",
    status,
    statusText: status === ORDER_STATUS.CREDITED ? "已到账" : status === ORDER_STATUS.CLOSED ? "已关闭" : "待支付",
    platformTransactionId: row.platformTransactionId || row.platform_transaction_id || null,
    paidAt: row.paidAt || row.paid_at || null,
    creditedAt: row.creditedAt || row.credited_at || null,
    expiresAt: row.expiresAt || row.expires_at || null,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    lastQueryAt: row.lastQueryAt || row.last_query_at || null,
    lastQueryStatus: row.lastQueryStatus || row.last_query_status || null,
    expiryQueryAt: row.expiryQueryAt || row.expiry_query_at || null,
    manualReviewReason: row.manualReviewReason || row.manual_review_reason || null,
  };
}

app.get("/api/shumiao/balance", authRequired, asyncHandler(async (req, res) => {
  const account = await withMutation((tx) => ensureAccount(req.user.id, 0, tx));
  return success(res, { balance: Number(account.balance || 0) });
}));

app.get("/api/shumiao/packages", authRequired, asyncHandler(async (req, res) => {
  const eligible = isFirstRechargePromoEnabled() && (await checkUserFirstRechargeEligible(req.user.id));
  const rows = await dbAll(
    `SELECT id, id AS packageId, title, scene, recommended, amount, amount_cents AS amountCents,
            base_count AS baseCount, base_count AS shumiaoCount,
            gift_count AS giftCount, total_count AS totalCount
     FROM shumiao_packages
     WHERE enabled = 1
     ORDER BY sort_order ASC, amount ASC`,
  );
  const result = rows.map((pkg) => {
    const baseCount = Number(pkg.baseCount || 0);
    const giftCount = Number(pkg.giftCount || 0);
    const regularTotalCount = baseCount + giftCount;
    const promoCount = eligible ? calculateFirstRechargeBonus(pkg.amountCents, baseCount) : 0;
    const payableTotalCount = regularTotalCount + promoCount;
    return {
      id: pkg.id,
      packageId: pkg.id,
      title: pkg.title,
      scene: pkg.scene || "",
      recommended: Boolean(pkg.recommended),
      amount: Number(pkg.amount),
      amountCents: Number(pkg.amountCents),
      baseCount,
      shumiaoCount: baseCount,
      giftCount,
      regularTotalCount,
      totalCount: regularTotalCount,
      promotionCode: promoCount > 0 ? FIRST_RECHARGE_PROMO_CODE : null,
      promotionCount: promoCount,
      payableTotalCount,
      firstRechargeEligible: eligible,
    };
  });
  return success(res, result);
}));

app.get("/api/shumiao/check-balance", authRequired, asyncHandler(async (req, res) => {
  const count = parsePositiveAmount(req.query.count) || 0;
  const account = await withMutation((tx) => ensureAccount(req.user.id, 0, tx));
  const balance = Number(account.balance || 0);
  return success(res, {
    balance,
    required: count,
    shortage: Math.max(0, count - balance),
    sufficient: balance >= count,
  });
}));


// ==================== 1.4.2 任务授权与设备登记 API ====================

app.post("/api/desktop/devices/register", authRequired, asyncHandler(async (req, res) => {
  const { deviceKeyId, signingPublicKey, clientVersion, deviceName } = req.body;
  if (!deviceKeyId || !signingPublicKey) {
    return fail(res, 400, "缺少设备公钥或标识");
  }
  const result = await taskAuthService.registerDevice({
    userId: req.user.id,
    deviceKeyId,
    signingPublicKey,
    clientVersion: clientVersion || req.get("x-magiorix-client-version") || "1.4.2",
    deviceName,
  });
  return ok(res, result);
}));

app.get("/api/desktop/devices/current", authRequired, asyncHandler(async (req, res) => {
  const deviceKeyId = req.query.deviceKeyId || req.get("x-device-key-id");
  if (!deviceKeyId) return fail(res, 400, "缺少 deviceKeyId 参数");
  const device = await taskAuthService.getDevice(req.user.id, deviceKeyId);
  if (!device) return fail(res, 404, "设备未注册");
  return ok(res, device);
}));

app.post("/api/desktop/devices/:id/revoke", authRequired, asyncHandler(async (req, res) => {
  await dbRun(
    "UPDATE desktop_devices SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [nowIso(), nowIso(), req.params.id, req.user.id]
  );
  return ok(res, { revoked: true });
}));

app.post("/api/desktop/task-authorizations", authRequired, asyncHandler(async (req, res) => {
  const { clientTaskId, deviceKeyId, taskType, taskDigest, requestedItems, clientVersion } = req.body;
  if (!clientTaskId || !deviceKeyId || !taskType || !taskDigest || !requestedItems) {
    return fail(res, 400, "缺少必填授权参数");
  }
  try {
    const result = await taskAuthService.createAuthorization({
      userId: req.user.id,
      deviceKeyId,
      clientTaskId,
      taskType,
      taskDigest,
      requestedItems,
      clientVersion: clientVersion || req.get("x-magiorix-client-version") || "1.4.2",
      ipHash: logIpHash(req),
    });
    return ok(res, result);
  } catch (err) {
    if (err.statusCode) {
      return fail(res, err.statusCode, err.message, { code: err.code });
    }
    throw err;
  }
}));

app.get("/api/desktop/task-authorizations/by-client-task/:clientTaskId", authRequired, asyncHandler(async (req, res) => {
  const auth = await dbGet(
    "SELECT * FROM task_authorizations WHERE user_id = ? AND client_task_id = ?",
    [req.user.id, req.params.clientTaskId]
  );
  if (!auth) return fail(res, 404, "未找到该任务授权");
  return ok(res, auth);
}));

app.post("/api/desktop/task-authorizations/:id/start", authRequired, asyncHandler(async (req, res) => {
  const result = await taskAuthService.startAuthorization({
    userId: req.user.id,
    authorizationId: req.params.id,
  });
  return ok(res, result);
}));

app.post("/api/desktop/task-authorizations/:id/heartbeat", authRequired, asyncHandler(async (req, res) => {
  try {
    const result = await taskAuthService.heartbeatAuthorization({
      userId: req.user.id,
      authorizationId: req.params.id,
    });
    return ok(res, result);
  } catch (err) {
    return fail(res, err.statusCode || 400, err.message, { code: err.code || "task-authorization-heartbeat-rejected" });
  }
}));

app.post("/api/desktop/task-authorizations/:id/complete", authRequired, asyncHandler(async (req, res) => {
  const finalReceipt = req.body.finalReceipt || req.body;
  const result = await taskAuthService.completeAuthorization({
    userId: req.user.id,
    authorizationId: req.params.id,
    finalReceipt,
  });
  return ok(res, result);
}));

app.post("/api/desktop/task-authorizations/:id/cancel", authRequired, asyncHandler(async (req, res) => {
  const { finalReceipt, reason } = req.body;
  const result = await taskAuthService.cancelAuthorization({
    userId: req.user.id,
    authorizationId: req.params.id,
    finalReceipt,
    reason,
  });
  return ok(res, result);
}));

app.post("/api/shumiao/consume", authRequired, asyncHandler(async (req, res) => {
  const count = parsePositiveAmount(req.body.count ?? req.body.amount ?? req.body.quantity);
  if (!count) return fail(res, 400, "扣费数量不能为空");
  const detail = normalizeConsumeDetail(req.body);
  const taskIdentity = normalizeConsumeTaskIdentity(req.body);
  if (taskIdentity.invalid) return fail(res, 400, "携带 taskId 时 itemIndex 必须为正整数");

  const result = await withTransaction(async (tx) => {
    if (taskIdentity.taskId && taskIdentity.itemIndex) {
      const existing = await tx.get(
        `SELECT id, count, balance_after AS balanceAfter, created_at AS createdAt
         FROM consume_records
         WHERE user_id = ? AND task_id = ? AND item_index = ?`,
        [req.user.id, taskIdentity.taskId, taskIdentity.itemIndex],
      );
      if (existing) {
        return {
          duplicated: true,
          balance: Number(existing.balanceAfter || 0),
          taskId: taskIdentity.taskId,
          itemIndex: taskIdentity.itemIndex,
          recordId: existing.id,
          createdAt: existing.createdAt,
        };
      }
    }

    const account = await ensureAccount(req.user.id, 0, tx);
    const balance = Number(account.balance || 0);
    if (balance < count) {
      return {
        insufficient: true,
        balance,
        required: count,
        shortage: count - balance,
      };
    }

    const nextBalance = balance - count;
    const createdAt = nowIso();
    await tx.run(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, req.user.id],
    );
    await tx.run(
      `UPDATE users SET last_active_at = ?, updated_at = ? WHERE id = ?`,
      [createdAt, createdAt, req.user.id],
    );
    await tx.run(
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
    return {
      balance: nextBalance,
      duplicated: false,
      taskId: taskIdentity.taskId,
      itemIndex: taskIdentity.itemIndex,
    };
  });
  if (result.insufficient) {
    return fail(res, 400, `积分余额不足：当前 ${result.balance}，本次需要 ${count}，还差 ${result.shortage}`, {
      balance: result.balance,
      required: result.required,
      shortage: result.shortage,
    });
  }
  return success(res, result);
}));

app.get("/api/shumiao/recharge-records", authRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const offset = (page - 1) * pageSize;
  const totalRow = await dbGet("SELECT COUNT(*) AS total FROM recharge_orders WHERE user_id = ?", [req.user.id]);
  const list = await dbAll(
    `SELECT order_no AS orderNo, package_id AS packageId, amount, amount_cents AS amountCents,
            base_count AS baseCount, gift_count AS giftCount,
            promotion_code AS promotionCode, promotion_count AS promotionCount,
            total_count AS totalCount,
            channel, status, platform_transaction_id AS platformTransactionId,
            paid_at AS paidAt, credited_at AS creditedAt, expires_at AS expiresAt,
            last_query_at AS lastQueryAt, last_query_status AS lastQueryStatus,
            expiry_query_at AS expiryQueryAt, manual_review_reason AS manualReviewReason,
            created_at AS createdAt, updated_at AS updatedAt
     FROM recharge_orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, pageSize, offset],
  );
  return success(res, { list: list.map(paymentOrderView), total: totalRow.total, page, pageSize });
}));

app.get("/api/shumiao/consume-records", authRequired, asyncHandler(async (req, res) => {
  const { page, pageSize } = parsePageParams(req.query);
  const offset = (page - 1) * pageSize;
  // 与管理后台一致：一次提交任务（同一 task_id）聚合为一条流水，无任务标识的历史记录按条展示。
  const totalRow = await dbGet(
    `SELECT COUNT(*) AS total FROM (
       SELECT task_id FROM consume_records
       WHERE user_id = ? AND task_id IS NOT NULL AND item_index IS NOT NULL
       GROUP BY task_id
       UNION ALL
       SELECT NULL AS task_id FROM consume_records
       WHERE user_id = ? AND (task_id IS NULL OR item_index IS NULL)
     )`,
    [req.user.id, req.user.id],
  );
  const list = await dbAll(
    `WITH task_groups AS (
       SELECT task_id, COUNT(*) AS itemCount, SUM(count) AS totalCount,
              MIN(created_at) AS startedAt, MAX(created_at) AS finishedAt, MAX(id) AS lastRecordId
       FROM consume_records
       WHERE user_id = ? AND task_id IS NOT NULL AND item_index IS NOT NULL
       GROUP BY task_id
     ),
     task_rows AS (
       SELECT r.id, r.balance_after AS balanceAfter, r.remark, r.created_at AS createdAt,
              g.totalCount, g.itemCount
       FROM task_groups g
       JOIN consume_records r ON r.id = g.lastRecordId
     ),
     legacy_rows AS (
       SELECT id, balance_after AS balanceAfter, remark, created_at AS createdAt,
              count AS totalCount, 1 AS itemCount
       FROM consume_records
       WHERE user_id = ? AND (task_id IS NULL OR item_index IS NULL)
     ),
     all_rows AS (
       SELECT * FROM task_rows
       UNION ALL
       SELECT * FROM legacy_rows
     )
     SELECT id, totalCount AS consumeCount, itemCount, balanceAfter, remark, createdAt
     FROM all_rows
     ORDER BY createdAt DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, req.user.id, pageSize, offset],
  );
  const consumeTypeLabels = {
    pgy_scrape: "蒲公英采集",
    starmap_scrape: "星图采集",
    system_gift: "系统赠送",
    recharge: "充值",
  };
  const records = list.map((row) => {
    const count = Number(row.consumeCount || 0);
    const balanceAfter = Number(row.balanceAfter || 0);
    const consumeType = String(row.remark || "").includes("星图") ? "starmap_scrape" : "pgy_scrape";
    return {
      id: row.id,
      count,
      consumeCount: count,
      itemCount: Number(row.itemCount || 1),
      balanceBefore: balanceAfter + count,
      balanceAfter,
      remark: row.remark,
      createdAt: row.createdAt,
      consumeType,
      consumeTypeText: consumeTypeLabels[consumeType],
    };
  });
  return success(res, { list: records, total: totalRow.total, page, pageSize });
}));

app.post("/api/shumiao/recharge", authRequired, asyncHandler(async (req, res) => {
  const channel = String(req.body.channel || "alipay").trim().toLowerCase();
  if (channel !== "alipay" && channel !== "wxpay") return fail(res, 400, "不支持的支付方式");
  const channelEnabled = channel === "wxpay" ? wxpayEnabled : alipayEnabled;
  if (!channelEnabled) {
    return fail(res, 503, channel === "wxpay" ? "微信支付暂未开启，请稍后再试" : "支付宝支付暂未开启，请稍后再试");
  }
  const packageId = String(req.body.packageId || "");
  const pkg = await dbGet("SELECT * FROM shumiao_packages WHERE id = ? AND enabled = 1", [packageId]);
  if (!pkg) return fail(res, 400, "套餐不存在");

  const gateway = channel === "wxpay" ? wxpayGateway : alipayGateway;
  const orderNo = `RM${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const paymentToken = createPaymentToken();
  const paymentTokenHash = hashPaymentToken(paymentToken);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + Number(process.env.PAYMENT_ORDER_TTL_MS || 30 * 60 * 1000)).toISOString();
  const merchantId = String(
    gateway.config.mchId
    || gateway.config.merchantId
    || process.env.WXPAY_MCH_ID
    || process.env.ALIPAY_SELLER_ID
    || (process.env.NODE_ENV === "test" ? (channel === "wxpay" ? "test-wxpay-mch" : "test-merchant") : ""),
  ).trim();
  const appId = String(
    gateway.config.appId
    || process.env.WXPAY_APP_ID
    || process.env.ALIPAY_APP_ID
    || (process.env.NODE_ENV === "test" ? (channel === "wxpay" ? "test-wxpay-app" : "test-app") : ""),
  ).trim();
  if (!merchantId || !appId) {
    return fail(res, 503, channel === "wxpay" ? "微信支付配置未完成，请联系管理员" : "支付宝支付配置未完成，请联系管理员");
  }

  let finalPromotionCode = null;
  let finalPromotionCount = 0;
  let finalTotalCount = Number(pkg.base_count) + Number(pkg.gift_count);

  try {
    await withTransaction(async (tx) => {
      const isEligible = isFirstRechargePromoEnabled() && (await checkUserFirstRechargeEligible(req.user.id, tx));
      const promoBonus = isEligible ? calculateFirstRechargeBonus(pkg.amount_cents, pkg.base_count) : 0;
      if (promoBonus > 0) {
        const pendingPromo = await tx.get(
          "SELECT order_no FROM recharge_orders WHERE user_id = ? AND promotion_code = ? AND status = 0",
          [req.user.id, FIRST_RECHARGE_PROMO_CODE],
        );
        if (pendingPromo) {
          throw new Error("ACTIVE_PROMO_ORDER_EXISTS:您已有待支付的首充优惠订单，请先完成或取消该订单");
        }
        finalPromotionCode = FIRST_RECHARGE_PROMO_CODE;
        finalPromotionCount = promoBonus;
        finalTotalCount = Number(pkg.base_count) + Number(pkg.gift_count) + promoBonus;
      }

      await tx.run(
        `INSERT INTO recharge_orders
          (order_no, user_id, package_id, amount, amount_cents, base_count, gift_count, promotion_code, promotion_count, total_count,
           code_url, status, channel, payment_token_hash, payment_token_expires_at,
           merchant_id, app_id, expires_at, query_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          orderNo,
          req.user.id,
          pkg.id,
          Number(pkg.amount),
          Number(pkg.amount_cents),
          Number(pkg.base_count),
          Number(pkg.gift_count),
          finalPromotionCode,
          finalPromotionCount,
          finalTotalCount,
          "redacted",
          ORDER_STATUS.PENDING,
          channel,
          paymentTokenHash,
          expiresAt,
          merchantId,
          appId,
          expiresAt,
          createdAt,
          createdAt,
        ],
      );
    });
  } catch (err) {
    if (String(err.message).startsWith("ACTIVE_PROMO_ORDER_EXISTS:")) {
      return fail(res, 409, err.message.replace("ACTIVE_PROMO_ORDER_EXISTS:", ""));
    }
    if (String(err.message).includes("UNIQUE constraint failed") || String(err.message).includes("idx_recharge_first_promo_claim")) {
      return fail(res, 409, "首充优惠已被其他订单占用或正在处理中，请稍后重试");
    }
    throw err;
  }

  const isWxpay = channel === "wxpay";
  let payUrl = `${BASE_URL}/pay/${paymentToken}`;
  let codeUrl = payUrl;
  let qrCode = "";
  if (isWxpay) {
    const description = `积分充值 ${finalTotalCount} 积分`;
    try {
      codeUrl = await wxpayGateway.createQrCode({
        orderNo,
        amountCents: Number(pkg.amount_cents),
        description,
        notifyUrl: wxpayGateway.config.notifyUrl,
      });
      payUrl = codeUrl;
      qrCode = codeUrl;
    } catch (error) {
      logWarn("wxpay_create_order_failed", {
        ...requestLogInfo(req),
        orderNo,
        error: error.message,
      });
      await withMutation(() => setQueryStatus({ db: database, orderNo, status: "ERROR:QRCODE_FAILED", close: true }));
      return fail(res, 502, "微信支付下单失败，请稍后重试");
    }
  } else {
    try {
      qrCode = await alipayGateway.createQrCode({
        orderNo,
        amountCents: Number(pkg.amount_cents),
        subject: `积分充值 ${finalTotalCount} 积分`,
        expiresAt,
      });
    } catch (error) {
      logWarn("alipay_create_order_failed", {
        ...requestLogInfo(req),
        orderNo,
        error: error.message,
      });
      await withMutation(() => setQueryStatus({ db: database, orderNo, status: "ERROR:QRCODE_FAILED", close: true }));
      return fail(res, 502, "支付宝下单失败，请稍后重试");
    }
  }
  return success(res, {
    orderNo,
    payUrl,
    // 兼容仍在使用 1.1.x 前端资源的客户端：旧页面用 codeUrl 生成二维码。
    codeUrl,
    // 客户端弹窗渲染用：微信为 weixin:// 二维码内容，支付宝为预下单二维码图片地址。
    qrCode,
    amount: Number(pkg.amount_cents),
    amountCents: Number(pkg.amount_cents),
    baseCount: Number(pkg.base_count),
    giftCount: Number(pkg.gift_count),
    promotionCode: finalPromotionCode,
    promotionCount: finalPromotionCount,
    totalCount: finalTotalCount,
    channel,
    status: ORDER_STATUS.PENDING,
    expiresAt,
  });
}));

app.get("/api/shumiao/order/:orderNo", authRequired, asyncHandler(async (req, res) => {
  const order = await dbGet(
    `SELECT order_no AS orderNo, package_id AS packageId, amount, amount_cents AS amountCents,
            base_count AS baseCount, gift_count AS giftCount,
            promotion_code AS promotionCode, promotion_count AS promotionCount,
            total_count AS totalCount,
            channel, status, platform_transaction_id AS platformTransactionId,
            paid_at AS paidAt, credited_at AS creditedAt, expires_at AS expiresAt,
            last_query_at AS lastQueryAt, last_query_status AS lastQueryStatus,
            expiry_query_at AS expiryQueryAt, manual_review_reason AS manualReviewReason,
            created_at AS createdAt, updated_at AS updatedAt
     FROM recharge_orders
     WHERE user_id = ? AND order_no = ?`,
    [req.user.id, req.params.orderNo],
  );
  if (!order) return fail(res, 404, "订单不存在");
  return success(res, paymentOrderView(order));
}));

app.post("/api/shumiao/order/:orderNo/query", authRequired, asyncHandler(async (req, res) => {
  const orderNo = String(req.params.orderNo || "").trim();
  const existing = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
  if (!existing) return fail(res, 404, "订单不存在");
  const channel = String(existing.channel || "alipay").trim().toLowerCase();
  const channelEnabled = channel === "wxpay" ? wxpayEnabled : alipayEnabled;
  if (!channelEnabled) {
    return fail(res, 503, channel === "wxpay" ? "微信支付查询暂未开启，请稍后再试" : "支付宝查询暂未开启，请稍后再试");
  }
  const gateway = channel === "wxpay" ? wxpayGateway : alipayGateway;
  if (Number(existing.status) !== ORDER_STATUS.PENDING) return success(res, paymentOrderView(existing));
  const claim = await withMutation(() => claimPendingOrder({
    db: database,
    orderNo,
    now: new Date(),
    minIntervalMs: 15000,
    allowExpiredRetry: true,
    channel,
  }));
  if (!claim) {
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, { ...paymentOrderView(latest), queryInProgress: true }, "查询请求已排队，请稍后刷新");
  }

  try {
    const response = channel === "wxpay"
      ? await gateway.queryOrder({ orderNo })
      : await gateway.queryTrade({ orderNo });
    if (response?.outTradeNo && response.outTradeNo !== orderNo) {
      throw new Error(channel === "wxpay" ? "微信支付查询返回了其他订单" : "支付宝查询返回了其他订单");
    }
    const status = String(response?.tradeStatus || "NOT_FOUND").trim().toUpperCase();
    if (isSuccessfulTradeStatus(status)) {
      const amountCents = channel === "wxpay"
        ? Number(response.amountFen)
        : centsFromAmount(response.totalAmount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !response.tradeNo || response.outTradeNo !== orderNo) {
        throw new Error("支付查询成功但交易信息不完整");
      }
      await settleRechargeOrder({
        db: database,
        withTransaction,
        source: channel === "wxpay" ? "wxpay-query" : "alipay-query",
        orderNo,
        channel,
        amountCents,
        merchantId: response.sellerId,
        appId: response.appId,
        transactionId: response.tradeNo,
        paidAt: response.gmtPayment,
      });
    } else {
      await withMutation(() => setQueryStatus({
        db: database,
        orderNo,
        status,
        close: isDefinitiveUnpaidStatus(status),
      }));
    }
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, paymentOrderView(latest));
  } catch {
    await withMutation(() => setQueryStatus({ db: database, orderNo, status: "ERROR:QUERY_FAILED" }));
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, paymentOrderView(latest), "支付结果暂未确认，请稍后刷新订单");
  }
}));

// 关闭订单：安全优先，先查网关状态——已支付才入账、确定未支付才关闭、状态未知绝不关闭。
// 返回 200 + order + 标志位（closed / paidOnClose / queryInProgress），前端按 message 与标志位展示。
app.post("/api/shumiao/order/:orderNo/close", authRequired, asyncHandler(async (req, res) => {
  const orderNo = String(req.params.orderNo || "").trim();
  const existing = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
  if (!existing) return fail(res, 404, "订单不存在");

  if (Number(existing.status) !== ORDER_STATUS.PENDING) {
    return success(res, { order: paymentOrderView(existing) }, "订单已处理，无需关闭");
  }
  const channel = String(existing.channel || "alipay").trim().toLowerCase();
  const channelEnabled = channel === "wxpay" ? wxpayEnabled : alipayEnabled;
  if (!channelEnabled) {
    return fail(res, 503, channel === "wxpay" ? "微信支付关闭暂不可用，请稍后再试" : "支付宝关闭暂不可用，请稍后再试");
  }
  const gateway = channel === "wxpay" ? wxpayGateway : alipayGateway;

  const claim = await withMutation(() => claimPendingOrder({
    db: database,
    orderNo,
    now: new Date(),
    minIntervalMs: 15000,
    allowExpiredRetry: true,
    channel,
  }));
  if (!claim) {
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, { ...paymentOrderView(latest), queryInProgress: true }, "查询请求已排队，请稍后刷新");
  }

  try {
    const response = channel === "wxpay"
      ? await gateway.queryOrder({ orderNo })
      : await gateway.queryTrade({ orderNo });
    if (response?.outTradeNo && response.outTradeNo !== orderNo) {
      throw new Error(channel === "wxpay" ? "微信支付查询返回了其他订单" : "支付宝查询返回了其他订单");
    }
    const status = String(response?.tradeStatus || "NOT_FOUND").trim().toUpperCase();
    if (isSuccessfulTradeStatus(status)) {
      const amountCents = channel === "wxpay"
        ? Number(response.amountFen)
        : centsFromAmount(response.totalAmount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !response.tradeNo) {
        throw new Error("支付查询成功但交易信息不完整");
      }
      await settleRechargeOrder({
        db: database,
        withTransaction,
        source: channel === "wxpay" ? "wxpay-close" : "alipay-close",
        orderNo,
        channel,
        amountCents,
        merchantId: response.sellerId,
        appId: response.appId,
        transactionId: response.tradeNo,
        paidAt: response.gmtPayment,
      });
      const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
      return success(res, { order: paymentOrderView(latest), paidOnClose: true }, "订单已支付，积分已到账");
    }
    // 用户主动取消：网关确认未支付（WAIT_BUYER_PAY / USERPAYING / TRADE_CLOSED / 不存在等）即关闭。
    // 若关闭后买家仍完成付款，平台通知/查询仍会按已验证成功入账（见 settleRechargeOrder 幂等守卫）。
    await withMutation(() => setQueryStatus({ db: database, orderNo, status, close: true }));
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, { order: paymentOrderView(latest), closed: true }, "订单已关闭");
  } catch {
    await withMutation(() => setQueryStatus({ db: database, orderNo, status: "ERROR:QUERY_FAILED" }));
    const latest = await dbGet("SELECT * FROM recharge_orders WHERE user_id = ? AND order_no = ?", [req.user.id, orderNo]);
    return success(res, { order: paymentOrderView(latest) }, "支付状态暂未确认，请稍后重试");
  }
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
  if (!isAdminPasswordConfigured()) {
    return fail(res, 503, "管理后台尚未配置 ADMIN_PASSWORD");
  }
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

  let adjustment;
  await withTransaction(async (tx) => {
    const account = await ensureAccount(userId, 0, tx);
    const createdAt = nowIso();
    const currentBalance = Number(account.balance || 0);
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) {
      adjustment = { insufficient: true, currentBalance };
      return;
    }

    await tx.run(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, userId],
    );
    await tx.run(
      `INSERT INTO admin_balance_adjustments
        (admin_username, user_id, delta, balance_after, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.admin.username, userId, delta, nextBalance, remark, createdAt],
    );
    adjustment = { userId, delta, balance: nextBalance };
  });
  if (adjustment?.insufficient) {
    return fail(res, 400, `积分余额不足，当前余额 ${adjustment.currentBalance}，不能扣 ${Math.abs(delta)}`);
  }
  try {
    logInfo("admin_adjust_points", {
      adminUsername: req.admin.username,
      userId,
      delta,
      balanceAfter: adjustment.balance,
      ...requestLogInfo(req),
    });

    return success(res, adjustment);
  } catch (err) {
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

  let resetResult;
  await withTransaction(async (tx) => {
    const user = await tx.get("SELECT id, phone, status FROM users WHERE id = ?", [userId]);
    if (!user) {
      resetResult = { missing: true };
      return;
    }
    if (Number(user.status) !== 1) {
      resetResult = { deleted: true };
      return;
    }

    const updatedAt = nowIso();
    await tx.run(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [passwordHash, updatedAt, userId],
    );
    const revokeResult = await tx.run("DELETE FROM user_tokens WHERE user_id = ?", [userId]);
    await tx.run(
      `INSERT INTO admin_user_audit_logs
        (admin_username, user_id, action, request_source, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [req.admin.username, userId, "reset_password", requestSource, updatedAt],
    );
    resetResult = {
      userId,
      revokedTokens: Number(revokeResult.changes || 0),
      updatedAt,
    };
  });
  if (resetResult?.missing) return fail(res, 404, "用户不存在");
  if (resetResult?.deleted) return fail(res, 400, "账号已注销，不能重置密码");

  try {
    logInfo("admin_reset_password", {
      adminUsername: req.admin.username,
      userId,
      revokedTokens: resetResult.revokedTokens,
      requestSource,
      ...requestLogInfo(req),
    });

    return success(res, resetResult, "密码已重置，用户已退出全部登录");
  } catch (err) {
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

function buildSafeDashboardStatistics() {
  const today = startOfDay();
  const categories = [];
  for (let i = 6; i >= 0; i -= 1) categories.push(dayLabel(addDays(today, -i)));
  const emptyTrend = () => ({
    percent: 0,
    series: categories.map(() => 0),
    categories,
  });

  return {
    restricted: true,
    users: {
      total: 0,
      todayNew: 0,
      activeCount: 0,
      totalTrend: emptyTrend(),
      newTrend: emptyTrend(),
      activeTrend: emptyTrend(),
    },
    bloggers: {
      xhs: { total: 0 },
      douyin: { total: 0 },
      totalTrend: emptyTrend(),
    },
    finance: {
      recharge: {
        totalAmountYuan: 0,
        todayAmountYuan: 0,
        weekAmountYuan: 0,
        todayOrders: 0,
        totalOrders: 0,
        createdOrders: { today: 0, total: 0 },
        trend: { series: categories.map(() => 0), categories },
      },
      commission: {
        totalAmountYuan: 0,
        settledAmountYuan: 0,
        pendingAmountYuan: 0,
        pendingCount: 0,
        failedCount: 0,
        trend: { series: categories.map(() => 0), categories },
      },
      profit: {
        available: false,
        reason: "管理员数据仅管理员可见",
        totalProfitYuan: 0,
        todayProfitYuan: 0,
        weekProfitYuan: 0,
        trend: { series: categories.map(() => 0), categories },
      },
    },
  };
}

app.get("/api/statistics/dashboard", authRequired, asyncHandler(async (req, res) => {
  return success(res, buildSafeDashboardStatistics());
}));

app.get("/api/statistics/admin-dashboard", adminRequired, asyncHandler(async (req, res) => {
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
      `SELECT COALESCE(SUM(amount_cents), 0) AS amountCents, COUNT(*) AS count
       FROM recharge_orders
       WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?`,
      [ORDER_STATUS.CREDITED, day.toISOString(), nextDay.toISOString()],
    );

    const rechargeAmount = centsToYuan(recharge.amountCents);
    userNewSeries.push(Number(newUsers.count || 0));
    userTotalSeries.push(Number(totalUsers.count || 0));
    userActiveSeries.push(Number(activeUsers.count || 0));
    rechargeSeries.push(rechargeAmount);
    commissionSeries.push(0);
    profitSeries.push(0);
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
  const rechargeTotal = await dbGet(
    `SELECT COALESCE(SUM(amount_cents), 0) AS amountCents, COUNT(*) AS count
     FROM recharge_orders
     WHERE status = ? AND credited_at IS NOT NULL`,
    [ORDER_STATUS.CREDITED],
  );
  const rechargeToday = await dbGet(
    `SELECT COALESCE(SUM(amount_cents), 0) AS amountCents, COUNT(*) AS count
     FROM recharge_orders
     WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?`,
    [ORDER_STATUS.CREDITED, today.toISOString(), tomorrow.toISOString()],
  );
  const rechargeWeek = await dbGet(
    `SELECT COALESCE(SUM(amount_cents), 0) AS amountCents
     FROM recharge_orders
     WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ?`,
    [ORDER_STATUS.CREDITED, weekStart.toISOString()],
  );
  const createdRechargeTotal = await dbGet("SELECT COUNT(*) AS count FROM recharge_orders");
  const createdRechargeToday = await dbGet(
    "SELECT COUNT(*) AS count FROM recharge_orders WHERE created_at >= ? AND created_at < ?",
    [today.toISOString(), tomorrow.toISOString()],
  );

  const totalRechargeYuan = centsToYuan(rechargeTotal.amountCents);
  const todayRechargeYuan = centsToYuan(rechargeToday.amountCents);
  const weekRechargeYuan = centsToYuan(rechargeWeek.amountCents);

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
        createdOrders: {
          today: Number(createdRechargeToday.count || 0),
          total: Number(createdRechargeTotal.count || 0),
        },
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
        available: false,
        reason: "成本数据未接入，当前只提供已入账收入",
        totalProfitYuan: 0,
        todayProfitYuan: 0,
        weekProfitYuan: 0,
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
    data: process.env.NODE_ENV === "test" ? { error: err.message } : null,
  });
});

async function runReconciliation() {
  if (!paymentEnabled || process.env.RECONCILIATION_ENABLED !== "1") return [];
  const settle = (input) => settleRechargeOrder({ db: database, withTransaction, ...input });
  const results = [];
  if (alipayEnabled) {
    results.push(...await reconcileOnce({
      db: database,
      gateway: alipayGateway,
      withMutation,
      settle,
      batchSize: 20,
      minIntervalMs: 15000,
      channel: "alipay",
    }));
  }
  if (wxpayEnabled) {
    results.push(...await reconcileOnce({
      db: database,
      gateway: wxpayGateway,
      withMutation,
      settle,
      batchSize: 20,
      minIntervalMs: 15000,
      channel: "wxpay",
    }));
  }
  return results;
}

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
      if (!isAdminPasswordConfigured()) {
        logWarn("admin_password_not_configured", { message: "管理后台登录已禁用，不影响客户端服务" });
      }
      console.log(`red-magic-api listening on http://127.0.0.1:${PORT}`);
    });
    if (paymentEnabled && process.env.RECONCILIATION_ENABLED === "1") {
      const interval = setInterval(() => {
        runReconciliation().catch((error) => logError("reconciliation_failed", { error: error.message }));
      }, 60 * 1000);
      interval.unref();
    }
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
