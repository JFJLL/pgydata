const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(relativePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(path.join(root, relativePath))
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}

test("desktop collection flow persists before idempotent debit and success emission", () => {
  const main = read("app-source/dist-electron/index.js");
  const pending = main.indexOf("recordPendingCharge(t, pgyItemIndex");
  const debit = main.indexOf("consumeShumiaoForItem(e, m, pgyItemIndex)", pending);
  const success = main.indexOf("recordSuccess(t, pgyItemIndex", debit);
  const emit = main.indexOf("W.task.itemResult", success);
  assert.ok(pending > 0, "pending result persistence is missing");
  assert.ok(pending < debit, "debit must happen after pending result persistence");
  assert.ok(debit < success, "success must be persisted after debit confirmation");
  assert.ok(success < emit, "renderer success must be emitted last");
  assert.match(main, /taskId: e\.taskId,\s+itemIndex: o \+ 1/);
  assert.match(main, /pendingCharges\) \? e\.pendingCharges\.length : 0/);
  assert.match(main, /pgyAuthExpired[\s\S]+任务已停止，可重新授权后继续/);
});

test("preload and assistant expose persistent history, partial export, resume, and retention notice", () => {
  const preload = read("app-source/dist-electron/preload.mjs");
  const assistant = read("scripts/magiorix-ops-assistant.js");
  for (const channel of [
    "scraper:history:list",
    "scraper:history:export-task",
    "scraper:history:resume-task",
    "scraper:history:migrate-legacy",
  ]) {
    assert.ok(preload.includes(channel), `missing preload channel ${channel}`);
  }
  assert.match(assistant, /历史明细保留 90 天/);
  assert.match(assistant, /导出已成功内容/);
  assert.match(assistant, /继续任务/);
  assert.doesNotMatch(assistant, /MAX_EXPORT_ROWS_PER_TASK/);
});

test("source package, asset version, backend package, build script, and Candidate stay strictly aligned", async () => {
  const desktop = JSON.parse(read("app-source/package.json"));
  const backend = JSON.parse(read("red-magic-api/package.json"));
  const expectedVersion = desktop.version;
  assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(expectedVersion, "1.1.10");
  assert.equal(desktop.assetsVersion, expectedVersion);
  assert.equal(backend.version, expectedVersion);

  const assets = JSON.parse(read(`assets/${expectedVersion}/version.json`));
  assert.equal(assets.version, expectedVersion);

  const buildScript = read("scripts/build-magiorix-windows-installer.ps1");
  const backendServer = read("red-magic-api/server.js");
  assert.match(buildScript, /\$version = \[string\]\$packageConfig\.version/);
  assert.match(buildScript, /\$assetsVersion = \[string\]\$packageConfig\.assetsVersion/);
  assert.match(buildScript, /desktop-versions\\\$platform\\\$version/);
  assert.match(backendServer, new RegExp(`const ASSET_VERSION = "${expectedVersion.replaceAll(".", "\\.")}"`));

  const candidateDirectory = path.join(root, "desktop-versions", "windows", expectedVersion);
  assert.ok(fs.statSync(candidateDirectory).isDirectory(), `missing Candidate directory ${candidateDirectory}`);
  const releaseInfo = JSON.parse(read(`desktop-versions/windows/${expectedVersion}/release-info.json`));
  const versionManifest = JSON.parse(read(`red-magic-api/public/releases/windows/${expectedVersion}.json`));
  assert.equal(releaseInfo.desktop.version, expectedVersion);
  assert.equal(releaseInfo.assets.version, expectedVersion);
  assert.deepEqual(versionManifest.desktop, releaseInfo.desktop);
  assert.deepEqual(versionManifest.assets, releaseInfo.assets);

  const installerPath = `desktop-versions/windows/${expectedVersion}/${releaseInfo.desktop.fileName}`;
  const assetsZipPath = `desktop-versions/windows/${expectedVersion}/${releaseInfo.assets.fileName}`;
  const preparedAssetsPath = `red-magic-api/public/assets/desktop/${expectedVersion}/assets.zip`;
  assert.equal(fs.statSync(path.join(root, installerPath)).size, releaseInfo.desktop.size);
  assert.equal(fs.statSync(path.join(root, assetsZipPath)).size, releaseInfo.assets.size);
  assert.equal(await sha256(installerPath), releaseInfo.desktop.sha256);
  assert.equal(await sha256(assetsZipPath), releaseInfo.assets.sha256);
  assert.equal(await sha256(preparedAssetsPath), releaseInfo.assets.sha256);
  assert.match(read(`${installerPath}.sha256.txt`), new RegExp(releaseInfo.desktop.sha256, "i"));

  const rechargeBundle = read(`assets/${expectedVersion}/assets/index-C0Ke2Ul0.js`);
  const preload = read("app-source/dist-electron/preload.mjs");
  assert.match(preload, /system:\{[^}]*shell:/);
  assert.match(rechargeBundle, /window\.bridge\.system\.shell\.openExternal/);
  assert.doesNotMatch(rechargeBundle, /window\.bridge\.shell\.openExternal/);
});

test("admin password reset dialog requires matching passwords and task transaction filter", () => {
  const admin = read("red-magic-api/public/admin/index.html");
  const scripts = [...admin.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  assert.doesNotThrow(() => new Function(scripts.at(-1)[1]));
  assert.match(admin, /id="resetPasswordValue"/);
  assert.match(admin, /id="resetPasswordConfirmValue"/);
  assert.match(admin, /confirmPassword !== newPassword/);
  assert.match(admin, /option value="tasks" selected/);
  assert.match(admin, /option value="legacy"/);
  assert.match(admin, /用户当前所有登录 token 会被立即删除/);
});
