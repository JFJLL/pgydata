// 蒲公英“找博主”Phase 4 工作包 A：批量采集引擎单元测试（红→绿）。
//
// 使用内存 fake store 记录调用与状态，契约文件负责与真实 store 的集成。
// 覆盖：两页完成/末页不足/空结果、同页与跨页重复 UID、缺 UID、暂停（页边界）、
// 恢复幂等（已提交页不重抓）、取消保留数据、401/902/461 不重试、
// timeout/5xx 有限重试与退避、api/invalid-response 不重试、触顶互斥切分、
// 无安全维度 capped-unprovable、单点区间仍触顶、预算耗尽、重复页停止、
// 写盘顺序（appendPageRows 先于 commitPage）、事件推送、resume(failed) 重试、
// resume 拒绝 risk-control/cancelled/completed。

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createPgyKolBatchRunner } from "../../app-source/pgy-kol/pgy-kol-batch-runner.mjs";

const MODULE_URL = new URL("../../app-source/pgy-kol/pgy-kol-batch-runner.mjs", import.meta.url);

// ---------- helpers ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeKols(start, count) {
  const kols = [];
  for (let i = 0; i < count; i += 1) {
    kols.push({ userId: `uid-${start + i}`, nickname: `博主${start + i}`, fansNum: 1000 + i });
  }
  return kols;
}

function okPage({ total, kols, capped = false, reason = null, pageNum = 1, pageSize = 20 } = {}) {
  return {
    code: 0,
    total,
    kols,
    pageNum,
    pageSize,
    uniqueUidCount: kols.filter((kol) => typeof kol.userId === "string" || typeof kol.userId === "number").length,
    capSignal: { capped, reason, exactTotalNotProven: true },
  };
}

class FakeStore {
  constructor() {
    this.tasks = new Map();
    this.rows = [];
    this.calls = {
      setStatus: [],
      addLeaf: [],
      updateLeaf: [],
      appendPageRows: [],
      commitPage: [],
      order: [],
    };
    this.getResumeStateCalls = 0;
  }

  async createTask({ taskId, filterState = {}, columns = [], pageSize = 20, budgets = {} } = {}) {
    if (this.tasks.has(taskId)) {
      throw new Error(`任务已存在: ${taskId}`);
    }
    const task = {
      taskId,
      filterState: { ...filterState },
      columns: [...columns],
      pageSize,
      budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400, ...budgets },
      status: "running",
      completeness: "not-started",
      counts: { raw: 0, unique: 0, dup: 0, missingUid: 0 },
      leaves: [],
      summary: null,
    };
    this.tasks.set(taskId, task);
    return structuredClone(task);
  }

  async getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : null;
  }

  async setStatus(taskId, status) {
    const task = this.requireTask(taskId);
    task.status = status;
    this.calls.setStatus.push({ taskId, status });
  }

  async setCompleteness(taskId, completeness, extra = {}) {
    const task = this.requireTask(taskId);
    task.completeness = completeness;
    if (extra && typeof extra === "object") {
      if (extra.summary && typeof extra.summary === "object") {
        task.summary = { ...(task.summary ?? {}), ...structuredClone(extra.summary) };
      } else {
        for (const [key, value] of Object.entries(extra)) {
          task[key] = structuredClone(value);
        }
      }
    }
  }

  async addLeaf(taskId, leaf) {
    const task = this.requireTask(taskId);
    task.leaves.push(structuredClone(leaf));
    this.calls.addLeaf.push({ taskId, leaf: structuredClone(leaf) });
  }

  async updateLeaf(taskId, leaf) {
    const task = this.requireTask(taskId);
    const index = task.leaves.findIndex((item) => item.leafId === leaf.leafId);
    if (index < 0) {
      throw new Error(`叶子不存在: ${leaf.leafId}`);
    }
    task.leaves[index] = structuredClone(leaf);
    this.calls.updateLeaf.push({ taskId, leaf: structuredClone(leaf) });
  }

  async appendPageRows(taskId, { leafId, pageNum, rows }) {
    this.calls.appendPageRows.push({ taskId, leafId, pageNum, rows: structuredClone(rows) });
    this.calls.order.push({ type: "appendPageRows", pageNum, leafId });
    for (const row of rows) {
      this.rows.push({ leafId, pageNum, uid: row.uid, fields: structuredClone(row.fields) });
    }
  }

  async commitPage(taskId, { leafId, pageNum, summary }) {
    const task = this.requireTask(taskId);
    const leaf = task.leaves.find((item) => item.leafId === leafId);
    if (!leaf) {
      throw new Error(`叶子不存在: ${leafId}`);
    }
    task.counts.raw += summary.rawCount;
    task.counts.unique += summary.uniqueCount;
    task.counts.dup += summary.dupCount;
    task.counts.missingUid += summary.missingUidCount;
    leaf.pagesCompleted.push(pageNum);
    leaf.nextPageNum = pageNum + 1;
    if (Number.isFinite(summary.budgetUsed)) {
      task.budgetUsed = Number(summary.budgetUsed);
    }
    this.calls.commitPage.push({ taskId, leafId, pageNum, summary: { ...summary } });
    this.calls.order.push({ type: "commitPage", pageNum, leafId });
  }

  async getRows() {
    return structuredClone(this.rows);
  }

  async getResumeState(taskId) {
    this.getResumeStateCalls += 1;
    const task = this.requireTask(taskId);
    return { leaves: structuredClone(task.leaves) };
  }

  async setTaskBudget(taskId, budgetUsed) {
    const task = this.requireTask(taskId);
    task.budgetUsed = Number(budgetUsed);
  }

  async setTaskBudgets(taskId, budgets) {
    const task = this.requireTask(taskId);
    task.budgets = { ...(task.budgets ?? {}), ...structuredClone(budgets) };
  }

  requireTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }
    return task;
  }
}

