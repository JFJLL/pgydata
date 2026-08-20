const fs = require("fs");
const path = require("path");

const projectRoot = process.env.MAGIORIX_PATCH_PROJECT_ROOT
  ? path.resolve(process.env.MAGIORIX_PATCH_PROJECT_ROOT)
  : path.resolve(__dirname, "..");
const mainPath = path.join(projectRoot, "app-source", "dist-electron", "index.js");
const preloadPath = path.join(projectRoot, "app-source", "dist-electron", "preload.mjs");
const chartRendererSourcePath = path.join(projectRoot, "tools", "pgy_chart_renderer.py");
const chinaGeoJsonSourcePath = path.join(projectRoot, "tools", "china-provinces.geojson");
const chinaGeoJsonTargetPath = path.join(projectRoot, "app-source", "dist-electron", "static", "china-provinces.geojson");
const dailyNoteSvgSourcePath = path.join(projectRoot, "tools", "pgy_daily_note_svg.js");
const dailyNoteSvgSource = fs.readFileSync(dailyNoteSvgSourcePath, "utf8").trim();
const bloggerOverviewSvgSourcePath = path.join(projectRoot, "tools", "pgy_blogger_overview_svg.js");
const bloggerOverviewSvgSource = fs.readFileSync(bloggerOverviewSvgSourcePath, "utf8").trim();
const trendSvgSourcePath = path.join(projectRoot, "tools", "pgy_trend_svg.js");
const trendSvgSource = fs.readFileSync(trendSvgSourcePath, "utf8").trim();
const overviewIconsSourcePath = path.join(projectRoot, "tools", "overview-icons");
const overviewIconsTargetPath = path.join(projectRoot, "app-source", "dist-electron", "static", "overview-icons");

function replaceOnce(source, from, to, label) {
  // 行尾无关：源码与模板统一按 LF 比较，输出统一为 LF。
  // 这样同一补丁在 LF 源码、CRLF 源码、混合行尾源码上都幂等。
  const norm = (value) => value.replace(/\r\n/g, "\n");
  const sourceNorm = norm(source);
  const fromNorm = norm(from);
  const toNorm = norm(to);
  if (sourceNorm.includes(toNorm)) return source;
  if (!sourceNorm.includes(fromNorm)) {
    throw new Error(`Missing patch target: ${label}`);
  }
  return sourceNorm.replace(fromNorm, toNorm);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const norm = (value) => value.replace(/\r\n/g, "\n");
  const sourceNorm = norm(source);
  const start = sourceNorm.indexOf(norm(startMarker));
  const end = start >= 0 ? sourceNorm.indexOf(norm(endMarker), start) : -1;
  if (start < 0 || end < 0) throw new Error(`Missing patch section: ${label}`);
  const normalized = norm(replacement).trimEnd() + "\n\n";
  return sourceNorm.slice(0, start) + normalized + sourceNorm.slice(end);
}

function replaceAllIfExists(source, from, to) {
  const norm = (value) => value.replace(/\r\n/g, "\n");
  const sourceNorm = norm(source);
  const fromNorm = norm(from);
  if (!sourceNorm.includes(fromNorm)) return sourceNorm;
  return sourceNorm.split(fromNorm).join(norm(to));
}

function removeSectionIfExists(source, startMarker, endMarker) {
  const norm = (value) => value.replace(/\r\n/g, "\n");
  const sourceNorm = norm(source);
  const start = sourceNorm.indexOf(norm(startMarker));
  if (start < 0) return sourceNorm;
  const end = sourceNorm.indexOf(norm(endMarker), start);
  if (end < 0) throw new Error(`Missing removal end marker: ${endMarker}`);
  return sourceNorm.slice(0, start) + sourceNorm.slice(end);
}

function insertAfterOnce(source, marker, insert, already, label) {
  const norm = (value) => value.replace(/\r\n/g, "\n");
  const sourceNorm = norm(source);
  if (sourceNorm.includes(norm(already))) return source;
  const markerNorm = norm(marker);
  if (!sourceNorm.includes(markerNorm)) throw new Error(`Missing patch marker: ${label}`);
  return sourceNorm.replace(markerNorm, `${markerNorm}\n${norm(insert)}`);
}

const originalMain = fs.readFileSync(mainPath, "utf8");
let main = originalMain;

// 近期笔记波动只保留 interactionMedian 数据列，不再生成或导出图片。
main = replaceAllIfExists(main, '  recentNoteInteractionFluctuationChart: ["recentNoteInteractionFluctuationChart"],\n', "");
main = replaceAllIfExists(main, '    "recentNoteInteractionFluctuationChart",\n', "");
main = replaceAllIfExists(main, '  recentNoteInteractionFluctuation: "recentNoteInteractionFluctuationChart",\n', "");
main = replaceAllIfExists(main, '  pgyHasSelectedField(n, PYG_CHART_FIELDS.recentNoteInteractionFluctuation) && i.push({ field: "recentNoteInteractionFluctuationChart", type: "recent-note-interaction-fluctuation", data: d ?? {}, output: pgyChartFile("daily-note", a, "recent-note-interaction-fluctuation") });\n', "");
main = main.replace(' : o.type === "recent-note-interaction-fluctuation" ? r = pgyWriteSvgPng(pgyRecentNoteFluctuationSvg(o.data ?? {}), o.output)', "");
main = main.replace(/            elif chart_type == "recent-note-interaction-fluctuation":\r?\n                ok = save_recent_note_fluctuation\(chart\)\r?\n/g, "");
main = removeSectionIfExists(main, "def save_recent_note_fluctuation(chart):", "def main():");
main = removeSectionIfExists(main, "// 近期笔记波动图（互动量）JS/SVG 兜底", "async function buildPgyBloggerChartFields");
main = replaceAllIfExists(
  main,
  "mEngagementNum30: o.interactionMedian,",
  "mEngagementNum30: o.mEngagementNum,\n      recentNoteInteractionMedian: o.interactionMedian,",
);
if (!main.includes("recentNoteInteractionMedian: o.interactionMedian")) {
  main = replaceOnce(
    main,
    "mEngagementNum30: o.mEngagementNum,",
    "mEngagementNum30: o.mEngagementNum,\n      recentNoteInteractionMedian: o.interactionMedian,",
    "separate recent-note interaction median field",
  );
}
main = replaceAllIfExists(
  main,
  '    "mEngagementNum30",\n    "impMedian30",',
  '    "mEngagementNum30",\n    "recentNoteInteractionMedian",\n    "impMedian30",',
);
const originalPreload = fs.readFileSync(preloadPath, "utf8");
let preload = originalPreload;

main = main.split("薯苗").join("积分");
main = main.split("树苗").join("积分");

main = replaceAllIfExists(
  main,
  `function pgyIsMainWindowNavigationAllowed(value) {
  try {
    const t = new URL(String(value));
    if (t.protocol === "file:") return true;
    const dev = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL) : null;
    return Boolean(dev && t.origin === dev.origin);
  } catch {
    return false;
  }
}`,
  `function pgyIsMainWindowNavigationAllowed(value, allowedFilePath) {
  try {
    const t = new URL(String(value));
    if (t.protocol === "file:") {
      const targetPath = Xi.resolve(Ka(t));
      const allowedPath = Xi.resolve(String(allowedFilePath || ""));
      return process.platform === "win32"
        ? targetPath.toLowerCase() === allowedPath.toLowerCase()
        : targetPath === allowedPath;
    }
    const dev = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL) : null;
    return Boolean(dev && t.origin === dev.origin);
  } catch {
    return false;
  }
}`,
);
main = replaceAllIfExists(
  main,
  "pgyIsMainWindowNavigationAllowed(n))",
  'pgyIsMainWindowNavigationAllowed(n, Oe(a, "index.html")))',
);

main = insertAfterOnce(
  main,
  'import { ipcMain as F, BrowserWindow as Dt, app as ye, screen as Gi, shell as Ji, dialog as Ki, net as Jt, Notification as Et, session as Pn, nativeImage as PgyNativeImage } from "electron";',
  'import { CollectionHistoryStore, isCollectionTaskExportReady } from "../electron-main/collection-history-store.mjs";',
  'import { CollectionHistoryStore',
  "collection history store import",
);

main = insertAfterOnce(
  main,
  'import { CollectionHistoryStore, isCollectionTaskExportReady } from "../electron-main/collection-history-store.mjs";',
  'import { buildCollectionHistoryExportPayload } from "../electron-main/collection-export-headers.mjs";',
  'import { buildCollectionHistoryExportPayload }',
  "collection export headers import",
);

if (!main.includes("const pgyCollectionHistory")) {
  main = replaceOnce(
    main,
    `try {
  ye.setName("magiorix"), ye.setPath("userData", pgyUserDataDir);
} catch {
}`,
    `try {
  ye.setName("magiorix"), ye.setPath("userData", pgyUserDataDir);
} catch {
}
const pgyCollectionHistory = new CollectionHistoryStore({ baseDir: Oe(pgyUserDataDir, "collection-history"), retentionDays: 90 });`,
    "collection history store initialization",
  );
}

const legacyHost = `https://${"api"}.red-magic.cn`;
main = main.split(legacyHost).join("https://magiorix.red-magic.cn");

if (!main.includes("pgyPaymentExternalOrigin")) {
  main = replaceOnce(
    main,
    `const Fe = {
  shell: {
    openExternal: "system:shell:open-external"
  },`,
    `const Fe = {
  shell: {
    openExternal: "system:shell:open-external",
    openSafeExternal: "system:shell:open-safe-external"
  },`,
    "payment external IPC channel",
  );

  main = replaceOnce(
    main,
    `const Wr = (a) => {
  F.on(Fe.shell.openExternal, (t, n) => {
    Ji.openExternal(n);
  }), F.on(Fe.window.minimize, () => {`,
    `const pgyPaymentExternalOrigin = (() => {
  try {
    const t = new URL(process.env.MAGIORIX_PAYMENT_ORIGIN || "https://magiorix.red-magic.cn");
    const n = /^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(t.hostname) || t.hostname.includes(":");
    if (t.protocol !== "https:" || t.port || t.username || t.password || n) return "https://magiorix.red-magic.cn";
    return t.origin;
  } catch {
    return "https://magiorix.red-magic.cn";
  }
})();
const pgyPaymentExternalOrigins = new Set([pgyPaymentExternalOrigin]);
const pgySafeExternalOrigins = new Set([
  "https://pgy.xiaohongshu.com",
  "https://www.xiaohongshu.com",
  "https://xiaohongshu.com",
  "https://xhslink.com",
  "https://www.xhslink.com",
  "https://www.douyin.com",
  "https://douyin.com",
  "https://v.douyin.com",
  "https://www.iesdouyin.com",
  "https://www.xingtu.cn",
  "https://xingtu.cn",
  "https://magiorix.red-magic.cn",
  "http://127.0.0.1:3050",
  "http://localhost:3050",
  "http://127.0.0.1:3000",
  "http://localhost:3000"
]);
function pgyResolveExternal(value, allowedOrigins) {
  try {
    const t = new URL(String(value));
    if ((t.protocol !== "https:" && t.protocol !== "http:") || t.username || t.password || !allowedOrigins.has(t.origin)) return null;
    return t.href;
  } catch {
    return null;
  }
}

function pgyIsMainWindowNavigationAllowed(value, allowedFilePath) {
  try {
    const t = new URL(String(value));
    if (t.protocol === "file:") {
      const targetPath = Xi.resolve(Ka(t));
      const allowedPath = Xi.resolve(String(allowedFilePath || ""));
      return process.platform === "win32"
        ? targetPath.toLowerCase() === allowedPath.toLowerCase()
        : targetPath === allowedPath;
    }
    const dev = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL) : null;
    return Boolean(dev && t.origin === dev.origin);
  } catch {
    return false;
  }
}
const Wr = (a) => {
  F.on(Fe.shell.openExternal, (t, n) => {
    const s = pgyResolveExternal(n, pgyPaymentExternalOrigins);
    if (s) void Ji.openExternal(s);
  }), F.on(Fe.shell.openSafeExternal, (t, n) => {
    const s = pgyResolveExternal(n, pgySafeExternalOrigins);
    if (s) void Ji.openExternal(s);
  }), F.on(Fe.window.minimize, () => {`,
    "payment external IPC allowlist",
  );
}

if (!main.includes('closePayment: "system:shell:close-payment"')) {
  main = replaceOnce(
    main,
    'openSafeExternal: "system:shell:open-safe-external"',
    'openSafeExternal: "system:shell:open-safe-external",\n    closePayment: "system:shell:close-payment"',
    "payment close IPC channel",
  );
}

main = replaceAllIfExists(
  main,
  `const Wr = (a) => {
  F.on(Fe.shell.openExternal, (t, n) => {
    const s = pgyResolveExternal(n, pgyPaymentExternalOrigins);
    if (s) void Ji.openExternal(s);
  }), F.on(Fe.shell.openSafeExternal, (t, n) => {
    const s = pgyResolveExternal(n, pgySafeExternalOrigins);
    if (s) void Ji.openExternal(s);
  }), F.on(Fe.window.minimize, () => {`,
  `const Wr = (a) => {
  F.handle(Fe.shell.openExternal, async (t, n) => {
    const s = pgyResolveExternal(n, pgyPaymentExternalOrigins);
    if (!s) throw new Error("支付地址不安全或不受支持");
    await Ji.openExternal(s);
    return true;
  }), F.on(Fe.shell.openSafeExternal, (t, n) => {
    const s = pgyResolveExternal(n, pgySafeExternalOrigins);
    if (s) void Ji.openExternal(s);
  }), F.on(Fe.window.minimize, () => {`,
);

main = replaceAllIfExists(
  main,
  `async function pgyOpenPaymentWindow(value) {
  const target = pgyResolveExternal(value, pgyPaymentExternalOrigins);
  if (!target) throw new Error("支付地址不安全或不受支持");
  const paymentWindow = new Dt({ width: 1180, height: 820, minWidth: 960, minHeight: 680, show: false, title: "支付宝支付 - magiorix", autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  paymentWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockUnexpectedNavigation = (event, url) => { if (!pgyIsPaymentWindowUrl(url)) event.preventDefault(); };
  paymentWindow.webContents.on("will-navigate", blockUnexpectedNavigation);
  paymentWindow.webContents.on("will-redirect", blockUnexpectedNavigation);
  try {
    await paymentWindow.loadURL(target);
    if (!paymentWindow.isDestroyed()) paymentWindow.show();
    return true;
  } catch (error) {
    if (!paymentWindow.isDestroyed()) paymentWindow.destroy();
    throw new Error("支付窗口加载失败：" + pgyAssetErrorMessage(error));
  }
}`,
  `const pgyPaymentLog = Y("Payment");
async function pgyOpenPaymentWindow(value, parentWindow) {
  const target = pgyResolveExternal(value, pgyPaymentExternalOrigins);
  if (!target) throw new Error("支付地址不安全或不受支持");
  const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : null;
  const windowOptions = { width: 900, height: 720, minWidth: 760, minHeight: 620, show: false, title: "支付宝支付 - magiorix", autoHideMenuBar: true, backgroundColor: "#ffffff", webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } };
  if (parent) { windowOptions.parent = parent; windowOptions.modal = true; }
  const paymentWindow = new Dt(windowOptions);
  pgyPaymentLog.info("正在创建应用内支付宝支付弹窗");
  paymentWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockUnexpectedNavigation = (event, url) => { if (!pgyIsPaymentWindowUrl(url)) event.preventDefault(); };
  paymentWindow.webContents.on("will-navigate", blockUnexpectedNavigation);
  paymentWindow.webContents.on("will-redirect", blockUnexpectedNavigation);
  try {
    await paymentWindow.loadURL(target);
    if (!paymentWindow.isDestroyed()) paymentWindow.show();
    pgyPaymentLog.info("应用内支付宝支付弹窗已显示");
    return true;
  } catch (error) {
    if (!paymentWindow.isDestroyed()) paymentWindow.destroy();
    pgyPaymentLog.error("应用内支付宝支付弹窗加载失败", error);
    throw new Error("支付窗口加载失败：" + pgyAssetErrorMessage(error));
  }
}`,
);

main = replaceAllIfExists(
  main,
  "return await pgyOpenPaymentWindow(s);",
  "return await pgyOpenPaymentWindow(s, a());",
);

if (!main.includes("function pgyOpenPaymentWindow")) {
  main = replaceOnce(
    main,
    "const Wr = (a) => {",
    `function pgyIsPaymentWindowUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return pgyPaymentExternalOrigins.has(url.origin) || url.hostname === "alipay.com" || url.hostname.endsWith(".alipay.com");
  } catch {
    return false;
  }
}
const pgyPaymentLog = Y("Payment");
async function pgyOpenPaymentWindow(value, parentWindow) {
  const target = pgyResolveExternal(value, pgyPaymentExternalOrigins);
  if (!target) throw new Error("支付地址不安全或不受支持");
  const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : null;
  const windowOptions = { width: 900, height: 720, minWidth: 760, minHeight: 620, show: false, title: "支付宝支付 - magiorix", autoHideMenuBar: true, backgroundColor: "#ffffff", webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } };
  if (parent) { windowOptions.parent = parent; windowOptions.modal = true; }
  const paymentWindow = new Dt(windowOptions);
  pgyPaymentLog.info("正在创建应用内支付宝支付弹窗");
  paymentWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockUnexpectedNavigation = (event, url) => { if (!pgyIsPaymentWindowUrl(url)) event.preventDefault(); };
  paymentWindow.webContents.on("will-navigate", blockUnexpectedNavigation);
  paymentWindow.webContents.on("will-redirect", blockUnexpectedNavigation);
  try {
    await paymentWindow.loadURL(target);
    if (!paymentWindow.isDestroyed()) paymentWindow.show();
    pgyPaymentLog.info("应用内支付宝支付弹窗已显示");
    return true;
  } catch (error) {
    if (!paymentWindow.isDestroyed()) paymentWindow.destroy();
    pgyPaymentLog.error("应用内支付宝支付弹窗加载失败", error);
    throw new Error("支付窗口加载失败：" + pgyAssetErrorMessage(error));
  }
}
const Wr = (a) => {`,
    "embedded payment window",
  );
}

if (!main.includes("let pgyPaymentWindow = null")) {
  main = replaceOnce(
    main,
    `const pgyPaymentLog = Y("Payment");
async function pgyOpenPaymentWindow`,
    `const pgyPaymentLog = Y("Payment");
let pgyPaymentWindow = null;
function pgyClosePaymentWindow() {
  if (!pgyPaymentWindow || pgyPaymentWindow.isDestroyed()) {
    pgyPaymentWindow = null;
    return;
  }
  const parent = pgyPaymentWindow.getParentWindow();
  pgyPaymentWindow.close();
  pgyPaymentWindow = null;
  if (parent && !parent.isDestroyed()) {
    parent.show();
    parent.focus();
  }
}
async function pgyOpenPaymentWindow`,
    "single embedded payment window lifecycle",
  );
}
main = replaceAllIfExists(
  main,
  '  const windowOptions = { width: 900, height: 720, minWidth: 760, minHeight: 620, show: false, title:',
  '  pgyClosePaymentWindow();\n  const windowOptions = { width: 900, height: 720, minWidth: 760, minHeight: 620, show: false, skipTaskbar: true, title:',
);
if (!main.includes('paymentWindow.once("closed"')) {
  main = replaceOnce(
    main,
    `  const paymentWindow = new Dt(windowOptions);
  pgyPaymentLog.info`,
    `  const paymentWindow = new Dt(windowOptions);
  pgyPaymentWindow = paymentWindow;
  paymentWindow.once("closed", () => {
    if (pgyPaymentWindow === paymentWindow) pgyPaymentWindow = null;
  });
  pgyPaymentLog.info`,
    "track embedded payment window",
  );
}
if (!main.includes("F.on(Fe.shell.closePayment")) {
  main = replaceOnce(
    main,
    `    return await pgyOpenPaymentWindow(s, a());
  }), F.on(Fe.shell.openSafeExternal`,
    `    return await pgyOpenPaymentWindow(s, a());
  }), F.on(Fe.shell.closePayment, () => {
    pgyClosePaymentWindow();
  }), F.on(Fe.shell.openSafeExternal`,
    "close embedded payment window IPC",
  );
}

main = replaceAllIfExists(
  main,
  `    await Ji.openExternal(s);
    return true;`,
  `    return await pgyOpenPaymentWindow(s, a());`,
);

if (!main.includes("function pgyCompareAssetVersions")) {
  main = replaceOnce(
    main,
    "class Ae {",
    `function pgyCompareAssetVersions(a, b) {
  const parse = (value) => String(value || "").split(".").map((part) => Number.parseInt(part, 10));
  const left = parse(a), right = parse(b);
  if (left.some((part) => !Number.isInteger(part)) || right.some((part) => !Number.isInteger(part))) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
class Ae {`,
    "asset version comparator",
  );
}

main = replaceAllIfExists(
  main,
  `  static async applyAssets(e, t) {
    const n = Oe($n, t), s = \`${'${n}'}.partial-${'${process.pid}'}\`;`,
  `  static async applyAssets(e, t) {
    const currentVersion = this.getLocalVersion();
    if (currentVersion && pgyCompareAssetVersions(t, currentVersion) < 0)
      throw new Error(\`拒绝将前端资源从 ${'${currentVersion}'} 回退到 ${'${t}'}\`);
    const n = Oe($n, t), s = \`${'${n}'}.partial-${'${process.pid}'}\`;`,
);

main = replaceAllIfExists(
  main,
  `      if (K.info(\`版本对比 — 本地: ${'${e}'}, 远程: ${'${t.version}'}\`), e === t.version) {
        K.info("已是最新版本");
        return;
      }
      K.info(\`发现新版本 ${'${t.version}'}，开始下载...\`),`,
  `      const compare = e ? pgyCompareAssetVersions(t.version, e) : 1;
      if (K.info(\`版本对比 — 本地: ${'${e}'}, 远程: ${'${t.version}'}, compare=${'${compare}'}\`), compare <= 0) {
        K.info(compare < 0 ? "远程资源较旧，拒绝回退" : "已是最新版本");
        return;
      }
      K.info(\`发现新版本 ${'${t.version}'}，开始下载...\`),`,
);

main = replaceAllIfExists(
  main,
  `    if (!a || a !== e.version) {
      Ee.info(\`发现新版本 ${'${e.version}'}，后台下载中...\`);`,
  `    if (!a || pgyCompareAssetVersions(e.version, a) > 0) {
      Ee.info(\`发现新版本 ${'${e.version}'}，后台下载中...\`);`,
);

if (!preload.includes('closePayment:"system:shell:close-payment"')) {
  preload = replaceAllIfExists(
    preload,
    'openSafeExternal:"system:shell:open-safe-external"',
    'openSafeExternal:"system:shell:open-safe-external",closePayment:"system:shell:close-payment"',
  );
  if (!preload.includes('closePayment:"system:shell:close-payment"')) {
    preload = replaceOnce(
      preload,
      'shell:{openExternal:"system:shell:open-external"}',
      'shell:{openExternal:"system:shell:open-external",openSafeExternal:"system:shell:open-safe-external",closePayment:"system:shell:close-payment"}',
      "safe external and payment-close preload channels",
    );
  }
}
preload = preload.replace(
  /(?:,closePayment:"system:shell:close-payment")+/g,
  ',closePayment:"system:shell:close-payment"',
);
preload = replaceOnce(
  preload,
  "onStatusChanged:e=>{r.ipcRenderer.on(s.auth.statusChanged,(n,a)=>{e(a)})}",
  "onStatusChanged:e=>{const n=(a,t)=>e(t);return r.ipcRenderer.on(s.auth.statusChanged,n),()=>r.ipcRenderer.removeListener(s.auth.statusChanged,n)}",
  "scraper auth status listener cleanup",
);

