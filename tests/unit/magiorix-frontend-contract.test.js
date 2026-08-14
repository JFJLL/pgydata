const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "../..");
const authBundle = path.join(projectRoot, "assets", "1.3.3", "assets", "index-B09sHfUO.js");
const rechargeBundle = path.join(projectRoot, "assets", "1.3.3", "assets", "index-C0Ke2Ul0.js");
const patchScript = path.join(projectRoot, "scripts", "apply-magiorix-frontend-patches.js");
const runtimePatchScript = path.join(projectRoot, "scripts", "apply-magiorix-runtime-patches.js");
const runtimeMain = path.join(projectRoot, "app-source", "dist-electron", "index.js");
const runtimePreload = path.join(projectRoot, "app-source", "dist-electron", "preload.mjs");
const legacyFrontendBrandPattern = /(?:\bzs\.|@zsdesktop|PYGdata|Emagic(?:DataCrawler| Data Crawler)?|易美(?:传播|数据抓取)?)/i;

function readFrontendBundleSource() {
  return fs.readdirSync(path.join(projectRoot, "assets", "1.3.3", "assets"))
    .filter((file) => /\.(?:js|css|html|svg)$/i.test(file))
    .map((file) => fs.readFileSync(path.join(projectRoot, "assets", "1.3.3", "assets", file), "utf8"))
    .join("\n");
}

