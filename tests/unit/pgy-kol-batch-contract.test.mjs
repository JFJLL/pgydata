// 蒲公英“找博主”Phase 4 跨模块契约测试（主代理维护）。
//
// 本文件锁定四个新模块之间的接口契约，防止工作包 A/B 并行开发时接口漂移：
// - pgy-kol-task-store.mjs（工作包 B）：任务持久化、页块协议、崩溃恢复语义
// - pgy-kol-batch-runner.mjs（工作包 A）：批量采集状态机、去重、切分、错误语义
// - pgy-kol-column-registry.mjs（工作包 B）：可审计列注册表
// - pgy-kol-batch-export.mjs（工作包 B）：从持久化全量行构建导出 Payload
//
// 红→绿：本文件先于实现提交，全部断言在模块实现后必须通过。
// 本文件只依赖 Node 内置能力 + 上述四个模块 + 现有 search client 常量。

import test from "node:test";
import assert from "node:assert/strict";

import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";
import { createPgyKolBatchRunner } from "../../app-source/pgy-kol/pgy-kol-batch-runner.mjs";
import {
  PGY_KOL_COLUMN_REGISTRY,
  getPgyKolColumn,
  listPgyKolConfirmedColumns,
  getPgyKolDefaultColumns,
  getPgyKolExportHeaders,
} from "../../app-source/pgy-kol/pgy-kol-column-registry.mjs";
import { buildPgyKolBatchExportPayload } from "../../app-source/pgy-kol/pgy-kol-batch-export.mjs";
import { KNOWN_KOL_FIELDS } from "../../app-source/pgy-kol/pgy-kol-search-client.mjs";
import { redactLocalPathText } from "../../app-source/pgy-kol/pgy-session-request.mjs";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("列注册表（Phase 5）：confirmed=可展示列，全部落在 KNOWN_KOL_FIELDS 白名单内", () => {
  const confirmed = listPgyKolConfirmedColumns();
  assert.ok(confirmed.length >= 30, "confirmed（可展示）列数量必须覆盖真实响应字段");
  for (const column of confirmed) {
    assert.ok(KNOWN_KOL_FIELDS.includes(column.id), `列 ${column.id} 必须在 KNOWN_KOL_FIELDS 白名单内`);
    assert.equal(typeof column.label, "string");
    assert.ok(column.label.length > 0);
    assert.equal(typeof column.group, "string");
    assert.ok(["string", "number", "percent", "money", "url"].includes(column.type));
    assert.ok(column.responsePath !== null && typeof column.responsePath === "string");
    assert.ok(!column.responsePath.startsWith("computed:"), "可展示列不得是 computed");
    assert.equal(typeof column.defaultDisplay, "boolean");
    assert.equal(typeof column.defaultExport, "boolean");
    assert.equal(typeof column.evidence, "string");
  }
  // 每个注册表条目都有稳定 id 且无重复。
  const ids = PGY_KOL_COLUMN_REGISTRY.map((column) => column.id);
  assert.equal(new Set(ids).size, ids.length, "注册表 id 不得重复");
  // 固定列/报价列/unavailable 列仍登记在注册表里（可审计），但不得出现在 confirmed 列表。
  const notDisplayable = PGY_KOL_COLUMN_REGISTRY.filter((column) => {
    return (
      column.responsePath === null ||
      (typeof column.responsePath === "string" && column.responsePath.startsWith("computed:")) ||
      column.evidence === "unavailable"
    );
  });
  assert.ok(notDisplayable.length > 0, "注册表必须保留固定列/报价列/unavailable 列");
  for (const column of notDisplayable) {
    assert.ok(!listPgyKolConfirmedColumns().some((item) => item.id === column.id));
  }
  // Phase 5 默认展示 = 官网当前账号默认 8 项（含固定列/全部报价）。
  assert.deepEqual(
    getPgyKolDefaultColumns().map((column) => column.id),
    ["kolInfo", "recentNotes", "actions", "price", "fansNum", "readMidNor30", "interMidNor30", "fansActiveIn28dLv"],
  );
});

test("列注册表（Phase 5）：userId 可导出但不再默认展示（博主信息复合列替代），未知 id 拒绝", () => {
  const userId = getPgyKolColumn("userId");
  assert.ok(userId, "userId 列必须存在");
  assert.equal(userId.responsePath, "userId");
  assert.equal(userId.defaultDisplay, false, "userId 由固定列 博主信息(kolInfo) 复合展示");
  assert.equal(userId.defaultExport, true);
  const kolInfo = getPgyKolColumn("kolInfo");
  assert.ok(kolInfo && kolInfo.fixed === true, "博主信息固定列必须存在");
  assert.equal(kolInfo.defaultDisplay, true);
  // 固定列不可导出。
  assert.throws(() => getPgyKolExportHeaders(["kolInfo"]), /不可导出|未知列|未知字段|unknown/i);
  assert.equal(getPgyKolColumn("not-a-real-field"), undefined);
  // 导出表头：只接受 confirmed 列，顺序即用户选择顺序。
  const headers = getPgyKolExportHeaders(["nickname", "userId"]);
  assert.deepEqual(headers.map((header) => header.key), ["nickname", "userId"]);
  assert.throws(() => getPgyKolExportHeaders(["nickname", "not-a-real-field"]), /未知列|未知字段|unknown/i);
});

