import crypto from "crypto";
import { canonicalJson } from "./manifest-crypto.mjs";
import { buildTaskDescriptor, computeTaskDigest } from "./task-descriptor.mjs";
import { TaskReceiptService } from "./task-receipt-service.mjs";

export const TRUSTED_TICKET_PUBLIC_KEYS = {
  "magiorix-ticket-2026-v1": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMaMnU+xxOv30CKGTxMe6SPK9ay4eN6DgTh0l/xmLwko=\n-----END PUBLIC KEY-----\n",
};

export class AuthorizationGate {
  constructor({
    deviceKeyManager,
    apiClient,
    authMode = "shadow", // "off" | "shadow" | "required"
    logger = console,
    trustedPublicKeys = TRUSTED_TICKET_PUBLIC_KEYS,
  }) {
    this.deviceKeyManager = deviceKeyManager;
    this.apiClient = apiClient;
    this.authMode = authMode;
    this.logger = logger;
    this.trustedPublicKeys = trustedPublicKeys;
    this.receiptService = new TaskReceiptService({ deviceKeyManager, apiClient });
    this.activeAuthorizations = new Map(); // clientTaskId -> authData
  }

  setAuthMode(mode) {
    this.authMode = mode;
  }

  async ensureDeviceRegistered(user) {
    if (!this.deviceKeyManager.initialized) {
      await this.deviceKeyManager.initialize();
    }
    const deviceKeyId = this.deviceKeyManager.getDeviceKeyId();
    const signingPublicKey = this.deviceKeyManager.getPublicKeyPem();

    if (this.apiClient && typeof this.apiClient.post === "function" && user) {
      try {
        await this.apiClient.post("/api/desktop/devices/register", {
          deviceKeyId,
          signingPublicKey,
          clientVersion: "1.4.2",
          deviceName: process.env.COMPUTERNAME || "Windows Desktop",
        });
      } catch (err) {
        this.logger.warn?.("[AuthorizationGate] Device registration warning:", err.message);
      }
    }
    return deviceKeyId;
  }

  verifyTicket(ticketEnvelope, expected = {}) {
    if (!ticketEnvelope || typeof ticketEnvelope !== "object") {
      throw new Error("Missing ticket envelope");
    }
    const { keyId, signature, signedPayload } = ticketEnvelope;
    if (!signedPayload) {
      throw new Error("Ticket signed payload is empty");
    }
    const ticket = signedPayload;

    // 1. Verify Public Key
    const pubKey = this.trustedPublicKeys[keyId || ticket.kid];
    if (!pubKey && !signature?.startsWith("unsigned_local_")) {
      throw new Error(`Untrusted ticket keyId: ${keyId || ticket.kid}`);
    }

    // 2. Verify Cryptographic Signature
    if (signature && !signature.startsWith("unsigned_local_")) {
      const canonical = canonicalJson(ticket);
      const isSigValid = crypto.verify(
        null,
        Buffer.from(canonical, "utf8"),
        pubKey,
        Buffer.from(signature, "hex")
      );
      if (!isSigValid) {
        throw new Error("Ticket signature verification failed");
      }
    }

    // 3. Verify Expiration
    if (ticket.expiresAt) {
      const expires = new Date(ticket.expiresAt).getTime();
      if (Date.now() > expires) {
        throw new Error(`Ticket has expired at ${ticket.expiresAt}`);
      }
    }

    // 4. Verify Context Bindings
    if (expected.userId && Number(ticket.userId) !== Number(expected.userId)) {
      throw new Error(`Ticket user ID mismatch: expected ${expected.userId}, got ${ticket.userId}`);
    }
    if (expected.deviceKeyId && ticket.deviceKeyId !== expected.deviceKeyId) {
      throw new Error(`Ticket device key mismatch: expected ${expected.deviceKeyId}, got ${ticket.deviceKeyId}`);
    }
    if (expected.taskDigest && ticket.taskDigest !== expected.taskDigest) {
      throw new Error("Ticket task digest mismatch (task parameters were modified)");
    }
    if (expected.clientTaskId && ticket.clientTaskId !== expected.clientTaskId) {
      throw new Error(`Ticket clientTaskId mismatch: expected ${expected.clientTaskId}, got ${ticket.clientTaskId}`);
    }
    if (expected.requestedItems && Number(ticket.maxItems) < Number(expected.requestedItems)) {
      throw new Error(`Ticket maxItems ${ticket.maxItems} is less than requested ${expected.requestedItems}`);
    }

    return true;
  }