function makeRunner({
  store,
  searchImpl,
  planSplitImpl,
  analyzeImpl,
  retry,
  onEvent,
  sessionProvider,
} = {}) {
  return createPgyKolBatchRunner({
    store,
    search: { searchPage: searchImpl },
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: planSplitImpl ?? (() => ({ canSplit: false, dimension: null, subRanges: [], reason: "no-safe-dimension" })),
    analyzePageSequence: analyzeImpl ?? (() => ({ repeatSignal: false, repeatAtPages: [] })),
    retry,
    now: () => 0,
    onEvent,
    sessionProvider,
  });
}

async function createStoreTask(store, taskId, { filterState = {}, pageSize = 20, budgets = {} } = {}) {
  await store.createTask({
    taskId,
    filterState,
    columns: ["userId", "nickname", "fansNum"],
    pageSize,
    budgets,
  });
}

function splitPlanner(filterState) {
  const lower = Number(filterState.fansNumberLower);
  const upper = Number(filterState.fansNumberUpper);
  if (!Number.isInteger(lower) || !Number.isInteger(upper) || lower >= upper) {
    return { canSplit: false, dimension: "fansNumber", subRanges: [], reason: "range-too-small" };
  }
  const mid = Math.floor((lower + upper) / 2);
  return { canSplit: true, dimension: "fansNumber", subRanges: [[lower, mid], [mid + 1, upper]], reason: null };
}

function repeatAnalyzer({ pages }) {
  let zeroRun = 0;
  for (const page of pages) {
    zeroRun = page.newUidCount === 0 ? zeroRun + 1 : 0;
  }
  return { repeatSignal: zeroRun >= 2, repeatAtPages: [] };
}

// ---------- tests ----------

test("两页完成：状态 completed、完整性 complete、计数正确、页序列 [1,2]", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-two-page");
  const pages = [
    okPage({ total: 35, kols: makeKols(1, 20) }),
    okPage({ total: 35, kols: makeKols(21, 15) }),
  ];
  let index = 0;
  const pageNums = [];
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      const body = pages[Math.min(index, pages.length - 1)];
      index += 1;
      pageNums.push(payload.pageNum);
      return { ...body, pageNum: payload.pageNum, pageSize: payload.pageSize };
    },
  });

  await runner.start("t-two-page");

  const task = await store.getTask("t-two-page");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.deepEqual(task.counts, { raw: 35, unique: 35, dup: 0, missingUid: 0 });
  assert.equal(task.leaves.length, 1);
  assert.equal(task.leaves[0].status, "done");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2]);
  assert.deepEqual(pageNums, [1, 2]);
  assert.equal(task.summary.subqueryCount, 1);
  assert.equal(task.summary.stopReason, null);
});

test("最后一页不足 pageSize：末页行数不足且 rawCount 达到 total 即停止", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-last-short");
  let index = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      index += 1;
      return okPage({ total: 30, kols: index === 1 ? makeKols(1, 20) : makeKols(21, 10), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-last-short");

  const task = await store.getTask("t-last-short");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 30);
  assert.equal(task.leaves[0].status, "done");
  assert.deepEqual(store.calls.appendPageRows.map((call) => call.pageNum), [1, 2]);
});

test("空结果：单页返回 0 行即完成，不再翻页", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-empty");
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      pagesServed += 1;
      return okPage({ total: 0, kols: [], pageNum: payload.pageNum });
    },
  });

  await runner.start("t-empty");

  const task = await store.getTask("t-empty");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.deepEqual(task.counts, { raw: 0, unique: 0, dup: 0, missingUid: 0 });
  assert.equal(pagesServed, 1);
  assert.equal(task.leaves[0].status, "done");
});

