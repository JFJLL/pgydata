// magiorix 蒲公英 KOL 搜索客户端（第一阶段）
//
// 职责：
// - 只做单页搜索请求与响应脱敏，不承担完整性规划（完整性规划见 pgy-pagination-planner.mjs）。
// - 5000 触顶信号：total >= 5000，或第 250 页仍满页时置 capped；exactTotalNotProven 恒为 true，
//   即“触顶”只是“可能触顶”，不等于总数恰好 5000。
// - 未知响应字段一律进入 quarantinedFields 隔离清单，绝不进入 kols 展示列。
//
// 本模块只依赖 Node 内置模块；生产统一请求层通过 request.requestJson 注入。
// 注：PGY_ORIGIN / PgyRequestError 优先复用 pgy-session-request.mjs 的导出；
// 该模块尚未就绪时，本文件自行提供同名回退值（见下方说明），错误判定统一按 err.kind duck-typing。

import { randomUUID } from "node:crypto";

export const KOL_SEARCH_ENDPOINT = "/api/solar/cooperator/blogger/v2";
export const KOL_WINDOW_TOTAL = 5000;
export const KOL_WINDOW_MAX_PAGE = 250;

const KOL_SEARCH_REFERER = "https://pgy.xiaohongshu.com/solar/pre-trade/note/kol";
const KOL_PAGE_SIZE_DEFAULT = 20;

// KNOWN_KOL_FIELDS：人工审核过的安全展示白名单。
// 响应中任何不在本清单内的字段都属于未知字段，必须进入 quarantinedFields 隔离，不得自动成为展示列。
export const KNOWN_KOL_FIELDS = Object.freeze([
  "userId",
  "nickname",
  "fansNum",
  "fansActiveIn28dLv",
  "readMidNor30",
  "interMidNor30",
  "picturePrice",
  "videoPrice",
  "location",
  "gender",
  "contentTags",
  "personalTags",
  "featureTags",
  "avatar",
  "redId",
  "currentLevel",
  "liveSign",
  "fansCount",
  "fansNumTrend",
  "noteNumber30",
  "hundredLikePercent30",
  "thousandLikePercent30",
  "readMedian30",
  "interactionRate30",
  "fansActiveIn28d",
  "fansActiveIn28dNum",
  "fansCpuvNum30d",
  "fansCpuv30d",
  "videoFullViewRate30",
  "picture3sViewRate30",
  "fansFemale",
  "fansMale",
  "fansProvinceChart",
  "fansCityChart",
]);

const KNOWN_KOL_FIELD_SET = new Set(KNOWN_KOL_FIELDS);

// PGY_ORIGIN 回退值（pgy-session-request.mjs 未就绪时使用，与 referer 同源）。
// pgy-session-request.mjs 就绪后，优先使用其导出的 PGY_ORIGIN。
let PGY_ORIGIN = "https://pgy.xiaohongshu.com";
let PgyRequestErrorCtor = null;
try {
  const sessionRequestModule = await import("./pgy-session-request.mjs");
  if (
    sessionRequestModule &&
    typeof sessionRequestModule.PGY_ORIGIN === "string" &&
    sessionRequestModule.PGY_ORIGIN.length > 0
  ) {
    PGY_ORIGIN = sessionRequestModule.PGY_ORIGIN;
  }
  if (sessionRequestModule && typeof sessionRequestModule.PgyRequestError === "function") {
    PgyRequestErrorCtor = sessionRequestModule.PgyRequestError;
  }
} catch {
  // pgy-session-request.mjs 尚未就绪或加载失败：保持上方回退值，错误统一按 err.kind 判定。
}

function createPgyRequestError(kind, message, pgyCode) {
  if (PgyRequestErrorCtor) {
    try {
      // pgy-session-request.mjs 的 PgyRequestError 采用 options 对象构造；
      // 无论构造签名如何，都强制 kind 与预期一致，保证调用方按 err.kind 判定。
      const err = new PgyRequestErrorCtor({ kind, message, pgyCode });
      if (err && typeof err === "object" && err.kind !== kind) {
        err.kind = kind;
      }
      return err;
    } catch {
      // 构造失败时回退到 duck-typing 错误对象
    }
  }
  const err = new Error(message);
  err.name = "PgyRequestError";
  err.kind = kind;
  if (pgyCode !== undefined) {
    err.pgyCode = pgyCode;
  }
  return err;
}

// 兼容两种 requestJson 返回形态：
// 1) 直接返回解析后的响应体 { code, data, msg }
// 2) 返回包装 { httpStatusCode?, status?, body: 响应体 }
function unwrapResponse(result) {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    if (Object.prototype.hasOwnProperty.call(result, "body")) {
      const inner = result.body;
      if (
        inner !== null &&
        typeof inner === "object" &&
        !Array.isArray(inner) &&
        (typeof inner.code !== "undefined" || typeof inner.data !== "undefined")
      ) {
        const httpStatusCode =
          typeof result.httpStatusCode === "number"
            ? result.httpStatusCode
            : typeof result.status === "number"
              ? result.status
              : undefined;
        return { raw: inner, httpStatusCode };
      }
    }
    const httpStatusCode =
      typeof result.httpStatusCode === "number"
        ? result.httpStatusCode
        : typeof result.status === "number"
          ? result.status
          : undefined;
    return { raw: result, httpStatusCode };
  }
  return { raw: result, httpStatusCode: undefined };
}

