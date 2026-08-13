// 找博主“一次完整采集”语义测试：
// - 205 位模拟任务：详情完成 1 位时不可导出；全部处理完成后一次导出全部成功行。
// - 单任务身份：一个用户启动动作只有一个 collection-history 记录；
//   内部发现 checkpoint 不出现在用户历史（collection-history）。
// - 文件名使用“找博主-YYYYMMDD.xlsx”，不暴露内部任务 ID 文案。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPgyKolService } from "../../app-source/pgy-kol/pgy-kol-service.mjs";
import { CollectionHistoryStore } from "../../app-source/electron-main/collection-history-store.mjs";
import { buildCollectionHistoryExportPayload } from "../../app-source/electron-main/collection-export-headers.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let tmpCounter = 0;
function tmpDir(label) {
  tmpCounter += 1;
  const dir = path.join(os.tmpdir(), `pgy-kol-single-task-${process.pid}-${tmpCounter}-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

function jsonResponse(body, httpStatusCode = 200) {
  return { statusCode: httpStatusCode, data: JSON.stringify(body) };
}

// 205 个唯一博主，11 页（20×10 + 5），页内无重复，不触发 repeat-page 误停。
function twoHundredFiveSearch() {
  return async (opts) => {
    const payload = JSON.parse(opts.body);
    const page = payload.pageNum;
    const startIndex = (page - 1) * 20;
    const count = Math.min(20, 205 - startIndex);
    const kols = Array.from({ length: count }, (_, index) => {
      const n = startIndex + index + 1;
      const uid = n.toString(16).padStart(24, "0");
      return { userId: uid, nickname: `博主${n}` };
    });
    return jsonResponse({ code: 0, data: { kols, total: 205 }, msg: "" });
  };
}

function createFakeDetailRunner({ baseDir, gate } = {}) {
  const store = new CollectionHistoryStore({ baseDir });
  const running = new Map();
  const started = [];
  async function run(taskId) {
    const entry = running.get(taskId);
    const payload = entry.payload;
    let terminal = new Set((await store.getTerminalIndexes(taskId).catch(() => [])) || []);
    let waitMs = 0;
    for (let m = 0; ; m += 1) {
      const current = running.get(taskId);
      if (!current || current.cancelled) break;
      if (gate && gate.shouldBlock(taskId, m)) {
        await gate.releasePromise;
        m -= 1;
        continue;
      }
      const taskData = await store.getTask(taskId);
      const liveUrls = taskData && Array.isArray(taskData.urls) ? taskData.urls : payload.urls;
      if (liveUrls.length > payload.urls.length) {
        payload.urls = liveUrls.map((url) => String(url));
        terminal = new Set((await store.getTerminalIndexes(taskId).catch(() => [])) || []);
      }
      if (m >= payload.urls.length) {
        const closed = taskData && taskData.discoveryClosed === true;
        if (closed) break;
        // 兜底上限：流程卡住时让测试快速失败而不是挂起整个套件。
        waitMs += 10;
        if (waitMs > 20000) {
          await store.setStatus(taskId, "cancelled").catch(() => {});
          break;
        }
        await sleep(10);
        m -= 1;
        continue;
      }
      const itemIndex = payload.sourceIndexes ? payload.sourceIndexes[m] : m;
      if (terminal.has(itemIndex)) continue;
      const row = { nickname: `博主${m + 1}`, url: payload.urls[m], avg10ReadNum: 100 + m };
      await store.recordPendingCharge(taskId, itemIndex, row, payload.urls[m]);
      await store.recordSuccess(taskId, itemIndex, row, 1, payload.urls[m]);
    }
    const current = running.get(taskId);
    if (current) {
      await store.setStatus(taskId, current.cancelled ? "cancelled" : "completed");
      running.delete(taskId);
    }
  }
  return {
    store,
    started,
    create: (payload) => store.createTask(payload),
    updateUrls: (taskId, urls) => store.updateTaskUrls(taskId, urls),
    appendTaskUrls: (taskId, urls) => store.appendTaskUrls(taskId, urls),
    setDiscoveryClosed: (taskId) => store.setDiscoveryClosed(taskId),
    emit: () => {},
    async start(payload) {
      started.push(payload);
      await store.createTask(payload);
      running.set(payload.taskId, { payload, cancelled: false });
      void run(payload.taskId);
    },
    pause() {}, resume() {}, cancel(taskId) {
      const entry = running.get(taskId);
      if (entry) entry.cancelled = true;
    },
    getTask: (taskId) => store.getTask(taskId),
    getExportRows: (taskId) => store.getExportRows(taskId),
    getResumePlan: (taskId) => store.getResumePlan(taskId),
    setStatus: (taskId, status) => store.setStatus(taskId, status),
    initialize: () => store.initialize(),
  };
}

function createService({ taskBaseDir, detailRunner, searchImpl }) {
  return createPgyKolService({
    transport: searchImpl,
    getHeaders: () => ({}),
    sign: () => ({ "X-s": "sig", "X-t": 1 }),
    sessionProvider: () => ({ kind: "fake-session" }),
    baseDir: taskBaseDir,
    taskBaseDir,
    detail: detailRunner,
    detailPollIntervalMs: 5,
  });
}

async function waitFor(condition, label, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`等待超时: ${label}`);
    }
    await sleep(15);
  }
}

test("205 位模拟：详情完成 1 位时不可导出；全部完成后一次导出全部成功行", async () => {
  const taskBaseDir = tmpDir("e2e-205");
  const detailBaseDir = tmpDir("e2e-205-detail");
  let releaseGate;
  let blocked = true;
  const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
  const gate = {
    // 第 2 个博主（m===1）处阻塞：此时恰好完成 1 位（1/205）。
    shouldBlock: (taskId, m) => blocked && m === 1,
    releasePromise: gatePromise,
  };
  const unblock = () => { blocked = false; releaseGate(); };
  const detailRunner = createFakeDetailRunner({ baseDir: detailBaseDir, gate });
  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: twoHundredFiveSearch(),
  });
  const res = await service.batchStart({
    filterState: {},
    fields: ["nickname", "url", "avg10ReadNum"],
    budgets: { queryBudget: 500 },
  });
  // 详情任务先于发现完成即存在（preparing，total=0）。
  const preparingTask = await detailRunner.getTask(res.taskId);
  assert.ok(preparingTask, "提交后必须立即创建用户可见详情任务");
  assert.equal(preparingTask.inputType, "search-batch");
  assert.match(preparingTask.fileName, /^找博主-\d{8}\.xlsx$/, "文件名必须为 找博主-YYYYMMDD.xlsx");
  // 发现完成：列表填充为去重后的 205。
  await waitFor(
    async () => {
      const task = await detailRunner.getTask(res.taskId);
      return task && task.total === 205 ? task : null;
    },
    "详情任务填充 205 个博主",
  );
  // 完成 1 位（闸门内）时：导出必须被拒绝。
  await waitFor(
    async () => {
      const task = await detailRunner.getTask(res.taskId);
      return task && task.successCount >= 1 ? task : null;
    },
    "详情完成第 1 位",
  );
  await assert.rejects(
    () => service.batchExport({ taskId: res.checkpointTaskId }),
    (err) => err.kind === "task-not-complete",
    "1/205 时导出必须被 task-not-complete 拒绝，不得生成只有一行的 Excel",
  );
  // 放行 → 全部完成 → 一次导出全部成功行。
  try {
    unblock();
    await waitFor(
      async () => {
        const task = await detailRunner.getTask(res.taskId);
        return task && task.status === "completed" && task.successCount + task.failedCount === task.total ? task : null;
      },
      "详情任务完成",
    );
    const payload = await service.batchExport({ taskId: res.checkpointTaskId });
    assert.equal(payload.data.length, 205, "最终 Excel 数据行数 = 全部成功博主（205）");
    assert.deepEqual(
      payload.headers.map((header) => header.key),
      ["nickname", "url", "avg10ReadNum"],
      "字段等于用户已选字段",
    );
    assert.equal(payload.data[0].nickname, "博主1");
    assert.equal(payload.data[204].nickname, "博主205");
  } finally {
    unblock();
  }
});

test("单任务身份：一次启动只有一个 collection-history 记录，checkpoint 不出现在用户历史", async () => {
  const taskBaseDir = tmpDir("identity");
  const detailBaseDir = tmpDir("identity-detail");
  const detailRunner = createFakeDetailRunner({ baseDir: detailBaseDir });
  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: twoHundredFiveSearch(),
  });
  const res = await service.batchStart({
    filterState: {},
    fields: ["nickname", "url"],
    budgets: { queryBudget: 500 },
  });
  await waitFor(
    async () => {
      const task = await detailRunner.getTask(res.taskId);
      return task && task.status === "completed" ? task : null;
    },
    "详情任务完成",
  );
  // 用户历史（collection-history）只有一条：search-batch 详情任务。
  const history = await detailRunner.store.listTasks();
  assert.equal(history.length, 1, "一次启动动作在用户历史中只能出现一个记录");
  assert.equal(history[0].taskId, res.taskId);
  assert.equal(history[0].inputType, "search-batch");
  assert.equal(history[0].status, "completed");
  assert.match(history[0].fileName, /^找博主-\d{8}\.xlsx$/);
  assert.equal(history[0].successCount, 205);
  // 内部 checkpoint 不出现在用户历史（不在 collection-history 中）。
  const checkpointHistory = await detailRunner.store.getTask(res.checkpointTaskId).catch(() => null);
  assert.equal(checkpointHistory, null, "内部发现 checkpoint 不得进入用户历史");
});

test("发现完成前导出被拒绝；preparing 状态不进入导出", async () => {
  const taskBaseDir = tmpDir("preparing-gate");
  const detailBaseDir = tmpDir("preparing-gate-detail");
  let releaseGate;
  let blocked = true;
  const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
  const gate = { shouldBlock: (taskId, m) => blocked && m === 0, releasePromise: gatePromise };
  const unblock = () => { blocked = false; releaseGate(); };
  const detailRunner = createFakeDetailRunner({ baseDir: detailBaseDir, gate });
  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: twoHundredFiveSearch(),
  });
  const res = await service.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { queryBudget: 500 },
  });
  try {
    // 发现完成（列表填充 205）但详情尚未完成：导出必须被拒绝。
    await waitFor(
      async () => {
        const task = await detailRunner.getTask(res.taskId);
        return task && task.total === 205 ? task : null;
      },
      "列表填充完成",
    );
    await assert.rejects(
      () => service.batchExport({ taskId: res.checkpointTaskId }),
      (err) => err.kind === "task-not-complete",
      "running（total=205 但未完成）导出必须被拒绝",
    );
    unblock();
    await waitFor(
      async () => {
        const task = await detailRunner.getTask(res.taskId);
        return task && task.status === "completed" ? task : null;
      },
      "详情任务完成",
    );
    const payload = await service.batchExport({ taskId: res.checkpointTaskId });
    assert.equal(payload.data.length, 205, "完成后一次导出全部成功行");
  } finally {
    unblock();
  }
});
