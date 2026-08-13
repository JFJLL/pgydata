/**
 * 蒲公英“找博主”IPC 输入边界守卫（第二阶段）。
 *
 * 职责：在 ipc handler 入口对渲染进程输入做确定性校验，任何异常输入
 * 都以 { ok:false, error:{ code, message } } 拒绝，不携带 URL/任意字符串透传。
 *
 * 纯 ESM，只依赖 Node 内置能力，不 import electron、不发起网络请求。
 */

import { listPgyKolConfirmedColumns } from "./pgy-kol-column-registry.mjs";
import { resolveCollectionExportHeaders } from "../electron-main/collection-export-headers.mjs";

// 深度只累计非 children 容器：filterState(1) + 字段数组(1) + 树节点层级。
// 官网行业画像树最深约 4 层节点（depth 3-6），预留余量取 8。
export const PGY_KOL_IPC_MAX_DEPTH = 8;
export const PGY_KOL_IPC_MAX_ARRAY_LENGTH = 200;
export const PGY_KOL_IPC_MAX_STRING_LENGTH = 512;
export const PGY_KOL_IPC_MAX_FILTER_FIELDS = 64;
export const PGY_KOL_IPC_MAX_TOTAL_NODES = 5000;

// Phase 4 批量采集通道的输入边界。
export const PGY_KOL_BATCH_MAX_COLUMNS = 64;
export const PGY_KOL_BATCH_MAX_COLUMN_LENGTH = 64;
// 两阶段采集：详情阶段字段集合来自完整共享 schema（当前 91 键），
// 必须容纳全选场景；字段名仍受长度与去重边界约束。
export const PGY_KOL_BATCH_MAX_FIELDS = 128;
export const PGY_KOL_BATCH_MAX_FIELD_LENGTH = 64;
export const PGY_KOL_BATCH_PAGE_SIZE_LIMIT = 100;

// 完整蒲公英 blogger schema 键集合（与导出规范表头同源，非裁剪白名单）。
// 共享字段弹窗只会产出这些键；未知键拒绝（防止空行扣费/垃圾字段进入详情任务）。
const PGY_BLOGGER_SCHEMA_KEYS = new Set(
  (resolveCollectionExportHeaders("pgy", "blogger") || []).map((header) => header.key),
);

// 预算硬上限（渲染进程不可突破；runner 恢复校验复用同一口径）。
export const PGY_KOL_BUDGET_LIMITS = Object.freeze({
  maxLeaves: 64,
  maxDepth: 10,
  maxPagesPerLeaf: 250,
  queryBudget: 1000,
});

// resume 只允许这两个可单调增加的预算键（未知键一律拒绝，防拼写绕过校验）。
export const PGY_KOL_RESUME_BUDGET_KEYS = Object.freeze(["queryBudget", "maxPagesPerLeaf"]);

// 任务 ID 与 collection-history-store 同口径：字母数字开头、1-96 字符、
// 只允许 [A-Za-z0-9_-]，并拒绝 Windows 保留名（路径穿越与命名冲突防护）。
export const PGY_KOL_TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const WINDOWS_RESERVED_TASK_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// config 通道 provider 白名单：只允许这三类，且 section 规则各不相同。
// kolTagsV2：section 必填且只能是三个已确认节；consumeBehavior/areas：section 必须省略。
export const PGY_KOL_CONFIG_SECTIONS = Object.freeze(
  Object.freeze(["automotiveIndustryTag", "audience20", "contentTheme", "industryTags"]),
);
export const PGY_KOL_CONFIG_PROVIDERS = Object.freeze([
  "kolTagsV2",
  "consumeBehavior",
  "areas",
  "activities",
  "brandSearch",
  "contentTagTree",
  "specialIndustryData",
]);

const MAX_CONFIG_FIELD_LENGTH = 64;