test("任务存储：createTask 写盘、getTask 往返一致、listTasks 排序", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("store-roundtrip") });
  await store.initialize();
  const created = await store.createTask({
    taskId: "pgykol-contract-1",
    filterState: { gender: "女", fansNumberLower: 10000, fansNumberUpper: 50000 },
    columns: ["userId", "nickname", "fansNum"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  assert.equal(created.taskId, "pgykol-contract-1");
  assert.equal(created.status, "running");
  assert.equal(created.completeness, "not-started");
  assert.deepEqual(created.columns, ["userId", "nickname", "fansNum"]);
  assert.deepEqual(created.counts, { raw: 0, unique: 0, dup: 0, missingUid: 0 });
  assert.deepEqual(created.leaves, []);

  const loaded = await store.getTask("pgykol-contract-1");
  assert.deepEqual(loaded, created);
  assert.equal(await store.getTask("pgykol-contract-missing"), null);
  // 重复 createTask 必须报错（不允许静默覆盖）。
  await assert.rejects(
    store.createTask({ taskId: "pgykol-contract-1", filterState: {}, columns: [], pageSize: 20, budgets: {} }),
    /已存在|exists/i,
  );
  const list = await store.listTasks();
  assert.ok(list.some((task) => task.taskId === "pgykol-contract-1"));
});

test("任务存储：页块协议（page-start / rows / page-end）与提交顺序", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("store-pages") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-pages-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-pages-1", {
    leafId: "L0",
    depth: 0,
    parentId: null,
    range: null,
    filterState: {},
    status: "pending",
    pagesCompleted: [],
    nextPageNum: 1,
    total: null,
    capSignal: null,
    rawCount: 0,
    uniqueCount: 0,
    dupCount: 0,
    missingUidCount: 0,
    failure: null,
  });

  await store.appendPageRows("pgykol-pages-1", {
    leafId: "L0",
    pageNum: 1,
    rows: [
      { uid: "u1", fields: { userId: "u1", nickname: "甲" } },
      { uid: "u2", fields: { userId: "u2", nickname: "乙" } },
    ],
  });
  const afterRows = await store.getTask("pgykol-pages-1");
  assert.equal(afterRows.counts.raw, 0, "行已写但未提交前，任务计数不得前进");

  await store.commitPage("pgykol-pages-1", {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 2, uniqueCount: 2, dupCount: 0, missingUidCount: 0 },
  });
  const afterCommit = await store.getTask("pgykol-pages-1");
  assert.deepEqual(afterCommit.counts, { raw: 2, unique: 2, dup: 0, missingUid: 0 });
  assert.deepEqual(afterCommit.leaves[0].pagesCompleted, [1]);
  assert.equal(afterCommit.leaves[0].nextPageNum, 2);

  // getRows 必须从持久化行重建（行数 = 2）。
  const rows = await store.getRows("pgykol-pages-1");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].fields.nickname, "甲");
  assert.equal(rows[0].leafId, "L0");
  assert.equal(rows[0].pageNum, 1);
});

test("任务存储：崩溃恢复语义（行已写/元数据未提交 → 幂等重放）", async () => {
  const baseDir = tmpDir("store-recover");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-recover-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-recover-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [], nextPageNum: 1, total: null, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  // 模拟崩溃窗口 A：行块完整（page-end 已写）但任务元数据未 commit。
  await store.appendPageRows("pgykol-recover-1", {
    leafId: "L0", pageNum: 1,
    rows: [{ uid: "u1", fields: { userId: "u1" } }],
  });
  // 模拟崩溃窗口 B：尾块被截断（无 page-end）→ 恢复时必须丢弃尾块并重取该页。
  await store.appendPageRows("pgykol-recover-1", {
    leafId: "L0", pageNum: 2,
    rows: [{ uid: "u2", fields: { userId: "u2" } }],
    truncateTail: true,
  });

  const fresh = new PgyKolTaskStore({ baseDir });
  await fresh.initialize();
  const recovered = await fresh.getTask("pgykol-recover-1");
  // 窗口 A：page 1 被修复为已提交（幂等重放），计数从 page-end 行恢复。
  assert.deepEqual(recovered.leaves[0].pagesCompleted, [1]);
  assert.equal(recovered.counts.raw, 1);
  assert.equal(recovered.counts.unique, 1);
  // 窗口 B：page 2 尾块被丢弃，nextPageNum 回到 2 等待重取。
  assert.equal(recovered.leaves[0].nextPageNum, 2);
  const rows = await fresh.getRows("pgykol-recover-1");
  assert.equal(rows.length, 1, "截断尾块必须被丢弃，不得残留半页");
  assert.equal(rows[0].pageNum, 1);
});