test("同页与跨页重复 UID：去重只计一次唯一，重复数正确（短页在 rawCount<total 时继续翻页）", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-dup");
  const page1 = [
    ...makeKols(1, 15),
    { userId: "u-dup", nickname: "重复" },
    { userId: "u-dup", nickname: "重复（同页第二次出现）" },
  ];
  const page2 = [
    { userId: "u-dup", nickname: "重复（跨页）" },
    { nickname: "缺UID" },
    ...makeKols(16, 13),
  ];
  let index = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      index += 1;
      return okPage({ total: 29, kols: index === 1 ? page1 : page2, pageNum: payload.pageNum });
    },
  });

  await runner.start("t-dup");

  const task = await store.getTask("t-dup");
  // 页 1：17 行（15 新 + u-dup 新 + u-dup 同页重复）；页 2：15 行（u-dup 跨页重复 + 缺 UID + 13 新）。
  // raw=32；唯一=29（真实去重 UID，缺 UID 行不计入）；重复=2；缺 UID=1；total=29 → complete。
  assert.deepEqual(task.counts, { raw: 32, unique: 29, dup: 2, missingUid: 1 });
  const rows = await store.getRows("t-dup");
  assert.equal(rows.length, 32);
  assert.equal(rows.filter((row) => row.uid === null).length, 1, "缺 UID 行必须持久化且标记 uid=null");
});

test("缺 UID：缺失/空/非有限 userId → uid=null 持久化且计数", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-missing-uid");
  const kols = [
    { nickname: "无 userId 字段" },
    { userId: "", nickname: "空字符串" },
    { userId: "  ", nickname: "空白字符串（length>0，与 search client 口径一致视为有效 uid）" },
    { userId: Number.NaN, nickname: "NaN" },
    { userId: 12345, nickname: "数字 id" },
    { userId: "u-ok", nickname: "正常 id" },
  ];
  const runner = makeRunner({
    store,
    // total 按可收集的唯一 UID 数（fresh reviewer C2：缺 UID 行不计入覆盖）。
    searchImpl: async ({ payload }) => okPage({ total: 3, kols, pageNum: payload.pageNum }),
  });

  await runner.start("t-missing-uid");

  const task = await store.getTask("t-missing-uid");
  assert.equal(task.counts.raw, 6);
  assert.equal(task.counts.unique, 3, "唯一数 = 真实去重 UID（缺 UID 行不计入唯一，单独计数）");
  assert.equal(task.counts.missingUid, 3, "缺失：undefined / 空字符串 / NaN");
  assert.equal(task.counts.dup, 0);
  const rows = await store.getRows("t-missing-uid");
  assert.equal(rows.filter((row) => row.uid === null).length, 3, "缺 UID 行必须持久化且标记 uid=null");
  assert.ok(rows.some((row) => row.uid === "12345"), "有限数字 userId 必须归一化为字符串 uid");
});

test("暂停（页边界）：第 2 页请求期间暂停，第 2 页仍提交后停止", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-pause");
  let page = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      page += 1;
      if (page === 2) {
        runner.pause("t-pause");
      }
      return okPage({ total: 100, kols: makeKols(page * 100, 20), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-pause");

  const task = await store.getTask("t-pause");
  assert.equal(task.status, "paused");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.counts.raw, 40, "第 1、2 页已提交后暂停");
});

test("恢复幂等：resume 不重抓已提交页，appendPageRows 页号序列连续", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-resume");
  let page = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      page += 1;
      if (page === 2) {
        runner.pause("t-resume");
      }
      return okPage({ total: 100, kols: makeKols(page * 100, 20), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-resume");
  assert.equal((await store.getTask("t-resume")).status, "paused");
  assert.deepEqual(store.calls.appendPageRows.map((call) => call.pageNum), [1, 2]);

  await runner.resume("t-resume");

  const task = await store.getTask("t-resume");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 100, "恢复后从第 3 页继续到 total=100");
  assert.deepEqual(
    store.calls.appendPageRows.map((call) => call.pageNum),
    [1, 2, 3, 4, 5],
    "已提交页不得重抓",
  );
  assert.equal(store.rows.length, 100, "行不得重复写入");
});

test("取消保留数据：第 2 页请求期间取消，已持久化数据保留", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-cancel");
  let page = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      page += 1;
      if (page === 2) {
        runner.cancel("t-cancel");
      }
      return okPage({ total: 100, kols: makeKols(page * 100, 20), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-cancel");

  const task = await store.getTask("t-cancel");
  assert.equal(task.status, "cancelled");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.counts.raw, 40);
  assert.equal(store.rows.length, 40, "取消后已持久化数据保留");

  // start 对终态任务为 no-op，不得重启采集。
  const appendedBefore = store.calls.appendPageRows.length;
  await runner.start("t-cancel");
  const after = await store.getTask("t-cancel");
  assert.equal(after.status, "cancelled");
  assert.equal(store.calls.appendPageRows.length, appendedBefore);
});

