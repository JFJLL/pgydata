const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

test("search-batch production loop uses a mutable dynamic URL queue", () => {
  const main = read("app-source/dist-electron/index.js");
  const patch = read("scripts/apply-magiorix-runtime-patches.js");
  for (const [label, source] of [["bundle", main], ["patch source", patch]]) {
    assert.match(source, /let pgyUrls = i\.map\(/, `${label} must copy the const bundle input into a mutable queue`);
    assert.match(source, /pgyUrls = live\.urls\.map\(/, `${label} must reload newly appended URLs`);
    assert.match(source, /const f = pgyUrls\[m\]/, `${label} must scrape from the live queue`);
  }
  assert.doesNotMatch(main, /\bi = live\.urls\.map\(/, "generated bundle must never assign to the const destructured urls binding");
  assert.match(patch, /replaceAllIfExists[\s\S]*?\bi = live\.urls\.map\(/, "patch must migrate the previously generated broken loop before applying the fixed form");
});

test("search-batch production loop checks pause and cancel before every queued item", () => {
  const main = read("app-source/dist-electron/index.js");
  const patch = read("scripts/apply-magiorix-runtime-patches.js");
  const controlFirst = /for \(let m = 0; await \(async \(\) => \{ for \(;;\) \{ if \(l\.cancelled\) return !1; if \(l\.paused\) \{ await this\.waitForResume\(l\); if \(l\.cancelled\) return !1; \} while \(m < pgyUrls\.length/;
  assert.match(main, controlFirst, "generated bundle must stop or pause before consuming the next live URL");
  assert.match(patch, controlFirst, "runtime patch must generate the same per-item control ordering");
  const loop = main.slice(main.indexOf("let pgyUrls = i.map("), main.indexOf("const f = pgyUrls[m]"));
  assert.ok(loop.indexOf("if (l.cancelled)") < loop.indexOf("if (m < pgyUrls.length)"));
  assert.ok(loop.indexOf("if (l.paused)") < loop.indexOf("if (m < pgyUrls.length)"));
});

test("search-batch production loop never consumes an empty dynamic queue", async () => {
  const main = read("app-source/dist-electron/index.js");
  const match = main.match(
    /for \(let m = 0; await \(async \(\) => \{([\s\S]*?)\}\)\(\); m\+\+\) \{\r?\n\s+const f = pgyUrls\[m\]/,
  );
  assert.ok(match, "must extract the production dynamic-queue condition");
  const execute = new Function(
    "l",
    "pgyUrls",
    "pgyTerminal",
    "pgySourceIndexes",
    "pgyCollectionHistory",
    "t",
    `return (async function () { let m = 0; const proceed = await (async () => {${match[1]}})(); return { proceed, m, pgyUrls }; }).call(this);`,
  );

  let reads = 0;
  const appendAfterWait = await execute.call(
    { waitForResume: async () => {} },
    { cancelled: false, paused: false, current: 0, total: 0 },
    [],
    new Set(),
    [],
    {
      async getTask() {
        reads += 1;
        return reads === 1
          ? { inputType: "search-batch", urls: [], total: 1 }
          : { inputType: "search-batch", urls: ["https://example.test/u1"], total: 1 };
      },
      async getTerminalIndexes() { return []; },
    },
    "task-1",
  );
  assert.equal(appendAfterWait.proceed, true, "new URL should wake the same loop iteration");
  assert.equal(appendAfterWait.pgyUrls[0], "https://example.test/u1");
  assert.equal(appendAfterWait.m, 0, "empty queue must not advance the item index");

  const control = { cancelled: false, paused: false, current: 0, total: 0 };
  setTimeout(() => { control.cancelled = true; }, 30);
  const cancelled = await execute.call(
    { waitForResume: async () => {} },
    control,
    [],
    new Set(),
    [],
    {
      async getTask() { return { inputType: "search-batch", urls: [], total: 0 }; },
      async getTerminalIndexes() { return []; },
    },
    "task-2",
  );
  assert.equal(cancelled.proceed, false, "cancel during empty-queue wait must stop before scrapeItem");
  assert.equal(cancelled.m, 0, "cancelled empty queue must not skip a future URL index");
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

test("history export handler builds schema payload instead of raw single-row data", () => {
  const main = read("app-source/dist-electron/index.js");
  assert.ok(
    main.includes('import { buildCollectionHistoryExportPayload } from "../electron-main/collection-export-headers.mjs";'),
    "main bundle must import buildCollectionHistoryExportPayload",
  );
  assert.ok(
    main.includes("return ff(buildCollectionHistoryExportPayload(n, s));"),
    "history export handler must pass schema headers via buildCollectionHistoryExportPayload",
  );
  assert.ok(
    !main.includes("return ff({ taskId: t.taskId, fileName: n.fileName ||"),
    "legacy raw history export call must not remain in the bundle",
  );
});

test("source package, asset version, and backend package stay aligned", () => {
  const desktop = JSON.parse(read("app-source/package.json"));
  const backend = JSON.parse(read("red-magic-api/package.json"));
  const assets = JSON.parse(read(`assets/${desktop.assetsVersion}/version.json`));
  assert.match(desktop.version, /^\d+\.\d+\.\d+$/);
  assert.equal(desktop.assetsVersion, desktop.version);
  assert.equal(backend.version, desktop.version);
  assert.equal(assets.version, desktop.assetsVersion);
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
