import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CollectionHistoryStore,
  assertSafeTaskId,
} from "../../app-source/electron-main/collection-history-store.mjs";

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "magiorix-history-"));
  const store = new CollectionHistoryStore({ baseDir: root, ...options });
  await store.initialize();
  return {
    root,
    store,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test("persists and exports more than 3000 rows without truncation", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  const urls = Array.from({ length: 3001 }, (_, index) => `https://example.test/${index}`);
  await ctx.store.createTask({ taskId: "task-3001", pluginId: "pgy", taskType: "note", urls });
  for (let index = 0; index < urls.length; index += 1) {
    await ctx.store.recordPendingCharge("task-3001", index, { 序号: index, 文本: `内容${index}` }, urls[index]);
    await ctx.store.recordSuccess("task-3001", index, { 序号: index, 文本: `内容${index}` }, 9000 - index, urls[index]);
  }
  await ctx.store.setStatus("task-3001", "completed");
  const rows = await ctx.store.getExportRows("task-3001");
  assert.equal(rows.length, 3001);
  assert.equal(rows[3000].序号, 3000);
});

test("recovers a running task as interrupted after restart", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "restart-task", urls: ["a", "b"] });
  await ctx.store.recordSuccess("restart-task", 0, { value: "a" }, 9);
  const restarted = new CollectionHistoryStore({ baseDir: ctx.root });
  await restarted.initialize();
  const task = await restarted.getTask("restart-task");
  const plan = await restarted.getResumePlan("restart-task");
  assert.equal(task.status, "interrupted");
  assert.deepEqual(plan.payload.sourceIndexes, [1]);
  assert.deepEqual(await restarted.getExportRows("restart-task"), [{ value: "a" }]);
});

test("reconciles metadata counters when a JSONL success reaches disk first", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "metadata-crash", urls: ["a", "b"] });
  const event = {
    schemaVersion: 1,
    eventId: "metadata-crash-0",
    taskId: "metadata-crash",
    itemIndex: 0,
    state: "success",
    createdAt: "2026-07-21T10:00:00.000Z",
    row: { value: "durable" },
    balanceAfter: 9,
  };
  await fs.appendFile(path.join(ctx.root, "metadata-crash", "results.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  const restarted = new CollectionHistoryStore({ baseDir: ctx.root });
  await restarted.initialize();
  const task = await restarted.getTask("metadata-crash");
  assert.equal(task.status, "interrupted");
  assert.equal(task.successCount, 1);
  assert.deepEqual(await restarted.getExportRows("metadata-crash"), [{ value: "durable" }]);
  assert.deepEqual((await restarted.getResumePlan("metadata-crash")).payload.sourceIndexes, [1]);
});

test("keeps pending-charge data recoverable and terminal successes idempotent", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "pending-task", urls: ["a", "b", "c"] });
  await ctx.store.recordPendingCharge("pending-task", 0, { value: "pending" });
  await ctx.store.recordSuccess("pending-task", 1, { value: "done" }, 8);
  await ctx.store.recordSuccess("pending-task", 1, { value: "duplicate" }, 7);
  await ctx.store.setStatus("pending-task", "auth_expired");
  const plan = await ctx.store.getResumePlan("pending-task");
  assert.deepEqual(plan.payload.sourceIndexes, [0, 2]);
  assert.equal(plan.pendingCharges.length, 1);
  assert.equal(plan.pendingCharges[0].row.value, "pending");
  assert.deepEqual(await ctx.store.getExportRows("pending-task"), [{ value: "done" }]);
});

test("ignores a corrupt JSONL tail, preserves source order, and strips Excel controls", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "corrupt-tail", urls: ["0", "1", "2"] });
  await ctx.store.recordSuccess("corrupt-tail", 2, { text: "third\u0000value" }, 8);
  await ctx.store.recordSuccess("corrupt-tail", 0, { text: "first\u000bvalue" }, 7);
  await fs.appendFile(path.join(ctx.root, "corrupt-tail", "results.jsonl"), '{"broken":', "utf8");
  const restarted = new CollectionHistoryStore({ baseDir: ctx.root });
  assert.deepEqual(await restarted.getExportRows("corrupt-tail"), [{ text: "firstvalue" }, { text: "thirdvalue" }]);
  await restarted.recordSuccess("corrupt-tail", 1, { text: "second" }, 6);
  const restartedAgain = new CollectionHistoryStore({ baseDir: ctx.root });
  assert.deepEqual(await restartedAgain.getExportRows("corrupt-tail"), [
    { text: "firstvalue" },
    { text: "second" },
    { text: "thirdvalue" },
  ]);
});

test("rejects unsafe task ids and removes only expired task directories", async (t) => {
  let now = Date.parse("2026-07-21T00:00:00.000Z");
  const ctx = await fixture({ now: () => now });
  t.after(ctx.cleanup);
  assert.throws(() => assertSafeTaskId("../escape"), /非法任务 ID/);
  assert.throws(() => assertSafeTaskId("CON"), /非法任务 ID/);
  await ctx.store.createTask({ taskId: "expired-task", urls: ["a"] });
  now += 91 * 24 * 60 * 60 * 1000;
  const oldOrphan = path.join(ctx.root, "old-orphan");
  const recentOrphan = path.join(ctx.root, "recent-orphan");
  await fs.mkdir(oldOrphan);
  await fs.mkdir(recentOrphan);
  await fs.utimes(oldOrphan, new Date(now - 91 * 24 * 60 * 60 * 1000), new Date(now - 91 * 24 * 60 * 60 * 1000));
  await fs.utimes(recentOrphan, new Date(now), new Date(now));
  await ctx.store.initialize();
  await assert.rejects(fs.stat(path.join(ctx.root, "expired-task")), /ENOENT/);
  await assert.rejects(fs.stat(oldOrphan), /ENOENT/);
  assert.ok(await fs.stat(recentOrphan));
});

test("rebuilds missing metadata from durable input and JSONL", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  await ctx.store.createTask({ taskId: "missing-metadata", urls: ["a"] });
  await ctx.store.recordSuccess("missing-metadata", 0, { value: "saved" }, 3);
  await fs.rm(path.join(ctx.root, "missing-metadata", "metadata.json"));
  const restarted = new CollectionHistoryStore({ baseDir: ctx.root });
  await restarted.initialize();
  const task = await restarted.getTask("missing-metadata");
  assert.equal(task.status, "interrupted");
  assert.equal(task.successCount, 1);
  assert.equal(task.recoveredMetadata, true);
  assert.deepEqual(await restarted.getExportRows("missing-metadata"), [{ value: "saved" }]);
});

test("migrates legacy localStorage history once and retains partial rows", async (t) => {
  const ctx = await fixture();
  t.after(ctx.cleanup);
  const history = [{ id: "old.task", fileName: "old.xlsx", pluginId: "pgy", total: 3000, success: 3000, rows: [{ a: 1 }, { a: 2 }], exportTruncated: true }];
  const empty = await ctx.store.importLegacyHistory([]);
  const first = await ctx.store.importLegacyHistory(history);
  const second = await ctx.store.importLegacyHistory(history);
  assert.deepEqual(empty, { imported: 0, alreadyMigrated: false, deferred: true });
  assert.deepEqual(first, { imported: 1, alreadyMigrated: false });
  assert.deepEqual(second, { imported: 0, alreadyMigrated: true });
  const tasks = await ctx.store.listTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].legacySummary.total, 3000);
  assert.deepEqual(await ctx.store.getExportRows(tasks[0].taskId), [{ a: 1 }, { a: 2 }]);
});