function assertCleanFrontendBundle(source) {
  assert.doesNotMatch(source, legacyFrontendBrandPattern, "legacy frontend brand residue must not ship");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("1.3.3 auth bundle uses verified registration and password recovery flows", () => {
  const source = fs.readFileSync(authBundle, "utf8");
  for (const endpoint of ["/api/auth/sms/send", "/api/auth/register", "/api/auth/password/reset"]) {
    assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${endpoint}`);
  }
  // 注册默认使用密码，不再请求短信验证码；只有找回密码才用短信验证。
  assert.match(source, /purpose:"reset_password"/);
  assert.match(source, /\\d\{4\}/);
  assert.doesNotMatch(source, /purpose:"register"/);
  assert.doesNotMatch(source, /验证码有效期 5 分钟/);
  assert.match(source, /loginType:"password"/);
  assert.doesNotMatch(source, /不支持在线找回密码/);

  const flowStart = source.indexOf("function y5(){");
  const flowEnd = source.indexOf("function kr(e){", flowStart);
  assert.ok(flowStart >= 0 && flowEnd > flowStart, "auth flow patch is present");
  const registrationFlow = source.slice(flowStart, flowEnd);
  const registerOnlyEnd = source.indexOf("function b5({", flowStart);
  const registerOnly = source.slice(flowStart, registerOnlyEnd);
  assert.doesNotMatch(registrationFlow, /auth\/sms\/login|Jl\(/);
  assert.match(registerOnly, /pgyRegister\(\{phone:v,password:l\}\)/);
  assert.doesNotMatch(registerOnly, /获取验证码|purpose:"register"|验证码已发送/);
  assert.match(registerOnly, /placeholder:"确认密码"/);
  // 找回密码（b5）仍保留短信验证码。
  assert.match(registrationFlow, /purpose:"reset_password"/);
  assert.match(registrationFlow, /获取验证码/);
  assert.match(registrationFlow, /Zt\.getState\(\)\.setToken\(R\.token\)/);
  assert.match(registrationFlow, /Se\.getState\(\)\.setUserInfo\(R\.userInfo\)/);
  assert.doesNotMatch(registrationFlow, /pgyRegister\(\{phone:q,code:T,password:c\}\),await r\(\{loginType:"password"/);
});

test("1.3.3 frontend bundle is branded and uses the safe dashboard contract", () => {
  const source = readFrontendBundleSource();
  assertCleanFrontendBundle(source);
  assert.match(source, /magiorix\.login\.method/);
  assert.doesNotMatch(source, /\/api\/statistics\/admin-dashboard/);
  assert.match(source, /\/api\/statistics\/dashboard/);
  assert.match(source, /function Q0\(\)\{const e=se\(\),t=r1\(\),r=Te\(\),a=no\(e\.breakpoints\.down\("md"\)\)/);
  assert.doesNotMatch(source, /function Q0\(\)\{[^\n]*breakpoints\.down\("lg"\)/);
  assert.match(source, /field:"recentNoteInteractionMedian",headerName:"近期笔记波动中位数"/);
  assert.match(source, /groupKey:"recent-note-fluctuation",groupLabel:"近期笔记波动"/);

  const dashboardStart = source.indexOf("function R5(){");
  const dashboardEnd = source.indexOf("function P5(", dashboardStart);
  assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, "dashboard rendering contract is present");
  const dashboard = source.slice(dashboardStart, dashboardEnd);
  for (const field of ["e.users.total", "e.bloggers.xhs.total", "e.finance"]) {
    assert.match(dashboard, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `safe dashboard shape must retain ${field}`);
  }
  for (const field of ["totalAmountYuan", "totalProfitYuan"]) {
    assert.match(source, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `safe dashboard shape must retain ${field}`);
  }

  const temporarilyInjected = `${source}\nconst legacyStorageKey = "zs.login.method";`;
  assert.throws(() => assertCleanFrontendBundle(temporarilyInjected), /legacy frontend brand residue/);
});

test("1.3.3 points recharge bundle exposes the Alipay-only contract", () => {
  const source = fs.readFileSync(rechargeBundle, "utf8");
  for (const label of ["积分充值", "立即充值", "支付宝", "payUrl", "/query"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${label}`);
  }
  assert.match(source, /const tick=async\(\)=>\{if\(stopped\)return;/);
  for (const forbidden of ["微信", "薯苗", "树苗", "佣金", "邀请返利", "活动"]) {
    assert.doesNotMatch(source, new RegExp(forbidden), `forbidden recharge text: ${forbidden}`);
  }
});

test("frontend patch script is repeatable for the 1.3.3 asset copy", () => {
  const before = sha256(rechargeBundle);
  const authBefore = sha256(authBundle);
  const first = spawnSync(process.execPath, [patchScript], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const middle = sha256(rechargeBundle);
  const authMiddle = sha256(authBundle);
  const second = spawnSync(process.execPath, [patchScript], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const after = sha256(rechargeBundle);
  const authAfter = sha256(authBundle);
  assert.equal(middle, after);
  assert.equal(authMiddle, authAfter);
  assert.notEqual(authBefore, "", "auth bundle hash must be present");
  assert.notEqual(before, "", "bundle hash must be present");
});

test("points routes remain available while the left sidebar hides the points-center group", () => {
  const server = fs.readFileSync(path.join(projectRoot, "red-magic-api", "server.js"), "utf8");
  const mainBundle = fs.readFileSync(path.join(projectRoot, "assets", "1.3.3", "assets", "index-B09sHfUO.js"), "utf8");
  const consumeBundle = fs.readFileSync(path.join(projectRoot, "assets", "1.3.3", "assets", "index-CgHBiVER.js"), "utf8");
  assert.match(server, /name: "积分充值"/);
  assert.match(server, /name: "充值记录"/);
  assert.match(server, /name: "消耗记录"/);
  assert.match(mainBundle, /t\.filter\(r=>r\.id!=="points"\)\.map/, "sidebar must hide the points-center group");
  assert.match(mainBundle, /"\.\.\/pages\/shumiao\/recharge\/index\.tsx"/, "top recharge navigation must retain its route");
  assert.match(consumeBundle, /solar:receipt-text-bold-duotone/, "consume records heading must carry its styled icon");
  assert.doesNotMatch(server, /path: "\/shumiao\/commission"/);
  assert.doesNotMatch(mainBundle, /pages\/shumiao\/commission/);
});

test("payment external links stay behind the main-process HTTPS allowlist", () => {
  const main = fs.readFileSync(runtimeMain, "utf8");
  const preload = fs.readFileSync(runtimePreload, "utf8");
  assert.match(main, /pgyPaymentExternalOrigin/);
  assert.match(main, /t\.protocol !== "https:"/);
  assert.match(main, /pgyPaymentExternalOrigins/);
  assert.match(main, /function pgyCompareAssetVersions/);
  assert.match(main, /远程资源较旧，拒绝回退/);
  assert.match(main, /拒绝将前端资源从/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /pgyIsMainWindowNavigationAllowed/);
  assert.match(main, /allowedFilePath/);
  assert.match(main, /Oe\(a, "index\.html"\)/);
  assert.doesNotMatch(main, /if \(t\.protocol === "file:"\) return true/);
  assert.match(main, /webContents\.on\("will-navigate"/);
  assert.match(main, /webContents\.on\("will-redirect"/);
  assert.doesNotMatch(main, /Ji\.openExternal\(n\)/);
  assert.match(main, /F\.handle\(Fe\.shell\.openExternal/);
  assert.match(main, /支付地址不安全或不受支持/);
  assert.match(main, /function pgyOpenPaymentWindow/);
  assert.match(main, /支付宝支付 - magiorix/);
  assert.match(main, /windowOptions\.parent = parent/);
  assert.match(main, /windowOptions\.modal = true/);
  assert.match(main, /skipTaskbar: true/);
  assert.match(main, /F\.on\(Fe\.shell\.closePayment/);
  assert.match(main, /s\.isMaximized\(\) \|\| s\.maximize\(\)/);
  assert.match(main, /width: 900, height: 720/);
  assert.match(main, /pgyOpenPaymentWindow\(s, a\(\)\)/);
  assert.match(main, /url\.hostname\.endsWith\("\.alipay\.com"\)/);
  assert.match(main, /nodeIntegration: false, contextIsolation: true, sandbox: true/);
  assert.match(preload, /openExternal:e=>r\.ipcRenderer\.invoke/);
  assert.doesNotMatch(main, /树苗|薯苗/);
  assert.match(preload, /openSafeExternal/);
  assert.match(preload, /closePayment/);
  const rechargeSource = fs.readFileSync(rechargeBundle, "utf8");
  assert.match(rechargeSource, /shell\?\.openExternal/);
  assert.match(rechargeSource, /await window\.bridge\?\.system\?\.shell\?\.openExternal/);
  assert.match(rechargeSource, /支付宝支付窗口已打开/);
  assert.match(rechargeSource, /closePayment\?\.\(\)/);
  assert.doesNotMatch(rechargeSource, /openSafeExternal/);
  const recordsSource = fs.readFileSync(path.join(projectRoot, "assets", "1.3.3", "assets", "index-DHMLmlYD.js"), "utf8");
  assert.doesNotMatch(recordsSource, /t\.amountYuan\.toFixed\(2\)/);
  assert.match(recordsSource, /Number\.isFinite\(Number\(t\.amountYuan\)\)/);
  const consumeSource = fs.readFileSync(path.join(projectRoot, "assets", "1.3.3", "assets", "index-CgHBiVER.js"), "utf8");
  assert.match(consumeSource, /a\.consumeCount\?\?a\.count\?\?0/);
  assert.doesNotMatch(consumeSource, /\?\?[^;,)]+\|\|/);
  const first = spawnSync(process.execPath, [runtimePatchScript], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = spawnSync(process.execPath, [runtimePatchScript], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr || second.stdout);
});
