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
      // Ticket verification and handle issuance is intentionally required before
      // acquiring a runnable authorization. Until the signed Ticket keyring and
      // persistent native device state are bundled, this candidate fails closed.
      throw new Error("Native Ticket verification handle is not available in this candidate; paid task was not started");
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
