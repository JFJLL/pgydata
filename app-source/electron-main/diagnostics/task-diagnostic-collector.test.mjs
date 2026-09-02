import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTaskSummary } from "./task-diagnostic-collector.mjs";

test("TaskDiagnosticCollector: filters out sensitive business data and keeps allowed fields", () => {
  const rawTask = {
    taskId: "task_abc123",
    pluginId: "pgy-kol",
    taskType: "search-batch",
    inputType: "url-list",
    status: "failed",
    createdAt: "2026-09-02T10:00:00.000Z",
    startedAt: "2026-09-02T10:00:01.000Z",
    updatedAt: "2026-09-02T10:00:15.000Z",
    finishedAt: "2026-09-02T10:00:15.000Z",
    durationMs: 14000,
    total: 10,
    successCount: 4,
    failedCount: 6,
    pendingChargeCount: 0,
    errorCode: "AUTH_EXPIRED",
    errorCategory: "auth",
    errorMessage: "Failed request with satoken=secret_satoken_val at https://example.com/api?user=13812345678",
    retryCount: 2,
    lastStep: "discovery_page_request",
    // Forbidden business & auth fields:
    urls: ["https://pgy.xiaohongshu.com/blogger/123456", "https://pgy.xiaohongshu.com/blogger/789012"],
    sourceRows: [{ name: "KOL_A", phone: "13811112222" }],
    row: { title: "Secret Note Title", content: "Private post details" },
    sourceUrl: "https://pgy.xiaohongshu.com/data/query?secret=abc",
    cookie: "a1=sensitive_cookie_value",
    token: "secret_access_token",
    userPassword: "my_pwd",
    results: [{ kolId: "123", price: 5000 }],
  };

  const sanitized = sanitizeTaskSummary(rawTask);

  // Allowed fields check
  assert.equal(sanitized.taskId, "task_abc123");
  assert.equal(sanitized.status, "failed");
  assert.equal(sanitized.failedCount, 6);
  assert.equal(sanitized.errorCode, "AUTH_EXPIRED");
  assert.equal(sanitized.lastStep, "discovery_page_request");

  // Redaction in error message check
  assert.ok(!sanitized.errorMessage.includes("secret_satoken_val"), "satoken in errorMessage must be redacted");
  assert.ok(!sanitized.errorMessage.includes("13812345678"), "phone in errorMessage must be redacted");

  // Forbidden fields check
  assert.equal(sanitized.urls, undefined);
  assert.equal(sanitized.sourceRows, undefined);
  assert.equal(sanitized.row, undefined);
  assert.equal(sanitized.sourceUrl, undefined);
  assert.equal(sanitized.cookie, undefined);
  assert.equal(sanitized.token, undefined);
  assert.equal(sanitized.userPassword, undefined);
  assert.equal(sanitized.results, undefined);
});