if (!preload.includes("openSafeExternal:e=>")) {
  preload = replaceOnce(
    preload,
    'openExternal:e=>{r.ipcRenderer.send(i.shell.openExternal,e)}',
    'openExternal:e=>{r.ipcRenderer.send(i.shell.openExternal,e)},openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)}',
    "safe external preload method",
  );
}
preload = preload.replace(
  'openExternal:e=>{r.ipcRenderer.send(i.shell.openExternal,e)},openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)},openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)}',
  'openExternal:e=>{r.ipcRenderer.send(i.shell.openExternal,e)},openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)}',
);
preload = replaceAllIfExists(
  preload,
  'openExternal:e=>{r.ipcRenderer.send(i.shell.openExternal,e)}',
  'openExternal:e=>r.ipcRenderer.invoke(i.shell.openExternal,e)',
);
preload = replaceAllIfExists(
  preload,
  'openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)}}',
  'openSafeExternal:e=>{r.ipcRenderer.send(i.shell.openSafeExternal,e)},closePayment:()=>{r.ipcRenderer.send(i.shell.closePayment)}}',
);

if (!main.includes("pgyIsMainWindowNavigationAllowed")) {
  main = replaceOnce(
    main,
    "const Wr = (a) => {",
    `function pgyIsMainWindowNavigationAllowed(value, allowedFilePath) {
  try {
    const t = new URL(String(value));
    if (t.protocol === "file:") {
      const targetPath = Xi.resolve(Ka(t));
      const allowedPath = Xi.resolve(String(allowedFilePath || ""));
      return process.platform === "win32"
        ? targetPath.toLowerCase() === allowedPath.toLowerCase()
        : targetPath === allowedPath;
    }
    const dev = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL) : null;
    return Boolean(dev && t.origin === dev.origin);
  } catch {
    return false;
  }
}
const Wr = (a) => {`,
    "main-window navigation validator",
  );
}

if (!main.includes("setWindowOpenHandler(() => ({ action: \"deny\" }))")) {
  main = replaceOnce(
    main,
    "  }), Hr(Z), Xt) {",
    "  }), Hr(Z), Z.webContents.setWindowOpenHandler(() => ({ action: \"deny\" })), Xt) {",
    "deny renderer window.open bypass",
  );
}

if (!main.includes('Z.webContents.on("will-navigate"')) {
  main = replaceOnce(
    main,
    "  }), Hr(Z), Z.webContents.setWindowOpenHandler(() => ({ action: \"deny\" })), Xt) {",
    `  }), Hr(Z), Z.webContents.setWindowOpenHandler(() => ({ action: "deny" })), Z.webContents.on("will-navigate", (t, n) => {
    if (!pgyIsMainWindowNavigationAllowed(n, Oe(a, "index.html"))) t.preventDefault();
  }), Z.webContents.on("will-redirect", (t, n) => {
    if (!pgyIsMainWindowNavigationAllowed(n, Oe(a, "index.html"))) t.preventDefault();
  }), Xt) {`,
    "block main-window external navigation",
  );
}

if (!main.includes("采集任务启动 plugin=")) {
  main = replaceOnce(
    main,
    'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);',
    'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);\n    ue.info(`[task=${t}] 采集任务启动 plugin=${n} taskType=${s} accountSource=${c} total=${i.length} file=${o}`);',
    "scraper task start logging",
  );
  main = replaceOnce(
    main,
    `const p = \`scrape-\${t}\`, d = this.scrapeWindowManager.createWindow(p, {
      url: u.baseUrl,
      show: !1,
      partition: u.sessionPartition
    });`,
    `const p = \`scrape-\${t}\`, d = this.scrapeWindowManager.createWindow(p, {
      url: u.baseUrl,
      show: !1,
      partition: u.sessionPartition
    });
    ue.info(\`[task=\${t}] 隐藏采集窗口已创建 plugin=\${n} baseUrl=\${u.baseUrl} partition=\${u.sessionPartition ?? "(默认)"}\`);`,
    "scraper hidden window logging",
  );
  main = replaceOnce(
    main,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: Math.max(0, Math.round(m / l.total * 100))
      });
      try {`,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: Math.max(0, Math.round(m / l.total * 100))
      });
      ue.info(\`[task=\${t}] 开始采集第 \${m + 1}/\${i.length} 条 plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);
      try {`,
    "scraper item start logging",
  );
  main = replaceOnce(
    main,
    `          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });
      } catch (v) {`,
    `          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
      } catch (v) {
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);`,
    "scraper item result logging",
  );
  main = replaceOnce(
    main,
    `    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;
    l.cancelled ? this.sendToRenderer(W.task.complete, {`,
    `    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;
    ue.info(\`[task=\${t}] 采集任务结束 plugin=\${n} taskType=\${s} cancelled=\${l.cancelled} success=\${l.successCount} error=\${l.errorCount} durationMs=\${h}\`);
    l.cancelled ? this.sendToRenderer(W.task.complete, {`,
    "scraper task complete logging",
  );
  main = replaceOnce(
    main,
    't && (t.cancelled = !0, t.paused && t.pauseResolver && t.pauseResolver(), ue.info(`任务已取消: ${e}`));',
    't && (t.cancelled = !0, t.paused && t.pauseResolver && t.pauseResolver(), ue.info(`任务已取消: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`));',
    "scraper cancel logging",
  );
  main = replaceOnce(
    main,
    't && !t.paused && !t.cancelled && (t.paused = !0, ue.info(`任务已暂停: ${e}`), this.sendToRenderer(W.task.paused, {',
    't && !t.paused && !t.cancelled && (t.paused = !0, ue.info(`任务已暂停: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {',
    "scraper pause logging",
  );
  main = replaceOnce(
    main,
    't && t.paused && (t.paused = !1, t.pauseResolver && (t.pauseResolver(), t.pauseResolver = void 0), ue.info(`任务已继续: ${e}`), this.sendToRenderer(W.task.paused, {',
    't && t.paused && (t.paused = !1, t.pauseResolver && (t.pauseResolver(), t.pauseResolver = void 0), ue.info(`任务已继续: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {',
    "scraper resume logging",
  );
}

if (!main.includes("日额度已满或本班次已满")) {
  main = replaceOnce(
    main,
    `      const l = this.mergeEnterprisePolicy(c, u), p = Date.now(), d = r.filter((v) => {
        const y = v.cooldownUntil ? new Date(v.cooldownUntil).getTime() : 0, b = v.shiftRestUntil ? new Date(v.shiftRestUntil).getTime() : 0, S = l.shiftSize - (v.currentShiftCount ?? 0);
        return y <= p && b <= p && S > 0;
      });
      if (d.length === 0)
        throw new Error(
          \`企业账号池暂无可用账号（共 \${r.length} 个，全部在班次休息、冷却或本班次已满）\`
        );`,
    `      const l = this.mergeEnterprisePolicy(c, u), p = Date.now(), d = r.filter((v) => {
        const y = v.cooldownUntil ? new Date(v.cooldownUntil).getTime() : 0, b = v.shiftRestUntil ? new Date(v.shiftRestUntil).getTime() : 0, S = l.shiftSize - (v.currentShiftCount ?? 0), x = l.scrapesPerDay == null ? Number.POSITIVE_INFINITY : l.scrapesPerDay - (v.usedToday ?? 0);
        return y <= p && b <= p && S > 0 && x > 0;
      });
      if (d.length === 0)
        throw new Error(
          \`企业账号池暂无可用账号（共 \${r.length} 个，全部在班次休息、冷却、日额度已满或本班次已满）\`
        );`,
    "enterprise account pool daily budget availability",
  );
}

if (!main.includes("scrapesPerDay: s, shiftSize: o, shiftRestMinutes: c")) {
  main = replaceOnce(
    main,
    `  mergeEnterprisePolicy(e, t) {
    const n = Math.max(
      (t == null ? void 0 : t.minIntervalMs) ?? e.minIntervalMs,
      _i
    ), s = (t == null ? void 0 : t.shiftSize) ?? e.shiftSize, i = Math.max(1, Math.floor(s * ((t == null ? void 0 : t.shiftSizeFactor) ?? 1))), o = (t == null ? void 0 : t.shiftRestMinutes) ?? e.shiftRestMinutes, r = Math.max(0, o * ((t == null ? void 0 : t.restFactor) ?? 1));
    return { minIntervalMs: n, shiftSize: i, shiftRestMinutes: r };
  }`,
    `  mergeEnterprisePolicy(e, t) {
    const n = Math.max(
      (t == null ? void 0 : t.minIntervalMs) ?? e.minIntervalMs,
      _i
    ), s = (t == null ? void 0 : t.scrapesPerDay) ?? e.scrapesPerDay, i = (t == null ? void 0 : t.shiftSize) ?? e.shiftSize, o = Math.max(1, Math.floor(i * ((t == null ? void 0 : t.shiftSizeFactor) ?? 1))), r = (t == null ? void 0 : t.shiftRestMinutes) ?? e.shiftRestMinutes, c = Math.max(0, r * ((t == null ? void 0 : t.restFactor) ?? 1));
    return { minIntervalMs: n, scrapesPerDay: s, shiftSize: o, shiftRestMinutes: c };
  }`,
    "enterprise policy merges daily budget",
  );
}

if (!main.includes("this.filterAvailableAccounts(l, u)")) {
  main = replaceOnce(
    main,
    `      const m = this.filterAvailableAccounts(l);
      if (m.length === 0) {`,
    `      const m = this.filterAvailableAccounts(l, u);
      if (m.length === 0) {`,
    "dispatcher passes active policy to account availability filter",
  );
}

if (!main.includes("未达日/班次上限")) {
  main = replaceOnce(
    main,
    `  /** 过滤可用账号（ACTIVE、cooldown/班次休息已过期） */
  filterAvailableAccounts(e) {
    const t = Date.now();
    return e.filter(
      (n) => n.status === "ACTIVE" && (!n.cooldownUntil || new Date(n.cooldownUntil).getTime() <= t) && (!n.shiftRestUntil || new Date(n.shiftRestUntil).getTime() <= t)
    );
  }`,
    `  /** 过滤可用账号（ACTIVE、cooldown/班次休息已过期、未达日/班次上限） */
  filterAvailableAccounts(e, t) {
    const n = Date.now();
    return e.filter(
      (s) => s.status === "ACTIVE" && (!s.cooldownUntil || new Date(s.cooldownUntil).getTime() <= n) && (!s.shiftRestUntil || new Date(s.shiftRestUntil).getTime() <= n) && ((t == null ? void 0 : t.scrapesPerDay) == null || (s.usedToday ?? 0) < t.scrapesPerDay) && ((t == null ? void 0 : t.shiftSize) == null || (s.currentShiftCount ?? 0) < t.shiftSize)
    );
  }`,
    "dispatcher account availability respects daily and shift caps",
  );
}

if (!main.includes('message: "没有可采集的链接"')) {
  main = replaceOnce(
    main,
    `    if (!u) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: \`未知插件: \${n}\`
      });
      return;
    }
    const existingTask = Array.from(this.runningTasks.values()).find((m) => m.pluginId === n && !m.cancelled);`,
    `    if (!u) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: \`未知插件: \${n}\`
      });
      return;
    }
    if (!Array.isArray(i) || i.length === 0) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: "没有可采集的链接",
        errorCategory: "invalid-input",
        errorCategoryLabel: "链接无效"
      });
      return;
    }
    const existingTask = Array.from(this.runningTasks.values()).find((m) => m.pluginId === n && !m.cancelled);`,
    "personal task empty url precheck",
  );
}

if (!main.includes("pace: this.getPersonalTaskPace(e)")) {
  main = replaceOnce(
    main,
    `      paused: !1,
      accountSource: c
    };
    if (this.runningTasks.set(t, l), c === "enterprise") {`,
    `      paused: !1,
      accountSource: c,
      pace: this.getPersonalTaskPace(e)
    };
    if (this.runningTasks.set(t, l), c !== "enterprise") {
      try {
        const m = await this.withTimeout(
          u.checkAuth(),
          Wd,
          \`授权检测超时: \${n}\`
        );
        if (!m.authorized) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: \`\${u.name} 授权不可用，请重新授权后再开始采集\`,
            errorCategory: "auth",
            errorCategoryLabel: "授权不可用"
          });
          return;
        }
      } catch (m) {
        this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "auth",
          errorCategoryLabel: "授权检测失败"
        });
        return;
      } finally {
        this.runningTasks.has(t) && c !== "enterprise" && l.current === 0 && l.successCount === 0 && l.errorCount === 0 && this.runningTasks.delete(t);
      }
      this.runningTasks.set(t, l);
    }
    if (c === "enterprise") {`,
    "personal task auth precheck and pace config",
  );
}

if (!main.includes("errorCategoryLabel: b.label")) {
  main = replaceOnce(
    main,
    `        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });`,
    `        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });`,
    "personal task result failure category",
  );
}

if (!main.includes('errorCategoryLabel: y.label')) {
  main = replaceOnce(
    main,
    `      } catch (v) {
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: "error",
          data: null,
          errorMessage: v instanceof Error ? v.message : String(v),
          errorCode: "UNKNOWN_ERROR"
        });
      }`,
    `      } catch (v) {
        const y = this.classifyFailure("UNKNOWN_ERROR", v instanceof Error ? v.message : String(v));
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: "error",
          data: null,
          errorMessage: v instanceof Error ? v.message : String(v),
          errorCode: "UNKNOWN_ERROR",
          errorCategory: y.code,
          errorCategoryLabel: y.label
        });
      }`,
    "personal task exception failure category",
  );
}

if (!main.includes("checkShumiaoBalanceForTask(e)")) {
  main = replaceOnce(
    main,
    `  async getPacePolicy(e) {
    return (await this.request(
      "GET",
      \`/api/pace-policies/\${encodeURIComponent(e)}\`
    )).data ?? null;
  }
  async checkShumiaoBalanceForTask(e) {
    const t = Array.isArray(e.urls) ? e.urls.length : 0, n = Array.isArray(e.pendingCharges) ? e.pendingCharges.length : 0, s = Math.max(0, t - n);
    if (t <= 0)
      throw new Error("没有可计费的采集链接");
    if (!this.isAuthenticated())
      throw new Error("未登录，无法判定积分余额");
    if (s <= 0)
      return 0;
    const i = await this.request("GET", \`/api/shumiao/check-balance?count=\${encodeURIComponent(String(s))}\`), o = Number(i.data?.balance ?? 0), r = Number(i.data?.required ?? s), c = Number(i.data?.shortage ?? Math.max(0, r - o));
    if (!i.data?.sufficient)
      throw new Error(\`积分余额不足：当前 \${o}，本次待采集需要 \${r}，还差 \${c}\`);
    return o;
  }
  async consumeShumiaoForItem(e, t) {
    if (!this.isAuthenticated())
      throw new Error("未登录，无法扣减积分");
    const n = Array.isArray(e.urls) ? e.urls[t] : null, s = {
      inputType: e.inputType || (String(e.fileName || "").includes("手动输入") ? "manual" : "xlsx"),
      pluginId: e.pluginId,
      taskType: e.taskType,
      fileName: e.fileName,
      totalRows: e.totalRows ?? (Array.isArray(e.urls) ? e.urls.length : 0),
      validCount: Array.isArray(e.urls) ? e.urls.length : 0,
      itemIndex: t + 1,
      url: n
    }, i = await this.request("POST", "/api/shumiao/consume", {
      count: 1,
      remark: \`采集成功扣减 1 积分\`,
      detail: s
    });
    return Number(i.data?.balance ?? 0);
  }
  /**
   * 批量扣减账号配额（usedToday / usedThisHour）。
`,
    "scheduler api checks shumiao before task and consumes per success item",
  );
}

if (!main.includes("consumeShumiaoForItem(e, m")) {
  const balanceCheckBlock = `      this.runningTasks.set(t, l);
      try {
        const m = await Le.get().checkShumiaoBalanceForTask(e);
        ue.info(\`[task=\${t}] 积分余额校验通过 count=\${i.length} balance=\${m}\`);
      } catch (m) {
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "balance",
          errorCategoryLabel: "积分不足"
        });
        return;
      }
    }
    if (c === "enterprise") {`;
  if (main.includes("consumeShumiaoForTask(e)")) {
    main = replaceOnce(
      main,
      `      this.runningTasks.set(t, l);
      try {
        const m = await Le.get().consumeShumiaoForTask(e);
        ue.info(\`[task=\${t}] 积分扣减完成 count=\${i.length} balance=\${m}\`);
      } catch (m) {
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "balance",
          errorCategoryLabel: "积分不足"
        });
        return;
      }
    }
    if (c === "enterprise") {`,
      balanceCheckBlock,
      "replace legacy whole-task shumiao consume with balance check",
    );
  } else {
    main = replaceOnce(
      main,
      `      this.runningTasks.set(t, l);
    }
    if (c === "enterprise") {`,
      balanceCheckBlock,
      "personal task checks shumiao balance before scraping window",
    );
  }

  main = replaceOnce(
    main,
    `        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
`,
    `        let S = !1, C = null;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            C = x;
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
          }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          balanceAfter: C,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
        if (S) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: y.errorMessage || "积分扣减失败，采集已停止",
            errorCategory: "balance",
            errorCategoryLabel: "积分不足"
          });
          break;
        }
`,
    "personal task consumes one shumiao before emitting success result",
  );
}

if (!main.includes("balanceAfter: C")) {
  main = replaceOnce(
    main,
    `        let S = !1;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
          }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });`,
    `        let S = !1, C = null;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            C = x;
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
          }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          balanceAfter: C,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });`,
    "personal task result returns shumiao balance after item consume",
  );
}

if (!main.includes("batchResting: !0")) {
  main = replaceOnce(
    main,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: g
      }), m < i.length - 1 && !l.cancelled && await this.delay(_i);
    }`,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: g
      });
      if (m < i.length - 1 && !l.cancelled) {
        const v = l.pace, y = v.batchSize > 0 && (m + 1) % v.batchSize === 0, b = y ? v.batchRestMs : v.itemDelayMs;
        y && this.sendToRenderer(W.task.progress, {
          taskId: t,
          current: l.current,
          total: l.total,
          percent: g,
          batchResting: !0,
          batchRestMs: b,
          paceMode: v.mode
        });
        b > 0 && await this.delay(b);
      }
    }`,
    "personal task batch pacing",
  );
}

if (!main.includes("classifyFailure(e, t =")) {
  main = replaceOnce(
    main,
    `  sendToRenderer(e, t) {
    const n = this.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(e, t);
  }
  delay(e) {`,
    `  sendToRenderer(e, t) {
    const n = this.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(e, t);
  }
  getPersonalTaskPace(e) {
    const t = {
      stable: { itemDelayMs: 5e3, batchSize: 20, batchRestMs: 12e4 },
      balanced: { itemDelayMs: 2500, batchSize: 50, batchRestMs: 6e4 },
      fast: { itemDelayMs: 800, batchSize: 100, batchRestMs: 15e3 }
    }, n = typeof e.paceMode == "string" && t[e.paceMode] ? e.paceMode : "balanced", s = t[n], i = Number(e.batchSize), o = Number(e.batchRestMs), r = Number(e.itemDelayMs);
    return {
      mode: n,
      itemDelayMs: Number.isFinite(r) && r >= 0 ? Math.max(0, Math.floor(r)) : s.itemDelayMs,
      batchSize: Number.isFinite(i) && i > 0 ? Math.max(1, Math.floor(i)) : s.batchSize,
      batchRestMs: Number.isFinite(o) && o >= 0 ? Math.max(0, Math.floor(o)) : s.batchRestMs
    };
  }
  classifyFailure(e, t = "", n = null) {
    const s = String(e || "").toUpperCase(), i = \`\${s} \${String(t || "")} \${JSON.stringify(n || {})}\`.toLowerCase();
    if (s.includes("INVALID") || i.includes("链接") && i.includes("无效"))
      return { code: "invalid-input", label: "链接无效" };
    if (s.includes("NOT_FOUND") || i.includes("不存在") || i.includes("未找到"))
      return { code: "not-found", label: "目标不存在" };
    if (s.includes("AUTH") || s.includes("UNAUTHORIZED") || i.includes("401") || i.includes("登录") || i.includes("授权"))
      return { code: "auth", label: "授权失效" };
    if (s.includes("CAPTCHA") || i.includes("验证码") || i.includes("verify") || i.includes("安全验证"))
      return { code: "captcha", label: "验证码/安全验证" };
    if (s.includes("TIMEOUT") || i.includes("timeout") || i.includes("超时"))
      return { code: "timeout", label: "网络或平台超时" };
    if (s.includes("RISK") || i.includes("风控") || i.includes("risk") || i.includes("461") || i.includes("2155") || i.includes("2154"))
      return { code: "risk", label: "平台风控" };
    if (s.includes("UNSUPPORTED"))
      return { code: "unsupported", label: "暂不支持" };
    return { code: "unknown", label: "未知错误" };
  }
  delay(e) {`,
    "personal task pacing helpers",
  );
}

main = replaceOnce(
  main,
  'const oo = Y("WindowState"), La = Oe(ye.getPath("userData"), "main-window-state.json"), Ur = 500, tn = 1024, nn = 768;',
  'const oo = Y("WindowState"), La = Oe(ye.getPath("userData"), "main-window-state.json"), Ur = 500, tn = 900, nn = 600;',
  "window minimum size",
);

if (!main.includes("a.width - 160")) {
  main = replaceOnce(
    main,
    `function Fr() {
  const { workAreaSize: a } = Gi.getPrimaryDisplay(), e = a.width, t = a.height, n = [
    { minW: 3e3, minH: 1700, width: 2200, height: 1400 },
    { minW: 2200, minH: 1300, width: 1760, height: 1100 },
    { minW: 1700, minH: 1e3, width: 1440, height: 900 },
    { minW: 1366, minH: 860, width: 1280, height: 820 }
  ];
  for (const s of n)
    if (e >= s.minW && t >= s.minH)
      return { width: s.width, height: s.height };
  return {
    width: Math.max(tn, e - 80),
    height: Math.max(nn, t - 80)
  };
}`,
    `function Fr() {
  const { workAreaSize: a } = Gi.getPrimaryDisplay(), e = Math.max(tn, Math.min(1280, a.width - 160)), t = Math.max(nn, Math.min(820, a.height - 140));
  return { width: e, height: t };
}`,
    "default window size",
  );
}

if (!main.includes("Number(e.width)")) {
  main = replaceOnce(
    main,
    `function jr(a) {
  let e;
  try {
    e = JSON.parse(a);
  } catch {
    return null;
  }
  if (!Br(e)) return null;
  const t = e.width, n = e.height;
  if (typeof t != "number" || typeof n != "number" || t < tn || n < nn) return null;
  const s = { width: t, height: n };
  return typeof e.x == "number" && typeof e.y == "number" && (s.x = e.x, s.y = e.y), s;
}`,
    `function jr(a) {
  let e;
  try {
    e = JSON.parse(a);
  } catch {
    return null;
  }
  if (!Br(e)) return null;
  const t = Number(e.width), n = Number(e.height);
  if (!Number.isFinite(t) || !Number.isFinite(n) || t < tn || n < nn) return null;
  const s = Gi.getPrimaryDisplay().workArea, i = Math.max(tn, Math.min(t, Math.max(tn, s.width - 120))), o = Math.max(nn, Math.min(n, Math.max(nn, s.height - 120))), r = { width: i, height: o };
  return typeof e.x == "number" && typeof e.y == "number" && (r.x = Math.max(s.x, Math.min(e.x, s.x + s.width - i)), r.y = Math.max(s.y, Math.min(e.y, s.y + s.height - o))), r;
}`,
    "restore window state clamp",
  );
}

if (!main.includes("s.__pgyLastLoginState")) {
  main = replaceOnce(
    main,
    's.setResizable(!1), s.setMinimumSize(725, 486), s.setSize(725, 486), s.setPosition(Math.round(u - 725 / 2), Math.round(l - 486 / 2));',
    's.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(u - 900 / 2), Math.round(l - 640 / 2));',
    "login window resizable",
  );
}

