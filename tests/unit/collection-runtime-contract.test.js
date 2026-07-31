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

test("source package, asset version, and backend package stay aligned at 1.1.13", () => {
  const desktop = JSON.parse(read("app-source/package.json"));
  const backend = JSON.parse(read("red-magic-api/package.json"));
  const assets = JSON.parse(read("assets/1.1.13/version.json"));
  assert.equal(desktop.version, "1.1.13");
  assert.equal(desktop.assetsVersion, "1.1.13");
  assert.equal(backend.version, "1.1.13");
  assert.equal(assets.version, "1.1.13");
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
