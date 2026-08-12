/**
 * 蒲公英“找博主”底座组合服务。
 *
 * 第一阶段只读底座 + 第二阶段面向 UI 的只读能力 + Phase 4 批量采集任务：
 * 复用 Electron 蒲公英登录 session，支持 GET/POST JSON、动态配置规范化
 * （含 last-known-good 回退）、Payload builder、第一页搜索、5000 触顶信号、
 * 确定性切分规则、配置加载与 payload 预览，以及批量采集（单并发分页、
 * userId 去重、检查点持久化、暂停/继续/取消、崩溃恢复、完整性判定与
 * Excel 全量导出）。
 * 不包含部署与发版。
 */

import { randomUUID } from "node:crypto";

import { PgySessionRequest, redactLocalPathText, PGY_ORIGIN } from "./pgy-session-request.mjs";
import {
  PgyFilterSchema,
  SCHEMA_VERSION,
  createJsonLkgStore,
} from "./pgy-filter-schema.mjs";
import { PgyPayloadBuilder } from "./pgy-payload-builder.mjs";
import { PgyKolSearchClient } from "./pgy-kol-search-client.mjs";
import { PgyPaginationPlanner } from "./pgy-pagination-planner.mjs";
import { PGY_KOL_IPC_CHANNELS, registerPgyKolIpc } from "./pgy-kol-ipc.mjs";
import { PgyKolTaskStore } from "./pgy-kol-task-store.mjs";
import {
  createPgyKolBatchRunner,
  evaluateResumeEligibility,
  validateResumeBudgets,
} from "./pgy-kol-batch-runner.mjs";
import { buildPgyKolBatchExportPayload } from "./pgy-kol-batch-export.mjs";
import { buildCollectionHistoryExportPayload } from "../electron-main/collection-export-headers.mjs";
import { isCollectionTaskExportReady } from "../electron-main/collection-history-store.mjs";
import {
  PGY_KOL_COLUMN_REGISTRY,
  listPgyKolConfirmedColumns,
} from "./pgy-kol-column-registry.mjs";
import { BASE_PAYLOAD } from "./pgy-payload-builder.mjs";

export { PGY_KOL_IPC_CHANNELS, registerPgyKolIpc };

export const PGY_KOL_MODULE_NAME = "pgy-kol";
export const PGY_KOL_PHASE = 5;

// 批量采集默认预算：可配置且有限，未获用户确认前不做大规模真实采集。
export const PGY_KOL_DEFAULT_TASK_BUDGETS = Object.freeze({
  maxLeaves: 16,
  maxDepth: 6,
  maxPagesPerLeaf: 250,
  queryBudget: 400,
});

// 允许继续/恢复的任务状态（与 runner 的 RESUME_REJECTED_STATUSES 互补，
// 供 IPC 层同步预检；risk-control/cancelled/completed 不可恢复；
// incomplete 必须携带严格增加的 budgets 才能继续）。
const RESUMABLE_TASK_STATUSES = new Set([
  "running",
  "interrupted",
  "paused",
  "incomplete",
  "failed",
  "auth-expired",
]);

const LKG_PROVIDERS = [
  "kolTagsV2.automotiveIndustryTag",
  "kolTagsV2.audience20",
  "kolTagsV2.contentTheme",
  "kolTagsV2.industryTags",
  "areas",
  "consumeBehavior",
  "activities",
  "contentTagTree",
  "specialIndustryData",
];

// 与 IPC 守卫同口径的 trackId 安全字符集（官网实测形状 kolMatch_<uuid>）。
const PGY_TRACK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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
 * @param {string} [deps.taskBaseDir] 批量任务持久化目录（生产注入 userData 子目录）。
 * @param {Function} [deps.exporter] 可选 Excel 写出器（生产注入 bundle 内 ff 保存对话框流程；
 *   未注入时 batchExport 返回导出 Payload 便于测试）。
 * @param {object} [deps.taskBudgets] 批量任务默认预算覆盖。
 * @param {object} [deps.logger] 可选 { info?, warn?, error? }。
 * @param {object} [deps.detail] 详情采集依赖（生产注入 pgyCollectionHistory +
 *   ScraperOrchestrator，即“蒲公英博主采集”同一条采集链路；不注入时保持旧的
 *   搜索列表单阶段行为）。
 * @param {Function} [deps.detail.initialize] 详情历史存储初始化（崩溃恢复）。
 * @param {Function} deps.detail.start 创建并启动详情任务（payload 与
 *   scraper:task:start 同构：{ taskId, pluginId, taskType, urls, fileName, fields }）。
 * @param {Function} deps.detail.pause / resume / cancel 详情任务控制。
 * @param {Function} deps.detail.getTask / getExportRows / getResumePlan / setStatus
 *   详情任务持久化访问。
 * @param {number} [deps.detailPollIntervalMs] 详情阶段轮询间隔（默认 2000ms）。
 */