test("401/902 → auth-expired 立即停止且不重试", async () => {
  for (const code of [401, 902]) {
    const store = new FakeStore();
    await createStoreTask(store, `t-auth-${code}`);
    let attempts = 0;
    const runner = makeRunner({
      store,
      searchImpl: async () => {
        attempts += 1;
        const error = new Error(`code ${code}`);
        error.kind = "auth-expired";
        error.pgyCode = code;
        throw error;
      },
    });

    await runner.start(`t-auth-${code}`);

    const task = await store.getTask(`t-auth-${code}`);
    assert.equal(task.status, "auth-expired");
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(attempts, 1, `${code} 不得自动重试`);
    assert.equal(task.leaves[0].failure, null, "auth-expired 不产生叶子 failure");
  }
});

test("461 → risk-control 立即停止且不重试", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-risk");
  let attempts = 0;
  const runner = makeRunner({
    store,
    searchImpl: async () => {
      attempts += 1;
      const error = new Error("code 461");
      error.kind = "risk-control";
      error.pgyCode = 461;
      throw error;
    },
  });

  await runner.start("t-risk");

  const task = await store.getTask("t-risk");
  assert.equal(task.status, "risk-control");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(attempts, 1, "461 不得自动重试");
});

test("timeout 有限重试 + 退避可测（backoffMs 注入）+ 错误信息脱敏", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-retry");
  let attempts = 0;
  const startedAt = Date.now();
  const runner = makeRunner({
    store,
    retry: { maxAttempts: 2, backoffMs: 20 },
    searchImpl: async () => {
      attempts += 1;
      const error = new Error("timeout token=SECRETTOKEN session=SESSIONVAL");
      error.kind = "timeout";
      throw error;
    },
  });

  await runner.start("t-retry");

  const elapsed = Date.now() - startedAt;
  const task = await store.getTask("t-retry");
  assert.equal(task.status, "failed");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(attempts, 3, "1 次原始 + 2 次重试");
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");
  assert.equal(task.leaves[0].failure.attempts, 3);
  assert.ok(!task.leaves[0].failure.message.includes("SECRETTOKEN"), "错误信息必须脱敏");
  assert.ok(!task.leaves[0].failure.message.includes("SESSIONVAL"), "session 值不得泄漏");
  assert.ok(elapsed >= 40, `退避应至少 20+40ms，实际 ${elapsed}ms`);
});

test("http 5xx 重试 2 次；http 4xx 不重试", async () => {
  // 5xx：重试
  {
    const store = new FakeStore();
    await createStoreTask(store, "t-http5");
    let attempts = 0;
    const runner = makeRunner({
      store,
      retry: { maxAttempts: 2, backoffMs: 0 },
      searchImpl: async () => {
        attempts += 1;
        const error = new Error("HTTP 503");
        error.kind = "http";
        error.httpStatusCode = 503;
        throw error;
      },
    });
    await runner.start("t-http5");
    assert.equal(attempts, 3);
    assert.equal((await store.getTask("t-http5")).status, "failed");
  }
  // 4xx：立即失败
  {
    const store = new FakeStore();
    await createStoreTask(store, "t-http4");
    let attempts = 0;
    const runner = makeRunner({
      store,
      retry: { maxAttempts: 2, backoffMs: 0 },
      searchImpl: async () => {
        attempts += 1;
        const error = new Error("HTTP 400");
        error.kind = "http";
        error.httpStatusCode = 400;
        throw error;
      },
    });
    await runner.start("t-http4");
    const task = await store.getTask("t-http4");
    assert.equal(attempts, 1, "http 4xx 不得重试");
    assert.equal(task.status, "failed");
    assert.equal(task.leaves[0].failure.attempts, 1);
  }
});

test("api code!=0 不重试，叶子立即失败", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-api");
  let attempts = 0;
  const runner = makeRunner({
    store,
    searchImpl: async () => {
      attempts += 1;
      const error = new Error("PGY API error (code 500)");
      error.kind = "api";
      error.pgyCode = 500;
      throw error;
    },
  });

  await runner.start("t-api");

  const task = await store.getTask("t-api");
  assert.equal(attempts, 1, "api 错误不得重试");
  assert.equal(task.status, "failed");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");
  assert.equal(task.leaves[0].failure.attempts, 1);
});

test("invalid-response 不重试，叶子立即失败", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-invalid");
  let attempts = 0;
  const runner = makeRunner({
    store,
    searchImpl: async () => {
      attempts += 1;
      const error = new Error("蒲公英搜索响应结构不合法");
      error.kind = "invalid-response";
      throw error;
    },
  });

  await runner.start("t-invalid");

  const task = await store.getTask("t-invalid");
  assert.equal(attempts, 1, "invalid-response 不得重试");
  assert.equal(task.status, "failed");
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");
});