if (!main.includes("s.__pgyLastLoginState")) {
  main = replaceOnce(
    main,
    `    const [i, o] = s.getPosition(), [r, c] = s.getSize(), u = i + r / 2, l = o + c / 2;
    if (n) {
      const p = ro(), d = p ?? co();
      s.setResizable(!0), s.setMinimumSize(tn, nn), s.setSize(d.width, d.height), p && p.x !== void 0 && p.y !== void 0 ? s.setPosition(p.x, p.y) : s.setPosition(
        Math.round(u - d.width / 2),
        Math.round(l - d.height / 2)
      );
    } else
      s.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(u - 900 / 2), Math.round(l - 640 / 2));
    s.isVisible() || s.show();`,
    `    const i = !!n;
    if (s.isMinimized()) {
      s.__pgyLastLoginState = i;
      return;
    }
    const o = s.__pgyLastLoginState === i, [r, c] = s.getPosition(), [u, l] = s.getSize(), p = r + u / 2, d = c + l / 2;
    if (o && s.isVisible()) return;
    if (s.__pgyLastLoginState = i, i) {
      const h = ro(), m = h ?? co();
      s.setResizable(!0), s.setMinimumSize(tn, nn), s.setSize(m.width, m.height), h && h.x !== void 0 && h.y !== void 0 ? s.setPosition(h.x, h.y) : s.setPosition(
        Math.round(p - m.width / 2),
        Math.round(d - m.height / 2)
      );
    } else
      s.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(p - 900 / 2), Math.round(d - 640 / 2));
    s.isMinimized() || s.isVisible() || s.show();`,
    "login-state geometry only once",
  );
}

main = insertAfterOnce(
  main,
  'import $r from "tty";',
`const pgyUserDataDir = Oe(ye.getPath("appData"), "magiorix-desktop");
try {
  ye.setName("magiorix"), ye.setPath("userData", pgyUserDataDir);
} catch {
}`,
  "const pgyUserDataDir =",
  "userData override",
);

main = insertAfterOnce(
  main,
  `function mn(a, e, t) {
  return \`[\${pgyBeijingTimestamp()}] [\${a.toUpperCase()}] [\${e}] \${t}\`;
}`,
  `function pgyBeijingIsoDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function pgyBeijingTimestamp() {
  const a = new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString();
  return \`\${a.slice(0, 10)} \${a.slice(11, 19)} +08:00\`;
}
function pgyFormatLogExtra(a) {
  return a.map((e) => {
    if (e instanceof Error)
      return e.stack || e.message;
    if (typeof e == "string")
      return e;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }).join(" ");
}
function pgyMainLogFilePath() {
  const a = Oe(ye.getPath("userData"), "logs");
  Sr(a, { recursive: !0 });
return Oe(a, \`magiorix-main-\${pgyBeijingIsoDate()}.log\`);
}
function pgyWriteMainLog(a, e = []) {
  const t = e.length ? \`\${a} \${pgyFormatLogExtra(e)}\` : a;
  if (!ye.isPackaged) {
    console.log(t);
    return;
  }
  try {
    Kt.appendFileSync(pgyMainLogFilePath(), \`\${t}\\n\`, "utf8");
  } catch {
  }
}`,
  "function pgyWriteMainLog",
  "main file logger",
);

main = replaceOnce(
  main,
  'ye.isPackaged || console.debug(mn("debug", a, e), ...t);',
  'ye.isPackaged || pgyWriteMainLog(mn("debug", a, e), t);',
  "debug logger",
);
main = replaceOnce(main, 'console.log(mn("info", a, e), ...t);', 'pgyWriteMainLog(mn("info", a, e), t);', "info logger");
main = replaceOnce(main, 'console.warn(mn("warn", a, e), ...t);', 'pgyWriteMainLog(mn("warn", a, e), t);', "warn logger");
main = replaceOnce(main, 'console.error(mn("error", a, e), ...t);', 'pgyWriteMainLog(mn("error", a, e), t);', "error logger");

if (!main.includes("minimizable: !0")) {
  main = replaceOnce(
    main,
    `minHeight: nn,
    show: !1,`,
    `minHeight: nn,
    resizable: !0,
    minimizable: !0,
    maximizable: !0,
    fullscreenable: !1,
    show: !1,`,
    "browser window chrome options",
  );
}

if (!main.includes("movable: !0")) {
  main = replaceOnce(
    main,
    `fullscreenable: !1,
    show: !1,`,
    `fullscreenable: !1,
    movable: !0,
    show: !1,`,
    "main window movable",
  );
}

main = replaceOnce(
  main,
  'return a.push("D:\\\\download\\\\pic-vec\\\\pgydata\\\\pgy-cookie.txt", "D:\\\\download\\\\pic-vec\\\\pgydata\\\\token.txt", "D:\\\\download\\\\token.txt", Oe(Dr.homedir(), "pgy-cookie.txt"), Oe(Dr.homedir(), "token.txt")), a;',
  "return a;",
  "remove development cookie fallback",
);

main = replaceOnce(
  main,
  'return a.push(Oe(Dr.homedir(), "pgy-cookie.txt"), Oe(Dr.homedir(), "token.txt")), a;',
  "return a;",
  "remove home cookie fallback",
);

main = insertAfterOnce(
  main,
  `    this.windowManager = e;
  }`,
  `  async clearAuthSession(e) {
    const t = e ? Pn.fromPartition(e) : Pn.defaultSession, n = Re;
    Ct.info("[startAuth] 清理本地蒲公英授权会话后重新授权");
    try {
      await t.clearStorageData({ origin: n, storages: ["cookies", "localstorage", "indexdb", "filesystem", "serviceworkers", "cachestorage"] });
    } catch (s) {
      Ct.warn("[startAuth] 清理授权存储失败:", s);
    }
    try {
      const s = await t.cookies.get({ url: n });
      await Promise.all(s.map((i) => t.cookies.remove(n, i.name).catch((o) => Ct.warn(\`[startAuth] 清理 Cookie 失败: \${i.name}\`, o))));
    } catch (s) {
      Ct.warn("[startAuth] 清理授权 Cookie 失败:", s);
    }
  }`,
  "clearAuthSession(e)",
  "pgy auth session reset",
);

main = replaceOnce(
  main,
  'return this.pendingLogin = this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition).finally(() => {',
  'return this.pendingLogin = (async () => (await this.clearAuthSession(e == null ? void 0 : e.sessionPartition), this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition)))().finally(() => {',
  "pgy reauth clears existing session",
);

const xhsDirectHost = `https://${"www"}.xiaohongshu.com`;
const xhsDirectCookie = `__xhs_${"direct"}_auth`;
const xhsDirectLogger = `Xhs${"Direct"}Auth`;
const xhsDirectStart = `const Fn = "${xhsDirectHost}", af = (a) => \`\${Fn}/user/profile/\${a}\`, ki = "${xhsDirectCookie}", ie = Y("${xhsDirectLogger}"), sf = 3e3, Ti = 8e3;`;
const xhsDirectEnd = 'const $i = Y("ExcelExport"), dr = {';
const xhsDirectStartIndex = main.indexOf(xhsDirectStart);
if (xhsDirectStartIndex !== -1) {
  const xhsDirectEndIndex = main.indexOf(xhsDirectEnd, xhsDirectStartIndex);
  if (xhsDirectEndIndex === -1) throw new Error("Missing XHS direct removal end marker");
  main = main.slice(0, xhsDirectStartIndex) + main.slice(xhsDirectEndIndex);
}

main = main.replace("ge.registerPlugin(new df()), ", "");

if (!main.includes("F.removeAllListeners(Lt.ready)")) {
  main = replaceOnce(
    main,
    `function Qr(a) {
  F.on(Lt.ready, () => {
    Rs.info("启动页已准备就绪");
  }), F.on(Lt.retry, () => {
    Rs.info("用户请求重试"), a();
  });
}`,
    `function Qr(a) {
  F.removeAllListeners(Lt.ready), F.removeAllListeners(Lt.retry), F.on(Lt.ready, () => {
    Rs.info("启动页已准备就绪");
  }), F.on(Lt.retry, () => {
    Rs.info("用户请求重试"), a();
  });
}`,
    "splash retry handler",
  );
}

main = insertAfterOnce(
  main,
  'K.debug(`初始化 — API: ${po}, 资源目录: ${$n}`);',
  `function pgyAssetErrorMessage(a) {
  return a instanceof Error ? a.message : String(a || "未知错误");
}
function pgyNormalizeAssetPath(a) {
  return String(a || "").replace(/\\\\/g, "/").replace(/^\\/+/, "");
}
function pgyHashFile(a) {
  return no.createHash("sha256").update(Qi(a)).digest("hex");
}
function pgyVerifyAssets(a) {
  const e = Oe(a, "integrity-manifest.json");
  if (!kt(e))
    throw new Error("资源被修改或损坏：缺少完整性校验文件 integrity-manifest.json");
  let t;
  try {
    t = JSON.parse(Qi(e, "utf-8"));
  } catch (n) {
    throw new Error(\`资源被修改或损坏：完整性校验文件无法读取（\${pgyAssetErrorMessage(n)}）\`);
  }
  const n = Array.isArray(t.files) ? t.files : [];
  if (n.length === 0)
    throw new Error("资源被修改或损坏：完整性校验文件为空");
  for (const s of n) {
    const i = pgyNormalizeAssetPath(s.path);
    if (!i || i.split("/").includes(".."))
      throw new Error(\`资源被修改或损坏：非法文件路径 \${i || "(空)"}\`);
    const o = Oe(a, ...i.split("/"));
    if (!kt(o))
      throw new Error(\`资源被修改或损坏：缺少文件 \${i}\`);
    const r = Kt.statSync(o);
    if (!r.isFile())
      throw new Error(\`资源被修改或损坏：\${i} 不是文件\`);
    if (Number(s.size) !== r.size)
      throw new Error(\`资源被修改或损坏：\${i} 文件大小不匹配\`);
    const c = String(s.sha256 || "").toLowerCase().replace(/^sha256:/, "");
    if (!c || pgyHashFile(o) !== c)
      throw new Error(\`资源被修改或损坏：\${i} 校验失败\`);
  }
  return !0;
}`,
  "function pgyVerifyAssets",
  "asset integrity helpers",
);

if (!main.includes("Z.loadFile(t).catch")) {
  main = replaceOnce(
    main,
    'Ee.info("加载前端资源:", t), Z.loadFile(t);',
    `Ee.info("加载前端资源:", t), Z.loadFile(t).catch((n) => {
      Ee.error("加载前端资源失败:", n), Xr(\`加载前端资源失败：\${pgyAssetErrorMessage(n)}\`);
    });`,
    "loadFile handling",
  );
}

if (!main.includes('Xr(`加载前端资源失败：${n} ${s} ${i || ""}`)')) {
  main = replaceOnce(
    main,
    'Ee.error(`页面加载失败: ${n} ${s} URL: ${i}`), Rn(), Z && !Z.isDestroyed() && !Z.isVisible() && Z.show();',
    'Ee.error(`页面加载失败: ${n} ${s} URL: ${i}`), Xr(`加载前端资源失败：${n} ${s} ${i || ""}`);',
    "did-fail-load handling",
  );
}

if (!main.includes("!Z.isMinimized() && (Ee.warn(\"主窗口 10 秒内未显示")) {
  main = replaceOnce(
    main,
    'Z && !Z.isDestroyed() && !Z.isVisible() && (Ee.warn("主窗口 10 秒内未显示，强制显示（渲染进程可能未调用 setLoginState）"), Z.show(), Rn());',
    'Z && !Z.isDestroyed() && !Z.isVisible() && !Z.isMinimized() && (Ee.warn("主窗口 10 秒内未显示，强制显示（渲染进程可能未调用 setLoginState）"), Z.show(), Rn());',
    "do not reshow minimized main window",
  );
}

if (!main.includes('throw new Error("资源解压失败：缺少 index.html")')) {
  main = replaceOnce(
    main,
    'kt(n) || Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));',
    `kt(n) && Kt.rmSync(n, { recursive: !0, force: !0 }), Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));
    if (!kt(Oe(n, "index.html")))
      throw new Error("资源解压失败：缺少 index.html");
    if (!kt(Oe(n, "integrity-manifest.json")))
      throw new Error("资源解压失败：缺少 integrity-manifest.json");
    pgyVerifyAssets(n);`,
    "applyAssets verification",
  );
}

if (!main.includes('pgyVerifyAssets(Ae.getCurrentAssetsPath())')) {
  main = replaceOnce(
    main,
    'jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("更新完成"), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());',
    'jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("正在校验资源完整性..."), zt(95), pgyVerifyAssets(Ae.getCurrentAssetsPath()), jt("正在加载前端资源..."), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());',
    "download startup verification",
  );
}

if (!main.includes("ee || await Jr()")) {
  main = replaceOnce(
    main,
    `async function Vi() {
  if (Ee.debug("startApp 执行"), Xt) {
    Ga(Oe(yr, "../dist"));
    return;
  }
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html"));
  Ee.info(\`资源检查 — assetsPath: \${a}, hasLocalAssets: \${e}\`), e ? (Ee.info("本地资源已存在，立即启动，路径:", a), Ga(a), mh()) : (Ee.info("无本地资源，显示启动页下载"), await Jr(), Kr(), Qr(() => {
    Wi();
  }), await Wi());
}`,
    `async function Vi() {
  if (Ee.debug("startApp 执行"), Xt) {
    Ga(Oe(yr, "../dist"));
    return;
  }
  ee || await Jr(), Kr(), Qr(() => {
    Vi();
  }), jt("正在检查本地资源..."), zt(10);
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html"));
  Ee.info(\`资源检查 — assetsPath: \${a}, hasLocalAssets: \${e}\`);
  if (e)
    try {
      jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a), mh();
    } catch (t) {
      const n = pgyAssetErrorMessage(t);
      Ee.error("本地资源校验失败:", t), Xr(n.includes("资源被修改或损坏") ? n : \`资源被修改或损坏：\${n}\`);
    }
  else
    Ee.info("无本地资源，显示启动页下载"), jt("未找到本地资源，准备下载..."), zt(20), await Wi();
}`,
    "startup flow",
  );
}

