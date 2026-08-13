const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { requestJson, withServer } = require("./api-test-helpers");

const apiRoot = path.resolve(__dirname, "..");

test("server keeps client APIs available when the management password is not configured", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-security-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: "0",
      DB_PATH: path.join(tempDir, "api.sqlite"),
      LOG_DIR: path.join(tempDir, "logs"),
      NODE_ENV: "test",
      ADMIN_PASSWORD: "replace-me-with-a-long-random-password",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    const started = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 5000);
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("red-magic-api listening")) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited before startup (${code}): ${stderr}`));
      });
    });
    assert.equal(started, true);
    assert.equal(child.exitCode, null, stderr);
  } finally {
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("management login accepts a configured password shorter than 16 characters", async () => {
  await withServer({}, { ADMIN_PASSWORD: "short-pass" }, async (context) => {
    const result = await requestJson(context.baseUrl, "/api/admin/login", {
      method: "POST",
      body: { username: "admin", password: "short-pass" },
    });
    assert.equal(result.body.code, 200, JSON.stringify(result.body));
    assert.ok(result.body.data.token);
  });
});