export function createPgyKolService({
  transport,
  getHeaders,
  sign,
  sessionProvider,
  baseDir,
  taskBaseDir,
  exporter,
  taskBudgets,
  logger = {},
  detail,
  detailPollIntervalMs = 2000,
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
  const taskStore = taskBaseDir ? new PgyKolTaskStore({ baseDir: taskBaseDir }) : null;
  const batchListeners = new Set();
  const mergedTaskBudgets = {
    ...PGY_KOL_DEFAULT_TASK_BUDGETS,
    ...(taskBudgets !== null && typeof taskBudgets === "object" ? taskBudgets : {}),
  };
  let storeInitPromise = null;
  let batchRunner = null;
  const detailPolls = new Map();

  function emitBatchEvent(event) {
    for (const listener of Array.from(batchListeners)) {
      try {
        listener(event);
      } catch {
        // 事件监听失败不能影响采集主流程。
      }
    }
  }

  function ensureTaskStore() {
    if (!taskStore) {
      throw new Error("[pgy-kol] 批量任务存储未启用（缺少 taskBaseDir）");
    }
    if (!storeInitPromise) {
      storeInitPromise = taskStore.initialize().catch((err) => {
        storeInitPromise = null;
        throw err;
      });
    }
    return storeInitPromise;
  }

  function ensureBatchRunner() {
    if (!taskStore) {
      throw new Error("[pgy-kol] 批量任务存储未启用（缺少 taskBaseDir）");
    }
    if (!batchRunner) {
      batchRunner = createPgyKolBatchRunner({
        store: taskStore,
        search: searchClient,
        buildPayload: (filterState, { pageNum, pageSize } = {}) => {
          const state =
            filterState !== null && typeof filterState === "object" ? filterState : {};
          // Phase 5 纵深防御：分页 payload 直接展开持久化快照（避免二次序列化
          // 双重前缀），但未实证字段仍然拒绝发送；trackId 优先使用任务快照中的
          // 搜索上下文（batchStart 已 track），其次随机生成。
          for (const key of Object.keys(state)) {
            if (key === "searchType" || key === "keyword" || key === "trackId" || key === "brandUserId") {
              continue;
            }
            const field = schema.getFieldByStateKey(key);
            if (!field) {
              throw new Error(`[pgy-kol] 任务快照含未知字段: ${key}`);
            }
            if (field.payloadProven === false) {
              throw new Error(
                `[pgy-kol] 任务快照含未实证字段: ${key}（禁止发送）`,
              );
            }
          }
          return {
            ...BASE_PAYLOAD,
            ...state,
            pageNum,
            pageSize,
            trackId: typeof state.trackId === "string" && state.trackId.length > 0
              ? state.trackId
              : randomUUID(),
          };
        },
        planSplit: (filterState) => planner.planSplit({ filterState }),
        analyzePageSequence: (options) => planner.analyzePageSequence(options),
        sessionProvider,
        onEvent: emitBatchEvent,
      });
    }
    return batchRunner;
  }

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
    return { schemaVersion: SCHEMA_VERSION, lkg, fields: schema.getSchemaFields() };
  }

  /**
   * 返回字段注册表安全投影（单一权威来源；前端据此判断可用性）。
   */
  function schemaFields() {
    return schema.getSchemaFields();
  }

  /**
   * 第一页搜索：规范化筛选状态 -> payload -> 搜索 -> 脱敏结果。
   *
   * Phase 5 官网契约（2026-08-06 页面最小流量捕获）：点击搜索先 POST
   * /api/solar/cooperator/blogger/track（同一 payload），再以 track 返回的
   * trackId 进入 /api/solar/cooperator/blogger/v2。track 未返回 trackId 时
   * 回退随机 trackId，绝不伪造官网返回值。
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
    return searchClient.searchWithTrack({ payload, session: activeSession });
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
  async function loadConfig({ provider, section, keyword } = {}) {
    const result = await schema.loadOptions({
      provider,
      section,
      ...(keyword === undefined ? {} : { keyword }),
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
    // 预览允许未实证字段：仅展示序列化结果，绝不发起网络请求；
    // 真实搜索/采集仍由 payloadProven 门控拒绝。
    const payload = builder.build(filterState || {}, {
      pageNum,
      pageSize,
      trackId,
      allowUnproven: true,
    });
    return {
      payload,
      pageNum: payload.pageNum,
      pageSize: payload.pageSize,
      trackId: payload.trackId,
    };
  }

  /**
   * 启动批量采集任务。
   *
   * 入参已由 IPC 守卫完成边界校验；这里再做一次 payload 构建（fail-fast，
   * 未知字段在落盘前被拒绝），并把 UI 筛选状态规范化为 Payload 形态的
   * 持久化快照（只存叶子值/最终 Payload 值，不存整棵配置树）。
   *
   * @returns {Promise<{ taskId: string }>}
   */
  async function batchStart({ filterState, fields, pageSize = 20, budgets } = {}) {
    await ensureTaskStore();
    const state = filterState !== null && typeof filterState === "object" ? filterState : {};
    const payload0 = builder.build(state, { pageNum: 1, pageSize });
    const normalized = {};
    for (const key of Object.keys(state)) {
      // 关键契约：UI 的 pgyKolToFilterState 对部分字段（如 top20CrowdsLabel）
      // 已给出 Payload 形态的值（叶子全路径字符串）；对这些值二次序列化会产生
      // 双重前缀（如 "自在户外 自在户外-自在户外-挑战极限者"），真实接口返回
      // total=0。只对节点形态的值（对象/含对象的数组，如地域/行业画像/内容题材/
      // 消费行为树节点）走 builder 序列化；字符串/数字/字符串数组原样保留。
      // 快照值落盘前做值与路径脱敏（fresh reviewer M2）：已知字段的字符串值
      // 也可能携带本地路径或敏感形态文本，不得原样写入 task.json。
      const isSpecialKey = key === "searchType" || key === "keyword" || key === "trackId";
      const stateField = schema.getFieldByStateKey(key);
      const needsPayloadSerialization =
        containsNodeObject(state[key]) ||
        (stateField !== undefined && stateField.serializer === "percent-range-option");
      normalized[key] = sanitizeSnapshotValue(
        isSpecialKey
          ? payload0[key]
          : // 节点形态值（树/范围对象）与百分比字段（需除以 100）取 builder 的最终
            // Payload 值；已是 Payload 形态的值（如 top20 全路径字符串）原样保留，
            // 避免二次序列化产生双重前缀。
            needsPayloadSerialization
            ? payload0[key]
            : state[key],
      );
    }
    // Phase 5.1：结构化字段（直播 filterList / 精选博主 flagList）由 builder 合并为
    // 最终数组形态；dotted 顶层键（"filterList.kliveCnt30d" / "flagList.isHighQuality"）
    // 不得写入快照——runner 直接展开快照，若保留顶层键会发送非法字段并静默丢失筛选。
    for (const key of Object.keys(normalized)) {
      if (key.startsWith("filterList.") || key.startsWith("flagList.")) {
        delete normalized[key];
      }
    }
    if (Array.isArray(payload0.filterList) && payload0.filterList.length > 0) {
      normalized.filterList = sanitizeSnapshotValue(payload0.filterList);
    }
    normalized.flagList = sanitizeSnapshotValue(payload0.flagList);
    // Phase 5：批量任务使用关键词搜索时，启动前先做一次 track，并把 trackId
    // 写入持久化快照（随任务/叶子 filterState 保存，分页请求共用同一搜索上下文；
    // 无关键词时不发 track，保持 Phase 4 基线流量不变）。
    const hasKeyword =
      typeof state.keyword === "string" && state.keyword.trim().length > 0;
    if (hasKeyword) {
      const tracked = await searchClient.trackSearch({
        payload: payload0,
        session: sessionProvider ? sessionProvider() : undefined,
      });
      if (typeof tracked.trackId === "string" && tracked.trackId.length > 0) {
        // Phase 5.1：服务端返回的 trackId 写入持久化快照前必须通过 IPC 同口径
        // 边界校验（类型/长度/字符集/空白）；非法值拒绝写入，回退不持久化。
        const trackId = tracked.trackId.trim();
        if (trackId.length > 0 && PGY_TRACK_ID_PATTERN.test(trackId)) {
          normalized.trackId = sanitizeSnapshotValue(trackId);
        } else {
          logger.warn &&
            logger.warn("[pgy-kol] track 返回的 trackId 未通过边界校验，不写入任务快照");
        }
      }
    }
    const mergedBudgets = {
      ...PGY_KOL_DEFAULT_TASK_BUDGETS,
      ...(budgets !== null && typeof budgets === "object" ? budgets : {}),
    };
    const checkpointTaskId = `pgykol-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await taskStore.createTask({
      taskId: checkpointTaskId,
      filterState: normalized,
      fields,
      pageSize,
      budgets: mergedBudgets,
    });
    // 用户可见的“一次完整采集”：立即创建蒲公英博主详情任务（preparing，目标列表
    // 由后台发现完成后填充）。该任务是唯一进入采集助手/历史/导出的任务；
    // checkpointTaskId 只是内部发现检查点，不进入用户历史。
    const detailTaskId = await createSearchBatchDetail(checkpointTaskId, fields);
    const loop = ensureBatchRunner().start(checkpointTaskId);
    if (loop !== undefined && loop !== null && typeof loop.then === "function") {
      loop
        .then(() => startSearchBatchDetail(checkpointTaskId))
        .catch((err) => {
          logger.error &&
            logger.error(
              "[pgy-kol] 批量任务启动失败:",
              PgySessionRequest.redactText(
                redactLocalPathText(err instanceof Error ? err.message : String(err)),
              ),
            );
          taskStore.setStatus(checkpointTaskId, "failed").catch(() => {});
        });
    }
    return detailTaskId
      ? { taskId: detailTaskId, checkpointTaskId }
      : { taskId: checkpointTaskId, checkpointTaskId, detailTaskId: null };
  }

  // ==================== 两阶段编排（找博主 ID → 现有 pgy/blogger 详情采集器） ====================

  /**
   * 用户可见文件名：找博主-YYYYMMDD.xlsx（不暴露内部任务 ID 文案）。
   */
  function searchBatchFileName() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `找博主-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
  }

  /**
   * 创建（幂等）search-batch 详情任务：preparing 形态（urls 为空，total=0），
   * 由后台发现完成后通过 updateTaskUrls 填充目标列表并启动采集。
   * 立即落盘 checkpoint 的 detailTaskId/detailFileName，崩溃/重启可识别。
   */
  async function createSearchBatchDetail(checkpointTaskId, fields) {
    if (!detail || typeof detail.create !== "function") {
      // 无详情依赖（开发/测试 harness）：退化为纯检查点模式，不创建用户任务。
      return null;
    }
    const detailTaskId = `pgykol-detail-${Date.now().toString(36)}-${randomUUID()
      .replace(/-/g, "")
      .slice(0, 8)}`;
    const fileName = searchBatchFileName();
    // 立即同步返回前先落盘 checkpoint 关联（创建详情任务失败会显式抛错）。
    await taskStore
      .setDetailPhase(checkpointTaskId, { detailTaskId, detailUrls: [], detailFileName: fileName })
      .catch((err) => {
        logger.warn && logger.warn("[pgy-kol] checkpoint 关联落盘失败:", redactError(err));
      });
    await detail.create({
      taskId: detailTaskId,
      pluginId: "pgy",
      taskType: "blogger",
      urls: [],
      fileName,
      fields: Array.isArray(fields) ? fields : [],
      inputType: "search-batch",
    }).catch((err) => {
      logger.error && logger.error("[pgy-kol] 详情任务创建失败:", redactError(err));
    });
    return detailTaskId;
  }

  /**
   * 内部发现检查点是否处于“准备列表”阶段（详情任务已建但目标列表未填充）。
   */
  function isDiscoveryPhase(task) {
    return Boolean(
      task &&
        task.detailTaskId &&
        (!Array.isArray(task.detailUrls) || task.detailUrls.length === 0),
    );
  }

  /**
   * 向采集助手发出详情任务事件（complete/paused 等）。
   */
  function emitDetailEvent(type, payload) {
    if (detail && typeof detail.emit === "function") {
      try {
        detail.emit(type, payload);
      } catch (err) {
        logger.warn && logger.warn("[pgy-kol] 详情事件推送失败:", redactError(err));
      }
    }
  }

  function isDetailTerminal(status) {
    // 只有 completed/cancelled 是终态；interrupted/auth_expired 是
    // 可恢复状态（详情采集器 getResumePlan 允许），轮询停止但绝不收口为终态。
    return status === "completed" || status === "cancelled";
  }

  function isDetailSettled(status) {
    // 详情任务不再自行推进的状态：终态或中断/授权失效（等用户继续）。
    return (
      status === "completed" ||
      status === "cancelled" ||
      status === "interrupted" ||
      status === "auth_expired"
    );
  }

  function redactError(err) {
    return PgySessionRequest.redactText(
      redactLocalPathText(err instanceof Error ? err.message : String(err)),
    );
  }

  /**
   * 阶段一收口后调用：把全部唯一博主 ID 交给现有 pgy/blogger 详情采集器。
   * - ID 去重：同一博主只进入详情任务一次（采集/扣费/导出均只一次）。
   * - fields 原样传递：不做任何裁剪（详情采集器按字段映射调用对应接口）。
   * - 先原子落盘 detailTaskId/detailUrls 再启动，崩溃/重启可识别阶段并继续。
   * - 任务已进入详情阶段（detailTaskId 已存在）时不再重复启动。
   */
  async function startSearchBatchDetail(taskId) {
    if (!detail || typeof detail.start !== "function") return;
    let task;
    try {
      task = await taskStore.getTask(taskId);
    } catch {
      return;
    }
    if (!task) return;
    const fields = Array.isArray(task.fields) ? task.fields : [];
    if (fields.length === 0 || !task.detailTaskId) return;
    if (!isDiscoveryPhase(task)) return;
    // 只在阶段一真正收口（completed/incomplete）时进入详情阶段；
    // paused/cancelled/failed/interrupted 由对应控制路径处理，不得自动启动详情。
    if (task.status !== "completed" && task.status !== "incomplete") return;
    const rows = await taskStore.getRows(taskId).catch(() => []);
    const seen = new Set();
    const urls = [];
    for (const row of rows) {
      const uid =
        row && row.uid !== undefined && row.uid !== null ? String(row.uid).trim() : "";
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      urls.push(`${PGY_ORIGIN}/solar/pre-trade/blogger-detail/${encodeURIComponent(uid)}`);
    }
    if (urls.length === 0) {
      // 没有找到任何博主：详情任务直接收口为 cancelled（无内容可采）。
      if (detail && typeof detail.setStatus === "function") {
        await detail.setStatus(task.detailTaskId, "cancelled").catch(() => {});
      }
      await taskStore.setStatus(taskId, "cancelled").catch(() => {});
      emitDetailEvent("complete", {
        taskId: task.detailTaskId,
        successCount: 0,
        errorCount: 0,
        duration: 0,
        cancelled: true,
        status: "cancelled",
      });
      emitBatchEvent({
        taskId,
        type: "done",
        status: "cancelled",
        detail: { skipped: true, reason: "no-bloggers", detailTaskId: task.detailTaskId },
      });
      return;
    }
    const detailTaskId = task.detailTaskId;
    const detailFileName =
      typeof task.detailFileName === "string" && task.detailFileName.length > 0
        ? task.detailFileName
        : searchBatchFileName();
    // 填充目标列表（checkpoint + 详情任务两处原子落盘），然后启动现有采集器。
    await taskStore.setDetailPhase(taskId, {
      detailTaskId,
      detailUrls: urls,
      detailFileName,
    });
    // 重启恢复：详情任务在历史存储 initialize 时 running → interrupted；
    // 目标列表尚未填充（updateUrls 拒绝重复填充且要求 running），先恢复为
    // running 再填充，避免“发现阶段崩溃重启后父任务直接 failed”。若详情任务
    // 尚未创建（进程在 batchStart 的 detail.create 之前退出），用父任务持久化
    // 的数据重建，避免重启后采集静默丢失。
    const existingDetail = await detail.getTask(detailTaskId).catch(() => null);
    if (!existingDetail) {
      await detail
        .create({
          taskId: detailTaskId,
          pluginId: "pgy",
          taskType: "blogger",
          urls: [],
          fileName: detailFileName,
          fields,
          inputType: "search-batch",
        })
        .catch(() => {});
    } else if (existingDetail.status === "interrupted") {
      await detail.setStatus(detailTaskId, "running").catch(() => {});
    }
    await detail.updateUrls(detailTaskId, urls);
    emitBatchEvent({
      taskId,
      type: "phase",
      phase: "details",
      detailTaskId,
      detailTotal: urls.length,
    });
    try {
      await detail.start({
        taskId: detailTaskId,
        pluginId: "pgy",
        taskType: "blogger",
        urls,
        fileName: detailFileName,
        fields,
        inputType: "search-batch",
      });
      // 阶段二进行中：父任务回到 running（详情完成后再由收口写入终态）。
      await taskStore.setStatus(taskId, "running").catch(() => {});
    } catch (err) {
      logger.error && logger.error("[pgy-kol] 详情阶段启动失败:", redactError(err));
      await taskStore.setStatus(taskId, "failed").catch(() => {});
      emitBatchEvent({
        taskId,
        type: "done",
        status: "failed",
        detail: { startFailed: true, message: redactError(err) },
      });
      return;
    }
    startDetailPoll(taskId, detailTaskId);
  }

  function startDetailPoll(taskId, detailTaskId) {
    if (detailPolls.has(taskId)) return;
    let timer = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const detailTask = await detail.getTask(detailTaskId);
        if (detailTask) {
          const counts = {
            total: Number.isFinite(detailTask.total) ? detailTask.total : 0,
            current: (detailTask.successCount ?? 0) + (detailTask.failedCount ?? 0),
            successCount: detailTask.successCount ?? 0,
            failedCount: detailTask.failedCount ?? 0,
          };
          await taskStore.setDetailStatus(taskId, detailTask.status, counts).catch(() => {});
          emitBatchEvent({
            taskId,
            type: "detail-progress",
            detailTaskId,
            detailStatus: detailTask.status,
            ...counts,
            pendingChargeCount: detailTask.pendingChargeCount ?? 0,
          });
          if (isDetailSettled(detailTask.status)) {
            stopDetailPoll(taskId);
            await finalizeParentAfterDetail(taskId, detailTask);
            return;
          }
        }
      } catch (err) {
        // 轮询失败不中断：下次 tick 重试（详情任务目录短暂不可读等）。
        logger.warn && logger.warn("[pgy-kol] 详情阶段轮询失败:", redactError(err));
      }
      if (!stopped) {
        timer = setTimeout(tick, detailPollIntervalMs);
        detailPolls.set(taskId, timer);
      }
    };
    timer = setTimeout(tick, detailPollIntervalMs);
    detailPolls.set(taskId, timer);
  }

  function stopDetailPoll(taskId) {
    const timer = detailPolls.get(taskId);
    if (timer !== undefined && timer !== null) {
      clearTimeout(timer);
    }
    detailPolls.delete(taskId);
  }

  /**
   * 详情阶段终态收口：父任务状态按详情任务状态映射，
   * 并携带详情计数发出 done 事件（页面据此展示阶段二结果）。
   */
  async function finalizeParentAfterDetail(taskId, detailTask) {
    const statusMap = {
      completed: "completed",
      cancelled: "cancelled",
      auth_expired: "auth-expired",
      interrupted: "interrupted",
    };
    const parentStatus = statusMap[detailTask.status] || "failed";
    await taskStore.setStatus(taskId, parentStatus).catch(() => {});
    const parent = await taskStore.getTask(taskId).catch(() => null);
    emitBatchEvent({
      taskId,
      type: "done",
      status: parentStatus,
      completeness: parent ? parent.completeness ?? null : null,
      detail: {
        detailTaskId: detailTask.taskId,
        status: detailTask.status,
        total: detailTask.total ?? 0,
        successCount: detailTask.successCount ?? 0,
        failedCount: detailTask.failedCount ?? 0,
        pendingChargeCount: detailTask.pendingChargeCount ?? 0,
      },
    });
  }

  /**
   * 重启恢复（阶段二）：详情任务持久化状态为 running → interrupted
   * （history store initialize 处理）后，走 getResumePlan 跳过已成功项，
   * pending charge 补确认（服务端按 taskId+itemIndex 幂等，绝不重复扣费）。
   */
  async function recoverDetailPhase(task) {
    if (!detail) return;
    const detailTaskId = task.detailTaskId;
    const detailTask = await detail.getTask(detailTaskId).catch(() => null);
    // 发现阶段恢复：详情任务目标列表尚未填充（准备中）。恢复内部发现循环，
    // 收口后由 startSearchBatchDetail 填充列表并启动详情采集。
    const resumeDiscovery = () => {
      if (
        !RESUMABLE_TASK_STATUSES.has(task.status) ||
        task.status === "incomplete" ||
        task.status === "failed"
      ) {
        // incomplete 需要用户显式加预算；failed 保持失败等待用户显式继续，
        // 避免持久性失败每次应用启动自动重试、反复消耗查询预算。
        return;
      }
      const loopPromise = ensureBatchRunner().resume(task.taskId, undefined);
      attachResumeLoopCatch(loopPromise, task.taskId);
    };
    if (!detailTask) {
      // 崩溃窗口：setDetailPhase 已落盘但详情任务尚未创建（进程在 create 前退出）。
      const fields = Array.isArray(task.fields) ? task.fields : [];
      const urls = Array.isArray(task.detailUrls) ? task.detailUrls : [];
      if (urls.length === 0) {
        resumeDiscovery();
        return;
      }
      if (fields.length > 0 && urls.length > 0) {
        await detail.create({
          taskId: detailTaskId,
          pluginId: "pgy",
          taskType: "blogger",
          urls: [],
          fileName:
            typeof task.detailFileName === "string" && task.detailFileName.length > 0
              ? task.detailFileName
              : searchBatchFileName(),
          fields,
          inputType: "search-batch",
        }).catch(() => {});
        await detail.start({
          taskId: detailTaskId,
          pluginId: "pgy",
          taskType: "blogger",
          urls,
          fileName:
            typeof task.detailFileName === "string" && task.detailFileName.length > 0
              ? task.detailFileName
              : searchBatchFileName(),
          fields,
          inputType: "search-batch",
        });
        startDetailPoll(task.taskId, detailTaskId);
        return;
      }
      await taskStore.setStatus(task.taskId, "failed").catch(() => {});
      emitBatchEvent({
        taskId: task.taskId,
        type: "done",
        status: "failed",
        detail: { lost: true, detailTaskId },
      });
      return;
    }
    if (isDiscoveryPhase(task)) {
      // 详情任务已创建但列表未填充（crash 于发现中途）：恢复发现循环。
      resumeDiscovery();
      return;
    }
    if (isDetailTerminal(detailTask.status)) {
      await finalizeParentAfterDetail(task.taskId, detailTask);
      return;
    }
    let plan;
    try {
      plan = await detail.getResumePlan(detailTaskId);
    } catch (err) {
      logger.warn && logger.warn("[pgy-kol] 详情阶段恢复计划读取失败:", redactError(err));
      return;
    }
    if (plan.payload.urls.length === 0) {
      await detail.setStatus(detailTaskId, "completed");
      await finalizeParentAfterDetail(task.taskId, await detail.getTask(detailTaskId));
      return;
    }
    await detail.setStatus(detailTaskId, "running");
    await detail.start({ ...plan.payload, pendingCharges: plan.pendingCharges });
    startDetailPoll(task.taskId, detailTaskId);
  }

  /**
   * 详情阶段用户主动继续：内存 paused 直接继续；重启/中断走恢复计划。
   */
  async function resumeDetailPhase(task) {
    const detailTaskId = task.detailTaskId;
    const detailTask = await detail.getTask(detailTaskId);
    if (!detailTask) {
      throw new Error("详情任务不存在");
    }
    if (detailTask.status === "running") {
      if (typeof detail.resume === "function") {
        detail.resume(detailTaskId);
      }
      return { taskId: task.taskId, detailTaskId, status: "running" };
    }
    let plan;
    try {
      plan = await detail.getResumePlan(detailTaskId);
    } catch (err) {
      const error = new Error(
        `详情阶段恢复不可用（状态 ${detailTask.status}）：${redactError(err)}`,
      );
      error.kind = "resume-not-allowed";
      throw error;
    }
    if (plan.payload.urls.length === 0) {
      await detail.setStatus(detailTaskId, "completed");
      const finalDetail = await detail.getTask(detailTaskId);
      await finalizeParentAfterDetail(task.taskId, finalDetail);
      return { taskId: task.taskId, detailTaskId, remaining: 0, completed: true };
    }
    await detail.setStatus(detailTaskId, "running");
    await detail.start({ ...plan.payload, pendingCharges: plan.pendingCharges });
    startDetailPoll(task.taskId, detailTaskId);
    return { taskId: task.taskId, detailTaskId, remaining: plan.payload.urls.length };
  }

  /**
   * 服务初始化（生产在 app 启动时调用一次）：
   * - 批量任务存储崩溃恢复；
   * - 详情历史存储崩溃恢复（running → interrupted）；
   * - 两阶段任务自动识别当前阶段并继续：阶段二重建详情任务，
   *   阶段一自动恢复批量循环（incomplete 仍需用户显式加预算，保持人工）。
   */
  async function initialize() {
    await ensureTaskStore();
    await taskStore.initialize();
    if (detail && typeof detail.initialize === "function") {
      await detail.initialize().catch((err) => {
        logger.warn && logger.warn("[pgy-kol] 详情历史存储初始化失败:", redactError(err));
      });
    }
    const tasks = await taskStore.listTasks();
    for (const task of tasks) {
      // 详情阶段任务：无论父任务当前状态（含重启后 interrupted）都交给
      // recoverDetailPhase 判定（终态收口 / 可恢复则重建详情任务）。
      if (task.detailTaskId) {
        await recoverDetailPhase(task).catch((err) => {
          logger.warn && logger.warn("[pgy-kol] 详情阶段恢复失败:", redactError(err));
        });
        continue;
      }
      if (task.status === "completed" || task.status === "cancelled" || task.status === "risk-control") {
        continue;
      }
      const fields = Array.isArray(task.fields) ? task.fields : [];
      if (
        fields.length > 0 &&
        RESUMABLE_TASK_STATUSES.has(task.status) &&
        task.status !== "incomplete" &&
        task.status !== "failed"
      ) {
        ensureBatchRunner()
          .resume(task.taskId)
          .then(() => startSearchBatchDetail(task.taskId))
          .catch((err) => {
            logger.warn && logger.warn("[pgy-kol] 阶段一自动恢复失败:", redactError(err));
          });
      }
    }
  }

  function containsNodeObject(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.some((item) => item !== null && typeof item === "object");
      }
      return true;
    }
    return false;
  }

  function sanitizeSnapshotValue(value) {
    if (typeof value === "string") {
      return PgySessionRequest.redactText(redactLocalPathText(value));
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeSnapshotValue);
    }
    if (value !== null && typeof value === "object") {
      const out = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        out[childKey] = sanitizeSnapshotValue(childValue);
      }
      return out;
    }
    return value;
  }

  async function batchList() {
    await ensureTaskStore();
    return taskStore.listTasks();
  }

  async function batchGet({ taskId } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    return task;
  }

  async function batchPause({ taskId } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    // 两阶段任务：暂停作用于当前阶段。发现阶段（准备博主列表）暂停发现循环，
    // 并向采集助手同步 paused 事件（同一个任务 ID）；详情阶段暂停详情任务。
    if (task.detailTaskId) {
      if (isDiscoveryPhase(task)) {
        ensureBatchRunner().pause(taskId);
        emitDetailEvent("paused", { taskId: task.detailTaskId, paused: true });
        emitBatchEvent({
          taskId,
          type: "status",
          status: "paused",
          detailTaskId: task.detailTaskId,
        });
        return { taskId, detailTaskId: task.detailTaskId, phase: "preparing" };
      }
      if (typeof detail?.pause === "function") {
        detail.pause(task.detailTaskId);
      }
      emitBatchEvent({
        taskId,
        type: "status",
        status: "paused",
        detailTaskId: task.detailTaskId,
      });
      return { taskId, detailTaskId: task.detailTaskId };
    }
    return ensureBatchRunner().pause(taskId);
  }

  async function batchResume({ taskId, budgets } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    // 两阶段任务：继续作用于当前阶段（发现阶段恢复发现循环）。
    if (task.detailTaskId) {
      if (!detail) {
        throw new Error("详情采集依赖未启用");
      }
      if (isDiscoveryPhase(task)) {
        if (!RESUMABLE_TASK_STATUSES.has(task.status)) {
          const error = new Error(`任务状态 ${task.status} 不允许恢复`);
          error.kind = "resume-not-allowed";
          throw error;
        }
        const loopPromise = ensureBatchRunner().resume(taskId, pickResumeDelta(budgets));
        attachResumeLoopCatch(loopPromise, taskId);
        emitDetailEvent("paused", { taskId: task.detailTaskId, paused: false });
        return { taskId, detailTaskId: task.detailTaskId, phase: "preparing", status: "running" };
      }
      return resumeDetailPhase(task);
    }
    // runner.resume 的返回 Promise 会等整个采集循环结束；IPC 层不能阻塞等待，
    // 因此这里先做状态预检（同步错误路径），再把循环 Promise 分离执行。
    if (!RESUMABLE_TASK_STATUSES.has(task.status)) {
      const error = new Error(`任务状态 ${task.status} 不允许恢复`);
      error.kind = "resume-not-allowed";
      throw error;
    }
    let mergedBudgets = null;
    if (task.status === "incomplete") {
      // Phase 4.1：incomplete 必须满足安全恢复资格，且用户显式提供严格增加的预算。
      const eligibility = evaluateResumeEligibility(task);
      if (!eligibility.eligible) {
        const error = new Error(eligibility.reason);
        error.kind = "resume-not-allowed";
        error.code = eligibility.code ?? "resume-not-allowed";
        throw error;
      }
      const check = validateResumeBudgets(task, budgets, { strict: true });
      if (!check.ok) {
        const error = new Error(check.message);
        error.kind = check.code;
        error.code = check.code;
        throw error;
      }
      mergedBudgets = check.value;
      // 先原子持久化新预算，再启动循环：崩溃/重启后仍带新预算从原检查点继续，
      // 且绝不重置 budgetUsed / counts / pagesCompleted。
      await taskStore.setTaskBudgets(taskId, mergedBudgets);
      const resumeDelta = pickResumeDelta(budgets);
      const loopPromise = ensureBatchRunner().resume(taskId, resumeDelta);
      attachResumeLoopCatch(loopPromise, taskId);
      return {
        taskId,
        status: "running",
        budgets: mergedBudgets,
        budgetUsed: Number.isFinite(task.budgetUsed) ? task.budgetUsed : 0,
      };
    } else if (budgets !== undefined && budgets !== null && Object.keys(budgets).length > 0) {
      const check = validateResumeBudgets(task, budgets, { strict: true });
      if (!check.ok) {
        const error = new Error(check.message);
        error.kind = check.code;
        error.code = check.code;
        throw error;
      }
      mergedBudgets = check.value;
      await taskStore.setTaskBudgets(taskId, mergedBudgets);
    }
    const loopPromise = ensureBatchRunner().resume(taskId, pickResumeDelta(budgets));
    attachResumeLoopCatch(loopPromise, taskId);
    return {
      taskId,
      status: "running",
      budgets: mergedBudgets ?? { ...(task.budgets ?? {}) },
      budgetUsed: Number.isFinite(task.budgetUsed) ? task.budgetUsed : 0,
    };
  }

  // runner 只接受用户显式提供的增量键（queryBudget/maxPagesPerLeaf）；
  // 合并后的完整预算对象（含 maxLeaves/maxDepth）只用于原子持久化。
  function pickResumeDelta(budgets) {
    if (budgets === null || typeof budgets !== "object" || Array.isArray(budgets)) {
      return undefined;
    }
    const delta = {};
    for (const key of ["queryBudget", "maxPagesPerLeaf"]) {
      if (budgets[key] !== undefined && budgets[key] !== null) {
        delta[key] = budgets[key];
      }
    }
    return Object.keys(delta).length > 0 ? delta : undefined;
  }

  function attachResumeLoopCatch(loopPromise, taskId) {
    if (loopPromise && typeof loopPromise.then === "function") {
      void loopPromise
        .then(() => startSearchBatchDetail(taskId))
        .catch((err) => {
          logger.error &&
            logger.error(
              "[pgy-kol] 批量任务恢复失败:",
              PgySessionRequest.redactText(
                redactLocalPathText(err instanceof Error ? err.message : String(err)),
              ),
            );
          taskStore.setStatus(taskId, "failed").catch(() => {});
        });
    }
  }

  async function batchCancel({ taskId } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    // 两阶段任务：取消作用于当前阶段。发现阶段：停止发现循环并直接收口详情任务；
    // 详情阶段：取消详情任务。
    if (task.detailTaskId) {
      if (isDiscoveryPhase(task)) {
        ensureBatchRunner().cancel(taskId);
        if (detail && typeof detail.setStatus === "function") {
          await detail.setStatus(task.detailTaskId, "cancelled").catch(() => {});
        }
        const detailTask = await detail.getTask(task.detailTaskId).catch(() => null);
        await finalizeParentAfterDetail(taskId, { ...(detailTask || {}), taskId: task.detailTaskId, status: "cancelled", total: 0, successCount: 0, failedCount: 0, pendingChargeCount: 0 });
        emitDetailEvent("complete", {
          taskId: task.detailTaskId,
          successCount: 0,
          errorCount: 0,
          duration: 0,
          cancelled: true,
          status: "cancelled",
        });
        return { taskId, detailTaskId: task.detailTaskId, phase: "preparing" };
      }
      if (typeof detail?.cancel === "function") {
        detail.cancel(task.detailTaskId);
      }
      // 非运行中的详情任务（interrupted/auth_expired/pending，内存没有可取消的
      // 运行循环）：直接收口为 cancelled，避免“取消无效果”的僵死状态。
      const detailTask = await detail.getTask(task.detailTaskId).catch(() => null);
      if (detailTask && detailTask.status !== "running" && !isDetailTerminal(detailTask.status)) {
        await detail.setStatus(task.detailTaskId, "cancelled");
        await finalizeParentAfterDetail(taskId, { ...detailTask, status: "cancelled" });
      }
      emitBatchEvent({
        taskId,
        type: "status",
        status: "cancelling",
        detailTaskId: task.detailTaskId,
      });
      return { taskId, detailTaskId: task.detailTaskId };
    }
    return ensureBatchRunner().cancel(taskId);
  }

  /**
   * 采集助手按钮（scraper:task:pause/resume/cancel）转发：详情任务 ID → 内部
   * 检查点。发现阶段（准备列表）的控制落到发现循环；详情阶段由 ge 处理，
   * 这里只负责发现阶段的收口。
   */
  async function forwardScraperTaskControl(detailTaskId, action) {
    if (typeof detailTaskId !== "string" || !detailTaskId.startsWith("pgykol-detail-")) return;
    const tasks = await taskStore.listTasks().catch(() => []);
    const checkpoint = tasks.find((item) => item.detailTaskId === detailTaskId);
    if (!checkpoint) return;
    if (action === "pause") {
      if (isDiscoveryPhase(checkpoint)) {
        ensureBatchRunner().pause(checkpoint.taskId);
        emitDetailEvent("paused", { taskId: detailTaskId, paused: true });
      }
      return;
    }
    if (action === "resume") {
      if (isDiscoveryPhase(checkpoint)) {
        const loopPromise = ensureBatchRunner().resume(checkpoint.taskId, undefined);
        attachResumeLoopCatch(loopPromise, checkpoint.taskId);
        emitDetailEvent("paused", { taskId: detailTaskId, paused: false });
      }
      return;
    }
    if (action === "cancel") {
      if (isDiscoveryPhase(checkpoint)) {
        ensureBatchRunner().cancel(checkpoint.taskId);
        if (detail && typeof detail.setStatus === "function") {
          await detail.setStatus(detailTaskId, "cancelled").catch(() => {});
        }
        await finalizeParentAfterDetail(checkpoint.taskId, {
          taskId: detailTaskId,
          status: "cancelled",
          total: 0,
          successCount: 0,
          failedCount: 0,
          pendingChargeCount: 0,
        });
        emitDetailEvent("complete", {
          taskId: detailTaskId,
          successCount: 0,
          errorCount: 0,
          duration: 0,
          cancelled: true,
          status: "cancelled",
        });
      }
    }
  }

  /**
   * 从持久化全量行导出 Excel：绝不从 UI 预览数组导出。
   * exporter 未注入时返回导出 Payload（测试/只读场景）。
   */
  async function batchExport({ taskId, columns } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    const fields = Array.isArray(task.fields) ? task.fields : [];
    // 两阶段任务：最终导出详情阶段采集结果（完整 schema 表头 + 真实值），
    // 绝不回退到阶段一的搜索列表行（那只会得到大量空单元格）。
    if (fields.length > 0) {
      if (!task.detailTaskId) {
        const error = new Error("详情采集尚未开始，暂无可导出的完整结果");
        error.kind = "details-not-ready";
        throw error;
      }
      if (!detail) {
        const error = new Error("详情采集依赖未启用");
        error.kind = "details-not-ready";
        throw error;
      }
      const detailTask = await detail.getTask(task.detailTaskId);
      if (!detailTask) {
        throw new Error("详情任务不存在");
      }
      if (!isCollectionTaskExportReady(detailTask)) {
        const error = new Error("任务尚未完成全部博主采集，暂不可导出（完成后自动解锁）");
        error.kind = "task-not-complete";
        throw error;
      }
      const rows = await detail.getExportRows(task.detailTaskId);
      if (rows.length === 0) {
        throw new Error("该任务暂无可导出的成功内容");
      }
      const payload = buildCollectionHistoryExportPayload(detailTask, rows);
      if (typeof exporter === "function") {
        return exporter(payload);
      }
      return payload;
    }
    const rows = await taskStore.getRows(taskId);
    if (rows.length === 0) {
      throw new Error("该任务暂无可导出的内容");
    }
    // 导出时允许显式指定字段（页面导出弹窗选择）；缺省沿用任务启动时快照列。
    const exportTask = Array.isArray(columns) && columns.length > 0
      ? Object.assign({}, task, { columns })
      : task;
    const payload = buildPgyKolBatchExportPayload(exportTask, rows);
    if (typeof exporter === "function") {
      return exporter(payload);
    }
    return payload;
  }

  function getColumns() {
    // 契约：data 直接是完整列注册表（50 项：42 官网列 + 8 博主信息独立列），
    // 含固定列/报价列/unavailable 列；UI 弹窗按 fixed/responsePath 分支渲染，
    // 批量列校验仍走 listPgyKolConfirmedColumns（仅真实数据源列可导出）。
    return PGY_KOL_COLUMN_REGISTRY;
  }

  /**
   * 订阅批量任务事件（progress/status/done）。返回取消订阅函数。
   */
  function onBatchEvent(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("[pgy-kol] onBatchEvent 需要函数");
    }
    batchListeners.add(listener);
    return () => batchListeners.delete(listener);
  }

  return {
    request,
    schema,
    builder,
    searchClient,
    planner,
    taskStore,
    status,
    schemaStatus,
    schemaFields,
    searchFirstPage,
    loadConfig,
    previewPayload,
    batchStart,
    batchList,
    batchGet,
    batchPause,
    batchResume,
    batchCancel,
    batchExport,
    getColumns,
    onBatchEvent,
    initialize,
    forwardScraperTaskControl,
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