const pgyChartRootLegacy = `function pgyChartRoot() {
  const a = "D:\\\\download\\\\pic-vec\\\\pgydata\\\\pic";
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
const pgyChartRootExe = `function pgyChartRoot() {
  const a = Oe(ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
const pgyChartRootInstall = `function pgyChartRoot() {
  const a = Oe(Ja(ye.getPath("exe")), "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
if (main.includes(pgyChartRootLegacy))
  main = main.replace(pgyChartRootLegacy, pgyChartRootInstall);
else if (main.includes(pgyChartRootExe))
  main = main.replace(pgyChartRootExe, pgyChartRootInstall);
else if (main.includes(`function pgyChartRoot() {
  const a = Oe(process.resourcesPath || ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`))
  main = main.replace(`function pgyChartRoot() {
  const a = Oe(process.resourcesPath || ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`, pgyChartRootInstall);
else if (!main.includes(pgyChartRootInstall) && !main.includes('const a = Oe(Ja(ye.getPath("exe")), "pic");'))
  throw new Error("Missing patch target: pgy chart output under install path");

if (!main.includes('dailyNotePerformance: "dailyNotePerformanceChart"')) {
  main = replaceOnce(
    main,
    `  fansGrowthTrendChart: ["fansGrowthTrendChart"]
}, mm = {`,
    `  fansGrowthTrendChart: ["fansGrowthTrendChart"],
  dailyNotePerformanceChart: ["dailyNotePerformanceChart"]
}, mm = {`,
    "pgy daily note chart field dependency",
  );

  main = replaceOnce(
    main,
    `    "shareMedian",
    "interactRate"
  ],`,
    `    "shareMedian",
    "interactRate",
    "dailyNotePerformanceChart"
  ],`,
    "pgy daily note chart daily30 endpoint dependency",
  );

  main = replaceOnce(
    main,
    `  gender: "fansGenderChart",
  trend: "fansGrowthTrendChart"
};`,
    `  gender: "fansGenderChart",
  trend: "fansGrowthTrendChart",
  dailyNotePerformance: "dailyNotePerformanceChart"
};`,
    "pgy daily note chart image field",
  );

  main = replaceOnce(
    main,
    `def save_trend(chart):`,
    `def format_integer(value):
    if value is None or value == "":
        return "-"
    try:
        number = float(value)
        if not math.isfinite(number):
            return "-"
        return f"{int(round(number)):,}"
    except Exception:
        return "-"

def daily_note_categories(rows):
    categories = []
    for row in rows or []:
        name = str(row.get("contentTag") or "").strip()
        if not name:
            continue
        raw_percent = row.get("percent")
        try:
            percent = float(raw_percent)
            if not math.isfinite(percent):
                raise ValueError("invalid percent")
            label = f"{name}（占比{percent:.1f}%）"
            sort_value = percent
        except Exception:
            label = f"{name}（占比-）"
            sort_value = -1
        categories.append((sort_value, label))
    categories.sort(key=lambda item: item[0], reverse=True)
    visible = [item[1] for item in categories[:3]]
    if len(categories) > 3:
        visible.append(f"另有 {len(categories) - 3} 类")
    return "｜".join(visible) if visible else "-"

def daily_note_text_width(value):
    return sum(14 if ord(char) > 127 else 7 for char in str(value or ""))

def daily_note_ellipsize(value, max_width=535):
    value = str(value or "")
    if daily_note_text_width(value) <= max_width:
        return value
    suffix = "..."
    while value and daily_note_text_width(value + suffix) > max_width:
        value = value[:-1]
    return (value + suffix) if value else suffix

def save_daily_note_performance(chart):
    data = chart.get("data") or {}
    note_number = data.get("noteNumber")
    note_value = format_integer(note_number)
    note_text = f"{note_value}篇" if note_value != "-" else "-"
    try:
        has_notes = float(note_number) > 0
    except Exception:
        has_notes = False
    exposure_text = format_integer(data.get("impMedian")) if has_notes else "-"
    read_text = format_integer(data.get("readMedian")) if has_notes else "-"
    category_text = daily_note_categories(data.get("noteType"))

    width, height = 808, 378
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    ui_font = load_font(14)
    ui_bold_font = load_font(14, True)
    section_font = load_font(16)
    metric_font = load_font(20, True)
    info_font = load_font(9)

    def web_box(box, radius, fill, outline=None, line_width=1):
        if hasattr(draw, "rounded_rectangle"):
            draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=line_width)
        else:
            draw.rectangle(box, fill=fill, outline=outline, width=line_width)

    # Recreate the PGY web hierarchy from structured data instead of taking a browser screenshot.
    web_box((16, 10, 20, 28), 2, "#ff2442")
    draw.text((28, 8), "数据表现", font=section_font, fill="#262626")

    web_box((16, 50, 96, 82), 5, "#fff1f2")
    draw.text((29, 58), "日常笔记", font=ui_font, fill="#ff2442")
    web_box((108, 50, 188, 82), 5, "#f7f7f7")
    draw.text((121, 58), "合作笔记", font=ui_font, fill="#3d3d3d")

    filters = [
        ((379, 50, 517, 83), "图文+视频"),
        ((529, 50, 636, 83), "近30日"),
        ((648, 50, 795, 83), "仅自然流量"),
    ]
    for box, label in filters:
        web_box(box, 5, "#f7f7f7")
        draw.text((box[0] + 12, box[1] + 8), label, font=ui_font, fill="#262626")
        arrow_x = box[2] - 17
        arrow_y = box[1] + 16
        draw.line((arrow_x - 3, arrow_y - 2, arrow_x, arrow_y + 1), fill="#888888", width=1)
        draw.line((arrow_x, arrow_y + 1, arrow_x + 3, arrow_y - 2), fill="#888888", width=1)
    draw.ellipse((735, 61, 745, 71), outline="#b7b7b7", width=1)
    draw.text((738, 59), "i", font=info_font, fill="#999999")

    web_box((16, 103, 795, 148), 8, "#f7f7f7")
    summary_y = 118
    draw.text((28, summary_y), "发布笔记", font=ui_font, fill="#8c8c8c")
    draw.line((28, 136, 82, 136), fill="#b8b8b8", width=1)
    draw.text((88, summary_y), note_text, font=ui_bold_font, fill="#262626")
    draw.line((121, 115, 121, 137), fill="#e6e6e6", width=1)
    draw.text((136, summary_y), "内容类目及占比", font=ui_font, fill="#8c8c8c")
    draw.line((136, 136, 234, 136), fill="#b8b8b8", width=1)
    category_summary = daily_note_ellipsize(category_text)
    draw.text((242, summary_y), category_summary, font=ui_font, fill="#262626")

    web_box((16, 165, 795, 375), 8, "white", outline="#eeeeee")
    draw.text((32, 188), "核心指标", font=section_font, fill="#262626")
    web_box((33, 227, 148, 259), 5, "#f5f5f5")
    web_box((36, 230, 91, 256), 4, "white", outline="#eeeeee")
    draw.text((46, 236), "按规模", font=ui_font, fill="#262626")
    draw.text((104, 236), "按成本", font=ui_font, fill="#8c8c8c")

    metric_cards = [
        ((33, 275, 397, 351), "曝光中位数", exposure_text, True),
        ((413, 275, 778, 351), "阅读中位数", read_text, False),
    ]
    for box, label, value, selected in metric_cards:
        web_box(
            box,
            5,
            "#fff8f8" if selected else "white",
            outline="#ff2442" if selected else "#e6e6e6",
        )
        label_x = box[0] + 16
        draw.text((label_x, box[1] + 14), label, font=ui_font, fill="#595959")
        draw.line((label_x, box[1] + 36, label_x + 68, box[1] + 36), fill="#9e9e9e", width=1)
        draw.text((label_x, box[1] + 42), value, font=metric_font, fill="#262626")

    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True

def save_trend(chart):`,
    "pgy daily note Python summary chart renderer",
  );

  main = replaceOnce(
    main,
    `            elif chart_type == "trend":
                ok = save_trend(chart)`,
    `            elif chart_type == "trend":
                ok = save_trend(chart)
            elif chart_type == "daily-note-performance":
                ok = save_daily_note_performance(chart)`,
    "pgy daily note Python renderer route",
  );

  main = replaceOnce(
    main,
    `async function buildPgyBloggerChartFields(a, e, t, n) {`,
    `function pgyDailyNoteFormatInteger(a) {
  if (a == null || a === "") return "-";
  const e = Number(a);
  return Number.isFinite(e) ? Math.round(e).toLocaleString("en-US") : "-";
}
function pgyDailyNoteCategories(a) {
  const e = Array.isArray(a) ? a.map((t) => {
    const n = String(t == null ? void 0 : t.contentTag ?? "").trim(), s = t == null ? void 0 : t.percent, i = s != null && String(s).trim() !== "" && Number.isFinite(Number(s));
    return n ? { name: n, percent: i ? Number(s) : -1 } : null;
  }).filter(Boolean).sort((t, n) => n.percent - t.percent) : [], t = e.slice(0, 3).map((n) => n.percent >= 0 ? n.name + "（占比" + n.percent.toFixed(1) + "%）" : n.name + "（占比-）");
  return e.length > 3 && t.push("另有 " + (e.length - 3) + " 类"), t.join("｜") || "-";
}
function pgyDailyNoteTextWidth(a) {
  return Array.from(String(a ?? "")).reduce((e, t) => e + (t.charCodeAt(0) > 127 ? 14 : 7), 0);
}
function pgyDailyNoteEllipsize(a, e = 535) {
  let t = String(a ?? "");
  if (pgyDailyNoteTextWidth(t) <= e) return t;
  for (; t && pgyDailyNoteTextWidth(t + "...") > e; ) t = t.slice(0, -1);
  return t ? t + "..." : "...";
}
function pgyDailyNotePerformanceSvg(a) {
  const e = a ?? {}, t = pgyDailyNoteFormatInteger(e.noteNumber), n = t === "-" ? "-" : t + "篇", s = Number(e.noteNumber) > 0, i = s ? pgyDailyNoteFormatInteger(e.impMedian) : "-", o = s ? pgyDailyNoteFormatInteger(e.readMedian) : "-", r = pgyDailyNoteCategories(e.noteType), c = pgyDailyNoteEllipsize(r);
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="808" height="378" viewBox="0 0 808 378"><rect width="100%" height="100%" fill="white"/><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,Arial,sans-serif"><rect x="16" y="10" width="4" height="18" rx="2" fill="#ff2442"/><text x="28" y="24" font-size="16" fill="#262626">数据表现</text><rect x="16" y="50" width="80" height="32" rx="5" fill="#fff1f2"/><text x="29" y="72" font-size="14" fill="#ff2442">日常笔记</text><rect x="108" y="50" width="80" height="32" rx="5" fill="#f7f7f7"/><text x="121" y="72" font-size="14" fill="#3d3d3d">合作笔记</text><rect x="379" y="50" width="138" height="33" rx="5" fill="#f7f7f7"/><text x="391" y="72" font-size="14" fill="#262626">图文+视频</text><path d="M497 64l3 3 3-3" fill="none" stroke="#888"/><rect x="529" y="50" width="107" height="33" rx="5" fill="#f7f7f7"/><text x="541" y="72" font-size="14" fill="#262626">近30日</text><path d="M616 64l3 3 3-3" fill="none" stroke="#888"/><rect x="648" y="50" width="147" height="33" rx="5" fill="#f7f7f7"/><text x="660" y="72" font-size="14" fill="#262626">仅自然流量</text><circle cx="740" cy="66" r="5" fill="none" stroke="#b7b7b7"/><text x="738.5" y="69" font-size="8" fill="#999">i</text><path d="M775 64l3 3 3-3" fill="none" stroke="#888"/><rect x="16" y="103" width="779" height="45" rx="8" fill="#f7f7f7"/><text x="28" y="132" font-size="14" fill="#8c8c8c">发布笔记</text><line x1="28" y1="136" x2="82" y2="136" stroke="#b8b8b8" stroke-dasharray="2 2"/><text x="88" y="132" font-size="14" font-weight="600" fill="#262626">\${pgyChartEscape(n)}</text><line x1="121" y1="115" x2="121" y2="137" stroke="#e6e6e6"/><text x="136" y="132" font-size="14" fill="#8c8c8c">内容类目及占比</text><line x1="136" y1="136" x2="234" y2="136" stroke="#b8b8b8" stroke-dasharray="2 2"/><text x="242" y="132" font-size="14" fill="#262626">\${pgyChartEscape(c)}</text><rect x="16" y="165" width="779" height="210" rx="8" fill="white" stroke="#eee"/><text x="32" y="204" font-size="16" fill="#262626">核心指标</text><rect x="33" y="227" width="115" height="32" rx="5" fill="#f5f5f5"/><rect x="36" y="230" width="55" height="26" rx="4" fill="white" stroke="#eee"/><text x="46" y="250" font-size="14" fill="#262626">按规模</text><text x="104" y="250" font-size="14" fill="#8c8c8c">按成本</text><rect x="33" y="275" width="364" height="76" rx="5" fill="#fff8f8" stroke="#ff2442"/><text x="49" y="303" font-size="14" fill="#595959">曝光中位数</text><line x1="49" y1="311" x2="117" y2="311" stroke="#9e9e9e" stroke-dasharray="2 2"/><text x="49" y="339" font-size="20" font-weight="700" fill="#262626">\${pgyChartEscape(i)}</text><rect x="413" y="275" width="365" height="76" rx="5" fill="white" stroke="#e6e6e6"/><text x="429" y="303" font-size="14" fill="#595959">阅读中位数</text><line x1="429" y1="311" x2="497" y2="311" stroke="#9e9e9e" stroke-dasharray="2 2"/><text x="429" y="339" font-size="20" font-weight="700" fill="#262626">\${pgyChartEscape(o)}</text></g></svg>\`;
}
async function buildPgyBloggerChartFields(a, e, t, n, d) {`,
    "pgy daily note JS summary chart fallback",
  );

  main = replaceOnce(
    main,
    `  if (!i.length) return s;`,
    `  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePerformance) && i.push({ field: "dailyNotePerformanceChart", type: "daily-note-performance", data: d ?? {}, output: pgyChartFile("daily-note", a, "daily-note-performance") });
  if (!i.length) return s;`,
    "pgy daily note chart generation queue",
  );

  main = replaceOnce(
    main,
    `      o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "trend" && (r = pgyWriteTrendChartPng(o.rows ?? [], o.output)), r && (s[o.field] = r);`,
    `      o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "trend" ? r = pgyWriteTrendChartPng(o.rows ?? [], o.output) : o.type === "daily-note-performance" && (r = pgyWriteSvgPng(pgyDailyNotePerformanceSvg(o.data ?? {}), o.output)), r && (s[o.field] = r);`,
    "pgy daily note JS fallback route",
  );

  main = replaceOnce(
    main,
    "张粉丝图表",
    "张图表",
    "pgy chart generic success log",
  );
  main = replaceOnce(
    main,
    "未生成任何粉丝图表",
    "未生成任何图表",
    "pgy chart generic empty log",
  );

  main = replaceOnce(
    main,
    `Q = await buildPgyBloggerChartFields(e, p, (((t.fansTrend == null ? void 0 : t.fansTrend.data) ?? {}).list) ?? [], I);`,
    `Q = await buildPgyBloggerChartFields(e, p, (((t.fansTrend == null ? void 0 : t.fansTrend.data) ?? {}).list) ?? [], I, o);`,
    "pgy daily note chart data input",
  );
}

if (!main.includes('bloggerOverview: "bloggerOverviewChart"')) {
  main = replaceOnce(
    main,
    `  dailyNotePerformanceChart: ["dailyNotePerformanceChart"]
}, mm = {`,
    `  dailyNotePerformanceChart: ["dailyNotePerformanceChart"],
  bloggerOverviewChart: ["bloggerOverviewChart"]
}, mm = {`,
    "pgy blogger overview chart field dependency",
  );

  main = replaceOnce(
    main,
    `    "tags",
    "priceJson"
  ],
  effective: [`,
    `    "tags",
    "priceJson",
    "bloggerOverviewChart"
  ],
  effective: [`,
    "pgy blogger overview profile endpoint dependency",
  );

  main = replaceOnce(
    main,
    `    "estimateVideoCpuv",
    "priceJson"
  ],
  daily30: [`,
    `    "estimateVideoCpuv",
    "priceJson",
    "bloggerOverviewChart"
  ],
  daily30: [`,
    "pgy blogger overview effective endpoint dependency",
  );

  main = replaceOnce(
    main,
    `    "interactRate",
    "dailyNotePerformanceChart"
  ],`,
    `    "interactRate",
    "dailyNotePerformanceChart",
    "bloggerOverviewChart"
  ],`,
    "pgy blogger overview daily30 endpoint dependency",
  );

  main = replaceOnce(
    main,
    `  fansSummary: ["activeFansRate", "fansIncreaseNum", "fansGrowthRate", "engageFansRate"],`,
    `  fansSummary: ["activeFansRate", "fansIncreaseNum", "fansGrowthRate", "engageFansRate", "bloggerOverviewChart"],`,
    "pgy blogger overview fans summary endpoint dependency",
  );

  main = replaceOnce(
    main,
    `  trend: "fansGrowthTrendChart",
  dailyNotePerformance: "dailyNotePerformanceChart"
};`,
    `  trend: "fansGrowthTrendChart",
  dailyNotePerformance: "dailyNotePerformanceChart",
  bloggerOverview: "bloggerOverviewChart"
};`,
    "pgy blogger overview image field",
  );

  main = replaceOnce(
    main,
    `            elif chart_type == "daily-note-performance":
                ok = save_daily_note_performance(chart)`,
    `            elif chart_type == "daily-note-performance":
                ok = save_daily_note_performance(chart)
            elif chart_type == "blogger-overview":
                ok = save_blogger_overview(chart)`,
    "pgy blogger overview Python renderer route",
  );

  main = replaceOnce(
    main,
    `async function buildPgyBloggerChartFields(a, e, t, n, d) {`,
    `${bloggerOverviewSvgSource}
async function buildPgyBloggerChartFields(a, e, t, n, d, B) {`,
    "pgy blogger overview JS fallback helpers",
  );

  main = replaceOnce(
    main,
    `  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePerformance) && i.push({ field: "dailyNotePerformanceChart", type: "daily-note-performance", data: d ?? {}, output: pgyChartFile("daily-note", a, "daily-note-performance") });
  if (!i.length) return s;`,
    `  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePerformance) && i.push({ field: "dailyNotePerformanceChart", type: "daily-note-performance", data: d ?? {}, output: pgyChartFile("daily-note", a, "daily-note-performance") });
  pgyHasSelectedField(n, PYG_CHART_FIELDS.bloggerOverview) && i.push({ field: "bloggerOverviewChart", type: "blogger-overview", data: B ?? {}, output: pgyChartFile("blogger-overview", a, "blogger-overview") });
  if (!i.length) return s;`,
    "pgy blogger overview chart generation queue",
  );

  main = replaceOnce(
    main,
    `o.type === "daily-note-performance" && (r = pgyWriteSvgPng(pgyDailyNotePerformanceSvg(o.data ?? {}), o.output)), r && (s[o.field] = r);`,
    `o.type === "daily-note-performance" ? r = pgyWriteSvgPng(pgyDailyNotePerformanceSvg(o.data ?? {}), o.output) : o.type === "blogger-overview" && (r = pgyWriteSvgPng(pgyBloggerOverviewSvg(o.data ?? {}), o.output)), r && (s[o.field] = r);`,
    "pgy blogger overview JS fallback route",
  );

  main = replaceOnce(
    main,
    `Q = await buildPgyBloggerChartFields(e, p, (((t.fansTrend == null ? void 0 : t.fansTrend.data) ?? {}).list) ?? [], I, o);`,
    `Q = await buildPgyBloggerChartFields(e, p, (((t.fansTrend == null ? void 0 : t.fansTrend.data) ?? {}).list) ?? [], I, o, pgyBuildBloggerOverviewData({ bloggerId: e, profile: s, effective: i, daily30: o, fansSummary: l, avatar: n }));`,
    "pgy blogger overview chart data input",
  );
}

main = replaceOnce(
    main,
    `  daily30: (a) => \`\${Re}/api/solar/kol/data_v3/notes_rate?userId=\${a}&business=0&noteType=3&dateType=1&advertiseSwitch=1\`,
  /** 日常笔记近90天 */`,
    `  daily30: (a) => \`\${Re}/api/solar/kol/data_v3/notes_rate?userId=\${a}&business=0&noteType=3&dateType=1&advertiseSwitch=1\`,
  /** 日常图文笔记近30天 */
  daily30Picture: (a) => \`\${Re}/api/solar/kol/data_v3/notes_rate?userId=\${a}&business=0&noteType=1&dateType=1&advertiseSwitch=1\`,
  /** 日常视频笔记近30天 */
  daily30Video: (a) => \`\${Re}/api/solar/kol/data_v3/notes_rate?userId=\${a}&business=0&noteType=2&dateType=1&advertiseSwitch=1\`,
  /** 日常笔记近90天 */`,
    "pgy typed daily note endpoints",
  );

main = replaceOnce(
    main,
    `  "daily30",
  "daily90",`,
    `  "daily30",
  "daily30Picture",
  "daily30Video",
  "daily90",`,
    "pgy typed daily note endpoint list",
  );

// 基线 bundle（1.2.0 发布）已含 typed 日常图字段依赖，仅更早原始 bundle 才需扩展。
const hasTypedDailyNoteDeps = main.includes(
  'dailyNotePicturePerformanceChart: ["dailyNotePicturePerformanceChart"]',
);
if (!hasTypedDailyNoteDeps) {
  main = replaceOnce(
    main,
    `  dailyNotePerformanceChart: ["dailyNotePerformanceChart"],
  bloggerOverviewChart: ["bloggerOverviewChart"]`,
    `  dailyNotePerformanceChart: ["dailyNotePerformanceChart"],
  dailyNotePicturePerformanceChart: ["dailyNotePicturePerformanceChart"],
  dailyNoteVideoPerformanceChart: ["dailyNoteVideoPerformanceChart"],
  bloggerOverviewChart: ["bloggerOverviewChart"]`,
    "pgy typed daily note field dependencies",
  );
}

// 基线 bundle（1.2.0 发布）已含 typed 日常图请求路由与图表字段，仅更早原始
// bundle 才需要扩展（守卫防止对当前基线抛 Missing patch target）。
if (!main.includes('daily30Picture: ["dailyNotePicturePerformanceChart"]')) {
  main = replaceOnce(
    main,
    `    "dailyNotePerformanceChart",
    "bloggerOverviewChart"
  ],
  daily90: [`,
    `    "dailyNotePerformanceChart",
    "bloggerOverviewChart"
  ],
  daily30Picture: ["dailyNotePicturePerformanceChart"],
  daily30Video: ["dailyNoteVideoPerformanceChart"],
  daily90: [`,
    "pgy typed daily note request routing",
  );
}
const hasTypedDailyNoteImageFields = main.includes(
  'dailyNotePicturePerformance: "dailyNotePicturePerformanceChart"',
);
if (!hasTypedDailyNoteImageFields) {
  main = replaceOnce(
    main,
    `  dailyNotePerformance: "dailyNotePerformanceChart",
  bloggerOverview: "bloggerOverviewChart"`,
    `  dailyNotePerformance: "dailyNotePerformanceChart",
  dailyNotePicturePerformance: "dailyNotePicturePerformanceChart",
  dailyNoteVideoPerformance: "dailyNoteVideoPerformanceChart",
  bloggerOverview: "bloggerOverviewChart"`,
    "pgy typed daily note chart fields",
  );
}

main = replaceOnce(
    main,
    `function pgyDailyNotePerformanceSvg(a) {
  const e = a ?? {}, t = pgyDailyNoteFormatInteger(e.noteNumber), n = t === "-" ? "-" : t + "篇", s = Number(e.noteNumber) > 0, i = s ? pgyDailyNoteFormatInteger(e.impMedian) : "-", o = s ? pgyDailyNoteFormatInteger(e.readMedian) : "-", r = pgyDailyNoteCategories(e.noteType), c = pgyDailyNoteEllipsize(r);`,
    `function pgyDailyNotePerformanceSvg(a) {
  const e = a ?? {}, t = pgyDailyNoteFormatInteger(e.noteNumber), n = t === "-" ? "-" : t + "篇", s = Number(e.noteNumber) > 0, i = s ? pgyDailyNoteFormatInteger(e.impMedian) : "-", o = s ? pgyDailyNoteFormatInteger(e.readMedian) : "-", r = pgyDailyNoteCategories(e.noteType), c = pgyDailyNoteEllipsize(r), l = String(e.pgyNoteTypeLabel ?? "图文+视频");`,
    "pgy typed daily note SVG label data",
  );
main = replaceOnce(
    main,
    `fill="#262626">图文+视频</text><path d="M497 64l3 3 3-3"`,
    `fill="#262626">\${pgyChartEscape(l)}</text><path d="M497 64l3 3 3-3"`,
    "pgy typed daily note SVG label",
  );

main = replaceOnce(
    main,
    `async function buildPgyBloggerChartFields(a, e, t, n, d, B) {`,
    `async function buildPgyBloggerChartFields(a, e, t, n, d, B, P, V) {`,
    "pgy typed daily note chart inputs",
  );
// 基线 bundle（1.2.0 发布）已含 typed 日常图生图队列，仅更早原始 bundle 才需扩展。
if (!main.includes('pgyNoteTypeLabel: "图文"')) {
  main = replaceOnce(
    main,
    `  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePerformance) && i.push({ field: "dailyNotePerformanceChart", type: "daily-note-performance", data: d ?? {}, output: pgyChartFile("daily-note", a, "daily-note-performance") });
  pgyHasSelectedField(n, PYG_CHART_FIELDS.bloggerOverview)`,
    `  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePerformance) && i.push({ field: "dailyNotePerformanceChart", type: "daily-note-performance", data: { ...(d ?? {}), pgyNoteTypeLabel: "图文+视频" }, output: pgyChartFile("daily-note", a, "daily-note-performance") });
  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNotePicturePerformance) && i.push({ field: "dailyNotePicturePerformanceChart", type: "daily-note-performance", data: { ...(P ?? {}), pgyNoteTypeLabel: "图文" }, output: pgyChartFile("daily-note", a, "daily-note-picture-performance") });
  pgyHasSelectedField(n, PYG_CHART_FIELDS.dailyNoteVideoPerformance) && i.push({ field: "dailyNoteVideoPerformanceChart", type: "daily-note-performance", data: { ...(V ?? {}), pgyNoteTypeLabel: "视频" }, output: pgyChartFile("daily-note", a, "daily-note-video-performance") });
  pgyHasSelectedField(n, PYG_CHART_FIELDS.bloggerOverview)`,
    "pgy typed daily note chart queue",
  );
}

main = replaceOnce(
    main,
    `const s = ((O = t.profile) == null ? void 0 : O.data) ?? {}, i = ((le = t.effective) == null ? void 0 : le.data) ?? {}, o = ((de = t.daily30) == null ? void 0 : de.data) ?? {}, r = ((H = t.daily90) == null ? void 0 : H.data) ?? {},`,
    `const s = ((O = t.profile) == null ? void 0 : O.data) ?? {}, i = ((le = t.effective) == null ? void 0 : le.data) ?? {}, o = ((de = t.daily30) == null ? void 0 : de.data) ?? {}, dailyPicture = (t.daily30Picture == null ? void 0 : t.daily30Picture.data) ?? {}, dailyVideo = (t.daily30Video == null ? void 0 : t.daily30Video.data) ?? {}, r = ((H = t.daily90) == null ? void 0 : H.data) ?? {},`,
    "pgy typed daily note response data",
  );
  // 后续 overview 数据源补丁会改写本补丁的产物，已注入 overview 时跳过以保持可重入
  if (!main.includes("overview: ((t.overviewSummary == null")) {
    main = replaceOnce(
      main,
      `I, o, pgyBuildBloggerOverviewData({ bloggerId: e, profile: s, effective: i, daily30: o, fansSummary: l, avatar: n }));`,
      `I, o, pgyBuildBloggerOverviewData({ bloggerId: e, profile: s, effective: i, daily30: o, fansSummary: l, avatar: n }), dailyPicture, dailyVideo);`,
      "pgy typed daily note chart data input",
    );
  }

// 数据概览卡片真实数据源：网页同源 data_summary?business=0 接口（博主优势、发布笔记、内容类目、合作行业、中位数及优于同行、服务表现、更新日期）
main = replaceOnce(
  main,
  `  fansSummary: (a) => \`\${Re}/api/solar/kol/data_v3/fans_summary?userId=\${a}\`,
  /** 粉丝分布 */`,
  `  fansSummary: (a) => \`\${Re}/api/solar/kol/data_v3/fans_summary?userId=\${a}\`,
  /** 数据概览汇总（网页数据概览卡片同源接口） */
  overviewSummary: (a) => \`\${Re}/api/pgy/kol/data/data_summary?userId=\${a}&business=0\`,
  /** 粉丝分布 */`,
  "pgy overview summary endpoint",
);

main = replaceOnce(
  main,
  `  "fansSummary",
  "fansProfile",`,
  `  "fansSummary",
  "overviewSummary",
  "fansProfile",`,
  "pgy overview summary endpoint list",
);

main = replaceOnce(
  main,
  `  fansSummary: ["activeFansRate", "fansIncreaseNum", "fansGrowthRate", "engageFansRate", "bloggerOverviewChart"],
  fansProfile: [`,
  `  fansSummary: ["activeFansRate", "fansIncreaseNum", "fansGrowthRate", "engageFansRate", "bloggerOverviewChart"],
  overviewSummary: ["bloggerOverviewChart"],
  fansProfile: [`,
  "pgy overview summary field dependency",
);

main = replaceOnce(
  main,
  `              if (h[b].key === "fansTrend") {
                j.warn(
                  \`[blogger] 粉丝趋势图接口无数据，跳过趋势图: code=\${S.value.code}, msg=\${S.value.msg ?? ""}, bloggerId=\${p}\`
                ), f[h[b].key] = null;
                continue;
              }`,
  `              if (h[b].key === "fansTrend" || h[b].key === "overviewSummary") {
                j.warn(
                  \`[blogger] 可选接口无数据，跳过: api=\${h[b].key}, code=\${S.value.code}, msg=\${S.value.msg ?? ""}, bloggerId=\${p}\`
                ), f[h[b].key] = null;
                continue;
              }`,
  "pgy overview summary tolerant failure",
);

main = replaceOnce(
  main,
  `I, o, pgyBuildBloggerOverviewData({ bloggerId: e, profile: s, effective: i, daily30: o, fansSummary: l, avatar: n }), dailyPicture, dailyVideo);`,
  `I, o, pgyBuildBloggerOverviewData({ bloggerId: e, profile: s, effective: i, daily30: o, fansSummary: l, overview: ((t.overviewSummary == null ? void 0 : t.overviewSummary.data) ?? {}), avatar: n }), dailyPicture, dailyVideo);`,
  "pgy overview summary chart data input",
);

// 概览图入队前内嵌头像与昵称 emoji（弱网/失败自动降级为原 URL/字体渲染）；保持单行形态以免破坏上游补丁锚点
main = replaceOnce(
  main,
  `pgyHasSelectedField(n, PYG_CHART_FIELDS.bloggerOverview) && i.push({ field: "bloggerOverviewChart", type: "blogger-overview", data: B ?? {}, output: pgyChartFile("blogger-overview", a, "blogger-overview") });`,
  `pgyHasSelectedField(n, PYG_CHART_FIELDS.bloggerOverview) && i.push({ field: "bloggerOverviewChart", type: "blogger-overview", data: await pgyPrepareOverviewData(B), output: pgyChartFile("blogger-overview", a, "blogger-overview") });`,
  "pgy overview inline avatar and emoji",
);

const chartRendererSource = fs.readFileSync(chartRendererSourcePath, "utf8");
if (!main.includes("import urllib.request")) {
  main = replaceOnce(
    main,
    `import json
import math
import os
import sys`,
    `import base64
import io
import json
import math
import os
import sys
import urllib.request`,
    "pgy embedded Python overview renderer imports",
  );
}
main = main
  .replace(
    /import base64\r?\nimport io\r?\n(?:import base64\r?\nimport io\r?\n)+/,
    "import base64\nimport io\n",
  )
  .replace(
    /import urllib\.request\r?\n(?:import urllib\.request\r?\n)+/,
    "import urllib.request\n",
  );
if (!/import os\r?\nimport re\r?\nimport sys/.test(main)) {
  main = replaceOnce(
    main,
    `import os
import sys
import urllib.request`,
    `import os
import re
import sys
import urllib.request`,
    "pgy embedded Python overview renderer re import",
  );
}
if (!main.includes("from PIL import Image, ImageDraw, ImageFont, ImageOps")) {
  main = replaceOnce(
    main,
    "from PIL import Image, ImageDraw, ImageFont",
    "from PIL import Image, ImageDraw, ImageFont, ImageOps",
    "pgy embedded Python overview renderer ImageOps import",
  );
}
const pythonDailyStart = chartRendererSource.indexOf("def format_integer(value):");
const pythonDailyEnd = chartRendererSource.indexOf("def save_trend(chart):", pythonDailyStart);
if (pythonDailyStart < 0 || pythonDailyEnd < 0)
  throw new Error("Missing maintained Python daily note renderer section");
