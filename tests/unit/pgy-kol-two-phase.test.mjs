// 蒲公英“找博主”两阶段采集编排测试。
//
// 真实链路：筛选分页收集唯一博主 ID（阶段一）→ 现有 pgy/blogger 详情采集器
// （阶段二，复用 CollectionHistoryStore 语义：pending charge → 扣费 → success）
// → 详情结果导出（buildCollectionHistoryExportPayload：完整 schema 表头 +
// 真实值，空字段保留表头）。
//
// 覆盖：全选字段原样传递、ID 去重、单次扣费（服务端按 taskId+itemIndex 幂等）、
// 取消/暂停/恢复按当前阶段、重启恢复（阶段二 pending charge 不重抓不重扣）、
// 2 博主生产式 smoke（详情字段确有真实值，而非只有空表头）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPgyKolService } from "../../app-source/pgy-kol/pgy-kol-service.mjs";
import { CollectionHistoryStore } from "../../app-source/electron-main/collection-history-store.mjs";
import { buildCollectionHistoryExportPayload } from "../../app-source/electron-main/collection-export-headers.mjs";
import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let tmpCounter = 0;
function tmpDir(label) {
  tmpCounter += 1;
  const dir = path.join(os.tmpdir(), `pgy-kol-two-phase-${process.pid}-${tmpCounter}-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

function jsonResponse(body, httpStatusCode = 200) {
  return { statusCode: httpStatusCode, data: JSON.stringify(body) };
}

// 详情采集器替身：模拟 ScraperOrchestrator 的 startTask 语义
// （recordPendingCharge → consume → recordSuccess；恢复时 pending charge 只补确认）。
function createFakeDetailRunner({ baseDir, scrape, consumeLog, crashAfterItems } = {}) {
  const store = new CollectionHistoryStore({ baseDir });
  const running = new Map();
  const started = [];
  const scrapedUrls = [];
  async function run(taskId) {
    const entry = running.get(taskId);
    if (!entry) return;
    const { payload } = entry;
    const sourceIndexes = Array.isArray(payload.sourceIndexes)
      ? payload.sourceIndexes
      : payload.urls.map((_, index) => index);
    let processed = 0;
    for (let m = 0; m < payload.urls.length; m += 1) {
      const current = running.get(taskId);
      if (!current || current.cancelled) break;
      if (current.paused) {
        await sleep(10);
        m -= 1;
        continue;
      }
      const itemIndex = sourceIndexes[m];
      processed += 1;
      const pending = (payload.pendingCharges || []).find((item) => item.itemIndex === itemIndex);
      if (pending) {
        consumeLog.push({ taskId, itemIndex, mode: "pending-confirm" });
        await store.recordSuccess(taskId, itemIndex, pending.row, 1, pending.sourceUrl);
        if (crashAfterItems !== undefined && processed >= crashAfterItems) {
          running.delete(taskId);
          return;
        }
        continue;
      }
      scrapedUrls.push(payload.urls[m]);
      const row = await scrape(payload.urls[m], itemIndex);
      if (row === null) {
        await store.recordFailure(taskId, itemIndex, {
          errorCode: "API_ERROR",
          errorMessage: "采集失败（模拟）",
          errorCategory: "api",
        });
        continue;
      }
      await store.recordPendingCharge(taskId, itemIndex, row, payload.urls[m]);
      consumeLog.push({ taskId, itemIndex, mode: "fresh" });
      await store.recordSuccess(taskId, itemIndex, row, 1, payload.urls[m]);
      if (crashAfterItems !== undefined && processed >= crashAfterItems) {
        // 模拟进程崩溃：任务停留在 running，不写终态（重启后 initialize 会标记 interrupted）。
        running.delete(taskId);
        return;
      }
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
    scrapedUrls,
    create: (payload) => store.createTask(payload),
    updateUrls: (taskId, urls) => store.updateTaskUrls(taskId, urls),
    emit: () => {},
    async start(payload) {
      started.push(payload);
      await store.createTask(payload);
      running.set(payload.taskId, { payload, cancelled: false, paused: false });
      void run(payload.taskId).catch(() => {});
    },
    pause(taskId) {
      const entry = running.get(taskId);
      if (entry) entry.paused = true;
    },
    resume(taskId) {
      const entry = running.get(taskId);
      if (entry) entry.paused = false;
    },
    cancel(taskId) {
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

function createService({ taskBaseDir, detailRunner, detailPollIntervalMs = 5, searchImpl }) {
  return createPgyKolService({
    transport: searchImpl,
    getHeaders: () => ({}),
    sign: () => ({ "X-s": "sig", "X-t": 1 }),
    sessionProvider: () => ({ kind: "fake-session" }),
    baseDir: taskBaseDir,
    taskBaseDir,
    detail: detailRunner,
    detailPollIntervalMs,
  });
}

// 搜索响应：uid 高度重复，最终唯一博主 2 个（生产式 smoke 场景）。
function twoBloggerSearch(pageNums, { total = 100 } = {}) {
  return async (opts) => {
    const payload = JSON.parse(opts.body);
    pageNums.push(payload.pageNum);
    const kols = [
      { userId: "111111111111111111111111", nickname: "博主甲" },
      { userId: "222222222222222222222222", nickname: "博主乙" },
    ];
    return jsonResponse({ code: 0, data: { kols, total }, msg: "" });
  };
}

const FULL_FIELDS = [
  "nickname",
  "url",
  "avg10ReadNum",
  "pictureReadCost",
  "noteNumber30",
  "interactionRate30",
  "dailyNotePerformanceChart",
];

function detailScrape(uidUrl) {
  const uid = uidUrl.slice(-24);
  const index = uid === "111111111111111111111111" ? 0 : 1;
  return {
    nickname: index === 0 ? "博主甲" : "博主乙",
    url: `https://www.xiaohongshu.com/user/profile/${uid}`,
    avg10ReadNum: index === 0 ? 1234 : 567,
    pictureReadCost: index === 0 ? 2.5 : 1.2,
    noteNumber30: index === 0 ? 8 : 5,
    interactionRate30: index === 0 ? 0.0312 : 0.0215,
    dailyNotePerformanceChart: index === 0 ? "C:/fake/a.png" : "C:/fake/b.png",
  };
}

