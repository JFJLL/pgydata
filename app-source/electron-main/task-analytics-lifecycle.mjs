function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function fieldsOf(task, final = {}) {
  return {
    module: task.pluginId || "collection",
    pluginId: task.pluginId || null,
    taskType: task.taskType || null,
    taskId: task.taskId,
    inputType: task.inputType || null,
    itemCount: number(final.total ?? task.total),
    successCount: number(final.successCount),
    errorCount: number(final.failedCount),
  };
}

/**
 * Converts persisted CollectionHistoryStore task lifecycle states into exactly
 * one start and at most one terminal event. It deliberately has no side effects
 * on task state: telemetry receives a snapshot after business persistence.
 */
export function createTaskAnalyticsLifecycleReporter(report) {
  const started = new Set();
  const terminal = new Set();
  const emit = (eventName, fields) => {
    try { report(eventName, fields); } catch {}
  };
  return {
    start(task) {
      if (!task?.taskId || task.resume === true || started.has(task.taskId)) return false;
      started.add(task.taskId);
      emit("task_start", fieldsOf(task));
      return true;
    },
    terminal(task, final) {
      const taskId = task?.taskId;
      if (!taskId || terminal.has(taskId) || !final?.status) return false;
      const fields = fieldsOf(task, final);
      if (final.status === "completed") emit("task_complete", fields);
      else if (final.status === "cancelled") emit("task_cancelled", fields);
      // `interrupted` is a persisted cannot-continue condition (for example a failed charge confirmation).
      // It is explicitly mapped to task_failed; auth_expired and paused remain non-terminal analytics states.
      else if (final.status === "failed" || final.status === "interrupted") emit("task_failed", { ...fields, errorCode: final.status === "interrupted" ? "INTERRUPTED" : "TASK_FAILED" });
      else return false;
      terminal.add(taskId);
      return true;
    },
  };
}
