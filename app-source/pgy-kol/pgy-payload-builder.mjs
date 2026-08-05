/**
 * 蒲公英“找博主”搜索 payload builder（第一阶段）。
 *
 * 职责：把前端筛选状态（filterState）转换为纯 JSON 搜索 payload。
 * 不包含任何网络/UI 逻辑；序列化规则完全来自 PgyFilterSchema 注册表。
 */

import { randomUUID } from "node:crypto";

export const BASE_PAYLOAD = Object.freeze({
  searchType: 0,
  column: "comprehensiverank",
  sort: "desc",
  pageNum: 1,
  pageSize: 20,
});

export const DEFAULT_PAGE_SIZE = 20;

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
  build(filterState, { pageNum = 1, pageSize = DEFAULT_PAGE_SIZE, trackId } = {}) {
    if (filterState === null || typeof filterState !== "object" || Array.isArray(filterState)) {
      throw new PgyPayloadError("[pgy-payload-builder] filterState 必须是普通对象", {
        kind: "invalid-state",
      });
    }

    const payload = {
      ...BASE_PAYLOAD,
      pageNum,
      pageSize,
      trackId: trackId || this.trackIdFactory(),
    };

    // brandUserId 是特殊键：只在显式提供非空字符串时写入，绝不默认写入。
    if (Object.hasOwn(filterState, "brandUserId")) {
      const brandUserId = filterState.brandUserId;
      if (typeof brandUserId === "string" && brandUserId.trim().length > 0) {
        payload.brandUserId = brandUserId;
      }
    }

    for (const [key, value] of Object.entries(filterState)) {
      if (key === "brandUserId") {
        continue;
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
      const field = this.schema.getField(key);
      if (!field) {
        throw new PgyPayloadError(`[pgy-payload-builder] 未知筛选字段: ${key}`, {
          kind: "unknown-field",
        });
      }
      payload[key] = this.schema.serialize({ payloadField: key, value });
    }

    return payload;
  }
}