async function waitFor(condition, label, timeoutMs = 8000) {
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

test("两阶段完整链路：筛选分页→ID 去重→详情采集→完整 fields→历史结果→详情导出（2 博主 smoke）", async () => {
  const pageNums = [];
  const taskBaseDir = tmpDir("e2e");
  const detailBaseDir = tmpDir("e2e-detail");
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: twoBloggerSearch(pageNums),
  });
  const { taskId, checkpointTaskId } = await service.batchStart({
    filterState: { gender: "女", fansNumberLower: 10000, fansNumberUpper: 50000 },
    fields: FULL_FIELDS,
    budgets: { queryBudget: 20 },
  });

  // 阶段一收口 → 详情任务只收到去重后的唯一博主（2 个），fields 原样传递。
  await waitFor(() => detailRunner.started.length > 0, "详情阶段启动");
  const started = detailRunner.started[0];
  assert.equal(started.pluginId, "pgy");
  assert.equal(started.taskType, "blogger");
  assert.equal(started.urls.length, 2, "20 行搜索结果去重后详情阶段最多采集 2 次");
  assert.deepEqual(
    started.fields,
    FULL_FIELDS,
    "字段弹窗提交的字段集合与详情任务保存的 fields 完全一致，不得删减",
  );
  assert.ok(started.urls.every((url) => url.includes("/solar/pre-trade/blogger-detail/")), "详情任务使用蒲公英博主详情 URL");
  const uniqueIds = new Set(started.urls.map((url) => url.slice(-24)));
  assert.equal(uniqueIds.size, 2, "同一博主只进入详情任务一次");

  // 阶段二完成 → 父任务 completed，且只扣 2 次积分（去重后每博主一次）。
  await waitFor(
    async () => {
      const task = await service.batchGet({ taskId: checkpointTaskId });
      return task.status === "completed" ? task : null;
    },
    "父任务 completed",
  );
  const finalParent = await service.batchGet({ taskId: checkpointTaskId });
  assert.equal(finalParent.detailStatus, "completed");
  assert.equal(finalParent.detailCounts.successCount, 2);
  assert.equal(consumeLog.length, 2, "发现 20 个唯一博主只扣 2 次：详情阶段最多扣费一次/博主");
  assert.equal(detailRunner.scrapedUrls.length, 2, "详情阶段采集次数 = 唯一博主数，不按分页重复");

  // 最终导出：详情阶段结果，表头 = 完整已选字段（schema 顺序），数据为真实值。
  const detailTask = await detailRunner.getTask(started.taskId);
  const rows = await detailRunner.getExportRows(started.taskId);
  const payload = buildCollectionHistoryExportPayload(detailTask, rows);
  assert.deepEqual(
    payload.headers.map((header) => header.key),
    ["nickname", "url", "avg10ReadNum", "pictureReadCost", "noteNumber30", "interactionRate30", "dailyNotePerformanceChart"],
    "Excel 表头必须按 schema 顺序完整保留每个已选字段",
  );
  assert.equal(payload.data.length, 2, "两博主详情行全部导出");
  const byNickname = Object.fromEntries(payload.data.map((row) => [row.nickname, row]));
  assert.equal(byNickname["博主甲"].avg10ReadNum, 1234, "平均阅读必须有真实值");
  assert.equal(byNickname["博主乙"].avg10ReadNum, 567);
  assert.equal(byNickname["博主甲"].interactionRate30, 0.0312, "互动率必须有真实值");
  assert.equal(byNickname["博主甲"].noteNumber30, 8, "发布笔记数必须有真实值");
  assert.ok(String(byNickname["博主甲"].dailyNotePerformanceChart).length > 0, "图表字段保留图片路径");
});

