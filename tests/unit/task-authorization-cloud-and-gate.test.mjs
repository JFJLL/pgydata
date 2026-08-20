import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sqlite3 = require("../../red-magic-api/node_modules/sqlite3");

import { runMigrations } from "../../red-magic-api/lib/database-migrations.js";
import { TaskAuthorizationService } from "../../red-magic-api/lib/task-authorization-service.js";
import { DeviceKeyManager } from "../../app-source/electron-main/device-key-manager.mjs";
import { AuthorizationGate } from "../../app-source/electron-main/authorization-gate.mjs";

function openTestDb() {
  const db = new sqlite3.Database(":memory:");
  const wrap = {
    get: (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))),
    all: (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))),
    run: (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { (err ? reject(err) : resolve(this)); })),
  };
  return { db, wrap };
}

test("Full Task Authorization, Credit Reservation & Receipt Settlement Flow", async () => {
  const { wrap } = openTestDb();
  await runMigrations(wrap);

  // Generate a dedicated Ed25519 Ticket keypair for test
  const { publicKey: ticketPubKey, privateKey: ticketPrivKey } = crypto.generateKeyPairSync("ed25519");
  const ticketPubPem = ticketPubKey.export({ type: "spki", format: "pem" });
  const ticketPrivPem = ticketPrivKey.export({ type: "pkcs8", format: "pem" });

  const authService = new TaskAuthorizationService({
    db: wrap,
    ticketPrivateKey: ticketPrivPem,
    ticketKeyId: "test-ticket-key-v1",
    ticketTtlMinutes: 15,
  });

  // 1. Create a test user with balance 100
  const now = new Date().toISOString();
  await wrap.run("INSERT INTO users (id, phone, status, created_at, updated_at) VALUES (101, '13800000001', 1, ?, ?)", [now, now]);
  await wrap.run("INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at) VALUES (101, 100, ?, ?)", [now, now]);

  // 2. Initialize device and register
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auth-gate-test-"));
  const deviceKeyManager = new DeviceKeyManager({ baseDir: tmp });
  await deviceKeyManager.initialize();
  const deviceKeyId = deviceKeyManager.getDeviceKeyId();

  const devReg = await authService.registerDevice({
    userId: 101,
    deviceKeyId,
    signingPublicKey: deviceKeyManager.getPublicKeyPem(),
    clientVersion: "1.4.2",
    deviceName: "Test PC",
  });
  assert.equal(devReg.status, "ACTIVE");

  // 3. Normal Authorization: Request 20 items (reserves 20, balance -> 80)
  const auth1 = await authService.createAuthorization({
    userId: 101,
    deviceKeyId,
    clientTaskId: "task-001",
    taskType: "blogger",
    taskDigest: "digest-aaa",
    requestedItems: 20,
    clientVersion: "1.4.2",
  });
  assert.equal(auth1.status, "AUTHORIZED");
  assert.equal(auth1.reservedPoints, 20);
  assert.equal(auth1.ticket.maxItems, 20);

  const acc1 = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(acc1.balance, 80);

  // 4. Idempotency: Same clientTaskId + same digest returns existing authorization
  const auth1Repeat = await authService.createAuthorization({
    userId: 101,
    deviceKeyId,
    clientTaskId: "task-001",
    taskType: "blogger",
    taskDigest: "digest-aaa",
    requestedItems: 20,
  });
  assert.equal(auth1Repeat.isIdempotent, true);
  assert.equal(auth1Repeat.authorizationId, auth1.authorizationId);
  const acc1Repeat = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(acc1Repeat.balance, 80); // No double deduction

  // 5. Digest Conflict: Same clientTaskId + different digest -> 409 conflict
  await assert.rejects(
    () => authService.createAuthorization({
      userId: 101,
      deviceKeyId,
      clientTaskId: "task-001",
      taskType: "blogger",
      taskDigest: "digest-DIFFERENT",
      requestedItems: 20,
    }),
    (err) => err.statusCode === 409 && err.code === "task-digest-conflict"
  );

  // 6. Insufficient Balance: Request 90 items when balance is 80 -> 402 insufficient-balance
  await assert.rejects(
    () => authService.createAuthorization({
      userId: 101,
      deviceKeyId,
      clientTaskId: "task-002",
      taskType: "blogger",
      taskDigest: "digest-bbb",
      requestedItems: 90,
    }),
    (err) => err.statusCode === 402 && err.code === "insufficient-balance"
  );

  // 7. Client-side Ticket Verification via AuthorizationGate
  const trustedKeys = { "test-ticket-key-v1": ticketPubPem };
  const gate = new AuthorizationGate({
    deviceKeyManager,
    trustedPublicKeys: trustedKeys,
    authMode: "required",
  });

  const isTicketValid = gate.verifyTicket({
    keyId: auth1.ticketKeyId,
    signature: auth1.ticketSignature,
    signedPayload: auth1.ticket,
  }, {
    userId: 101,
    deviceKeyId,
    taskDigest: "digest-aaa",
    clientTaskId: "task-001",
    requestedItems: 20,
  });
  assert.equal(isTicketValid, true);

  // 8. Tampered Ticket -> Rejection
  assert.throws(
    () => gate.verifyTicket({
      keyId: auth1.ticketKeyId,
      signature: auth1.ticketSignature,
      signedPayload: { ...auth1.ticket, maxItems: 9999 }, // Tampered
    }, { userId: 101, deviceKeyId, taskDigest: "digest-aaa", clientTaskId: "task-001" }),
    /Ticket signature verification failed/
  );

  // 9. Start Authorization
  const startResult = await authService.startAuthorization({
    userId: 101,
    authorizationId: auth1.authorizationId,
  });
  assert.equal(startResult.status, "STARTED");

  // 10. Complete Task with signed final Receipt: 18 success, 2 failed -> Debits 18, refunds 2
  gate.receiptService.createChain(auth1.authorizationId, auth1.ticket.jti);
  const finalReceipt = gate.receiptService.generateReceipt(auth1.authorizationId, {
    processedCount: 20,
    successCount: 18,
    failedCount: 2,
    taskState: "completed",
    isFinal: true,
  });

  const completeResult = await authService.completeAuthorization({
    userId: 101,
    authorizationId: auth1.authorizationId,
    finalReceipt,
  });
  assert.equal(completeResult.status, "COMPLETED");
  assert.equal(completeResult.settledPoints, 18);
  assert.equal(completeResult.releasedPoints, 2);

  // Balance: started at 100, reserved 20 (balance 80), completed 18 -> final balance 82
  const accFinal = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(accFinal.balance, 82);

  // Check consume_records ledger has settlement record
  const consumeRecord = await wrap.get("SELECT * FROM consume_records WHERE task_id = 'task-001'");
  assert.equal(consumeRecord.count, 18);
  assert.equal(consumeRecord.detail_type, "task-authorization");

  // 11. Cancellation of unstarted task -> 100% full refund
  const auth2 = await authService.createAuthorization({
    userId: 101,
    deviceKeyId,
    clientTaskId: "task-003",
    taskType: "note",
    taskDigest: "digest-ccc",
    requestedItems: 10,
  });
  // Balance: 82 - 10 = 72
  const accBeforeCancel = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(accBeforeCancel.balance, 72);

  const cancelResult = await authService.cancelAuthorization({
    userId: 101,
    authorizationId: auth2.authorizationId,
  });
  assert.equal(cancelResult.status, "CANCELLED");
  assert.equal(cancelResult.releasedPoints, 10);

  // Balance refunded back to 82
  const accAfterCancel = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(accAfterCancel.balance, 82);

  // 12. Cancellation of STARTED task without receipt -> REVIEW_REQUIRED (no auto-refund)
  const auth3 = await authService.createAuthorization({
    userId: 101,
    deviceKeyId,
    clientTaskId: "task-004",
    taskType: "note",
    taskDigest: "digest-ddd",
    requestedItems: 10,
  });
  await authService.startAuthorization({ userId: 101, authorizationId: auth3.authorizationId });
  const cancelStartedResult = await authService.cancelAuthorization({
    userId: 101,
    authorizationId: auth3.authorizationId,
    finalReceipt: null,
  });
  assert.equal(cancelStartedResult.status, "REVIEW_REQUIRED");

  // Balance remains 72 (locked in review, not refunded without valid receipt)
  const accReview = await wrap.get("SELECT balance FROM shumiao_accounts WHERE user_id = 101");
  assert.equal(accReview.balance, 72);

  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

