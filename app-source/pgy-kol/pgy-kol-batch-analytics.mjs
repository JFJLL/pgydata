function nonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolves a persisted pgy-kol batch task into one terminal analytics event.
 * Fast-list tasks use counts.unique; detail tasks use their separate detailCounts schema.
 */
export async function settlePgyKolBatchAnalytics({ taskId, settle, getTask, reportTerminal }) {
  await settle(taskId);
  const finished = await getTask(taskId);
  if (!finished) return null;
  const detailMode = Boolean(finished.detailTaskId && finished.detailStatus);
  const counts = detailMode ? (finished.detailCounts || {}) : (finished.counts || {});
  const fields = detailMode
    ? { itemCount: nonNegative(counts.total), successCount: nonNegative(counts.successCount), errorCount: nonNegative(counts.failedCount) }
    : { itemCount: nonNegative(counts.unique), successCount: nonNegative(counts.unique), errorCount: null };
  if (finished.status === "completed") reportTerminal("task_complete", taskId, fields);
  else if (finished.status === "cancelled") reportTerminal("task_cancelled", taskId, fields);
  else if (finished.status === "failed") reportTerminal("task_failed", taskId, { errorCode: "SEARCH_BATCH_FAILED" });
  // incomplete, paused, interrupted, auth-expired and risk-control intentionally produce no terminal event.
  return finished;
}
