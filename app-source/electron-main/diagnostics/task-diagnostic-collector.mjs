import { redactText } from "./diagnostic-redactor.mjs";

const TASK_ALLOWED_FIELDS = new Set([
  "taskId",
  "pluginId",
  "taskType",
  "inputType",
  "status",
  "createdAt",
  "startedAt",
  "updatedAt",
  "finishedAt",
  "durationMs",
  "total",
  "successCount",
  "failedCount",
  "pendingChargeCount",
  "errorCode",
  "errorCategory",
  "errorMessage",
  "retryCount",
  "lastStep",
]);

export function sanitizeTaskSummary(task) {
  if (!task || typeof task !== "object") return null;
  const summary = {};
  for (const [key, value] of Object.entries(task)) {
    if (!TASK_ALLOWED_FIELDS.has(key)) continue;
    if (key === "errorMessage" && typeof value === "string") {
      summary[key] = redactText(value);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      summary[key] = value;
    }
  }
  return summary;
}

export async function collectTaskDiagnostics(options = {}) {
  const historyStore = options.historyStore;
  const traceStore = options.traceStore;
  const relatedTaskId = options.relatedTaskId || null;
  const limit = Number(options.limit) || 5; // Default strictly 5 tasks

  let recentTasks = [];
  if (historyStore && typeof historyStore.listTasks === "function") {
    try {
      const allTasks = await historyStore.listTasks();
      if (Array.isArray(allTasks)) {
        recentTasks = allTasks
          .slice(0, limit)
          .map((t) => sanitizeTaskSummary(t))
          .filter(Boolean);
      }
    } catch {}
  }

  // If relatedTaskId specified and not in the top 5, fetch and prepend
  if (relatedTaskId && historyStore && typeof historyStore.getTask === "function") {
    if (!recentTasks.some((t) => t.taskId === relatedTaskId)) {
      try {
        const specificTask = await historyStore.getTask(relatedTaskId);
        if (specificTask) {
          recentTasks.unshift(sanitizeTaskSummary(specificTask));
        }
      } catch {}
    }
  }

  // Collect trace events for related task (or first failed task if not specified)
  let taskTrace = [];
  let targetTaskId = relatedTaskId;
  if (!targetTaskId && recentTasks.length > 0) {
    const failedTask = recentTasks.find((t) => t.status === "failed" || t.failedCount > 0);
    if (failedTask) targetTaskId = failedTask.taskId;
  }

  if (targetTaskId && traceStore && typeof traceStore.getTaskTrace === "function") {
    try {
      taskTrace = await traceStore.getTaskTrace(targetTaskId);
    } catch {}
  }

  return {
    recentTasks,
    targetTaskId,
    taskTrace,
    collectedAt: new Date().toISOString(),
  };
}
