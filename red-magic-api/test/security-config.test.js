const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const apiRoot = path.resolve(__dirname, "..");

test("server refuses the public admin password placeholder", async () => {
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
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("server did not reject the placeholder password"));
      }, 5000);
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.equal(exit.code, 1, stderr);
    assert.match(stderr, /ADMIN_PASSWORD/);
  } finally {
    if (child.exitCode === null) child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
