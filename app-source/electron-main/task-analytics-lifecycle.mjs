const EVENT_ID_LIMIT = 128;

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

function lifecycleEventId(prefix, taskId) {
  const normalized = String(taskId || "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
  if (!normalized) return null;
  const value = `${prefix}:${normalized}`;
  return value.length <= EVENT_ID_LIMIT ? value : null;
}

export function createTaskAnalyticsLifecycleReporter(report, onDiagnosticTrace = null) {
  const started = new Set();
  const terminal = new Set();
  const emit = (eventName, fields, eventId) => {
    try { report(eventName, fields, eventId ? { eventId } : undefined); } catch {}
    if (onDiagnosticTrace) {
      try { onDiagnosticTrace({ eventName, fields, eventId }); } catch {}
    }
  };
  return {
    start(task) {
      const taskId = task?.taskId;
      if (!taskId || started.has(taskId)) return false;
      const eventId = lifecycleEventId("task-start", taskId);
      if (!eventId) return false;
      started.add(taskId);
      emit("task_start", fieldsOf(task), eventId);
      return true;
    },
    terminal(task, final) {
      const taskId = task?.taskId;
      if (!taskId || terminal.has(taskId) || !final?.status) return false;
      const fields = fieldsOf(task, final);
      const eventId = lifecycleEventId("task-terminal", taskId);
      if (!eventId) return false;
      if (final.status === "completed") emit("task_complete", fields, eventId);
      else if (final.status === "cancelled") emit("task_cancelled", fields, eventId);
      else if (final.status === "failed") emit("task_failed", { ...fields, errorCode: "TASK_FAILED" }, eventId);
      else return false;
      terminal.add(taskId);
      return true;
    },
  };
}
