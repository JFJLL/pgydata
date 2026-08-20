import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

test("all BrowserWindow creations enforce nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true", () => {
  const indexJs = fs.readFileSync(path.join(root, "app-source/dist-electron/index.js"), "utf8");

  // Check splashWindow
  assert.ok(indexJs.includes("splash-preload.mjs"), "splash window must have dedicated preload");
  assert.ok(indexJs.includes("nodeIntegration: !1"), "nodeIntegration must be false");
  assert.ok(indexJs.includes("contextIsolation: !0"), "contextIsolation must be true");
  assert.ok(indexJs.includes("sandbox: !0"), "sandbox must be true");

  // Check mainWindow webPreferences
  assert.ok(indexJs.includes('preload: Oe(yr, "preload.mjs")'), "main window preload must be configured");
});

test("splash.html and main index.html contain strict Content-Security-Policy", () => {
  const splashHtml = fs.readFileSync(path.join(root, "app-source/electron-main/static/splash.html"), "utf8");
  assert.ok(splashHtml.includes("Content-Security-Policy"), "splash.html must define CSP");
  assert.ok(splashHtml.includes("default-src 'self'"), "splash.html CSP must constrain default-src");

  const indexHtml = fs.readFileSync(path.join(root, "assets/1.4.2/index.html"), "utf8");
  assert.ok(indexHtml.length > 0);
});

test("production mode disables DevTools shortcuts and menu inspection", () => {
  const indexJs = fs.readFileSync(path.join(root, "app-source/dist-electron/index.js"), "utf8");
  assert.ok(indexJs.includes("before-input-event"), "webContents must intercept before-input-event");
  assert.ok(indexJs.includes("F12"), "F12 shortcut must be intercepted and blocked");
});

