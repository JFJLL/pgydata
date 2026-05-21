require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = Number(process.env.PORT || 3050);
const BASE_URL = (process.env.BASE_URL || "https://xhs.red-magic.cn").replace(/\/$/, "");
const DEFAULT_GIFT_BALANCE = Number(process.env.DEFAULT_GIFT_BALANCE || 100);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "red-magic-api.sqlite");
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const ASSET_VERSION = "1.1.1";
const INSTALLER_FILE_NAME = "EmagicDataCrawler-Setup.exe";
const INSTALLER_DOWNLOAD_URL = "https://redmagic.oss-cn-beijing.aliyuncs.com/exe/EmagicDataCrawler-Setup.exe";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "redmagic2026";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map();

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

function parsePositiveAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parsePageParams(query) {
  const rawPage = Number(query.page || 1);
  const rawPageSize = Number(query.pageSize || query.limit || 10);
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(100, Math.floor(rawPageSize)) : 10,
  };
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
      id: "collect",
      name: "采集",
      icon: "solar:cloud-upload-bold-duotone",
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS consume_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      count INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
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
  const packages = [
    ["pkg_990", "9.9元树苗包", 9.9, 100, 1],
    ["pkg_2990", "29.9元树苗包", 29.9, 350, 2],
    ["pkg_9900", "99元树苗包", 99, 1200, 3],
  ];

  for (const item of packages) {
    await dbRun(
      `INSERT OR IGNORE INTO shumiao_packages
        (id, title, amount, total_count, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
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

app.set("trust proxy", true);
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

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");

  if (!phone || !password) return fail(res, 400, "手机号和密码不能为空");

  const user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) return fail(res, 400, "账号不存在");
  if (Number(user.status) !== 1) return fail(res, 400, "账号已注销");
  if (!user.password_hash) return fail(res, 400, "密码错误");

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

  if (!passwordOk) return fail(res, 400, "密码错误");
  return success(res, await buildLoginData(user));
}));

app.post("/api/auth/sms/send", asyncHandler(async (req, res) => {
  return success(res, {}, "验证码已发送");
}));

app.post("/api/auth/sms/login", asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");
  if (!phone) return fail(res, 400, "手机号不能为空");
  if (!password) return fail(res, 400, "密码不能为空");

  let user = await dbGet("SELECT * FROM users WHERE phone = ?", [phone]);
  if (!user) {
    const createdAt = nowIso();
    const result = await dbRun(
      `INSERT INTO users (phone, password_hash, nickname, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [phone, await bcrypt.hash(password, 10), `用户${phone.slice(-4) || "0000"}`, createdAt, createdAt],
    );
    user = await dbGet("SELECT * FROM users WHERE id = ?", [result.lastID]);
    await ensureAccount(user.id, DEFAULT_GIFT_BALANCE);
  } else {
    if (Number(user.status) !== 1) return fail(res, 400, "账号已注销");
    let passwordOk = false;
    if (user.password_hash && user.password_hash.startsWith("$2")) {
      passwordOk = await bcrypt.compare(password, user.password_hash);
    } else if (user.password_hash) {
      passwordOk = password === user.password_hash;
      if (passwordOk) {
        await dbRun("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
          await bcrypt.hash(password, 10),
          nowIso(),
          user.id,
        ]);
      }
    }

    if (!passwordOk) return fail(res, 400, "手机号或密码错误");
  }

  return success(res, await buildLoginData(user));
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
  return ["starmap", "pgy", "douyin"].includes(value) ? value : "";
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
    `SELECT id, id AS packageId, title, amount, total_count AS totalCount
     FROM shumiao_packages
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
    sufficient: balance >= count,
  });
}));

app.post("/api/shumiao/consume", authRequired, asyncHandler(async (req, res) => {
  const count = parsePositiveAmount(req.body.count ?? req.body.amount ?? req.body.quantity);
  if (!count) return fail(res, 400, "扣费数量不能为空");

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const account = await ensureAccount(req.user.id, 0);
    const balance = Number(account.balance || 0);
    if (balance < count) {
      await dbRun("ROLLBACK");
      return fail(res, 400, "树苗余额不足");
    }

    const nextBalance = balance - count;
    const createdAt = nowIso();
    await dbRun(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, req.user.id],
    );
    await dbRun(
      `INSERT INTO consume_records (user_id, count, balance_after, remark, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, count, nextBalance, req.body.remark || "", createdAt],
    );
    await dbRun("COMMIT");
    return success(res, { balance: nextBalance });
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
    `SELECT order_no AS orderNo, package_id AS packageId, amount, total_count AS totalCount,
            code_url AS codeUrl, status, created_at AS createdAt
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
  const pkg = await dbGet("SELECT * FROM shumiao_packages WHERE id = ?", [packageId]);
  if (!pkg) return fail(res, 400, "套餐不存在");

  const orderNo = `RM${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const codeUrl = `${BASE_URL}/pay-placeholder`;
  const createdAt = nowIso();
  await dbRun(
    `INSERT INTO recharge_orders
      (order_no, user_id, package_id, amount, total_count, code_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [orderNo, req.user.id, pkg.id, pkg.amount, pkg.total_count, codeUrl, createdAt, createdAt],
  );

  return success(res, {
    orderNo,
    codeUrl,
    amount: pkg.amount,
    totalCount: pkg.total_count,
    status: 0,
  });
}));

app.get("/api/shumiao/order/:orderNo", authRequired, asyncHandler(async (req, res) => {
  const order = await dbGet(
    `SELECT order_no AS orderNo, package_id AS packageId, amount, total_count AS totalCount,
            code_url AS codeUrl, status, created_at AS createdAt, updated_at AS updatedAt
     FROM recharge_orders
     WHERE user_id = ? AND order_no = ?`,
    [req.user.id, req.params.orderNo],
  );
  if (!order) return fail(res, 404, "订单不存在");
  return success(res, order);
}));

app.get("/api/frontend-assets/latest/desktop", asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, "public", "assets", "desktop", ASSET_VERSION, "assets.zip");
  if (!fs.existsSync(filePath)) {
    return fail(res, 404, "资源文件不存在", {
      expectedPath: "public/assets/desktop/1.1.1/assets.zip",
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
    downloadUrl: `${BASE_URL}/assets/desktop/${ASSET_VERSION}/assets.zip`,
    size: stat.size,
    checksum: `sha256:${hash.digest("hex")}`,
    releaseDate: stat.mtime.toISOString(),
    releaseNotes: ["Σ.magiorix 桌面端资源包"],
  });
}));

app.get("/api/desktop-download/latest", asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, "public", "downloads", INSTALLER_FILE_NAME);
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

  return success(res, {
    version: "1.0.4",
    fileName: INSTALLER_FILE_NAME,
    downloadUrl: INSTALLER_DOWNLOAD_URL,
    directUrl: INSTALLER_DOWNLOAD_URL,
    size: stat ? stat.size : 0,
    releaseDate: stat ? stat.mtime.toISOString() : null,
  });
}));

app.get("/api/desktop-versions/check", asyncHandler(async (req, res) => {
  return success(res, {
    hasUpdate: false,
    latestVersion: "1.0.4",
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
  const count = parsePositiveAmount(req.body.count ?? req.body.amount ?? req.body.points);
  const remark = String(req.body.remark || "管理员加积分").trim();

  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, "用户不存在");
  if (!count) return fail(res, 400, "加积分数量不能为空");

  const user = await dbGet("SELECT id, status FROM users WHERE id = ?", [userId]);
  if (!user) return fail(res, 404, "用户不存在");
  if (Number(user.status) !== 1) return fail(res, 400, "账号已注销，不能继续加积分");

  await dbRun("BEGIN IMMEDIATE TRANSACTION");
  try {
    const account = await ensureAccount(userId, 0);
    const createdAt = nowIso();
    const nextBalance = Number(account.balance || 0) + count;

    await dbRun(
      "UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
      [nextBalance, createdAt, userId],
    );
    await dbRun(
      `INSERT INTO admin_balance_adjustments
        (admin_username, user_id, delta, balance_after, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.admin.username, userId, count, nextBalance, remark, createdAt],
    );
    await dbRun("COMMIT");
    logInfo("admin_add_points", {
      adminUsername: req.admin.username,
      userId,
      delta: count,
      balanceAfter: nextBalance,
      ...requestLogInfo(req),
    });

    return success(res, {
      userId,
      delta: count,
      balance: nextBalance,
    });
  } catch (err) {
    await dbRun("ROLLBACK");
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
  const keyword = String(req.query.keyword || "").trim();
  const offset = (page - 1) * pageSize;
  const like = `%${keyword}%`;
  const params = keyword ? [like, like, like, like] : [];
  const where = keyword
    ? "WHERE u.phone LIKE ? OR u.nickname LIKE ? OR tx.operation LIKE ? OR tx.remark LIKE ?"
    : "";
  const baseSelect = `
    SELECT
      tx.id,
      tx.type,
      tx.userId,
      u.phone,
      u.nickname,
      u.status,
      tx.createdAt,
      tx.amount,
      CASE WHEN tx.type = 'consume' THEN ABS(tx.amount) ELSE 0 END AS consumedQuota,
      tx.balanceAfter,
      tx.operation,
      tx.remark
    FROM (
      SELECT
        'consume-' || id AS id,
        'consume' AS type,
        user_id AS userId,
        created_at AS createdAt,
        -count AS amount,
        balance_after AS balanceAfter,
        '采集消耗' AS operation,
        COALESCE(remark, '') AS remark
      FROM consume_records
      UNION ALL
      SELECT
        'adjust-' || id AS id,
        'adjustment' AS type,
        user_id AS userId,
        created_at AS createdAt,
        delta AS amount,
        balance_after AS balanceAfter,
        '后台加分' AS operation,
        COALESCE(remark, '') AS remark
      FROM admin_balance_adjustments
      UNION ALL
      SELECT
        'recharge-' || order_no AS id,
        'recharge' AS type,
        user_id AS userId,
        updated_at AS createdAt,
        total_count AS amount,
        NULL AS balanceAfter,
        CASE WHEN status = 1 THEN '用户充值' ELSE '充值下单' END AS operation,
        package_id AS remark
      FROM recharge_orders
    ) tx
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
    list: rows.map((row) => ({
      ...row,
      amount: Number(row.amount || 0),
      consumedQuota: Number(row.consumedQuota || 0),
      balanceAfter: row.balanceAfter === null ? null : Number(row.balanceAfter || 0),
      status: Number(row.status ?? 1),
    })),
    total: Number(total.count || 0),
    page,
    pageSize,
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