const pythonDailySource = chartRendererSource.slice(pythonDailyStart, pythonDailyEnd).trim();
main = replaceSection(
  main,
  "def format_integer(value):",
  "def save_trend(chart):",
  pythonDailySource,
  "pgy daily note Python renderer synchronization",
);
const dailyNoteSvgStart = main.includes("function pgyDailyNoteTextWidth(a) {")
  ? "function pgyDailyNoteTextWidth(a) {"
  : "function pgyDailyNotePerformanceSvg(a) {";
main = replaceSection(
  main,
  dailyNoteSvgStart,
  "async function buildPgyBloggerChartFields",
  `${dailyNoteSvgSource}\n\n${bloggerOverviewSvgSource}`,
  "pgy chart SVG renderer synchronization",
);
main = replaceSection(
  main,
  "function pgyTrendChartSvg(a) {",
  "function pgyDailyNoteFormatInteger(a) {",
  trendSvgSource,
  "pgy trend SVG renderer synchronization",
);

if (main.includes("    payload = json.load(sys.stdin)")) {
  main = replaceOnce(
    main,
    "    payload = json.load(sys.stdin)",
    '    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    "pgy Python chart renderer UTF-8 input",
  );
}

main = replaceOnce(
  main,
  `        except Exception:
            label = name
            sort_value = -1`,
  `        except Exception:
            label = f"{name}（占比-）"
            sort_value = -1`,
  "pgy daily note missing category percent",
);

main = main.replace(
  `    const n = String(t == null ? void 0 : t.contentTag ?? "").trim(), s = t == null ? void 0 : t.percent, i = s !== null && s !== "" && Number.isFinite(Number(s));
    return n ? { name: n, percent: i ? Number(s) : -1 } : null;`,
  `    const n = String(t == null ? void 0 : t.contentTag ?? "").trim(), s = t == null ? void 0 : t.percent, i = s != null && String(s).trim() !== "" && Number.isFinite(Number(s));
    return n ? { name: n, percent: i ? Number(s) : -1 } : null;`,
);

main = replaceOnce(
  main,
  `    const n = String(t == null ? void 0 : t.contentTag ?? "").trim(), s = Number(t == null ? void 0 : t.percent);
    return n ? { name: n, percent: Number.isFinite(s) ? s : -1 } : null;
  }).filter(Boolean).sort((t, n) => n.percent - t.percent) : [], t = e.slice(0, 3).map((n) => n.percent >= 0 ? n.name + "（占比" + n.percent.toFixed(1) + "%）" : n.name);`,
  `    const n = String(t == null ? void 0 : t.contentTag ?? "").trim(), s = t == null ? void 0 : t.percent, i = s != null && String(s).trim() !== "" && Number.isFinite(Number(s));
    return n ? { name: n, percent: i ? Number(s) : -1 } : null;
  }).filter(Boolean).sort((t, n) => n.percent - t.percent) : [], t = e.slice(0, 3).map((n) => n.percent >= 0 ? n.name + "（占比" + n.percent.toFixed(1) + "%）" : n.name + "（占比-）");`,
  "pgy daily note JS missing category percent",
);

main = main.replace(
  `async function pgyRenderChartsWithPython(a) {
  if (!a.length) return {};
  if (process.env.PGY_ENABLE_EXTERNAL_CHART_RENDERER !== "1")
    return {};
  const e = JSON.stringify({ charts: a }), t = Math.max(15e3, 5e3 + a.length * 4e3), n = [];`,
  `async function pgyRenderChartsWithPython(a) {
  if (!a.length) return {};
  const e = JSON.stringify({ charts: a }), t = Math.max(15e3, 5e3 + a.length * 4e3), n = [];`,
);

if (!main.includes("[pgy-chart] 调用内置绘图程序")) {
  main = replaceOnce(
    main,
    `  for (const s of pgyChartRendererCandidates())
    try {
      const i = await pgySpawnChartRenderer(s, e, t), o = JSON.parse(i.trim().split(/\\r?\\n/).pop() || "{}");`,
    `  for (const s of pgyChartRendererCandidates())
    try {
      j.info(\`[pgy-chart] 调用内置绘图程序: \${s}, charts=\${a.length}, timeout=\${t}\`);
      const i = await pgySpawnChartRenderer(s, e, t), o = JSON.parse(i.trim().split(/\\r?\\n/).pop() || "{}");`,
    "pgy chart renderer diagnostics",
  );
}

for (const sourceRows of [
  "const o = Array.isArray(t) ? t.slice(-120) : [];",
  "const o = Array.isArray(t) ? t.slice(-30) : [];",
]) {
  main = main.replace(sourceRows, "const o = Array.isArray(t) ? t : [];");
}

if (!main.includes("粉丝趋势接口使用主进程请求")) {
  main = replaceOnce(
    main,
    `    const o = e.replace(Re, ""), r = sm.encryptSign(o);
    if (i && !i.isDestroyed()) {`,
    `    const o = e.replace(Re, ""), r = sm.encryptSign(o);
    if (o.includes("/fans_overall_new_history")) {
      return j.info(\`[pgy-fetch] 粉丝趋势接口使用主进程请求，避免页面渲染线程卡顿: url=\${o}\`), await gt.requestJson({
        url: e,
        session: t,
        headers: {
          ...n,
          referer: s,
          "Sec-Fetch-Mode": "no-cors",
          "X-s": r["X-s"],
          "X-t": String(r["X-t"])
        },
        timeout: tm
      });
    }
    if (i && !i.isDestroyed()) {`,
    "pgy fans trend main-process fetch",
  );
}

main = main.replace(
  "`, o = await e.webContents.executeJavaScript(i, !0);",
  "`, o = await pgyTimeout(e.webContents.executeJavaScript(i, !0), 15e3, \"pgy.windowFetch\");",
);

main = main.replace(
  `    const o = await pgyRenderChartsWithPython(i);
    for (const r of i)
      o[r.field] && kt(o[r.field]) && (s[r.field] = o[r.field]);`,
  `    const o = await pgyRenderChartsWithPython(i);
    j.info(\`[pgy-chart] 内置绘图返回字段: \${Object.keys(o).join(",") || "(empty)"}\`);
    for (const r of i)
      typeof o[r.field] == "string" && o[r.field] && (s[r.field] = o[r.field]);`,
);

// noteImages 是一个选择项，但其展开列数量由实际返回的 noteImage_N 决定。
main = replaceOnce(
  main,
  `    const r = t[o];
    if (r)
      for (const c of r) s.add(c);`,
  `    const r = t[o];
    if (r)
      for (const c of r) s.add(c);
    if (o === "noteImages")
      for (const c of Object.keys(a)) c.startsWith("noteImage_") && s.add(c);`,
  "allow all dynamic notebook image aliases",
);

// 笔记图片字段：封面图对图文/视频笔记都可用；笔记图只对图文笔记展开。
// 下载后统一转成 PNG，避免官网返回的 JPEG/WebP 被错误地以 .png 原始字节写入 xlsx。
if (!main.includes("function isPgyImageKey")) {
  const pgyNotebookImageHelper = `function isPgyImageKey(a) {
  return typeof a == "string" && (PGY_IMAGE_FIELDS.has(a) || a.startsWith("noteImage_"));
}
async function pgyFetchImageBuffer(a, e, i) {
  if (e && e.webContents && typeof e.isDestroyed == "function" && !e.isDestroyed()) {
    try {
      const t = await pgyTimeout(
        e.webContents.executeJavaScript(
          "(async()=>{const response=await fetch(" + JSON.stringify(a) + ",{credentials:\"include\",referrer:\"https://pgy.xiaohongshu.com/\"});if(!response.ok)return {ok:false,status:response.status};const bytes=new Uint8Array(await response.arrayBuffer());let binary=\"\";for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));return {ok:true,base64:btoa(binary)}})()",
          !0,
        ),
        2e4,
        "pgy.imageFetch",
      );
      if (t && t.ok && typeof t.base64 == "string" && t.base64.length > 0) {
        return Buffer.from(t.base64, "base64");
      }
    } catch (t) {
      j.warn("[notebook-image] 浏览器会话下载失败，回退主进程请求", t);
    }
  }
  const n = {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: "https://pgy.xiaohongshu.com/",
  };
  if (i && i.cookies && typeof i.cookies.get == "function") {
    try {
      const cookies = await i.cookies.get({ url: a });
      if (Array.isArray(cookies) && cookies.length > 0) {
        n.Cookie = cookies.map((cookie) => cookie.name + "=" + cookie.value).join("; ");
      }
    } catch (t) {
      j.warn("[notebook-image] 读取图片会话 cookie 失败", t);
    }
  }
  const t = await fetch(a, {
    headers: n,
    signal: AbortSignal.timeout(15e3),
  });
  if (!t.ok) throw new Error("HTTP " + t.status);
  return Buffer.from(await t.arrayBuffer());
}
async function pgyDownloadImageToFile(a, e, t, i) {
  try {
    if (!a || typeof a != "string") return "";
    const n = await pgyFetchImageBuffer(a, t, i);
    if (!n || n.length === 0) return "";
    const s = PgyNativeImage.createFromBuffer(n).toPNG();
    if (!s || s.length === 0) return "";
    return Sr(Ja(e), { recursive: !0 }), Zi(e, s), e;
  } catch (t) {
    return j.warn("[notebook-image] 下载图片失败: dest=" + e, t), "";
  }
}`;
  const oldPgyImageDeclaration = `const PGY_IMAGE_FIELDS = new Set(Object.values(PYG_CHART_FIELDS)), PGY_CRC_TABLE = (() => {`;
  const newPgyImageDeclaration = "const PGY_IMAGE_FIELDS = new Set([...Object.values(PYG_CHART_FIELDS), \"coverImage\", \"noteImages\"]);\n" + pgyNotebookImageHelper + "\nconst PGY_CRC_TABLE = (() => {";
  if (main.includes(oldPgyImageDeclaration)) {
    main = replaceOnce(
      main,
      oldPgyImageDeclaration,
      newPgyImageDeclaration,
      "pgy notebook image helper",
    );
  } else {
    main = replaceOnce(
      main,
      "\nconst PGY_CRC_TABLE = (() => {",
      "\n" + pgyNotebookImageHelper + "\nconst PGY_CRC_TABLE = (() => {",
      "pgy notebook image helper after split image declaration",
    );
  }
}

if (!main.includes("const noteType = Number(h.type || (h.videoInfo ? 2 : 1));")) {
  main = replaceOnce(
    main,
    `        const h = d.data, m = h.userInfo ?? {}, f = {
`,
    `        const h = d.data, m = h.userInfo ?? {};
        const noteType = Number(h.type || (h.videoInfo ? 2 : 1));
        const imageUrls = [];
        const imageUrlSet = new Set();
        const imageUrlOf = (item) => {
          if (typeof item == "string") return item.trim();
          if (!item || typeof item != "object") return "";
          return String(item.url || item.original || item.originUrl || item.imageUrl || item.info?.url || item.info?.original || "").trim();
        };
        for (const imageList of [h.imagesList, h.imageList, h.images]) {
          if (!Array.isArray(imageList)) continue;
          for (const item of imageList) {
            const url = imageUrlOf(item);
            if (url && !imageUrlSet.has(url)) imageUrlSet.add(url), imageUrls.push(url);
          }
        }
        let localCoverPath = "";
        const coverUrl = imageUrls[0] || h.videoInfo?.thumbnail || h.videoInfo?.thumbnailUrl || h.videoInfo?.firstFrame || h.videoInfo?.cover || h.videoInfo?.coverUrl || h.videoInfo?.image || h.cover || h.coverUrl || h.image || "";
        const coverSelected = pgyHasSelectedField(r, "coverImage");
        const noteImagesSelected = pgyHasSelectedField(r, "noteImages");
        j.info("[notebook-image] noteId=" + l + " type=" + noteType + " candidates=" + imageUrls.length + " coverSelected=" + coverSelected + " noteImagesSelected=" + noteImagesSelected);
        if (coverUrl && coverSelected) {
          const dest = pgyChartFile("note-covers", l + "_cover", "cover");
          localCoverPath = (await pgyDownloadImageToFile(coverUrl, dest, s, t)) || "";
        }
        const noteImgPaths = [];
        if (noteType === 1 && noteImagesSelected) {
          for (let idx = 0; idx < imageUrls.length; idx++) {
            const dest = pgyChartFile("note-images", l + "_img_" + (idx + 1), "img_" + (idx + 1));
            const saved = await pgyDownloadImageToFile(imageUrls[idx], dest, s, t);
            if (saved) noteImgPaths.push(saved);
          }
        }
        const f = {
`,
    "pgy notebook image scraping setup",
  );
  main = replaceOnce(
    main,
    `          content: h.content,
`,
    `          content: h.content,
          coverImage: localCoverPath,
          noteImages: noteImgPaths,
`,
    "pgy notebook image fields",
  );
  main = replaceOnce(
    main,
    `          createTime: h.createTime
        };
        return {
          status: "success",
          data: en(f, r)
`,
    `          createTime: h.createTime
        };
        noteImgPaths.forEach((p, idx) => {
          f["noteImage_" + (idx + 1)] = p;
        });
        return {
          status: "success",
          data: en(f, r, { noteImages: ["noteImages"] })
`,
    "pgy notebook image field aliases",
  );
}

// 图片列必须使用图片列判断，且导出包声明 jpeg/jpg 类型，兼容既有图片字段。
main = replaceAllIfExists(main, "PGY_IMAGE_FIELDS.has(i.key)", "isPgyImageKey(i.key)");
main = replaceAllIfExists(main, "PGY_IMAGE_FIELDS.has(v.key)", "isPgyImageKey(v.key)");
main = replaceAllIfExists(main, "PGY_IMAGE_FIELDS.has(f.key)", "isPgyImageKey(f.key)");
if (!main.includes('Extension="jpeg"')) {
  main = replaceOnce(
    main,
    `function pgyAddContentTypes(a) {
  return a.includes('Extension="png"') || (a = a.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>')), a.includes('/xl/drawings/drawing1.xml') || (a = a.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')), a;
}`,
    `function pgyAddContentTypes(a) {
  a.includes('Extension="png"') || (a = a.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>'));
  a.includes('Extension="jpeg"') || (a = a.replace("</Types>", '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>'));
  a.includes('Extension="jpg"') || (a = a.replace("</Types>", '<Default Extension="jpg" ContentType="image/jpeg"/></Types>'));
  a.includes('/xl/drawings/drawing1.xml') || (a = a.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  return a;
}`,
    "pgy image content types",
  );
}
main = replaceAllIfExists(
  main,
  'o.media = `pgy_chart_\${r + 1}.png`, s.file(`xl/media/\${o.media}`, Qi(o.path));',
  'const ext = Xi.extname(o.path).replace(".", "").toLowerCase() || "png";\n      const mediaExt = ext === "jpg" ? "jpeg" : ext;\n      o.media = `pgy_img_\${r + 1}.\${mediaExt}`, s.file(`xl/media/\${o.media}`, Qi(o.path));',
);

if (!main.includes("function pgyDataWithoutImageText")) {
  main = replaceOnce(
    main,
    `async function pgyEmbedImagesInWorkbook(a, e, t) {`,
    `function pgyDataWithoutImageText(a, e) {
  const t = Array.isArray(e) ? e : [];
  const n = new Set((Array.isArray(a) ? a : []).filter((s) => s && isPgyImageKey(s.key)).map((s) => s.key));
  return n.size === 0 ? t : t.map((s) => {
    const i = { ...s };
    for (const o of n)
      typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "__PGY_IMAGE_CELL_BLANK__");
    return i;
  });
}
async function pgyEmbedImagesInWorkbook(a, e, t) {`,
    "pgy data without image path text",
  );
}

main = replaceOnce(
  main,
  'typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "");',
  'typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "__PGY_IMAGE_CELL_BLANK__");',
  "pgy image path blank sentinel",
);

main = insertAfterOnce(
  main,
  'async function ff(a) {',
  `  const pausedTask = typeof (a == null ? void 0 : a.taskId) == "string" ? ge == null ? void 0 : ge.runningTasks.get(a.taskId) : null;
  if (pausedTask != null && pausedTask.paused)
    throw new Error("任务已暂停，请继续采集或等待任务完成后再下载结果");`,
  "pausedTask",
  "block export while plugin task is paused",
);

if (!main.includes("function expandNotebookImageHeaders")) {
  main = replaceOnce(
    main,
    'async function ff(a) {',
    `function expandNotebookImageHeaders(headers, rows) {
  const sourceHeaders = Array.isArray(headers) ? headers.filter(Boolean) : [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  const hasCoverHeader = sourceHeaders.some((h) => h.key === "coverImage");
  const hasNoteHeader = sourceHeaders.some((h) => h.key === "noteImages" || h.key === "noteImage_1");
  const hasCoverData = sourceRows.some((r) => r && typeof r.coverImage === "string" && r.coverImage.length > 0);
  const hasNoteData = sourceRows.some((r) => r && (Array.isArray(r.noteImages) || r.noteImage_1));
  const includeCover = hasCoverHeader || hasCoverData;
  const includeNotes = hasNoteHeader || hasNoteData;
  let maxCount = 0;
  for (const r of sourceRows) {
    if (r && Array.isArray(r.noteImages)) {
      maxCount = Math.max(maxCount, r.noteImages.length);
    } else if (r) {
      let c = 0;
      while (r["noteImage_" + (c + 1)]) c++;
      maxCount = Math.max(maxCount, c);
    }
  }
  maxCount = Math.max(1, maxCount);
  const addNoteHeaders = (target, group) => {
    if (maxCount === 1) {
      target.push({ group: group || "笔记内容", label: "笔记图", key: "noteImage_1" });
      return;
    }
    for (let i = 1; i <= maxCount; i++) {
      target.push({ group: group || "笔记内容", label: "笔记图 " + i, key: "noteImage_" + i });
    }
  };
  const expandedHeaders = [];
  let noteHeaderExpanded = false;
  for (const h of sourceHeaders) {
    if (h.key === "noteImages" || h.key === "noteImage_1") {
      if (!noteHeaderExpanded) addNoteHeaders(expandedHeaders, h.group);
      noteHeaderExpanded = true;
    } else {
      expandedHeaders.push(h);
    }
  }
  // 历史导出 payload 可能遗漏图片表头，但结果行已经持有本地图片路径。
  // 此处以行数据为准补列，保证后续图片嵌入函数拥有实际的目标单元格。
  if (includeCover && !hasCoverHeader) {
    expandedHeaders.push({ group: "笔记内容", label: "封面图", key: "coverImage" });
  }
  if (includeNotes && !noteHeaderExpanded) {
    addNoteHeaders(expandedHeaders, "笔记内容");
  }
  const expandedRows = sourceRows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const next = { ...r };
    if (Array.isArray(next.noteImages)) {
      next.noteImages.forEach((img, idx) => {
        next["noteImage_" + (idx + 1)] = img;
      });
    }
    return next;
  });
  return { headers: expandedHeaders, rows: expandedRows };
}
async function ff(a) {`,
    "expand notebook image headers helper",
  );
}

if (!main.includes("const rawData = a.data ?? []")) {
  main = replaceOnce(
    main,
    'const i = a.data ?? [], n = a.mode === "two-row" ? gf(a.headers ?? [], pgyDataWithoutImageText(a.headers ?? [], i)) : hf(i), s = Ve.utils.book_new();',
    'const rawData = a.data ?? [];\n    const { headers: expHeaders, rows: expData } = expandNotebookImageHeaders(a.headers ?? [], rawData);\n    const n = a.mode === "two-row" ? gf(expHeaders, pgyDataWithoutImageText(expHeaders, expData)) : hf(expData), s = Ve.utils.book_new();',
    "expand notebook image headers in ff",
  );
  main = replaceOnce(
    main,
    'a.mode === "two-row" && await pgyEmbedImagesInWorkbook(t, a.headers ?? [], i),',
    'a.mode === "two-row" && await pgyEmbedImagesInWorkbook(t, expHeaders, expData),',
    "expand notebook image rows in ff",
  );
}

if (!main.includes("桌面端启动")) {
  main = replaceOnce(
    main,
    `ye.whenReady().then(() => {
  fh(), Vi(), ye.on("activate", () => {
    Dt.getAllWindows().length === 0 && Vi();
  });
});`,
    `process.on("unhandledRejection", (a) => {
  Ee.error("未处理的 Promise 异常:", a);
});
process.on("uncaughtException", (a) => {
  Ee.error("未捕获异常:", a);
});
ye.whenReady().then(() => {
  Ee.info("桌面端启动", {
    platform: process.platform,
    arch: process.arch,
    packaged: ye.isPackaged,
    version: ye.getVersion(),
    userData: ye.getPath("userData"),
    resourcesPath: process.resourcesPath
  }), fh(), Vi(), ye.on("activate", () => {
    Dt.getAllWindows().length === 0 && Vi();
  });
});`,
    "desktop startup logging",
  );
}

main = replaceOnce(
  main,
  `ye.on("window-all-closed", () => {
  process.platform !== "darwin" && ye.quit();
});`,
  `ye.on("window-all-closed", () => {
  Ee.info("所有窗口已关闭");
  process.platform !== "darwin" && ye.quit();
});`,
  "window closed logging",
);

main = replaceOnce(
  main,
  `ye.on("before-quit", () => {
  Rn(), lh(), yf();
});`,
  `ye.on("before-quit", () => {
  Ee.info("应用准备退出");
  Rn(), lh(), yf();
});`,
  "before quit logging",
);

main = replaceOnce(
  main,
  `}), uh(dt), t.start(), pt.info("采集调度器已初始化");`,
  `}), uh(dt), pt.info("采集调度器云端同步已关闭");`,
  "disable scheduler cloud sync startup",
);

if (!main.includes("跳过桌面更新检查")) {
  main = replaceOnce(
    main,
    `    const a = ye.getVersion(), e = Sd();
    Ie.info(\`检查更新 — 当前版本: \${a}, 平台: \${e}\`);
    const n = (await ce.get(\`\${_d}/api/desktop-versions/check\`, {
      params: {
        currentVersion: a,
        platform: e
      }
    })).data;`,
    `    const a = ye.getVersion(), e = Sd();
    Ie.info(\`检查更新 — 当前版本: \${a}, 平台: \${e}\`);
    if (e !== "windows") {
      Ie.info(\`跳过桌面更新检查：\${e} 当前未参与 Windows 更新通道\`);
      ve.webContents.send(qe.updateNotAvailable);
      return;
    }
    const n = (await ce.get(\`\${_d}/api/desktop-versions/check\`, {
      params: {
        currentVersion: a,
        platform: e
      }
    })).data;`,
    "skip non-windows desktop update checks",
  );
}

if (!main.includes("pgyDesktopUpdateActive")) {
  main = replaceOnce(
    main,
    "let ve = null, ot = null;",
    "let ve = null, ot = null, pgyDesktopUpdateActive = !1;",
    "desktop update coordination state",
  );
  main = replaceOnce(
    main,
    `  static async checkAndDownloadUpdate() {
    if (this.isDownloading) {`,
    `  static async checkAndDownloadUpdate() {
    if (pgyDesktopUpdateActive) {
      K.info("桌面安装包更新已就绪，跳过前端资源写入");
      return;
    }
    if (this.isDownloading) {`,
    "desktop update priority over assets",
  );
  main = replaceOnce(
    main,
    `    if (!s.hasUpdate) {
      Ie.info("当前已是最新版本"), ve.webContents.send(qe.updateNotAvailable);`,
    `    if (!s.hasUpdate) {
      pgyDesktopUpdateActive = !1, Ie.info("当前已是最新版本"), ve.webContents.send(qe.updateNotAvailable);`,
    "clear desktop update state",
  );
  main = replaceOnce(
    main,
    `    Ie.info("发现新版本:", s.version), ve.webContents.send(qe.updateAvailable, {`,
    `    pgyDesktopUpdateActive = !0, Ie.info("发现新版本:", s.version), ve.webContents.send(qe.updateAvailable, {`,
    "activate desktop update state",
  );
  main = replaceOnce(
    main,
    `  } catch (a) {
    Ie.error("检查更新失败:", a);`,
    `  } catch (a) {
    pgyDesktopUpdateActive = !1, Ie.error("检查更新失败:", a);`,
    "release desktop state after check failure",
  );
  main = replaceOnce(
    main,
    `    Rd(Z), Xt || Ae.setupWindowFocusListener(Z), Xt || cr(), setTimeout(() => {`,
    `    Rd(Z), Xt || cr().finally(() => Ae.setupWindowFocusListener(Z)), setTimeout(() => {`,
    "sequence desktop and asset update checks",
  );
}

