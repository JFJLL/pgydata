/**
 * 蒲公英“找博主”动态筛选配置规范化模块（第一阶段）。
 *
 * 职责：
 * - 字段注册表（FIELD_REGISTRY）：哪些筛选字段存在、如何序列化、是否可作为互斥切分维度。
 * - 动态配置结构校验 + 规范化（同 label 不同 value/path 的节点全部保留）。
 * - last-known-good（LKG）快照存储：线上配置不可用或结构异常时回退。
 * - 按注册表 serializer 把前端筛选值转换为搜索 payload 值。
 *
 * 纯 ESM，只依赖 node 内置模块，禁止 import electron。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PgySessionRequest } from "./pgy-session-request.mjs";

/**
 * 蒲公英 API 源。
 *
 * 优先从统一请求层模块（pgy-session-request.mjs）读取 PGY_ORIGIN；
 * 该模块由主代理/其它子代理负责，尚未就绪时这里定义同名常量作为默认值
 * （与搜索页同源 pgy.xiaohongshu.com 一致）。一旦统一请求层落地并导出
 * PGY_ORIGIN，本模块会自动切换为其值，无需改业务代码。
 * 注：industryTags 的完整端点仍指向 edith.xiaohongshu.com（Phase 1 未实现加载）。
 */
let PGY_ORIGIN = "https://pgy.xiaohongshu.com";
try {
  const sessionRequestModule = await import("./pgy-session-request.mjs");
  if (
    sessionRequestModule &&
    typeof sessionRequestModule.PGY_ORIGIN === "string" &&
    sessionRequestModule.PGY_ORIGIN.length > 0
  ) {
    PGY_ORIGIN = sessionRequestModule.PGY_ORIGIN;
  }
} catch {
  // 统一请求层尚未就绪（或在纯 node 测试环境无法加载 electron 依赖）：
  // 保持默认源，不影响本模块的纯函数能力。
}

export const SCHEMA_VERSION = "pgy-filter-schema/1.0.0";

export const PROVIDER_ENDPOINTS = Object.freeze({
  kolTagsV2: "/api/solar/kol/get_select_kol_tags_config_v2",
  areas: "/api/solar/area/get_areas?type=2",
  contentTagTree: "/api/solar/cooperator/content/tag_tree",
  industryTags: "https://edith.xiaohongshu.com/api/pgy/kol/get_industry_tag",
  consumeBehavior: "/api/pgy/kol/consume_behavior",
  brandSearch: "/api/solar/brand/search_brand",
  activities: "/api/solar/cooperator/get_all_activities",
});

/**
 * get_select_kol_tags_config_v2 内的节（section）到 payloadField 的映射。
 * 键是接口返回的节名，值是 FIELD_REGISTRY 中的 payloadField。
 */
export const KOL_TAGS_V2_SECTIONS = Object.freeze({
  automotiveIndustryTag: "industrySpecificCrowdsMotorDom",
  audience20: "top20CrowdsLabel",
  contentTheme: "contentThemeLabel",
});

function freezeRegistryEntry(entry) {
  if (entry.optionProvider !== undefined) {
    entry.optionProvider = Object.freeze({ ...entry.optionProvider });
  }
  return Object.freeze(entry);
}

/**
 * 筛选字段注册表。
 *
 * exclusive 语义：
 * - true      = 已证明可作互斥切分维度（如数值范围）。
 * - false     = 多值或 lossy 不可切分（lossy 项附加 reason: "lossy"）。
 * - "unproven" = 尚未证明枚举覆盖，不可用于切分。
 */