// Phase 5 搜索上下文边界：keyword 不得超过 200 字符且不含控制字符；
// trackId 只允许 [A-Za-z0-9._:-] 1-128 字符（官网 trackId 形状未完全实证，
// 放宽到安全字符集内，避免误伤合法搜索上下文）。
export const PGY_KOL_KEYWORD_MAX_LENGTH = 200;
export const PGY_KOL_TRACK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * 校验 config 通道入参 { provider, section }。
 *
 * @returns {{ ok: true, provider: string, section?: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateConfigRequest(input) {
  if (!isRecord(input)) {
    return invalid("invalid-input", "config 请求必须是普通对象");
  }
  const provider = input.provider;
  if (typeof provider !== "string" || provider.length === 0 || provider.length > MAX_CONFIG_FIELD_LENGTH) {
    return invalid("invalid-input", "provider 必须是 1-64 字符的字符串");
  }
  const sectionRaw = input.section;
  const hasSection = sectionRaw !== undefined && sectionRaw !== null;
  if (hasSection && (typeof sectionRaw !== "string" || sectionRaw.length === 0 || sectionRaw.length > MAX_CONFIG_FIELD_LENGTH)) {
    return invalid("invalid-input", "section 必须是 1-64 字符的字符串");
  }

  if (!PGY_KOL_CONFIG_PROVIDERS.includes(provider)) {
    return invalid("unknown-provider", `未知 provider: ${provider}`);
  }
  if (provider === "kolTagsV2") {
    if (!hasSection) {
      return invalid("unknown-section", "kolTagsV2 必须提供 section");
    }
    if (!PGY_KOL_CONFIG_SECTIONS.includes(sectionRaw)) {
      return invalid("unknown-section", `未知 kolTagsV2 section: ${sectionRaw}`);
    }
    return { ok: true, provider, section: sectionRaw };
  }
  if (provider === "brandSearch") {
    if (hasSection) {
      return invalid("unknown-section", "brandSearch 不允许携带 section");
    }
    const keyword = input.keyword;
    if (
      typeof keyword !== "string" ||
      keyword.trim().length === 0 ||
      keyword.trim().length > MAX_CONFIG_FIELD_LENGTH
    ) {
      return invalid("invalid-keyword", "brandSearch 必须提供 1-64 字符的 keyword");
    }
    const trimmed = keyword.trim();
    // 安全边界（fresh reviewer H1）：keyword 会进入 LKG 快照文件名与 URL，
    // 拒绝控制字符与路径分隔/Windows 非法文件名字符，防止路径穿越与文件名注入。
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
      return invalid("invalid-keyword", "brandSearch keyword 不得包含控制字符");
    }
    if (/[\\/:*?"<>|]/.test(trimmed)) {
      return invalid("invalid-keyword", "brandSearch keyword 不得包含路径分隔或非法文件名字符");
    }
    return { ok: true, provider, keyword: trimmed };
  }
  if (hasSection) {
    return invalid("unknown-section", `${provider} 不允许携带 section`);
  }
  return { ok: true, provider };
}

/**
 * 校验批量采集任务 ID 请求 { taskId }。
 *
 * @returns {{ ok: true, taskId: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateTaskIdRequest(input) {
  if (!isRecord(input)) {
    return invalid("invalid-input", "任务请求必须是普通对象");
  }
  const taskId = input.taskId;
  if (
    typeof taskId !== "string" ||
    !PGY_KOL_TASK_ID_PATTERN.test(taskId) ||
    WINDOWS_RESERVED_TASK_NAMES.test(taskId)
  ) {
    return invalid("invalid-task-id", "非法任务 ID");
  }
  return { ok: true, taskId };
}

/**
 * 校验批量导出请求 { taskId, columns? }：columns 可选，提供时必须
 * 命中列注册表 confirmed 白名单（与 batchStart 同口径）。
 *
 * @returns {{ ok: true, value: { taskId: string, columns?: string[] } } | { ok: false, error: object }}
 */
export function validateExportRequest(input) {
  if (!isRecord(input)) {
    return invalid("invalid-input", "导出请求必须是普通对象");
  }
  const taskCheck = validateTaskIdRequest(input);
  if (!taskCheck.ok) {
    return taskCheck;
  }
  const columns = input.columns;
  if (columns === undefined || columns === null) {
    return { ok: true, value: { taskId: taskCheck.taskId } };
  }
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > PGY_KOL_BATCH_MAX_COLUMNS) {
    return invalid("invalid-columns", `columns 必须是 1-${PGY_KOL_BATCH_MAX_COLUMNS} 项的数组`);
  }
  const confirmedIds = new Set(listPgyKolConfirmedColumns().map((column) => column.id));
  const seen = new Set();
  for (const column of columns) {
    if (
      typeof column !== "string" ||
      column.length === 0 ||
      column.length > PGY_KOL_BATCH_MAX_COLUMN_LENGTH
    ) {
      return invalid("invalid-columns", "列名必须是 1-64 字符的字符串");
    }
    if (seen.has(column)) {
      return invalid("invalid-columns", "列名重复");
    }
    seen.add(column);
    if (!confirmedIds.has(column)) {
      return invalid("unknown-column", `未知或未确认列: ${column}`);
    }
  }
  return { ok: true, value: { taskId: taskCheck.taskId, columns } };
}

/**
 * 校验批量采集启动请求 { filterState, fields, pageSize?, budgets? }。
 *
 * - filterState 复用现有筛选状态边界校验；
 * - fields 是共享字段弹窗提交的完整 schema 键集合：1-128 项字符串、
 *   无重复、每项 1-64 字符，且每一项都必须是完整蒲公英 blogger schema
 *   的键（91 键全选可通过，绝不在本层裁剪）。两阶段编排会把该集合原样
 *   交给现有 pgy/blogger 详情采集器；本层只做形状/边界/键集合校验，
 *   防止未知键进入持久化造成空行扣费或垃圾字段。
 * - pageSize 缺省 20，必须是 1-100 的整数（与 builder 上限一致）；
 * - budgets 可选：maxLeaves/maxDepth/maxPagesPerLeaf/queryBudget 必须是
 *   正整数且不超过硬上限（防渲染进程放大查询预算）。
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function validateBatchStartRequest(input) {
  if (!isRecord(input)) {
    return invalid("invalid-input", "批量采集请求必须是普通对象");
  }
  const filterCheck = validateFilterState(input.filterState);
  if (!filterCheck.ok) {
    return filterCheck;
  }

  const fields = input.fields;
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > PGY_KOL_BATCH_MAX_FIELDS) {
    return invalid(
      "invalid-columns",
      `fields 必须是 1-${PGY_KOL_BATCH_MAX_FIELDS} 项的数组`,
    );
  }
  const seen = new Set();
  for (const field of fields) {
    if (
      typeof field !== "string" ||
      field.length === 0 ||
      field.length > PGY_KOL_BATCH_MAX_FIELD_LENGTH
    ) {
      return invalid("invalid-columns", `字段名必须是 1-${PGY_KOL_BATCH_MAX_FIELD_LENGTH} 字符的字符串`);
    }
    if (seen.has(field)) {
      return invalid("invalid-columns", "字段名重复");
    }
    seen.add(field);
    if (!PGY_BLOGGER_SCHEMA_KEYS.has(field)) {
      return invalid("unknown-field", `未知字段: ${field}`);
    }
  }

  const value = { filterState: filterCheck.value, fields };
  const pageSize = input.pageSize === undefined || input.pageSize === null ? 20 : input.pageSize;
  if (
    typeof pageSize !== "number" ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PGY_KOL_BATCH_PAGE_SIZE_LIMIT
  ) {
    return invalid("invalid-page-size", `pageSize 必须是 1-${PGY_KOL_BATCH_PAGE_SIZE_LIMIT} 的整数`);
  }
  value.pageSize = pageSize;

  if (input.budgets !== undefined && input.budgets !== null) {
    if (!isRecord(input.budgets)) {
      return invalid("invalid-budgets", "budgets 必须是普通对象");
    }
    const budgets = {};
    for (const key of Object.keys(PGY_KOL_BUDGET_LIMITS)) {
      const raw = input.budgets[key];
      if (raw === undefined || raw === null) {
        continue;
      }
      if (
        typeof raw !== "number" ||
        !Number.isInteger(raw) ||
        raw < 1 ||
        raw > PGY_KOL_BUDGET_LIMITS[key]
      ) {
        return invalid(
          "invalid-budgets",
          `budgets.${key} 必须是 1-${PGY_KOL_BUDGET_LIMITS[key]} 的整数`,
        );
      }
      budgets[key] = raw;
    }
    if (Object.keys(budgets).length > 0) {
      value.budgets = budgets;
    }
  }

  return { ok: true, value };
}

/**
 * 校验批量继续请求 { taskId, budgets? }。
 *
 * budgets 可选（paused/interrupted/failed 可不传）；传了就必须是只含
 * queryBudget/maxPagesPerLeaf 的普通对象，值必须是正整数且不超 IPC 上限。
 * 单调性（严格大于旧预算与已消费数）由 service/runner 依据任务状态校验。
 *
 * @returns {{ ok: true, value: { taskId: string, budgets?: object } } | { ok: false, error: { code: string, message: string } }}
 */
export function validateBatchResumeRequest(input) {
  if (!isRecord(input)) {
    return invalid("invalid-input", "批量继续请求必须是普通对象");
  }
  const taskIdCheck = validateTaskIdRequest(input);
  if (!taskIdCheck.ok) {
    return taskIdCheck;
  }
  const value = { taskId: taskIdCheck.taskId };
  if (input.budgets === undefined || input.budgets === null) {
    return { ok: true, value };
  }
  if (!isRecord(input.budgets)) {
    return invalid("invalid-budgets", "budgets 必须是普通对象");
  }
  const budgets = {};
  for (const key of Object.keys(input.budgets)) {
    if (!PGY_KOL_RESUME_BUDGET_KEYS.includes(key)) {
      return invalid("invalid-budgets", `不支持的预算字段: ${key}`);
    }
    const raw = input.budgets[key];
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > PGY_KOL_BUDGET_LIMITS[key]
    ) {
      return invalid(
        "invalid-budgets",
        `budgets.${key} 必须是 1-${PGY_KOL_BUDGET_LIMITS[key]} 的整数`,
      );
    }
    budgets[key] = raw;
  }
  if (Object.keys(budgets).length === 0) {
    return { ok: true, value };
  }
  value.budgets = budgets;
  return { ok: true, value };
}

