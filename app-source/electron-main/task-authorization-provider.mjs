import { AuthorizationGate } from "./authorization-gate.mjs";
import { buildTaskDescriptor, computeTaskDigest, normalizeTaskInputs } from "./task-descriptor.mjs";

/**
 * Main-process-only paid-task adapter. Required mode treats the Rust core as the
 * sole authority for Ticket verification, device signing and receipt counters.
 */
export class TaskAuthorizationProvider {
  constructor({ authorizationGate, getCurrentUser, nativeCoreClient = null, authMode = "shadow", logger = {} } = {}) {
    if (!(authorizationGate instanceof AuthorizationGate)) throw new TypeError("authorizationGate must be an AuthorizationGate");
    if (typeof getCurrentUser !== "function") throw new TypeError("getCurrentUser must be a function");
    if (!["shadow", "required"].includes(authMode)) throw new TypeError("authMode must be shadow or required");
    this.authorizationGate = authorizationGate;
    this.getCurrentUser = getCurrentUser;
    this.nativeCoreClient = nativeCoreClient;
    this.authMode = authMode;
    this.logger = logger;
    this.nativeDeviceIdentity = null;
    this.activeRequiredTasks = new Map();
  }

  async #currentUser() {
    const user = await this.getCurrentUser();
    if (!user?.id || !Number.isFinite(Number(user.id))) throw new Error("A signed-in user is required for task authorization");
    if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) {
      throw new Error("The authenticated user session has expired");
    }
    return user;
  }

  async authorizeTask({
    clientTaskId, pluginId, taskType, inputs = [], selectedFields = [], filterState = {},
    maxCount = null, requestedItems = null, pendingChargeCount = 0, accountSource = "default",
    pacePolicyId = "default", executionOptions = {},
  } = {}) {
    const user = await this.#currentUser();
    const normalizedInputs = normalizeTaskInputs(inputs);
    const pending = Number.isInteger(pendingChargeCount) && pendingChargeCount > 0 ? pendingChargeCount : 0;
    const effectiveRequestedItems = Number.isInteger(requestedItems) && requestedItems > 0
      ? requestedItems
      : normalizedInputs.length - pending;
    if (!Number.isInteger(effectiveRequestedItems) || effectiveRequestedItems <= 0) {
      throw new Error("No uncharged task items remain for authorization");
    }
    const descriptor = buildTaskDescriptor({
      pluginId, taskType, clientTaskId, inputs: normalizedInputs, itemCount: effectiveRequestedItems,
      selectedFields, filterState, maxCount, accountSource, pacePolicyId, executionOptions,
    });
    const jsTaskDigest = computeTaskDigest(descriptor);

    if (this.authMode === "required") {
      if (!this.nativeCoreClient) throw new Error("Native authorization core is unavailable; paid task was not started");
      const nativeResult = await this.nativeCoreClient.request("task.digest", descriptor);
      if (nativeResult?.taskDigest !== jsTaskDigest) throw new Error("Native task digest mismatch; paid task was not started");

      let authorization = null;
      try {
        if (!this.nativeDeviceIdentity) this.nativeDeviceIdentity = await this.nativeCoreClient.request("device.ensure", {});
        const identity = this.nativeDeviceIdentity;
        if (!identity?.deviceKeyId || typeof identity?.signingPublicKey !== "string"
          || typeof identity?.encryptionPublicKeyB64 !== "string"
          || identity?.encryptionAlgorithm !== "HPKE-X25519-HKDF-SHA256-AES-256-GCM") {
          throw new Error("Native device public identity is invalid");
        }
        await this.authorizationGate.registerNativeDeviceIdentity({ user, identity });
        authorization = await this.authorizationGate.acquireTaskAuthorization({
          user, clientTaskId, pluginId, taskType, inputs: normalizedInputs, selectedFields, filterState,
          maxCount, requestedItems: effectiveRequestedItems, nativeTicketRequired: true, deferStart: true,
          nativeDeviceKeyId: identity.deviceKeyId,
        });
        if (!authorization?.authorized || !authorization?.ticket || !authorization?.ticketSignature) {
          throw new Error("Cloud authorization did not return a complete signed Ticket");
        }
        if (authorization.deviceKeyId !== identity.deviceKeyId) {
          throw new Error("Authorization Ticket device binding does not match the current native device identity");
        }
        const ticketHandle = await this.nativeCoreClient.request("ticket.verify", {
          ticket: authorization.ticket,
          signatureHex: authorization.ticketSignature,
          expected: {
            userId: Number(user.id), deviceKeyId: authorization.deviceKeyId, clientTaskId,
            taskDigest: jsTaskDigest, requestedItems: effectiveRequestedItems, clientVersion: "1.4.2",
          },
        });
        if (!ticketHandle?.handle || ticketHandle?.authorization_id !== authorization.authorizationId) {
          throw new Error("Native Ticket verification did not return a bound authorization handle");
        }
        const expected = {
          authorizationId: authorization.authorizationId, ticketJti: authorization.ticketJti,
          deviceKeyId: authorization.deviceKeyId, taskDigest: jsTaskDigest, taskType,
          clientVersion: "1.4.2", coreVersion: "1.4.2", coreProtocolVersion: 1,
          releaseManifestKeyId: process.env.MAGIORIX_RELEASE_MANIFEST_KEY_ID || null,
          ticketKeyId: authorization.ticketKeyId,
          policyKeyId: process.env.MAGIORIX_POLICY_SIGNING_KEY_ID || "magiorix-policy-2026-v1",
          policyVersion: authorization.policyVersion,
        };
        const bundle = await this.authorizationGate.requestStrategyBundle(expected);
        const strategy = await this.nativeCoreClient.request("strategy.decrypt", { bundle, expected });
        if (strategy?.authorizationId !== authorization.authorizationId
          || strategy?.taskDigest !== jsTaskDigest || strategy?.taskType !== taskType
          || !Number.isInteger(strategy?.maxItems) || strategy.maxItems < effectiveRequestedItems) {
          throw new Error("Native strategy decision binding or budget is invalid");
        }
        await this.nativeCoreClient.request("receipt.begin", { authorizationHandle: ticketHandle });
        await this.authorizationGate.startTaskAuthorization(authorization.authorizationId);
        const context = {
          authorizationId: authorization.authorizationId, nativeAuthorizationHandle: ticketHandle.handle,
          userId: Number(user.id), maxItems: strategy.maxItems, processed: 0, finalized: false,
        };
        this.activeRequiredTasks.set(clientTaskId, context);
        return { ...authorization, taskDescriptor: descriptor, taskDigest: jsTaskDigest, ...context, strategy };
      } catch (error) {
        if (authorization?.authorizationId) {
          await this.authorizationGate.cancelTask({ clientTaskId, reason: "native-required-authorization-or-strategy-rejected" }).catch(() => {});
        }
        throw new Error(`Native required authorization rejected; paid task was not started: ${error.message}`);
      }
    }

    const result = await this.authorizationGate.acquireTaskAuthorization({
      user, clientTaskId, pluginId, taskType, inputs: normalizedInputs, selectedFields, filterState,
      maxCount, requestedItems: effectiveRequestedItems,
    });
    if (!result?.authorized) throw new Error("Task authorization was rejected");
    if (this.nativeCoreClient) {
      try {
        const nativeResult = await this.nativeCoreClient.request("task.digest", descriptor);
        if (nativeResult?.taskDigest !== jsTaskDigest) this.logger.warn?.("[task-auth] native digest differs in shadow mode");
      } catch (error) {
        this.logger.warn?.("[task-auth] native shadow validation unavailable", { code: error?.code || "native-core-unavailable" });
      }
    }
    return { ...result, taskDescriptor: descriptor, taskDigest: jsTaskDigest };
  }

  async recordItemOutcome({ clientTaskId, success = false, failed = false, taskState = "running" } = {}) {
    const context = this.activeRequiredTasks.get(clientTaskId);
    if (!context) return null;
    if (context.finalized) throw new Error("Task receipt is already finalized");
    const successDelta = success ? 1 : 0;
    const failedDelta = failed ? 1 : 0;
    if (successDelta + failedDelta !== 1) throw new Error("Exactly one terminal item outcome is required");
    if (context.processed >= context.maxItems) throw new Error("Native task budget is exhausted");
    const receipt = await this.nativeCoreClient.request("receipt.append", {
      handleId: context.nativeAuthorizationHandle, successDelta, failedDelta, taskState,
    });
    context.processed = Number(receipt?.processedCount);
    return receipt;
  }

  async completeTask({ clientTaskId }) {
    const context = this.activeRequiredTasks.get(clientTaskId);
    if (!context) return this.authorizationGate.completeTask({ clientTaskId });
    const finalReceipt = await this.nativeCoreClient.request("receipt.finalize", {
      handleId: context.nativeAuthorizationHandle, taskState: "completed",
    });
    context.finalized = true;
    try {
      return await this.authorizationGate.completeTask({ clientTaskId, nativeReceipt: finalReceipt });
    } finally {
      this.activeRequiredTasks.delete(clientTaskId);
    }
  }

  async cancelTask({ clientTaskId, reason = "user-cancel" } = {}) {
    const context = this.activeRequiredTasks.get(clientTaskId);
    if (!context) return this.authorizationGate.cancelTask({ clientTaskId, reason });
    const finalReceipt = await this.nativeCoreClient.request("receipt.finalize", {
      handleId: context.nativeAuthorizationHandle, taskState: "cancelled",
    });
    context.finalized = true;
    try {
      return await this.authorizationGate.cancelTask({ clientTaskId, nativeReceipt: finalReceipt, reason });
    } finally {
      this.activeRequiredTasks.delete(clientTaskId);
    }
  }

  async flushPendingReceipts() {
    return this.authorizationGate.flushPendingReceipts();
  }
}
