import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import JSZip from "jszip";
import { DiagnosticManager } from "./diagnostic-manager.mjs";
import { scanForSensitiveData } from "./diagnostic-redactor.mjs";

test("DiagnosticManager: Task Lifecycle Trace, Dual-Layer Sensitive Scan & Offline Fallback", async () => {
  const tempUserData = path.join(os.tmpdir(), `mgr-test-diag-${Date.now()}`);
  await fs.mkdir(tempUserData, { recursive: true });
  await fs.mkdir(path.join(tempUserData, "logs"), { recursive: true });
  await fs.writeFile(
    path.join(tempUserData, "logs", `magiorix-main-${new Date().toISOString().slice(0, 10)}.log`),
    "2026-09-02 [INFO] Main process initialized\n2026-09-02 [INFO] Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 token\n",
  );

  const mockHistoryStore = {
    listTasks: async () => [
      { taskId: "task_test_100", pluginId: "pgy-kol", taskType: "search-batch", status: "failed", total: 5, successCount: 2, failedCount: 3, errorCode: "NETWORK_TIMEOUT" },
    ],
    getTask: async (id) => ({ taskId: id, status: "failed", total: 5, successCount: 2, failedCount: 3, errorCode: "NETWORK_TIMEOUT" }),
  };

  const manager1 = new DiagnosticManager({
    userDataDir: tempUserData,
    historyStore: mockHistoryStore,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });

  await manager1.init();
  const installId1 = manager1.traceStore.installId;
  const sessionId1 = manager1.traceStore.sessionId;
  assert.ok(installId1.startsWith("inst_"));
  assert.ok(sessionId1.startsWith("ses_"));

  // 1. Record structured task lifecycle trace events
  manager1.recordTrace({ level: "info", module: "pgy-kol", event: "task_started", taskId: "task_test_100", step: "init" });
  manager1.recordTrace({ level: "info", module: "pgy-kol", event: "auth_check_start", taskId: "task_test_100", step: "auth" });
  manager1.recordTrace({ level: "info", module: "pgy-kol", event: "auth_check_success", taskId: "task_test_100", step: "auth" });
  manager1.recordTrace({ level: "info", module: "pgy-kol", event: "discovery_start", taskId: "task_test_100", step: "discovery" });
  manager1.recordTrace({ level: "info", module: "pgy-kol", event: "request_start", taskId: "task_test_100", step: "request", httpMethod: "POST", endpoint: "/api/kol/page?query=secret_keyword" });
  manager1.recordTrace({ level: "warn", module: "pgy-kol", event: "request_retry", taskId: "task_test_100", step: "request", attempt: 1 });
  manager1.recordTrace({ level: "error", module: "pgy-kol", event: "request_failed", taskId: "task_test_100", step: "request", errorCode: "NETWORK_TIMEOUT", message: "Timeout on https://example.com/api?token=TEST_SECRET_SHOULD_NOT_LEAK" });
  manager1.recordTrace({ level: "error", module: "pgy-kol", event: "task_failed", taskId: "task_test_100", step: "terminal", errorCode: "NETWORK_TIMEOUT" });

  // Error collector records unhandled error with Windows user path
  manager1.errorCollector.recordError("main", new Error("Crash at C:\\Users\\zhangsan\\AppData\\Roaming\\magiorix\\index.js:42"));

  await manager1.traceStore.scheduleFlush();

  // Verify trace ordering and fields
  const traces = await manager1.traceStore.getTaskTrace("task_test_100");
  assert.equal(traces.length, 8);
  assert.equal(traces[0].event, "task_started");
  assert.equal(traces[4].endpoint, "/api/kol/page"); // query stripped
  assert.ok(!traces[6].message.includes("TEST_SECRET_SHOULD_NOT_LEAK")); // secret stripped
  assert.equal(traces[7].event, "task_failed");

  // 2. Build ZIP Package
  const pkg = await manager1.generatePackage({ relatedTaskId: "task_test_100", userNote: "Test problem description" });
  assert.ok(pkg.zipBuffer.length > 0 && pkg.zipBuffer.length <= 20 * 1024 * 1024);

  // 3. Inspect every uncompressed entry in generated ZIP (Post-Package Scan Verification)
  const unzipped = await JSZip.loadAsync(pkg.zipBuffer);
  for (const [filePath, file] of Object.entries(unzipped.files)) {
    if (file.dir) continue;
    const text = await file.async("string");
    assert.ok(!text.includes("TEST_SECRET_SHOULD_NOT_LEAK"), `Secret leaked in ${filePath}`);
    assert.ok(!text.includes("zhangsan"), `User home leaked in ${filePath}`);
    assert.ok(!text.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), `Bearer token leaked in ${filePath}`);
    const scan = scanForSensitiveData(text);
    assert.equal(scan.clean, true, `Sensitive pattern in ${filePath}: ${scan.findings.join(", ")}`);
  }

  // 4. Test Install ID Persistence across simulated restart
  const manager2 = new DiagnosticManager({
    userDataDir: tempUserData,
    historyStore: mockHistoryStore,
    appVersion: "1.4.5",
    assetsVersion: "1.4.5",
  });
  await manager2.init();
  assert.equal(manager2.traceStore.installId, installId1, "installId must remain identical across app restarts");
  assert.notEqual(manager2.traceStore.sessionId, sessionId1, "sessionId must be fresh on new app start");

  // Clean up temp dir
  await fs.rm(tempUserData, { recursive: true, force: true }).catch(() => {});
});