if (!main.includes("pgyHasSingleInstanceLock")) {
  main = replaceOnce(
    main,
    `ye.whenReady().then(() => {`,
    `const pgyHasSingleInstanceLock = ye.requestSingleInstanceLock();
if (pgyHasSingleInstanceLock) {
  ye.on("second-instance", () => {
    Z && !Z.isDestroyed() && (Z.isMinimized() && Z.restore(), Z.show(), Z.focus());
  });
  ye.whenReady().then(() => {`,
    "single desktop instance start",
  );
  main = replaceOnce(
    main,
    `  });
});
ye.on("window-all-closed", () => {`,
    `  });
  });
} else {
  ye.quit();
}
ye.on("window-all-closed", () => {`,
    "single desktop instance end",
  );
}
main = replaceAllIfExists(
  main,
  `        Math.round(p - m.width / 2),
        Math.round(d - m.height / 2)
      );
    } else`,
  `        Math.round(p - m.width / 2),
        Math.round(d - m.height / 2)
      ), s.isMaximized() || s.maximize();
    } else`,
);

main = replaceAllIfExists(
  main,
  'jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a), mh();',
  'jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a);',
);

if (!main.includes('.partial-${process.pid}')) {
  main = replaceOnce(
    main,
    `  static async applyAssets(e, t) {
    const n = Oe($n, t);
    kt(n) && Kt.rmSync(n, { recursive: !0, force: !0 }), Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));
    if (!kt(Oe(n, "index.html")))
      throw new Error("资源解压失败：缺少 index.html");
    if (!kt(Oe(n, "integrity-manifest.json")))
      throw new Error("资源解压失败：缺少 integrity-manifest.json");
    pgyVerifyAssets(n);
    const s = {
      version: t,
      appliedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    Zi(Xn, JSON.stringify(s, null, 2)), kt(e) && Rr(e);
  }`,
    `  static async applyAssets(e, t) {
    const n = Oe($n, t), s = \`\${n}.partial-\${process.pid}\`;
    kt(s) && Kt.rmSync(s, { recursive: !0, force: !0 }), Sr(s, { recursive: !0 });
    try {
      await Er(Cr(e), kr({ path: s }));
      if (!kt(Oe(s, "index.html")))
        throw new Error("资源解压失败：缺少 index.html");
      if (!kt(Oe(s, "integrity-manifest.json")))
        throw new Error("资源解压失败：缺少 integrity-manifest.json");
      pgyVerifyAssets(s);
      let i = !1;
      if (kt(n))
        try {
          pgyVerifyAssets(n), i = !0;
        } catch {
          Kt.rmSync(n, { recursive: !0, force: !0 });
        }
      i ? Kt.rmSync(s, { recursive: !0, force: !0 }) : Kt.renameSync(s, n);
      const o = {
        version: t,
        appliedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, r = \`\${Xn}.tmp-\${process.pid}\`, pgyVersionPointerBackup = \`\${Xn}.previous-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(Xn) && Kt.renameSync(Xn, pgyVersionPointerBackup);
      try {
        Kt.renameSync(r, Xn), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(e) && Rr(e);
      } catch (i) {
        throw kt(r) && Rr(r), kt(pgyVersionPointerBackup) && Kt.renameSync(pgyVersionPointerBackup, Xn), i;
      }
    } catch (i) {
      throw kt(s) && Kt.rmSync(s, { recursive: !0, force: !0 }), i;
    }
  }`,
    "atomic asset apply",
  );
}

if (!main.includes("pgyVersionPointerBackup")) {
  main = replaceOnce(
    main,
    `      }, r = \`\${Xn}.tmp-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), Kt.renameSync(r, Xn), kt(e) && Rr(e);`,
    `      }, r = \`\${Xn}.tmp-\${process.pid}\`, pgyVersionPointerBackup = \`\${Xn}.previous-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(Xn) && Kt.renameSync(Xn, pgyVersionPointerBackup);
      try {
        Kt.renameSync(r, Xn), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(e) && Rr(e);
      } catch (i) {
        throw kt(r) && Rr(r), kt(pgyVersionPointerBackup) && Kt.renameSync(pgyVersionPointerBackup, Xn), i;
      }`,
    "atomic asset version pointer",
  );
}

if (!main.includes('pgyAssetPartPath = `${i}.part-${process.pid}`')) {
  main = replaceOnce(
    main,
    'const i = Oe(ye.getPath("temp"), `assets-${e.version}.zip`);',
    'const i = Oe(ye.getPath("temp"), `assets-${e.version}.zip`), pgyAssetPartPath = `${i}.part-${process.pid}`;\n      kt(pgyAssetPartPath) && Rr(pgyAssetPartPath);',
    "asset partial download path",
  );
  main = replaceOnce(
    main,
    'const u = Ar(i);',
    'const u = Ar(pgyAssetPartPath);',
    "write asset partial download",
  );
  main = replaceOnce(
    main,
    `          }), o.pipe(u), u.on("finish", () => {
            u.close(), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
          }), u.on("error", (l) => {`,
    `          }), o.pipe(u), u.on("finish", () => {
            u.close(async (l) => {
              if (l) {
                s(l);
                return;
              }
              try {
                const pgyAssetExpectedChecksum = String(e.checksum || "").trim().toLowerCase().replace(/^sha256:/, "");
                if (!/^[a-f0-9]{64}$/.test(pgyAssetExpectedChecksum))
                  throw new Error("资源包校验值无效，请联系管理员");
                if ((await Cd(pgyAssetPartPath)).toLowerCase() !== pgyAssetExpectedChecksum)
                  throw new Error("资源包校验失败，请重新下载");
                kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
              } catch (pgyAssetDownloadError) {
                kt(pgyAssetPartPath) && Rr(pgyAssetPartPath), s(pgyAssetDownloadError);
              }
            });
          }), u.on("error", (l) => {`,
    "finalize asset partial download",
  );
}

if (!main.includes("pgyAssetExpectedChecksum")) {
  main = replaceOnce(
    main,
    `            u.close((l) => {
              if (l) {
                s(l);
                return;
              }
              kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
            });`,
    `            u.close(async (l) => {
              if (l) {
                s(l);
                return;
              }
              try {
                const pgyAssetExpectedChecksum = String(e.checksum || "").trim().toLowerCase().replace(/^sha256:/, "");
                if (!/^[a-f0-9]{64}$/.test(pgyAssetExpectedChecksum))
                  throw new Error("资源包校验值无效，请联系管理员");
                if ((await Cd(pgyAssetPartPath)).toLowerCase() !== pgyAssetExpectedChecksum)
                  throw new Error("资源包校验失败，请重新下载");
                kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
              } catch (pgyAssetDownloadError) {
                kt(pgyAssetPartPath) && Rr(pgyAssetPartPath), s(pgyAssetDownloadError);
              }
            });`,
    "asset archive checksum",
  );
}

main = replaceOnce(
  main,
  `      forceUpdate: s.forceUpdate,`,
  `      forceUpdate: false,`,
  "desktop update is never forced",
);

if (!main.includes('toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, "")')) {
  main = replaceOnce(
    main,
    `    }), s.data.pipe(r), await new Promise((u, l) => {
      r.on("finish", () => u()), r.on("error", l);
    }), Ie.info("下载完成"), Ie.info("校验文件完整性..."), await Cd(n) !== t)
      throw new Error("文件校验失败，请重新下载");`,
    `    }), s.data.pipe(r), await new Promise((u, l) => {
      r.on("finish", () => u()), r.on("error", l);
    }), Ie.info("下载完成"), Ie.info("校验文件完整性..."), (await Cd(n)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))
      throw new Error("文件校验失败，请重新下载");`,
    "case-insensitive installer checksum",
  );
}

if (!main.includes("setTimeout(() => Ed(), 1200)")) {
  main = replaceOnce(
    main,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n
    });
  } catch (n) {`,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n
    }), setTimeout(() => Ed(), 1200);
  } catch (n) {`,
    "auto install after update download",
  );
}