test("任务存储：元数据超前（已提交但行缺失）→ 显式 checkpoint-desync，禁止静默修复", async () => {
  const baseDir = tmpDir("store-desync");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-desync-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-desync-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [1], nextPageNum: 2, total: null, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  const fresh = new PgyKolTaskStore({ baseDir });
  await fresh.initialize();
  const task = await fresh.getTask("pgykol-desync-1");
  assert.equal(task.leaves[0].failure.kind, "checkpoint-desync");
  assert.equal(task.completeness, "cannot-prove");
});

test("任务存储：任务 ID 穿越防护与敏感字段隔离", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("store-security") });
  await store.initialize();
  await assert.rejects(store.getTask("../../escape"), /非法任务 ID/);
  await assert.rejects(store.getTask("CON"), /非法任务 ID/);
  await assert.rejects(store.getTask(""), /非法任务 ID/);
  // 合法任务创建必须成功（错误路径不得泄漏敏感词）。
  await store.createTask({ taskId: "pgykol-sec-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  // 行级敏感字段必须被隔离：cookie/token/authorization/x-s/x-t 永不落盘。
  await store.createTask({ taskId: "pgykol-sec-2", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-sec-2", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "pending",
    pagesCompleted: [], nextPageNum: 1, total: null, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  await store.appendPageRows("pgykol-sec-2", {
    leafId: "L0", pageNum: 1,
    rows: [{ uid: "u1", fields: { userId: "u1", cookie: "secret=1", Authorization: "Bearer x", "X-s": "sig", "X-t": "123", nickname: "甲" } }],
  });
  await store.commitPage("pgykol-sec-2", {
    leafId: "L0", pageNum: 1,
    summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 },
  });
  const rows = await store.getRows("pgykol-sec-2");
  assert.equal(rows.length, 1);
  assert.ok(!("cookie" in rows[0].fields));
  assert.ok(!("Authorization" in rows[0].fields));
  assert.ok(!("X-s" in rows[0].fields));
  assert.ok(!("X-t" in rows[0].fields));
  assert.equal(rows[0].fields.nickname, "甲");
});

test("批量引擎：接口形状与基础状态机（两页完成 → complete）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-basic") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-run-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 } });

  const pageBodies = [
    { total: 35, kols: makeKols(1, 20), capSignal: { capped: false, reason: null, exactTotalNotProven: true } },
    { total: 35, kols: makeKols(21, 15), capSignal: { capped: false, reason: null, exactTotalNotProven: true } },
  ];
  let pageIndex = 0;
  const calls = [];
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => {
        calls.push(payload.pageNum);
        const body = pageBodies[Math.min(pageIndex, pageBodies.length - 1)];
        pageIndex += 1;
        return { ...body, pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, uniqueUidCount: body.kols.length, kols: body.kols };
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  assert.equal(typeof runner.pause, "function");
  assert.equal(typeof runner.resume, "function");
  assert.equal(typeof runner.cancel, "function");
  await runner.start("pgykol-run-1");
  const task = await store.getTask("pgykol-run-1");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 35);
  assert.equal(task.counts.unique, 35);
  assert.equal(task.leaves[0].status, "done");
  assert.deepEqual(calls, [1, 2]);
});

test("批量引擎：跨页重复 UID 与缺 UID 分别计数", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-dedup") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-dedup-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  // total 必须以“可收集的唯一 UID 数”为准（fresh reviewer C2 语义）：
  // 15 新 + u-dup 新 + 13 新 = 29 唯一。
  const page1 = { total: 29, kols: [...makeKols(1, 15), { userId: "u-dup", nickname: "重复" }], capSignal: { capped: false, reason: null } };
  const page2 = { total: 29, kols: [{ userId: "u-dup", nickname: "重复" }, { nickname: "缺UID" }, ...makeKols(16, 13)], capSignal: { capped: false, reason: null } };
  const pages = [page1, page2];
  let index = 0;
  const runner = createPgyKolBatchRunner({
    store,
    search: { searchPage: async ({ payload }) => ({ ...pages[Math.min(index++, pages.length - 1)], pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0 }) },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-dedup-1");
  const task = await store.getTask("pgykol-dedup-1");
  // 页 1：16 行（15 新 + u-dup 新）；页 2：15 行（u-dup 重复 + 缺 UID + 13 新）。
  // raw = 31；唯一（真实去重后）= 29；重复 = 1；缺 UID = 1；total=29 → complete。
  assert.equal(task.counts.raw, 31);
  assert.equal(task.counts.unique, 29);
  assert.equal(task.counts.dup, 1);
  assert.equal(task.counts.missingUid, 1);
  assert.equal(task.completeness, "complete");
  const rows = await store.getRows("pgykol-dedup-1");
  assert.equal(rows.filter((row) => row.uid === null).length, 1, "缺 UID 行必须持久化且标记 uid=null");
});

test("批量引擎：暂停 → 恢复幂等；取消保留已持久化数据", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-control") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-ctl-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  let page = 0;
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => {
        page += 1;
        if (page === 2) {
          runner.pause("pgykol-ctl-1");
        }
        if (page >= 4) {
          runner.cancel("pgykol-ctl-1");
        }
        return { total: 100, kols: makeKols(page * 100, 20), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: false, reason: null } };
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-ctl-1");
  let task = await store.getTask("pgykol-ctl-1");
  assert.equal(task.status, "paused");
  assert.equal(task.counts.raw, 40, "第 1、2 页已提交后暂停（暂停请求在第 2 页请求期间生效）");

  // 恢复：不重复抓已提交页，从第 3 页继续；第 4 页请求期间收到取消。
  await runner.resume("pgykol-ctl-1");
  await runner.start("pgykol-ctl-1");
  task = await store.getTask("pgykol-ctl-1");
  assert.equal(task.status, "cancelled");
  assert.equal(task.counts.raw, 80, "取消后已持久化 4 页数据保留");
  const rows = await store.getRows("pgykol-ctl-1");
  assert.equal(rows.length, 80);
});