test("触顶有限区间互斥切分 [L,M]/[M+1,U]：子叶子可完成且 complete", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-split", { filterState: { fansNumberLower: 10000, fansNumberUpper: 20000 } });
  const runner = makeRunner({
    store,
    planSplitImpl: splitPlanner,
    searchImpl: async ({ payload }) => {
      const capped = payload.fansNumberUpper === 20000 && payload.fansNumberLower === 10000;
      // 子叶子必须返回各自唯一 UID（fresh reviewer C2：覆盖以唯一数证明）。
      const childBase = payload.fansNumberLower === 10000 ? 100000 : 200000;
      return okPage({
        total: capped ? 5000 : 12,
        kols: capped ? makeKols(10000, 12) : makeKols(childBase, 12),
        capped,
        reason: capped ? "total-window" : null,
        pageNum: payload.pageNum,
      });
    },
  });

  await runner.start("t-split");

  const task = await store.getTask("t-split");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete", "根叶子已切分，子叶子完整 → complete");
  assert.equal(task.summary.subqueryCount, 3, "1 个根叶子（触顶转 split）+ 2 个子叶子");
  assert.equal(task.counts.raw, 36);
  assert.equal(task.counts.unique, 36);
  const children = task.leaves.filter((leaf) => leaf.parentId);
  assert.deepEqual(children.map((leaf) => leaf.range), [[10000, 15000], [15001, 20000]]);
  assert.deepEqual(children.map((leaf) => leaf.filterState.fansNumberLower), [10000, 15001]);
  assert.deepEqual(children.map((leaf) => leaf.filterState.fansNumberUpper), [15000, 20000]);
  assert.equal(task.leaves[0].status, "split");
});

test("无安全维度（无 fans 区间）触顶 → capped-unprovable / cannot-prove", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-nosplit");
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) =>
      okPage({ total: 5000, kols: makeKols(1, 20), capped: true, reason: "total-window", pageNum: payload.pageNum }),
  });

  await runner.start("t-nosplit");

  const task = await store.getTask("t-nosplit");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.leaves[0].status, "capped-unprovable");
  assert.equal(task.summary.stopReason, "capped-unprovable");
});

test("区间收敛到单点仍触顶 → capped-unprovable / cannot-prove", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-single-point", { filterState: { fansNumberLower: 1, fansNumberUpper: 2 } });
  const runner = makeRunner({
    store,
    planSplitImpl: splitPlanner,
    searchImpl: async ({ payload }) =>
      okPage({ total: 5000, kols: makeKols(1, 5), capped: true, reason: "total-window", pageNum: payload.pageNum }),
  });

  await runner.start("t-single-point");

  const task = await store.getTask("t-single-point");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.ok(task.leaves.some((leaf) => leaf.status === "capped-unprovable"), "单点区间仍触顶必须 capped-unprovable");
  assert.ok(task.leaves.some((leaf) => leaf.range && leaf.range[0] === leaf.range[1]), "必须产生单点子区间");
});

test("预算耗尽：queryBudget 用尽停止，stopReason=budget-exhausted", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-budget", {
    filterState: { fansNumberLower: 1, fansNumberUpper: 100000 },
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 2 },
  });
  const runner = makeRunner({
    store,
    planSplitImpl: splitPlanner,
    searchImpl: async ({ payload }) =>
      okPage({ total: 5000, kols: makeKols(1, 20), capped: true, reason: "total-window", pageNum: payload.pageNum }),
  });

  await runner.start("t-budget");

  const task = await store.getTask("t-budget");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "budget-exhausted");
  assert.ok(store.calls.appendPageRows.length <= 2, "预算耗尽后不得继续抓页");
});