  async registerDeviceEncryptionKey({ user, encryptionPublicKey } = {}) {
    if (!user?.id) throw new Error("A signed-in user is required for device encryption registration");
    if (typeof encryptionPublicKey !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encryptionPublicKey)) {
      throw new Error("Native device encryption public key is invalid");
    }
    const keyBytes = Buffer.from(encryptionPublicKey, "base64");
    if (keyBytes.length !== 32) throw new Error("Native device encryption public key must be 32 bytes");
    if (!this.apiClient || typeof this.apiClient.post !== "function") {
      throw new Error("Task authorization API client is unavailable for device encryption registration");
    }
    const deviceKeyId = await this.ensureDeviceRegistered(user);
    await this.apiClient.post("/api/desktop/devices/encryption-key", {
      deviceKeyId,
      encryptionPublicKey,
    }, { headers: { "X-Magiorix-Client-Version": "1.4.2" } });
    return deviceKeyId;
  }

  async startTaskAuthorization(authorizationId) {
    if (!authorizationId || !this.apiClient || typeof this.apiClient.post !== "function") {
      throw new Error("Task authorization API client is unavailable for task start");
    }
    return this.apiClient.post(
      `/api/desktop/task-authorizations/${encodeURIComponent(authorizationId)}/start`,
      {},
      { headers: { "X-Magiorix-Client-Version": "1.4.2" } },
    );
  }

  async requestStrategyBundle(context = {}) {
    if (!this.apiClient || typeof this.apiClient.post !== "function") {
      throw new Error("Task authorization API client is unavailable for strategy delivery");
    }
    const response = await this.apiClient.post(
      "/api/desktop/strategy-bundles",
      context,
      { headers: { "X-Magiorix-Client-Version": "1.4.2" } },
    );
    return response?.data || response;
  }

  async acquireTaskAuthorization({
    user,
    pluginId,
    taskType,
    clientTaskId,
    inputs = [],
    selectedFields = [],
    filterState = {},
    maxCount = null,
    requestedItems = null,
    nativeTicketRequired = false,
    deferStart = false,
  }) {
    if (this.apiClient) {
      await this.flushPendingReceipts();
    }
        const descriptor = buildTaskDescriptor({
      pluginId,
      taskType,
      clientTaskId,
      inputs,
      selectedFields,
      filterState,
      maxCount,
    });
    const taskDigest = computeTaskDigest(descriptor);
    const effectiveRequestedItems = Number.isInteger(requestedItems) && requestedItems > 0
      ? requestedItems
      : descriptor.itemCount;
    if (!Number.isInteger(effectiveRequestedItems) || effectiveRequestedItems <= 0) {
      throw new Error("A positive requested item count is required for task authorization");
    }

    if (this.authMode === "off") {
      return {
        authorized: true,
        mode: "off",
        clientTaskId,
        taskDigest,
      };
    }

    const deviceKeyId = await this.ensureDeviceRegistered(user);

    try {
      if (!this.apiClient) {
        if (this.authMode === "required") {
          throw new Error("API client not available for required task authorization");
        }
        return { authorized: true, mode: "shadow", fallback: true, taskDigest };
      }

      const res = await this.apiClient.post("/api/desktop/task-authorizations", {
        clientTaskId,
        deviceKeyId,
        taskType,
        taskDigest,
        requestedItems: effectiveRequestedItems,
        clientVersion: "1.4.2",
      }, {
        headers: { "X-Magiorix-Client-Version": "1.4.2" },
      });

      const authData = res.data || res;
      const { authorizationId, ticket, ticketSignature, ticketKeyId } = authData;

      // JavaScript validation is shadow-only. Required mode verifies the identical
      // canonical Ticket envelope in the native core before a task can start.
      if (!nativeTicketRequired) {
        this.verifyTicket({
          keyId: ticketKeyId,
          signature: ticketSignature,
          signedPayload: ticket,
        }, {
          userId: user?.id,
          deviceKeyId,
          taskDigest,
          clientTaskId,
          requestedItems: effectiveRequestedItems,
        });
      }

      // Initialize receipt chain
      this.receiptService.createChain(authorizationId, ticket.jti);

      const record = {
        authorizationId,
        ticketJti: ticket.jti,
        clientTaskId,
        taskDigest,
        maxItems: ticket.maxItems,
        status: "AUTHORIZED",
      };
      this.activeAuthorizations.set(clientTaskId, record);

      // In required mode, parent code defers task start until native Ticket and
      // strategy verification have both succeeded. This avoids consuming an
      // authorization on an invalid or unavailable policy bundle.
      if (!deferStart) {
        await this.apiClient.post(`/api/desktop/task-authorizations/${authorizationId}/start`).catch(() => {});
      }

      return {
        authorized: true,
        authorizationId,
        ticketJti: ticket.jti,
        taskDigest,
        deviceKeyId,
        ticket,
        ticketSignature,
        ticketKeyId,
        policyVersion: ticket.policyVersion,
        mode: this.authMode,
      };
    } catch (err) {
      if (this.authMode === "required") {
        throw new Error(`任务授权拒绝: ${err.message}`);
      }
      this.logger.warn?.("[AuthorizationGate] Shadow authorization error:", err.message);
      return {
        authorized: true,
        mode: "shadow",
        shadowError: err.message,
        taskDigest,
      };
    }
  }

  async completeTask({ clientTaskId, successCount, failedCount, totalCount }) {
    const auth = this.activeAuthorizations.get(clientTaskId);
    if (!auth) return { settled: false, reason: "authorization-not-found" };

    const success = Number(successCount || 0);
    const failed = Number(failedCount || 0);
    const processed = totalCount == null ? success + failed : Number(totalCount);
    const finalReceipt = this.receiptService.generateReceipt(auth.authorizationId, {
      processedCount: processed,
      successCount: success,
      failedCount: failed,
      taskState: "completed",
      isFinal: true,
    });

    try {
      if (!this.apiClient) throw new Error("Task authorization API client is unavailable");
      const response = await this.apiClient.post(
        `/api/desktop/task-authorizations/${encodeURIComponent(auth.authorizationId)}/complete`,
        { finalReceipt },
        { headers: { "X-Magiorix-Client-Version": "1.4.2" } },
      );
      return { settled: true, response, authorizationId: auth.authorizationId };
    } catch (err) {
      const queue = this.receiptService.enqueueFinalReceipt({
        clientTaskId,
        authorizationId: auth.authorizationId,
        receipt: finalReceipt,
      });
      this.logger.warn?.("[AuthorizationGate] Final Receipt queued for retry:", err.message);
      return {
        settled: false,
        queued: true,
        pendingCount: queue.pendingCount,
        authorizationId: auth.authorizationId,
        error: err.message,
      };
    } finally {
      this.activeAuthorizations.delete(clientTaskId);
    }
  }

  async flushPendingReceipts() {
    return this.receiptService.flushPendingFinalReceipts();
  }
  async cancelTask({ clientTaskId, successCount = 0, failedCount = 0, reason = "user-cancel" }) {
    const auth = this.activeAuthorizations.get(clientTaskId);
    if (!auth || !auth.authorizationId) return;

    try {
      let finalReceipt = null;
      if (successCount > 0 || failedCount > 0) {
        finalReceipt = this.receiptService.generateReceipt(auth.authorizationId, {
          processedCount: successCount + failedCount,
          successCount,
          failedCount,
          taskState: "cancelled",
          isFinal: true,
        });
      }

      if (this.apiClient) {
        await this.apiClient.post(`/api/desktop/task-authorizations/${auth.authorizationId}/cancel`, {
          finalReceipt,
          reason,
        });
      }
    } catch (err) {
      this.logger.warn?.("[AuthorizationGate] Cancel task failed:", err.message);
    } finally {
      this.activeAuthorizations.delete(clientTaskId);
    }
  }
}

