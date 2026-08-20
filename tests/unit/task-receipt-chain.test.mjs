import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DeviceKeyManager } from "../../app-source/electron-main/device-key-manager.mjs";
import { TaskReceiptService } from "../../app-source/electron-main/task-receipt-service.mjs";

test("TaskReceiptService generates sequential cryptographically linked receipt chain", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "device-key-test-"));
  const deviceKeyManager = new DeviceKeyManager({ baseDir: tmp });
  await deviceKeyManager.initialize();

  const receiptService = new TaskReceiptService({ deviceKeyManager });
  receiptService.createChain("auth_100", "tkt_200");

  const r1 = receiptService.generateReceipt("auth_100", {
    processedCount: 10,
    successCount: 9,
    failedCount: 1,
    taskState: "running",
  });
  assert.equal(r1.sequence, 1);
  assert.equal(r1.previousReceiptHash, "0000000000000000000000000000000000000000000000000000000000000000");

  const r2 = receiptService.generateReceipt("auth_100", {
    processedCount: 20,
    successCount: 18,
    failedCount: 2,
    taskState: "completed",
    isFinal: true,
  });
  assert.equal(r2.sequence, 2);
  assert.equal(r2.previousReceiptHash, r1.receiptHash);
  assert.equal(r2.final, true);

  // Verify chain
  const isValid = receiptService.verifyChain([r1, r2], deviceKeyManager.getPublicKeyPem());
  assert.equal(isValid, true);

  // Rejects broken hash chain
  const tamperedChain = [r1, { ...r2, previousReceiptHash: "deadbeef" }];
  assert.equal(receiptService.verifyChain(tamperedChain, deviceKeyManager.getPublicKeyPem()), false);

  // Rejects out of sequence
  const outOfSeq = [{ ...r1, sequence: 2 }, r2];
  assert.equal(receiptService.verifyChain(outOfSeq, deviceKeyManager.getPublicKeyPem()), false);

  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("DeviceKeyManager persists key and deterministically reloads on restart", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dev-key-persist-"));
  const km1 = new DeviceKeyManager({ baseDir: tmp });
  await km1.initialize();
  const keyId1 = km1.getDeviceKeyId();
  const pub1 = km1.getPublicKeyPem();

  const km2 = new DeviceKeyManager({ baseDir: tmp });
  await km2.initialize();
  assert.equal(km2.getDeviceKeyId(), keyId1);
  assert.equal(km2.getPublicKeyPem(), pub1);

  const sig = km2.sign("hello world");
  assert.ok(typeof sig === "string" && sig.length > 0);

  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