test("空字段保留表头；未勾选字段不导出", () => {
  const detailTask = {
    taskId: "pgykol-detail-sparse",
    pluginId: "pgy",
    taskType: "blogger",
    fields: ["nickname", "avg10ReadNum", "fansRegions"],
  };
  const payload = buildCollectionHistoryExportPayload(detailTask, [{ nickname: "博主甲" }]);
  assert.deepEqual(
    payload.headers.map((header) => header.key),
    ["nickname", "avg10ReadNum", "fansRegions"],
    "全批为空的已选字段（fansRegions）必须保留表头",
  );
  assert.equal(payload.data[0].fansRegions, undefined, "缺失值不伪造");
  assert.ok(!payload.headers.some((header) => header.key === "url"), "未勾选字段绝不导出");
});

test("取消/暂停/恢复作用于当前阶段；取消不导出伪完成结果", async () => {
  const pageNums = [];
  const taskBaseDir = tmpDir("controls");
  const detailBaseDir = tmpDir("controls-detail");
  const consumeLog = [];
  let releaseDetailScrape;
  const detailScrapeGate = new Promise((resolve) => { releaseDetailScrape = resolve; });
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    // 详情抓取等待闸门：让“暂停/继续/取消”落在详情任务运行中，避免秒完成竞态。
    scrape: async (url) => {
      await detailScrapeGate;
      return detailScrape(url);
    },
  });
  const gates = new Map();
  const gateFor = (page) => {
    if (!gates.has(page)) {
      let enteredResolve;
      let releaseResolve;
      const entered = new Promise((resolve) => { enteredResolve = resolve; });
      const release = new Promise((resolve) => { releaseResolve = resolve; });
      gates.set(page, { entered, release, enteredResolve, releaseResolve });
    }
    return gates.get(page);
  };
  const searchImpl = async (opts) => {
    const payload = JSON.parse(opts.body);
    pageNums.push(payload.pageNum);
    if (payload.pageNum === 2) {
      const gate = gateFor(2);
      gate.enteredResolve();
      await gate.release;
    }
    const kols = [
      { userId: "111111111111111111111111", nickname: "博主甲" },
      { userId: "222222222222222222222222", nickname: "博主乙" },
    ];
    return jsonResponse({ code: 0, data: { kols, total: 100 }, msg: "" });
  };
  const service = createService({ taskBaseDir, detailRunner, searchImpl });
  const { taskId, checkpointTaskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname", "url"],
    budgets: { queryBudget: 100 },
  });

  // 阶段一暂停：第 2 页请求进入 transport 后暂停。
  await gateFor(2).entered;
  await service.batchPause({ taskId: checkpointTaskId });
  gateFor(2).releaseResolve();
  await waitFor(
    async () => {
      const task = await service.batchGet({ taskId: checkpointTaskId });
      return task.status === "paused" ? task : null;
    },
    "阶段一 paused",
    30000,
  );
  assert.equal(detailRunner.started.length, 0, "暂停阶段一不得启动详情");

  // 阶段一恢复 → 完成 → 自动进入详情阶段。
  await service.batchResume({ taskId: checkpointTaskId });
  await waitFor(() => detailRunner.started.length === 1, "详情阶段启动", 30000);
  const detailTaskId = detailRunner.started[0].taskId;
  // 详情阶段暂停/继续 → service 路由到详情任务（父任务记录子任务关联）。
  await service.batchPause({ taskId: checkpointTaskId });
  await sleep(30);
  const parentWhilePaused = await service.batchGet({ taskId: checkpointTaskId });
  assert.equal(parentWhilePaused.detailTaskId, detailTaskId, "父任务记录详情子任务");
  await service.batchResume({ taskId: checkpointTaskId });
  // 详情阶段取消 → 父任务 cancelled，不输出伪完成结果。
  await service.batchCancel({ taskId: checkpointTaskId });
  releaseDetailScrape();
  await waitFor(
    async () => {
      const task = await service.batchGet({ taskId: checkpointTaskId });
      return task.status === "cancelled" ? task : null;
    },
    "详情取消后父任务 cancelled",
  );
  // 取消后不输出伪完成结果：父任务 cancelled（非 completed）；
  // 后端门闸拒绝导出（search-batch 只有 completed 且计数收口才允许导出）。
  const cancelledTask = await service.batchGet({ taskId: checkpointTaskId });
  assert.equal(cancelledTask.status, "cancelled", "取消后父任务必须为 cancelled");
  await assert.rejects(
    () => service.batchExport({ taskId: checkpointTaskId }),
    (err) => err.kind === "task-not-complete",
    "取消后导出必须被完成门闸拒绝，不得输出部分行 Excel",
  );
});