test("批量引擎：401/902 → auth-expired 可恢复暂停；461 → risk-control 立即停止；两者都不自动重试", async () => {
  for (const [code, kind, expectedStatus] of [
    [401, "auth-expired", "auth-expired"],
    [902, "auth-expired", "auth-expired"],
    [461, "risk-control", "risk-control"],
  ]) {
    const store = new PgyKolTaskStore({ baseDir: tmpDir(`runner-auth-${code}`) });
    await store.initialize();
    await store.createTask({ taskId: `pgykol-auth-${code}`, filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
    let attempts = 0;
    const runner = createPgyKolBatchRunner({
      store,
      search: {
        searchPage: async () => {
          attempts += 1;
          const error = new Error(`code ${code}`);
          error.kind = kind;
          error.pgyCode = code;
          throw error;
        },
      },
      buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
      planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
      analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    });
    await runner.start(`pgykol-auth-${code}`);
    const task = await store.getTask(`pgykol-auth-${code}`);
    assert.equal(task.status, expectedStatus);
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(attempts, 1, `${code} 不得自动重试`);
  }
});

test("批量引擎：transport/timeout/5xx 有限重试（最多 2 次）后失败分支 → failed/cannot-prove", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-retry") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-retry-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  let attempts = 0;
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async () => {
        attempts += 1;
        const error = new Error("timeout");
        error.kind = "timeout";
        throw error;
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    retry: { maxAttempts: 2, backoffMs: 0 },
  });
  await runner.start("pgykol-retry-1");
  const task = await store.getTask("pgykol-retry-1");
  assert.equal(task.status, "failed");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(attempts, 3, "1 次原始 + 2 次重试");
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");
  // failed 任务允许 resume 重试失败叶子：resume 后引擎重新执行并再次失败。
  await runner.resume("pgykol-retry-1");
  const retried = await store.getTask("pgykol-retry-1");
  assert.equal(retried.status, "failed");
  assert.equal(attempts, 6, "resume 后再次 1 次原始 + 2 次重试");
});

test("批量引擎：触顶后有限整数区间互斥切分 [L,M]/[M+1,U]，子叶子可完成", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-split") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-split-1",
    filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 },
    columns: ["userId"], pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  const planCalls = [];
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => {
        // 根叶子触顶；子叶子（有区间）不再触顶。
        const capped = payload.fansNumberUpper === 20000 && payload.fansNumberLower === 10000;
        // 子叶子必须返回各自唯一 UID（fresh reviewer C2：覆盖以唯一数证明）。
        const childBase = payload.fansNumberLower === 10000 ? 100000 : 200000;
        return { total: capped ? 5000 : 12, kols: capped ? makeKols(10000, 12) : makeKols(childBase, 12), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: capped ? { capped: true, reason: "total-window", exactTotalNotProven: true } : { capped: false, reason: null } };
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: (filterState) => {
      planCalls.push(filterState);
      const lower = filterState.fansNumberLower;
      const upper = filterState.fansNumberUpper;
      if (lower === 10000 && upper === 20000) {
        return { canSplit: true, dimension: "fansNumber", subRanges: [[10000, 15000], [15001, 20000]], reason: null };
      }
      return { canSplit: false, dimension: null, subRanges: [], reason: "range-too-small" };
    },
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-split-1");
  const task = await store.getTask("pgykol-split-1");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.summary.subqueryCount, 3, "1 个根叶子（触顶转 split）+ 2 个子叶子");
  assert.equal(task.counts.raw, 36);
  assert.equal(task.counts.unique, 36);
  const ranges = task.leaves.filter((leaf) => leaf.parentId).map((leaf) => leaf.range);
  assert.deepEqual(ranges, [[10000, 15000], [15001, 20000]]);
});

