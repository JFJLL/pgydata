const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const apiRoot = path.join(repoRoot, "red-magic-api");
const sqlite3 = require(path.join(apiRoot, "node_modules", "sqlite3")).verbose();
const bcrypt = require(path.join(apiRoot, "node_modules", "bcryptjs"));

function openDb(filePath) {
  return new sqlite3.Database(filePath);
}

function dbExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => (error ? reject(error) : resolve()));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function requestJson(baseUrl, route, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return response.json();
}

async function seedLegacyDatabase(dbPath) {
  const db = openDb(dbPath);
  try {
    await dbExec(db, `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        nickname TEXT,
        avatar TEXT,
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE shumiao_accounts (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE consume_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        count INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        remark TEXT,
        detail_type TEXT,
        detail_summary TEXT,
        detail_json TEXT,
        created_at TEXT NOT NULL
      );
    `);

    const passwordHash = await bcrypt.hash("oldPass123", 4);
    const createdAt = "2026-07-20T08:00:00.000Z";
    await dbRun(
      db,
      `INSERT INTO users (id, phone, password_hash, nickname, avatar, status, created_at, updated_at)
       VALUES (1, ?, ?, ?, '', 1, ?, ?)`,
      ["13800000000", passwordHash, "老用户", createdAt, createdAt],
    );
    await dbRun(
      db,
      `INSERT INTO users (id, phone, password_hash, nickname, avatar, status, created_at, updated_at)
       VALUES (2, ?, ?, ?, '', 0, ?, ?)`,
      ["13900000000", passwordHash, "已注销用户", createdAt, createdAt],
    );
    await dbRun(
      db,
      `INSERT INTO user_tokens (user_id, token, expires_at, created_at)
       VALUES (1, ?, ?, ?), (1, ?, ?, ?)`,
      [
        "user-token-a",
        "2099-01-01T00:00:00.000Z",
        createdAt,
        "user-token-b",
        "2099-01-01T00:00:00.000Z",
        createdAt,
      ],
    );
    await dbRun(
      db,
      `INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at)
       VALUES (1, 10, ?, ?)`,
      [createdAt, createdAt],
    );
    await dbRun(
      db,
      `INSERT INTO consume_records
        (user_id, count, balance_after, remark, detail_type, detail_summary, detail_json, created_at)
       VALUES (1, 2, 10, ?, 'manual', ?, ?, ?)`,
      [
        "旧版导入",
        "旧版手动输入，2 条",
        JSON.stringify({
          inputType: "manual",
          totalRows: 2,
          validCount: 2,
          rows: ["https://legacy.example/1", "https://legacy.example/2"],
        }),
        "2026-07-20T09:00:00.000Z",
      ],
    );
  } finally {
    await closeDb(db);
  }
}