test("阶段二 interrupted 后用户手动继续（service.batchResume 走恢复计划，不重抓已成功）", async () => {
  const taskBaseDir = tmpDir("resume-interrupted");
  const detailBaseDir = tmpDir("resume-interrupted-detail");
  const consumeLog = [];
  const THREE_UIDS = [
    "111111111111111111111111",
    "222222222222222222222222",
    "333333333333333333333333",
  ];
  const scrape = (uidUrl) => {
    const uid = uidUrl.slice(-24);
    const index = THREE_UIDS.indexOf(uid);
    return { nickname: `博主${index + 1}`, url: `https://www.xiaohongshu.com/user/profile/${uid}`, avg10ReadNum: 100 + index };
  };
  const detailRunnerA = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape,
    crashAfterItems: 1,
  });
  const serviceA = createService({
    taskBaseDir,
    detailRunner: detailRunnerA,
    searchImpl: async (opts) => {
      const payload = JSON.parse(opts.body);
      return jsonResponse({
        code: 0,
        data: { kols: THREE_UIDS.map((uid, index) => ({ userId: uid, nickname: `博主${index + 1}` })), total: 100 },
        msg: "",
      });
    },
  });
  const { taskId, checkpointTaskId } = await serviceA.batchStart({
    filterState: {},
    fields: ["nickname", "url"],
    budgets: { queryBudget: 100 },
  });
  await waitFor(() => detailRunnerA.started.length === 1, "详情启动");
  const detailTaskId = detailRunnerA.started[0].taskId;
  await waitFor(
    async () => {
      const task = await detailRunnerA.getTask(detailTaskId);
      return task && task.successCount >= 1 ? task : null;
    },
    "item0 成功",
  );
  // 模拟中断：详情任务保持 interrupted（无 pending charge）。
  await detailRunnerA.setStatus(detailTaskId, "interrupted");
  await waitFor(
    async () => {
      const task = await serviceA.batchGet({ taskId: checkpointTaskId });
      return task.detailStatus === "interrupted" ? task : null;
    },
    "父任务识别详情中断",
  );

  // 用户手动继续：service.batchResume → resumeDetailPhase → getResumePlan。
  const detailRunnerB = createFakeDetailRunner({ baseDir: detailBaseDir, consumeLog, scrape });
  const serviceB = createService({ taskBaseDir, detailRunner: detailRunnerB, searchImpl: twoBloggerSearch([]) });
  await serviceB.batchResume({ taskId: checkpointTaskId });
  await waitFor(
    async () => {
      const task = await serviceB.batchGet({ taskId: checkpointTaskId });
      return task.status === "completed" ? task : null;
    },
    "手动继续后完成",
  );
  const parent = await serviceB.batchGet({ taskId: checkpointTaskId });
  assert.equal(parent.detailStatus, "completed");
  assert.equal(parent.detailCounts.successCount, 3);
  assert.equal(detailRunnerB.scrapedUrls.length, 2, "继续后只抓剩余 2 个博主，不重抓 item0");
  const byItem = {};
  for (const entry of consumeLog) byItem[entry.itemIndex] = (byItem[entry.itemIndex] || 0) + 1;
  assert.deepEqual(byItem, { 0: 1, 1: 1, 2: 1 }, "每个博主只扣费一次");
});

