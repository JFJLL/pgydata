const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function runPowerShell(args) {
  return new Promise((resolve) => {
    const child = spawn("pwsh", args, { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("exit", (status) => resolve({ status, stdout, stderr }));
  });
}

test("remote verification accepts exact content and rejects a stale hash", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-remote-verify-"));
  const installer = Buffer.from("synthetic installer fixture");
  const assets = Buffer.from("synthetic assets fixture");
  let manifest;
  let wrongApiSize = false;
  const server = http.createServer((request, response) => {
    const sendJson = (data) => {
      const body = Buffer.from(JSON.stringify({ code: 200, data }));
      response.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      response.end(body);
    };
    if (request.url === "/api/desktop-download/latest") {
      return sendJson({ ...manifest.desktop, checksum: manifest.desktop.sha256 });
    }
    if (request.url === "/api/frontend-assets/latest/desktop") {
      return sendJson({ ...manifest.assets, checksum: `sha256:${manifest.assets.sha256}` });
    }
    if (request.url.startsWith("/api/desktop-versions/check")) {
      return sendJson({
        hasUpdate: true,
        latestVersion: manifest.desktop.version,
        version: manifest.desktop.version,
        fileName: manifest.desktop.fileName,
        downloadUrl: manifest.desktop.downloadUrl,
        fileSize: manifest.desktop.size + (wrongApiSize ? 1 : 0),
        checksum: manifest.desktop.sha256,
      });
    }
    const body = request.url === "/installer.exe" ? installer : assets;
    response.writeHead(200, { "content-length": body.length });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const { port } = server.address();
  manifest = {
    schemaVersion: 1,
    channel: "stable",
    desktop: {
      version: "1.2.3",
      fileName: "installer.exe",
      downloadUrl: `http://127.0.0.1:${port}/installer.exe`,
      size: installer.length,
      sha256: sha256(installer),
    },
    assets: {
      version: "1.2.3",
      fileName: "assets.zip",
      downloadUrl: `http://127.0.0.1:${port}/assets.zip`,
      size: assets.length,
      sha256: sha256(assets),
    },
    releaseNotes: [],
    generatedAt: "2026-07-20T00:00:00.000Z",
  };
  const manifestPath = path.join(tempDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  const scriptPath = path.join(repoRoot, "scripts/verify-magiorix-windows-release.ps1");

  const success = await runPowerShell(["-NoProfile", "-File", scriptPath, "-ManifestPath", manifestPath, "-SkipApi"]);
  assert.equal(success.status, 0, success.stderr || success.stdout);

  const apiSuccess = await runPowerShell([
    "-NoProfile", "-File", scriptPath, "-ManifestPath", manifestPath,
    "-ApiBaseUrl", `http://127.0.0.1:${port}`,
  ]);
  assert.equal(apiSuccess.status, 0, apiSuccess.stderr || apiSuccess.stdout);

  wrongApiSize = true;
  const apiFailure = await runPowerShell([
    "-NoProfile", "-File", scriptPath, "-ManifestPath", manifestPath,
    "-ApiBaseUrl", `http://127.0.0.1:${port}`,
  ]);
  assert.notEqual(apiFailure.status, 0, "API fileSize mismatch must fail verification");
  assert.match(`${apiFailure.stdout}\n${apiFailure.stderr}`, /fileSize does not match/);
  wrongApiSize = false;

  manifest.desktop.sha256 = "f".repeat(64);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  const failure = await runPowerShell(["-NoProfile", "-File", scriptPath, "-ManifestPath", manifestPath, "-SkipApi"]);
  assert.notEqual(failure.status, 0, "stale remote SHA256 must fail verification");
  assert.match(`${failure.stdout}\n${failure.stderr}`, /SHA256 mismatch/);
});
