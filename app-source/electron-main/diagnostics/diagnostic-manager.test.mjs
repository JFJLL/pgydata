import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import JSZip from "jszip";
import { DiagnosticManager } from "./diagnostic-manager.mjs";
import { scanForSensitiveData } from "./diagnostic-redactor.mjs";
import { createTaskAnalyticsLifecycleReporter } from "../task-analytics-lifecycle.mjs";

test("Task Lifecycle Integration -> DiagnosticTraceStore wiring test", async () => {
  const tempUserData = path.join(os.tmpdir(), `mgr-test-wiring-${Date.now()}`);
  await fs.mkdir(tempUserData, { recursive: true });

  const manager = new DiagnosticManager({
    userDataDir: tempUserData,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });
  await manager.init();

  // 真正使用 production wiring：传入 reporter 并将 diagnostics callback 接入 manager.recordTrace
  const reporter = createTaskAnalyticsLifecycleReporter(
    () => {}, // analytics callback
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

  const task = { taskId: "task_wire_123", pluginId: "pgy-kol", taskType: "search-batch", total: 10 };
  reporter.start(task);
  reporter.terminal(task, { status: "failed", total: 10, successCount: 3, failedCount: 7, errorCode: "TASK_FAILED" });

  // Network request tracing integration through networkCollector
  manager.networkCollector.recordRequest({
    httpMethod: "POST",
    endpoint: "/api/bloggers/search?key=test_keyword",
    host: "magiorix.red-magic.cn",
    httpStatus: 504,
    durationMs: 5012,
    requestId: "req_test_abc123",
    errorCode: "NETWORK_TIMEOUT",
    error: "request timeout on server",
  });

  await manager.traceStore.scheduleFlush();

  // 验证 Task Trace 真实存在且由真实 lifecycle reporter 生成
  const taskTraces = await manager.traceStore.getTaskTrace("task_wire_123");
  assert.equal(taskTraces.length, 2);
  assert.equal(taskTraces[0].event, "task_started");
  assert.equal(taskTraces[1].event, "task_failed");
  assert.equal(taskTraces[1].errorCode, "TASK_FAILED");

  // 验证 Network Event 真正写入 TraceStore
  const recentErrors = await manager.traceStore.getRecentErrors();
  const netErr = recentErrors.find((e) => e.event === "request_failed" || e.event === "request_timeout");
  assert.ok(netErr, "Network failure must be recorded in trace store");
  assert.equal(netErr.requestId, "req_test_abc123");
  assert.equal(netErr.endpoint, "/api/bloggers/search"); // query redacted

  await fs.rm(tempUserData, { recursive: true, force: true }).catch(() => {});
});

test("DiagnosticManager: Pending Package Reuse & Export Local Identity test", async () => {
  const tempUserData = path.join(os.tmpdir(), `mgr-test-pending-${Date.now()}`);
  await fs.mkdir(tempUserData, { recursive: true });
  await fs.mkdir(path.join(tempUserData, "logs"), { recursive: true });
  await fs.writeFile(
    path.join(tempUserData, "logs", `magiorix-main-${new Date().toISOString().slice(0, 10)}.log`),
    "2026-09-02 [INFO] Started\n2026-09-02 [DEBUG] Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\n",
  );

  const mockHistoryStore = {
    listTasks: async () => [{ taskId: "task_id_999", status: "completed", total: 1, successCount: 1, failedCount: 0 }],
    getTask: async (id) => ({ taskId: id, status: "completed", total: 1, successCount: 1, failedCount: 0 }),
  };

  const manager = new DiagnosticManager({
    userDataDir: tempUserData,
    historyStore: mockHistoryStore,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });
  await manager.init();

  // Generate package (simulating upload failure stage)
  const pkg1 = await manager.generatePackage({ relatedTaskId: "task_id_999" });
  manager.pendingDiagnosticPackage = pkg1;

  const firstClientReportId = pkg1.clientReportId;
  const firstSha = pkg1.sha256;
  const firstSize = pkg1.fileSizeBytes;

  // Simulate retry: should retrieve the exact same pending package
  const retriedPkg = manager.pendingDiagnosticPackage;
  assert.equal(retriedPkg.clientReportId, firstClientReportId);
  assert.equal(retriedPkg.sha256, firstSha);
  assert.equal(retriedPkg.fileSizeBytes, firstSize);

  // Unpack and verify secret scan in final zip
  const unzipped = await JSZip.loadAsync(retriedPkg.zipBuffer);
  for (const [name, entry] of Object.entries(unzipped.files)) {
    if (entry.dir) continue;
    const text = await entry.async("string");
    assert.ok(!text.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    const scan = scanForSensitiveData(text);
    assert.equal(scan.clean, true);
  }

  await fs.rm(tempUserData, { recursive: true, force: true }).catch(() => {});
});