test("重复页：连续 newUidCount=0 达到阈值 → 停止，stopReason=repeat-page", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-repeat");
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    analyzeImpl: repeatAnalyzer,
    searchImpl: async ({ payload }) => {
      pagesServed += 1;
      // 每页都返回完全相同 UID → 第 2 页起 newUidCount=0。
      return okPage({ total: 500, kols: makeKols(1, 20), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-repeat");

  const task = await store.getTask("t-repeat");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "repeat-page");
  assert.equal(pagesServed, 3, "第 3 页连续 2 次零新增后停止");
});

test("写盘顺序：appendPageRows 先于 commitPage（行先于元数据）", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-order");
  let index = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      index += 1;
      return okPage({ total: 35, kols: index === 1 ? makeKols(1, 20) : makeKols(21, 15), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-order");

  const order = store.calls.order;
  assert.equal(order.length, 4, "两页 × （append + commit）");
  for (let i = 0; i < order.length; i += 2) {
    assert.equal(order[i].type, "appendPageRows", "第 i 次必须先写行");
    assert.equal(order[i + 1].type, "commitPage", "然后才推进游标");
    assert.equal(order[i].pageNum, order[i + 1].pageNum);
  }
});

test("事件推送：progress 每页一次，status 覆盖 running/completed，done 带 summary", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-events");
  const events = [];
  let index = 0;
  const runner = makeRunner({
    store,
    onEvent: (event) => events.push(event),
    searchImpl: async ({ payload }) => {
      index += 1;
      return okPage({ total: 35, kols: index === 1 ? makeKols(1, 20) : makeKols(21, 15), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-events");

  assert.equal(events.filter((event) => event.type === "progress").length, 2);
  assert.ok(events.some((event) => event.type === "status" && event.status === "running"));
  assert.ok(events.some((event) => event.type === "status" && event.status === "completed"));
  const progress = events.find((event) => event.type === "progress");
  assert.ok(progress.counts, "progress 必须携带最新 counts");
  assert.equal(typeof progress.leafPages, "number");
  assert.equal(typeof progress.leafCount, "number");
  const done = events.find((event) => event.type === "done");
  assert.equal(done.status, "completed");
  assert.equal(done.completeness, "complete");
  assert.equal(done.summary.subqueryCount, 1);
  assert.equal(done.summary.stopReason, null);
});

test("resume(failed)：重试失败叶子，恢复成功后不再重抓已提交页", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-fail-resume");
  let failPage2 = true;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      if (payload.pageNum === 2 && failPage2) {
        const error = new Error("boom");
        error.kind = "transport";
        throw error;
      }
      return okPage({
        total: 35,
        kols: payload.pageNum === 1 ? makeKols(1, 20) : makeKols(21, 15),
        pageNum: payload.pageNum,
      });
    },
  });

  await runner.start("t-fail-resume");
  let task = await store.getTask("t-fail-resume");
  assert.equal(task.status, "failed");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.counts.raw, 20);
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");

  failPage2 = false;
  await runner.resume("t-fail-resume");
  task = await store.getTask("t-fail-resume");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 35);
  assert.deepEqual(store.calls.appendPageRows.map((call) => call.pageNum), [1, 2], "第 2 页只写一次");
  assert.equal(store.rows.length, 35);
});

test("resume(failed) 再次失败：状态仍 failed，attempts 累计", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-fail-again");
  let attempts = 0;
  const runner = makeRunner({
    store,
    retry: { maxAttempts: 1, backoffMs: 0 },
    searchImpl: async () => {
      attempts += 1;
      const error = new Error("timeout");
      error.kind = "timeout";
      throw error;
    },
  });

  await runner.start("t-fail-again");
  assert.equal(attempts, 2, "1 次原始 + 1 次重试");
  await runner.resume("t-fail-again");
  assert.equal(attempts, 4, "resume 后再次 1 次原始 + 1 次重试");

  const task = await store.getTask("t-fail-again");
  assert.equal(task.status, "failed");
  assert.equal(task.leaves[0].failure.kind, "leaf-failed");
  assert.equal(task.leaves[0].failure.attempts, 2);
});

test("resume 拒绝 risk-control / cancelled / completed", async () => {
  for (const status of ["risk-control", "cancelled", "completed"]) {
    const store = new FakeStore();
    await createStoreTask(store, "t-reject");
    await store.setStatus("t-reject", status);
    const runner = makeRunner({
      store,
      searchImpl: async ({ payload }) => okPage({ total: 1, kols: [], pageNum: payload.pageNum }),
    });
    await assert.rejects(runner.resume("t-reject"), /不允许恢复/, `${status} 必须拒绝 resume`);
  }
});

test("单实例：任务已在跑时 start 返回当前循环，不重复采集", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-single");
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      await sleep(5);
      pagesServed += 1;
      return okPage({ total: 40, kols: makeKols(pagesServed * 100, 20), pageNum: payload.pageNum });
    },
  });

  const first = runner.start("t-single");
  const second = runner.start("t-single");
  await Promise.all([first, second]);

  assert.equal(pagesServed, 2, "total=40 → 两页，不得重复采集");
  assert.equal((await store.getTask("t-single")).status, "completed");
});

test("resume 在任务已运行时返回当前循环 Promise", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-resume-running");
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      await sleep(5);
      pagesServed += 1;
      return okPage({ total: 40, kols: makeKols(pagesServed * 100, 20), pageNum: payload.pageNum });
    },
  });

  const started = runner.start("t-resume-running");
  const resumed = runner.resume("t-resume-running");
  await Promise.all([started, resumed]);
  assert.equal(pagesServed, 2);
});

test("sessionProvider 注入的 session 传给 searchPage", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-session");
  const received = [];
  const session = { id: "electron-session" };
  const runner = makeRunner({
    store,
    sessionProvider: () => session,
    searchImpl: async (call) => {
      received.push(call.session);
      return okPage({ total: 0, kols: [], pageNum: call.payload.pageNum });
    },
  });

  await runner.start("t-session");

  assert.deepEqual(received, [session], "session 必须透传给 searchPage");
});

