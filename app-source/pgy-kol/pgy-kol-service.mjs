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

import { PgySessionRequest, redactLocalPathText } from "./pgy-session-request.mjs";
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
import {
  listPgyKolConfirmedColumns,
} from "./pgy-kol-column-registry.mjs";
import { BASE_PAYLOAD } from "./pgy-payload-builder.mjs";

export { PGY_KOL_IPC_CHANNELS, registerPgyKolIpc };

export const PGY_KOL_MODULE_NAME = "pgy-kol";
export const PGY_KOL_PHASE = 4;

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
 * @param {string} [deps.taskBaseDir] 批量任务持久化目录（生产注入 userData 子目录）。
 * @param {Function} [deps.exporter] 可选 Excel 写出器（生产注入 bundle 内 ff 保存对话框流程；
 *   未注入时 batchExport 返回导出 Payload 便于测试）。
 * @param {object} [deps.taskBudgets] 批量任务默认预算覆盖。
 * @param {object} [deps.logger] 可选 { info?, warn?, error? }。
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
        buildPayload: (filterState, { pageNum, pageSize } = {}) => ({
          ...BASE_PAYLOAD,
          ...(filterState !== null && typeof filterState === "object" ? filterState : {}),
          pageNum,
          pageSize,
          trackId: randomUUID(),
        }),
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

  /**
   * 启动批量采集任务。
   *
   * 入参已由 IPC 守卫完成边界校验；这里再做一次 payload 构建（fail-fast，
   * 未知字段在落盘前被拒绝），并把 UI 筛选状态规范化为 Payload 形态的
   * 持久化快照（只存叶子值/最终 Payload 值，不存整棵配置树）。
   *
   * @returns {Promise<{ taskId: string }>}
   */
  async function batchStart({ filterState, columns, pageSize = 20, budgets } = {}) {
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
      normalized[key] = sanitizeSnapshotValue(
        containsNodeObject(state[key]) ? payload0[key] : state[key],
      );
    }
    const mergedBudgets = {
      ...PGY_KOL_DEFAULT_TASK_BUDGETS,
      ...(budgets !== null && typeof budgets === "object" ? budgets : {}),
    };
    const taskId = `pgykol-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await taskStore.createTask({
      taskId,
      filterState: normalized,
      columns,
      pageSize,
      budgets: mergedBudgets,
    });
    void ensureBatchRunner()
      .start(taskId)
      .catch((err) => {
        logger.error &&
          logger.error(
            "[pgy-kol] 批量任务启动失败:",
            PgySessionRequest.redactText(
              redactLocalPathText(err instanceof Error ? err.message : String(err)),
            ),
          );
        taskStore.setStatus(taskId, "failed").catch(() => {});
      });
    return { taskId };
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
    return ensureBatchRunner().pause(taskId);
  }

  async function batchResume({ taskId, budgets } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
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
      void loopPromise.catch((err) => {
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
    return ensureBatchRunner().cancel(taskId);
  }

  /**
   * 从持久化全量行导出 Excel：绝不从 UI 预览数组导出。
   * exporter 未注入时返回导出 Payload（测试/只读场景）。
   */
  async function batchExport({ taskId } = {}) {
    await ensureTaskStore();
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    const rows = await taskStore.getRows(taskId);
    if (rows.length === 0) {
      throw new Error("该任务暂无可导出的内容");
    }
    const payload = buildPgyKolBatchExportPayload(task, rows);
    if (typeof exporter === "function") {
      return exporter(payload);
    }
    return payload;
  }

  function getColumns() {
    // 契约：data 直接是列数组（UI 按 defaultDisplay 过滤默认选择）。
    return listPgyKolConfirmedColumns();
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
