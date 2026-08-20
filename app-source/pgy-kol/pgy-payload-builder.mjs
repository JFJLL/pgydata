/**
 * 蒲公英“找博主”搜索 payload builder（第一阶段）。
 *
 * 职责：把前端筛选状态（filterState）转换为纯 JSON 搜索 payload。
 * 不包含任何网络/UI 逻辑；序列化规则完全来自 PgyFilterSchema 注册表。
 */

import { randomUUID } from "node:crypto";

export const BASE_PAYLOAD = Object.freeze({
  // 官网契约（2026-08-05 真实登录会话实证，phase2-online-compare/evidence.json G1-G10）：
  // searchType 恒为 1，且默认查询携带全套默认字段（tradeType/flagList 等）。
  searchType: 1,
  column: "comprehensiverank",
  sort: "desc",
  pageNum: 1,
  pageSize: 20,
  marketTarget: null,
  audienceGroup: [],
  personalTags: [],
  gender: null,
  location: null,
  signed: -1,
  featureTags: [],
  fansAge: 0,
  fansGender: 0,
  fansLocation: null,
  fansMaritalStatus: -1,
  fansConsumptionLevel: -1,
  fansChildAgeInfo: [],
  fansDevicePrice: [],
  fansDeviceBrand: [],
  accumCommonImpMedinNum30d: [],
  readMidNor30: [],
  interMidNor30: [],
  thousandLikePercent30: [],
  noteType: 0,
  progressOrderCnt: [],
  tradeType: "不限",
  tradeReportBrandIdSet: [],
  excludedTradeReportBrandId: false,
  estimateCpuv30d: [],
  inStar: 0,
  firstIndustry: "",
  secondIndustry: "",
  newHighQuality: 0,
  filterIntention: false,
  flagList: [
    { flagType: "HAS_BRAND_COOP_BUYER_AUTH", flagValue: "0" },
    { flagType: "IS_HIGH_QUALITY", flagValue: "0" },
  ],
  activityCodes: [],
  excludeLowActive: false,
  fansNumUp: 0,
  excludedTradeReportBrand: false,
  excludedTradeInviteReportBrand: false,
  filterList: [],
  contentSceneLabel: [],
});

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// 官方排序字段名称映射（前端/注册表规范键 → 官网 v2 接口接收的 column 键名）
export const SORT_COLUMN_MAP = Object.freeze({
  fansNum: "fansCount",
  fansCount: "fansCount",
  readMidNor30: "clickNum",
  clickNum: "clickNum",
  clickMidNum: "clickNum",
  interMidNor30: "mEngagementNum",
  mEngagementNum: "mEngagementNum",
  interMidNum: "mEngagementNum",
  fansRiseNum: "fans30GrowthRate",
  fans30GrowthRate: "fans30GrowthRate",
});

// Phase 5 特殊键：不经过 FIELD_REGISTRY，由 builder 直接处理。
// - searchType：0=搜昵称，1=搜笔记（官网契约；缺省沿用 BASE_PAYLOAD 的 1）。
// - keyword：搜索关键词（搜笔记/搜昵称）；空串/纯空白视为未提供。
// - trackId：搜索上下文（track 接口返回后进入 /v2 的同一 payload）。
// - userId：历史前端可能把“博主 UID”导出字段混入 filterState；它不是搜索
//   条件，必须在此边界丢弃，绝不可作为未声明字段发送到官网接口。
export const PAYLOAD_SPECIAL_KEYS = Object.freeze(["searchType", "keyword", "trackId", "column", "sort", "maxCount", "columns", "userId"]);

const KEYWORD_MAX_LENGTH = 200;

export class PgyPayloadError extends Error {
  /**
   * @param {string} message
   * @param {{ kind?: "unknown-field" | "invalid-state", cause?: unknown }} [options]
   */
  constructor(message, { kind, cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "PgyPayloadError";
    this.kind = kind;
  }
}

export class PgyPayloadBuilder {
  /**
   * @param {{ schema: object, trackIdFactory?: () => string }} options
   *   schema 必须是 PgyFilterSchema 实例（提供 getField/serialize）。
   */
  constructor({ schema, trackIdFactory } = {}) {
    if (
      !schema ||
      typeof schema.getField !== "function" ||
      typeof schema.serialize !== "function"
    ) {
      throw new TypeError("[pgy-payload-builder] schema 必须提供 getField/serialize");
    }
    this.schema = schema;
    this.trackIdFactory = trackIdFactory ?? (() => randomUUID());
  }

