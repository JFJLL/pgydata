import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildDiagnosticPackage } from "./diagnostic-packager.mjs";

test("DiagnosticPackager: builds valid ZIP with manifest, system, app, tasks, logs and verifies allowlist & SHA256", async () => {
  const payload = {
    system: { platform: "win32", arch: "x64", osType: "Windows_NT" },
    app: { appVersion: "1.4.5", assetsVersion: "1.4.5", installId: "inst_test_123" },
    logs: [{ alias: "main-current.log", content: "2026-09-02 [INFO] application started" }],
    errors: [{ time: "2026-09-02T10:00:00Z", name: "NetworkError", message: "timeout" }],
    tasks: {
      recentTasks: [{ taskId: "task_1", status: "completed", total: 5, successCount: 5, failedCount: 0 }],
      taskTrace: [{ time: "2026-09-02T10:00:01Z", event: "task_started", step: "init" }],
      targetTaskId: "task_1",
    },
    network: { requests: 10, failures: 1, timeouts: 0, averageDurationMs: 120 },
    relatedTaskId: "task_1",
    userNote: "Task finished with warning",
  };

  const result = await buildDiagnosticPackage(payload);
  assert.ok(result.zipBuffer instanceof Buffer);
  assert.ok(result.fileSizeBytes > 0 && result.fileSizeBytes <= 20 * 1024 * 1024);
  assert.ok(/^[a-f0-9]{64}$/.test(result.sha256));
  assert.equal(result.manifest.appVersion, "1.4.5");
  assert.equal(result.manifest.relatedTaskId, "task_1");
  assert.equal(result.summary.recentTasks.length, 1);

  // Unpack and inspect ZIP contents
  const zip = await JSZip.loadAsync(result.zipBuffer);
  const files = Object.keys(zip.files);
  assert.ok(files.includes("manifest.json"));
  assert.ok(files.includes("system.json"));
  assert.ok(files.includes("app.json"));
  assert.ok(files.includes("logs/main-current.log"));
  assert.ok(files.includes("tasks/tasks.json"));
  assert.ok(files.includes("tasks/task_1-trace.jsonl"));

  const manifestText = await zip.file("manifest.json").async("string");
  const parsedManifest = JSON.parse(manifestText);
  assert.equal(parsedManifest.collectors.system, "success");
});

test("DiagnosticPackager: prevents packaging if high risk sensitive credentials leak", async () => {
  const dirtyPayload = {
    logs: [{ alias: "main-current.log", content: "Debug: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.unredacted.secret" }],
  };

  await assert.rejects(async () => {
    await buildDiagnosticPackage(dirtyPayload);
  }, /Sensitive data leak/);
});