export const FIELD_REGISTRY = Object.freeze([
  freezeRegistryEntry({ payloadField: "marketTarget", label: "投放目标", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "audienceGroup", label: "人群分组", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "personalTags", label: "个人标签", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "gender", label: "性别", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "location", label: "博主地域", controlType: "tree-single", multiSelect: "single", exclusive: "candidate", serializer: "path-trim", defaultValue: null, optionProvider: { provider: "areas" } }),
  freezeRegistryEntry({ payloadField: "signed", label: "签约状态", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "featureTags", label: "特色标签", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansNumberLower", label: "粉丝数下限", controlType: "range-int", multiSelect: "single", exclusive: true, serializer: "passthrough", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "fansNumberUpper", label: "粉丝数上限", controlType: "range-int", multiSelect: "single", exclusive: true, serializer: "passthrough", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "fansAge", label: "粉丝年龄", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "fansGender", label: "粉丝性别", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "fansLocation", label: "粉丝地域", controlType: "tree-single", multiSelect: "single", exclusive: "candidate", serializer: "path-trim", defaultValue: null, optionProvider: { provider: "areas" } }),
  freezeRegistryEntry({ payloadField: "fansMaritalStatus", label: "粉丝婚姻状况", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "fansConsumptionLevel", label: "粉丝消费水平", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "fansChildAgeInfo", label: "粉丝孩子年龄", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansDevicePrice", label: "粉丝设备价格", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansDeviceBrand", label: "粉丝设备品牌", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "accumCommonImpMedinNum30d", label: "近30天平均播放中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "readMidNor30", label: "近30天阅读中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "interMidNor30", label: "近30天互动中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "thousandLikePercent30", label: "近30天千赞率", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "noteType", label: "笔记类型", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "notePriceLower", label: "图文报价下限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "passthrough", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "notePriceUpper", label: "图文报价上限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "passthrough", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "videoPriceLower", label: "视频报价下限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "passthrough", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "videoPriceUpper", label: "视频报价上限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "passthrough", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "progressOrderCnt", label: "历史合作数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "tradeReportBrandIdSet", label: "合作品牌", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "activityCodes", label: "合作活动", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "flagList", label: "标签筛选", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "filterList", label: "更多筛选", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "contentSceneLabel", label: "内容场景", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "industrySpecificCrowdsMotorDom", label: "行业特色画像", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "flatten-leaf-values", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "automotiveIndustryTag" } }),
  freezeRegistryEntry({ payloadField: "top20CrowdsLabel", label: "二十大人群", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "top20-transform", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "audience20" } }),
  freezeRegistryEntry({ payloadField: "contentThemeLabel", label: "内容题材", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "path-space", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "contentTheme" } }),
  freezeRegistryEntry({ payloadField: "kolInfoConsumBehaviorLabel", label: "预估消费行为", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "path-or-label", defaultValue: [], optionProvider: { provider: "consumeBehavior" } }),
]);

const SCHEMA_ERROR_KINDS = new Set([
  "unknown-structure",
  "provider",
  "missing-lkg",
  "serializer",
  "unknown-field",
  "not-implemented",
]);

export class PgySchemaError extends Error {
  /**
   * @param {string} message
   * @param {{ kind?: string, cause?: unknown }} [options]
   */
  constructor(message, { kind, cause } = {}) {
    // 兜底脱敏：不依赖请求层是否已脱敏。
    super(PgySessionRequest.redactText(String(message)), cause !== undefined ? { cause } : undefined);
    this.name = "PgySchemaError";
    this.kind = SCHEMA_ERROR_KINDS.has(kind) ? kind : undefined;
  }
}

/**
 * 创建 last-known-good 快照存储。
 *
 * 文件命名 lkg-${providerKey}.json；save 采用 tmp + rename 原子写；
 * load 在文件缺失、JSON 损坏或结构不符时返回 null。
 * 本存储只读写 LKG 快照文件，绝不接触任何凭据/请求头。
 *
 * @param {{ baseDir: string }} options
 */
export function createJsonLkgStore({ baseDir }) {
  if (!baseDir || typeof baseDir !== "string") {
    throw new TypeError("[pgy-filter-schema] createJsonLkgStore 需要 baseDir");
  }
  const filePathFor = (providerKey) => path.join(baseDir, `lkg-${providerKey}.json`);

  return {
    async load(providerKey) {
      try {
        const text = await fs.readFile(filePathFor(providerKey), "utf8");
        const snapshot = JSON.parse(text);
        if (
          snapshot === null ||
          typeof snapshot !== "object" ||
          Array.isArray(snapshot) ||
          snapshot.version !== SCHEMA_VERSION ||
          snapshot.provider !== providerKey ||
          !Array.isArray(snapshot.nodes)
        ) {
          return null;
        }
        return snapshot;
      } catch {
        return null;
      }
    },

    async save(providerKey, snapshot) {
      await fs.mkdir(baseDir, { recursive: true });
      const filePath = filePathFor(providerKey);
      const tmpPath = `${filePath}.tmp-${randomUUID()}`;
      await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(tmpPath, filePath);
    },

    async remove(providerKey) {
      await fs.rm(filePathFor(providerKey), { force: true });
    },
  };
}

