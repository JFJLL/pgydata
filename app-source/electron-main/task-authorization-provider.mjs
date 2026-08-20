import { AuthorizationGate } from "./authorization-gate.mjs";

/**
 * Main-process-only adapter used by collectors and schedulers. It deliberately
 * accepts local task material, derives the digest inside AuthorizationGate, and
 * passes only the digest and quantity to the cloud authorization API.
 */
export class TaskAuthorizationProvider {
  constructor({ authorizationGate, getCurrentUser, logger = {} } = {}) {
    if (!(authorizationGate instanceof AuthorizationGate)) {
      throw new TypeError("authorizationGate must be an AuthorizationGate");
    }
    if (typeof getCurrentUser !== "function") {
      throw new TypeError("getCurrentUser must be a function");
    }
    this.authorizationGate = authorizationGate;
    this.getCurrentUser = getCurrentUser;
    this.logger = logger;
  }

  async authorizeTask({
    clientTaskId,
    pluginId,
    taskType,
    inputs = [],
    selectedFields = [],
    filterState = {},
    maxCount = null,
    requestedItems = null,
  } = {}) {
    const user = await this.getCurrentUser();
    if (!user?.id) throw new Error("A signed-in user is required for task authorization");
    const result = await this.authorizationGate.acquireTaskAuthorization({
      user,
      clientTaskId,
      pluginId,
      taskType,
      inputs,
      selectedFields,
      filterState,
      maxCount,
      requestedItems,
    });
    if (!result?.authorized) throw new Error("Task authorization was rejected");
    return result;
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