test("应用重启恢复：阶段二识别并继续，已成功不重抓，pending charge 不重扣", async () => {
  const taskBaseDir = tmpDir("restart");
  const detailBaseDir = tmpDir("restart-detail");
  const consumeLog = [];
  // 三个唯一博主：item0 崩溃前成功；item1 崩溃时已抓取未扣费（pending）；
  // item2 完全未处理。恢复后：item0 不重抓不重扣，item1 只补扣费确认，
  // item2 重新抓取并扣费。
  const THREE_UIDS = [
    "111111111111111111111111",
    "222222222222222222222222",
    "333333333333333333333333",
  ];
  const scrape = (uidUrl) => {
    const uid = uidUrl.slice(-24);
    const index = THREE_UIDS.indexOf(uid);
    return {
      nickname: `博主${index + 1}`,
      url: `https://www.xiaohongshu.com/user/profile/${uid}`,
      avg10ReadNum: 100 + index,
    };
  };
  const detailRunnerA = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape,
    crashAfterItems: 1,
  });
  const serviceA = createService({
    taskBaseDir,
    detailRunner: detailRunnerA,
    searchImpl: async (opts) => {
      const payload = JSON.parse(opts.body);
      return jsonResponse({
        code: 0,
        data: {
          kols: THREE_UIDS.map((uid, index) => ({ userId: uid, nickname: `博主${index + 1}` })),
          total: 100,
        },
        msg: "",
      });
    },
  });
  const { taskId, checkpointTaskId } = await serviceA.batchStart({
    filterState: {},
    fields: ["nickname", "url", "avg10ReadNum"],
    budgets: { queryBudget: 100 },
  });
  await waitFor(() => detailRunnerA.started.length === 1, "详情启动");
  const detailTaskId = detailRunnerA.started[0].taskId;
  // crashAfterItems=1 使 runner 在 item0 后“崩溃”（任务停留在 running）。
  await waitFor(
    async () => {
      const task = await detailRunnerA.getTask(detailTaskId);
      return task && task.successCount + task.failedCount >= 1 ? task : null;
    },
    "详情 item0 成功",
  );
  await detailRunnerA.store.recordPendingCharge(
    detailTaskId,
    1,
    { nickname: "崩溃中博主" },
    `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/222222222222222222222222`,
  );

  // “重启”：同目录新服务 + 新详情替身；initialize 自动恢复。
  const detailRunnerB = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape,
  });
  const serviceB = createService({ taskBaseDir, detailRunner: detailRunnerB, searchImpl: twoBloggerSearch([]) });
  await serviceB.initialize();

  await waitFor(
    async () => {
      const task = await serviceB.batchGet({ taskId: checkpointTaskId });
      return task.status === "completed" ? task : null;
    },
    "重启后父任务完成",
  );
  const parent = await serviceB.batchGet({ taskId: checkpointTaskId });
  assert.equal(parent.detailTaskId, detailTaskId, "重启后必须识别同一详情子任务");
  assert.equal(parent.detailStatus, "completed");
  assert.equal(parent.detailCounts.successCount, 3, "三个博主都成功");
  // 扣费只发生一次/博主：itemIndex 0/1/2 各自只出现一次（服务端按 taskId+itemIndex 幂等）。
  const byItem = {};
  for (const entry of consumeLog) {
    byItem[entry.itemIndex] = (byItem[entry.itemIndex] || 0) + 1;
  }
  assert.deepEqual(byItem, { 0: 1, 1: 1, 2: 1 }, "每个博主只扣费一次，无双重扣费");
  // 已成功博主不重抓：重启后的替身只新抓 item2；item1 只补扣费确认不重抓。
  assert.equal(detailRunnerB.scrapedUrls.length, 1, "恢复后只采集未完成博主，不重抓已成功博主");
  assert.ok(detailRunnerB.scrapedUrls[0].includes("333333333333333333333333"), "重新抓取的是未处理博主");
  assert.ok(consumeLog.some((entry) => entry.mode === "pending-confirm"), "pending charge 恢复走补确认路径");
});

