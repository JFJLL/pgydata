/**
 * 蒲公英“找博主”IPC 输入边界守卫（第二阶段）。
 *
 * 职责：在 ipc handler 入口对渲染进程输入做确定性校验，任何异常输入
 * 都以 { ok:false, error:{ code, message } } 拒绝，不携带 URL/任意字符串透传。
 *
 * 纯 ESM，只依赖 Node 内置能力，不 import electron、不发起网络请求。
 */

// 深度只累计非 children 容器：filterState(1) + 字段数组(1) + 树节点层级。
// 官网行业画像树最深约 4 层节点（depth 3-6），预留余量取 8。
export const PGY_KOL_IPC_MAX_DEPTH = 8;
export const PGY_KOL_IPC_MAX_ARRAY_LENGTH = 200;
export const PGY_KOL_IPC_MAX_STRING_LENGTH = 512;
export const PGY_KOL_IPC_MAX_FILTER_FIELDS = 64;
export const PGY_KOL_IPC_MAX_TOTAL_NODES = 5000;

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