test("批量引擎：无安全切分维度 / 预算耗尽 / 重复页 → cannot-prove 且停止", async () => {
  // 无安全维度：根叶子触顶且无 fans 区间。
  {
    const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-nosplit") });
    await store.initialize();
    await store.createTask({ taskId: "pgykol-nosplit-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
    const runner = createPgyKolBatchRunner({
      store,
      search: { searchPage: async ({ payload }) => ({ total: 5000, kols: makeKols(1, 20), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: true, reason: "total-window" } }) },
      buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
      planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
      analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    });
    await runner.start("pgykol-nosplit-1");
    const task = await store.getTask("pgykol-nosplit-1");
    assert.equal(task.status, "incomplete");
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(task.leaves[0].status, "capped-unprovable");
    assert.equal(task.summary.stopReason, "capped-unprovable");
  }
  // 重复页信号：连续 newUidCount=0 页达到阈值 → 停止。
  {
    const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-repeat") });
    await store.initialize();
    await store.createTask({ taskId: "pgykol-repeat-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
    let pagesServed = 0;
    const runner = createPgyKolBatchRunner({
      store,
      search: {
        searchPage: async ({ payload }) => {
          pagesServed += 1;
          // 前两页返回完全相同 UID → 第二页起 newUidCount=0。
          return { total: 500, kols: makeKols(1, 20), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: false, reason: null } };
        },
      },
      buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
      planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
      analyzePageSequence: () => ({ repeatSignal: true, repeatAtPages: [2, 3] }),
    });
    await runner.start("pgykol-repeat-1");
    const task = await store.getTask("pgykol-repeat-1");
    assert.equal(task.status, "incomplete");
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(task.summary.stopReason, "repeat-page");
    assert.ok(pagesServed < 250, "重复页信号后必须停止翻页");
  }
  // 查询预算耗尽 → 停止并 cannot-prove。
  {
    const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-budget") });
    await store.initialize();
    await store.createTask({
      taskId: "pgykol-budget-1", filterState: { fansNumberLower: 1, fansNumberUpper: 100000 },
      columns: ["userId"], pageSize: 20,
      budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 2 },
    });
    const runner = createPgyKolBatchRunner({
      store,
      search: { searchPage: async ({ payload }) => ({ total: 5000, kols: makeKols(1, 20), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: true, reason: "total-window" } }) },
      buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
      planSplit: (filterState) => {
        const lower = filterState.fansNumberLower;
        const upper = filterState.fansNumberUpper;
        if (lower >= upper) return { canSplit: false, dimension: null, subRanges: [], reason: "range-too-small" };
        const mid = Math.floor((lower + upper) / 2);
        return { canSplit: true, dimension: "fansNumber", subRanges: [[lower, mid], [mid + 1, upper]], reason: null };
      },
      analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    });
    await runner.start("pgykol-budget-1");
    const task = await store.getTask("pgykol-budget-1");
    assert.equal(task.status, "incomplete");
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(task.summary.stopReason, "budget-exhausted");
    // 预算跨实例持久化（fresh reviewer I1）：queryBudget 消耗必须落盘，
    // 防止反复 resume 放大真实请求量。
    assert.equal(task.budgetUsed, 2, "budgetUsed 必须随 commitPage 持久化");
  }
});

test("批量引擎：持续短页打到页数上限 → cannot-prove（max-pages-reached），禁止伪装 complete", async () => {
  // 回归（fresh reviewer C1）：total=1000、每页只有 1 条新数据、不触顶、
  // 无重复页信号，页数上限 3 → 抓满 3 页后 raw=3 < total=1000，
  // 完整性必须为 cannot-prove 且带 stopReason。
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-maxpages") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-maxpages-1",
    filterState: {},
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 3, queryBudget: 100 },
  });
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => ({
        total: 1000,
        kols: [{ userId: `short-${payload.pageNum}`, nickname: `n${payload.pageNum}` }],
        pageNum: payload.pageNum,
        pageSize: payload.pageSize,
        code: 0,
        capSignal: { capped: false, reason: null },
      }),
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-maxpages-1");
  const task = await store.getTask("pgykol-maxpages-1");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "max-pages-reached");
  assert.equal(task.counts.raw, 3);
  assert.equal(task.leaves[0].status, "max-pages-unprovable");
  assert.ok(task.summary.warnings.some((warning) => warning.includes("最大页数")), "summary 必须携带 max-pages 警告");
});

test("批量引擎：重复行撑满 rawCount 但唯一数 < total → cannot-prove（fresh reviewer C2）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-c2-dup") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-c2-1",
    filterState: {},
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 3, queryBudget: 100 },
  });
  const pages = [
    // 页 1：20 个新 UID
    { kols: makeKols(1, 20) },
    // 页 2：10 个跨页重复 + 5 个新（newUidCount=5，不触发重复页信号）
    { kols: [...makeKols(1, 10), ...makeKols(100, 5)] },
    // 页 3：15 个跨页重复
    { kols: makeKols(1, 15) },
  ];
  let index = 0;
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => ({
        total: 35,
        kols: pages[Math.min(index++, pages.length - 1)].kols,
        pageNum: payload.pageNum,
        pageSize: payload.pageSize,
        code: 0,
        capSignal: { capped: false, reason: null },
      }),
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-c2-1");
  const task = await store.getTask("pgykol-c2-1");
  // raw = 50 >= total=35，但唯一数 = 25 < 35 → 覆盖不可证明。
  assert.equal(task.counts.raw, 50);
  assert.equal(task.counts.unique, 25);
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove", "重复撑满 rawCount 不得判 complete");
  assert.equal(task.summary.stopReason, "max-pages-reached");
});