test("legacy consume records migrate safely and admin task view is idempotent", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-admin-consume-"));
  const dbPath = path.join(tempDir, "legacy.sqlite");
  const logDir = path.join(tempDir, "logs");
  const port = 38000 + Math.floor(Math.random() * 1000);
  const adminPassword = crypto.randomBytes(24).toString("base64url");
  await seedLegacyDatabase(dbPath);

  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      LOG_DIR: logDir,
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: adminPassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const boot = await waitForJson(`${baseUrl}/api/desktop-versions/check?currentVersion=1.0.0&platform=windows`);
  assert.equal(boot.code, 200, stderr);

  const db = openDb(dbPath);
  const columns = await dbAll(db, "PRAGMA table_info(consume_records)");
  const consumeColumnNames = columns.map((item) => item.name);
  assert.ok(consumeColumnNames.includes("task_id"));
  assert.ok(consumeColumnNames.includes("item_index"));
  const indexes = await dbAll(db, "PRAGMA index_list(consume_records)");
  const taskIndex = indexes.find((item) => item.name === "idx_consume_records_task_identity");
  assert.ok(taskIndex, "expected partial unique index for task identity");
  const taskIndexSql = await dbGet(
    db,
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    ["idx_consume_records_task_identity"],
  );
  assert.match(taskIndexSql.sql, /WHERE task_id IS NOT NULL AND item_index IS NOT NULL/);
  await closeDb(db);

  const adminLogin = await requestJson(baseUrl, "/api/admin/login", {
    method: "POST",
    body: { username: "admin", password: adminPassword },
  });
  assert.equal(adminLogin.code, 200, adminLogin.message);
  const adminHeaders = { Authorization: `Bearer ${adminLogin.data.token}` };

  const shortPassword = await requestJson(baseUrl, "/api/admin/users/1/reset-password", {
    method: "POST",
    headers: adminHeaders,
    body: { newPassword: "short" },
  });
  assert.equal(shortPassword.code, 400);

  const nonStringPassword = await requestJson(baseUrl, "/api/admin/users/1/reset-password", {
    method: "POST",
    headers: adminHeaders,
    body: { newPassword: 12345678 },
  });
  assert.equal(nonStringPassword.code, 400);

  const inactivePassword = await requestJson(baseUrl, "/api/admin/users/2/reset-password", {
    method: "POST",
    headers: adminHeaders,
    body: { newPassword: "inactivePass123" },
  });
  assert.equal(inactivePassword.code, 400);

  const firstConsume = await requestJson(baseUrl, "/api/shumiao/consume", {
    method: "POST",
    headers: { satoken: "user-token-a" },
    body: {
      count: 1,
      remark: "任务首条",
      taskId: "task-001",
      itemIndex: 1,
      detail: {
        inputType: "xlsx",
        fileName: "tasks.xlsx",
        taskType: "blogger",
        totalRows: 2,
        validCount: 2,
        taskId: "task-001",
        itemIndex: 1,
      },
    },
  });
  assert.equal(firstConsume.code, 200, firstConsume.message);
  assert.equal(firstConsume.data.balance, 9);
  assert.equal(firstConsume.data.duplicated, false);

  const duplicateConsume = await requestJson(baseUrl, "/api/shumiao/consume", {
    method: "POST",
    headers: { satoken: "user-token-a" },
    body: {
      count: 1,
      remark: "任务首条重复",
      taskId: "task-001",
      itemIndex: 1,
      detail: {
        inputType: "xlsx",
        fileName: "tasks.xlsx",
        taskType: "blogger",
        totalRows: 2,
        validCount: 2,
        taskId: "task-001",
        itemIndex: 1,
      },
    },
  });
  assert.equal(duplicateConsume.code, 200, duplicateConsume.message);
  assert.equal(duplicateConsume.data.balance, 9);
  assert.equal(duplicateConsume.data.duplicated, true);

  const secondConsume = await requestJson(baseUrl, "/api/shumiao/consume", {
    method: "POST",
    headers: { satoken: "user-token-a" },
    body: {
      count: 1,
      remark: "任务第二条",
      taskId: "task-001",
      itemIndex: 2,
      detail: {
        inputType: "xlsx",
        fileName: "tasks.xlsx",
        taskType: "blogger",
        totalRows: 2,
        validCount: 2,
        taskId: "task-001",
        itemIndex: 2,
      },
    },
  });
  assert.equal(secondConsume.code, 200, secondConsume.message);
  assert.equal(secondConsume.data.balance, 8);

  const legacyClientConsume = await requestJson(baseUrl, "/api/shumiao/consume", {
    method: "POST",
    headers: { satoken: "user-token-a" },
    body: {
      count: 1,
      remark: "旧客户端实时扣费",
      detail: { inputType: "manual", itemIndex: 3, totalRows: 1, validCount: 1 },
    },
  });
  assert.equal(legacyClientConsume.code, 200, legacyClientConsume.message);
  assert.equal(legacyClientConsume.data.balance, 7);

  const malformedTaskConsume = await requestJson(baseUrl, "/api/shumiao/consume", {
    method: "POST",
    headers: { satoken: "user-token-a" },
    body: { count: 1, taskId: "task-malformed", itemIndex: 0 },
  });
  assert.equal(malformedTaskConsume.code, 400);

  const taskView = await requestJson(baseUrl, "/api/admin/user-transactions?page=1&pageSize=10", {
    headers: adminHeaders,
  });
  assert.equal(taskView.code, 200, taskView.message);
  assert.equal(taskView.data.view, "tasks");
  assert.equal(taskView.data.total, 1);
  assert.equal(taskView.data.list.length, 1);
  assert.equal(taskView.data.list[0].type, "task");
  assert.equal(taskView.data.list[0].taskId, "task-001");
  assert.equal(taskView.data.list[0].consumedQuota, 2);
  assert.equal(taskView.data.list[0].balanceAfter, 8);
  assert.equal(taskView.data.list[0].itemCount, 2);
  assert.equal(taskView.data.list[0].plannedCount, 2);
  assert.equal(taskView.data.list[0].source, "xlsx");
  assert.equal(taskView.data.list[0].fileName, "tasks.xlsx");
  assert.ok(taskView.data.list[0].startedAt);
  assert.ok(taskView.data.list[0].updatedAt);
  assert.ok(taskView.data.list[0].detail);
  assert.equal("rows" in taskView.data.list[0].detail, false);

  const legacyView = await requestJson(baseUrl, "/api/admin/user-transactions?page=1&pageSize=10&view=legacy", {
    headers: adminHeaders,
  });
  assert.equal(legacyView.code, 200, legacyView.message);
  assert.equal(legacyView.data.view, "legacy");
  assert.equal(legacyView.data.total, 2);
  assert.ok(legacyView.data.list.every((item) => item.type === "legacy"));
  const seededLegacy = legacyView.data.list.find((item) => item.consumedQuota === 2);
  assert.equal(seededLegacy.balanceAfter, 10);

  const allView = await requestJson(baseUrl, "/api/admin/user-transactions?page=1&pageSize=10&view=all", {
    headers: adminHeaders,
  });
  assert.equal(allView.code, 200, allView.message);
  assert.equal(allView.data.view, "all");
  assert.equal(allView.data.total, 3);

  const resetPassword = await requestJson(baseUrl, "/api/admin/users/1/reset-password", {
    method: "POST",
    headers: adminHeaders,
    body: { newPassword: "newPass456" },
  });
  assert.equal(resetPassword.code, 200, resetPassword.message);
  assert.equal(resetPassword.data.revokedTokens, 2);
  assert.doesNotMatch(JSON.stringify(resetPassword), /newPass456|oldPass123|\$2[aby]\$/);

  const revokedTokenUse = await requestJson(baseUrl, "/api/shumiao/check-balance?count=1", {
    headers: { satoken: "user-token-a" },
  });
  assert.equal(revokedTokenUse.code, 401);

  const verifyDb = openDb(dbPath);
  const tokenCount = await dbGet(verifyDb, "SELECT COUNT(*) AS count FROM user_tokens");
  assert.equal(tokenCount.count, 0);
  const auditRow = await dbGet(
    verifyDb,
    `SELECT admin_username AS adminUsername, user_id AS userId, action, request_source AS requestSource, created_at AS createdAt
     FROM admin_user_audit_logs
     ORDER BY id DESC
     LIMIT 1`,
  );
  assert.deepEqual(Object.keys(auditRow).sort(), ["action", "adminUsername", "createdAt", "requestSource", "userId"].sort());
  assert.equal(auditRow.adminUsername, "admin");
  assert.equal(auditRow.userId, 1);
  assert.equal(auditRow.action, "reset_password");
  assert.match(auditRow.requestSource, /POST \/api\/admin\/users\/1\/reset-password/);
  assert.doesNotMatch(JSON.stringify(auditRow), /newPass456|oldPass123|\$2/);
  await closeDb(verifyDb);

  const oldPasswordLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { phone: "13800000000", password: "oldPass123" },
  });
  assert.equal(oldPasswordLogin.code, 400);

  const newPasswordLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { phone: "13800000000", password: "newPass456" },
  });
  assert.equal(newPasswordLogin.code, 200, newPasswordLogin.message);

  const logText = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter((name) => name.endsWith(".log")).map((name) => fs.readFileSync(path.join(logDir, name), "utf8")).join("\n")
    : "";
  assert.doesNotMatch(logText, /newPass456|oldPass123|inactivePass123|\$2[aby]\$/);
});