/**
 * 校验 filterState：普通对象、深度 ≤ MAX_DEPTH、数组长度 ≤ MAX_ARRAY_LENGTH、
 * 字符串长度 ≤ MAX_STRING_LENGTH、顶层键数 ≤ MAX_FILTER_FIELDS。
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function validateFilterState(value) {
  if (!isRecord(value)) {
    return invalid("invalid-input", "filterState 必须是普通对象");
  }
  if (Object.keys(value).length > PGY_KOL_IPC_MAX_FILTER_FIELDS) {
    return invalid(
      "too-many-fields",
      `filterState 键数超过上限 ${PGY_KOL_IPC_MAX_FILTER_FIELDS}`,
    );
  }
  // Phase 5 搜索上下文特殊键（searchType/keyword/trackId）边界校验。
  if (Object.hasOwn(value, "searchType") && value.searchType !== 0 && value.searchType !== 1) {
    return invalid("invalid-search-type", "searchType 必须是 0（搜昵称）或 1（搜笔记）");
  }
  if (Object.hasOwn(value, "keyword")) {
    const keyword = value.keyword;
    if (typeof keyword !== "string" || keyword.length > PGY_KOL_KEYWORD_MAX_LENGTH) {
      return invalid(
        "invalid-keyword",
        `keyword 必须是 0-${PGY_KOL_KEYWORD_MAX_LENGTH} 字符的字符串`,
      );
    }
    // 控制字符/换行禁止进入关键词（防日志注入与异常请求体）。
    if (/[\u0000-\u001f\u007f]/.test(keyword)) {
      return invalid("invalid-keyword", "keyword 不得包含控制字符");
    }
  }
  if (Object.hasOwn(value, "trackId")) {
    const trackId = value.trackId;
    if (
      trackId !== null &&
      trackId !== undefined &&
      (typeof trackId !== "string" || !PGY_KOL_TRACK_ID_PATTERN.test(trackId))
    ) {
      return invalid("invalid-track-id", "非法 trackId");
    }
  }
  const budget = { nodes: 0 };
  const walkError = walk(value, 1, new Set(), budget);
  if (walkError) {
    return walkError;
  }
  return { ok: true, value };
}

function walk(value, depth, seen, budget) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length > PGY_KOL_IPC_MAX_STRING_LENGTH) {
      return invalid(
        "string-too-long",
        `字符串长度超过上限 ${PGY_KOL_IPC_MAX_STRING_LENGTH}`,
      );
    }
    return null;
  }
  // 节点预算只计对象节点（数组容器不计），以容纳真实配置树规模
  // （如地域树数千节点）；数组仍有每层长度上限与深度/对象总数兜底。
  if (!Array.isArray(value)) {
    budget.nodes++;
    if (budget.nodes > PGY_KOL_IPC_MAX_TOTAL_NODES) {
      return invalid(
        "too-many-nodes",
        `节点总数超过上限 ${PGY_KOL_IPC_MAX_TOTAL_NODES}`,
      );
    }
  }
  if (seen.has(value)) {
    return invalid("too-deep", "检测到循环引用，无法确定边界");
  }
  if (depth > PGY_KOL_IPC_MAX_DEPTH) {
    return invalid("too-deep", `嵌套深度超过上限 ${PGY_KOL_IPC_MAX_DEPTH}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > PGY_KOL_IPC_MAX_ARRAY_LENGTH) {
      return invalid(
        "array-too-long",
        `数组长度超过上限 ${PGY_KOL_IPC_MAX_ARRAY_LENGTH}`,
      );
    }
    for (const item of value) {
      const err = walk(item, depth + 1, seen, budget);
      if (err) {
        return err;
      }
    }
  } else {
    const keys = Object.keys(value);
    if (keys.length > PGY_KOL_IPC_MAX_FILTER_FIELDS) {
      return invalid(
        "too-many-fields",
        `对象键数超过上限 ${PGY_KOL_IPC_MAX_FILTER_FIELDS}`,
      );
    }
    for (const key of keys) {
      const child = value[key];
      // children 数组不计入节点深度：筛选树层级由节点对象自身计数，
      // 从而允许真实配置树（最深约 4 层节点）的非叶子节点选择。
      const childDepth = key === "children" ? depth : depth + 1;
      const err = walk(child, childDepth, seen, budget);
      if (err) {
        return err;
      }
    }
  }
  seen.delete(value);
  return null;
}