test("阶段一 incomplete（预算耗尽）仍进入详情阶段采集已发现博主", async () => {
  const pageNums = [];
  const taskBaseDir = tmpDir("incomplete");
  const detailBaseDir = tmpDir("incomplete-detail");
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: twoBloggerSearch(pageNums),
  });
  const { taskId, checkpointTaskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname", "url"],
    budgets: { queryBudget: 1 },
  });
  await waitFor(
    async () => {
      const task = await service.batchGet({ taskId: checkpointTaskId });
      return task.status === "completed" ? task : null;
    },
    "预算耗尽后仍完成详情采集",
  );
  const task = await service.batchGet({ taskId: checkpointTaskId });
  assert.equal(task.completeness, "cannot-prove", "阶段一未证明完整性的信息保留");
  assert.equal(task.detailCounts.successCount, 2, "已发现博主全部完成详情采集");
  assert.equal(detailRunner.started[0].urls.length, 2);
});

test("崩溃窗口：setDetailPhase 已落盘但详情任务未创建 → 重启用父任务数据重建", async () => {
  const taskBaseDir = tmpDir("crash-window");
  const detailBaseDir = tmpDir("crash-window-detail");
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  // 直接构造父任务：fields + detailPhase 已落盘，但详情任务目录不存在
  // （模拟 setDetailPhase 之后、detail.start 之前进程崩溃）。
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-crash-window-1",
    filterState: {},
    fields: ["nickname", "url"],
    pageSize: 20,
    budgets: {},
  });
  await store.setDetailPhase("pgykol-crash-window-1", {
    detailTaskId: "pgykol-detail-crash-window-1",
    detailUrls: [
      "https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/111111111111111111111111",
      "https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/222222222222222222222222",
    ],
  });
  await store.setStatus("pgykol-crash-window-1", "running");

  const service = createService({ taskBaseDir, detailRunner, searchImpl: twoBloggerSearch([]) });
  await service.initialize();
  await waitFor(() => detailRunner.started.length === 1, "重建详情任务");
  assert.deepEqual(detailRunner.started[0].fields, ["nickname", "url"], "重建时复用父任务持久化的 fields");
  assert.equal(detailRunner.started[0].urls.length, 2, "重建时复用父任务持久化的去重博主列表");
  assert.equal(detailRunner.started[0].taskId, "pgykol-detail-crash-window-1", "重建沿用已落盘的 detailTaskId");
  await waitFor(
    async () => {
      const task = await service.batchGet({ taskId: "pgykol-crash-window-1" });
      return task.status === "completed" ? task : null;
    },
    "重建后完成",
  );
  const parent = await service.batchGet({ taskId: "pgykol-crash-window-1" });
  assert.equal(parent.detailCounts.successCount, 2);
});

