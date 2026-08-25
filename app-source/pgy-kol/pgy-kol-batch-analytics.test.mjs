import test from "node:test";
import assert from "node:assert/strict";
import { settlePgyKolBatchAnalytics } from "./pgy-kol-batch-analytics.mjs";

function harness(initial) {
  let task = structuredClone(initial);
  const events = [];
  const terminal = new Set();
  return {
    events,
    set(next) { task = { ...task, ...next }; },
    async settle() {},
    async getTask() { return structuredClone(task); },
    reportTerminal(name, taskId, fields) { if (terminal.has(taskId)) return; terminal.add(taskId); events.push({ name, taskId, fields }); },
    run() { return settlePgyKolBatchAnalytics({ taskId: task.taskId, settle: () => this.settle(), getTask: () => this.getTask(), reportTerminal: (name, id, fields) => this.reportTerminal(name, id, fields) }); },
  };
}

test("pgy-kol paused then resume completed has one start and one complete", async () => {
  const h = harness({ taskId: "kol-paused", status: "paused", counts: { unique: 0 } });
  h.events.push({ name: "task_start", taskId: "kol-paused" });
  await h.run();
  h.set({ status: "completed", counts: { raw: 4, unique: 3, dup: 1, missingUid: 0 } });
  await h.run(); await h.run();
  assert.deepEqual(h.events.map((event) => event.name), ["task_start", "task_complete"]);
  assert.deepEqual(h.events[1].fields, { itemCount: 3, successCount: 3, errorCount: null });
});

test("pgy-kol incomplete has no complete until explicit resume reaches completed", async () => {
  const h = harness({ taskId: "kol-incomplete", status: "incomplete", counts: { unique: 2 } });
  h.events.push({ name: "task_start", taskId: "kol-incomplete" });
  await h.run();
  assert.deepEqual(h.events.map((event) => event.name), ["task_start"]);
  h.set({ status: "completed", counts: { raw: 5, unique: 4, dup: 1, missingUid: 0 } });
  await h.run();
  assert.deepEqual(h.events.map((event) => event.name), ["task_start", "task_complete"]);
});

test("pgy-kol resume failed and cancelled produce one mutually exclusive terminal event", async () => {
  const failed = harness({ taskId: "kol-failed", status: "failed", counts: { unique: 1 } });
  await failed.run(); await failed.run();
  assert.deepEqual(failed.events.map((event) => event.name), ["task_failed"]);

  const cancelled = harness({ taskId: "kol-cancelled", status: "cancelled", counts: { unique: 2 } });
  await cancelled.run(); await cancelled.run();
  assert.deepEqual(cancelled.events.map((event) => event.name), ["task_cancelled"]);
});

test("pgy-kol detail terminal uses detailCounts rather than fast-list counts", async () => {
  const h = harness({ taskId: "kol-detail", status: "completed", detailTaskId: "detail-1", detailStatus: "completed", detailCounts: { total: 8, successCount: 6, failedCount: 2 }, counts: { unique: 99 } });
  await h.run();
  assert.deepEqual(h.events[0].fields, { itemCount: 8, successCount: 6, errorCount: 2 });
});
