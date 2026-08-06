// 蒲公英“找博主”批量任务持久化存储测试（Phase 4 工作包 B）。
// 覆盖：创建/读取/列表、页块协议与提交顺序、崩溃恢复语义、
// 任务 ID 穿越防护、敏感字段与白名单清洗、uid 规范化、叶子管理、状态持久化。

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pgy-kol-task-store-"));
  const store = new PgyKolTaskStore({ baseDir: root, ...options });
  await store.initialize();
  return {
    root,
    store,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

function makeLeaf(overrides = {}) {
  return {
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
    ...overrides,
  };
}

async function readRowsFile(root, taskId) {
  return fs.readFile(path.join(root, taskId, "rows.jsonl"), "utf8");
}

test("createTask 落盘、getTask 往返、listTasks 按 updatedAt 降序、重复创建拒绝", async (t) => {
  let now = 1000;
  const ctx = await fixture({ now: () => now });
  t.after(ctx.cleanup);
  const created = await ctx.store.createTask({
    taskId: "pgykol-store-1",
    filterState: { gender: "女", fansNumberLower: 10000 },
    columns: ["userId", "nickname", "fansNum"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400 },
  });
  assert.equal(created.taskId, "pgykol-store-1");
  assert.equal(created.status, "running");
  assert.equal(created.completeness, "not-started");
  assert.deepEqual(created.columns, ["userId", "nickname", "fansNum"]);
  assert.deepEqual(created.counts, { raw: 0, unique: 0, dup: 0, missingUid: 0 });
  assert.deepEqual(created.leaves, []);

  const loaded = await ctx.store.getTask("pgykol-store-1");
  assert.deepEqual(loaded, created);
  assert.equal(await ctx.store.getTask("pgykol-store-missing"), null);
  await assert.rejects(
    ctx.store.createTask({ taskId: "pgykol-store-1", filterState: {}, columns: [], pageSize: 20, budgets: {} }),
    /已存在|exists/i,
  );

  now = 2000;
  await ctx.store.createTask({ taskId: "pgykol-store-2", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  const list = await ctx.store.listTasks();
  assert.deepEqual(list.map((task) => task.taskId), ["pgykol-store-2", "pgykol-store-1"]);
  const entries = (await fs.readdir(ctx.root)).sort();
  assert.deepEqual(entries, ["pgykol-store-1", "pgykol-store-2"]);
});

test("appendPageRows 页块协议与 commitPage 提交顺序", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "pgykol-pages", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await ctx.store.addLeaf("pgykol-pages", makeLeaf());

  await ctx.store.appendPageRows("pgykol-pages", {
    leafId: "L0",
    pageNum: 1,
    rows: [
      { uid: "u1", fields: { userId: "u1", nickname: "甲" } },
      { uid: 2, fields: { userId: 2, nickname: "乙" } },
      { fields: { nickname: "缺UID" } },
    ],
  });
  const raw = await readRowsFile(ctx.root, "pgykol-pages");
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 5);
  assert.equal(lines[0].kind, "page-start");
  assert.equal(lines[0].pageNum, 1);
  assert.equal(lines[0].leafId, "L0");
  assert.equal(lines[1].kind, "row");
  assert.equal(lines[1].uid, "u1");
  assert.equal(lines[2].kind, "row");
  assert.equal(lines[2].uid, "2", "数字 uid 必须字符串化");
  assert.equal(lines[3].kind, "row");
  assert.equal(lines[3].uid, null, "缺失 uid 必须为 null");
  assert.equal(lines[4].kind, "page-end");
  assert.deepEqual(
    {
      rawCount: lines[4].rawCount,
      uniqueCount: lines[4].uniqueCount,
      dupCount: lines[4].dupCount,
      missingUidCount: lines[4].missingUidCount,
    },
    { rawCount: 3, uniqueCount: 2, dupCount: 0, missingUidCount: 1 },
  );

  let task = await ctx.store.getTask("pgykol-pages");
  assert.equal(task.counts.raw, 0, "行已写但未提交前任务计数不得前进");
  assert.deepEqual(task.leaves[0].pagesCompleted, []);

  await ctx.store.commitPage("pgykol-pages", {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 3, uniqueCount: 2, dupCount: 0, missingUidCount: 1 },
  });
  task = await ctx.store.getTask("pgykol-pages");
  assert.deepEqual(task.counts, { raw: 3, unique: 2, dup: 0, missingUid: 1 });
  assert.deepEqual(task.leaves[0].pagesCompleted, [1]);
  assert.equal(task.leaves[0].nextPageNum, 2);

  const rows = await ctx.store.getRows("pgykol-pages");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].leafId, "L0");
  assert.equal(rows[0].pageNum, 1);
  assert.equal(rows[0].fields.nickname, "甲");
  assert.equal(rows[1].uid, "2");
  assert.equal(rows[2].uid, null);
});

