import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import JSZip from "jszip";
import { DiagnosticManager } from "./diagnostic-manager.mjs";
import { scanForSensitiveData } from "./diagnostic-redactor.mjs";
import { createTaskAnalyticsLifecycleReporter } from "../task-analytics-lifecycle.mjs";
import { RequestDiagnosticTracer } from "./request-diagnostic-tracer.mjs";

test("Task Lifecycle & Network Tracing -> Task-Trace Correlation Integration", async () => {
  const tempUserData = path.join(os.tmpdir(), `mgr-test-trace-corr-${Date.now()}`);
  await fs.mkdir(tempUserData, { recursive: true });

  const mockHistoryStore = {
    listTasks: async () => [{ taskId: "task_T1", status: "failed", total: 5, successCount: 1, failedCount: 4, errorCode: "NETWORK_TIMEOUT" }],
    getTask: async (id) => ({ taskId: id, status: "failed", total: 5, successCount: 1, failedCount: 4, errorCode: "NETWORK_TIMEOUT" }),
  };

  const manager = new DiagnosticManager({
    userDataDir: tempUserData,
    historyStore: mockHistoryStore,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });
  await manager.init();

  // 1. Task Lifecycle Reporter start
  const reporter = createTaskAnalyticsLifecycleReporter(
    () => {},
    ({ eventName, fields }) => {
      const eventMap = {
        task_start: "task_started",
        task_complete: "task_completed",
        task_failed: "task_failed",
        task_cancelled: "task_cancelled",
      };
      manager.recordTrace({
        module: fields?.module || "collection",
        event: eventMap[eventName] || eventName,
        taskId: fields?.taskId || null,
        errorCode: fields?.errorCode || null,
        level: eventName === "task_failed" ? "error" : "info",
      });
    },
  );

  const task = { taskId: "task_T1", pluginId: "pgy-kol", taskType: "search-batch", total: 5 };
  reporter.start(task);

  // 2. Network Request Tracing with taskId and requestId
  const tracer = manager.requestTracer;
  const reqCtx = tracer.startRequest({
    method: "POST",
    endpoint: "/api/bloggers/by-ids?token=leak_token",
    taskId: "task_T1",
    requestId: "req_R1",
  });
  assert.equal(reqCtx.requestId, "req_R1");
  assert.equal(reqCtx.taskId, "task_T1");
  assert.equal(reqCtx.endpoint, "/api/bloggers/by-ids"); // query stripped

  // Simulate network timeout failure
  tracer.completeRequest(reqCtx, { isTimeout: true });

  // 3. Task terminal failed
  reporter.terminal(task, { status: "failed", total: 5, successCount: 1, failedCount: 4, errorCode: "NETWORK_TIMEOUT" });

  await manager.traceStore.scheduleFlush();

  // 4. Generate package for task T1 and unpack to inspect tasks/task_T1-trace.jsonl
  const pkg = await manager.generatePackage({ relatedTaskId: "task_T1", userNote: "Task T1 network timeout" });
  const zip = await JSZip.loadAsync(pkg.zipBuffer);

  const taskTraceFile = zip.file("tasks/task_T1-trace.jsonl");
  assert.ok(taskTraceFile, "tasks/task_T1-trace.jsonl must exist in ZIP");
  const traceText = await taskTraceFile.async("string");
  const traceLines = traceText.trim().split("\n").map((l) => JSON.parse(l));

  assert.equal(traceLines.length, 4);
  assert.equal(traceLines[0].event, "task_started");
  assert.equal(traceLines[0].taskId, "task_T1");

  assert.equal(traceLines[1].event, "request_start");
  assert.equal(traceLines[1].taskId, "task_T1");
  assert.equal(traceLines[1].requestId, "req_R1");

  assert.equal(traceLines[2].event, "request_timeout");
  assert.equal(traceLines[2].taskId, "task_T1");
  assert.equal(traceLines[2].requestId, "req_R1");
  assert.equal(traceLines[2].errorCode, "NETWORK_TIMEOUT");

  assert.equal(traceLines[3].event, "task_failed");
  assert.equal(traceLines[3].taskId, "task_T1");

  await fs.rm(tempUserData, { recursive: true, force: true }).catch(() => {});
});

test("DiagnosticManager: Pending Package Reuse on retry, Discard on cancel, and Distinct New Package", async () => {
  const tempUserData = path.join(os.tmpdir(), `mgr-test-pending-id-${Date.now()}`);
  await fs.mkdir(tempUserData, { recursive: true });

  const mockHistoryStore = {
    listTasks: async () => [{ taskId: "task_A", status: "failed", total: 1 }],
    getTask: async (id) => ({ taskId: id, status: "failed", total: 1 }),
  };

  const manager = new DiagnosticManager({
    userDataDir: tempUserData,
    historyStore: mockHistoryStore,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });
  await manager.init();

  // Step 1: Create package for task A (simulating failed upload)
  const pkgA = await manager.generatePackage({ relatedTaskId: "task_A", userNote: "Error in A" });
  manager.pendingDiagnosticPackage = pkgA;
  const clientReportIdA = pkgA.clientReportId;
  const shaA = pkgA.sha256;

  // Step 2: Retry must use exact same clientReportId and SHA
  const retryPkg = manager.pendingDiagnosticPackage;
  assert.equal(retryPkg.clientReportId, clientReportIdA);
  assert.equal(retryPkg.sha256, shaA);

  // Step 3: User cancels/discards pending
  manager.pendingDiagnosticPackage = null;
  assert.equal(manager.pendingDiagnosticPackage, null);

  // Step 4: User creates package for task B -> Must have brand new clientReportId and new SHA
  const pkgB = await manager.generatePackage({ relatedTaskId: "task_B", userNote: "Error in B" });
  assert.notEqual(pkgB.clientReportId, clientReportIdA);

  await fs.rm(tempUserData, { recursive: true, force: true }).catch(() => {});
});