test("批量引擎：失败页预算跨实例持久化，反复 resume 不得放大真实请求量（fresh reviewer C3）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-c3-budget") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-c3-1",
    filterState: {},
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 3 },
  });
  let calls = 0;
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async () => {
        calls += 1;
        const error = new Error("timeout");
        error.kind = "timeout";
        throw error;
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    retry: { maxAttempts: 2, backoffMs: 0 },
  });
  await runner.start("pgykol-c3-1");
  let task = await store.getTask("pgykol-c3-1");
  assert.equal(task.status, "failed");
  // 1 页 = 1 次原始 + 2 次重试 = 3 次真实请求，预算必须按真实请求数落盘。
  assert.equal(calls, 3);
  assert.equal(task.budgetUsed, 3, "失败页的预算消耗必须持久化");

  // 反复 resume：预算已耗尽，引擎不得再发出任何真实请求。
  await runner.resume("pgykol-c3-1");
  task = await store.getTask("pgykol-c3-1");
  assert.equal(calls, 3, "resume 后不得再发出真实请求（预算耗尽）");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "budget-exhausted");
});

test("任务存储：崩溃恢复窗口 B 用全局去重口径重算计数（fresh reviewer M1）", async () => {
  const baseDir = tmpDir("store-m1-recount");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-m1-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-m1-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [], nextPageNum: 1, total: 3, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  // 页 1 正常提交（u1 唯一）。
  await store.appendPageRows("pgykol-m1-1", { leafId: "L0", pageNum: 1, rows: [{ uid: "u1", fields: { userId: "u1" } }] });
  await store.commitPage("pgykol-m1-1", { leafId: "L0", pageNum: 1, summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 } });
  // 页 2 完整块已写但未提交：u1（跨页重复）+ u2（新）。
  await store.appendPageRows("pgykol-m1-1", {
    leafId: "L0", pageNum: 2,
    rows: [{ uid: "u1", fields: { userId: "u1" } }, { uid: "u2", fields: { userId: "u2" } }],
  });
  const fresh = new PgyKolTaskStore({ baseDir });
  await fresh.initialize();
  const task = await fresh.getTask("pgykol-m1-1");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2]);
  // 全局口径：raw=3、unique=2（u1,u2）、dup=1（页 2 的 u1）；页内口径会错报 unique=3。
  assert.deepEqual(task.counts, { raw: 3, unique: 2, dup: 1, missingUid: 0 });
  assert.equal(task.leaves[0].uniqueCount, 2);
  assert.equal(task.leaves[0].dupCount, 1);
});

test("批量引擎：split 叶子只有 1 个子叶子（半区间丢失）→ cannot-prove（fresh reviewer H1）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-h1-half") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-h1-half",
    filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 },
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  // 模拟“两个 addLeaf 之间崩溃”：split 父 + 仅 1 个 pending 子叶子。
  await store.addLeaf("pgykol-h1-half", {
    leafId: "L0", depth: 0, parentId: null, range: [10000, 20000],
    filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 },
    status: "split",
    pagesCompleted: [1], nextPageNum: 2,
    total: 5000,
    capSignal: { capped: true, reason: "total-window" },
    rawCount: 12, uniqueCount: 12, dupCount: 0, missingUidCount: 0,
    failure: null,
  });
  await store.addLeaf("pgykol-h1-half", {
    leafId: "L1", depth: 1, parentId: "L0", range: [10000, 15000],
    filterState: { fansNumberLower: 10000, fansNumberUpper: 15000 },
    status: "pending",
    pagesCompleted: [], nextPageNum: 1,
    total: null, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0,
    failure: null,
  });
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => ({
        total: 12,
        kols: makeKols(300000, 12),
        pageNum: payload.pageNum,
        pageSize: payload.pageSize,
        code: 0,
        capSignal: { capped: false, reason: null },
      }),
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({ canSplit: true, dimension: "fansNumber", subRanges: [[10000, 15000], [15001, 20000]], reason: null }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-h1-half");
  const task = await store.getTask("pgykol-h1-half");
  assert.equal(task.leaves.find((leaf) => leaf.leafId === "L1").status, "done");
  assert.equal(task.completeness, "cannot-prove", "半区间丢失（仅 1 个子叶子）不得判 complete");
});

test("批量引擎：checkpoint-desync 失败标记在 resume 后不得被清除（fresh reviewer H2）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-h2-desync") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-h2-1",
    filterState: {},
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  await store.addLeaf("pgykol-h2-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "capped-unprovable",
    pagesCompleted: [1], nextPageNum: 2,
    total: 5000,
    capSignal: { capped: true, reason: "total-window" },
    rawCount: 20, uniqueCount: 20, dupCount: 0, missingUidCount: 0,
    failure: { kind: "checkpoint-desync", pageNum: 1, message: "元数据超前于行块，禁止静默修复" },
  });
  const runner = createPgyKolBatchRunner({
    store,
    search: { searchPage: async () => { throw new Error("不应再发请求"); } },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-h2-1");
  const task = await store.getTask("pgykol-h2-1");
  assert.equal(task.leaves[0].failure.kind, "checkpoint-desync", "desync 标记必须保留");
  assert.equal(task.completeness, "cannot-prove", "desync 缺口不得被静默修复为 complete");
});