  /**
   * 构建搜索 payload。
   *
   * 规则：
   * 1. 基础 = BASE_PAYLOAD + pageNum/pageSize/trackId。
   * 2. filterState 必须是普通对象；逐键处理：键必须在 FIELD_REGISTRY 中，
   *    null/undefined/""/[] 跳过；否则按 serializer 写入。
   * 3. 范围对各自独立写入，只写非空的。
   * 4. brandUserId 仅当为非空字符串时写入，绝不默认写入。
   * 5. 相同输入 + 相同 trackId → 输出深相等（键序稳定）。
   *
   * @param {object} filterState
   * @param {{ pageNum?: number, pageSize?: number, trackId?: string }} [options]
   * @returns {object} 纯 JSON payload
   */
  build(filterState, options = {}) {
    if (filterState === null || typeof filterState !== "object" || Array.isArray(filterState)) {
      throw new PgyPayloadError("[pgy-payload-builder] filterState 必须是普通对象", {
        kind: "invalid-state",
      });
    }

    const pageNum = normalizePageValue(options.pageNum, 1, "pageNum");
    const pageSize = normalizePageValue(options.pageSize, DEFAULT_PAGE_SIZE, "pageSize");
    if (pageSize > MAX_PAGE_SIZE) {
      throw new PgyPayloadError(
        `[pgy-payload-builder] pageSize 超过上限 ${MAX_PAGE_SIZE}`,
        { kind: "invalid-state" },
      );
    }

    const payload = {
      ...BASE_PAYLOAD,
      // 每次构建必须使用全新数组：BASE_PAYLOAD 只做浅冻结，若直接复用其
      // filterList/flagList 引用，filter-list-entry 的 push 会跨构建累积
      // （同一进程内多次搜索/预览时旧筛选残留进新 payload）。
      filterList: [],
      flagList: (BASE_PAYLOAD.flagList || []).map((flag) => ({ ...flag })),
      pageNum,
      pageSize,
      trackId:
        options.trackId ||
        (typeof filterState.trackId === "string" && filterState.trackId.trim().length > 0
          ? filterState.trackId.trim()
          : this.trackIdFactory()),
    };

    // Phase 5 搜索模式/关键词/搜索上下文（特殊键优先于 BASE_PAYLOAD 默认值）。
    if (Object.hasOwn(filterState, "searchType")) {
      const searchType = filterState.searchType;
      if (searchType !== 0 && searchType !== 1) {
        throw new PgyPayloadError(
          `[pgy-payload-builder] searchType 必须是 0 或 1（收到 ${String(searchType)}）`,
          { kind: "invalid-state" },
        );
      }
      payload.searchType = searchType;
    }
    if (Object.hasOwn(filterState, "keyword")) {
      const keyword = typeof filterState.keyword === "string" ? filterState.keyword.trim() : "";
      if (keyword.length > KEYWORD_MAX_LENGTH) {
        throw new PgyPayloadError(
          `[pgy-payload-builder] keyword 长度超过上限 ${KEYWORD_MAX_LENGTH}`,
          { kind: "invalid-state" },
        );
      }
      if (keyword.length > 0) {
        payload.keyword = keyword;
      }
    }
    if (Object.hasOwn(filterState, "column")) {
      const col = typeof filterState.column === "string" ? filterState.column.trim() : "";
      if (col.length > 0) {
        payload.column = SORT_COLUMN_MAP[col] || col;
      }
    }
    if (Object.hasOwn(filterState, "sort")) {
      const sortOrder = filterState.sort;
      if (sortOrder === "desc" || sortOrder === "asc") {
        payload.sort = sortOrder;
      }
    }
    // brandUserId 是特殊键：只在显式提供非空字符串时写入，绝不默认写入。
    if (Object.hasOwn(filterState, "brandUserId")) {
      const brandUserId = filterState.brandUserId;
      if (typeof brandUserId === "string" && brandUserId.trim().length > 0) {
        payload.brandUserId = brandUserId.trim();
      }
    }

    for (const [key, value] of Object.entries(filterState)) {
      if (key === "brandUserId" || PAYLOAD_SPECIAL_KEYS.includes(key)) {
        continue;
      }
      // 未知字段无论值是否为空都必须显式报错，禁止空值绕过契约检查。
      // Phase 5.1：按 payload 字段名或前端状态键（uiKey）解析，映射单一权威来源。
      const field = this.schema.getFieldByStateKey(key);
      if (!field) {
        throw new PgyPayloadError(`[pgy-payload-builder] 未知筛选字段: ${key}`, {
          kind: "unknown-field",
        });
      }
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0)
      ) {
        continue;
      }
      // Phase 5 门控：未实证字段禁止进入真实 payload（预览经 allowUnproven 豁免）。
      if (field.payloadProven === false && options.allowUnproven !== true) {
        throw new PgyPayloadError(
          `[pgy-payload-builder] 字段 ${key} 尚未经官网真实流量实证，暂不可发送（待最小流量验收后启用）`,
          { kind: "unproven-field" },
        );
      }
      const serialized = this.schema.serialize({ payloadField: field.payloadField, value });
      if (field.serializer === "filter-list-entry") {
        // 直播数据：多个字段共享 filterList 数组（官网 filterList 契约）。
        payload.filterList = Array.isArray(payload.filterList) ? payload.filterList : [];
        payload.filterList.push(serialized);
        continue;
      }
      if (field.serializer === "flag-entry") {
        // 精选博主：flagList 结构化合并（保留默认双 flag，按 flagType 覆盖）。
        const flags = Array.isArray(payload.flagList) ? payload.flagList : [];
        const index = flags.findIndex((flag) => flag.flagType === serialized.flagType);
        const next = flags.slice();
        if (index >= 0) {
          // 原位替换：保持默认 flagList 顺序稳定（可复现输出）。
          next[index] = serialized;
        } else {
          next.push(serialized);
        }
        payload.flagList = next;
        continue;
      }
      payload[field.payloadField] = serialized;
    }

    return payload;
  }
}

/**
 * 分页参数归一化：undefined/null 回落默认值；其余必须是正整数，
 * 否则抛 PgyPayloadError kind=invalid-state，避免 NaN/小数/负数/字符串穿透到 payload。
 */
function normalizePageValue(value, fallback, label) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  throw new PgyPayloadError(
    `[pgy-payload-builder] ${label} 必须是正整数（收到 ${String(value)}）`,
    { kind: "invalid-state" },
  );
}