// 脱敏：只保留白名单键；未知键进入隔离清单（去重、排序）；userId 恒保留。
function sanitizeKols(kols) {
  const quarantined = new Set();
  const clean = kols.map((kol) => {
    if (kol === null || typeof kol !== "object" || Array.isArray(kol)) {
      throw createPgyRequestError(
        "invalid-response",
        "蒲公英搜索响应结构不合法（kols 中存在非对象条目）",
      );
    }
    const out = {};
    for (const key of Object.keys(kol)) {
      if (KNOWN_KOL_FIELD_SET.has(key)) {
        out[key] = kol[key];
      } else {
        quarantined.add(key);
      }
    }
    if (typeof kol.userId !== "undefined" && typeof out.userId === "undefined") {
      out.userId = kol.userId;
    }
    return out;
  });
  return { kols: clean, quarantinedFields: Array.from(quarantined).sort() };
}

// 本页去重 userId 数；缺失 userId 的不计入。
function countUniqueUids(kols) {
  const uids = new Set();
  for (const kol of kols) {
    const uid = kol.userId;
    if (typeof uid === "string" && uid.length > 0) {
      uids.add(uid);
    } else if (typeof uid === "number" && Number.isFinite(uid)) {
      uids.add(uid);
    }
  }
  return uids.size;
}

export class PgyKolSearchClient {
  constructor({ request }) {
    if (!request || typeof request.requestJson !== "function") {
      throw new TypeError("PgyKolSearchClient 需要 request.requestJson（统一请求层）");
    }
    this._request = request;
  }

  async searchPage({ payload, session, timeoutMs } = {}) {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload 必须为 object（可含 pageNum/pageSize/trackId）");
    }
    const startedAt = Date.now();
    const pageNum = typeof payload.pageNum === "number" ? payload.pageNum : 1;
    const pageSize = typeof payload.pageSize === "number" ? payload.pageSize : KOL_PAGE_SIZE_DEFAULT;
    const trackId =
      typeof payload.trackId === "string" && payload.trackId.length > 0
        ? payload.trackId
        : randomUUID();

    const requestOptions = {
      url: `${PGY_ORIGIN}${KOL_SEARCH_ENDPOINT}`,
      method: "POST",
      body: payload,
      referer: KOL_SEARCH_REFERER,
    };
    if (session !== undefined) {
      requestOptions.session = session;
    }
    if (timeoutMs !== undefined) {
      requestOptions.timeoutMs = timeoutMs;
    }

    // requestJson 对 401/461/902/非 0 code 会抛 PgyRequestError；这里原样向上抛，
    // 绝不 catch 后返回空列表。
    const result = await this._request.requestJson(requestOptions);
    const { raw, httpStatusCode } = unwrapResponse(result);

    // 纵深防御：request 层返回 wrapped 形态且携带 HTTP 状态码时，非 2xx 一律拒绝，
    // 即使 body.code=0（网关兜底）也不得伪装成成功列表。
    if (httpStatusCode !== undefined && httpStatusCode !== null) {
      const invalidStatus =
        typeof httpStatusCode !== "number" ||
        !Number.isFinite(httpStatusCode) ||
        httpStatusCode < 200 ||
        httpStatusCode >= 300;
      if (invalidStatus) {
        const kind =
          httpStatusCode === 401
            ? "auth-expired"
            : httpStatusCode === 461
              ? "risk-control"
              : "http";
        throw createPgyRequestError(
          kind,
          `蒲公英搜索请求失败: HTTP ${String(httpStatusCode)} (${kind})`,
        );
      }
    }

    if (
      raw === null ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      raw.data === null ||
      typeof raw.data !== "object" ||
      Array.isArray(raw.data) ||
      !Array.isArray(raw.data.kols) ||
      !Number.isFinite(raw.data.total)
    ) {
      const pgyCode =
        raw !== null && typeof raw === "object" && typeof raw.code === "number" ? raw.code : undefined;
      throw createPgyRequestError(
        "invalid-response",
        "蒲公英搜索响应结构不合法（data/kols/total 缺失或类型错误）",
        pgyCode,
      );
    }

    if (raw.code !== 0) {
      const pgyCode = typeof raw.code === "number" ? raw.code : null;
      const kind =
        raw.code === 461
          ? "risk-control"
          : raw.code === 902 || raw.code === 401 || raw.code === -100
            ? "auth-expired"
            : "api";
      throw createPgyRequestError(
        kind,
        `蒲公英搜索接口返回错误 code=${String(raw.code)}${raw.msg === undefined ? "" : `: ${String(raw.msg)}`}`,
        pgyCode,
      );
    }

    const { kols, quarantinedFields } = sanitizeKols(raw.data.kols);
    const uniqueUidCount = countUniqueUids(kols);

    let capped = false;
    let reason = null;
    if (raw.data.total >= KOL_WINDOW_TOTAL) {
      capped = true;
      reason = "total-window";
    } else if (pageNum >= KOL_WINDOW_MAX_PAGE && kols.length >= pageSize) {
      capped = true;
      reason = "max-page-full";
    }

    return {
      httpStatusCode,
      code: raw.code,
      total: raw.data.total,
      kols,
      pageNum,
      pageSize,
      uniqueUidCount,
      quarantinedFields,
      capSignal: { capped, reason, exactTotalNotProven: true },
      trackId,
      startedAt,
      durationMs: Date.now() - startedAt,
    };
  }
}