test("批量引擎：planSplit 形状非法（3 个区间）→ 拒绝切分并 cannot-prove，禁止静默丢弃子区间", async () => {
  // 回归（fresh reviewer L2）：互斥切分契约要求恰好 [L,M]/[M+1,U] 两个区间；
  // 形状不符时不得 slice(0,2) 静默截断。
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-splitshape") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-splitshape-1",
    filterState: { fansNumberLower: 10000, fansNumberUpper: 30000 },
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => ({
        total: 5000,
        kols: makeKols(1, 20),
        pageNum: payload.pageNum,
        pageSize: payload.pageSize,
        code: 0,
        capSignal: { capped: true, reason: "total-window" },
      }),
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({
      canSplit: true,
      dimension: "fansNumber",
      subRanges: [[10000, 15000], [15001, 25000], [25001, 30000]],
      reason: null,
    }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-splitshape-1");
  const task = await store.getTask("pgykol-splitshape-1");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.leaves[0].status, "capped-unprovable");
  assert.equal(task.leaves.length, 1, "形状非法时不得创建任何子叶子");
  assert.equal(task.summary.stopReason, "capped-unprovable");
});

test("批量引擎：split 叶子无子叶子（切分后崩溃窗口）→ 恢复后 cannot-prove（fresh reviewer H1）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-h1-split") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-h1-1",
    filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 },
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  // 模拟“已标记 split 但子叶子创建失败”的持久化状态。
  await store.addLeaf("pgykol-h1-1", {
    leafId: "L0", depth: 0, parentId: null, range: [10000, 20000],
    filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 },
    status: "split",
    pagesCompleted: [1], nextPageNum: 2,
    total: 5000,
    capSignal: { capped: true, reason: "total-window" },
    rawCount: 20, uniqueCount: 20, dupCount: 0, missingUidCount: 0,
    failure: null,
  });
  const runner = createPgyKolBatchRunner({
    store,
    search: { searchPage: async () => { throw new Error("不应再发请求"); } },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: () => ({ canSplit: true, dimension: "fansNumber", subRanges: [[10000, 15000], [15001, 20000]], reason: null }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
  });
  await runner.start("pgykol-h1-1");
  const task = await store.getTask("pgykol-h1-1");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove", "split 无子叶子不得判 complete");
  assert.ok(task.summary.warnings.some((warning) => warning.includes("capped")), "summary 必须保留 capped 警告");
});

test("批量引擎：预算落盘失败必须可见，不得静默吞掉（fresh reviewer M2）", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("runner-m2-budget") });
  await store.initialize();
  await store.createTask({
    taskId: "pgykol-m2-1",
    filterState: {},
    columns: ["userId"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  const original = store.setTaskBudget.bind(store);
  store.setTaskBudget = async () => {
    throw new Error("disk full");
  };
  const runner = createPgyKolBatchRunner({
    store,
    search: {
      searchPage: async ({ payload }) => {
        const error = new Error("timeout");
        error.kind = "timeout";
        throw error;
      },
    },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ pageNum, pageSize }),
    planSplit: () => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" }),
    analyzePageSequence: () => ({ repeatSignal: false, repeatAtPages: [] }),
    retry: { maxAttempts: 0, backoffMs: 0 },
  });
  await assert.rejects(
    runner.start("pgykol-m2-1"),
    /预算落盘失败/,
    "预算持久化失败必须向上抛，不得静默吞掉",
  );
  store.setTaskBudget = original;
});

test("任务存储：getRows 只返回已提交页（运行中未提交页不进入导出/去重）", async () => {
  // 回归（fresh reviewer L1）：导出/计数一致性——append 后未 commit 的页
  // 不得出现在 getRows 结果中。
  const store = new PgyKolTaskStore({ baseDir: tmpDir("store-committed-rows") });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-committed-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-committed-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [], nextPageNum: 1, total: 2, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  await store.appendPageRows("pgykol-committed-1", { leafId: "L0", pageNum: 1, rows: [{ uid: "u1", fields: { userId: "u1" } }] });
  await store.commitPage("pgykol-committed-1", { leafId: "L0", pageNum: 1, summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 } });
  // 第 2 页只追加未提交（运行中中间态）。
  await store.appendPageRows("pgykol-committed-1", { leafId: "L0", pageNum: 2, rows: [{ uid: "u2", fields: { userId: "u2" } }] });
  const rows = await store.getRows("pgykol-committed-1");
  assert.equal(rows.length, 1, "未提交页不得出现在 getRows");
  assert.equal(rows[0].pageNum, 1);
});

