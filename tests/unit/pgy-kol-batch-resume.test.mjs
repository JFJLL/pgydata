// 蒲公英“找博主”Phase 4.1 加固测试：incomplete 状态语义、预算单调恢复、
// 检查点幂等、重启恢复、旧元数据兼容（主代理维护）。
//
// 覆盖（红→绿清单）：
// 1. budget-exhausted → incomplete/cannot-prove，而非 completed；
// 2. 未增加/减少/非法预算均拒绝且不发请求；
// 3. 增加 queryBudget 后从原检查点继续（已提交页不重抓、taskId 不变）；
// 4. 累计 pages/raw/unique/duplicate/missingUid/budgetUsed 不清零；
// 5. 再次耗尽重新进入 incomplete，新预算与消费量持久化；
// 6. 应用重启后（新 service/store 实例）仍可增加预算继续；
// 7. maxPages 单调增加及 250 上限；
// 8. repeat-page / capped-unprovable / checkpoint-desync 不可继续；
// 9. complete 任务仍拒绝 resume；
// 10. 旧 Phase 4 任务元数据缺少新字段时可兼容读取；
// 11. incomplete 任务数据始终可导出。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPgyKolService } from "../../app-source/pgy-kol/pgy-kol-service.mjs";
import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";
import {
  createPgyKolBatchRunner,
  evaluateResumeEligibility,
} from "../../app-source/pgy-kol/pgy-kol-batch-runner.mjs";