test("崩溃恢复：完整未提交块幂等修复、截断尾块丢弃并回到该页、running→interrupted", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "pgykol-recover", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await ctx.store.addLeaf("pgykol-recover", makeLeaf({ status: "running" }));
  // 窗口 A：行块完整（page-end 已写）但元数据未提交。
  await ctx.store.appendPageRows("pgykol-recover", {
    leafId: "L0",
    pageNum: 1,
    rows: [{ uid: "u1", fields: { userId: "u1" } }],
  });
  // 窗口 B：尾块被截断（无 page-end）→ 恢复时必须丢弃并重取该页。
  await ctx.store.appendPageRows("pgykol-recover", {
    leafId: "L0",
    pageNum: 2,
    rows: [{ uid: "u2", fields: { userId: "u2" } }],
    truncateTail: true,
  });

  const fresh = new PgyKolTaskStore({ baseDir: ctx.root });
  const result = await fresh.initialize();
  assert.ok(result.recovered >= 1);
  const task = await fresh.getTask("pgykol-recover");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1]);
  assert.deepEqual(task.counts, { raw: 1, unique: 1, dup: 0, missingUid: 0 });
  assert.equal(task.leaves[0].nextPageNum, 2);
  assert.equal(task.status, "interrupted", "initialize 必须把 running 任务置为 interrupted");
  const rows = await fresh.getRows("pgykol-recover");
  assert.equal(rows.length, 1, "截断尾块必须被丢弃，不得残留半页");
  assert.equal(rows[0].pageNum, 1);
  const raw = await readRowsFile(ctx.root, "pgykol-recover");
  assert.ok(!raw.includes('"pageNum":2'), "截断尾块必须从磁盘重写删除");

  // 幂等：再次 initialize 不再产生变更。
  const again = await fresh.initialize();
  assert.equal(again.recovered, 0);
});

test("元数据超前：checkpoint-desync 与 cannot-prove，禁止静默修复", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "pgykol-desync", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await ctx.store.addLeaf("pgykol-desync", makeLeaf({ pagesCompleted: [1], nextPageNum: 2 }));
  const fresh = new PgyKolTaskStore({ baseDir: ctx.root });
  await fresh.initialize();
  const task = await fresh.getTask("pgykol-desync");
  assert.equal(task.leaves[0].failure.kind, "checkpoint-desync");
  assert.equal(task.leaves[0].failure.pageNum, 1);
  assert.equal(task.completeness, "cannot-prove");
  // 修复后再次读取保持同一状态（幂等）。
  const taskAgain = await fresh.getTask("pgykol-desync");
  assert.equal(taskAgain.leaves[0].failure.kind, "checkpoint-desync");
});

