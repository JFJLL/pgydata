import { AuthorizationGate } from "./authorization-gate.mjs";
import { buildTaskDescriptor, computeTaskDigest } from "./task-descriptor.mjs";

/**
 * Main-process-only task authorization adapter. Required mode never verifies a
 * Ticket or permits a paid task with JavaScript-only state.
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
  }

  async authorizeTask({ clientTaskId, pluginId, taskType, inputs = [], selectedFields = [], filterState = {}, maxCount = null, requestedItems = null } = {}) {
    const user = await this.getCurrentUser();
    if (!user?.id) throw new Error("A signed-in user is required for task authorization");
    const descriptor = buildTaskDescriptor({
      pluginId, taskType, clientTaskId, inputs,
      itemCount: Number.isInteger(requestedItems) && requestedItems > 0 ? requestedItems : inputs.length,
      selectedFields, filterState, maxCount,
    });
    const jsTaskDigest = computeTaskDigest(descriptor);

    if (this.authMode === "required") {
      if (!this.nativeCoreClient) throw new Error("Native authorization core is unavailable; paid task was not started");
      const nativeResult = await this.nativeCoreClient.request("task.digest", descriptor);
      if (nativeResult?.taskDigest !== jsTaskDigest) throw new Error("Native task digest mismatch; paid task was not started");

      let authorization = null;
      try {
        if (!this.nativeDeviceIdentity) {
          this.nativeDeviceIdentity = await this.nativeCoreClient.request("device.ensure", {});
        }
        const identity = this.nativeDeviceIdentity;
        if (identity?.encryptionAlgorithm !== "HPKE-X25519-HKDF-SHA256-AES-256-GCM"
          || typeof identity?.encryptionPublicKeyB64 !== "string"
          || typeof identity?.protectedPrivateKeyB64 !== "string") {
          throw new Error("Native device encryption identity is invalid");
        }
        const registeredDeviceKeyId = await this.authorizationGate.registerDeviceEncryptionKey({
          user,
          encryptionPublicKey: identity.encryptionPublicKeyB64,
        });
        authorization = await this.authorizationGate.acquireTaskAuthorization({
          user, clientTaskId, pluginId, taskType, inputs, selectedFields, filterState, maxCount, requestedItems,
          nativeTicketRequired: true,
          deferStart: true,
        });
        if (!authorization?.authorized || !authorization?.ticket || !authorization?.ticketSignature) {
          throw new Error("Cloud authorization did not return a complete signed Ticket");
        }
        if (authorization.deviceKeyId !== registeredDeviceKeyId) {
          throw new Error("Authorization Ticket device binding does not match registered HPKE device identity");
        }
        const ticketHandle = await this.nativeCoreClient.request("ticket.verify", {
          ticket: authorization.ticket,
          signatureHex: authorization.ticketSignature,
          expected: {
            userId: Number(user.id),
            deviceKeyId: authorization.deviceKeyId,
            clientTaskId,
            taskDigest: jsTaskDigest,
            requestedItems: Number.isInteger(requestedItems) && requestedItems > 0 ? requestedItems : inputs.length,
            clientVersion: "1.4.2",
          },
        });
        if (!ticketHandle?.handle || ticketHandle?.authorization_id !== authorization.authorizationId) {
          throw new Error("Native Ticket verification did not return a bound authorization handle");
        }
        const expected = {
          authorizationId: authorization.authorizationId,
          ticketJti: authorization.ticketJti,
          deviceKeyId: authorization.deviceKeyId,
          taskDigest: jsTaskDigest,
          taskType,
          clientVersion: "1.4.2",
          coreVersion: "1.4.2",
          coreProtocolVersion: 1,
          releaseManifestKeyId: process.env.MAGIORIX_RELEASE_MANIFEST_KEY_ID || null,
          ticketKeyId: authorization.ticketKeyId,
          policyKeyId: process.env.MAGIORIX_POLICY_SIGNING_KEY_ID || "magiorix-policy-2026-v1",
          policyVersion: authorization.policyVersion,
        };
        const bundle = await this.authorizationGate.requestStrategyBundle(expected);
        const strategy = await this.nativeCoreClient.request("strategy.decrypt", {
          bundle,
          expected,
          protectedPrivateKeyB64: identity.protectedPrivateKeyB64,
        });
        if (strategy?.authorizationId !== authorization.authorizationId
          || strategy?.taskDigest !== jsTaskDigest
          || strategy?.taskType !== taskType
          || !Number.isInteger(strategy?.maxItems)
          || strategy.maxItems <= 0) {
          throw new Error("Native strategy decision binding is invalid");
        }
        await this.authorizationGate.startTaskAuthorization(authorization.authorizationId);
        return {
          ...authorization,
          taskDescriptor: descriptor,
          taskDigest: jsTaskDigest,
          nativeAuthorizationHandle: ticketHandle.handle,
          strategy,
        };
      } catch (error) {
        if (authorization?.authorizationId) {
          await this.authorizationGate.cancelTask({
            clientTaskId,
            reason: "native-required-authorization-or-strategy-rejected",
          }).catch(() => {});
        }
        throw new Error(`Native required authorization rejected; paid task was not started: ${error.message}`);
      }
    }

    const result = await this.authorizationGate.acquireTaskAuthorization({
      user, clientTaskId, pluginId, taskType, inputs, selectedFields, filterState, maxCount, requestedItems,
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

  async completeTask({ clientTaskId, successCount, failedCount, totalCount }) {
    return this.authorizationGate.completeTask({ clientTaskId, successCount, failedCount, totalCount });
  }

  async cancelTask({ clientTaskId, successCount = 0, failedCount = 0, reason = "user-cancel" }) {
    return this.authorizationGate.cancelTask({ clientTaskId, successCount, failedCount, reason });
  }

  async flushPendingReceipts() {
    return this.authorizationGate.flushPendingReceipts();
  }
}