export class PgyFilterSchema {
  /**
   * @param {{ request: { requestJson: (opts: object) => Promise<unknown> }, lkgStore?: object | null }} options
   */
  constructor({ request, lkgStore }) {
    if (!request || typeof request.requestJson !== "function") {
      throw new TypeError("[pgy-filter-schema] request 必须提供 requestJson 方法");
    }
    this.request = request;
    this.lkgStore = lkgStore ?? null;
  }

  /** @returns {object | undefined} 注册表项 */
  getField(payloadField) {
    return FIELD_REGISTRY.find((entry) => entry.payloadField === payloadField);
  }

  /**
   * 把原始配置树规范化为统一节点结构。
   *
   * 每个节点：{ provider, payloadField, value, label, fullPath, children, disabled, rawVersion, uniqueKey }
   * - value 取 valueKey ?? labelKey ?? "name" 的字符串；
   * - label 取 labelKey ?? valueKey；
   * - fullPath = parentPath ? `${parentPath} > ${label}` : label；
   * - disabled 默认 false；
   * - uniqueKey = `${payloadField}:${value}:${fullPath}`，禁止只用 label 去重；
   * - 同 label 不同 value/path 的节点全部保留。
   *
   * @param {{ rawNodes: unknown[], payloadField: string, provider: string, valueKey?: string, labelKey?: string, childrenKey?: string, parentPath?: string }} options
   */
  normalizeOptionTree({
    rawNodes,
    payloadField,
    provider,
    valueKey = "value",
    labelKey = "label",
    childrenKey = "children",
    parentPath = "",
  }) {
    if (!Array.isArray(rawNodes)) {
      return [];
    }
    return rawNodes.map((raw, index) => {
      const rawValue = raw?.[valueKey] ?? raw?.[labelKey] ?? raw?.name;
      const rawLabel = raw?.[labelKey] ?? raw?.[valueKey];
      const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
      const label = rawLabel === undefined || rawLabel === null ? "" : String(rawLabel);
      const fullPath = parentPath ? `${parentPath} > ${label}` : label;
      const children = Array.isArray(raw?.[childrenKey])
        ? this.normalizeOptionTree({
            rawNodes: raw[childrenKey],
            payloadField,
            provider,
            valueKey,
            labelKey,
            childrenKey,
            parentPath: fullPath,
          })
        : [];
      return {
        provider,
        payloadField,
        value,
        label,
        fullPath,
        path: raw?.path === undefined || raw?.path === null ? fullPath : String(raw.path),
        children,
        disabled: Boolean(raw?.disabled),
        rawVersion: raw,
        // value 为空时用同级序号消歧，保证 uniqueKey 不塌缩（契约公式对非空 value 不变）。
        uniqueKey:
          value === ""
            ? `${payloadField}:<empty>#${index}:${fullPath}`
            : `${payloadField}:${value}:${fullPath}`,
      };
    });
  }

  /**
   * 叶子值数组：递归 children；无 children 即叶子；叶子值 = value ?? label ?? 原节点。
   *
   * @param {object | string | number} node
   * @returns {unknown[]}
   */
  flattenLeafValues(node) {
    const leaves = [];
    const walk = (current) => {
      if (current === null || current === undefined) {
        return;
      }
      if (typeof current !== "object") {
        leaves.push(current);
        return;
      }
      const children = Array.isArray(current.children) ? current.children : [];
      if (children.length === 0) {
        // 契约语义：value || label || 原值（falsy 值回退到下一级）。
        leaves.push(current.value || current.label || current);
        return;
      }
      for (const child of children) {
        walk(child);
      }
    };
    walk(node);
    return leaves;
  }