test("任务存储与 IPC：磁盘错误消息不得泄漏本地绝对路径", async () => {
  // 回归（fresh reviewer M1）：fs 错误消息（EACCES/ENOTDIR/EISDIR）常携带
  // 绝对路径；store 上抛前与 IPC 错误封装都必须脱敏。
  // 先直接验证脱敏函数（确定性），再用真实 fs 错误验证 store 不泄漏。
  const redacted = redactLocalPathText(
    "EACCES: permission denied, open 'C:\\Users\\someone\\AppData\\Roaming\\magiorix-desktop\\pgy-kol-tasks\\t1\\rows.jsonl'",
  );
  assert.ok(!redacted.includes("C:\\Users"), redacted);
  assert.ok(redacted.includes("[local-path-redacted]"), redacted);
  const redactedUnc = redactLocalPathText("read '\\\\server\\share\\task\\rows.jsonl'");
  assert.ok(!redactedUnc.includes("server"), redactedUnc);
  assert.ok(redactedUnc.includes("[local-path-redacted]"), redactedUnc);
  // 正斜杠盘符路径（fresh reviewer L1）。
  const redactedForward = redactLocalPathText("open 'C:/Users/someone/AppData/Roaming/task/rows.jsonl'");
  assert.ok(!redactedForward.includes("C:/Users"), redactedForward);
  assert.ok(redactedForward.includes("[local-path-redacted]"), redactedForward);
  // 引号包裹且含空格的路径（fresh reviewer M1）：必须整体脱敏，不得泄漏尾部。
  const redactedSpace = redactLocalPathText(
    "EACCES: permission denied, open 'C:\\Users\\my folder\\AppData\\Roaming\\app\\tasks\\t1\\rows.jsonl'",
  );
  assert.ok(!redactedSpace.includes("my folder"), redactedSpace);
  assert.ok(!redactedSpace.includes("rows.jsonl"), redactedSpace);
  assert.ok(redactedSpace.includes("[local-path-redacted]"), redactedSpace);

  const baseDir = tmpDir("store-path-redact");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-path-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  // 把 rows.jsonl 替换为目录 → fs.readFile 抛 EISDIR（消息含绝对路径）。
  const rowsPath = path.join(baseDir, "pgykol-path-1", "rows.jsonl");
  fs.rmSync(rowsPath, { force: true });
  fs.mkdirSync(rowsPath, { recursive: true });
  await assert.rejects(
    store.getRows("pgykol-path-1"),
    (err) => {
      const message = String(err.message);
      assert.ok(!message.includes(baseDir), `错误消息泄漏绝对路径: ${message}`);
      assert.ok(!message.includes("pgy-kol-tasks"), `错误消息泄漏目录名: ${message}`);
      assert.ok(!/[A-Za-z]:\\/.test(message), `错误消息仍包含盘符路径: ${message}`);
      return true;
    },
    "getRows 磁盘错误必须脱敏路径",
  );
});

test("任务存储：元数据缺 leaves 不得抛未脱敏异常（fresh reviewer I1）", async () => {
  const baseDir = tmpDir("store-no-leaves");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-noleaves-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  // 破坏元数据：移除 leaves 字段（模拟损坏）。
  const taskPath = path.join(baseDir, "pgykol-noleaves-1", "task.json");
  const metadata = JSON.parse(fs.readFileSync(taskPath, "utf8"));
  delete metadata.leaves;
  fs.writeFileSync(taskPath, JSON.stringify(metadata, null, 2), "utf8");
  const fresh = new PgyKolTaskStore({ baseDir });
  await fresh.initialize();
  const task = await fresh.getTask("pgykol-noleaves-1");
  assert.ok(task, "损坏元数据必须可读且不抛未脱敏 TypeError");
  assert.ok(Array.isArray(task.leaves) || task.leaves === undefined);
});

test("导出：从持久化全量行构建两行表头 Payload，字段顺序 = 用户列选择", () => {
  const task = {
    taskId: "pgykol-export-1",
    fileName: "pgykol-export-1.xlsx",
    columns: ["nickname", "userId", "fansNum"],
  };
  const rows = [
    { leafId: "L0", pageNum: 1, uid: "u1", fields: { nickname: "甲", userId: "u1", fansNum: 100, videoPrice: 99 } },
    { leafId: "L0", pageNum: 1, uid: "u2", fields: { nickname: "乙", userId: "u2", fansNum: 200 } },
  ];
  const payload = buildPgyKolBatchExportPayload(task, rows);
  assert.equal(payload.mode, "two-row");
  assert.deepEqual(payload.headers.map((header) => header.key), ["nickname", "userId", "fansNum"]);
  assert.deepEqual(payload.headers.map((header) => header.label), ["昵称", "博主UID", "粉丝数"]);
  assert.equal(payload.data.length, 2);
  assert.deepEqual(Object.keys(payload.data[0]), ["nickname", "userId", "fansNum"]);
  // 未选列（videoPrice）不得出现在导出行。
  assert.ok(!("videoPrice" in payload.data[0]));
});

// ---------- helpers ----------

let tmpCounter = 0;
function tmpDir(label) {
  tmpCounter += 1;
  const dir = path.join(os.tmpdir(), `pgy-kol-batch-contract-${process.pid}-${tmpCounter}-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

function makeKols(start, count) {
  const kols = [];
  for (let i = 0; i < count; i += 1) {
    kols.push({ userId: `uid-${start + i}`, nickname: `博主${start + i}`, fansNum: 1000 + i });
  }
  return kols;
}
