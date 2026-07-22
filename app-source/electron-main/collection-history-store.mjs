import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const SCHEMA_VERSION = 1;
const TERMINAL_STATUSES = new Set(["completed", "interrupted", "auth_expired", "cancelled"]);
const ALL_STATUSES = new Set(["running", ...TERMINAL_STATUSES]);
const EXCEL_ILLEGAL_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function iso(now) {
  return new Date(now).toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function assertSafeTaskId(taskId) {
  if (
    typeof taskId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(taskId) ||
    WINDOWS_RESERVED_NAMES.test(taskId)
  ) {
    throw new Error("非法任务 ID");
  }
  return taskId;
}

export function sanitizeExcelValue(value) {
  if (typeof value === "string") return value.replace(EXCEL_ILLEGAL_CONTROL_CHARS, "");
  if (Array.isArray(value)) return value.map(sanitizeExcelValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      String(key).replace(EXCEL_ILLEGAL_CONTROL_CHARS, ""),
      sanitizeExcelValue(item),
    ]));
  }
  return value;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function normalizeIndex(index) {
  const value = Number(index);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("非法原始条目索引");
  return value;
}

function summarizeEvents(events) {
  const latest = new Map();
  for (const event of events) {
    if (!event || !Number.isSafeInteger(event.itemIndex) || event.itemIndex < 0) continue;
    const current = latest.get(event.itemIndex);
    if (current?.state === "success") continue;
    latest.set(event.itemIndex, event);
  }
  let successCount = 0;
  let failedCount = 0;
  let pendingChargeCount = 0;
  for (const event of latest.values()) {
    if (event.state === "success") successCount += 1;
    else if (event.state === "failed") failedCount += 1;
    else if (event.state === "pending_charge") pendingChargeCount += 1;
  }
  return { latest, successCount, failedCount, pendingChargeCount };
}

export class CollectionHistoryStore {
  constructor({ baseDir, retentionDays = 90, now = () => Date.now() }) {
    if (!baseDir) throw new Error("collection-history 存储路径不能为空");
    this.baseDir = path.resolve(baseDir);
    this.retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    this.now = now;
    this.locks = new Map();
    this.eventCache = new Map();
  }

  taskDir(taskId) {
    const safeId = assertSafeTaskId(taskId);
    const resolved = path.resolve(this.baseDir, safeId);
    if (path.dirname(resolved) !== this.baseDir) throw new Error("任务路径越界");
    return resolved;
  }