  /**
   * 校验线上配置结构。
   *
   * 通用要求：raw 是对象、raw.code === 0、raw.data 存在。
   * kolTagsV2：data 是对象且 KOL_TAGS_V2_SECTIONS 每节是数组、元素是对象。
   * consumeBehavior / contentTagTree / industryTags：data 是数组、元素是对象。
   * areas：data 是数组（或树根对象）。
   *
   * @param {unknown} raw
   * @param {string} provider
   * @returns {{ ok: boolean, errors: string[] }}
   */
  validateConfigStructure(raw, provider) {
    const errors = [];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push("raw 不是对象");
      return { ok: false, errors };
    }
    if (raw.code !== 0) {
      errors.push(`raw.code 期望 0，实际 ${JSON.stringify(raw.code)}`);
    }
    const data = raw.data;
    if (data === undefined || data === null) {
      errors.push("raw.data 缺失");
      return { ok: false, errors };
    }

    switch (provider) {
      case "kolTagsV2": {
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（kolTagsV2）");
          break;
        }
        for (const section of Object.keys(KOL_TAGS_V2_SECTIONS)) {
          const sectionValue = data[section];
          if (!Array.isArray(sectionValue)) {
            errors.push(`raw.data.${section} 期望数组`);
            continue;
          }
          sectionValue.forEach((element, index) => {
            if (element === null || typeof element !== "object" || Array.isArray(element)) {
              errors.push(`raw.data.${section}[${index}] 期望对象`);
            }
          });
        }
        break;
      }
      case "consumeBehavior": {
        // 线上真实形状（2026-08-05 真实响应实证）：data 是对象，根键 consumeBehaviorTag 为数组。
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（consumeBehavior，含 consumeBehaviorTag 数组）");
          break;
        }
        const tag = data.consumeBehaviorTag;
        if (!Array.isArray(tag)) {
          errors.push("raw.data.consumeBehaviorTag 期望数组");
          break;
        }
        tag.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data.consumeBehaviorTag[${index}] 期望对象`);
          }
        });
        break;
      }
      case "contentTagTree":
      case "industryTags": {
        if (!Array.isArray(data)) {
          errors.push("raw.data 期望数组");
          break;
        }
        data.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data[${index}] 期望对象`);
          }
        });
        break;
      }
      case "areas": {
        // 线上真实形状（2026-08-05 真实响应实证）：data 是对象，根键 list 为数组（国家/省/市/区树）。
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（areas，含 list 数组）");
          break;
        }
        const list = data.list;
        if (!Array.isArray(list)) {
          errors.push("raw.data.list 期望数组");
          break;
        }
        list.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data.list[${index}] 期望对象`);
          }
        });
        break;
      }
      default:
        errors.push(`未知 provider: ${String(provider)}`);
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * 线上 get_areas / consume_behavior 不返回空格连接 path，而官网 Payload 契约为空格连接
   * （如 "中国 广东 广州"、"内容行为预估 汽车 预估车主作者 Porsche 保时捷911"）。
   * 仅当节点 path 等于 fullPath（即线上无独立 path，path 由规范化派生）时按 fullPath
   * 空格化；显式 path（如测试 fixture 提供）保留原样。
   *
   * @param {object[]} nodes
   * @returns {object[]}
   */
  deriveSpacePaths(nodes) {
    const walk = (list) => {
      for (const node of list) {
        if (node !== null && typeof node === "object") {
          if (node.path === node.fullPath) {
            node.path = String(node.fullPath).replace(/\s*>\s*/g, " ").trim();
          }
          if (Array.isArray(node.children)) {
            walk(node.children);
          }
        }
      }
      return list;
    };
    return walk(nodes);
  }

  /**
   * 按注册表 serializer 转换筛选值。
   *
   * @param {{ payloadField: string, value: unknown }} input
   * @returns {unknown}
   */
  serialize({ payloadField, value }) {
    const field = this.getField(payloadField);
    if (!field) {
      throw new PgySchemaError(`[pgy-filter-schema] 未注册字段: ${payloadField}`, { kind: "unknown-field" });
    }
    switch (field.serializer) {
      case "passthrough":
        return value;
      case "flatten-leaf-values": {
        const nodes = Array.isArray(value) ? value : [value];
        return nodes.flatMap((node) => this.flattenLeafValues(node));
      }
      case "path-or-label": {
        const transform = (node) => node?.path || node?.label || node;
        return Array.isArray(value) ? value.map(transform) : transform(value);
      }
      case "path-trim": {
        const trim = (node) =>
          typeof node === "string"
            ? node.trim()
            : String(node?.path ?? node?.fullPath ?? node?.label ?? "").trim();
        return Array.isArray(value) ? value.map(trim) : trim(value);
      }
      case "path-space": {
        // 官网契约（2026-08-05 真实会话实证）：内容题材发送空格连接的全路径字符串，
        // 如 ["汽车特色 沉浸式开车"]；" > " 分隔的 fullPath 统一转换为空格连接。
        const toSpacePath = (node) => {
          if (typeof node === "string") {
            return node.trim();
          }
          const raw = node?.path || node?.fullPath || node?.label || String(node);
          return String(raw).replace(/\s*>\s*/g, " ").trim();
        };
        return Array.isArray(value) ? value.map(toSpacePath) : toSpacePath(value);
      }
      case "top20-transform": {
        if (!Array.isArray(value)) {
          throw new PgySchemaError("[pgy-filter-schema] top20-transform 需要字符串数组", { kind: "serializer" });
        }
        // 官网契约（2026-08-05 真实会话实证）：选中项按空格分词，>=2 段时
        // 生成 `${首段} ${首段}-${其余段}`，例如 "自在户外 挑战极限者" →
        // "自在户外 自在户外-挑战极限者"。
        const officialTransform = (text) => {
          const parts = text.split(/\s+/);
          return parts.length >= 2
            ? `${parts[0]} ${parts[0]}-${parts.slice(1).join(" ")}`
            : text;
        };
        return value.map((item) => {
          if (item !== null && typeof item === "object") {
            // 父节点（含 children）只负责展开，不得作为最终 Payload 值：
            // 显式拒绝，避免把父级标签误发到官网。
            if (Array.isArray(item.children) && item.children.length > 0) {
              throw new PgySchemaError(
                "[pgy-filter-schema] top20 父节点不能直接作为 Payload 值，请选择叶子",
                { kind: "serializer" },
              );
            }
            // 两层树叶子：空格连接全路径后套官网变换。真实 audience20 叶子为纯名
            // （G5 实证："自在户外 > 挑战极限者" → "自在户外 挑战极限者" → 官网变换 →
            // "自在户外 自在户外-挑战极限者"）。注意：若叶子 label 已带父前缀
            // （"自在户外-挑战极限者"），变换会对两段文本再次拼前缀产生双重前缀，
            // 因此不得以带父前缀的 label 构造节点。
            const pathText = String(item.path ?? item.fullPath ?? item.label ?? item)
              .replace(/\s*>\s*/g, " ")
              .trim();
            return officialTransform(pathText);
          }
          return officialTransform(String(item));
        });
      }
      default:
        throw new PgySchemaError(
          `[pgy-filter-schema] 未知 serializer: ${field.serializer}（字段 ${payloadField}）`,
          { kind: "serializer" },
        );
    }
  }

  /**
   * 拉取并规范化动态配置，带 last-known-good 回退。
   *
   * 支持 provider：kolTagsV2（需 section）、consumeBehavior、areas；
   * 其它 provider 第一阶段明确失败（not-implemented），不做猜测。
   *
   * @param {{ provider: string, section?: string, session?: unknown, timeoutMs?: number }} options
   * @returns {Promise<{ source: "live" | "lkg", version: string, nodes: object[], warning?: string }>}
   */
  async loadOptions({ provider, section, session, timeoutMs } = {}) {
    switch (provider) {
      case "kolTagsV2": {
        const payloadField = KOL_TAGS_V2_SECTIONS[section];
        if (!payloadField) {
          throw new PgySchemaError(
            `[pgy-filter-schema] 未知 kolTagsV2 section: ${section}`,
            { kind: "unknown-structure" },
          );
        }
        return this._loadWithFallback({
          provider,
          // 三个 section 必须各自独立快照：并行加载时最后一次 save 不得覆盖其它
          // section，回退时也不得拿到错误 section 的配置树。
          lkgKey: `kolTagsV2.${section}`,
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.kolTagsV2}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "kolTagsV2"),
          normalize: (raw) =>
            this.normalizeOptionTree({
              rawNodes: raw.data[section],
              payloadField,
              provider: "kolTagsV2",
            }),
        });
      }
      case "consumeBehavior":
        return this._loadWithFallback({
          provider,
          lkgKey: "consumeBehavior",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.consumeBehavior}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "consumeBehavior"),
          normalize: (raw) =>
            this.deriveSpacePaths(
              this.normalizeOptionTree({
                rawNodes: raw.data.consumeBehaviorTag,
                payloadField: "kolInfoConsumBehaviorLabel",
                provider: "consumeBehavior",
              }),
            ),
        });
      case "areas":
        return this._loadWithFallback({
          provider,
          lkgKey: "areas",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.areas}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "areas"),
          normalize: (raw) => {
            return this.deriveSpacePaths(
              this.normalizeOptionTree({
                rawNodes: raw.data.list,
                payloadField: "location",
                provider: "areas",
                valueKey: "name",
                labelKey: "name",
              }),
            );
          },
        });
      default:
        throw new PgySchemaError(
          `[pgy-filter-schema] provider 未实现: ${provider}`,
          { kind: "not-implemented" },
        );
    }
  }

  async _loadWithFallback({ provider, lkgKey, url, session, timeoutMs, validate, normalize }) {
    let raw;
    try {
      raw = await this._requestJson({ url, session, timeoutMs });
    } catch (err) {
      if (err && (err.kind === "auth-expired" || err.kind === "risk-control")) {
        // 登录失效/风控是会话问题而非配置变化，不得用 last-known-good 掩盖。
        throw new PgySchemaError(
          `[pgy-filter-schema] ${provider} 鉴权/风控错误，不回退 last-known-good：${err?.message ?? err}`,
          { kind: "provider", cause: err },
        );
      }
      const snapshot = await this._loadLkg(lkgKey);
      if (snapshot) {
        return this._lkgResult(snapshot, lkgKey);
      }
      throw new PgySchemaError(
        `[pgy-filter-schema] ${provider} 线上请求失败: ${err?.message ?? err}`,
        { kind: "provider", cause: err },
      );
    }

    const check = validate(raw);
    if (!check.ok) {
      const snapshot = await this._loadLkg(lkgKey);
      if (snapshot) {
        return this._lkgResult(snapshot, lkgKey);
      }
      throw new PgySchemaError(
        `[pgy-filter-schema] ${provider} 配置结构异常: ${check.errors.join("；")}`,
        { kind: "unknown-structure" },
      );
    }

    const nodes = normalize(raw);
    if (this.lkgStore) {
      try {
        await this.lkgStore.save(lkgKey, {
          version: SCHEMA_VERSION,
          provider: lkgKey,
          savedAt: new Date().toISOString(),
          nodes,
        });
      } catch (saveError) {
        // LKG 快照保存失败只降级为“本次不保存”，不阻断线上结果。
        return {
          source: "live",
          version: SCHEMA_VERSION,
          nodes,
          warning: `[pgy-filter-schema] ${provider} LKG 快照保存失败，继续使用线上结果（${PgySessionRequest.redactText(String(saveError?.message ?? saveError))}）`,
        };
      }
    }
    return { source: "live", version: SCHEMA_VERSION, nodes };
  }

  async _requestJson({ url, session, timeoutMs }) {
    // 与现有统一请求层约定保持一致：requestJson({ url, method, session, timeoutMs })，
    // 未传的字段不写入 options。
    const options = { url, method: "GET" };
    if (session !== undefined) {
      options.session = session;
    }
    if (timeoutMs !== undefined) {
      options.timeoutMs = timeoutMs;
    }
    return this.request.requestJson(options);
  }

  async _loadLkg(providerKey) {
    if (!this.lkgStore) {
      return null;
    }
    try {
      return await this.lkgStore.load(providerKey);
    } catch {
      return null;
    }
  }

  _lkgResult(snapshot, providerKey) {
    return {
      source: "lkg",
      version: snapshot.version ?? SCHEMA_VERSION,
      nodes: Array.isArray(snapshot.nodes) ? snapshot.nodes : [],
      warning: `[pgy-filter-schema] ${providerKey} 线上配置不可用，已回退 last-known-good 快照（savedAt=${snapshot.savedAt ?? "unknown"}）`,
    };
  }
}
