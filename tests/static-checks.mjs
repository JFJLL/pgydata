import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const javascriptFiles = [
  "red-magic-api/server.js",
  "red-magic-api/lib/release-manifest.js",
  "scripts/apply-magiorix-frontend-patches.js",
  "scripts/apply-magiorix-runtime-patches.js",
  "app-source/dist-electron/index.js",
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file} failed syntax check:\n${result.stderr || result.stdout}`);
}

for (const file of ["verification-policy.json", "app-source/package.json", "red-magic-api/package.json"]) {
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")), `${file} must contain valid JSON`);
}

const buildScript = readFileSync("scripts/build-magiorix-windows-installer.ps1", "utf8");
assert.match(buildScript, /app-source\\package\.json/, "build must derive versions from package.json");
assert.doesNotMatch(buildScript, /Sync-AssetsToAppData/, "build must not modify the current user's AppData");
assert.doesNotMatch(buildScript, /serverAssetsZip/, "build must not publish server assets as a side effect");
assert.match(buildScript, /WaitForMagiorix/, "installer must wait for the old process");
assert.match(buildScript, /\.installing/, "installer must stage assets before switching the version pointer");
const stageOutPathIndex = buildScript.indexOf('SetOutPath "`$AssetsStage"');
const rootOutPathIndex = buildScript.indexOf('SetOutPath "`$AssetsRoot"', stageOutPathIndex);
const promoteAssetsIndex = buildScript.indexOf('Rename "`$AssetsStage" "`$AssetsTarget"', rootOutPathIndex);
assert.ok(stageOutPathIndex >= 0, "installer must write assets inside the staging directory");
assert.ok(rootOutPathIndex > stageOutPathIndex, "installer must leave the staging directory before promotion");
assert.ok(promoteAssetsIndex > rootOutPathIndex, "installer must release the staging directory before renaming it");
assert.match(buildScript, /publishedVersionManifest/, "build must reject rebuilding a published version");
assert.match(buildScript, /version_pointer_failed/, "installer must roll back assets when the version pointer fails");

const runtimePatch = readFileSync("scripts/apply-magiorix-runtime-patches.js", "utf8");
assert.match(runtimePatch, /pgyHasSingleInstanceLock/, "runtime patch must enforce a single desktop instance");
assert.match(runtimePatch, /pgyDesktopUpdateActive/, "runtime patch must coordinate desktop and asset updates");
assert.match(runtimePatch, /partial-/, "runtime patch must stage asset updates");
assert.match(runtimePatch, /pgyAssetExpectedChecksum/, "runtime patch must verify the downloaded asset archive checksum");
assert.match(runtimePatch, /dailyNotePerformanceChart/, "runtime patch must generate the daily note performance chart");
assert.match(runtimePatch, /daily-note-performance/, "runtime patch must route the daily note chart renderer");

const verificationPolicy = readFileSync("verification-policy.json", "utf8");
assert.doesNotMatch(verificationPolicy, /kimi-browser/, "browser testing must remain excluded");

const packageConfig = JSON.parse(readFileSync("app-source/package.json", "utf8"));
const assetRoot = `assets/${packageConfig.assetsVersion}`;
const integrityManifest = JSON.parse(readFileSync(`${assetRoot}/integrity-manifest.json`, "utf8"));
assert.equal(integrityManifest.version, packageConfig.assetsVersion, "asset manifest version must match package.json");
const aboutBundle = readdirSync(`${assetRoot}/assets`)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(`${assetRoot}/assets/${file}`, "utf8"))
  .find((source) => source.includes("关于 magiorix"));
assert.ok(aboutBundle, "frontend about bundle must exist");
assert.match(aboutBundle, new RegExp(`"${packageConfig.assetsVersion.replaceAll(".", "\\.")}"`), "about page must show the current version");

const mainBundle = readdirSync(`${assetRoot}/assets`)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(`${assetRoot}/assets/${file}`, "utf8"))
  .find((source) => source.includes('field:"dailyNotePerformanceChart"'));
assert.ok(mainBundle, "frontend must expose the daily note performance chart field");
assert.match(
  mainBundle,
  /fansGrowthTrendChart",headerName:"粉丝增长趋势图",width:320\},\{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图"/,
  "daily note chart must follow the five fan chart columns",
);
assert.match(
  mainBundle,
  /key:"dailyNotePerformanceChart",label:"日常笔记表现图"\}\]\},\{groupKey:"daily-90"/,
  "daily note chart must be optional in the daily-30 selector group",
);

console.log(`Static checks passed for ${javascriptFiles.length} JavaScript files.`);
