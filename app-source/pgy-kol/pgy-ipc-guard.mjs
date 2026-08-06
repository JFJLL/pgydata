/**
 * 蒲公英“找博主”IPC 输入边界守卫（第二阶段）。
 *
 * 职责：在 ipc handler 入口对渲染进程输入做确定性校验，任何异常输入
 * 都以 { ok:false, error:{ code, message } } 拒绝，不携带 URL/任意字符串透传。
 *
 * 纯 ESM，只依赖 Node 内置能力，不 import electron、不发起网络请求。
 */

import { listPgyKolConfirmedColumns } from "./pgy-kol-column-registry.mjs";

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
export const PGY_KOL_BATCH_PAGE_SIZE_LIMIT = 100;

// 任务 ID 与 collection-history-store 同口径：字母数字开头、1-96 字符、
// 只允许 [A-Za-z0-9_-]，并拒绝 Windows 保留名（路径穿越与命名冲突防护）。
export const PGY_KOL_TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const WINDOWS_RESERVED_TASK_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// config 通道 provider 白名单：只允许这三类，且 section 规则各不相同。
// kolTagsV2：section 必填且只能是三个已确认节；consumeBehavior/areas：section 必须省略。
export const PGY_KOL_CONFIG_SECTIONS = Object.freeze(
  Object.freeze(["automotiveIndustryTag", "audience20", "contentTheme"]),
);
export const PGY_KOL_CONFIG_PROVIDERS = Object.freeze(["kolTagsV2", "consumeBehavior", "areas"]);

const MAX_CONFIG_FIELD_LENGTH = 64;

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
 * 校验批量采集启动请求 { filterState, columns, pageSize?, budgets? }。
 *
 * - filterState 复用现有筛选状态边界校验；
 * - columns 必须是 1-64 项字符串数组、无重复、每项 1-64 字符，
 *   且每一项都必须命中列注册表的 confirmed 白名单（未证实字段继续隔离）；
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

  const columns = input.columns;
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > PGY_KOL_BATCH_MAX_COLUMNS) {
    return invalid(
      "invalid-columns",
      `columns 必须是 1-${PGY_KOL_BATCH_MAX_COLUMNS} 项的数组`,
    );
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

  const value = { filterState: filterCheck.value, columns };
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

  const BUDGET_LIMITS = Object.freeze({
    maxLeaves: 64,
    maxDepth: 10,
    maxPagesPerLeaf: 250,
    queryBudget: 1000,
  });
  if (input.budgets !== undefined && input.budgets !== null) {
    if (!isRecord(input.budgets)) {
      return invalid("invalid-budgets", "budgets 必须是普通对象");
    }
    const budgets = {};
    for (const key of Object.keys(BUDGET_LIMITS)) {
      const raw = input.budgets[key];
      if (raw === undefined || raw === null) {
        continue;
      }
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > BUDGET_LIMITS[key]) {
        return invalid("invalid-budgets", `budgets.${key} 必须是 1-${BUDGET_LIMITS[key]} 的整数`);
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
