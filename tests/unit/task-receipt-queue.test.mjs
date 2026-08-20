import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DeviceKeyManager } from "../../app-source/electron-main/device-key-manager.mjs";
import { TaskReceiptService } from "../../app-source/electron-main/task-receipt-service.mjs";

test("final Receipt persists without task content and is retried in order after network recovery", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-receipt-queue-"));
  try {
    const keys = new DeviceKeyManager({ baseDir });
    await keys.initialize();
    const queueFilePath = path.join(baseDir, "pending-task-receipts.json");

    const offlineReceipts = new TaskReceiptService({ deviceKeyManager: keys, queueFilePath });
    offlineReceipts.createChain("auth_queue_1", "ticket_queue_1");
    const receipt = offlineReceipts.generateReceipt("auth_queue_1", {
      processedCount: 2,
      successCount: 2,
      failedCount: 0,
      taskState: "completed",
      isFinal: true,
    });
    offlineReceipts.enqueueFinalReceipt({
      clientTaskId: "client_queue_1",
      authorizationId: "auth_queue_1",
      receipt,
    });

    const persisted = fs.readFileSync(queueFilePath, "utf8");
    assert.match(persisted, /auth_queue_1/);
    assert.doesNotMatch(persisted, /https?:\/\//);
    assert.doesNotMatch(persisted, /cookie|collectedData|noteContent/i);

    const calls = [];
    const apiClient = {
      async post(url, body, options) {
        calls.push({ url, body, options });
        return { ok: true };
      },
    };
    const restored = new TaskReceiptService({ deviceKeyManager: keys, queueFilePath, apiClient });
    const result = await restored.flushPendingFinalReceipts();

    assert.deepEqual(result, { flushedCount: 1, pendingCount: 0 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/desktop/task-authorizations/auth_queue_1/complete");
    assert.equal(calls[0].body.finalReceipt.receiptHash, receipt.receiptHash);
    assert.equal(JSON.parse(fs.readFileSync(queueFilePath, "utf8")).items.length, 0);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test("Receipt queue rejects a tampered final Receipt before persistence", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-receipt-tamper-"));
  try {
    const keys = new DeviceKeyManager({ baseDir });
    await keys.initialize();
    const receipts = new TaskReceiptService({ deviceKeyManager: keys });
    receipts.createChain("auth_tamper_1", "ticket_tamper_1");
    const receipt = receipts.generateReceipt("auth_tamper_1", {
      processedCount: 1,
      successCount: 1,
      failedCount: 0,
      taskState: "completed",
      isFinal: true,
    });
    receipt.successCount = 999;
    assert.throws(
      () => receipts.enqueueFinalReceipt({ clientTaskId: "client_tamper_1", authorizationId: "auth_tamper_1", receipt }),
      /integrity verification/,
    );
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});