if (!main.includes("pgyInstallerPartPath")) {
  main = replaceOnce(
    main,
    `  try {
    Kt.existsSync(Sa) || Kt.mkdirSync(Sa, { recursive: !0 });
    const n = Xi.join(Sa, e);
    ot = n, Ie.info(\`下载更新: \${a}\`), Ie.debug(\`保存路径: \${n}\`);`,
    `  let pgyInstallerPartPath = null;
  try {
    Kt.existsSync(Sa) || Kt.mkdirSync(Sa, { recursive: !0 });
    const n = Xi.join(Sa, e);
    pgyInstallerPartPath = \`\${n}.part-\${process.pid}\`, Kt.existsSync(pgyInstallerPartPath) && Kt.rmSync(pgyInstallerPartPath, { force: !0 }), ot = n, Ie.info(\`下载更新: \${a}\`), Ie.debug(\`保存路径: \${n}\`);`,
    "installer partial download path",
  );
  main = replaceOnce(
    main,
    `    const r = Kt.createWriteStream(n);`,
    `    const r = Kt.createWriteStream(pgyInstallerPartPath);`,
    "write installer partial download",
  );
  main = replaceOnce(
    main,
    `(await Cd(n)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))`,
    `(await Cd(pgyInstallerPartPath)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))`,
    "verify installer partial download",
  );
  main = replaceOnce(
    main,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n`,
    `    Kt.existsSync(n) && Kt.rmSync(n, { force: !0 }), Kt.renameSync(pgyInstallerPartPath, n), Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n`,
    "promote installer partial download",
  );
  main = replaceOnce(
    main,
    `  } catch (n) {
    Ie.error("下载更新失败:", n);`,
    `  } catch (n) {
    pgyInstallerPartPath && Kt.existsSync(pgyInstallerPartPath) && Kt.rmSync(pgyInstallerPartPath, { force: !0 }), Ie.error("下载更新失败:", n);`,
    "clean installer partial download",
  );
}

main = replaceOnce(
  main,
  `  Ie.info("安装更新:", ot);
  const a = process.platform;
  a === "win32" ? (Tr(ot, [], {
    detached: !0,
    stdio: "ignore"
  }).unref(), ye.quit()) : (a === "darwin" || a === "linux") && (Ji.openPath(ot), ve == null || ve.webContents.send(qe.manualInstall, {
    filePath: ot
  }));
}`,
  `  Ie.info("安装更新:", ot);
  const a = process.platform, e = Ja(ye.getPath("exe"));
  a === "win32" ? (Tr(ot, ["/S", \`/D=\${e}\`], {
    detached: !0,
    stdio: "ignore"
  }).unref(), ye.quit()) : (a === "darwin" || a === "linux") && (Ji.openPath(ot), ve == null || ve.webContents.send(qe.manualInstall, {
    filePath: ot
  }));
}`,
  "silent installer in current install dir",
);

main = replaceOnce(
  main,
  `async (e, t) => (Le.get().setAuth(t.baseUrl, t.token), await a.scheduler.recoverInterruptedRunsOnce(), await a.scheduler.forceSync().catch((n) => {
      pt.warn("setAuth 后立即同步失败:", n);
    }), { ok: !0 })`,
  `async (e, t) => (Le.get().setAuth(t.baseUrl, t.token), { ok: !0, disabled: !0 })`,
  "disable scheduler set-auth sync",
);

main = replaceOnce(
  main,
  `), F.handle(Ne.status, () => a.scheduler.getStatus());`,
  `), F.handle(Ne.status, () => ({ registeredTasks: [], activeRuns: [], disabled: !0 }));`,
  "disable scheduler status",
);

main = replaceAllIfExists(
  main,
  'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);',
  'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = "personal", u = this.plugins.get(n);',
);

if (!main.includes('list: "scraper:history:list"')) {
  main = replaceOnce(
    main,
    `  export: {
    /** 导出带样式的 Excel (invoke, renderer → main) */
    toExcel: "scraper:export:to-excel"
  }
}`,
    `  export: {
    /** 导出带样式的 Excel (invoke, renderer → main) */
    toExcel: "scraper:export:to-excel"
  },
  history: {
    list: "scraper:history:list",
    exportTask: "scraper:history:export-task",
    resumeTask: "scraper:history:resume-task",
    migrateLegacy: "scraper:history:migrate-legacy"
  }
}`,
    "collection history IPC channels",
  );
}

preload = replaceOnce(
  preload,
  'export:{toExcel:"scraper:export:to-excel"}}',
  'export:{toExcel:"scraper:export:to-excel"},history:{list:"scraper:history:list",exportTask:"scraper:history:export-task",resumeTask:"scraper:history:resume-task",migrateLegacy:"scraper:history:migrate-legacy"}}',
  "preload collection history channels",
);

preload = replaceOnce(
  preload,
  'export:{toExcel:e=>r.ipcRenderer.invoke(s.export.toExcel,e)}}',
  'export:{toExcel:e=>r.ipcRenderer.invoke(s.export.toExcel,e)},history:{list:()=>r.ipcRenderer.invoke(s.history.list),exportTask:e=>r.ipcRenderer.invoke(s.history.exportTask,{taskId:e}),resumeTask:e=>r.ipcRenderer.invoke(s.history.resumeTask,{taskId:e}),migrateLegacy:e=>r.ipcRenderer.invoke(s.history.migrateLegacy,{history:e})}}',
  "preload collection history bridge",
);

if (!main.includes("async consumeShumiaoForItem(e, t, n = t)")) {
  main = replaceOnce(
    main,
    `  async consumeShumiaoForItem(e, t) {
    if (!this.isAuthenticated())
      throw new Error("未登录，无法扣减积分");
    const n = Array.isArray(e.urls) ? e.urls[t] : null, s = {
      inputType: e.inputType || (String(e.fileName || "").includes("手动输入") ? "manual" : "xlsx"),
      pluginId: e.pluginId,
      taskType: e.taskType,
      fileName: e.fileName,
      totalRows: e.totalRows ?? (Array.isArray(e.urls) ? e.urls.length : 0),
      validCount: Array.isArray(e.urls) ? e.urls.length : 0,
      itemIndex: t + 1,
      url: n
    }, i = await this.request("POST", "/api/shumiao/consume", {
      count: 1,
      remark: \`采集成功扣减 1 积分\`,
      detail: s
    });
    return Number(i.data?.balance ?? 0);
  }`,
    `  async consumeShumiaoForItem(e, t, n = t) {
    if (!this.isAuthenticated())
      throw new Error("未登录，无法扣减积分");
    const s = Array.isArray(e.urls) ? e.urls[t] : null, o = Number(n), r = {
      inputType: e.inputType || (String(e.fileName || "").includes("手动输入") ? "manual" : "xlsx"),
      pluginId: e.pluginId,
      taskType: e.taskType,
      fileName: e.fileName,
      totalRows: e.totalRows ?? (Array.isArray(e.urls) ? e.urls.length : 0),
      validCount: Array.isArray(e.urls) ? e.urls.length : 0,
      itemIndex: o + 1,
      url: s
    }, i = await this.request("POST", "/api/shumiao/consume", {
      count: 1,
      taskId: e.taskId,
      itemIndex: o + 1,
      remark: \`采集成功扣减 1 积分\`,
      detail: r
    });
    return Number(i.data?.balance ?? 0);
  }`,
    "idempotent per-item shumiao identity",
  );
}

main = replaceOnce(
  main,
  `      taskId: e.taskId,
      itemIndex: o,`,
  `      taskId: e.taskId,
      itemIndex: o + 1,`,
  "send one-based original item index to billing API",
);

main = replaceOnce(
  main,
  `  async checkShumiaoBalanceForTask(e) {
    const t = Array.isArray(e.urls) ? e.urls.length : 0;
    if (t <= 0)
      throw new Error("没有可计费的采集链接");
    if (!this.isAuthenticated())
      throw new Error("未登录，无法判定积分余额");
    const n = await this.request("GET", \`/api/shumiao/check-balance?count=\${encodeURIComponent(String(t))}\`), s = Number(n.data?.balance ?? 0), i = Number(n.data?.required ?? t), o = Number(n.data?.shortage ?? Math.max(0, i - s));
    if (!n.data?.sufficient)
      throw new Error(\`积分余额不足：当前 \${s}，本次需要 \${i}，还差 \${o}\`);
    return s;
  }`,
  `  async checkShumiaoBalanceForTask(e) {
    const t = Array.isArray(e.urls) ? e.urls.length : 0, n = Array.isArray(e.pendingCharges) ? e.pendingCharges.length : 0, s = Math.max(0, t - n);
    if (t <= 0)
      throw new Error("没有可计费的采集链接");
    if (!this.isAuthenticated())
      throw new Error("未登录，无法判定积分余额");
    if (s <= 0)
      return 0;
    const i = await this.request("GET", \`/api/shumiao/check-balance?count=\${encodeURIComponent(String(s))}\`), o = Number(i.data?.balance ?? 0), r = Number(i.data?.required ?? s), c = Number(i.data?.shortage ?? Math.max(0, r - o));
    if (!i.data?.sufficient)
      throw new Error(\`积分余额不足：当前 \${o}，本次待采集需要 \${r}，还差 \${c}\`);
    return o;
  }`,
  "pending charge reconciliation does not overstate required balance",
);

if (!main.includes("pgyCollectionHistory.createTask(t)")) {
  main = replaceOnce(
    main,
    `  ), F.on(W.task.start, (e, t) => {
    ge.startTask(t).catch((n) => {
      Qe.error("任务启动失败:", n);
    });
  }), F.on(W.task.pause, (e, t) => {`,
    `  ), F.on(W.task.start, (e, t) => {
    pgyCollectionHistory.createTask(t).then(() => ge.startTask(t)).catch(async (n) => {
      Qe.error("任务启动失败:", n);
      await pgyCollectionHistory.setStatus(t.taskId, "interrupted").catch(() => {});
    });
  }), F.on(W.task.pause, (e, t) => {`,
    "persist task before scraper start",
  );
}

if (!main.includes("W.history.list")) {
  main = replaceOnce(
    main,
    `  }), F.handle(W.export.toExcel, async (e, t) => ff(t));`,
    `  }), F.handle(W.export.toExcel, async (e, t) => ff(t)), F.handle(W.history.list, async () => pgyCollectionHistory.listTasks()), F.handle(W.history.exportTask, async (e, t) => {
    const n = await pgyCollectionHistory.getTask(t.taskId), s = await pgyCollectionHistory.getExportRows(t.taskId);
    if (!n)
      throw new Error("历史任务不存在");
    // 找博主筛选来源（search-batch）的任务：只有完成且计数收口才允许导出；
    // 纵深防御，防止 running/preparing 时导出只有部分行的 Excel。
    if (!isCollectionTaskExportReady(n)) {
      const gateError = new Error("任务尚未完成全部博主采集，暂不可导出（完成后自动解锁）");
      gateError.kind = "task-not-complete";
      throw gateError;
    }
    if (s.length === 0)
      throw new Error("该任务暂无可导出的成功内容");
    return ff({ taskId: t.taskId, fileName: n.fileName || \`\${t.taskId}.xlsx\`, data: s });
  }), F.handle(W.history.resumeTask, async (e, t) => {
    const n = await pgyCollectionHistory.getResumePlan(t.taskId);
    if (n.payload.urls.length === 0) {
      await pgyCollectionHistory.setStatus(t.taskId, "completed");
      return { ok: !0, remaining: 0, completed: !0 };
    }
    await pgyCollectionHistory.setStatus(t.taskId, "running");
    ge.startTask({ ...n.payload, pendingCharges: n.pendingCharges }).catch(async (s) => {
      Qe.error("历史任务继续失败:", s);
      await pgyCollectionHistory.setStatus(t.taskId, "interrupted").catch(() => {});
    });
    return { ok: !0, remaining: n.payload.urls.length };
  }), F.handle(W.history.migrateLegacy, async (e, t) => pgyCollectionHistory.importLegacyHistory(t?.history));`,
    "collection history IPC handlers",
  );
}

if (!main.includes("await pgyCollectionHistory.initialize()")) {
  main = replaceOnce(
    main,
    `  ye.whenReady().then(() => {
  Ee.info("桌面端启动", {`,
    `  ye.whenReady().then(async () => {
  await pgyCollectionHistory.initialize();
  Ee.info("桌面端启动", {`,
    "initialize collection history before desktop handlers",
  );
}

// 历史导出补齐规范表头：命中 Schema 时以 mode:"two-row" + headers 调用 ff，
// 与正常任务面板导出保持一致（含图片嵌入）；未命中 Schema 的 legacy 任务保持单行兼容导出。
// 解析/过滤逻辑见 app-source/electron-main/collection-export-headers.mjs。
main = replaceOnce(
  main,
  'return ff({ taskId: t.taskId, fileName: n.fileName || `${t.taskId}.xlsx`, data: s });',
  'return ff(buildCollectionHistoryExportPayload(n, s));',
  "history export uses schema headers and image embedding",
);

if (!main.includes("const pgySourceIndexes")) {
  main = replaceOnce(
    main,
    `    const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = "personal", u = this.plugins.get(n);`,
    `    const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = "personal", u = this.plugins.get(n);
    const pgySourceIndexes = Array.isArray(e.sourceIndexes) && e.sourceIndexes.length === i.length ? e.sourceIndexes.map((m) => Number(m)) : i.map((m, f) => f), pgyPendingCharges = new Map((Array.isArray(e.pendingCharges) ? e.pendingCharges : []).map((m) => [Number(m.itemIndex), m]));
    let pgyAuthExpired = !1, pgyInterrupted = !1;`,
    "collection task original indexes and recovery state",
  );
}

if (!main.includes('await pgyCollectionHistory.setStatus(t, "auth_expired")')) {
  main = replaceOnce(
    main,
    `        if (!m.authorized) {
          this.sendToRenderer(W.task.error, {`,
    `        if (!m.authorized) {
          await pgyCollectionHistory.setStatus(t, "auth_expired");
          this.sendToRenderer(W.task.error, {`,
    "persist unavailable authorization status",
  );
  main = replaceOnce(
    main,
    `      } catch (m) {
        this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "auth",
          errorCategoryLabel: "授权检测失败"
        });`,
    `      } catch (m) {
        await pgyCollectionHistory.setStatus(t, "auth_expired");
        this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "auth",
          errorCategoryLabel: "授权检测失败"
        });`,
    "persist failed authorization precheck",
  );
}

if (!main.includes('await pgyCollectionHistory.setStatus(t, "interrupted")')) {
  main = replaceOnce(
    main,
    `      } catch (m) {
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {`,
    `      } catch (m) {
        await pgyCollectionHistory.setStatus(t, "interrupted");
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {`,
    "persist balance precheck interruption",
  );
}

if (!main.includes("pgyPending = pgyPendingCharges.get(pgyItemIndex)")) {
  main = replaceOnce(
    main,
    `      const f = i[m];
      l.current = m + 1;`,
    `      const f = i[m], pgyItemIndex = pgySourceIndexes[m] ?? m, pgyPending = pgyPendingCharges.get(pgyItemIndex);
      l.current = m + 1;`,
    "map resume item to original source index",
  );
  main = replaceOnce(
    main,
    // 目标状态以“已烤进 release 的 reconcile 块”为基准（from），
    // 输出在其 itemResult 中补充 inputType（to）；两态幂等。
    `      ue.info(\`[task=\${t}] 开始采集原始第 \${pgyItemIndex + 1} 条，当前 \${m + 1}/\${i.length} plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);
      if (pgyPending) {
        try {
          const v = await Le.get().consumeShumiaoForItem(e, m, pgyItemIndex);
          await pgyCollectionHistory.recordSuccess(t, pgyItemIndex, pgyPending.row, v, pgyPending.sourceUrl || f);
          l.successCount++, this.sendToRenderer(W.task.itemResult, {
            taskId: t,
            index: pgyItemIndex,
            status: "success",
            data: pgyPending.row,
            balanceAfter: v,
            recoveredPendingCharge: !0
          });
          continue;
        } catch (v) {
          pgyInterrupted = !0, this.sendToRenderer(W.task.error, {
            taskId: t,
            message: v instanceof Error ? v.message : String(v),
            errorCategory: "balance",
            errorCategoryLabel: "扣费确认失败"
          });
          break;
        }
      }
      try {`,
    `      ue.info(\`[task=\${t}] 开始采集原始第 \${pgyItemIndex + 1} 条，当前 \${m + 1}/\${i.length} plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);
      if (pgyPending) {
        try {
          const v = await Le.get().consumeShumiaoForItem(e, m, pgyItemIndex);
          await pgyCollectionHistory.recordSuccess(t, pgyItemIndex, pgyPending.row, v, pgyPending.sourceUrl || f);
          l.successCount++, this.sendToRenderer(W.task.itemResult, {
            taskId: t,
            inputType: l.inputType,
            index: pgyItemIndex,
            status: "success",
            data: pgyPending.row,
            balanceAfter: v,
            recoveredPendingCharge: !0
          });
          continue;
        } catch (v) {
          pgyInterrupted = !0, this.sendToRenderer(W.task.error, {
            taskId: t,
            message: v instanceof Error ? v.message : String(v),
            errorCategory: "balance",
            errorCategoryLabel: "扣费确认失败"
          });
          break;
        }
      }
      try {`,
    "reconcile pending charge before re-scraping",
  );
}

if (!main.includes("recordPendingCharge(t, pgyItemIndex")) {
  main = replaceOnce(
    main,
    `        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            C = x;
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);`,
    `        if (y.status === "success")
          try {
            await pgyCollectionHistory.recordPendingCharge(t, pgyItemIndex, y.data, f);
            const x = await Le.get().consumeShumiaoForItem(e, m, pgyItemIndex);
            C = x;
            await pgyCollectionHistory.recordSuccess(t, pgyItemIndex, y.data, x, f);
            ue.info(\`[task=\${t}] 单条积分扣减完成 originalIndex=\${pgyItemIndex + 1} balance=\${x}\`);`,
    "persist pending result before idempotent debit",
  );
  main = replaceOnce(
    main,
    `          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
          }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,`,
    `          } catch (x) {
            S = !0, pgyInterrupted = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
          }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status !== "success" && !S && await pgyCollectionHistory.recordFailure(t, pgyItemIndex, { errorCode: y.errorCode, errorMessage: y.errorMessage, errorCategory: b.code });
        b.code === "auth" && (pgyAuthExpired = !0);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: pgyItemIndex,`,
    "persist failures and emit original item index",
  );
  main = replaceOnce(
    main,
    `        if (S) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: y.errorMessage || "积分扣减失败，采集已停止",
            errorCategory: "balance",
            errorCategoryLabel: "积分不足"
          });
          break;
        }`,
    `        if (S) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: y.errorMessage || "积分扣减失败，采集已停止",
            errorCategory: "balance",
            errorCategoryLabel: "扣费失败"
          });
          break;
        }
        if (pgyAuthExpired) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: \`第 \${pgyItemIndex + 1} 条登录已过期，任务已停止，可重新授权后继续\`,
            errorCategory: "auth",
            errorCategoryLabel: "授权失效"
          });
          break;
        }`,
    "stop task immediately after authorization expiry",
  );
}

if (!main.includes("recordFailure(t, pgyItemIndex, { errorCode: \"UNKNOWN_ERROR\"")) {
  main = replaceOnce(
    main,
    `        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,`,
    `        ue.error(\`[task=\${t}] 采集原始第 \${pgyItemIndex + 1} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
        await pgyCollectionHistory.recordFailure(t, pgyItemIndex, { errorCode: "UNKNOWN_ERROR", errorMessage: v instanceof Error ? v.message : String(v), errorCategory: y.code });
        y.code === "auth" && (pgyAuthExpired = !0);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: pgyItemIndex,`,
    "persist thrown item failures",
  );
  main = replaceOnce(
    main,
    `          errorCategory: y.code,
          errorCategoryLabel: y.label
        });
      }
      const g = Math.round(l.current / l.total * 100);`,
    `          errorCategory: y.code,
          errorCategoryLabel: y.label
        });
        if (pgyAuthExpired) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: \`第 \${pgyItemIndex + 1} 条登录已过期，任务已停止，可重新授权后继续\`,
            errorCategory: "auth",
            errorCategoryLabel: "授权失效"
          });
          break;
        }
      }
      const g = Math.round(l.current / l.total * 100);`,
    "stop after thrown authorization failure",
  );
}

if (!main.includes("const pgyFinalStatus")) {
  main = replaceOnce(
    main,
    `    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;`,
    `    this.scrapeWindowManager.closeWindow(p);
    const pgyFinalStatus = l.cancelled ? "cancelled" : pgyAuthExpired ? "auth_expired" : pgyInterrupted ? "interrupted" : "completed";
    await pgyCollectionHistory.setStatus(t, pgyFinalStatus);
    const h = Date.now() - l.startTime;`,
    "finalize persistent collection task status",
  );
  main = replaceOnce(
    main,
    `      duration: h,
      cancelled: !0
    }) : (this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,
      errorCount: l.errorCount,
      duration: h
    }),`,
    `      duration: h,
      cancelled: !0,
      status: pgyFinalStatus
    }) : (this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,
      errorCount: l.errorCount,
      duration: h,
      status: pgyFinalStatus
    }),`,
    "emit persistent final task status",
  );
}

if (!main.includes('if (!u) {\n      await pgyCollectionHistory.setStatus(t, "interrupted");')) {
  main = replaceOnce(
    main,
    `    if (!u) {
      this.sendToRenderer(W.task.error, {`,
    `    if (!u) {
      await pgyCollectionHistory.setStatus(t, "interrupted");
      this.sendToRenderer(W.task.error, {`,
    "finalize unknown plugin task",
  );
}

if (!main.includes('if (!Array.isArray(i) || i.length === 0) {\n      await pgyCollectionHistory.setStatus(t, "cancelled");')) {
  main = replaceOnce(
    main,
    `    if (!Array.isArray(i) || i.length === 0) {
      this.sendToRenderer(W.task.error, {`,
    `    if (!Array.isArray(i) || i.length === 0) {
      await pgyCollectionHistory.setStatus(t, "cancelled");
      this.sendToRenderer(W.task.error, {`,
    "finalize empty collection task",
  );
}

if (!main.includes('if (existingTask) {\n      await pgyCollectionHistory.setStatus(t, "interrupted");')) {
  main = replaceOnce(
    main,
    `    if (existingTask) {
      this.sendToRenderer(W.task.error, {`,
    `    if (existingTask) {
      await pgyCollectionHistory.setStatus(t, "interrupted");
      this.sendToRenderer(W.task.error, {`,
    "finalize blocked collection task",
  );
}

// ===== Phase 4：蒲公英批量采集主进程/preload 接线（可复现构建，全部幂等）=====
// 仅在已有 Phase 1 只读 bridge 的运行时上扩展批量能力。旧版日常图运行时
// 没有找博主入口，仍须能独立完成图表升级，不能因缺少批量桥接锚点而失败。
if (preload.includes('previewPayload:e=>r.ipcRenderer.invoke("pgy-kol:payload-preview",e)')) {
// preload：pgyKol bridge 追加批量通道与事件订阅（to 已存在则跳过）。
if (!preload.includes('"pgy-kol:batch-start"')) {
  preload = replaceOnce(
    preload,
    'previewPayload:e=>r.ipcRenderer.invoke("pgy-kol:payload-preview",e)}});',
    'previewPayload:e=>r.ipcRenderer.invoke("pgy-kol:payload-preview",e),batchStart:e=>r.ipcRenderer.invoke("pgy-kol:batch-start",e),batchList:()=>r.ipcRenderer.invoke("pgy-kol:batch-list"),batchGet:e=>r.ipcRenderer.invoke("pgy-kol:batch-get",e),batchPause:e=>r.ipcRenderer.invoke("pgy-kol:batch-pause",e),batchResume:e=>r.ipcRenderer.invoke("pgy-kol:batch-resume",e),batchCancel:e=>r.ipcRenderer.invoke("pgy-kol:batch-cancel",e),batchExport:e=>r.ipcRenderer.invoke("pgy-kol:batch-export",e),getColumns:()=>r.ipcRenderer.invoke("pgy-kol:columns"),onBatchEvent:e=>{const n=(a,t)=>e(t);return r.ipcRenderer.on("pgy-kol:batch-event",n),()=>r.ipcRenderer.removeListener("pgy-kol:batch-event",n)}}});',
    "pgy-kol Phase 4 preload bridge methods",
  );
}
// main：redactLocalPathText import（Excel 导出日志脱敏依赖，先于导出替换步骤生效）。
if (!main.includes("redactLocalPathText as pgyRedactLocalPath")) {
  main = replaceOnce(
    main,
    'import { createPgyKolService, registerPgyKolIpc } from "../pgy-kol/pgy-kol-service.mjs";',
    'import { createPgyKolService, registerPgyKolIpc } from "../pgy-kol/pgy-kol-service.mjs";\nimport { redactLocalPathText as pgyRedactLocalPath } from "../pgy-kol/pgy-session-request.mjs";',
    "pgy-kol Phase 4 redactLocalPathText import",
  );
}
// main：批量任务存储目录与 Excel 导出器接线。
if (!main.includes('taskBaseDir: Oe(ye.getPath("userData"), "pgy-kol-tasks")')) {
  main = replaceOnce(
    main,
    'baseDir: Oe(ye.getPath("userData"), "pgy-kol-schema"),',
    'baseDir: Oe(ye.getPath("userData"), "pgy-kol-schema"),\n      taskBaseDir: Oe(ye.getPath("userData"), "pgy-kol-tasks"),\n      exporter: (payload) => ff(payload),',
    "pgy-kol Phase 4 task store and exporter wiring",
  );
}
// main：批量任务事件广播接线（BrowserWindow.getAllWindows → webContents.send）。
if (!main.includes("broadcast: (channel, payload) => Dt.getAllWindows()")) {
  main = replaceOnce(
    main,
    'pgyKolIpcDispose = registerPgyKolIpc({ ipcMain: F, service: pgyKolService });',
    'pgyKolIpcDispose = registerPgyKolIpc({\n      ipcMain: F,\n      service: pgyKolService,\n      broadcast: (channel, payload) => Dt.getAllWindows().forEach((window) => window.webContents.send(channel, payload))\n    });',
    "pgy-kol Phase 4 batch event broadcast wiring",
  );
}

// ===== Phase 5.1：preload pgyKol bridge 暴露 schema-fields（前端单一 Schema 来源）=====
if (!preload.includes('getSchemaFields:()=>r.ipcRenderer.invoke("pgy-kol:schema-fields")')) {
  preload = replaceOnce(
    preload,
    'onBatchEvent:e=>{const n=(a,t)=>e(t);return r.ipcRenderer.on("pgy-kol:batch-event",n),()=>r.ipcRenderer.removeListener("pgy-kol:batch-event",n)}}});',
    'onBatchEvent:e=>{const n=(a,t)=>e(t);return r.ipcRenderer.on("pgy-kol:batch-event",n),()=>r.ipcRenderer.removeListener("pgy-kol:batch-event",n)},getSchemaFields:()=>r.ipcRenderer.invoke("pgy-kol:schema-fields")}});',
    "pgy-kol Phase 5.1 preload schema-fields bridge method",
  );
}

// ===== 找博主“一次完整采集”（search-batch 单任务收敛）=====
// 以上补丁均为幂等：目标状态已存在时 replaceOnce 直接返回原文，重复执行无副作用。

// 1) 导入 isCollectionTaskExportReady（导出完成门闸）。
main = replaceOnce(
  main,
  'import { CollectionHistoryStore } from "../electron-main/collection-history-store.mjs";',
  'import { CollectionHistoryStore, isCollectionTaskExportReady } from "../electron-main/collection-history-store.mjs";',
  "collection history store import carries export gate",
);

// 2) ge.startTask 的任务记录携带 inputType（导出门闸按来源识别 search-batch）。
main = replaceOnce(
  main,
  `      fields: r,
      current: 0,`,
  `      fields: r,
      inputType: e.inputType || "",
      current: 0,`,
  "startTask record carries inputType",
);

// 3) 运行中任务事件携带 inputType（progress/itemResult/complete，共 5 处 +
// reconcile 块 1 处已在上方 reconcile 补丁内处理）。
main = replaceOnce(
  main,
  `      l.current = m + 1;
      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,`,
  `      l.current = m + 1;
      this.sendToRenderer(W.task.progress, {
        taskId: t,
        inputType: l.inputType,
        current: l.current,`,
  "progress event carries inputType",
);
main = replaceOnce(
  main,
  `        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: pgyItemIndex,
          status: y.status,`,
  `        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          inputType: l.inputType,
          index: pgyItemIndex,
          status: y.status,`,
  "itemResult event carries inputType",
);
main = replaceOnce(
  main,
  `        y && this.sendToRenderer(W.task.progress, {
          taskId: t,
          current: l.current,
          total: l.total,
          percent: g,`,
  `        y && this.sendToRenderer(W.task.progress, {
          taskId: t,
          inputType: l.inputType,
          current: l.current,
          total: l.total,
          percent: g,`,
  "batch progress event carries inputType",
);
main = replaceOnce(
  main,
  `    l.cancelled ? this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,`,
  `    l.cancelled ? this.sendToRenderer(W.task.complete, {
      taskId: t,
      inputType: l.inputType,
      successCount: l.successCount,`,
  "complete event carries inputType",
);
main = replaceOnce(
  main,
  `    }) : (this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,`,
  `    }) : (this.sendToRenderer(W.task.complete, {
      taskId: t,
      inputType: l.inputType,
      successCount: l.successCount,`,
  "complete cancelled event carries inputType",
);

// 4) 采集助手按钮（scraper:task:pause/resume/cancel）转发到 pgy-kol 编排，
// 让“准备博主列表”阶段也能响应暂停/继续/取消。
main = replaceOnce(
  main,
  `  }), F.on(W.task.pause, (e, t) => {
    ge.pauseTask(t.taskId);
  }), F.on(W.task.resume, (e, t) => {
    ge.resumeTask(t.taskId);
  }), F.on(W.task.cancel, (e, t) => {
    ge.cancelTask(t.taskId);
  }), F.handle(W.export.toExcel`,
  `  }), F.on(W.task.pause, (e, t) => {
    ge.pauseTask(t.taskId);
    pgyKolService && pgyKolService.forwardScraperTaskControl && pgyKolService.forwardScraperTaskControl(t.taskId, "pause").catch(() => {});
  }), F.on(W.task.resume, (e, t) => {
    ge.resumeTask(t.taskId);
    pgyKolService && pgyKolService.forwardScraperTaskControl && pgyKolService.forwardScraperTaskControl(t.taskId, "resume").catch(() => {});
  }), F.on(W.task.cancel, (e, t) => {
    ge.cancelTask(t.taskId);
    pgyKolService && pgyKolService.forwardScraperTaskControl && pgyKolService.forwardScraperTaskControl(t.taskId, "cancel").catch(() => {});
  }), F.handle(W.export.toExcel`,
  "scraper task controls forward to pgy-kol orchestration",
);

// 5) pgy-kol 编排服务提升为模块级（供事件转发引用）并接线详情采集依赖。
main = replaceOnce(
  main,
  `let ge = null;
let pgyKolIpcDispose = null;`,
  `let ge = null;
let pgyKolService = null;
let pgyKolIpcDispose = null;`,
  "module-level pgyKolService holder",
);
main = replaceOnce(
  main,
  "const pgyKolService = createPgyKolService({",
  "pgyKolService = createPgyKolService({",
  "pgyKolService uses module-level holder",
);
// 基线 bundle（1.2.0 发布）已含旧版 detail deps，仅在完全没有 detail 注入时
// （更早的原始 bundle）才执行本补丁；幂等守卫用注入注释做标记。
if (!main.includes("两阶段采集：详情阶段复用现有 pgy/blogger")) {
  main = replaceOnce(
    main,
    `      exporter: (payload) => ff(payload),
      logger: {`,
    `      exporter: (payload) => ff(payload),
      // 两阶段采集：详情阶段复用现有 pgy/blogger 详情采集器（同一 CollectionHistoryStore
      // 与 ScraperOrchestrator），不复制其请求/字段解析/图表/导出逻辑。
      detail: {
        initialize: () => pgyCollectionHistory.initialize(),
        create: (payload) => pgyCollectionHistory.createTask(payload),
        updateUrls: (taskId, urls) => pgyCollectionHistory.updateTaskUrls(taskId, urls),
        emit: (type, payload) => {
          const channel = W.task[type];
          if (channel) ge.sendToRenderer(channel, payload);
        },
        start: (payload) => pgyCollectionHistory.createTask(payload).then(async () => {
          const live = await pgyCollectionHistory.getTask(payload.taskId);
          if (!live || live.status !== "running") return;
          return ge.startTask(payload);
        }),
        pause: (taskId) => ge.pauseTask(taskId),
        resume: (taskId) => ge.resumeTask(taskId),
        cancel: (taskId) => ge.cancelTask(taskId),
        getTask: (taskId) => pgyCollectionHistory.getTask(taskId),
        getExportRows: (taskId) => pgyCollectionHistory.getExportRows(taskId),
        getResumePlan: (taskId) => pgyCollectionHistory.getResumePlan(taskId),
        setStatus: (taskId, status) => pgyCollectionHistory.setStatus(taskId, status),
      },
      logger: {`,
    "pgy-kol detail collection dependency wiring",
  );
}
// 已注入旧版 detail.start 的增量迁移：启动前复核持久状态，关闭
// “取消与首次 feed 并发后仍调用 ge.startTask”这一复活窗口。
main = replaceAllIfExists(
  main,
  "        start: (payload) => pgyCollectionHistory.createTask(payload).then(() => ge.startTask(payload)),",
  `        start: (payload) => pgyCollectionHistory.createTask(payload).then(async () => {
          const live = await pgyCollectionHistory.getTask(payload.taskId);
          if (!live || live.status !== "running") return;
          return ge.startTask(payload);
        }),`,
);
// 5a) 流式采集：detail 依赖补充动态队列能力（追加目标列表 / 标记发现收口）。
//     基线 bundle（1.2.0 发布）已含旧版 detail deps，本补丁在其上增量添加。
main = replaceOnce(
  main,
  `        create: (payload) => pgyCollectionHistory.createTask(payload),
        updateUrls: (taskId, urls) => pgyCollectionHistory.updateTaskUrls(taskId, urls),
        emit: (type, payload) => {`,
  `        create: (payload) => pgyCollectionHistory.createTask(payload),
        updateUrls: (taskId, urls) => pgyCollectionHistory.updateTaskUrls(taskId, urls),
        appendTaskUrls: (taskId, urls) => pgyCollectionHistory.appendTaskUrls(taskId, urls),
        setDiscoveryClosed: (taskId) => pgyCollectionHistory.setDiscoveryClosed(taskId),
        emit: (type, payload) => {`,
  "detail deps carry streaming queue methods",
);
main = replaceOnce(
  main,
  `      }
    });
    pgyKolIpcDispose = registerPgyKolIpc({`,
  `      }
    });
    pgyKolService.initialize().catch((err) => {
      Qe.error("[pgy-kol] 两阶段编排初始化失败:", err);
    });
    pgyKolIpcDispose = registerPgyKolIpc({`,
  "pgy-kol orchestration initialize on app ready",
);

// 5b) 边发现边采集：详情任务循环以“完整队列 + 终态跳过 + 队列耗尽等待”运行。
//     search-batch 任务每次迭代从历史存储刷新目标列表（动态追加的 UID 自动续采，
//     total 同步更新），跳过已成功/已失败项（重启恢复不重抓不重扣），
//     discoveryClosed 后队列耗尽即正常结束。
// 先迁移早期版本：它直接给 bundle 解构得到的 const `i` 重新赋值，真实运行
// 会抛 Assignment to constant variable。恢复原循环锚点后再应用可变队列版本。
main = replaceAllIfExists(
  main,
  `    let pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []);
    for (let m = 0; await (async () => { while (m < i.length && pgyTerminal.has(pgySourceIndexes[m] ?? m)) { l.current = m + 1; m += 1; } if (m < i.length) return !0; if (l.cancelled) return !1; if (l.paused) { await this.waitForResume(l); if (l.cancelled) return !1; } const live = await pgyCollectionHistory.getTask(t).catch(() => null); if (!live || live.inputType !== "search-batch" || live.discoveryClosed === true) return !1; if (Array.isArray(live.urls) && live.urls.length > i.length) { i = live.urls.map((u) => String(u ?? "")); pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []); l.total = Number.isFinite(live.total) ? live.total : i.length; } await new Promise((r) => setTimeout(r, 500)); return !0; })(); m++) {`,
  `    for (let m = 0; m < i.length && !(l.cancelled || l.paused && (await this.waitForResume(l), l.cancelled)); m++) {`,
);
main = replaceAllIfExists(
  main,
  `    let pgyUrls = i.map((u) => String(u ?? ""));
    let pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []);
    for (let m = 0; await (async () => { while (m < pgyUrls.length && pgyTerminal.has(pgySourceIndexes[m] ?? m)) { l.current = m + 1; m += 1; } if (m < pgyUrls.length) return !0; if (l.cancelled) return !1; if (l.paused) { await this.waitForResume(l); if (l.cancelled) return !1; } const live = await pgyCollectionHistory.getTask(t).catch(() => null); if (!live || live.inputType !== "search-batch" || live.discoveryClosed === true) return !1; if (Array.isArray(live.urls) && live.urls.length > pgyUrls.length) { pgyUrls = live.urls.map((u) => String(u ?? "")); pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []); l.total = Number.isFinite(live.total) ? live.total : pgyUrls.length; } await new Promise((r) => setTimeout(r, 500)); return !0; })(); m++) {`,
  `    for (let m = 0; m < i.length && !(l.cancelled || l.paused && (await this.waitForResume(l), l.cancelled)); m++) {`,
);
main = replaceAllIfExists(
  main,
  `    let pgyUrls = i.map((u) => String(u ?? ""));
    let pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []);
    for (let m = 0; await (async () => { if (l.cancelled) return !1; if (l.paused) { await this.waitForResume(l); if (l.cancelled) return !1; } while (m < pgyUrls.length && pgyTerminal.has(pgySourceIndexes[m] ?? m)) { l.current = m + 1; m += 1; } if (m < pgyUrls.length) return !0; const live = await pgyCollectionHistory.getTask(t).catch(() => null); if (!live || live.inputType !== "search-batch" || live.discoveryClosed === true) return !1; if (Array.isArray(live.urls) && live.urls.length > pgyUrls.length) { pgyUrls = live.urls.map((u) => String(u ?? "")); pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []); l.total = Number.isFinite(live.total) ? live.total : pgyUrls.length; } await new Promise((r) => setTimeout(r, 500)); return !0; })(); m++) {`,
  `    for (let m = 0; m < i.length && !(l.cancelled || l.paused && (await this.waitForResume(l), l.cancelled)); m++) {`,
);
main = replaceOnce(
  main,
  `    for (let m = 0; m < i.length && !(l.cancelled || l.paused && (await this.waitForResume(l), l.cancelled)); m++) {`,
  `    let pgyUrls = i.map((u) => String(u ?? ""));
    let pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []);
    for (let m = 0; await (async () => { for (;;) { if (l.cancelled) return !1; if (l.paused) { await this.waitForResume(l); if (l.cancelled) return !1; } while (m < pgyUrls.length && pgyTerminal.has(pgySourceIndexes[m] ?? m)) { l.current = m + 1; m += 1; } if (m < pgyUrls.length) return !0; const live = await pgyCollectionHistory.getTask(t).catch(() => null); if (!live || live.inputType !== "search-batch") return !1; if (Array.isArray(live.urls) && live.urls.length > pgyUrls.length) { pgyUrls = live.urls.map((u) => String(u ?? "")); pgyTerminal = new Set((await pgyCollectionHistory.getTerminalIndexes(t).catch(() => [])) || []); l.total = Number.isFinite(live.total) ? live.total : pgyUrls.length; continue; } if (live.discoveryClosed === true) return !1; await new Promise((r) => setTimeout(r, 500)); } })(); m++) {`,
  "scraper loop streams dynamic search-batch queue with terminal skip",
);
main = replaceOnce(
  main,
  `      const f = i[m], pgyItemIndex = pgySourceIndexes[m] ?? m, pgyPending = pgyPendingCharges.get(pgyItemIndex);`,
  `      const f = pgyUrls[m], pgyItemIndex = pgySourceIndexes[m] ?? m, pgyPending = pgyPendingCharges.get(pgyItemIndex);`,
  "scraper loop reads the mutable streaming queue",
);
main = replaceOnce(
  main,
  `      ue.info(\`[task=\${t}] 开始采集原始第 \${pgyItemIndex + 1} 条，当前 \${m + 1}/\${i.length} plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);`,
  `      ue.info(\`[task=\${t}] 开始采集原始第 \${pgyItemIndex + 1} 条，当前 \${m + 1}/\${pgyUrls.length} plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);`,
  "scraper loop start log uses the streaming queue length",
);
main = replaceOnce(
  main,
  `        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);`,
  `        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${pgyUrls.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);`,
  "scraper loop completion log uses the streaming queue length",
);
main = replaceOnce(
  main,
  `      if (m < i.length - 1 && !l.cancelled) {`,
  `      if (m < pgyUrls.length - 1 && !l.cancelled) {`,
  "scraper loop pacing uses the streaming queue length",
);

// 6) 历史导出 IPC 完成门闸（release bundle 自带 exportTask handler）。
main = replaceOnce(
  main,
  `    const n = await pgyCollectionHistory.getTask(t.taskId), s = await pgyCollectionHistory.getExportRows(t.taskId);
    if (!n)
      throw new Error("历史任务不存在");
    if (s.length === 0)`,
  `    const n = await pgyCollectionHistory.getTask(t.taskId), s = await pgyCollectionHistory.getExportRows(t.taskId);
    if (!n)
      throw new Error("历史任务不存在");
    if (!isCollectionTaskExportReady(n)) {
      const gateError = new Error("任务尚未完成全部博主采集，暂不可导出（完成后自动解锁）");
      gateError.kind = "task-not-complete";
      throw gateError;
    }
    if (s.length === 0)`,
  "history export task completion gate",
);

// 6) 导出对话框纵深门闸：search-batch 来源任务未完成时拒绝导出。
// 运行时文件已带门闸时允许无变更通过，保证本地候选包可重复构建。
main = replaceAllIfExists(
  main,
  `async function ff(a) {
  const pausedTask = typeof (a == null ? void 0 : a.taskId) == "string" ? ge == null ? void 0 : ge.runningTasks.get(a.taskId) : null;`,
  `async function ff(a) {
  // 找博主筛选来源（search-batch）的任务：只有完成且计数收口才允许导出；
  // 纵深防御，防止 running/preparing 时导出只有部分行的 Excel。
  if (typeof (a == null ? void 0 : a.taskId) === "string" && a.taskId.startsWith("pgykol-detail-")) {
    const gateTask = await pgyCollectionHistory.getTask(a.taskId).catch(() => null);
    if (gateTask && gateTask.inputType === "search-batch" && !isCollectionTaskExportReady(gateTask)) {
      const gateError = new Error("任务尚未完成全部博主采集，暂不可导出（完成后自动解锁）");
      gateError.kind = "task-not-complete";
      throw gateError;
    }
  }
  const pausedTask = typeof (a == null ? void 0 : a.taskId) == "string" ? ge == null ? void 0 : ge.runningTasks.get(a.taskId) : null;`,
    "export dialog rejects incomplete search-batch tasks",
);
}
// 手动输入页面会直接调用 scraper:export:to-excel；这条路径此前把前端缓存的
// 19 列 payload 直接交给 ff，即使 collection-history 已保存图片路径也会丢列。
// 对带 taskId 的蒲公英笔记导出，强制以持久化任务 + 成功结果重建规范 payload。
if (!main.includes("pgy notebook direct export canonical payload")) {
  main = replaceOnce(
    main,
    `async function ff(a) {
  // 找博主筛选来源（search-batch）的任务：只有完成且计数收口才允许导出；`,
    `async function ff(a) {
  // pgy notebook direct export canonical payload: 前端缓存可能遗漏 coverImage/noteImages，
  // 但主进程历史任务保存了完整字段和已下载的本地图片路径，必须以它为准写 Excel。
  if (typeof (a == null ? void 0 : a.taskId) === "string") {
    const pgyHistoryTask = await pgyCollectionHistory.getTask(a.taskId).catch(() => null);
    if (pgyHistoryTask && pgyHistoryTask.pluginId === "pgy" && pgyHistoryTask.taskType === "notebook") {
      const pgyHistoryRows = await pgyCollectionHistory.getExportRows(a.taskId).catch(() => []);
      if (Array.isArray(pgyHistoryRows) && pgyHistoryRows.length > 0)
        a = buildCollectionHistoryExportPayload(pgyHistoryTask, pgyHistoryRows);
    }
  }
  // 找博主筛选来源（search-batch）的任务：只有完成且计数收口才允许导出；`,
    "canonicalize direct pgy notebook export from collection history",
  );
}

main = replaceSection(
  main,
  "const PGY_PYTHON_CHART_SCRIPT = String.raw`",
  "function pgyChartRendererCandidates()",
  `const PGY_PYTHON_CHART_SCRIPT = String.raw\`
${chartRendererSource}
\`;`,
  "pgy complete Python chart renderer synchronization",
);

if (!main.includes("function pgyChinaGeoJsonPath()")) {
  main = replaceOnce(
    main,
    `function pgySpawnChartRenderer(a, e, t) {`,
    `function pgyChinaGeoJsonPath() {
  const a = [
    process.env.PGY_CHINA_GEOJSON_PATH,
    process.resourcesPath ? Oe(process.resourcesPath, "app.asar", "dist-electron", "static", "china-provinces.geojson") : "",
    process.resourcesPath ? Oe(process.resourcesPath, "dist-electron", "static", "china-provinces.geojson") : "",
    Oe(process.cwd(), "app-source", "dist-electron", "static", "china-provinces.geojson"),
    Oe(process.cwd(), "dist-electron", "static", "china-provinces.geojson")
  ];
  return a.find((e) => e && kt(e)) || "";
}
function pgyChartRendererEnv() {
  const a = { ...process.env }, e = pgyChinaGeoJsonPath();
  return e && (a.PGY_CHINA_GEOJSON_PATH = e), a;
}
function pgySpawnChartRenderer(a, e, t) {`,
    "pgy region GeoJSON resolver",
  );
  main = replaceOnce(
    main,
    `      stdio: ["pipe", "pipe", "pipe"]
    }), u = (p) => {`,
    `      stdio: ["pipe", "pipe", "pipe"],
      env: pgyChartRendererEnv()
    }), u = (p) => {`,
    "pgy bundled renderer GeoJSON environment",
  );
  main = replaceOnce(
    main,
    `      stdio: ["pipe", "pipe", "pipe"]
    }), l = (h) => {`,
    `      stdio: ["pipe", "pipe", "pipe"],
      env: pgyChartRendererEnv()
    }), l = (h) => {`,
    "pgy Python renderer GeoJSON environment",
  );
}

if (!main.includes('data: { mode: "province", provinceRows: pgyProvinceRows')) {
  main = replaceOnce(
    main,
    `  const s = {}, i = [];
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.province)) {
    const o = pgyTopPercentRows(e.provinces);
    o.length && i.push({ field: "fansProvinceChart", type: "bar", title: "粉丝地域分布", rows: o, output: pgyChartFile("province", a, "province") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.city)) {
    const o = pgyTopPercentRows(e.cities);
    o.length && i.push({ field: "fansCityChart", type: "bar", title: "粉丝城市分布", rows: o, output: pgyChartFile("city", a, "city") });
  }`,
    `  const s = {}, i = [];
  const pgyProvinceRows = pgyTopPercentRows(e.provinces), pgyCityRows = pgyTopPercentRows(e.cities);
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.province)) {
    pgyProvinceRows.length && i.push({ field: "fansProvinceChart", type: "region-distribution", data: { mode: "province", provinceRows: pgyProvinceRows, cityRows: pgyCityRows }, output: pgyChartFile("province", a, "province") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.city)) {
    pgyCityRows.length && i.push({ field: "fansCityChart", type: "region-distribution", data: { mode: "city", provinceRows: pgyProvinceRows, cityRows: pgyCityRows }, output: pgyChartFile("city", a, "city") });
  }`,
    "pgy province and city region distribution jobs",
  );
}

if (!main.includes('o.type === "region-distribution" ? r = pgyWriteBarChartPng')) {
  main = replaceOnce(
    main,
    `o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "gender"`,
    `o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "region-distribution" ? r = pgyWriteBarChartPng((o.data == null ? void 0 : o.data.mode) === "city" ? o.data.cityRows ?? [] : o.data.provinceRows ?? [], o.output) : o.type === "gender"`,
    "pgy region distribution JS fallback",
  );
}

if (!main.includes('field: "fansAgeChart", type: "age-distribution"')) {
  main = replaceOnce(
    main,
    `o.length && i.push({ field: "fansAgeChart", type: "bar", title: "粉丝年龄分布", rows: o, output: pgyChartFile("age", a, "age") });`,
    `o.length && i.push({ field: "fansAgeChart", type: "age-distribution", rows: o, output: pgyChartFile("age", a, "age") });`,
    "pgy age distribution reference layout job",
  );
}

if (!main.includes('o.type === "age-distribution" ? r = pgyWriteBarChartPng')) {
  main = replaceOnce(
    main,
    `o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "region-distribution"`,
    `o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "age-distribution" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "region-distribution"`,
    "pgy age distribution JS fallback",
  );
}

if (!main.includes('fansGenderAgeChart: ["fansGenderAgeChart"]')) {
  main = replaceOnce(
    main,
    `  fansGenderChart: ["fansGenderChart"],`,
    `  fansGenderChart: ["fansGenderChart"],
  fansGenderAgeChart: ["fansGenderAgeChart"],`,
    "pgy combined gender-age dependency mapping",
  );
}

if (
  !main.includes('"fansGenderChart",\n    "fansGenderAgeChart"') &&
  !main.includes('"fansGenderChart",\r\n    "fansGenderAgeChart"')
) {
  main = replaceOnce(
    main,
    `    "fansAgeChart",
    "fansGenderChart"`,
    `    "fansAgeChart",
    "fansGenderChart",
    "fansGenderAgeChart"`,
    "pgy combined gender-age fans profile dependency",
  );
}

if (!main.includes('genderAge: "fansGenderAgeChart"')) {
  main = replaceOnce(
    main,
    `  age: "fansAgeChart",
  gender: "fansGenderChart",`,
    `  age: "fansAgeChart",
  gender: "fansGenderChart",
  genderAge: "fansGenderAgeChart",`,
    "pgy combined gender-age chart field",
  );
}

if (!main.includes('field: "fansGenderAgeChart", type: "gender-age-distribution"')) {
  main = replaceOnce(
    main,
    `  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.gender)) {
    const o = e.gender ?? {};
    pgyPct(o.female) + pgyPct(o.male) > 0 && i.push({ field: "fansGenderChart", type: "gender", data: o, output: pgyChartFile("gender", a, "gender") });
  }`,
    `  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.gender)) {
    const o = e.gender ?? {};
    pgyPct(o.female) + pgyPct(o.male) > 0 && i.push({ field: "fansGenderChart", type: "gender", data: o, output: pgyChartFile("gender", a, "gender") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.genderAge)) {
    const o = pgyAgeRows(e.ages), r = e.gender ?? {};
    o.length && pgyPct(r.female) + pgyPct(r.male) > 0 && i.push({ field: "fansGenderAgeChart", type: "gender-age-distribution", data: { rows: o, gender: r }, output: pgyChartFile("gender-age", a, "gender-age") });
  }`,
    "pgy combined gender-age chart job",
  );
}

if (!main.includes('o.type === "gender-age-distribution" ? r = pgyWriteBarChartPng')) {
  main = replaceOnce(
    main,
    `o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "trend"`,
    `o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "gender-age-distribution" ? r = pgyWriteBarChartPng(o.data?.rows ?? [], o.output) : o.type === "trend"`,
    "pgy combined gender-age JS fallback",
  );
}

if (!main.includes('r = pgyWriteSvgPng(pgyTrendChartSvg(o.rows ?? []), o.output)')) {
  main = replaceOnce(
    main,
    'o.type === "trend" ? r = pgyWriteTrendChartPng(o.rows ?? [], o.output)',
    'o.type === "trend" ? r = pgyWriteSvgPng(pgyTrendChartSvg(o.rows ?? []), o.output)',
    "pgy trend SVG fallback wiring",
  );
}

fs.mkdirSync(path.dirname(chinaGeoJsonTargetPath), { recursive: true });
fs.copyFileSync(chinaGeoJsonSourcePath, chinaGeoJsonTargetPath);

if (!main.includes("const PGY_OVERVIEW_ICON_FILES = {")) {
  main = replaceOnce(
    main,
    "const PGY_OVERVIEW_SHIELD_PNG = {",
    `const PGY_OVERVIEW_ICON_FILES = {
  health: "health.png",
  healthRisk: "health-risk.png",
  flyable: "flyable.png",
  cooperationPrice: "cooperation-price.jpg",
  location: "location.png",
  copy: "copy.jpg",
  genderFemale: "gender-female.png",
  genderMale: "gender-male.png",
  growth: "growth.png",
  favorite: "favorite.png",
  service: "service.png",
  organization: "organization.png",
  notes: "notes.png",
  invite: "invite.png"
};

const PGY_OVERVIEW_SHIELD_PNG = {`,
    "pgy overview icon file mapping",
  );
}

if (!main.includes("function pgyLoadOverviewIconImages()")) {
  main = replaceOnce(
    main,
    "async function pgyPrepareOverviewData(a) {",
    `function pgyLoadOverviewIconImages() {
  if (typeof PgyNativeImage === "undefined" || typeof Oe !== "function") return {};
  const roots = [];
  if (process.resourcesPath) {
    roots.push(Oe(process.resourcesPath, "app.asar", "dist-electron", "static", "overview-icons"));
    roots.push(Oe(process.resourcesPath, "app.asar.unpacked", "dist-electron", "static", "overview-icons"));
    roots.push(Oe(process.resourcesPath, "dist-electron", "static", "overview-icons"));
  }
  roots.push(Oe(process.cwd(), "app-source", "dist-electron", "static", "overview-icons"));
  roots.push(Oe(process.cwd(), "dist-electron", "static", "overview-icons"));
  const output = {};
  for (const [key, fileName] of Object.entries(PGY_OVERVIEW_ICON_FILES)) {
    for (const root of roots) {
      try {
        const icon = PgyNativeImage.createFromPath(Oe(root, fileName));
        if (!icon.isEmpty()) {
          output[key] = icon.toDataURL();
          break;
        }
      } catch {
      }
    }
  }
  return output;
}

async function pgyPrepareOverviewData(a) {`,
    "pgy overview icon data URL loader",
  );
  main = replaceOnce(
    main,
    "return e.avatar = await pgyInlineOverviewAvatar(e.avatar), e.nicknameEmojiImages = await pgyInlineOverviewEmojis(e.nickname), e;",
    "return e.avatar = await pgyInlineOverviewAvatar(e.avatar), e.nicknameEmojiImages = await pgyInlineOverviewEmojis(e.nickname), e.overviewIconImages = pgyLoadOverviewIconImages(), e;",
    "pgy overview icon data wiring",
  );
}

if (!main.includes("s = {}) {") && !main.includes("const source = risk ? s.healthRisk")) {
  main = replaceOnce(
    main,
    `function pgyOverviewShieldSvg(a, e, t) {
  const n = Number(a) === 2 ? PGY_OVERVIEW_SHIELD_PNG[2] : PGY_OVERVIEW_SHIELD_PNG[0];
  return \`<image href="\${n}" x="\${e - 11}" y="\${t - 11}" width="22" height="22" preserveAspectRatio="xMidYMid meet"/>\`;
}`,
    `function pgyOverviewShieldSvg(a, e, t, s = {}) {
  const risk = Number(a) !== 2;
  const source = risk ? s.healthRisk || PGY_OVERVIEW_SHIELD_PNG[0] : s.health || PGY_OVERVIEW_SHIELD_PNG[2];
  return \`<image href="\${source}" x="\${e}" y="\${t}" width="16" height="16" preserveAspectRatio="xMidYMid meet"/>\`;
}`,
    "pgy overview health shield three-state icons",
  );
}

if (!fs.existsSync(overviewIconsSourcePath)) {
  throw new Error(`Missing overview icon assets: ${overviewIconsSourcePath}`);
}
fs.mkdirSync(overviewIconsTargetPath, { recursive: true });
for (const name of fs.readdirSync(overviewIconsSourcePath)) {
  const source = path.join(overviewIconsSourcePath, name);
  const target = path.join(overviewIconsTargetPath, name);
  fs.copyFileSync(source, target);
}

// 防卡死：内置绘图失败后，JS 兜底不再同步渲染 SVG 类图表（nativeImage 栅格化可能
// 无限期阻塞主进程事件循环，导致任务永远停在采集中），只对像素类图表逐张 try/catch
// 并输出进度日志；同时 exe 超时错误附带已捕获的 stderr，便于下次定位真实根因。
main = replaceOnce(
  main,
  '      u(new Error(`chart renderer timeout after ${t}ms`));',
  '      u(new Error(`chart renderer timeout after ${t}ms${o ? `; stderr: ${o.slice(0, 1200)}` : ""}`));',
  "pgy chart renderer timeout error includes stderr",
);
main = replaceOnce(
  main,
  '      o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "age-distribution" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "region-distribution" ? r = pgyWriteBarChartPng((o.data == null ? void 0 : o.data.mode) === "city" ? o.data.cityRows ?? [] : o.data.provinceRows ?? [], o.output) : o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "gender-age-distribution" ? r = pgyWriteBarChartPng(o.data?.rows ?? [], o.output) : o.type === "trend" ? r = pgyWriteSvgPng(pgyTrendChartSvg(o.rows ?? []), o.output) : o.type === "daily-note-performance" ? r = pgyWriteSvgPng(pgyDailyNotePerformanceSvg(o.data ?? {}), o.output) : o.type === "blogger-overview" && (r = pgyWriteSvgPng(pgyBloggerOverviewSvg(o.data ?? {}), o.output)), r && (s[o.field] = r);',
  '      try {\n        if (o.type === "trend" || o.type === "daily-note-performance" || o.type === "blogger-overview") {\n          j.warn(`[pgy-chart] 跳过 JS 兜底 SVG 渲染，避免阻塞主进程: field=${o.field}, type=${o.type}`);\n        } else {\n          o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "age-distribution" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "region-distribution" ? r = pgyWriteBarChartPng((o.data == null ? void 0 : o.data.mode) === "city" ? o.data.cityRows ?? [] : o.data.provinceRows ?? [], o.output) : o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "gender-age-distribution" ? r = pgyWriteBarChartPng(o.data?.rows ?? [], o.output) : o.type === "trend" ? r = pgyWriteSvgPng(pgyTrendChartSvg(o.rows ?? []), o.output) : o.type === "daily-note-performance" ? r = pgyWriteSvgPng(pgyDailyNotePerformanceSvg(o.data ?? {}), o.output) : o.type === "blogger-overview" && (r = pgyWriteSvgPng(pgyBloggerOverviewSvg(o.data ?? {}), o.output));\n        }\n      } catch (err) {\n        j.warn(`[pgy-chart] JS 兜底渲染失败: field=${o.field}, type=${o.type}, error=${err instanceof Error ? err.message : String(err)}`);\n      }\n      r && (s[o.field] = r);\n      j.info(`[pgy-chart] JS 兜底进度: ${Object.keys(s).length}/${i.length}, field=${o.field}, ok=${Boolean(r)}`);',
  "pgy JS fallback anti-freeze",
);

// Python 兜底不再用 `python -c <内嵌脚本>`（Windows 命令行超长必然 ENAMETOOLONG）：
// 把内嵌绘图脚本写入临时文件再 `python <tempfile>` 执行，让 exe 失败后仍能出图。
main = replaceOnce(
  main,
  '  return new Promise((s, i) => {\n    let o = "", r = "", c = !1;\n    const u = Tr(a, [...e, "-c", PGY_PYTHON_CHART_SCRIPT], {',
  '  return new Promise((s, i) => {\n    let o = "", r = "", c = !1, z = "";\n    try {\n      const q = process.env.TEMP || process.env.TMP || ".";\n      z = Oe(q, `magiorix-pychart-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);\n      Zi(z, PGY_PYTHON_CHART_SCRIPT);\n    } catch (q) {\n      i(q);\n      return;\n    }\n    const u = Tr(a, [...e, z], {',
  "pgy python fallback writes chart script to temp file",
);
main = replaceOnce(
  main,
  '    }), u.on("close", (h) => {\n      h === 0 ? l(null) : l(new Error(`python exit ${h}: ${r.slice(0, 1200)}`));\n    }), u.stdin.end(t);',
  '    }), u.on("close", (h) => {\n      try {\n        Rr(z);\n      } catch {\n      }\n      h === 0 ? l(null) : l(new Error(`python exit ${h}: ${r.slice(0, 1200)}`));\n    }), u.stdin.end(t);',
  "pgy python fallback cleans up temp chart script",
);

// 限制发给渲染器的趋势数据量：按日期键去重后只保留最近 1000 个日期（绘图只取最近 30
// 点），避免超大响应让 exe / Python 兜底在去重排序上卡到超时。
main = replaceOnce(
  main,
  '  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.trend)) {\n    const o = Array.isArray(t) ? t : [];\n    o.length >= 2 && i.push({ field: "fansGrowthTrendChart", type: "trend", rows: o, output: pgyChartFile("trend", a, "trend") });\n  }',
  '  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.trend)) {\n    const o = Array.isArray(t) ? t : [];\n    if (o.length >= 2) {\n      const u = new Map();\n      for (const row of o) {\n        const date = String(row == null ? void 0 : row.dateKey ?? row.date ?? "");\n        const digits = date.replace(/\\D/g, "");\n        const k = digits.length >= 8 ? digits.slice(-8) : date;\n        k && u.set(k, row);\n      }\n      const rows = Array.from(u.entries()).sort((a2, b2) => a2[0].localeCompare(b2[0])).map(([, row]) => row).slice(-1000);\n      rows.length >= 2 && i.push({ field: "fansGrowthTrendChart", type: "trend", rows, output: pgyChartFile("trend", a, "trend") });\n    }\n  }',
  "pgy trend rows bounded before renderer",
);

if (main !== originalMain) fs.writeFileSync(mainPath, main);
if (preload !== originalPreload) fs.writeFileSync(preloadPath, preload);
console.log("Applied magiorix runtime patches.");