let tmpCounter = 0;
function tmpDir(label) {
  tmpCounter += 1;
  const dir = path.join(os.tmpdir(), `pgy-kol-batch-resume-${process.pid}-${tmpCounter}-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

function jsonResponse(body, httpStatusCode = 200) {
  return { statusCode: httpStatusCode, data: JSON.stringify(body) };
}

// 每页 20 条唯一 UID，total 固定（<5000 不触顶）。
function pageTransport(pageNums, { total = 100 } = {}) {
  return async (opts) => {
    const payload = JSON.parse(opts.body);
    pageNums.push(payload.pageNum);
    const startIndex = (payload.pageNum - 1) * 20;
    const kols = Array.from({ length: 20 }, (_, index) => ({
      userId: `r-${startIndex + index + 1}`,
      nickname: `n${startIndex + index + 1}`,
    }));
    return jsonResponse({ code: 0, data: { kols, total }, msg: "" });
  };
}

// 每页只有 1 条新 UID（持续短页 → 打到 maxPagesPerLeaf 仍 unique < total）。
function shortPageTransport(pageNums, { total = 1000 } = {}) {
  return async (opts) => {
    const payload = JSON.parse(opts.body);
    pageNums.push(payload.pageNum);
    const kols = [{ userId: `s-${payload.pageNum}`, nickname: `n${payload.pageNum}` }];
    return jsonResponse({ code: 0, data: { kols, total }, msg: "" });
  };
}

async function makeService({ transport, taskBaseDir }) {
  return createPgyKolService({
    transport,
    getHeaders: () => ({}),
    sign: () => ({ "X-s": "sig", "X-t": 1 }),
    sessionProvider: () => ({ kind: "fake-session" }),
    baseDir: taskBaseDir,
    taskBaseDir,
  });
}

async function waitForStatus(service, taskId, statuses, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await service.batchGet({ taskId });
    if (statuses.includes(task.status)) {
      // finalize 先写 status 再写 completeness（两写之间有空窗）：状态命中后
      // 必须等完整性落定再返回，避免断言到“completed + 旧 cannot-prove”的中间态。
      const settled =
        task.status === "completed"
          ? task.completeness === "complete"
          : task.status === "incomplete"
            ? task.completeness === "cannot-prove"
            : true;
      if (settled) {
        return task;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`等待任务状态超时: ${task.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// 等待 transport 记录的真实请求数达到下限（请求序列是恢复语义的地面真相；
// 避免在 resume 循环仍在异步推进时过早断言请求日志）。
async function waitForRequests(pageNums, minCount, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (pageNums.length < minCount) {
    if (Date.now() > deadline) {
      throw new Error(`等待真实请求数不足: ${pageNums.length}/${minCount}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("budget-exhausted → incomplete/cannot-prove（非 completed），数据仍可导出", async () => {
  const pageNums = [];
  const taskBaseDir = tmpDir("be-status");
  const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir });
  const { taskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname", "fansCount"],
    budgets: { queryBudget: 2 },
  });
  const task = await waitForStatus(service, taskId, ["incomplete"]);
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "budget-exhausted");
  assert.deepEqual(pageNums, [1, 2], "预算 2 → 只抓 2 页");
  assert.equal(task.counts.raw, 40);

  // 两阶段任务（fields）：阶段一 incomplete 时导出被明确拒绝——最终导出
  // 走详情阶段结果，绝不回退到搜索列表行。
  await assert.rejects(
    () => service.batchExport({ taskId }),
    (err) => err.kind === "details-not-ready",
    "fields 任务在详情采集开始前不得导出搜索列表行",
  );

  // legacy 任务（无 fields）：incomplete 不阻断搜索列表导出（旧契约保留）。
  const legacyTaskId = "pgykol-legacy-incomplete-export";
  await service.taskStore.createTask({
    taskId: legacyTaskId,
    filterState: {},
    columns: ["userId", "nickname"],
    pageSize: 20,
    budgets: {},
  });
  await service.taskStore.addLeaf(legacyTaskId, { leafId: "L0" });
  await service.taskStore.appendPageRows(legacyTaskId, {
    leafId: "L0",
    pageNum: 1,
    rows: [
      { uid: "u1", fields: { userId: "u1", nickname: "甲" } },
      { uid: "u2", fields: { userId: "u2", nickname: "乙" } },
    ],
  });
  await service.taskStore.commitPage(legacyTaskId, {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 2, uniqueCount: 2, dupCount: 0, missingUidCount: 0 },
  });
  const legacyPayload = await service.batchExport({ taskId: legacyTaskId });
  assert.equal(legacyPayload.mode, "two-row");
  assert.equal(legacyPayload.data.length, 2);
  assert.deepEqual(legacyPayload.headers.map((header) => header.key), ["userId", "nickname"]);
});

test("未增加/减少/非法预算全部拒绝且不发请求", async () => {
  const pageNums = [];
  const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir: tmpDir("be-reject") });
  const { taskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { queryBudget: 2 },
  });
  await waitForStatus(service, taskId, ["incomplete"]);

  const cases = [
    [undefined, "invalid-budgets"],
    [{}, "invalid-budgets"],
    [{ queryBudget: 2 }, "budget-not-increased"],
    [{ queryBudget: 1 }, "budget-not-increased"],
    [{ queryBudget: 1.5 }, "invalid-budgets"],
    [{ queryBudget: 0 }, "invalid-budgets"],
    [{ queryBudget: 1001 }, "invalid-budgets"],
    [{ queryBudget: 5, bogus: 1 }, "invalid-budgets"],
    [{ queryBudget: 5, maxPagesPerLeaf: 251 }, "invalid-budgets"],
  ];
  for (const [budgets, kind] of cases) {
    await assert.rejects(
      service.batchResume({ taskId, budgets }),
      (err) => err.kind === kind,
      `budgets=${JSON.stringify(budgets)} 必须拒绝（${kind}）`,
    );
  }
  assert.deepEqual(pageNums, [1, 2], "所有拒绝路径不得发出新请求");
  const after = await service.batchGet({ taskId });
  assert.equal(after.budgets.queryBudget, 2, "拒绝后预算不得被修改");
});

test("增加 queryBudget 后从原检查点继续：不重抓已提交页、计数不清零、taskId 不变", async () => {
  const pageNums = [];
  const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir: tmpDir("be-continue") });
  const { taskId } = await service.batchStart({
    filterState: { gender: "女" },
    fields: ["nickname", "fansCount"],
    budgets: { queryBudget: 2 },
  });
  let task = await waitForStatus(service, taskId, ["incomplete"]);
  assert.equal(task.counts.raw, 40);
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2]);
  assert.equal(task.budgetUsed, 2);

  const resumed = await service.batchResume({ taskId, budgets: { queryBudget: 5 } });
  assert.equal(resumed.status, "running");
  assert.equal(resumed.budgets.queryBudget, 5);
  assert.equal(resumed.budgetUsed, 2, "已消费请求数不得清零");

  task = await waitForStatus(service, taskId, ["completed"]);
  assert.equal(task.completeness, "complete");
  assert.equal(task.taskId, taskId, "taskId 不得更换");
  assert.deepEqual(pageNums, [1, 2, 3, 4, 5], "从第 3 页继续，第 1、2 页不重抓");
  assert.equal(task.counts.raw, 100);
  assert.equal(task.counts.unique, 100);
  assert.equal(task.counts.dup, 0);
  assert.equal(task.counts.missingUid, 0);
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2, 3, 4, 5], "pagesCompleted 累计不清零");
  assert.equal(task.budgetUsed, 5, "预算消耗跨恢复累计");
  assert.equal(task.budgets.queryBudget, 5, "新预算持久化");
  const rows = await service.taskStore.getRows(taskId);
  assert.equal(rows.length, 100, "行不得重复写入");
});

test("再次耗尽重新进入 incomplete，新预算与累计计数持久化", async () => {
  const pageNums = [];
  const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir: tmpDir("be-reexhaust") });
  const { taskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { queryBudget: 2 },
  });
  await waitForStatus(service, taskId, ["incomplete"]);

  // 增加到 4 → 第 3、4 页后再次耗尽（pending 第 5 页）→ 仍 incomplete。
  await service.batchResume({ taskId, budgets: { queryBudget: 4 } });
  await waitForRequests(pageNums, 4);
  let task = await waitForStatus(service, taskId, ["incomplete"]);
  assert.equal(task.summary.stopReason, "budget-exhausted");
  assert.deepEqual(pageNums, [1, 2, 3, 4]);
  assert.equal(task.counts.raw, 80, "计数继续累计不清零");
  assert.equal(task.budgetUsed, 4);
  assert.equal(task.budgets.queryBudget, 4, "第二次预算已持久化");

  // 再次增加 → 完成。
  await service.batchResume({ taskId, budgets: { queryBudget: 5 } });
  task = await waitForStatus(service, taskId, ["completed"]);
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 100);
  assert.deepEqual(pageNums, [1, 2, 3, 4, 5]);
});

test("应用重启后（新 service/store 实例）仍可增加预算继续", async () => {
  const pageNums = [];
  const taskBaseDir = tmpDir("restart");
  const serviceA = await makeService({ transport: pageTransport(pageNums), taskBaseDir });
  const { taskId } = await serviceA.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { queryBudget: 2 },
  });
  let task = await waitForStatus(serviceA, taskId, ["incomplete"]);
  assert.equal(task.counts.raw, 40);

  // “重启”：同一持久化目录新建 service（新 store/runner 实例）。
  const serviceB = await makeService({ transport: pageTransport(pageNums), taskBaseDir });
  const resumed = await serviceB.batchResume({ taskId, budgets: { queryBudget: 5 } });
  assert.equal(resumed.status, "running");
  task = await waitForStatus(serviceB, taskId, ["completed"]);
  assert.equal(task.completeness, "complete");
  assert.deepEqual(pageNums, [1, 2, 3, 4, 5], "重启后仍从检查点继续，不重抓");
  assert.equal(task.counts.raw, 100);
  assert.equal(task.budgetUsed, 5);
  assert.equal(task.budgets.queryBudget, 5);
});

test("maxPages 单调增加可继续；等于/减少/超 250 拒绝；已到 250 不可继续", async () => {
  const pageNums = [];
  const service = await makeService({ transport: shortPageTransport(pageNums), taskBaseDir: tmpDir("maxpages") });
  const { taskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { maxPagesPerLeaf: 3, queryBudget: 100 },
  });
  let task = await waitForStatus(service, taskId, ["incomplete"]);
  assert.equal(task.summary.stopReason, "max-pages-reached");
  assert.deepEqual(pageNums, [1, 2, 3]);
  assert.equal(task.leaves[0].status, "max-pages-unprovable");

  await assert.rejects(
    service.batchResume({ taskId, budgets: { maxPagesPerLeaf: 3 } }),
    (err) => err.kind === "budget-not-increased",
    "等值 maxPages 必须拒绝",
  );
  await assert.rejects(
    service.batchResume({ taskId, budgets: { maxPagesPerLeaf: 2 } }),
    (err) => err.kind === "budget-not-increased",
    "减少 maxPages 必须拒绝",
  );
  await assert.rejects(
    service.batchResume({ taskId, budgets: { maxPagesPerLeaf: 251 } }),
    (err) => err.kind === "invalid-budgets",
    "超过 250 必须拒绝",
  );
  assert.deepEqual(pageNums, [1, 2, 3], "拒绝路径不得发请求");

  await service.batchResume({ taskId, budgets: { maxPagesPerLeaf: 4 } });
  await waitForRequests(pageNums, 4);
  task = await waitForStatus(service, taskId, ["incomplete"]);
  assert.deepEqual(pageNums, [1, 2, 3, 4]);
  assert.equal(task.leaves[0].status, "max-pages-unprovable");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2, 3, 4]);

  // 已到 250：incomplete + max-pages-reached → 拒绝继续（UI 无继续按钮）。
  const taskBaseDir250 = tmpDir("maxpages-250");
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir250 });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-250-1",
    filterState: {},
    fields: ["nickname"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 100 },
  });
  await store.setStatus("pgykol-250-1", "incomplete");
  await store.setCompleteness("pgykol-250-1", "cannot-prove", {
    summary: { stopReason: "max-pages-reached" },
  });
  const service250 = await makeService({ transport: shortPageTransport([]), taskBaseDir: taskBaseDir250 });
  await assert.rejects(
    service250.batchResume({ taskId: "pgykol-250-1", budgets: { maxPagesPerLeaf: 250 } }),
    (err) => err.kind === "resume-not-allowed",
    "已到 250 页上限必须拒绝继续",
  );
});

test("repeat-page / capped-unprovable / checkpoint-desync 不可继续且不发请求", async () => {
  for (const [stopReason, label] of [
    ["repeat-page", "重复页"],
    ["capped-unprovable", "无法安全切分"],
    ["checkpoint-desync", "检查点不一致"],
  ]) {
    const taskBaseDir = tmpDir(`nc-${stopReason}`);
    const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
    await store.initialize();
    const taskId = `pgykol-nc-${stopReason}`;
    await store.createTask({
      taskId,
      filterState: {},
      fields: ["nickname"],
      pageSize: 20,
      budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
    });
    await store.setStatus(taskId, "incomplete");
    await store.setCompleteness(taskId, "cannot-prove", { summary: { stopReason } });
    const pageNums = [];
    const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir });
    await assert.rejects(
      service.batchResume({ taskId, budgets: { queryBudget: 500 } }),
      (err) => err.kind === "resume-not-allowed",
      `${label} 必须拒绝继续`,
    );
    assert.deepEqual(pageNums, [], `${label} 不得发出任何请求`);
  }
});

test("complete 任务仍拒绝 resume（原规则不得退化）", async () => {
  const pageNums = [];
  const service = await makeService({ transport: pageTransport(pageNums, { total: 40 }), taskBaseDir: tmpDir("complete-reject") });
  const { taskId } = await service.batchStart({
    filterState: {},
    fields: ["nickname"],
    budgets: { queryBudget: 100 },
  });
  const task = await waitForStatus(service, taskId, ["completed"]);
  assert.equal(task.completeness, "complete");
  await assert.rejects(
    service.batchResume({ taskId, budgets: { queryBudget: 200 } }),
    (err) => err.kind === "resume-not-allowed",
    "completed 任务必须拒绝 resume",
  );
  assert.deepEqual(pageNums, [1, 2], "拒绝后不得发出请求");
});

test("旧 Phase 4 任务元数据（缺新字段）兼容读取并可增加预算继续", async () => {
  const taskBaseDir = tmpDir("old-meta");
  const taskId = "pgykol-old-1";
  const taskDir = path.join(taskBaseDir, taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  // 模拟 Phase 4 落盘形态：无 budgetUsed、summary 只带 stopReason，
  // 页 1-2 已提交（rows 完整块），status 为旧版 completed+cannot-prove 之外的
  // “incomplete”前身形态（此处直接构造 incomplete 语义任务）。
  const metadata = {
    schemaVersion: 1,
    taskId,
    status: "incomplete",
    completeness: "cannot-prove",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    finishedAt: "2026-08-05T00:00:00.000Z",
    pageSize: 20,
    fields: ["nickname"],
    filterState: {},
    budgets: { queryBudget: 400 },
    counts: { raw: 40, unique: 40, dup: 0, missingUid: 0 },
    leaves: [
      {
        leafId: "L0", depth: 0, parentId: null, range: null, filterState: {},
        status: "running", pagesCompleted: [1, 2], nextPageNum: 3,
        total: null, capSignal: null, rawCount: 40, uniqueCount: 40,
        dupCount: 0, missingUidCount: 0, failure: null,
      },
    ],
    summary: { stopReason: "budget-exhausted" },
  };
  fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify(metadata, null, 2), "utf8");
  const rowsLines = [];
  for (let page = 1; page <= 2; page += 1) {
    rowsLines.push(JSON.stringify({ kind: "page-start", taskId, leafId: "L0", pageNum: page }));
    for (let i = 1; i <= 20; i += 1) {
      rowsLines.push(JSON.stringify({ kind: "row", leafId: "L0", pageNum: page, uid: `old-${(page - 1) * 20 + i}`, fields: { userId: `old-${(page - 1) * 20 + i}` } }));
    }
    rowsLines.push(JSON.stringify({ kind: "page-end", leafId: "L0", pageNum: page, rawCount: 20, uniqueCount: 20, dupCount: 0, missingUidCount: 0 }));
  }
  fs.writeFileSync(path.join(taskDir, "rows.jsonl"), `${rowsLines.join("\n")}\n`, "utf8");

  const pageNums = [];
  const service = await makeService({ transport: pageTransport(pageNums), taskBaseDir });
  const task = await service.batchGet({ taskId });
  assert.equal(task.status, "incomplete");
  assert.equal(task.summary.stopReason, "budget-exhausted");
  assert.equal(task.budgetUsed, undefined, "旧元数据没有 budgetUsed 字段");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2]);

  // 兼容读取后：新预算必须大于默认 400 且大于已消费（缺省按 0 计算）。
  await assert.rejects(
    service.batchResume({ taskId, budgets: { queryBudget: 400 } }),
    (err) => err.kind === "budget-not-increased",
    "等于默认预算必须拒绝（严格大于旧预算）",
  );
  await service.batchResume({ taskId, budgets: { queryBudget: 401 } });
  const done = await waitForStatus(service, taskId, ["completed"]);
  assert.equal(done.completeness, "complete");
  assert.deepEqual(pageNums, [3, 4, 5], "旧任务页 1-2 为持久化数据，恢复只抓第 3 页起");
  assert.equal(done.counts.raw, 100);
});

test("evaluateResumeEligibility 纯函数口径：budget 可续、maxPages 可续、其余 blocked", () => {
  const base = { status: "incomplete", budgets: { queryBudget: 10, maxPagesPerLeaf: 50 }, budgetUsed: 7 };
  const budget = evaluateResumeEligibility({ ...base, summary: { stopReason: "budget-exhausted" } });
  assert.equal(budget.eligible, true);
  assert.equal(budget.kind, "budget");
  const maxPages = evaluateResumeEligibility({ ...base, summary: { stopReason: "max-pages-reached" } });
  assert.equal(maxPages.eligible, true);
  assert.equal(maxPages.kind, "maxPages");
  for (const stopReason of ["repeat-page", "capped-unprovable", "checkpoint-desync", null, "bogus"]) {
    const verdict = evaluateResumeEligibility({ ...base, summary: { stopReason } });
    assert.equal(verdict.eligible, false, `stopReason=${stopReason}`);
    assert.equal(verdict.code, "resume-not-allowed", `stopReason=${stopReason}`);
  }
  const at250 = evaluateResumeEligibility({
    status: "incomplete",
    budgets: { queryBudget: 10, maxPagesPerLeaf: 250 },
    budgetUsed: 7,
    summary: { stopReason: "max-pages-reached" },
  });
  assert.equal(at250.eligible, false);
  assert.equal(at250.code, "max-pages-limit");
  const completed = evaluateResumeEligibility({ status: "completed", summary: { stopReason: null } });
  assert.equal(completed.eligible, false);
});

test("runner 直接恢复：incomplete + 严格增加预算后从检查点继续（store 集成）", async () => {
  const taskBaseDir = tmpDir("runner-direct");
  const store = new PgyKolTaskStore({ baseDir: taskBaseDir });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-direct-1",
    filterState: {},
    fields: ["nickname"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 2 },
  });
  const pageNums = [];
  const search = {
    searchPage: async ({ payload }) => {
      pageNums.push(payload.pageNum);
      const startIndex = (payload.pageNum - 1) * 20;
      const kols = Array.from({ length: 20 }, (_, index) => ({
        userId: `d-${startIndex + index + 1}`,
        nickname: `n${startIndex + index + 1}`,
      }));
      return { code: 0, total: 100, kols, pageNum: payload.pageNum, pageSize: payload.pageSize, capSignal: { capped: false, reason: null } };
    },
  };
  const runner = createPgyKolBatchRunner({
    store,
    search,
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-direct-1");
  let task = await store.getTask("pgykol-direct-1");
  assert.equal(task.status, "incomplete");
  assert.deepEqual(pageNums, [1, 2]);

  // runner 层（非严格路径）：预算必须先持久化再 resume（模拟 service 顺序）。
  await store.setTaskBudgets("pgykol-direct-1", { queryBudget: 5 });
  await runner.resume("pgykol-direct-1", { queryBudget: 5 });
  task = await store.getTask("pgykol-direct-1");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.deepEqual(pageNums, [1, 2, 3, 4, 5], "已提交页不重抓");
  assert.equal(task.counts.raw, 100);
});
