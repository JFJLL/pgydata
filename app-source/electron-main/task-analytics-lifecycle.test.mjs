import test from "node:test";
import assert from "node:assert/strict";
import { createTaskAnalyticsLifecycleReporter } from "../electron-main/task-analytics-lifecycle.mjs";

function task(overrides = {}) {
  return { taskId: "task-lifecycle-1", pluginId: "pgy", taskType: "blogger", inputType: "xlsx", total: 5, ...overrides };
}

test("ordinary task lifecycle emits one start and uses persisted partial terminal counts", () => {
  const events = [];
  const lifecycle = createTaskAnalyticsLifecycleReporter((eventName, fields) => events.push({ eventName, fields }));
  lifecycle.start(task());
  lifecycle.start(task());
  lifecycle.start(task({ resume: true }));
  lifecycle.terminal(task(), { status: "completed", total: 5, successCount: 3, failedCount: 2 });
  assert.deepEqual(events.map((event) => event.eventName), ["task_start", "task_complete"]);
  assert.deepEqual(events[1].fields, { module: "pgy", pluginId: "pgy", taskType: "blogger", taskId: "task-lifecycle-1", inputType: "xlsx", itemCount: 5, successCount: 3, errorCount: 2 });
});

test("ordinary task lifecycle does not infer completion from final item and distinguishes failure/cancel", () => {
  const failed = [];
  const failedLifecycle = createTaskAnalyticsLifecycleReporter((name, fields) => failed.push({ name, fields }));
  failedLifecycle.start(task({ taskId: "task-failed" }));
  failedLifecycle.terminal(task({ taskId: "task-failed" }), { status: "interrupted", total: 4, successCount: 1, failedCount: 1 });
  failedLifecycle.terminal(task({ taskId: "task-failed" }), { status: "completed", total: 4, successCount: 4, failedCount: 0 });
  assert.deepEqual(failed.map((event) => event.name), ["task_start", "task_failed"]);
  assert.equal(failed[1].fields.errorCode, "INTERRUPTED");

  const cancelled = [];
  const cancelledLifecycle = createTaskAnalyticsLifecycleReporter((name) => cancelled.push(name));
  cancelledLifecycle.start(task({ taskId: "task-cancelled" }));
  cancelledLifecycle.terminal(task({ taskId: "task-cancelled" }), { status: "cancelled", total: 4, successCount: 2, failedCount: 1 });
  assert.deepEqual(cancelled, ["task_start", "task_cancelled"]);
});

test("ordinary task lifecycle leaves paused and auth-expired without false terminal analytics", () => {
  const events = [];
  const lifecycle = createTaskAnalyticsLifecycleReporter((name) => events.push(name));
  lifecycle.start(task({ taskId: "task-paused" }));
  assert.equal(lifecycle.terminal(task({ taskId: "task-paused" }), { status: "paused", total: 1, successCount: 0, failedCount: 0 }), false);
  assert.equal(lifecycle.terminal(task({ taskId: "task-paused" }), { status: "auth_expired", total: 1, successCount: 0, failedCount: 0 }), false);
  assert.deepEqual(events, ["task_start"]);
});
