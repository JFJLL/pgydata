const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const sqlite3 = require("sqlite3").verbose();

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function dbRun(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.run(sql, params, function complete(error) {
      db.close();
      if (error) reject(error);
      else resolve(this);
    });
  });
}

async function startApi(envOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-1.1.9-test-"));
  const dbPath = path.join(root, "api.sqlite");
  const logDir = path.join(root, "logs");
  const privateKeyPath = path.join(root, "private.pem");
  const publicKeyPath = path.join(root, "public.pem");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }));
  const port = await freePort();
  const apiDir = path.resolve(__dirname, "..");
  const serverPath = process.env.MAGIORIX_SERVER_PATH || path.join(apiDir, "server.js");
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    BASE_URL: `http://127.0.0.1:${port}`,
    PAY_BASE_URL: `http://127.0.0.1:${port}`,
    DB_PATH: dbPath,
    LOG_DIR: logDir,
    SMS_CODE_SECRET: "test-only-code-secret-32-characters",
    SMS_TEST_MODE: "1",
    SMS_TEST_CODE: "1234",
    PAYMENT_TEST_MODE: "1",
    WECHAT_PAY_APP_ID: "wx-test-app",
    WECHAT_PAY_MCH_ID: "wx-test-merchant",
    WECHAT_PAY_MCH_SERIAL_NO: "merchant-serial",
    WECHAT_PAY_PLATFORM_SERIAL_NO: "platform-serial",
    WECHAT_PAY_PRIVATE_KEY_PATH: privateKeyPath,
    WECHAT_PAY_PLATFORM_CERT_PATH: publicKeyPath,
    WECHAT_PAY_API_V3_KEY: "12345678901234567890123456789012",
    WECHAT_PAY_NOTIFY_URL: `http://127.0.0.1:${port}/order`,
    ALIPAY_APP_ID: "alipay-test-app",
    ALIPAY_SELLER_ID: "alipay-test-seller",
    ALIPAY_PRIVATE_KEY_PATH: privateKeyPath,
    ALIPAY_PUBLIC_KEY_PATH: publicKeyPath,
    ALIPAY_NOTIFY_URL: `http://127.0.0.1:${port}/order/alipay/notify`,
    ALIPAY_RETURN_URL: `http://127.0.0.1:${port}/order/alipay/return`,
    ...envOverrides,
  };
  const child = spawn(process.execPath, [serverPath], { cwd: path.dirname(serverPath), env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited ${child.exitCode}: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/desktop-versions/check?currentVersion=1.1.8`);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (Date.now() >= deadline) throw new Error(`API startup timed out: ${output}`);
  return {
    baseUrl,
    dbPath,
    privateKey,
    publicKey,
    api: async (pathname, options = {}) => {
      const headers = { ...(options.body && typeof options.body !== "string" ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
      const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers,
        body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
      });
      const contentType = response.headers.get("content-type") || "";
      return { response, data: contentType.includes("json") ? await response.json() : await response.text() };
    },
    dbRun: (sql, params) => dbRun(dbPath, sql, params),
    stop: async () => {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { startApi };
