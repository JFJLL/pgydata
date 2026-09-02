import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { redactObject, redactText } from "./diagnostic-redactor.mjs";

const SCHEMA_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 14;
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_TASK_TRACE_LINES = 500;

export class DiagnosticTraceStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), "userData", "diagnostics");
    this.retentionDays = Number(options.retentionDays) || DEFAULT_RETENTION_DAYS;
    this.maxTotalSizeBytes = Number(options.maxTotalSizeBytes) || MAX_TOTAL_SIZE_BYTES;
    this.installId = options.installId || null;
    this.sessionId = options.sessionId || `ses_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    this.writeQueue = [];
    this.isFlushing = false;
    this.flushPromise = null;
    this.taskTraceCounts = new Map();
  }

  async init() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(path.join(this.baseDir, "traces"), { recursive: true });
      await fs.mkdir(path.join(this.baseDir, "task-traces"), { recursive: true });
      await fs.mkdir(path.join(this.baseDir, "errors"), { recursive: true });

      // Initialize or load installId
      if (!this.installId) {
        const installFile = path.join(this.baseDir, "install.json");
        try {
          const raw = await fs.readFile(installFile, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.installId === "string") {
            this.installId = parsed.installId;
          }
        } catch {}

        if (!this.installId) {
          this.installId = `inst_${crypto.randomUUID()}`;
          try {
            await fs.writeFile(installFile, JSON.stringify({
              installId: this.installId,
              createdAt: new Date().toISOString(),
            }, null, 2), "utf8");
          } catch {}
        }
      }

      // Run asynchronous cleanup in background
      void this.cleanOldTraces().catch(() => {});
    } catch (err) {
      // Non-blocking initialization
    }
  }

  record(event = {}) {
    try {
      const time = event.time || new Date().toISOString();
      const level = ["info", "warn", "error"].includes(event.level) ? event.level : "info";
      const taskId = event.taskId ? String(event.taskId).trim().slice(0, 128) : null;

      // Limit per-task trace volume
      if (taskId) {
        const currentCount = this.taskTraceCounts.get(taskId) || 0;
        if (currentCount >= MAX_TASK_TRACE_LINES && level === "info") {
          return;
        }
        this.taskTraceCounts.set(taskId, currentCount + 1);
      }

      const item = redactObject({
        schemaVersion: SCHEMA_VERSION,
        time,
        level,
        module: event.module ? String(event.module).slice(0, 64) : "core",
        event: event.event ? String(event.event).slice(0, 64) : "unknown",
        installId: this.installId,
        sessionId: this.sessionId,
        taskId,
        requestId: event.requestId ? String(event.requestId).slice(0, 128) : null,
        step: event.step ? String(event.step).slice(0, 64) : null,
        attempt: typeof event.attempt === "number" ? event.attempt : null,
        durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
        httpMethod: event.httpMethod ? String(event.httpMethod).toUpperCase().slice(0, 10) : null,
        endpoint: event.endpoint ? redactText(String(event.endpoint).slice(0, 256)) : null,
        httpStatus: typeof event.httpStatus === "number" ? event.httpStatus : null,
        errorCode: event.errorCode ? String(event.errorCode).slice(0, 64) : null,
        errorCategory: event.errorCategory ? String(event.errorCategory).slice(0, 64) : null,
        message: event.message ? redactText(String(event.message).slice(0, 1000)) : null,
      });

      this.writeQueue.push(item);
      void this.scheduleFlush();
    } catch {}
  }

  async scheduleFlush() {
    if (this.flushPromise) return this.flushPromise;
    if (this.writeQueue.length === 0) return Promise.resolve();
    this.flushPromise = (async () => {
      this.isFlushing = true;
      try {
        while (this.writeQueue.length > 0) {
          const batch = this.writeQueue.splice(0, 100);
          await this.flushBatch(batch);
        }
      } finally {
        this.isFlushing = false;
        this.flushPromise = null;
      }
    })();
    return this.flushPromise;
  }

  async flushBatch(batch) {
    const today = new Date().toISOString().slice(0, 10);
    const mainTraceFile = path.join(this.baseDir, "traces", `${today}.jsonl`);
    const errorTraceFile = path.join(this.baseDir, "errors", `${today}.jsonl`);

    const linesByFile = new Map();

    for (const item of batch) {
      const line = JSON.stringify(item) + "\n";
      
      // Main daily trace
      if (!linesByFile.has(mainTraceFile)) linesByFile.set(mainTraceFile, []);
      linesByFile.get(mainTraceFile).push(line);

      // Task specific trace
      if (item.taskId) {
        const safeTaskId = item.taskId.replace(/[^A-Za-z0-9_-]/g, "_");
        const taskFile = path.join(this.baseDir, "task-traces", `${safeTaskId}.jsonl`);
        if (!linesByFile.has(taskFile)) linesByFile.set(taskFile, []);
        linesByFile.get(taskFile).push(line);
      }

      // Error trace
      if (item.level === "error" || item.errorCode) {
        if (!linesByFile.has(errorTraceFile)) linesByFile.set(errorTraceFile, []);
        linesByFile.get(errorTraceFile).push(line);
      }
    }

    for (const [filePath, lines] of linesByFile.entries()) {
      try {
        await fs.appendFile(filePath, lines.join(""), "utf8");
      } catch {}
    }
  }

  async getTaskTrace(taskId) {
    if (!taskId) return [];
    await this.scheduleFlush();
    const safeTaskId = String(taskId).replace(/[^A-Za-z0-9_-]/g, "_");
    const taskFile = path.join(this.baseDir, "task-traces", `${safeTaskId}.jsonl`);
    try {
      const content = await fs.readFile(taskFile, "utf8");
      return content.split("\n").filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  async getRecentErrors(limit = 100) {
    await this.scheduleFlush();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const files = [
      path.join(this.baseDir, "errors", `${today}.jsonl`),
      path.join(this.baseDir, "errors", `${yesterday}.jsonl`),
    ];
    const results = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf8");
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            results.push(JSON.parse(line));
          } catch {}
        }
      } catch {}
    }
    return results.slice(-limit);
  }

  async cleanOldTraces() {
    const now = Date.now();
    const cutoff = now - this.retentionDays * 86400000;
    const subdirs = ["traces", "task-traces", "errors"];
    let totalSize = 0;
    const allFiles = [];

    for (const sub of subdirs) {
      const dir = path.join(this.baseDir, sub);
      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          try {
            const stat = await fs.stat(fullPath);
            if (stat.mtimeMs < cutoff) {
              await fs.unlink(fullPath).catch(() => {});
            } else {
              totalSize += stat.size;
              allFiles.push({ fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
            }
          } catch {}
        }
      } catch {}
    }

    // If total size exceeds max, delete oldest files
    if (totalSize > this.maxTotalSizeBytes) {
      allFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const file of allFiles) {
        if (totalSize <= this.maxTotalSizeBytes * 0.8) break;
        try {
          await fs.unlink(file.fullPath);
          totalSize -= file.size;
        } catch {}
      }
    }
  }
}
