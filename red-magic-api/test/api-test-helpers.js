const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const apiRoot = path.resolve(__dirname, "..");

function makeTempContext(prefix = "magiorix-1-2-0-") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const port = 40000 + Math.floor(Math.random() * 10000);
  return {
    tempDir,
    port,
    dbPath: path.join(tempDir, "api.sqlite"),
    logDir: path.join(tempDir, "logs"),
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok || body?.code) return body;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body };
}

async function requestForm(baseUrl, pathname, fields, options = {}) {
  const body = new URLSearchParams(fields);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(options.headers || {}),
    },
    body,
  });
  return { response, text: await response.text() };
}

async function startServer(context, env = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      // 本地 .env 里的真实支付配置会经 dotenv 注入子进程，测试必须与真实密钥隔离：
      // dotenv 不会覆盖已存在的环境变量，这里显式置空即可屏蔽。测试如需覆盖，
      // 通过 withServer 的 env 参数传入（...env 在最后，优先级最高）。
      WXPAY_ENABLED: "",
      WXPAY_APP_ID: "",
      WXPAY_MCH_ID: "",
      WXPAY_SERIAL_NO: "",
      WXPAY_PRIVATE_KEY_PATH: "",
      WXPAY_PRIVATE_KEY: "",
      WXPAY_API_V3_KEY: "",
      WXPAY_PUBLIC_KEY_PATH: "",
      WXPAY_PUBLIC_KEY: "",
      WXPAY_PUBLIC_KEY_ID: "",
      WXPAY_GATEWAY: "",
      WXPAY_NOTIFY_URL: "",
      ALIPAY_ENABLED: "",
      ALIPAY_APP_ID: "",
      ALIPAY_SELLER_ID: "",
      ALIPAY_PRIVATE_KEY_PATH: "",
      ALIPAY_PUBLIC_KEY_PATH: "",
      ALIPAY_GATEWAY: "",
      ALIPAY_NOTIFY_URL: "",
      ALIPAY_RETURN_URL: "",
      RECONCILIATION_ENABLED: "",
      PORT: String(context.port),
      DB_PATH: context.dbPath,
      LOG_DIR: context.logDir,
      BASE_URL: context.baseUrl,
      NODE_ENV: "test",
      SMS_TEST_MODE: "1",
      PAYMENT_TEST_MODE: "1",
      SMS_SECRET: "test-sms-secret",
      SMS_IP_HASH_SECRET: "test-ip-secret",
      ADMIN_PASSWORD: "test-admin-password",
      ALIPAY_TEST_MODE: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited ${child.exitCode}: ${stderr || stdout}`);
    }
    try {
      const response = await fetch(`${context.baseUrl}/api/desktop-versions/check?currentVersion=0.0.0&platform=windows`);
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}: ${stderr || stdout}`);
  if (Date.now() >= deadline) throw lastError || new Error(`Timed out starting server: ${stderr || stdout}`);

  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    async close() {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((resolve) => child.once("exit", resolve));
      }
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    },
  };
}

async function withServer(testContext, env, callback) {
  const context = makeTempContext();
  const server = await startServer(context, env);
  try {
    return await callback(context, server);
  } finally {
    await server.close();
  }
}

function authHeaders(token) {
  assert.ok(token);
  return { satoken: token };
}

module.exports = {
  apiRoot,
  authHeaders,
  makeTempContext,
  requestJson,
  requestForm,
  startServer,
  waitForJson,
  withServer,
};
