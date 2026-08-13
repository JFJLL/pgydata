const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

// A5 记录（只读，禁止修改 assets/1.3.0/integrity-manifest.json）：
// 该 manifest 文件整体使用 CRLF 行尾（实测 306 个 CRLF、0 个 LF-only，末字节 0x0A）。
// 若未来工具按 LF 规范化后重算/重写 manifest 文本，会出现行尾噪声 diff；
// 文件内各条目的 sha256 为既有发布哈希，与本问题无关，不得改动。

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function listFiles(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((name) => name.endsWith(".mjs") || name.endsWith(".json"));
}

test("desktop main wires the pgy-kol base service and read-only IPC", () => {
  const main = read("app-source/dist-electron/index.js");
  assert.ok(
    main.includes('import { createPgyKolService, registerPgyKolIpc } from "../pgy-kol/pgy-kol-service.mjs";'),
    "main bundle must import the pgy-kol service",
  );
  assert.ok(
    main.includes("transport: (opts) => gt.request({ ...opts, timeout: opts.timeoutMs })"),
    "transport must reuse the existing net.request wrapper and map timeoutMs to gt.request timeout",
  );
  assert.ok(main.includes("sign: (path, body) => sm.encryptSign(path, body)"), "signing must reuse the existing X-s/X-t implementation");
  assert.ok(main.includes("sessionProvider: () => Pn.defaultSession"), "session must reuse the default Electron session");
  assert.ok(main.includes("pgyKolIpcDispose = registerPgyKolIpc({"), "IPC must be registered with the composed service");
  assert.ok(main.includes("ipcMain: F,") && main.includes("service: pgyKolService,"), "IPC must be registered with the composed service");
  assert.ok(main.includes("pgyKolIpcDispose = registerPgyKolIpc("), "IPC dispose must be retained for teardown");
  assert.ok(main.includes("pgyKolIpcDispose == null || pgyKolIpcDispose()"), "IPC dispose must run during plugin teardown");
  const ipcModule = read("app-source/pgy-kol/pgy-kol-ipc.mjs");
  for (const channel of [
    "pgy-kol:status",
    "pgy-kol:schema-status",
    "pgy-kol:search-first-page",
    "pgy-kol:config",
    "pgy-kol:payload-preview",
  ]) {
    assert.ok(ipcModule.includes(channel), `ipc module must define channel ${channel}`);
  }
});

test("preload exposes the minimal read-only pgyKol bridge", () => {
  const preload = read("app-source/dist-electron/preload.mjs");
  assert.match(preload, /pgyKol:\{getStatus:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:status"\)/);
  assert.match(preload, /getSchemaStatus:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:schema-status"\)/);
  assert.match(preload, /searchFirstPage:e=>r\.ipcRenderer\.invoke\("pgy-kol:search-first-page",e\)/);
  assert.ok(
    !/n\),pgyKol:\{/.test(preload),
    "pgyKol must not be nested directly inside the onAuthExpired handler",
  );
  assert.match(
    preload,
    /removeListener\(d\.authExpired,n\)\}\},pgyKol:\{/,
    "pgyKol must sit at the bridge top level right after the scrapingScheduler block",
  );
});

test("existing PGY detail GET fetch path is untouched", () => {
  const main = read("app-source/dist-electron/index.js");
  assert.ok(main.includes("async fetchPgyApiInPage"), "window fetch helper must remain");
  assert.match(main, /method: 'GET',\s+credentials: 'include'/);
  assert.match(main, /method: 'GET',\s+credentials: 'include'[\s\S]*AbortSignal\.timeout\(12000\)/);
});

test("pgy-kol sources and fixtures stay desensitized and brand-free", () => {
  const forbidden = ["6438f862000000000e01e59a", "token.txt", "local_config"];
  const brandPatterns = [
    /(^|[^A-Za-z0-9_])zs([^A-Za-z0-9_]|$)/i,
    /PYGdata/i,
    /@zsdesktop/i,
    /Emagic/i,
    /易美/,
  ];
  for (const name of listFiles("app-source/pgy-kol")) {
    const source = read(`app-source/pgy-kol/${name}`);
    for (const needle of forbidden) {
      assert.ok(!source.includes(needle), `app-source/pgy-kol/${name} must not contain ${needle}`);
    }
    for (const pattern of brandPatterns) {
      assert.ok(!pattern.test(source), `app-source/pgy-kol/${name} must not match ${pattern}`);
    }
  }
  for (const name of listFiles("tests/fixtures/pgy-kol")) {
    const source = read(`tests/fixtures/pgy-kol/${name}`);
    for (const needle of forbidden) {
      assert.ok(!source.includes(needle), `tests/fixtures/pgy-kol/${name} must not contain ${needle}`);
    }
    for (const pattern of brandPatterns) {
      assert.ok(!pattern.test(source), `tests/fixtures/pgy-kol/${name} must not match ${pattern}`);
    }
  }
});

test("version stays at 1.3.1 with approved password registration when SMS is disabled", () => {
  const desktop = JSON.parse(read("app-source/package.json"));
  assert.equal(desktop.version, "1.3.1");
  assert.equal(desktop.assetsVersion, "1.3.1");
});

test("Phase 4：批量任务 IPC 通道、preload bridge 与主进程接线", () => {
  const ipcModule = read("app-source/pgy-kol/pgy-kol-ipc.mjs");
  for (const channel of [
    "pgy-kol:batch-start",
    "pgy-kol:batch-list",
    "pgy-kol:batch-get",
    "pgy-kol:batch-pause",
    "pgy-kol:batch-resume",
    "pgy-kol:batch-cancel",
    "pgy-kol:batch-export",
    "pgy-kol:columns",
    "pgy-kol:batch-event",
  ]) {
    assert.ok(ipcModule.includes(channel), `ipc module must define channel ${channel}`);
  }

  const preload = read("app-source/dist-electron/preload.mjs");
  assert.match(preload, /batchStart:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-start",e\)/);
  assert.match(preload, /batchList:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:batch-list"\)/);
  assert.match(preload, /batchGet:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-get",e\)/);
  assert.match(preload, /batchPause:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-pause",e\)/);
  assert.match(preload, /batchResume:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-resume",e\)/);
  assert.match(preload, /batchCancel:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-cancel",e\)/);
  assert.match(preload, /batchExport:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-export",e\)/);
  assert.match(preload, /getColumns:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:columns"\)/);
  // 事件订阅必须返回 dispose（removeListener）。
  assert.match(
    preload,
    /onBatchEvent:e=>\{const n=\(a,t\)=>e\(t\);return r\.ipcRenderer\.on\("pgy-kol:batch-event",n\),\(\)=>r\.ipcRenderer\.removeListener\("pgy-kol:batch-event",n\)\}/,
    "onBatchEvent must register a listener and return a dispose function",
  );

  const main = read("app-source/dist-electron/index.js");
  assert.ok(
    main.includes('taskBaseDir: Oe(ye.getPath("userData"), "pgy-kol-tasks")'),
    "main must wire the pgy-kol task store directory",
  );
  assert.ok(
    main.includes("exporter: (payload) => ff(payload)"),
    "main must wire the pgy-kol Excel exporter through the existing save-dialog flow",
  );
  assert.ok(
    main.includes("broadcast: (channel, payload) => Dt.getAllWindows().forEach((window) => window.webContents.send(channel, payload))"),
    "main must broadcast batch events to all renderer windows",
  );
});

