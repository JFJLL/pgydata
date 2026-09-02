import test from "node:test";
import assert from "node:assert/strict";
import { createTaskAnalyticsLifecycleReporter } from "../electron-main/task-analytics-lifecycle.mjs";

function task(overrides = {}) {
  return { taskId: "task-lifecycle-1", pluginId: "pgy", taskType: "blogger", inputType: "xlsx", total: 5, ...overrides };
}

function reporter(events) {
  return createTaskAnalyticsLifecycleReporter((eventName, fields, options) => events.push({ eventName, fields, options }));
}

test("ordinary task start/retry/completed emits exactly one deterministic start and terminal", () => {
  const events = []; const lifecycle = reporter(events);
  lifecycle.start(task()); lifecycle.start(task()); lifecycle.terminal(task(), { status: "completed", total: 5, successCount: 3, failedCount: 2 }); lifecycle.terminal(task(), { status: "completed", total: 5, successCount: 3, failedCount: 2 });
  assert.deepEqual(events.map((event) => event.eventName), ["task_start", "task_complete"]);
  assert.equal(events[0].options.eventId, "task-start:task-lifecycle-1");
  assert.equal(events[1].options.eventId, "task-terminal:task-lifecycle-1");
  assert.deepEqual(events[1].fields, { module: "pgy", pluginId: "pgy", taskType: "blogger", taskId: "task-lifecycle-1", inputType: "xlsx", itemCount: 5, successCount: 3, errorCount: 2 });
});

test("first successful admission may be a resume and must still emit task_start", () => {
  const events = []; const lifecycle = reporter(events);
  lifecycle.start(task({ taskId: "admission-later", resume: true }));
  assert.deepEqual(events.map((event) => event.eventName), ["task_start"]);
  assert.equal(events[0].options.eventId, "task-start:admission-later");
});

test("paused and auth-expired are recoverable and later completion keeps one start and one complete", () => {
  for (const status of ["paused", "auth_expired"]) {
    const events = []; const lifecycle = reporter(events); const item = task({ taskId: `recover-${status}` });
    lifecycle.start(item); assert.equal(lifecycle.terminal(item, { status, total: 5, successCount: 1, failedCount: 0 }), false);
    lifecycle.start({ ...item, resume: true }); lifecycle.terminal(item, { status: "completed", total: 5, successCount: 5, failedCount: 0 });
    assert.deepEqual(events.map((event) => event.eventName), ["task_start", "task_complete"]);
  }
});

test("interrupted is recoverable and never creates task_failed before a later complete", () => {
  const events = []; const lifecycle = reporter(events); const item = task({ taskId: "recover-interrupted" });
  lifecycle.start(item); assert.equal(lifecycle.terminal(item, { status: "interrupted", total: 5, successCount: 1, failedCount: 1 }), false);
  lifecycle.start({ ...item, resume: true }); lifecycle.terminal(item, { status: "completed", total: 5, successCount: 4, failedCount: 1 });
  assert.deepEqual(events.map((event) => event.eventName), ["task_start", "task_complete"]);
});

test("unrecovered interrupted remains non-terminal and a real failed state is terminal", () => {
  const interrupted = []; const interruptedLifecycle = reporter(interrupted); const interruptedTask = task({ taskId: "stays-interrupted" });
  interruptedLifecycle.start(interruptedTask); interruptedLifecycle.terminal(interruptedTask, { status: "interrupted", total: 1, successCount: 0, failedCount: 1 });
  assert.deepEqual(interrupted.map((event) => event.eventName), ["task_start"]);

  const failed = []; const failedLifecycle = reporter(failed); const failedTask = task({ taskId: "actually-failed" });
  failedLifecycle.start(failedTask); failedLifecycle.terminal(failedTask, { status: "failed", total: 1, successCount: 0, failedCount: 1 });
  assert.deepEqual(failed.map((event) => event.eventName), ["task_start", "task_failed"]);
  assert.equal(failed[1].options.eventId, "task-terminal:actually-failed");
});

test("stable start event id is identical after simulated process restart", () => {
  const first = []; reporter(first).start(task({ taskId: "restart-safe" }));
  const second = []; reporter(second).start(task({ taskId: "restart-safe", resume: true }));
  assert.equal(first[0].options.eventId, "task-start:restart-safe");
  assert.equal(second[0].options.eventId, first[0].options.eventId);
});


test("production wiring forwards lifecycle options to SchedulerApi without field-only fallback", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../dist-electron/index.js", import.meta.url), "utf8");
  assert.match(source, /const pgyTaskAnalytics = createTaskAnalyticsLifecycleReporter\(\s*\(eventName, fields, options\) => \{\s*try \{\s*Le\.get\(\)\.reportAnalyticsEvent\(eventName, fields, options\);\s*\} catch \{\}\s*\}/s);
  assert.doesNotMatch(source, /const pgyTaskAnalytics = createTaskAnalyticsLifecycleReporter\(\s*\(eventName, fields\) => \{\s*try \{\s*Le\.get\(\)\.reportAnalyticsEvent\(eventName, fields\);/s);
});