test("failed 发现任务不自动重启；用户显式继续才恢复", async () => {
  const taskBaseDir = tmpDir("failed-discovery");
  const detailBaseDir = tmpDir("failed-discovery-detail");
  const searchCalls = [];
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-failed-discovery-1",
    filterState: {},
    fields: ["nickname", "url"],
    pageSize: 20,
    budgets: { queryBudget: 20 },
  });
  await store.setDetailPhase("pgykol-failed-discovery-1", {
    detailTaskId: "pgykol-detail-failed-discovery-1",
    detailUrls: [],
  });
  await store.setStatus("pgykol-failed-discovery-1", "failed");
  // 模拟 batchStart 已创建的详情任务（preparing、空列表），与生产启动路径一致。
  await detailRunner.create({
    taskId: "pgykol-detail-failed-discovery-1",
    pluginId: "pgy",
    taskType: "blogger",
    urls: [],
    fileName: "找博主-20260812.xlsx",
    fields: ["nickname", "url"],
    inputType: "search-batch",
  });

  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: async (opts) => {
      searchCalls.push(JSON.parse(opts.body).pageNum);
      return twoBloggerSearch([])(opts);
    },
  });
  await service.initialize();
  assert.equal(
    searchCalls.length,
    0,
    "failed 发现任务不得在应用启动时自动重试（避免反复消耗查询预算）",
  );
  let task = await service.batchGet({ taskId: "pgykol-failed-discovery-1" });
  assert.equal(task.status, "failed", "保持失败状态等待用户显式继续");

  await service.batchResume({ taskId: "pgykol-failed-discovery-1" });
  await waitFor(
    async () => {
      const current = await service.batchGet({ taskId: "pgykol-failed-discovery-1" });
      return current.status === "completed" ? current : null;
    },
    "用户显式继续后完成",
  );
  assert.ok(searchCalls.length >= 1, "用户显式继续才恢复发现循环");
  task = await service.batchGet({ taskId: "pgykol-failed-discovery-1" });
  assert.equal(task.detailCounts.successCount, 2, "显式继续后详情采集完成");
});