test("安全：任务 ID 穿越防护、敏感字段隔离、白名单清洗、uid 规范化", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  for (const bad of ["../../escape", "CON", "", "a/b", "..", "com1"]) {
    await assert.rejects(ctx.store.getTask(bad), /非法任务 ID/);
  }
  await ctx.store.createTask({ taskId: "pgykol-sec", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await ctx.store.addLeaf("pgykol-sec", makeLeaf());
  await ctx.store.appendPageRows("pgykol-sec", {
    leafId: "L0",
    pageNum: 1,
    rows: [
      {
        uid: "u1",
        fields: {
          userId: "u1",
          nickname: "甲\u0000乙\u000b丙",
          cookie: "secret=1",
          Authorization: "Bearer x",
          "X-s": "sig",
          "X-t": "123",
          superSecretField: "quarantine-me",
          fansNum: 100,
        },
      },
      { fields: { nickname: "缺UID" } },
    ],
  });
  // getRows 只返回已提交页（fresh reviewer L1 语义）：先提交再读取。
  await ctx.store.commitPage("pgykol-sec", {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 2, uniqueCount: 1, dupCount: 0, missingUidCount: 1 },
  });
  const rows = await ctx.store.getRows("pgykol-sec");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fields.nickname, "甲乙丙", "控制字符必须被清洗");
  assert.equal(rows[0].uid, "u1");
  assert.ok(!("cookie" in rows[0].fields));
  assert.ok(!("Authorization" in rows[0].fields));
  assert.ok(!("X-s" in rows[0].fields));
  assert.ok(!("X-t" in rows[0].fields));
  assert.ok(!("superSecretField" in rows[0].fields), "白名单外字段不得落盘");
  assert.equal(rows[0].fields.fansNum, 100);
  assert.equal(rows[0].fields.userId, "u1");
  assert.equal(rows[1].uid, null);
  const raw = await readRowsFile(ctx.root, "pgykol-sec");
  assert.ok(!raw.includes("secret=1"));
  assert.ok(!raw.includes("Bearer"));
  assert.ok(!raw.includes("quarantine-me"));
  assert.ok(!raw.includes("sig"));
});

test("addLeaf/updateLeaf 替换、getResumeState、setStatus/setCompleteness 持久化", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({
    taskId: "pgykol-ctl",
    filterState: { fansNumberLower: 100 },
    columns: ["userId", "nickname"],
    pageSize: 20,
    budgets: {},
  });
  await ctx.store.addLeaf("pgykol-ctl", makeLeaf());
  await ctx.store.addLeaf("pgykol-ctl", makeLeaf({ leafId: "L1", parentId: "L0", range: [100, 200], depth: 1 }));
  let task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.leaves.length, 2);
  assert.deepEqual(task.leaves[1].range, [100, 200]);
  assert.equal(task.leaves[1].parentId, "L0");

  await ctx.store.updateLeaf("pgykol-ctl", makeLeaf({ leafId: "L0", status: "running", startedAt: "2026-01-01T00:00:00.000Z" }));
  task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.leaves[0].status, "running");
  assert.equal(task.leaves[0].startedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(task.leaves[1].leafId, "L1", "updateLeaf 只替换目标叶子");

  // 部分字段更新不得清空已提交状态。
  await ctx.store.appendPageRows("pgykol-ctl", { leafId: "L0", pageNum: 1, rows: [{ uid: "u1", fields: { userId: "u1" } }] });
  await ctx.store.commitPage("pgykol-ctl", { leafId: "L0", pageNum: 1, summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 } });
  await ctx.store.updateLeaf("pgykol-ctl", { leafId: "L0", status: "done" });
  task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.leaves[0].status, "done");
  assert.deepEqual(task.leaves[0].pagesCompleted, [1], "部分更新不得清空已提交页");
  assert.equal(task.leaves[0].nextPageNum, 2);

  const resume = await ctx.store.getResumeState("pgykol-ctl");
  assert.equal(resume.taskId, "pgykol-ctl");
  assert.deepEqual(resume.counts, { raw: 1, unique: 1, dup: 0, missingUid: 0 });
  assert.equal(resume.leaves.length, 2);
  assert.equal(resume.status, "running");

  await ctx.store.setStatus("pgykol-ctl", "paused");
  task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.status, "paused");
  assert.equal(task.finishedAt, null, "暂停不是终态");
  await ctx.store.setStatus("pgykol-ctl", "cancelled");
  task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.status, "cancelled");
  assert.ok(task.finishedAt, "终态必须记录 finishedAt");
  await assert.rejects(ctx.store.setStatus("pgykol-ctl", "bogus"), /非法任务状态/);

  await ctx.store.setCompleteness("pgykol-ctl", "cannot-prove", {
    summary: { stopReason: "repeat-page", warnings: ["重复页"] },
  });
  task = await ctx.store.getTask("pgykol-ctl");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.summary.stopReason, "repeat-page");
  assert.deepEqual(task.summary.warnings, ["重复页"]);
});