  paths(taskId) {
    const dir = this.taskDir(taskId);
    return {
      dir,
      input: path.join(dir, "input.json"),
      metadata: path.join(dir, "metadata.json"),
      results: path.join(dir, "results.jsonl"),
    };
  }

  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const cutoff = this.now() - this.retentionMs;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let taskId;
      try {
        taskId = assertSafeTaskId(entry.name);
      } catch {
        continue;
      }
      const taskPaths = this.paths(taskId);
      let metadata = await readJson(taskPaths.metadata, null).catch(() => null);
      if (!metadata) {
        const input = await readJson(taskPaths.input, null).catch(() => null);
        const stat = await fs.stat(taskPaths.dir).catch(() => null);
        if (!input) {
          if (stat && stat.mtimeMs < cutoff) await fs.rm(taskPaths.dir, { recursive: true, force: true });
          continue;
        }
        const events = await this.loadEvents(taskId);
        const summary = summarizeEvents(events);
        const recoveredAt = iso(this.now());
        metadata = {
          schemaVersion: SCHEMA_VERSION,
          taskId,
          status: "interrupted",
          total: Array.isArray(input.urls) ? input.urls.length : 0,
          successCount: summary.successCount,
          failedCount: summary.failedCount,
          pendingChargeCount: summary.pendingChargeCount,
          createdAt: stat ? iso(stat.birthtimeMs || stat.mtimeMs) : recoveredAt,
          startedAt: stat ? iso(stat.birthtimeMs || stat.mtimeMs) : recoveredAt,
          updatedAt: events.at(-1)?.createdAt || (stat ? iso(stat.mtimeMs) : recoveredAt),
          finishedAt: recoveredAt,
          migratedFromLocalStorage: false,
          recoveredMetadata: true,
        };
        await atomicWriteJson(taskPaths.metadata, metadata);
      }
      const events = await this.loadEvents(taskId);
      const summary = summarizeEvents(events);
      let metadataChanged = false;
      const metadataUpdatedAt = Date.parse(metadata.updatedAt || metadata.createdAt || "");
      const latestEventAt = events.reduce((latest, event) => {
        const eventTime = Date.parse(event?.createdAt || "");
        return Number.isFinite(eventTime) ? Math.max(latest, eventTime) : latest;
      }, Number.NEGATIVE_INFINITY);
      if (Number.isFinite(latestEventAt) && (!Number.isFinite(metadataUpdatedAt) || latestEventAt > metadataUpdatedAt)) {
        metadata.updatedAt = iso(latestEventAt);
        metadataChanged = true;
      }
      const effectiveUpdatedAt = Math.max(
        Number.isFinite(metadataUpdatedAt) ? metadataUpdatedAt : Number.NEGATIVE_INFINITY,
        latestEventAt,
      );
      if (Number.isFinite(effectiveUpdatedAt) && effectiveUpdatedAt < cutoff) {
        await fs.rm(taskPaths.dir, { recursive: true, force: true });
        this.eventCache.delete(taskId);
        continue;
      }
      for (const [key, value] of Object.entries({
        successCount: summary.successCount,
        failedCount: summary.failedCount,
        pendingChargeCount: summary.pendingChargeCount,
      })) {
        if (Number(metadata[key] || 0) !== value) {
          metadata[key] = value;
          metadataChanged = true;
        }
      }
      if (metadata.status === "running") {
        metadata.status = "interrupted";
        metadata.updatedAt = iso(this.now());
        metadata.finishedAt = metadata.updatedAt;
        metadataChanged = true;
      }
      if (metadataChanged) await atomicWriteJson(taskPaths.metadata, metadata);
    }
    return this.listTasks();
  }

  async withLock(taskId, operation) {
    assertSafeTaskId(taskId);
    const previous = this.locks.get(taskId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.locks.set(taskId, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(taskId) === current) this.locks.delete(taskId);
    }
  }

  async createTask(payload) {
    const taskId = assertSafeTaskId(payload?.taskId);
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      await fs.mkdir(taskPaths.dir, { recursive: true });
      const existing = await readJson(taskPaths.metadata, null);
      if (existing) return this.getTask(taskId);
      const urls = Array.isArray(payload.urls) ? payload.urls.map((url) => String(url ?? "")) : [];
      const createdAt = iso(this.now());
      const input = {
        schemaVersion: SCHEMA_VERSION,
        taskId,
        pluginId: String(payload.pluginId || ""),
        taskType: String(payload.taskType || ""),
        fileName: String(payload.fileName || ""),
        inputType: String(payload.inputType || ""),
        fields: Array.isArray(payload.fields) ? clone(payload.fields) : [],
        urls,
        totalRows: Number.isSafeInteger(payload.totalRows) ? payload.totalRows : urls.length,
        paceMode: String(payload.paceMode || ""),
      };
      const metadata = {
        schemaVersion: SCHEMA_VERSION,
        taskId,
        status: "running",
        total: urls.length,
        successCount: 0,
        failedCount: 0,
        pendingChargeCount: 0,
        createdAt,
        startedAt: createdAt,
        updatedAt: createdAt,
        finishedAt: null,
        migratedFromLocalStorage: false,
      };
      await atomicWriteJson(taskPaths.input, input);
      await fs.writeFile(taskPaths.results, "", { encoding: "utf8", flag: "wx" }).catch((error) => {
        if (error?.code !== "EEXIST") throw error;
      });
      await atomicWriteJson(taskPaths.metadata, metadata);
      this.eventCache.set(taskId, []);
      return { ...metadata, ...input };
    });
  }

  async loadEvents(taskId) {
    if (this.eventCache.has(taskId)) return this.eventCache.get(taskId);
    const { results } = this.paths(taskId);
    let text = "";
    try {
      text = await fs.readFile(results, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (text && !/[\r\n]$/.test(text)) {
      await fs.appendFile(results, "\n", "utf8");
    }
    const events = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event && typeof event === "object") events.push(event);
      } catch {
        // A crash may leave only the final JSONL line incomplete. Earlier records remain valid.
      }
    }
    this.eventCache.set(taskId, events);
    return events;
  }

  async appendState(taskId, state, itemIndex, values = {}) {
    const index = normalizeIndex(itemIndex);
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      const events = await this.loadEvents(taskId);
      const before = summarizeEvents(events);
      const existing = before.latest.get(index);
      if (existing?.state === "success") return clone(existing);
      if (state === "pending_charge" && existing?.state === "pending_charge") return clone(existing);
      const event = sanitizeExcelValue({
        schemaVersion: SCHEMA_VERSION,
        eventId: `${taskId}-${index}-${this.now()}-${Math.random().toString(16).slice(2)}`,
        taskId,
        itemIndex: index,
        state,
        createdAt: iso(this.now()),
        ...clone(values),
      });
      await fs.appendFile(taskPaths.results, `${JSON.stringify(event)}\n`, "utf8");
      events.push(event);
      const summary = summarizeEvents(events);
      metadata.successCount = summary.successCount;
      metadata.failedCount = summary.failedCount;
      metadata.pendingChargeCount = summary.pendingChargeCount;
      metadata.updatedAt = event.createdAt;
      await atomicWriteJson(taskPaths.metadata, metadata);
      return clone(event);
    });
  }

  recordPendingCharge(taskId, itemIndex, row, sourceUrl = "") {
    return this.appendState(taskId, "pending_charge", itemIndex, { row, sourceUrl });
  }

  recordSuccess(taskId, itemIndex, row, balanceAfter = null, sourceUrl = "") {
    return this.appendState(taskId, "success", itemIndex, { row, balanceAfter, sourceUrl });
  }

  recordFailure(taskId, itemIndex, error = {}) {
    return this.appendState(taskId, "failed", itemIndex, {
      errorCode: String(error.errorCode || "UNKNOWN_ERROR"),
      errorMessage: String(error.errorMessage || ""),
      errorCategory: String(error.errorCategory || "unknown"),
    });
  }

  async setStatus(taskId, status) {
    if (!ALL_STATUSES.has(status)) throw new Error("非法任务状态");
    return this.withLock(taskId, async () => {
      const { metadata } = this.paths(taskId);
      const value = await readJson(metadata, null);
      if (!value) throw new Error("任务不存在");
      value.status = status;
      value.updatedAt = iso(this.now());
      value.finishedAt = status === "running" ? null : value.updatedAt;
      await atomicWriteJson(metadata, value);
      return clone(value);
    });
  }

  async getTask(taskId) {
    const taskPaths = this.paths(taskId);
    const [metadata, input] = await Promise.all([
      readJson(taskPaths.metadata, null),
      readJson(taskPaths.input, null),
    ]);
    if (!metadata || !input) return null;
    return { ...metadata, ...input };
  }

  async listTasks() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const task = await this.getTask(entry.name);
        if (task) tasks.push({
          schemaVersion: task.schemaVersion,
          taskId: task.taskId,
          pluginId: task.pluginId,
          taskType: task.taskType,
          fileName: task.fileName,
          inputType: task.inputType,
          status: task.status,
          total: task.total,
          totalRows: task.totalRows,
          successCount: task.successCount,
          failedCount: task.failedCount,
          pendingChargeCount: task.pendingChargeCount,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          updatedAt: task.updatedAt,
          finishedAt: task.finishedAt,
          migratedFromLocalStorage: task.migratedFromLocalStorage,
          legacySummary: clone(task.legacySummary),
        });
      } catch {
        // Ignore unrelated or partially created directories.
      }
    }
    return tasks.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async getExportRows(taskId) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error("任务不存在");
    const events = await this.loadEvents(taskId);
    const { latest } = summarizeEvents(events);
    return [...latest.values()]
      .filter((event) => event.state === "success" && event.row && typeof event.row === "object")
      .sort((left, right) => left.itemIndex - right.itemIndex)
      .map((event) => sanitizeExcelValue(clone(event.row)));
  }

  async getResumePlan(taskId) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error("任务不存在");
    if (!["interrupted", "auth_expired"].includes(task.status)) throw new Error("当前任务不可继续");
    const events = await this.loadEvents(taskId);
    const { latest } = summarizeEvents(events);
    const pendingCharges = [];
    const sourceIndexes = [];
    for (let itemIndex = 0; itemIndex < task.urls.length; itemIndex += 1) {
      const event = latest.get(itemIndex);
      if (event?.state === "success") continue;
      sourceIndexes.push(itemIndex);
      if (event?.state === "pending_charge") pendingCharges.push(clone(event));
    }
    return {
      taskId,
      payload: {
        taskId,
        pluginId: task.pluginId,
        taskType: task.taskType,
        fileName: task.fileName,
        inputType: task.inputType,
        fields: clone(task.fields),
        urls: sourceIndexes.map((index) => task.urls[index]),
        sourceIndexes,
        totalRows: task.totalRows,
        paceMode: task.paceMode,
        resume: true,
      },
      pendingCharges,
    };
  }

  async importLegacyHistory(history) {
    const markerPath = path.join(this.baseDir, ".legacy-v2-migrated.json");
    const existingMarker = await readJson(markerPath, null);
    if (existingMarker) return { imported: 0, alreadyMigrated: true };
    let imported = 0;
    const records = Array.isArray(history) ? history : [];
    if (records.length === 0) return { imported: 0, alreadyMigrated: false, deferred: true };
    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      const record = records[recordIndex] || {};
      const rawId = String(record.id || `legacy-${recordIndex}`);
      const legacyHash = createHash("sha256").update(`${recordIndex}:${rawId}`).digest("hex").slice(0, 20);
      const taskId = `legacy-v2-${legacyHash}`;
      const rows = Array.isArray(record.rows) ? record.rows : [];
      const task = await this.createTask({
        taskId,
        pluginId: record.pluginId,
        taskType: record.taskType,
        fileName: record.fileName || `${taskId}.xlsx`,
        inputType: "legacy-localStorage",
        urls: rows.map(() => ""),
      });
      if (!task.migratedFromLocalStorage) {
        for (let itemIndex = 0; itemIndex < rows.length; itemIndex += 1) {
          await this.recordSuccess(taskId, itemIndex, rows[itemIndex], null, "");
        }
        const taskPaths = this.paths(taskId);
        const metadata = await readJson(taskPaths.metadata, null);
        metadata.migratedFromLocalStorage = true;
        metadata.legacySummary = {
          originalTaskId: rawId,
          total: Number(record.total || rows.length),
          success: Number(record.success || rows.length),
          failed: Number(record.failed || 0),
          exportTruncated: Boolean(record.exportTruncated),
        };
        metadata.status = "completed";
        metadata.updatedAt = iso(this.now());
        metadata.finishedAt = metadata.updatedAt;
        await atomicWriteJson(taskPaths.metadata, metadata);
        imported += 1;
      }
    }
    await atomicWriteJson(markerPath, { schemaVersion: 1, imported, migratedAt: iso(this.now()) });
    return { imported, alreadyMigrated: false };
  }
}