test("崩溃窗口 B：setDetailPhase 已落盘但详情任务未创建 → 发现收口自动重建", async () => {
  const taskBaseDir = tmpDir("crash-window-b");
  const detailBaseDir = tmpDir("crash-window-b-detail");
  const searchCalls = [];
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-crash-window-b-1",
    filterState: {},
    fields: ["nickname", "url"],
    pageSize: 20,
    budgets: { queryBudget: 20 },
  });
  await store.setDetailPhase("pgykol-crash-window-b-1", {
    detailTaskId: "pgykol-detail-crash-window-b-1",
    detailUrls: [],
  });
  await store.setStatus("pgykol-crash-window-b-1", "running");
  // 模拟进程在 batchStart 的 detail.create 之前崩溃：详情任务目录不存在。
  // （detailBaseDir 保持为空，不创建详情任务。）

  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: async (opts) => {
      searchCalls.push(JSON.parse(opts.body).pageNum);
      return twoBloggerSearch([])(opts);
    },
  });
  await service.initialize();
  await waitFor(
    async () => {
      const current = await service.batchGet({ taskId: "pgykol-crash-window-b-1" });
      return current.status === "completed" ? current : null;
    },
    "重启后自动重建详情任务并完成",
  );
  assert.ok(searchCalls.length >= 1, "发现循环自动恢复");
  assert.equal(detailRunner.started.length, 1, "详情任务被重建");
  assert.deepEqual(detailRunner.started[0].fields, ["nickname", "url"], "重建复用父任务 fields");
  assert.equal(detailRunner.started[0].taskId, "pgykol-detail-crash-window-b-1", "沿用已落盘 detailTaskId");
  const task = await service.batchGet({ taskId: "pgykol-crash-window-b-1" });
  assert.equal(task.status, "completed", "采集不静默丢失");
  assert.equal(task.detailCounts.successCount, 2, "重建后详情采集完成");
});

test("发现阶段崩溃重启：详情任务 interrupted → 自动恢复发现并填充启动，不落 failed", async () => {
  const taskBaseDir = tmpDir("discovery-crash");
  const detailBaseDir = tmpDir("discovery-crash-detail");
  const searchCalls = [];
  const consumeLog = [];
  const detailRunner = createFakeDetailRunner({
    baseDir: detailBaseDir,
    consumeLog,
    scrape: (url) => detailScrape(url),
  });
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-discovery-crash-1",
    filterState: {},
    fields: ["nickname", "url"],
    pageSize: 20,
    budgets: { queryBudget: 20 },
  });
  await store.setDetailPhase("pgykol-discovery-crash-1", {
    detailTaskId: "pgykol-detail-discovery-crash-1",
    detailUrls: [],
  });
  await store.setStatus("pgykol-discovery-crash-1", "running");
  // 模拟 batchStart 已创建详情任务后进程在发现阶段崩溃：重启后历史存储
  // initialize 会把详情任务 running → interrupted。
  await detailRunner.create({
    taskId: "pgykol-detail-discovery-crash-1",
    pluginId: "pgy",
    taskType: "blogger",
    urls: [],
    fileName: "找博主-20260812.xlsx",
    fields: ["nickname", "url"],
    inputType: "search-batch",
  });

  const service = createService({
    taskBaseDir,
    detailRunner,
    searchImpl: async (opts) => {
      searchCalls.push(JSON.parse(opts.body).pageNum);
      return twoBloggerSearch([])(opts);
    },
  });
  await service.initialize();
  // 重启后：父任务 running → interrupted、详情任务 running → interrupted，
  // initialize 自动恢复发现循环，无需用户操作。
  await waitFor(
    async () => {
      const current = await service.batchGet({ taskId: "pgykol-discovery-crash-1" });
      return current.status === "completed" ? current : null;
    },
    "重启自动恢复发现并完成",
  );
  assert.ok(searchCalls.length >= 1, "自动恢复后发现循环重新分页");
  const task = await service.batchGet({ taskId: "pgykol-discovery-crash-1" });
  assert.equal(task.status, "completed", "不因 interrupted 详情任务落入 failed");
  assert.equal(task.detailCounts.successCount, 2, "发现阶段崩溃重启后详情采集仍完成");
});
