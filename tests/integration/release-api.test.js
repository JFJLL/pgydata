const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const apiRoot = path.join(repoRoot, "red-magic-api");

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

test("latest endpoints share one release manifest", async (t) => {
  const assetsPath = path.join(apiRoot, "public/assets/desktop/1.1.3/assets.zip");
  assert.ok(fs.existsSync(assetsPath), "expected the packaged 1.1.3 assets fixture");
  const assetsBuffer = fs.readFileSync(assetsPath);
  const assetsSha = crypto.createHash("sha256").update(assetsBuffer).digest("hex");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-api-test-"));
  const port = 36000 + Math.floor(Math.random() * 2000);
  const manifestPath = path.join(tempDir, "latest.json");
  const manifest = {
    schemaVersion: 1,
    channel: "stable",
    desktop: {
      version: "9.8.7",
      fileName: "magiorix-desktop-9.8.7-windows.exe",
      downloadUrl: "https://example.test/magiorix-desktop-9.8.7-windows.exe",
      size: 123456,
      sha256: "d".repeat(64),
    },
    assets: {
      version: "1.1.3",
      fileName: "assets.zip",
      downloadUrl: `http://127.0.0.1:${port}/assets/desktop/1.1.3/assets.zip`,
      size: assetsBuffer.length,
      sha256: assetsSha,
    },
    releaseNotes: ["Integration release"],
    generatedAt: "2026-07-20T00:00:00.000Z",
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(tempDir, "api.sqlite"),
      LOG_DIR: path.join(tempDir, "logs"),
      RELEASE_MANIFEST_PATH: manifestPath,
      ADMIN_PASSWORD: "test-admin-password",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const desktop = await waitForJson(`${baseUrl}/api/desktop-download/latest`);
  assert.equal(desktop.code, 200, stderr);
  assert.equal(desktop.data.version, manifest.desktop.version);
  assert.equal(desktop.data.fileName, manifest.desktop.fileName);
  assert.equal(desktop.data.downloadUrl, manifest.desktop.downloadUrl);
  assert.equal(desktop.data.checksum, manifest.desktop.sha256);
  assert.equal(desktop.data.size, manifest.desktop.size);

  const assets = await waitForJson(`${baseUrl}/api/frontend-assets/latest/desktop`);
  assert.equal(assets.data.version, manifest.assets.version);
  assert.equal(assets.data.fileName, manifest.assets.fileName);
  assert.equal(assets.data.downloadUrl, manifest.assets.downloadUrl);
  assert.equal(assets.data.size, manifest.assets.size);
  assert.equal(assets.data.checksum, `sha256:${manifest.assets.sha256}`);

  const check = await waitForJson(`${baseUrl}/api/desktop-versions/check?currentVersion=1.1.3&platform=windows`);
  assert.equal(check.data.hasUpdate, true);
  assert.equal(check.data.version, manifest.desktop.version);
  assert.equal(check.data.fileName, manifest.desktop.fileName);
  assert.equal(check.data.downloadUrl, manifest.desktop.downloadUrl);
  assert.equal(check.data.fileSize, manifest.desktop.size);
  assert.equal(check.data.checksum, manifest.desktop.sha256);
});
