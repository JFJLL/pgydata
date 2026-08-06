// 蒲公英“找博主”批量任务持久化存储（Phase 4 工作包 B）。
//
// 职责：
// - 每个任务一个目录：<baseDir>/<taskId>/task.json（元数据，tmp+rename 原子写）
//   + rows.jsonl（行块，追加写）。
// - 页块协议（写盘先后顺序是崩溃恢复的核心，见契约测试）：
//   每页一个块，先写 {"kind":"page-start",...}，再逐行写 {"kind":"row",...}，
//   最后写 {"kind":"page-end",...}；appendPageRows 只落行块，commitPage 才
//   原子推进元数据（pagesCompleted/nextPageNum/叶子与任务计数）。
// - 恢复语义（initialize/getTask/getResumeState 时执行）：
//   a) 尾块有 page-start 无 page-end → 丢弃尾块并重写 rows.jsonl，叶子
//      nextPageNum 回到该页（若不在 pagesCompleted），不改变计数；
//   b) 块完整（有 page-end）但 pageNum 不在 pagesCompleted → 幂等修复：
//      加入 pagesCompleted，按 page-end 计数补齐任务/叶子计数；
//   c) pagesCompleted 含 pageNum 但行块缺失/无 page-end → 叶子 failure=
//      {kind:"checkpoint-desync"}，任务 completeness=cannot-prove，禁止静默修复；
//   d) initialize 时 status==="running" 的任务置为 "interrupted"。
//   注：getTask/getResumeState 只对非 running 任务执行恢复（running 表示当前
//   实例正在活跃采集，未提交块属于正常中间态，不得提前修复）。
// - 安全：taskId 复用 collection-history-store 的 assertSafeTaskId；rows 落盘前
//   按 KNOWN_KOL_FIELDS 白名单 + 敏感键正则清洗，值经 sanitizeExcelValue。

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  assertSafeTaskId,
  sanitizeExcelValue,
} from "../electron-main/collection-history-store.mjs";
import { KNOWN_KOL_FIELDS } from "./pgy-kol-search-client.mjs";
import { redactLocalPathText } from "./pgy-session-request.mjs";

const SCHEMA_VERSION = 1;
const KNOWN_KOL_FIELD_SET = new Set(KNOWN_KOL_FIELDS);
// 与 pgy-session-request 的敏感头/敏感值口径保持一致（大小写不敏感）。
const SENSITIVE_FIELD_KEY = /cookie|authorization|token|x-s|x-t|password|secret|session/i;
const TASK_STATUSES = new Set([
  "running",
  "paused",
  "interrupted",
  "incomplete",
  "completed",
  "cancelled",
  "auth-expired",
  "risk-control",
  "failed",
]);
const TERMINAL_STATUSES = new Set([
  "interrupted",
  "incomplete",
  "completed",
  "cancelled",
  "auth-expired",
  "risk-control",
  "failed",
]);

function iso(now) {
  return new Date(now).toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    // fs 错误消息常携带绝对路径；脱敏后再上抛，防止本地敏感路径进入 IPC/日志。
    throw new Error(redactLocalPathText(error instanceof Error ? error.message : String(error)));
  }
}

// readdir 错误同样可能携带绝对路径；统一脱敏后上抛。
async function readDirRedacted(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    throw new Error(redactLocalPathText(error instanceof Error ? error.message : String(error)));
  }
}

async function atomicWriteText(filePath, text) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tempPath, text, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    // fresh reviewer M2：写盘错误消息可能携带绝对路径，统一脱敏后上抛。
    throw new Error(redactLocalPathText(error instanceof Error ? error.message : String(error)));
  }
}

async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// uid 规范化：非空字符串或有限数字 → String 化，否则 null。
function normalizeUid(uid) {
  if (typeof uid === "string") return uid.length > 0 ? uid : null;
  if (typeof uid === "number" && Number.isFinite(uid)) return String(uid);
  return null;
}

