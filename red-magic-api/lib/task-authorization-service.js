const crypto = require("crypto");
const { canonicalJson, signPayload, verifySignedEnvelope, DEFAULT_KEY_ID } = require("./manifest-crypto");

const DEFAULT_TICKET_KEY_ID = "magiorix-ticket-2026-v1";
const DEFAULT_TICKET_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMaMnU+xxOv30CKGTxMe6SPK9ay4eN6DgTh0l/xmLwko=\n-----END PUBLIC KEY-----\n";

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = "auth") {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function hashSha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

class TaskAuthorizationService {
  constructor({ db, ticketPrivateKey = null, ticketKeyId = DEFAULT_TICKET_KEY_ID, ticketTtlMinutes = 15, clock = nowIso } = {}) {
    this.db = db;
    this.ticketPrivateKey = ticketPrivateKey || process.env.MAGIORIX_TASK_TICKET_PRIVATE_KEY || null;
    this.ticketKeyId = ticketKeyId || process.env.MAGIORIX_TASK_TICKET_KEY_ID || DEFAULT_TICKET_KEY_ID;
    this.ticketTtlMinutes = ticketTtlMinutes;
    this.clock = clock;
    this.createAuthorizationAttempts = new Map();
    this.createAuthorizationWindowMs = Math.max(1000, Number(process.env.MAGIORIX_TASK_AUTH_RATE_WINDOW_MS || 60_000));
    this.createAuthorizationMaxAttempts = Math.max(1, Number(process.env.MAGIORIX_TASK_AUTH_RATE_MAX || 12));
  }

  async registerDevice({ userId, deviceKeyId, signingPublicKey, clientVersion = "1.4.2", deviceName = "Desktop" }) {
    if (!userId || !deviceKeyId || !signingPublicKey) {
      throw new Error("Missing required device registration parameters");
    }
    const now = this.clock();
    const existing = await this.db.get(
      "SELECT * FROM desktop_devices WHERE user_id = ? AND device_key_id = ?",
      [userId, deviceKeyId]
    );

    if (existing) {
      if (existing.status !== "ACTIVE") {
        throw new Error(`Device is not active: ${existing.status}`);
      }
      await this.db.run(
        `UPDATE desktop_devices
         SET signing_public_key = ?, client_version = ?, device_name = ?, last_seen_at = ?, updated_at = ?
         WHERE id = ?`,
        [signingPublicKey, clientVersion, deviceName, now, now, existing.id]
      );
      return { deviceId: existing.id, status: existing.status };
    }

    const deviceId = randomId("dev");
    await this.db.run(
      `INSERT INTO desktop_devices
       (id, user_id, device_key_id, signing_public_key, signing_algorithm, client_version, device_name, status, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ed25519', ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [deviceId, userId, deviceKeyId, signingPublicKey, clientVersion, deviceName, now, now, now, now]
    );
    return { deviceId, status: "ACTIVE" };
  }

  async getDevice(userId, deviceKeyId) {
    return this.db.get(
      "SELECT * FROM desktop_devices WHERE user_id = ? AND device_key_id = ?",
      [userId, deviceKeyId]
    );
  }

  async createAuthorization({ userId, deviceKeyId, clientTaskId, taskType, taskDigest, requestedItems, clientVersion = "1.4.2", ipHash = null }) {
    const rateKey = String(userId);
    const rateNow = Date.now();
    const priorAttempts = (this.createAuthorizationAttempts.get(rateKey) || [])
      .filter((timestamp) => rateNow - timestamp < this.createAuthorizationWindowMs);
    if (priorAttempts.length >= this.createAuthorizationMaxAttempts) {
      const error = new Error("Too many task authorization requests");
      error.statusCode = 429;
      error.code = "task-authorization-rate-limit";
      throw error;
    }
    priorAttempts.push(rateNow);
    this.createAuthorizationAttempts.set(rateKey, priorAttempts);
    if (!userId || !deviceKeyId || !clientTaskId || !taskType || !taskDigest) {
      throw new Error("Missing required authorization parameters");
    }
    const items = Number.parseInt(requestedItems, 10);
    if (!Number.isInteger(items) || items <= 0 || items > 50000) {
      throw new Error("Invalid requestedItems quantity");
    }

    const device = await this.getDevice(userId, deviceKeyId);
    if (!device || device.status !== "ACTIVE") {
      throw new Error("Device is not registered or not active");
    }

    await this.db.run("BEGIN IMMEDIATE TRANSACTION");
    try {
      const now = this.clock();
      // 1. Check idempotency on (user_id, client_task_id)
      const existing = await this.db.get(
        "SELECT * FROM task_authorizations WHERE user_id = ? AND client_task_id = ?",
        [userId, clientTaskId]
      );

      if (existing) {
        if (existing.task_digest !== taskDigest) {
          const err = new Error("Client task ID already exists with a different task digest");
          err.statusCode = 409;
          err.code = "task-digest-conflict";
          throw err;
        }
        // Return existing authorization
        const ticketEnvelope = this.signTicket({
          version: "1.0",
          kid: existing.ticket_key_id,
          jti: existing.ticket_jti,
          authorizationId: existing.id,
          userId,
          deviceKeyId,
          clientTaskId,
          taskType: existing.task_type,
          taskDigest: existing.task_digest,
          maxItems: existing.authorized_items,
          pointsPerItem: existing.points_per_item,
          policyVersion: "1.0",
          minimumClientVersion: "1.4.2",
          issuedAt: existing.created_at,
          expiresAt: existing.ticket_expires_at,
          nonce: randomId("nonce"),
        });

        await this.db.run("COMMIT");
        return {
          authorizationId: existing.id,
          reservedPoints: existing.reserved_points,
          ticket: ticketEnvelope.signedPayload,
          ticketSignature: ticketEnvelope.signature,
          ticketKeyId: ticketEnvelope.keyId,
          expiresAt: existing.ticket_expires_at,
          status: existing.status,
          isIdempotent: true,
        };
      }

      // 2. Check and lock balance
      const account = await this.db.get("SELECT balance FROM shumiao_accounts WHERE user_id = ?", [userId]);
      const currentBalance = Number(account?.balance || 0);
      const pointsPerItem = 1;
      const reservedPoints = items * pointsPerItem;

      if (currentBalance < reservedPoints) {
        const err = new Error(`积分余额不足（当前: ${currentBalance}, 所需预占: ${reservedPoints}）`);
        err.statusCode = 402;
        err.code = "insufficient-balance";
        throw err;
      }

      // 3. Deduct from user account atomically
      await this.db.run(
        "UPDATE shumiao_accounts SET balance = balance - ?, updated_at = ? WHERE user_id = ?",
        [reservedPoints, now, userId]
      );

      // 4. Create task_authorization and credit_reservation
      const authorizationId = randomId("auth");
      const ticketJti = randomId("tkt");
      const expiresAt = new Date(Date.now() + this.ticketTtlMinutes * 60 * 1000).toISOString();

      await this.db.run(
        `INSERT INTO task_authorizations
         (id, user_id, device_id, client_task_id, task_type, task_digest, requested_items, authorized_items, points_per_item, reserved_points, settled_points, ticket_jti, ticket_key_id, ticket_expires_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'AUTHORIZED', ?, ?)`,
        [authorizationId, userId, device.id, clientTaskId, taskType, taskDigest, items, items, pointsPerItem, reservedPoints, ticketJti, this.ticketKeyId, expiresAt, now, now]
      );

      const reservationId = randomId("resv");
      await this.db.run(
        `INSERT INTO credit_reservations
         (id, user_id, authorization_id, amount, settled_amount, released_amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 'HELD', ?, ?)`,
        [reservationId, userId, authorizationId, reservedPoints, now, now]
      );

      // 5. Audit log
      await this.db.run(
        `INSERT INTO task_auth_audit_logs
         (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, ip_hash, created_at)
         VALUES (?, ?, ?, 'CREATE_AUTH', ?, ?, ?, ?, 'AUTHORIZED', ?, ?)`,
        [userId, device.id, authorizationId, taskType, taskDigest, items, -reservedPoints, ipHash, now]
      );

      // 6. Sign Ticket
      const ticketPayload = {
        version: "1.0",
        kid: this.ticketKeyId,
        jti: ticketJti,
        authorizationId,
        userId,
        deviceKeyId,
        clientTaskId,
        taskType,
        taskDigest,
        maxItems: items,
        pointsPerItem,
        policyVersion: "1.0",
        minimumClientVersion: "1.4.2",
        issuedAt: now,
        expiresAt,
        nonce: randomId("nonce"),
      };

      const ticketEnvelope = this.signTicket(ticketPayload);
      await this.db.run("COMMIT");

      return {
        authorizationId,
        reservedPoints,
        ticket: ticketEnvelope.signedPayload,
        ticketSignature: ticketEnvelope.signature,
        ticketKeyId: ticketEnvelope.keyId,
        expiresAt,
        status: "AUTHORIZED",
        isIdempotent: false,
      };
    } catch (err) {
      await this.db.run("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  signTicket(payload) {
    if (!this.ticketPrivateKey) {
      // Fallback for unsigned local test harness
      return {
        keyId: this.ticketKeyId,
        signature: "unsigned_local_mock_sig_" + hashSha256(canonicalJson(payload)).slice(0, 32),
        signedPayload: payload,
      };
    }
    const canonical = canonicalJson(payload);
    const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), this.ticketPrivateKey);
    return {
      keyId: this.ticketKeyId,
      signature: signature.toString("hex"),
      signedPayload: payload,
    };
  }

  async startAuthorization({ userId, authorizationId }) {
    const now = this.clock();
    const auth = await this.db.get(
      "SELECT * FROM task_authorizations WHERE id = ? AND user_id = ?",
      [authorizationId, userId]
    );
    if (!auth) {
      throw new Error("Authorization not found");
    }
    if (auth.status === "STARTED") {
      return { ok: true, status: "STARTED", isIdempotent: true };
    }
    if (auth.status !== "AUTHORIZED") {
      throw new Error(`Cannot start authorization in status ${auth.status}`);
    }

    await this.db.run(
      "UPDATE task_authorizations SET status = 'STARTED', started_at = ?, updated_at = ? WHERE id = ?",
      [now, now, authorizationId]
    );

    await this.db.run(
      `INSERT INTO task_auth_audit_logs
       (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
       VALUES (?, ?, ?, 'START', ?, ?, ?, 0, 'STARTED', ?)`,
      [userId, auth.device_id, authorizationId, auth.task_type, auth.task_digest, auth.authorized_items, now]
    );

    return { ok: true, status: "STARTED" };
  }

  async completeAuthorization({ userId, authorizationId, finalReceipt }) {
    if (!finalReceipt || typeof finalReceipt !== "object") {
      throw new Error("Missing final receipt object");
    }
    const { sequence, previousReceiptHash, processedCount, successCount, failedCount, deviceKeyId, deviceSignature } = finalReceipt;

    const auth = await this.db.get(
      "SELECT * FROM task_authorizations WHERE id = ? AND user_id = ?",
      [authorizationId, userId]
    );
    if (!auth) {
      throw new Error("Authorization not found");
    }
    if (auth.status === "COMPLETED") {
      return {
        ok: true,
        status: "COMPLETED",
        settledPoints: auth.settled_points,
        releasedPoints: auth.reserved_points - auth.settled_points,
        isIdempotent: true,
      };
    }

    if (auth.status !== "STARTED") {
      throw new Error(`Authorization is not startable for completion: ${auth.status}`);
    }

    // Verify Device Signature
    const device = await this.getDevice(userId, deviceKeyId);
    if (!device) {
      throw new Error("Device key not recognized for user");
    }

    const receiptBody = { ...finalReceipt };
    delete receiptBody.deviceSignature;
    delete receiptBody.receiptHash;
    const receiptCanonical = canonicalJson(receiptBody);
    const receiptHash = hashSha256(receiptCanonical);
    if (typeof finalReceipt.receiptHash !== "string" || finalReceipt.receiptHash !== receiptHash) {
      throw new Error("Receipt hash verification failed" );
    }

    if (typeof deviceSignature !== "string" || !/^[a-f0-9]{128}$/i.test(deviceSignature)) {
      throw new Error("Invalid device signature encoding on final receipt");
    }
    {
      try {
        const isDeviceSigValid = crypto.verify(
          null,
          Buffer.from(receiptCanonical, "utf8"),
          device.signing_public_key,
          Buffer.from(deviceSignature, "hex")
        );
        if (!isDeviceSigValid) {
          throw new Error("Invalid device signature on final receipt");
        }
      } catch (e) {
        throw new Error("Device signature verification failed: " + e.message);
      }
    }

    const success = Number(successCount || 0);
    const failed = Number(failedCount || 0);
    if (success + failed > auth.authorized_items) {
      throw new Error(`Processed count ${success + failed} exceeds authorized limit ${auth.authorized_items}`);
    }

    const pointsToDebit = success * auth.points_per_item;
    const pointsToRelease = auth.reserved_points - pointsToDebit;

    await this.db.run("BEGIN IMMEDIATE TRANSACTION");
    try {
      const now = this.clock();
      const lastReceipt = await this.db.get(
        "SELECT sequence, receipt_hash, processed_count FROM task_receipts WHERE authorization_id = ? ORDER BY sequence DESC LIMIT 1",
        [authorizationId]
      );
      const expectedSequence = lastReceipt ? Number(lastReceipt.sequence) + 1 : 1;
      const expectedPreviousHash = lastReceipt
        ? lastReceipt.receipt_hash
        : "0000000000000000000000000000000000000000000000000000000000000000";
      if (!Number.isInteger(sequence) || sequence !== expectedSequence) {
        throw new Error("Receipt sequence is not the next expected value");
      }
      if (previousReceiptHash !== expectedPreviousHash) {
        throw new Error("Receipt hash chain verification failed");
      }
      if (!Number.isInteger(processedCount) || !Number.isInteger(successCount) || !Number.isInteger(failedCount)
        || processedCount < 0 || successCount < 0 || failedCount < 0
        || processedCount !== successCount + failedCount
        || processedCount > Number(auth.authorized_items)
        || (lastReceipt && processedCount < Number(lastReceipt.processed_count))) {
        throw new Error("Receipt counters are invalid");
      }
      // Refund unconsumed reserved points back to user balance
      if (pointsToRelease > 0) {
        await this.db.run(
          "UPDATE shumiao_accounts SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
          [pointsToRelease, now, userId]
        );
      }

      // Record in consume_records for ledger consistency
      const updatedAccount = await this.db.get("SELECT balance FROM shumiao_accounts WHERE user_id = ?", [userId]);
      if (pointsToDebit > 0) {
        await this.db.run(
          `INSERT INTO consume_records
           (user_id, count, balance_after, remark, detail_type, detail_summary, task_id, item_index, created_at)
           VALUES (?, ?, ?, '任务结算扣除', 'task-authorization', ?, ?, 1, ?)`,
          [userId, pointsToDebit, updatedAccount?.balance || 0, `任务结算: ${auth.task_type} (成功: ${success}, 释放: ${pointsToRelease})`, auth.client_task_id, now]
        );
      }

      // Update credit_reservations
      await this.db.run(
        `UPDATE credit_reservations
         SET status = 'SETTLED', settled_amount = ?, released_amount = ?, updated_at = ?
         WHERE authorization_id = ?`,
        [pointsToDebit, pointsToRelease, now, authorizationId]
      );

      // Update task_authorizations
      await this.db.run(
        `UPDATE task_authorizations
         SET status = 'COMPLETED', settled_points = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
        [pointsToDebit, now, now, authorizationId]
      );

      // Save receipt
      const receiptId = randomId("rcpt");
      await this.db.run(
        `INSERT INTO task_receipts
         (id, authorization_id, ticket_jti, sequence, previous_receipt_hash, receipt_hash, processed_count, success_count, failed_count, timestamp, task_state, is_final, device_key_id, device_signature, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, ?, ?, ?)`,
        [receiptId, authorizationId, auth.ticket_jti, sequence || 1, previousReceiptHash || "0", receiptHash, success + failed, success, failed, now, deviceKeyId, deviceSignature || "", now]
      );

      // Audit log
      await this.db.run(
        `INSERT INTO task_auth_audit_logs
         (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
         VALUES (?, ?, ?, 'COMPLETE', ?, ?, ?, ?, 'COMPLETED', ?)`,
        [userId, auth.device_id, authorizationId, auth.task_type, auth.task_digest, success + failed, pointsToRelease, now]
      );

      await this.db.run("COMMIT");
      return {
        ok: true,
        status: "COMPLETED",
        settledPoints: pointsToDebit,
        releasedPoints: pointsToRelease,
        balanceAfter: updatedAccount?.balance || 0,
      };
    } catch (err) {
      await this.db.run("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  async cancelAuthorization({ userId, authorizationId, finalReceipt = null, reason = "user-cancel" }) {
    const auth = await this.db.get(
      "SELECT * FROM task_authorizations WHERE id = ? AND user_id = ?",
      [authorizationId, userId]
    );
    if (!auth) {
      throw new Error("Authorization not found");
    }
    if (auth.status === "CANCELLED") {
      return { ok: true, status: "CANCELLED", isIdempotent: true };
    }

    const now = this.clock();
    await this.db.run("BEGIN IMMEDIATE TRANSACTION");
    try {
      if (auth.status === "AUTHORIZED") {
        // Not started: full refund of reservation
        await this.db.run(
          "UPDATE shumiao_accounts SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
          [auth.reserved_points, now, userId]
        );
        await this.db.run(
          "UPDATE credit_reservations SET status = 'RELEASED', released_amount = ?, updated_at = ? WHERE authorization_id = ?",
          [auth.reserved_points, now, authorizationId]
        );
        await this.db.run(
          "UPDATE task_authorizations SET status = 'CANCELLED', cancelled_at = ?, review_reason = ?, updated_at = ? WHERE id = ?",
          [now, reason, now, authorizationId]
        );
        await this.db.run(
          `INSERT INTO task_auth_audit_logs
           (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
           VALUES (?, ?, ?, 'CANCEL', ?, ?, 0, ?, 'CANCELLED', ?)`,
          [userId, auth.device_id, authorizationId, auth.task_type, auth.task_digest, auth.reserved_points, now]
        );
        await this.db.run("COMMIT");
        return { ok: true, status: "CANCELLED", releasedPoints: auth.reserved_points };
      }

      if (auth.status === "STARTED") {
        if (finalReceipt && typeof finalReceipt === "object") {
          // If valid partial receipt is provided, settle partial execution
          await this.db.run("COMMIT");
          return await this.completeAuthorization({ userId, authorizationId, finalReceipt });
        }
        // Started without receipt -> Flag as REVIEW_REQUIRED, do not automatically refund
        await this.db.run(
          "UPDATE task_authorizations SET status = 'REVIEW_REQUIRED', review_reason = 'cancelled-without-receipt', updated_at = ? WHERE id = ?",
          [now, authorizationId]
        );
        await this.db.run(
          "UPDATE credit_reservations SET status = 'REVIEW_REQUIRED', updated_at = ? WHERE authorization_id = ?",
          [now, authorizationId]
        );
        await this.db.run(
          `INSERT INTO task_auth_audit_logs
           (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
           VALUES (?, ?, ?, 'REVIEW', ?, ?, 0, 0, 'REVIEW_REQUIRED', ?)`,
          [userId, auth.device_id, authorizationId, auth.task_type, auth.task_digest, now]
        );
        await this.db.run("COMMIT");
        return { ok: false, status: "REVIEW_REQUIRED", reason: "Task was started and cannot be refunded without valid execution receipt" };
      }

      await this.db.run("COMMIT");
      return { ok: false, status: auth.status, reason: `Cannot cancel authorization in status ${auth.status}` };
    } catch (err) {
      await this.db.run("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  async heartbeatAuthorization({ userId, authorizationId }) {
    const auth = await this.db.get(
      "SELECT * FROM task_authorizations WHERE id = ? AND user_id = ?",
      [authorizationId, userId]
    );
    if (!auth) {
      throw new Error("Authorization not found");
    }
    if (auth.status !== "STARTED") {
      throw new Error(`Authorization cannot accept heartbeat in state ${auth.status}`);
    }
    const now = this.clock();
    await this.db.run(
      "UPDATE task_authorizations SET updated_at = ? WHERE id = ?",
      [now, authorizationId]
    );
    await this.db.run(
      `INSERT INTO task_auth_audit_logs
       (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
       VALUES (?, ?, ?, 'HEARTBEAT', ?, ?, 0, 0, 'STARTED', ?)`,
      [userId, auth.device_id, authorizationId, auth.task_type, auth.task_digest, now]
    );
    return { authorizationId, status: "STARTED", updatedAt: now, expiresAt: auth.ticket_expires_at };
  }

  async reconcileExpiredAuthorizations() {
    const now = this.clock();
    const expiredList = await this.db.all(
      "SELECT * FROM task_authorizations WHERE status = 'AUTHORIZED' AND ticket_expires_at < ?",
      [now]
    );

    let releasedCount = 0;
    for (const auth of expiredList) {
      await this.db.run("BEGIN IMMEDIATE TRANSACTION");
      try {
        await this.db.run(
          "UPDATE shumiao_accounts SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
          [auth.reserved_points, now, auth.user_id]
        );
        await this.db.run(
          "UPDATE credit_reservations SET status = 'RELEASED', released_amount = ?, updated_at = ? WHERE authorization_id = ?",
          [auth.reserved_points, now, auth.id]
        );
        await this.db.run(
          "UPDATE task_authorizations SET status = 'EXPIRED', updated_at = ? WHERE id = ?",
          [now, auth.id]
        );
        await this.db.run(
          `INSERT INTO task_auth_audit_logs
           (user_id, device_id, authorization_id, action, task_type, task_digest, items_count, points_delta, status, created_at)
           VALUES (?, ?, ?, 'EXPIRE_RELEASE', ?, ?, 0, ?, 'EXPIRED', ?)`,
          [auth.user_id, auth.device_id, auth.id, auth.task_type, auth.task_digest, auth.reserved_points, now]
        );
        await this.db.run("COMMIT");
        releasedCount += 1;
      } catch {
        await this.db.run("ROLLBACK").catch(() => {});
      }
    }
    return { releasedCount };
  }
}

module.exports = {
  TaskAuthorizationService,
  DEFAULT_TICKET_KEY_ID,
  DEFAULT_TICKET_PUBLIC_KEY,
};

