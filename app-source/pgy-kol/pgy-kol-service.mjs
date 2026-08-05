/**
 * 蒲公英“找博主”底座组合服务。
 *
 * 第一阶段只读底座 + 第二阶段面向 UI 的只读能力：复用 Electron 蒲公英登录 session，
 * 支持 GET/POST JSON、动态配置规范化（含 last-known-good 回退）、Payload builder、
 * 第一页搜索、5000 触顶信号、确定性切分规则、配置加载与 payload 预览。
 * 不包含批量导出、部署与发版。
 */

import { PgySessionRequest } from "./pgy-session-request.mjs";
import {
  PgyFilterSchema,
  SCHEMA_VERSION,
  createJsonLkgStore,
} from "./pgy-filter-schema.mjs";
import { PgyPayloadBuilder } from "./pgy-payload-builder.mjs";
import { PgyKolSearchClient } from "./pgy-kol-search-client.mjs";
import { PgyPaginationPlanner } from "./pgy-pagination-planner.mjs";
import { PGY_KOL_IPC_CHANNELS, registerPgyKolIpc } from "./pgy-kol-ipc.mjs";

export { PGY_KOL_IPC_CHANNELS, registerPgyKolIpc };

export const PGY_KOL_MODULE_NAME = "pgy-kol";
export const PGY_KOL_PHASE = 2;

const LKG_PROVIDERS = [
  "kolTagsV2.automotiveIndustryTag",
  "kolTagsV2.audience20",
  "kolTagsV2.contentTheme",
  "areas",
  "consumeBehavior",
];

/**
 * 创建找博主底座服务。
 *
 * @param {object} deps
 * @param {(opts: object) => Promise<{ statusCode: number, data: string }>} deps.transport
 *   底层传输（生产注入 Electron net.request 封装；opts 见 PgySessionRequest 契约）。
 * @param {() => object} [deps.getHeaders] 追加请求头（生产注入蒲公英已捕获请求头）。
 * @param {(path: string, body?: unknown) => { "X-s": string, "X-t": number }} [deps.sign]
 *   签名函数（生产注入现有 X-s/X-t 实现）。
 * @param {() => object} [deps.sessionProvider] 提供 Electron session（生产注入默认 session）。
 * @param {string} [deps.baseDir] LKG Schema 快照目录（生产注入 userData 子目录）。
 * @param {object} [deps.logger] 可选 { info?, warn?, error? }。
 */
export function createPgyKolService({
  transport,
  getHeaders,
  sign,
  sessionProvider,
  baseDir,
  logger = {},
} = {}) {
  if (typeof transport !== "function") {
    throw new Error("[pgy-kol] transport 必填");
  }
  const request = new PgySessionRequest({ transport, getHeaders, sign, logger });
  const lkgStore = baseDir ? createJsonLkgStore({ baseDir }) : null;
  const schema = new PgyFilterSchema({ request, lkgStore });
  const builder = new PgyPayloadBuilder({ schema });
  const searchClient = new PgyKolSearchClient({ request });
  const planner = new PgyPaginationPlanner({ schema });

  function status() {
    return {
      module: PGY_KOL_MODULE_NAME,
      phase: PGY_KOL_PHASE,
      schemaVersion: SCHEMA_VERSION,
      ok: true,
    };
  }

  async function schemaStatus() {
    const lkg = {};
    if (lkgStore) {
      for (const provider of LKG_PROVIDERS) {
        const snapshot = await lkgStore.load(provider);
        lkg[provider] = {
          available: Boolean(snapshot),
          version: snapshot ? snapshot.version : null,
          savedAt: snapshot ? snapshot.savedAt : null,
        };
      }
    }
    return { schemaVersion: SCHEMA_VERSION, lkg };
  }

  /**
   * 第一页搜索：规范化筛选状态 -> payload -> 搜索 -> 脱敏结果。
   */
  async function searchFirstPage({
    filterState,
    session,
    pageNum = 1,
    pageSize = 20,
    trackId,
  } = {}) {
    const payload = builder.build(filterState || {}, { pageNum, pageSize, trackId });
    const activeSession = session || (sessionProvider ? sessionProvider() : undefined);
    return searchClient.searchPage({ payload, session: activeSession });
  }

  /**
   * 只读加载动态配置（供 UI 下拉/树使用）。
   *
   * 内部走 schema.loadOptions（live + last-known-good 回退；401/461/902 等
   * 鉴权/风控错误绝不伪装成 LKG 成功）。返回前剥离 rawVersion 字段，
   * 减小体积并避免把原始配置结构敏感面暴露给渲染进程。
   *
   * @returns {Promise<{ source: "live"|"lkg", version: string, nodes: object[], warning?: string }>}
   */
  async function loadConfig({ provider, section } = {}) {
    const result = await schema.loadOptions({
      provider,
      section,
      session: sessionProvider ? sessionProvider() : undefined,
    });
    const data = {
      source: result.source,
      version: result.version,
      nodes: stripRawVersion(result.nodes),
    };
    if (result.warning !== undefined) {
      data.warning = result.warning;
    }
    return data;
  }

  /**
   * 只读 payload 预览：规范化筛选状态 -> builder.build（默认 1/20/工厂 trackId）。
   * 绝不发起网络请求。
   *
   * @returns {{ payload: object, pageNum: number, pageSize: number, trackId: string }}
   */
  async function previewPayload({ filterState, pageNum, pageSize, trackId } = {}) {
    const payload = builder.build(filterState || {}, { pageNum, pageSize, trackId });
    return {
      payload,
      pageNum: payload.pageNum,
      pageSize: payload.pageSize,
      trackId: payload.trackId,
    };
  }

  return {
    request,
    schema,
    builder,
    searchClient,
    planner,
    status,
    schemaStatus,
    searchFirstPage,
    loadConfig,
    previewPayload,
  };
}

/**
 * 递归剥离规范化节点的 rawVersion 字段（live 与 lkg 快照均可能携带）。
 */
function stripRawVersion(nodes) {
  if (!Array.isArray(nodes)) {
    return nodes;
  }
  return nodes.map((node) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return node;
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "rawVersion") {
        continue;
      }
      out[key] = key === "children" && Array.isArray(value) ? stripRawVersion(value) : value;
    }
    return out;
  });
}
