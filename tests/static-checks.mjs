import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const javascriptFiles = [
  "red-magic-api/server.js",
  "red-magic-api/lib/release-manifest.js",
  "scripts/apply-magiorix-frontend-patches.js",
  "scripts/apply-magiorix-runtime-patches.js",
  "scripts/pgy-kol-phase52-page-source.js",
  "app-source/dist-electron/index.js",
  "app-source/pgy-kol/pgy-kol-ipc.mjs",
  "app-source/pgy-kol/pgy-kol-service.mjs",
  "app-source/pgy-kol/pgy-session-request.mjs",
  "app-source/pgy-kol/pgy-filter-schema.mjs",
  "app-source/pgy-kol/pgy-payload-builder.mjs",
  "app-source/pgy-kol/pgy-kol-search-client.mjs",
  "app-source/pgy-kol/pgy-pagination-planner.mjs",
  "app-source/pgy-kol/pgy-kol-task-store.mjs",
  "app-source/pgy-kol/pgy-kol-batch-runner.mjs",
  "app-source/pgy-kol/pgy-kol-column-registry.mjs",
  "app-source/pgy-kol/pgy-kol-batch-export.mjs",
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file} failed syntax check:\n${result.stderr || result.stdout}`);
}

for (const file of ["verification-policy.json", "app-source/package.json", "red-magic-api/package.json"]) {
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")), `${file} must contain valid JSON`);
}
const backendPackage = JSON.parse(readFileSync("red-magic-api/package.json", "utf8"));
const backendLock = JSON.parse(readFileSync("red-magic-api/package-lock.json", "utf8"));
const backendServer = readFileSync("red-magic-api/server.js", "utf8");
const envExample = readFileSync("red-magic-api/.env.example", "utf8");
assert.match(backendServer, /ADMIN_PASSWORD\.length < 16/, "admin password must have a minimum length");
assert.match(backendServer, /ADMIN_PASSWORD_PLACEHOLDERS/, "public admin password placeholders must be rejected");
assert.match(backendServer, /createHmac\("sha256", LOG_IP_HASH_SECRET\)/, "request IP redaction must use a keyed HMAC");
assert.match(backendServer, /AUTH_FAILURE_MESSAGE/, "password authentication failures must not enumerate accounts");
assert.match(backendServer, /REGISTRATION_FAILURE_MESSAGE/, "registration failures must not enumerate accounts");
assert.match(backendServer, /NODE_ENV === "test" \? \{ error: err\.message \} : null/, "production errors must not expose internal messages");
assert.match(backendServer, /if \(\/\^\\d\+\$\/\.test\(TRUST_PROXY\)\) return false/, "numeric trust proxy hops must not be accepted");
assert.match(envExample, /^ADMIN_PASSWORD=\s*$/m, "environment example must not contain a usable admin password");
assert.equal(backendPackage.dependencies["alipay-sdk"], "4.14.0", "official Alipay SDK must be exact-pinned");
assert.equal(backendLock.packages[""]?.dependencies?.["alipay-sdk"], "4.14.0", "lockfile root must pin Alipay SDK");
assert.equal(backendLock.packages["node_modules/alipay-sdk"]?.version, "4.14.0", "lockfile must resolve the pinned Alipay SDK");
assert.ok(readFileSync("tools/rcedit-x64.exe").length > 0, "pinned rcedit binary must be tracked");
const rceditMetadata = JSON.parse(readFileSync("tools/rcedit-x64.exe.metadata.json", "utf8"));
assert.deepEqual(
  { package: rceditMetadata.package, version: rceditMetadata.version, artifact: rceditMetadata.artifact },
  { package: "rcedit", version: "5.0.2", artifact: "rcedit-x64.exe" },
  "rcedit provenance must be pinned",
);
assert.match(readFileSync("tools/rcedit-x64.exe.sha256", "utf8"), /^[0-9a-f]{64}\s+rcedit-x64\.exe\s*$/i, "rcedit checksum must be present");

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
assert.match(buildScript, /Assert-Rcedit/, "Candidate build must require the pinned rcedit tool");
assert.match(buildScript, /rcedit-x64\.exe\.sha256/, "Candidate build must verify the pinned rcedit checksum");
assert.match(buildScript, /--set-file-version/, "Candidate build must write FileVersion");
assert.match(buildScript, /--set-product-version/, "Candidate build must write ProductVersion");
assert.match(buildScript, /VIProductVersion/, "NSIS installer must carry a product version resource");
assert.match(buildScript, /VIAddVersionKey \/LANG=2052 "FileDescription"/, "NSIS installer must carry FileDescription");
assert.doesNotMatch(buildScript, /Write-Warning [^\n]*rcedit/, "missing rcedit must fail instead of warning");

const runtimePatch = readFileSync("scripts/apply-magiorix-runtime-patches.js", "utf8");
const frontendPatch = readFileSync("scripts/apply-magiorix-frontend-patches.js", "utf8");
const dailyNoteSvgSource = readFileSync("tools/pgy_daily_note_svg.js", "utf8");
const bloggerOverviewSvgSource = readFileSync("tools/pgy_blogger_overview_svg.js", "utf8");
assert.match(runtimePatch, /pgyHasSingleInstanceLock/, "runtime patch must enforce a single desktop instance");
assert.match(runtimePatch, /pgyDesktopUpdateActive/, "runtime patch must coordinate desktop and asset updates");
assert.match(runtimePatch, /partial-/, "runtime patch must stage asset updates");
assert.match(runtimePatch, /pgyAssetExpectedChecksum/, "runtime patch must verify the downloaded asset archive checksum");
assert.match(runtimePatch, /dailyNotePerformanceChart/, "runtime patch must generate the daily note performance chart");
assert.match(runtimePatch, /dailyNotePicturePerformanceChart/, "runtime patch must generate the picture-only daily note chart");
assert.match(runtimePatch, /dailyNoteVideoPerformanceChart/, "runtime patch must generate the video-only daily note chart");
assert.match(runtimePatch, /noteType=1/, "runtime patch must request picture-only daily note data");
assert.match(runtimePatch, /noteType=2/, "runtime patch must request video-only daily note data");
assert.doesNotMatch(
  runtimePatch,
  /if \(!main\.includes\('dailyNotePicturePerformance:/,
  "typed daily note runtime patch steps must remain independently resumable",
);
assert.doesNotMatch(
  frontendPatch,
  /if \(!fs\.readFileSync\(mainBundle[^\n]+dailyNotePicturePerformanceChart/,
  "typed daily note frontend patch steps must remain independently resumable",
);
assert.match(runtimePatch, /daily-note-performance/, "runtime patch must route the daily note chart renderer");
assert.match(runtimePatch, /replaceSection/, "runtime patch must migrate an existing daily note renderer section");
assert.match(runtimePatch, /pgy_daily_note_svg\.js/, "runtime patch must load the maintained daily note SVG source");
// Phase 4 可复现构建（fresh reviewer H1/H2）：runtime 补丁必须自带
// redactLocalPathText import 与 pgy-kol 批量主进程/preload 接线步骤，
// 干净重建不得产生未定义引用或静默丢失批量功能。
assert.match(runtimePatch, /pgyRedactLocalPath/, "runtime patch must reference the redaction helper used by the export log step");
assert.match(runtimePatch, /pgy-kol Phase 4 preload bridge methods/, "runtime patch must wire the pgy-kol preload bridge");
assert.match(runtimePatch, /pgy-kol Phase 4 task store and exporter wiring/, "runtime patch must wire taskBaseDir/exporter");
assert.match(runtimePatch, /pgy-kol Phase 4 batch event broadcast wiring/, "runtime patch must wire the batch event broadcast");
assert.match(runtimePatch, /bloggerOverviewChart/, "runtime patch must generate the blogger overview chart");
assert.match(runtimePatch, /blogger-overview/, "runtime patch must route the blogger overview renderer");
assert.match(runtimePatch, /pgy_blogger_overview_svg\.js/, "runtime patch must load the maintained blogger overview SVG source");
assert.match(runtimePatch, /data_summary\?userId=\\\$\{a\}&business=0/, "runtime patch must request the web overview data_summary endpoint");
assert.match(runtimePatch, /overviewSummary: \["bloggerOverviewChart"\]/, "overview summary endpoint must stay scoped to the overview chart");
assert.match(dailyNoteSvgSource, /width="808" height="378"/, "daily note SVG must use the web-layout canvas");
assert.match(dailyNoteSvgSource, /pgyDailyNoteEllipsize/, "daily note SVG must bound long category text");
assert.match(dailyNoteSvgSource, /pgyNoteTypeLabel/, "daily note SVG must render its selected note type");
assert.match(bloggerOverviewSvgSource, /width="2048" height="1066"/, "blogger overview SVG must match the approved crop");
assert.match(bloggerOverviewSvgSource, /function pgyBuildBloggerOverviewData/, "blogger overview must normalize raw PGY fields");
assert.match(bloggerOverviewSvgSource, /interactionPeerText/, "blogger overview must preserve peer percentile metrics");
assert.match(bloggerOverviewSvgSource, /kolAdvantage/, "blogger overview must read the web kolAdvantage field");
assert.match(bloggerOverviewSvgSource, /无机构/, "blogger overview must fall back to 无机构 like the web page");

const chartRendererBuild = readFileSync("scripts/build-pgy-chart-renderer.ps1", "utf8");
assert.match(chartRendererBuild, /tools\\pgy_chart_renderer\.py/, "chart renderer build must use the maintained Python source");
assert.match(chartRendererBuild, /Invoke-RendererSmokeTest/, "chart renderer build must smoke test the generated executable");
assert.match(chartRendererBuild, /build\.sha256/, "chart renderer build must track its complete build fingerprint");
assert.match(chartRendererBuild, /Get-NormalizedText/, "chart renderer build fingerprint must ignore checkout line endings");
assert.match(chartRendererBuild, /WaitForExit\(\$SmokeTimeoutSeconds \* 1000\)/, "chart renderer smoke test must have a timeout");
assert.match(chartRendererBuild, /\.Kill\(\$true\)/, "chart renderer smoke timeout must terminate the process tree");
assert.match(chartRendererBuild, /0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A/, "chart renderer smoke must verify the full PNG signature");
assert.match(buildScript, /build-pgy-chart-renderer\.ps1/, "Windows packaging must rebuild the bundled chart renderer");

const verificationPolicy = readFileSync("verification-policy.json", "utf8");
assert.doesNotMatch(verificationPolicy, /kimi-browser/, "browser testing must remain excluded");

const packageConfig = JSON.parse(readFileSync("app-source/package.json", "utf8"));
const assetRoot = `assets/${packageConfig.assetsVersion}`;
const integrityManifest = JSON.parse(readFileSync(`${assetRoot}/integrity-manifest.json`, "utf8"));
assert.equal(integrityManifest.version, packageConfig.assetsVersion, "asset manifest version must match package.json");
const frontendBundleSources = readdirSync(`${assetRoot}/assets`)
  .filter((file) => /\.(?:js|css|html|svg)$/i.test(file))
  .map((file) => readFileSync(`${assetRoot}/assets/${file}`, "utf8"))
  .join("\n");
const legacyFrontendBrandPattern = /(?:\bzs\.|@zsdesktop|PYGdata|Emagic(?:DataCrawler| Data Crawler)?|易美(?:传播|数据抓取)?)/i;
assert.doesNotMatch(frontendBundleSources, legacyFrontendBrandPattern, "1.2.0 frontend bundle must not contain legacy brand residue");
assert.match(frontendBundleSources, /magiorix\.login\.method/, "frontend auth storage must use magiorix.login.method");
assert.doesNotMatch(frontendBundleSources, /\/api\/statistics\/admin-dashboard/, "ordinary frontend must not call the admin dashboard endpoint");
assert.match(frontendBundleSources, /\/api\/statistics\/dashboard/, "ordinary frontend must call the safe dashboard endpoint");
for (const field of ["e.users.total", "e.bloggers.xhs.total", "e.finance", "totalAmountYuan", "totalProfitYuan"]) {
  assert.match(frontendBundleSources, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `dashboard UI must tolerate the safe response shape: ${field}`);
}
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
  /fansGrowthTrendChart",headerName:"粉丝增长趋势图",width:320\},\{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图（图文\+视频）"/,
  "daily note chart must follow the five fan chart columns",
);
assert.match(
  mainBundle,
  /\{key:"dailyNotePerformanceChart",label:"日常笔记表现图（图文\+视频）"\},\{key:"dailyNotePicturePerformanceChart",label:"日常笔记表现图（图文）"\},\{key:"dailyNoteVideoPerformanceChart",label:"日常笔记表现图（视频）"\}/,
  "all three daily note charts must be optional in the daily-30 selector group",
);
assert.match(
  mainBundle,
  /dailyNotePerformanceChart",headerName:"日常笔记表现图（图文\+视频）",width:320\},\{field:"dailyNotePicturePerformanceChart",headerName:"日常笔记表现图（图文）",width:320\},\{field:"dailyNoteVideoPerformanceChart",headerName:"日常笔记表现图（视频）",width:320\},\{field:"bloggerOverviewChart",headerName:"博主数据概览图"/,
  "typed daily note chart columns must precede the blogger overview chart",
);
assert.match(
  mainBundle,
  /key:"dailyNoteVideoPerformanceChart",label:"日常笔记表现图（视频）"\},\{key:"bloggerOverviewChart",label:"博主数据概览图"\}\]\},\{groupKey:"daily-90"/,
  "blogger overview selector must immediately follow the three daily note chart selectors",
);
assert.match(
  mainBundle,
  /groupKey:"basic",groupLabel:"本地信息",description:"昵称必选，其余本地信息可按需导出",fields:\[\{key:"nickname",label:"昵称",required:!0\},\{key:"url",label:"主页链接"\}/,
  "only nickname must be required in the pgy blogger local-information group",
);
const fieldSelectorBundle = readdirSync(`${assetRoot}/assets`)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(`${assetRoot}/assets/${file}`, "utf8"))
  .find((source) => source.includes("function ge(t){const r=new Set"));
assert.ok(fieldSelectorBundle, "frontend field selector bundle must exist");
assert.match(fieldSelectorBundle, /l=s\|\|!!g\.required/, "required nickname must be disabled");
assert.match(fieldSelectorBundle, /\(n\.required\|\|a\.required\)&&r\.add\(a\.key\)/, "required nickname must survive group toggles and templates");
assert.match(fieldSelectorBundle, /n\.required\|\|a\.required\|\|a\.defaultSelected/, "required nickname must be selected by default");

console.log(`Static checks passed for ${javascriptFiles.length} JavaScript files.`);