test("budget-exhausted → incomplete；resume 不带/未增加/非法预算全部拒绝且不发请求；增加后从检查点继续", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-budget-resume", {
    filterState: { fansNumberLower: 1, fansNumberUpper: 100000 },
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 2 },
  });
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    planSplitImpl: splitPlanner,
    searchImpl: async ({ payload }) => {
      pagesServed += 1;
      return okPage({ total: 100, kols: makeKols(pagesServed * 100, 20), pageNum: payload.pageNum });
    },
  });

  await runner.start("t-budget-resume");
  let task = await store.getTask("t-budget-resume");
  assert.equal(task.status, "incomplete");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "budget-exhausted");
  assert.deepEqual(store.calls.appendPageRows.map((call) => call.pageNum), [1, 2], "两页提交后预算耗尽");

  // 小于 / 等于已消费 / 非法预算 → 拒绝，不得发出新请求（严格单调由 service 层强制）。
  for (const budgets of [{ queryBudget: 2 }, { queryBudget: 1 }, { queryBudget: 1.5 }, { queryBudget: 1001 }, { queryBudget: 3, bogus: 1 }]) {
    await assert.rejects(
      runner.resume("t-budget-resume", budgets),
      (err) => ["invalid-budgets", "budget-not-increased", "budget-below-consumed"].includes(err.kind),
      JSON.stringify(budgets),
    );
  }
  assert.equal(pagesServed, 2, "拒绝路径不得发出任何新请求");

  // 不带预算 / 空预算：runner 幂等 no-op（预算仍耗尽，不发请求，状态保持 incomplete）。
  for (const budgets of [undefined, {}]) {
    await runner.resume("t-budget-resume", budgets);
    const after = await store.getTask("t-budget-resume");
    assert.equal(after.status, "incomplete");
    assert.equal(pagesServed, 2, "无增量预算不得发出请求");
  }

  // 严格增加 queryBudget → 从原检查点继续（第 3 页起），已提交页不重抓。
  await runner.resume("t-budget-resume", { queryBudget: 5 });
  task = await store.getTask("t-budget-resume");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.deepEqual(store.calls.appendPageRows.map((call) => call.pageNum), [1, 2, 3, 4, 5], "第 1、2 页不得重抓");
  assert.equal(task.counts.raw, 100, "累计计数不清零");
  assert.equal(store.rows.length, 100, "行不得重复写入");
});

test("incomplete：repeat-page / capped-unprovable / checkpoint-desync 拒绝继续", async () => {
  const cases = [
    ["repeat-page", "t-nc-repeat"],
    ["capped-unprovable", "t-nc-capped"],
    ["checkpoint-desync", "t-nc-desync"],
  ];
  for (const [stopReason, taskId] of cases) {
    const store = new FakeStore();
    await createStoreTask(store, taskId, { budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 } });
    await store.setStatus(taskId, "incomplete");
    const task = await store.getTask(taskId);
    task.summary = { stopReason };
    store.tasks.set(taskId, task);
    let pagesServed = 0;
    const runner = makeRunner({
      store,
      searchImpl: async ({ payload }) => {
        pagesServed += 1;
        return okPage({ total: 100, kols: makeKols(pagesServed * 100, 20), pageNum: payload.pageNum });
      },
    });
    await assert.rejects(
      runner.resume(taskId, { queryBudget: 500 }),
      (err) => err.kind === "resume-not-allowed",
      `${stopReason} 必须拒绝继续`,
    );
    assert.equal(pagesServed, 0, `${stopReason} 不得发出请求`);
  }
});