// 显式携带 uid（含 null）时以 uid 为准；未携带时才回退到 fields.userId。
// 缺 UID 行（uid=null）即使残留 userId 字段也保持 null，导出时对应列为空。
function resolveRowUid(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  if (Object.prototype.hasOwnProperty.call(row, "uid")) return normalizeUid(row.uid);
  const fields = row.fields;
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) return null;
  return normalizeUid(fields.userId);
}

// 强制白名单清洗：只保留 KNOWN_KOL_FIELDS 中实际存在的键，命中敏感键正则的丢弃，
// 值经 sanitizeExcelValue（控制字符清洗）。
function sanitizeRowFields(rawFields) {
  const out = {};
  if (rawFields === null || typeof rawFields !== "object" || Array.isArray(rawFields)) return out;
  for (const key of Object.keys(rawFields)) {
    if (!KNOWN_KOL_FIELD_SET.has(key)) continue;
    if (SENSITIVE_FIELD_KEY.test(key)) continue;
    const value = sanitizeExcelValue(rawFields[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// 页内计数（恢复回放时按 page-end 行补齐的兜底口径；提交计数以 commitPage 的
// summary 为准，跨页去重由批量引擎负责）。
function summarizeRecords(records) {
  const seen = new Set();
  let rawCount = 0;
  let uniqueCount = 0;
  let dupCount = 0;
  let missingUidCount = 0;
  for (const record of records) {
    rawCount += 1;
    const uid = record.uid;
    if (uid === null) {
      missingUidCount += 1;
    } else if (seen.has(uid)) {
      dupCount += 1;
    } else {
      seen.add(uid);
      uniqueCount += 1;
    }
  }
  return { rawCount, uniqueCount, dupCount, missingUidCount };
}

function defaultLeaf(leafId) {
  return {
    leafId,
    depth: 0,
    parentId: null,
    range: null,
    filterState: {},
    status: "pending",
    pagesCompleted: [],
    nextPageNum: 1,
    total: null,
    capSignal: null,
    rawCount: 0,
    uniqueCount: 0,
    dupCount: 0,
    missingUidCount: 0,
    failure: null,
    startedAt: null,
    finishedAt: null,
  };
}

// 只规范化显式传入的字段；缺失字段由调用方（addLeaf 默认值 / updateLeaf 保留旧值）决定。
function normalizeLeaf(leaf) {
  const out = {};
  if (leaf === null || typeof leaf !== "object" || Array.isArray(leaf)) return out;
  if (leaf.leafId !== undefined) out.leafId = String(leaf.leafId);
  if (leaf.depth !== undefined) out.depth = Number.isSafeInteger(leaf.depth) ? leaf.depth : 0;
  if (leaf.parentId !== undefined) out.parentId = leaf.parentId ?? null;
  if (leaf.range !== undefined) out.range = clone(leaf.range ?? null);
  if (leaf.filterState !== undefined) out.filterState = clone(leaf.filterState ?? {});
  if (leaf.status !== undefined) out.status = typeof leaf.status === "string" ? leaf.status : "pending";
  if (leaf.pagesCompleted !== undefined) {
    out.pagesCompleted = (Array.isArray(leaf.pagesCompleted) ? leaf.pagesCompleted : [])
      .map((pageNum) => Number(pageNum))
      .filter((pageNum) => Number.isSafeInteger(pageNum) && pageNum >= 1)
      .sort((left, right) => left - right);
  }
  if (leaf.nextPageNum !== undefined) {
    out.nextPageNum = Number.isSafeInteger(leaf.nextPageNum) ? leaf.nextPageNum : 1;
  }
  if (leaf.total !== undefined) out.total = leaf.total ?? null;
  if (leaf.capSignal !== undefined) out.capSignal = clone(leaf.capSignal ?? null);
  if (leaf.rawCount !== undefined) out.rawCount = Number(leaf.rawCount) || 0;
  if (leaf.uniqueCount !== undefined) out.uniqueCount = Number(leaf.uniqueCount) || 0;
  if (leaf.dupCount !== undefined) out.dupCount = Number(leaf.dupCount) || 0;
  if (leaf.missingUidCount !== undefined) out.missingUidCount = Number(leaf.missingUidCount) || 0;
  if (leaf.failure !== undefined) out.failure = clone(leaf.failure ?? null);
  if (leaf.startedAt !== undefined) out.startedAt = leaf.startedAt ?? null;
  if (leaf.finishedAt !== undefined) out.finishedAt = leaf.finishedAt ?? null;
  return out;
}

// 解析 rows.jsonl 为页块序列。损坏行视为当前块未完成并停止解析（追加写只会截断尾部）。
function parseRowBlocks(rawText) {
  const blocks = [];
  let current = null;
  for (const line of String(rawText ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      // 损坏行只可能出现在追加写的尾部；若当前块已闭合则块本身完整，
      // 若未闭合则该块即截断尾块（end 保持 null）。无论哪种都停止解析。
      break;
    }
    if (record === null || typeof record !== "object") {
      break;
    }
    if (record.kind === "page-start") {
      current = { start: record, rows: [], end: null };
      blocks.push(current);
    } else if (record.kind === "row") {
      if (current) current.rows.push(record);
    } else if (record.kind === "page-end") {
      if (current) current.end = record;
    }
  }
  return blocks;
}

function serializeBlocks(blocks) {
  const lines = [];
  for (const block of blocks) {
    if (!block || !block.start) continue;
    lines.push(JSON.stringify(block.start));
    for (const row of block.rows || []) lines.push(JSON.stringify(row));
    if (block.end) lines.push(JSON.stringify(block.end));
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

// 按行文件顺序全局重算计数（fresh reviewer M1）：崩溃恢复修复未提交块后，
// 必须用与运行时完全相同的全局去重口径重建全部计数——页内 uniqueCount 不能
// 用于全局统计（一页全为跨页重复 UID 时页内口径会把它们记为 unique）。
// 只统计已提交页（pagesCompleted）的行；缺 UID 行计入 missingUid。
function recountFromBlocks(metadata, blocks) {
  const globalSeen = new Set();
  const totals = { raw: 0, unique: 0, dup: 0, missingUid: 0 };
  const leafCounters = new Map();
  for (const leaf of Array.isArray(metadata.leaves) ? metadata.leaves : []) {
    leafCounters.set(leaf.leafId, { raw: 0, unique: 0, dup: 0, missingUid: 0 });
  }
  const committed = new Map();
  for (const leaf of Array.isArray(metadata.leaves) ? metadata.leaves : []) {
    committed.set(leaf.leafId, new Set((leaf.pagesCompleted || []).map(Number)));
  }
  for (const block of blocks) {
    if (!block || !block.start || !block.end) continue;
    const leafId = block.start.leafId;
    const pageSet = committed.get(leafId);
    if (!pageSet || !pageSet.has(Number(block.start.pageNum))) continue;
    const counter = leafCounters.get(leafId);
    if (!counter) continue;
    for (const row of block.rows || []) {
      totals.raw += 1;
      counter.raw += 1;
      const uid = row && row.uid !== undefined && row.uid !== null ? String(row.uid) : null;
      if (uid === null || uid.length === 0) {
        totals.missingUid += 1;
        counter.missingUid += 1;
      } else if (globalSeen.has(uid)) {
        totals.dup += 1;
        counter.dup += 1;
      } else {
        globalSeen.add(uid);
        totals.unique += 1;
        counter.unique += 1;
      }
    }
  }
  return { totals, leafCounters };
}

export class PgyKolTaskStore {
  constructor({ baseDir, now = () => Date.now() } = {}) {
    if (!baseDir) throw new Error("蒲公英批量任务存储路径不能为空");
    this.baseDir = path.resolve(baseDir);
    this.now = now;
    this.locks = new Map();
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
      metadata: path.join(dir, "task.json"),
      rows: path.join(dir, "rows.jsonl"),
    };
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

  async loadMetadata(taskId) {
    const metadata = await readJson(this.paths(taskId).metadata, null);
    if (!metadata) throw new Error("任务不存在");
    return metadata;
  }

  /**
   * 扫描全部任务目录并执行崩溃恢复。
   * @returns {Promise<{ recovered: number, tasks: object[] }>}
   */
  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await readDirRedacted(this.baseDir);
    let recovered = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let taskId;
      try {
        taskId = assertSafeTaskId(entry.name);
      } catch {
        continue;
      }
      try {
        const changed = await this.withLock(taskId, () =>
          this.recoverTask(taskId, { markInterrupted: true }),
        );
        if (changed) recovered += 1;
      } catch {
        // 单个损坏任务目录不能阻塞整仓扫描恢复。
      }
    }
    return { recovered, tasks: await this.listTasks() };
  }

  async createTask(input = {}) {
    const taskId = assertSafeTaskId(input?.taskId);
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      await fs.mkdir(taskPaths.dir, { recursive: true });
      const existing = await readJson(taskPaths.metadata, null);
      if (existing) throw new Error(`任务已存在: ${taskId}`);
      const now = iso(this.now());
      const metadata = {
        schemaVersion: SCHEMA_VERSION,
        taskId,
        status: "running",
        completeness: "not-started",
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
        pageSize: Number.isSafeInteger(input?.pageSize) ? input.pageSize : 20,
        columns: Array.isArray(input?.columns) ? input.columns.map((column) => String(column)) : [],
        filterState: clone(input?.filterState ?? {}),
        budgets: clone(input?.budgets ?? {}),
        counts: { raw: 0, unique: 0, dup: 0, missingUid: 0 },
        leaves: [],
        summary: {
          subqueryCount: 0,
          failureCount: 0,
          cappedCount: 0,
          unprovableCount: 0,
          warnings: [],
          stopReason: null,
        },
      };
      if (input?.fileName !== undefined && input?.fileName !== null) {
        metadata.fileName = String(input.fileName);
      }
      await fs
        .writeFile(taskPaths.rows, "", { encoding: "utf8", flag: "wx" })
        .catch((error) => {
          if (error?.code !== "EEXIST") throw error;
        });
      await atomicWriteJson(taskPaths.metadata, metadata);
      return clone(metadata);
    });
  }

  /**
   * 读取任务（不存在返回 null）。非 running 任务会先执行崩溃恢复。
   */
  async getTask(taskId) {
    const taskPaths = this.paths(taskId);
    return this.withLock(taskId, async () => {
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) return null;
      if (metadata.status !== "running") {
        await this.recoverTask(taskId, { markInterrupted: false });
      }
      return clone(await readJson(taskPaths.metadata, null));
    });
  }

  async listTasks() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await readDirRedacted(this.baseDir);
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let taskId;
      try {
        taskId = assertSafeTaskId(entry.name);
      } catch {
        continue;
      }
      const metadata = await readJson(this.paths(taskId).metadata, null).catch(() => null);
      if (!metadata) continue;
      tasks.push({
        schemaVersion: metadata.schemaVersion,
        taskId: metadata.taskId,
        fileName: metadata.fileName,
        status: metadata.status,
        completeness: metadata.completeness,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        finishedAt: metadata.finishedAt,
        pageSize: metadata.pageSize,
        columns: clone(metadata.columns ?? []),
        counts: clone(metadata.counts ?? {}),
        summary: clone(metadata.summary ?? {}),
        leafCount: Array.isArray(metadata.leaves) ? metadata.leaves.length : 0,
      });
    }
    return tasks.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async setStatus(taskId, status) {
    if (!TASK_STATUSES.has(status)) throw new Error("非法任务状态");
    return this.withLock(taskId, async () => {
      const metadata = await this.loadMetadata(taskId);
      metadata.status = status;
      metadata.updatedAt = iso(this.now());
      metadata.finishedAt = TERMINAL_STATUSES.has(status) ? metadata.updatedAt : null;
      await atomicWriteJson(this.paths(taskId).metadata, metadata);
      return clone(metadata);
    });
  }

  /**
   * 设置完整性状态。extra 为可选补充元数据：summary 合并进任务 summary，其余键浅合并。
   */
  async setCompleteness(taskId, completeness, extra = {}) {
    if (typeof completeness !== "string" || completeness.length === 0) {
      throw new Error("非法完整性状态");
    }
    return this.withLock(taskId, async () => {
      const metadata = await this.loadMetadata(taskId);
      metadata.completeness = completeness;
      if (extra !== null && typeof extra === "object" && !Array.isArray(extra)) {
        for (const [key, value] of Object.entries(extra)) {
          if (key === "summary" && value !== null && typeof value === "object" && !Array.isArray(value)) {
            if (metadata.summary === null || typeof metadata.summary !== "object") {
              metadata.summary = {};
            }
            Object.assign(metadata.summary, clone(value));
          } else {
            metadata[key] = clone(value);
          }
        }
      }
      metadata.updatedAt = iso(this.now());
      await atomicWriteJson(this.paths(taskId).metadata, metadata);
      return clone(metadata);
    });
  }

  async addLeaf(taskId, leaf = {}) {
    return this.withLock(taskId, async () => {
      const metadata = await this.loadMetadata(taskId);
      const leafId = String(leaf?.leafId ?? "");
      if (!leafId) throw new Error("非法叶子 ID");
      if (metadata.leaves.some((item) => item.leafId === leafId)) {
        throw new Error(`叶子已存在: ${leafId}`);
      }
      metadata.leaves.push({ ...defaultLeaf(leafId), ...normalizeLeaf(leaf) });
      metadata.updatedAt = iso(this.now());
      await atomicWriteJson(this.paths(taskId).metadata, metadata);
      return clone(metadata);
    });
  }

  /**
   * 按 leafId 替换叶子：只覆盖传入字段，未传字段保留原值（不丢已提交状态）。
   */
  async updateLeaf(taskId, leaf = {}) {
    return this.withLock(taskId, async () => {
      const metadata = await this.loadMetadata(taskId);
      const leafId = String(leaf?.leafId ?? "");
      const index = metadata.leaves.findIndex((item) => item.leafId === leafId);
      if (index < 0) throw new Error(`叶子不存在: ${leafId}`);
      metadata.leaves[index] = { ...metadata.leaves[index], ...normalizeLeaf(leaf) };
      metadata.updatedAt = iso(this.now());
      await atomicWriteJson(this.paths(taskId).metadata, metadata);
      return clone(metadata);
    });
  }

  /**
   * 只写页块（page-start / row* / page-end），不推进任何计数。
   * truncateTail 仅为测试钩子：跳过 page-end 行模拟崩溃截断，生产路径不传。
   */
  async appendPageRows(taskId, { leafId, pageNum, rows = [], truncateTail = false } = {}) {
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      if (typeof leafId !== "string" || !leafId) throw new Error("非法叶子 ID");
      if (!Number.isSafeInteger(pageNum) || pageNum < 1) throw new Error("非法页码");
      if (!metadata.leaves.some((leaf) => leaf.leafId === leafId)) {
        throw new Error(`叶子不存在: ${leafId}`);
      }
      const sourceRows = Array.isArray(rows) ? rows : [];
      const records = [];
      for (const row of sourceRows) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
        records.push({
          kind: "row",
          leafId,
          pageNum,
          uid: resolveRowUid(row),
          fields: sanitizeRowFields(row.fields),
        });
      }
      const lines = [JSON.stringify({ kind: "page-start", taskId, leafId, pageNum })];
      for (const record of records) lines.push(JSON.stringify(record));
      if (!truncateTail) {
        lines.push(JSON.stringify({ kind: "page-end", leafId, pageNum, ...summarizeRecords(records) }));
      }
      await fs.appendFile(taskPaths.rows, `${lines.join("\n")}\n`, "utf8");
      return { leafId, pageNum, rowsWritten: records.length };
    });
  }

  /**
   * 原子推进提交：pagesCompleted 追加 pageNum、nextPageNum=pageNum+1、
   * 叶子与任务计数按 summary 前进。同一页重复提交为幂等 no-op。
   */
  async commitPage(taskId, { leafId, pageNum, summary = {} } = {}) {
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      const leaf = metadata.leaves.find((item) => item.leafId === leafId);
      if (!leaf) throw new Error(`叶子不存在: ${leafId}`);
      if (Number.isSafeInteger(pageNum) && pageNum >= 1 && !leaf.pagesCompleted.includes(pageNum)) {
        leaf.pagesCompleted.push(pageNum);
        leaf.pagesCompleted.sort((left, right) => left - right);
        leaf.nextPageNum = Math.max(Number(leaf.nextPageNum) || 1, pageNum + 1);
        const rawCount = Number(summary?.rawCount) || 0;
        const uniqueCount = Number(summary?.uniqueCount) || 0;
        const dupCount = Number(summary?.dupCount) || 0;
        const missingUidCount = Number(summary?.missingUidCount) || 0;
        leaf.rawCount = (Number(leaf.rawCount) || 0) + rawCount;
        leaf.uniqueCount = (Number(leaf.uniqueCount) || 0) + uniqueCount;
        leaf.dupCount = (Number(leaf.dupCount) || 0) + dupCount;
        leaf.missingUidCount = (Number(leaf.missingUidCount) || 0) + missingUidCount;
        metadata.counts.raw += rawCount;
        metadata.counts.unique += uniqueCount;
        metadata.counts.dup += dupCount;
        metadata.counts.missingUid += missingUidCount;
        // 查询预算跨实例累计（批量引擎每页提交时携带）。
        if (Number.isFinite(summary?.budgetUsed)) {
          metadata.budgetUsed = Number(summary.budgetUsed);
        }
        metadata.updatedAt = iso(this.now());
        await atomicWriteJson(taskPaths.metadata, metadata);
      }
      return clone(metadata);
    });
  }

  /**
   * 从 rows.jsonl 重建全部行：[{ leafId, pageNum, uid, fields }]（文件顺序）。
   */
  async getRows(taskId) {
    const taskPaths = this.paths(taskId);
    const metadata = await readJson(taskPaths.metadata, null);
    if (!metadata) throw new Error("任务不存在");
    const rawText = await fs.readFile(taskPaths.rows, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return "";
      throw new Error(redactLocalPathText(error instanceof Error ? error.message : String(error)));
    });
    // 只返回已提交页（pagesCompleted）的行：导出/去重重建必须与 commitPage
    // 计数一致，运行中“已追加但未提交”的页不得出现在导出中。
    const committedPages = new Map();
    for (const leaf of Array.isArray(metadata.leaves) ? metadata.leaves : []) {
      if (leaf && Array.isArray(leaf.pagesCompleted)) {
        committedPages.set(leaf.leafId, new Set(leaf.pagesCompleted.map(Number)));
      }
    }
    const rows = [];
    for (const line of rawText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record !== null && typeof record === "object" && record.kind === "row") {
        const pageSet = committedPages.get(record.leafId);
        if (!pageSet || !pageSet.has(Number(record.pageNum))) {
          continue;
        }
        rows.push({
          leafId: record.leafId,
          pageNum: record.pageNum,
          uid: record.uid === undefined || record.uid === null ? null : record.uid,
          fields: clone(record.fields ?? {}),
        });
      }
    }
    return rows;
  }

  /**
   * 恢复/继续采集所需状态（非 running 任务先执行恢复）。
   */
  async getResumeState(taskId) {
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      if (metadata.status !== "running") {
        await this.recoverTask(taskId, { markInterrupted: false });
      }
      const task = await readJson(taskPaths.metadata, null);
      return {
        taskId: task.taskId,
        status: task.status,
        completeness: task.completeness,
        counts: clone(task.counts),
        summary: clone(task.summary),
        leaves: clone(task.leaves),
        pageSize: task.pageSize,
        filterState: clone(task.filterState),
        budgets: clone(task.budgets),
        columns: clone(task.columns ?? []),
      };
    });
  }

  /**
   * 单任务崩溃恢复（调用方须持有 withLock）。返回是否发生任何变更。
   */
  async recoverTask(taskId, { markInterrupted = false } = {}) {
    const taskPaths = this.paths(taskId);
    const metadata = await readJson(taskPaths.metadata, null);
    if (!metadata) return false;
    if (metadata.counts === null || typeof metadata.counts !== "object") {
      metadata.counts = { raw: 0, unique: 0, dup: 0, missingUid: 0 };
    }
    if (metadata.summary === null || typeof metadata.summary !== "object") {
      metadata.summary = {
        subqueryCount: 0,
        failureCount: 0,
        cappedCount: 0,
        unprovableCount: 0,
        warnings: [],
        stopReason: null,
      };
    }
    const rawText = await fs.readFile(taskPaths.rows, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return "";
      // fresh reviewer M2：恢复路径的错误消息同样必须脱敏。
      throw new Error(redactLocalPathText(error instanceof Error ? error.message : String(error)));
    });
    let changed = false;
    let rowsRewritten = false;

    // a) 截断尾块（有 page-start 无 page-end）：丢弃并重写 rows.jsonl。
    const blocks = parseRowBlocks(rawText);
    const firstIncomplete = blocks.findIndex((block) => !block.end);
    let keptBlocks = blocks;
    if (firstIncomplete >= 0) {
      for (const block of blocks.slice(firstIncomplete)) {
        const start = block?.start;
        if (!start) continue;
        const leaf = (Array.isArray(metadata.leaves) ? metadata.leaves : []).find(
          (item) => item.leafId === start.leafId,
        );
        if (leaf && !leaf.pagesCompleted.includes(start.pageNum)) {
          leaf.nextPageNum = start.pageNum;
        }
      }
      keptBlocks = blocks.slice(0, firstIncomplete);
      rowsRewritten = true;
      changed = true;
    }

    const blocksByLeaf = new Map();
    for (const block of keptBlocks) {
      if (!block?.start) continue;
      const leafId = block.start.leafId;
      if (!blocksByLeaf.has(leafId)) blocksByLeaf.set(leafId, new Map());
      blocksByLeaf.get(leafId).set(block.start.pageNum, block);
    }

    for (const leaf of Array.isArray(metadata.leaves) ? metadata.leaves : []) {
      const leafBlocks = blocksByLeaf.get(leaf.leafId) || new Map();
      const pagesCompleted = Array.isArray(leaf.pagesCompleted) ? leaf.pagesCompleted : [];
      leaf.pagesCompleted = pagesCompleted;
      // c) 元数据超前：pagesCompleted 含 pageNum 但行块缺失 → 显式 desync，禁止静默修复。
      for (const pageNum of pagesCompleted) {
        const block = leafBlocks.get(pageNum);
        if (!block || !block.end) {
          const existing = leaf.failure;
          if (
            !existing ||
            existing.kind !== "checkpoint-desync" ||
            existing.pageNum !== pageNum
          ) {
            leaf.failure = {
              kind: "checkpoint-desync",
              pageNum,
              message: "元数据超前于行块，禁止静默修复",
            };
            changed = true;
          }
          if (metadata.completeness !== "cannot-prove") {
            metadata.completeness = "cannot-prove";
            changed = true;
          }
        }
      }
      // b) 完整块未提交：幂等修复（加入 pagesCompleted、按 page-end 计数补齐）。
      for (const [pageNum, block] of leafBlocks) {
        if (!block.end) continue;
        if (leaf.pagesCompleted.includes(pageNum)) continue;
        leaf.pagesCompleted.push(pageNum);
        leaf.pagesCompleted.sort((left, right) => left - right);
        leaf.nextPageNum = Math.max(Number(leaf.nextPageNum) || 1, pageNum + 1);
        changed = true;
      }
    }

    // M1：全局重算（只统计已提交页）——恢复修复后计数与运行时全局去重口径一致。
    const recount = recountFromBlocks(metadata, keptBlocks);
    for (const leaf of metadata.leaves) {
      const counter = recount.leafCounters.get(leaf.leafId) || { raw: 0, unique: 0, dup: 0, missingUid: 0 };
      if (
        Number(leaf.rawCount) !== counter.raw ||
        Number(leaf.uniqueCount) !== counter.unique ||
        Number(leaf.dupCount) !== counter.dup ||
        Number(leaf.missingUidCount) !== counter.missingUid
      ) {
        leaf.rawCount = counter.raw;
        leaf.uniqueCount = counter.unique;
        leaf.dupCount = counter.dup;
        leaf.missingUidCount = counter.missingUid;
        changed = true;
      }
    }
    if (
      Number(metadata.counts?.raw) !== recount.totals.raw ||
      Number(metadata.counts?.unique) !== recount.totals.unique ||
      Number(metadata.counts?.dup) !== recount.totals.dup ||
      Number(metadata.counts?.missingUid) !== recount.totals.missingUid
    ) {
      metadata.counts = { ...recount.totals };
      changed = true;
    }

    // d) initialize 时 running → interrupted（可恢复状态）。
    if (markInterrupted && metadata.status === "running") {
      metadata.status = "interrupted";
      metadata.updatedAt = iso(this.now());
      metadata.finishedAt = metadata.updatedAt;
      changed = true;
    }

    if (changed) {
      if (rowsRewritten) {
        await atomicWriteText(taskPaths.rows, serializeBlocks(keptBlocks));
      }
      metadata.updatedAt = iso(this.now());
      await atomicWriteJson(taskPaths.metadata, metadata);
    }
    return changed;
  }

  /**
   * 持久化查询预算消耗（跨实例累计）。批量引擎在每次停止/收尾时调用。
   */
  async setTaskBudget(taskId, budgetUsed) {
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      if (!Number.isFinite(budgetUsed)) {
        return clone(metadata);
      }
      metadata.budgetUsed = Number(budgetUsed);
      metadata.updatedAt = iso(this.now());
      await atomicWriteJson(taskPaths.metadata, metadata);
      return clone(metadata);
    });
  }

  /**
   * 原子更新任务预算（Phase 4.1：增加预算继续）。只接受正整数字段，
   * 缺失字段保留原值；写盘失败整体回滚（tmp+rename）。
   */
  async setTaskBudgets(taskId, budgets = {}) {
    return this.withLock(taskId, async () => {
      const taskPaths = this.paths(taskId);
      const metadata = await readJson(taskPaths.metadata, null);
      if (!metadata) throw new Error("任务不存在");
      if (budgets === null || typeof budgets !== "object" || Array.isArray(budgets)) {
        throw new Error("非法预算");
      }
      const next = { ...(metadata.budgets ?? {}) };
      let changed = false;
      for (const key of ["queryBudget", "maxPagesPerLeaf", "maxLeaves", "maxDepth"]) {
        const raw = budgets[key];
        if (raw === undefined || raw === null) continue;
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
          throw new Error(`非法预算字段: ${key}`);
        }
        if (next[key] !== raw) {
          next[key] = raw;
          changed = true;
        }
      }
      if (changed) {
        metadata.budgets = next;
        metadata.updatedAt = iso(this.now());
        await atomicWriteJson(taskPaths.metadata, metadata);
      }
      return clone(metadata);
    });
  }
}