test("max-pages-reached：maxPages 严格增加可继续，等于/减少/超 250 拒绝，到 250 后不可继续", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-maxpages-resume", {
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 3, queryBudget: 100 },
  });
  let pagesServed = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      pagesServed += 1;
      // 每页只有 1 条新数据 → unique < total，持续到 maxPages 上限。
      return okPage({ total: 1000, kols: [{ userId: `p-${payload.pageNum}`, nickname: `n${payload.pageNum}` }], pageNum: payload.pageNum });
    },
  });

  await runner.start("t-maxpages-resume");
  let task = await store.getTask("t-maxpages-resume");
  assert.equal(task.status, "incomplete");
  assert.equal(task.summary.stopReason, "max-pages-reached");
  assert.equal(task.leaves[0].status, "max-pages-unprovable");
  assert.equal(pagesServed, 3);

  for (const budgets of [{ maxPagesPerLeaf: 2 }, { maxPagesPerLeaf: 251 }]) {
    await assert.rejects(
      runner.resume("t-maxpages-resume", budgets),
      (err) => ["invalid-budgets", "budget-not-increased"].includes(err.kind),
      JSON.stringify(budgets),
    );
  }
  assert.equal(pagesServed, 3, "拒绝路径不得发出请求");

  // 等值 maxPages：runner 幂等 no-op（叶子再次立即停止，不发请求）。
  await runner.resume("t-maxpages-resume", { maxPagesPerLeaf: 3 });
  assert.equal(pagesServed, 3, "等值页数预算不得发出请求");
  assert.equal((await store.getTask("t-maxpages-resume")).status, "incomplete");

  // 严格增加到 4 → 从第 4 页继续。
  await runner.resume("t-maxpages-resume", { maxPagesPerLeaf: 4 });
  task = await store.getTask("t-maxpages-resume");
  assert.equal(pagesServed, 4);
  assert.equal(task.status, "incomplete", "页数上限再次触顶仍为 incomplete");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1, 2, 3, 4]);
  assert.equal(task.leaves[0].status, "max-pages-unprovable");

  // 已到 250 的 incomplete 任务：无继续资格（UI 也不显示继续按钮）。
  const store250 = new FakeStore();
  await createStoreTask(store250, "t-maxpages-250", {
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 100 },
  });
  await store250.setStatus("t-maxpages-250", "incomplete");
  const task250 = await store250.getTask("t-maxpages-250");
  task250.summary = { stopReason: "max-pages-reached" };
  task250.budgetUsed = 1;
  store250.tasks.set("t-maxpages-250", task250);
  const runner250 = makeRunner({ store: store250, searchImpl: async () => okPage({ total: 100, kols: [], pageNum: 1 }) });
  await assert.rejects(
    runner250.resume("t-maxpages-250", { maxPagesPerLeaf: 250 }),
    (err) => err.kind === "resume-not-allowed",
    "已到 250 页上限必须拒绝继续",
  );
});

test("模块源码扫描：纯 ESM、不 import electron、不发起网络", async () => {
  const source = await readFile(MODULE_URL, "utf8");
  assert.ok(!source.includes('from "electron"'), "不得 import electron");
  assert.ok(!source.includes("require("), "必须为纯 ESM");
  assert.ok(!source.includes("fetch("), "不得直接发起网络请求");
});

test("resume 竞态：暂停落盘后旧循环仍在 finalize 时 resume 必须开新循环（不得绑定将死循环）", async () => {
  const store = new FakeStore();
  await createStoreTask(store, "t-dying");
  // 把 finalize 卡在 setCompleteness：暂停落盘后旧循环仍停留在注册表中，
  // 正是“resume 绑定将死循环”的竞态窗口。
  let releaseFinalize;
  const finalizeGate = new Promise((resolve) => {
    releaseFinalize = resolve;
  });
  const originalSetCompleteness = store.setCompleteness.bind(store);
  store.setCompleteness = async (...args) => {
    await finalizeGate;
    return originalSetCompleteness(...args);
  };
  let page = 0;
  const runner = makeRunner({
    store,
    searchImpl: async ({ payload }) => {
      page += 1;
      if (page === 2) {
        runner.pause("t-dying");
      }
      return okPage({ total: 100, kols: makeKols(page * 100, 20), pageNum: payload.pageNum });
    },
  });

  // finalize 被门挡住，start 的 promise 会等到放行后才完成——这里只等“暂停已落盘”。
  const startPromise = runner.start("t-dying");
  const pausedDeadline = Date.now() + 8000;
  for (;;) {
    const task = await store.getTask("t-dying");
    if (task.status === "paused") break;
    if (Date.now() > pausedDeadline) {
      assert.fail(`任务未进入暂停态: ${(await store.getTask("t-dying")).status}`);
    }
    await sleep(15);
  }
  assert.equal(store.calls.appendPageRows.length, 2, "第 1、2 页已提交");

  // 旧循环仍被 finalizeGate 挡住（finalize 未完成、注册表未移除）。
  const resumePromise = runner.resume("t-dying");
  await sleep(30);
  assert.equal((await store.getTask("t-dying")).status, "paused", "resume 期间任务仍处于暂停态（等旧循环收尾）");
  releaseFinalize();
  await Promise.all([startPromise, resumePromise]);

  // 新循环从已提交页继续，不得重抓页 1/2，最终正常收口。
  const deadline = Date.now() + 8000;
  for (;;) {
    const task = await store.getTask("t-dying");
    if (task.status === "completed" || task.status === "incomplete") break;
    if (Date.now() > deadline) {
      assert.fail(`任务未在超时前收口: ${(await store.getTask("t-dying")).status}`);
    }
    await sleep(15);
  }
  assert.equal((await store.getTask("t-dying")).status, "completed", "resume 后新循环完成");
  assert.deepEqual(
    store.calls.appendPageRows.map((call) => call.pageNum),
    [1, 2, 3, 4, 5],
    "新循环从第 3 页继续，已提交页不得重抓",
  );
});
