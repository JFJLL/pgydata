// magiorix 蒲公英“找博主”Phase 4 批量采集引擎（工作包 A）。
//
// 职责：
// - 单并发批量分页状态机：叶子调度（depth 升序、创建顺序）、页循环停止条件、
//   预算消耗、重复页检测、触顶确定性互斥切分。
// - 全局 UID 去重（启动时从持久化行重建）、缺 UID 计数、写盘顺序
//   （appendPageRows 先于 commitPage）。
// - 错误语义：auth-expired / risk-control 立即停止且不重试；transport / timeout /
//   http 5xx 有限重试（maxAttempts 次重试 + 退避 backoffMs×attempt）；其余错误
//   叶子立即失败，任务转 failed 等待 resume。
// - 暂停 / 取消 / 恢复、单实例防重入、进程重启恢复（getResumeState）。
// - Phase 4.1：循环级停止（预算耗尽 / 页数上限 / 重复页 / 无法安全切分 /
//   checkpoint-desync）统一收口为 incomplete + cannot-prove，不再伪装 completed；
//   只有 budget-exhausted / max-pages-reached（且未到 250）可通过严格单调增加的
//   预算安全继续，其余原因一律拒绝继续。恢复不重抓已提交页、不清零累计计数。
//
// 纯 ESM：不 import electron、不发起网络；searchPage 与请求层全部由外部注入。
// 所有落盘错误信息经 PgySessionRequest.redactText 脱敏，绝不写入
// cookie / token / Authorization / X-s / X-t / session 等敏感字段。

import { PGY_KOL_BUDGET_LIMITS } from "./pgy-ipc-guard.mjs";
import { PgySessionRequest } from "./pgy-session-request.mjs";

const DEFAULT_BUDGETS = Object.freeze({
  maxLeaves: 16,
  maxDepth: 6,
  maxPagesPerLeaf: 250,
  queryBudget: 400,
});

/**
 * 计算任务最终停止原因：循环级 stopReason 优先；否则由叶子状态推导
 * （checkpoint-desync 失败 > capped-unprovable），供 summary/UI/继续资格使用。
 */
export function computeStopReason(leaves, loopStopReason) {
  const leafList = Array.isArray(leaves) ? leaves : [];
  // 叶子级硬伤优先：即使循环级 stopReason 是 budget-exhausted/max-pages-reached，
  // 只要存在 checkpoint-desync 或 capped-unprovable 叶子，任务都不可安全继续，
  // summary/UI/资格判定必须一致地显示硬伤原因。
  for (const leaf of leafList) {
    if (leaf && leaf.failure && leaf.failure.kind === "checkpoint-desync") {
      return "checkpoint-desync";
    }
  }
  for (const leaf of leafList) {
    if (leaf && leaf.status === "capped-unprovable") {
      return "capped-unprovable";
    }
  }
  if (loopStopReason) {
    return loopStopReason;
  }
  return null;
}

/**
 * 判定 incomplete 任务是否具备安全恢复资格（纯函数，runner/store/UI 共用口径）。
 *
 * @returns {{ eligible: boolean, kind?: "budget"|"maxPages", code?: string, reason?: string }}
 */
export function evaluateResumeEligibility(task) {
  if (!task || task.status !== "incomplete") {
    return { eligible: false, code: "resume-not-allowed", reason: "任务不在采集未完整状态" };
  }
  const stopReason =
    task.summary && typeof task.summary === "object" && typeof task.summary.stopReason === "string"
      ? task.summary.stopReason
      : null;
  if (stopReason === "budget-exhausted") {
    return { eligible: true, kind: "budget", reason: null };
  }
  if (stopReason === "max-pages-reached") {
    const current = Number.isInteger(task.budgets?.maxPagesPerLeaf)
      ? task.budgets.maxPagesPerLeaf
      : DEFAULT_BUDGETS.maxPagesPerLeaf;
    if (current >= PGY_KOL_BUDGET_LIMITS.maxPagesPerLeaf) {
      return {
        eligible: false,
        code: "max-pages-limit",
        reason: "已到官方安全页数上限（250 页），无法继续同一查询",
      };
    }
    return { eligible: true, kind: "maxPages", reason: null };
  }
  if (NOT_CONTINUABLE_STOP_REASONS.has(stopReason)) {
    return {
      eligible: false,
      code: "resume-not-allowed",
      reason: `停止原因 ${stopReason} 无法安全继续`,
    };
  }
  return { eligible: false, code: "resume-not-allowed", reason: "该任务无法安全继续（无可用恢复路径）" };
}

/**
 * 校验 resume 预算（纯函数）。返回 { ok, value } 或 { ok:false, code, message }。
 *
 * - strict=true（service 用户入口）：新值必须严格大于当前预算；
 * - strict=false（runner 幂等重检）：允许等于当前预算（service 已先原子落盘），
 *   但必须严格大于已消费请求数（防反复 resume 放大真实请求量）。
 * - 上限与 IPC 守卫一致（PGY_KOL_BUDGET_LIMITS）。
 */
export function validateResumeBudgets(task, budgets, { strict = false } = {}) {
  const current = {
    ...DEFAULT_BUDGETS,
    ...(task && task.budgets && typeof task.budgets === "object" ? task.budgets : {}),
  };
  const consumed = Number.isFinite(task?.budgetUsed) ? task.budgetUsed : 0;
  if (budgets === null || typeof budgets !== "object" || Array.isArray(budgets)) {
    return { ok: false, code: "invalid-budgets", message: "继续任务必须提供 budgets 对象" };
  }
  const keys = Object.keys(budgets);
  if (keys.length === 0) {
    return { ok: false, code: "invalid-budgets", message: "未提供任何预算增量" };
  }
  const next = { ...current };
  for (const key of keys) {
    if (!RESUME_BUDGET_KEYS.includes(key)) {
      return { ok: false, code: "invalid-budgets", message: `不支持的预算字段: ${key}` };
    }
    const raw = budgets[key];
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > PGY_KOL_BUDGET_LIMITS[key]
    ) {
      return {
        ok: false,
        code: "invalid-budgets",
        message: `budgets.${key} 必须是 1-${PGY_KOL_BUDGET_LIMITS[key]} 的整数`,
      };
    }
    next[key] = raw;
  }
  if (keys.includes("queryBudget")) {
    const value = budgets.queryBudget;
    if (strict && value <= current.queryBudget) {
      return {
        ok: false,
        code: "budget-not-increased",
        message: `新 queryBudget 必须严格大于当前预算 ${current.queryBudget}`,
      };
    }
    if (!strict && value < current.queryBudget) {
      return {
        ok: false,
        code: "budget-not-increased",
        message: `新 queryBudget 不得小于当前预算 ${current.queryBudget}`,
      };
    }
    if (value <= consumed) {
      return {
        ok: false,
        code: "budget-below-consumed",
        message: `新 queryBudget 必须严格大于已消费请求数 ${consumed}`,
      };
    }
  }
  if (keys.includes("maxPagesPerLeaf")) {
    const value = budgets.maxPagesPerLeaf;
    if (strict && value <= current.maxPagesPerLeaf) {
      return {
        ok: false,
        code: "budget-not-increased",
        message: `新 maxPagesPerLeaf 必须严格大于当前值 ${current.maxPagesPerLeaf}`,
      };
    }
    if (!strict && value < current.maxPagesPerLeaf) {
      return {
        ok: false,
        code: "budget-not-increased",
        message: `新 maxPagesPerLeaf 不得小于当前值 ${current.maxPagesPerLeaf}`,
      };
    }
  }
  return { ok: true, value: next };
}

// 终态任务不允许 start 重跑（incomplete 也必须走带预算校验的 resume）。
const NO_START_STATUSES = new Set(["cancelled", "completed", "risk-control", "incomplete"]);
// resume 拒绝的状态。
const RESUME_REJECTED_STATUSES = new Set(["risk-control", "cancelled", "completed"]);
// 循环结束时由控制/错误分支设置的状态，finalize 不得覆盖为 completed/incomplete。
const STOP_STATUSES = new Set([
  "paused",
  "cancelled",
  "auth-expired",
  "risk-control",
  "failed",
  "incomplete",
]);

// 不可安全继续的循环级停止原因（不提供任何“继续”入口）。
const NOT_CONTINUABLE_STOP_REASONS = new Set(["repeat-page", "capped-unprovable", "checkpoint-desync"]);

// resume 预算只接受这两个可单调增加的键（与 IPC 守卫白名单一致）。
const RESUME_BUDGET_KEYS = ["queryBudget", "maxPagesPerLeaf"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableError(error) {
  if (error === null || typeof error !== "object") {
    return false;
  }
  if (error.kind === "transport" || error.kind === "timeout") {
    return true;
  }
  if (error.kind === "http") {
    return typeof error.httpStatusCode === "number" && error.httpStatusCode >= 500;
  }
  return false;
}

function normalizeUid(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function toFiniteInt(value) {
  if (typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) {
    return null;
  }
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || !Number.isInteger(num)) {
    return null;
  }
  return num;
}

function nextLeafId(leaves) {
  let maxIndex = -1;
  for (const leaf of leaves) {
    const match = /^L(\d+)$/.exec(typeof leaf.leafId === "string" ? leaf.leafId : "");
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  }
  return `L${maxIndex + 1}`;
}

function buildBaseLeaf() {
  return {
    depth: 0,
    parentId: null,
    range: null,
    filterState: {},
    status: "pending",
    pagesCompleted: [],
    nextPageNum: 1,
    total: null,
    capSignal: null,
    rawCount: 0,
    uniqueCount: 0,
    dupCount: 0,
    missingUidCount: 0,
    failure: null,
  };
}

/**
 * 创建批量采集引擎。
 *
 * @param {object} deps
 * @param {object} deps.store 任务存储（工作包 B 按契约实现）。
 * @param {object} deps.search searchPage 客户端。
 * @param {Function} deps.buildPayload (filterState, {pageNum, pageSize}) → payload。
 * @param {Function} deps.planSplit (filterState) → {canSplit, dimension, subRanges, reason}。
 * @param {Function} deps.analyzePageSequence ({pages}) → {repeatSignal, repeatAtPages}。
 * @param {{maxAttempts?: number, backoffMs?: number}} [deps.retry]
 * @param {() => number} [deps.now]
 * @param {(event: object) => void} [deps.onEvent]
 * @param {() => object} [deps.sessionProvider] 可选 Electron session 提供器。
 */
export function createPgyKolBatchRunner({
  store,
  search,
  buildPayload,
  planSplit,
  analyzePageSequence,
  retry = { maxAttempts: 2, backoffMs: 300 },
  now = () => Date.now(),
  onEvent,
  onPageCommitted,
  sessionProvider,
} = {}) {
  if (!store || typeof store.getTask !== "function") {
    throw new TypeError("createPgyKolBatchRunner 需要 store.getTask");
  }
  if (!search || typeof search.searchPage !== "function") {
    throw new TypeError("createPgyKolBatchRunner 需要 search.searchPage");
  }
  if (typeof buildPayload !== "function") {
    throw new TypeError("createPgyKolBatchRunner 需要 buildPayload");
  }
  if (typeof planSplit !== "function") {
    throw new TypeError("createPgyKolBatchRunner 需要 planSplit");
  }
  if (typeof analyzePageSequence !== "function") {
    throw new TypeError("createPgyKolBatchRunner 需要 analyzePageSequence");
  }

  const maxAttempts =
    retry && Number.isInteger(retry.maxAttempts) && retry.maxAttempts >= 0
      ? retry.maxAttempts
      : 2;
  const backoffMs =
    retry && typeof retry.backoffMs === "number" && Number.isFinite(retry.backoffMs) && retry.backoffMs >= 0
      ? retry.backoffMs
      : 300;

  const runningLoops = new Map(); // taskId → Promise
  const controlFlags = new Map(); // taskId → { pause, cancel }
  const sequences = new Map(); // `${taskId}:${leafId}` → [{pageNum, newUidCount}]
  const emitEvent = typeof onEvent === "function" ? onEvent : () => {};
  const emitPageCommitted =
    typeof onPageCommitted === "function"
      ? onPageCommitted
      : () => {};

  function getControl(taskId) {
    let ctrl = controlFlags.get(taskId);
    if (!ctrl) {
      ctrl = { pause: false, cancel: false };
      controlFlags.set(taskId, ctrl);
    }
    return ctrl;
  }

  async function setTaskStatus(taskId, status) {
    await store.setStatus(taskId, status);
    emitEvent({ taskId, type: "status", status, at: now() });
  }

  async function loadLeaves(taskId, task) {
    if (typeof store.getResumeState === "function") {
      // fresh reviewer L2：恢复状态读取失败必须显式失败，不得静默回退旧叶子。
      const state = await store.getResumeState(taskId);
      if (Array.isArray(state)) {
        return state.map((leaf) => ({ ...leaf }));
      }
      if (state && Array.isArray(state.leaves)) {
        return state.leaves.map((leaf) => ({ ...leaf }));
      }
    }
    return Array.isArray(task.leaves) ? task.leaves.map((leaf) => ({ ...leaf })) : [];
  }

  function buildRootLeaf(task) {
    const filterState =
      task.filterState !== null && typeof task.filterState === "object" ? task.filterState : {};
    const lower = toFiniteInt(filterState.fansNumberLower);
    const upper = toFiniteInt(filterState.fansNumberUpper);
    return {
      ...buildBaseLeaf(),
      leafId: "L0",
      range: lower !== null && upper !== null ? [lower, upper] : null,
      filterState: { ...filterState },
    };
  }

  function makeChildLeaf(parent, leafId, subRange) {
    const [lower, upper] = subRange;
    return {
      ...buildBaseLeaf(),
      leafId,
      depth: parent.depth + 1,
      parentId: parent.leafId,
      range: [lower, upper],
      filterState: {
        ...parent.filterState,
        fansNumberLower: lower,
        fansNumberUpper: upper,
      },
    };
  }

  // 单实例：runningLoops 在首个 await 前同步占位，防并发 start/resume 双跑。
  function ensureLoop(taskId, resumeBudgets) {
    const existing = runningLoops.get(taskId);
    if (existing) {
      return existing;
    }
    const promise = runTask(taskId, resumeBudgets).finally(() => {
      runningLoops.delete(taskId);
    });
    runningLoops.set(taskId, promise);
    return promise;
  }

  async function start(taskId) {
    const existing = runningLoops.get(taskId);
    if (existing) {
      return existing;
    }
    const task = await store.getTask(taskId);
    if (!task) {
      throw new Error(`批量任务不存在: ${taskId}`);
    }
    if (NO_START_STATUSES.has(task.status)) {
      return undefined;
    }
    return ensureLoop(taskId);
  }

  async function resume(taskId, budgets) {
    let existing = runningLoops.get(taskId);
    if (existing) {
      // 旧循环可能正在收尾（pause/cancel 已落盘但 finalize 未完成，注册表
      // 尚未移除）：此时绑定旧 promise 会导致 resume 看似成功但循环已死。
      // 检测到任务已进入停止态时，等旧循环彻底结束再开新循环。
      const currentTask = await store.getTask(taskId).catch(() => null);
      const dying =
        currentTask !== null &&
        typeof currentTask === "object" &&
        (currentTask.status === "paused" ||
          currentTask.status === "cancelled" ||
          currentTask.status === "failed");
      if (dying) {
        await existing.catch(() => {});
        existing = runningLoops.get(taskId);
      }
      if (existing) {
        return existing;
      }
    }
    const task = await store.getTask(taskId);
    if (!task) {
      throw new Error(`批量任务不存在: ${taskId}`);
    }
    if (RESUME_REJECTED_STATUSES.has(task.status)) {
      const error = new Error(`任务状态 ${task.status} 不允许恢复`);
      error.kind = "resume-not-allowed";
      throw error;
    }
    if (task.status === "incomplete") {
      const eligibility = evaluateResumeEligibility(task);
      if (!eligibility.eligible) {
        const error = new Error(eligibility.reason);
        error.kind = "resume-not-allowed";
        error.code = eligibility.code ?? "resume-not-allowed";
        throw error;
      }
    }
    if (budgets !== undefined && budgets !== null && Object.keys(budgets).length > 0) {
      const check = validateResumeBudgets(task, budgets, { strict: false });
      if (!check.ok) {
        const error = new Error(check.message);
        error.kind = check.code;
        throw error;
      }
    }
    return ensureLoop(taskId, budgets);
  }

  // 同步设置控制标志；调用方可直接 await（Promise 立即 resolve）。
  function pause(taskId) {
    getControl(taskId).pause = true;
  }

  function cancel(taskId) {
    getControl(taskId).cancel = true;
  }

  async function runTask(taskId, resumeBudgets) {
    const task = await store.getTask(taskId);
    if (!task) {
      throw new Error(`批量任务不存在: ${taskId}`);
    }
    await setTaskStatus(taskId, "running");
    const ctrl = getControl(taskId);
    ctrl.pause = false;
    ctrl.cancel = false;

    const leaves = await loadLeaves(taskId, task);
    if (leaves.length === 0) {
      const root = buildRootLeaf(task);
      leaves.push(root);
      await store.addLeaf(taskId, root);
    }

    // incomplete + max-pages-reached 恢复：把 max-pages-unprovable 叶子重新置为
    // running（循环只调度 pending/running 叶子），配合已持久化的更大 maxPages
    // 从原检查点继续；预算未真正增加时该叶子会立即再次停止，不会发请求。
    if (task.status === "incomplete" && task.summary?.stopReason === "max-pages-reached") {
      for (const leaf of leaves) {
        if (leaf.status === "max-pages-unprovable") {
          leaf.status = "running";
          await store.updateLeaf(taskId, leaf);
        }
      }
    }

    // resume 语义：清除失败叶子的 failure 以便重试。
    for (const leaf of leaves) {
      // fresh reviewer H2：只清除可重试的叶子失败（leaf-failed）；
      // checkpoint-desync（元数据超前）是持久化一致性缺口，不得静默清除，
      // 完整性必须保持 cannot-prove。
      if (leaf.failure && leaf.failure.kind === "leaf-failed") {
        leaf.failure = null;
        await store.updateLeaf(taskId, leaf);
      }
    }

    // 全局去重集合：启动时从持久化行重建（缺 UID 行不参与去重）。
    // 重建失败（磁盘错误等）必须显式失败，不能静默吞掉导致跨页重复误计为唯一。
    const seen = new Set();
    const rows = await store.getRows(taskId);
    for (const row of rows) {
      if (row && row.uid !== null && row.uid !== undefined) {
        seen.add(row.uid);
      }
    }

    const budgets = {
      ...DEFAULT_BUDGETS,
      ...(task.budgets ?? {}),
      ...(resumeBudgets ?? {}),
    };
    const pageSize = typeof task.pageSize === "number" && task.pageSize > 0 ? task.pageSize : 20;
    const state = {
      // 查询预算跨实例累计：resume 后继续消耗已持久化的 budgetUsed，
      // 防止通过反复 resume 无限放大真实请求量。
      budgetUsed: Number.isFinite(task.budgetUsed) ? task.budgetUsed : 0,
      stopReason: null,
      counts: {
        raw: task.counts ? task.counts.raw ?? 0 : 0,
        unique: task.counts ? task.counts.unique ?? 0 : 0,
        dup: task.counts ? task.counts.dup ?? 0 : 0,
        missingUid: task.counts ? task.counts.missingUid ?? 0 : 0,
      },
    };

    await runLoop({ taskId, leaves, seen, budgets, pageSize, state });
    await finalize(taskId, leaves, state);
  }

  async function runLoop(ctx) {
    const { taskId, leaves } = ctx;
    while (true) {
      const ctrl = getControl(taskId);
      if (ctrl.pause) {
        await setTaskStatus(taskId, "paused");
        return;
      }
      if (ctrl.cancel) {
        await setTaskStatus(taskId, "cancelled");
        return;
      }
      const pending = leaves.filter((leaf) => leaf.status === "pending" || leaf.status === "running");
      if (pending.length === 0) {
        return;
      }
      // 预算检查必须放在 pending 之后：预算恰好等于已消费数且已无待处理叶子时，
      // 属于“完整收尾”（finalize 按覆盖判定 complete），不得误标 budget-exhausted。
      if (ctx.state.budgetUsed >= ctx.budgets.queryBudget) {
        ctx.state.stopReason = "budget-exhausted";
        return;
      }
      pending.sort((a, b) => a.depth - b.depth || leaves.indexOf(a) - leaves.indexOf(b));
      const outcome = await processLeaf(ctx, pending[0]);
      if (outcome === "stop") {
        return;
      }
    }
  }

  async function processLeaf(ctx, leaf) {
    const { taskId, leaves, seen, budgets, pageSize, state } = ctx;
    if (leaf.status === "pending") {
      leaf.status = "running";
      await store.updateLeaf(taskId, leaf);
    }
    while (true) {
      const ctrl = getControl(taskId);
      if (ctrl.pause) {
        await setTaskStatus(taskId, "paused");
        return "stop";
      }
      if (ctrl.cancel) {
        await setTaskStatus(taskId, "cancelled");
        return "stop";
      }
      if (state.budgetUsed >= budgets.queryBudget) {
        state.stopReason = "budget-exhausted";
        return "stop";
      }
      if (leaf.pagesCompleted.length >= budgets.maxPagesPerLeaf) {
        // 页数预算上限：只有已抓行数达到 total（覆盖可证明）才算 done；
        // 未达 total 说明窗口内仍可能有未覆盖数据（如持续短页），必须停止并
        // 标记 cannot-prove，禁止伪装成 complete。
        // 覆盖以唯一 UID 数证明（fresh reviewer C2）：重复行撑满 rawCount 不得算覆盖。
        if (leaf.total === null || leaf.uniqueCount < leaf.total) {
          state.stopReason = state.stopReason ?? "max-pages-reached";
          leaf.status = "max-pages-unprovable";
        } else {
          leaf.status = "done";
        }
        await store.updateLeaf(taskId, leaf);
        return "continue";
      }

      // 每次抓页消耗 1 个 queryBudget。
      state.budgetUsed += 1;
      const pageNum = leaf.nextPageNum;
      const payload = buildPayload(leaf.filterState, { pageNum, pageSize });
      const fetch = await fetchPageWithRetry(payload);
      // 预算按真实请求次数累计：1 次原始请求 + 每次重试各 +1（跨实例持久化，
      // 防止反复 resume 对同一失败页无限重放放大真实请求量）。
      state.budgetUsed += Math.max(0, fetch.attempts - 1);

      if (fetch.outcome === "auth-expired") {
        await setTaskStatus(taskId, "auth-expired");
        return "stop";
      }
      if (fetch.outcome === "risk-control") {
        await setTaskStatus(taskId, "risk-control");
        return "stop";
      }
      if (fetch.outcome === "failed") {
        leaf.failure = { kind: "leaf-failed", attempts: fetch.attempts, message: fetch.message };
        await store.updateLeaf(taskId, leaf);
        // fresh reviewer M2：失败页的预算在状态翻转前随元数据落盘，
        // 缩小“状态已失败但预算未写”的崩溃窗口。
        await persistBudget(taskId, state.budgetUsed);
        await setTaskStatus(taskId, "failed");
        return "stop";
      }

      const result = fetch.result;
      const kols = Array.isArray(result.kols) ? result.kols : [];
      const rows = [];
      let newUidCount = 0;
      let dupCount = 0;
      let missingUidCount = 0;
      for (const kol of kols) {
        const uid = normalizeUid(kol && typeof kol === "object" ? kol.userId : undefined);
        if (uid === null) {
          missingUidCount += 1;
        } else if (seen.has(uid)) {
          dupCount += 1;
        } else {
          seen.add(uid);
          newUidCount += 1;
        }
        rows.push({ uid, fields: kol });
      }
      const rawCount = rows.length;
      // uniqueCount = 本页新增的真实去重 UID 数（缺 UID 行不计入唯一，
      // 与 store 崩溃恢复的全局重算口径一致；fresh reviewer C2）。
      const uniqueCount = newUidCount;

      // 写盘顺序：先写行块，再推进游标（commitPage）。
      await store.appendPageRows(taskId, { leafId: leaf.leafId, pageNum, rows });
      await store.commitPage(taskId, {
        leafId: leaf.leafId,
        pageNum,
        summary: { rawCount, uniqueCount, dupCount, missingUidCount, budgetUsed: state.budgetUsed },
      });

      leaf.rawCount += rawCount;
      leaf.uniqueCount += uniqueCount;
      leaf.dupCount += dupCount;
      leaf.missingUidCount += missingUidCount;
      leaf.pagesCompleted.push(pageNum);
      leaf.nextPageNum = pageNum + 1;
      if (Number.isFinite(result.total)) {
        leaf.total = result.total;
      }
      leaf.capSignal =
        result.capSignal && typeof result.capSignal === "object"
          ? result.capSignal
          : { capped: false, reason: null };
      leaf.status = "running";
      await store.updateLeaf(taskId, leaf);

      state.counts.raw += rawCount;
      state.counts.unique += uniqueCount;
      state.counts.dup += dupCount;
      state.counts.missingUid += missingUidCount;

      // 边发现边采集：每页提交后立即通知编排层追加新 UID 到详情队列。
      emitPageCommitted(taskId, { pageNum, rows, newUidCount, uniqueCount: state.counts.unique });

      emitEvent({
        taskId,
        type: "progress",
        pageNum,
        leafId: leaf.leafId,
        counts: { ...state.counts },
        leafPages: leaf.pagesCompleted.length,
        leafCount: leaves.length,
        at: now(),
      });

      // 重复页检测：每叶子维护 [{pageNum, newUidCount}] 序列。
      const seqKey = `${taskId}:${leaf.leafId}`;
      const sequence = sequences.get(seqKey) || [];
      sequence.push({ pageNum, newUidCount });
      sequences.set(seqKey, sequence);
      const repeat = analyzePageSequence({ pages: sequence });
      if (repeat && repeat.repeatSignal) {
        state.stopReason = state.stopReason ?? "repeat-page";
        leaf.status = "done";
        await store.updateLeaf(taskId, leaf);
        return "continue";
      }

      // 触顶：确定性互斥切分或 capped-unprovable。
      if (leaf.capSignal && leaf.capSignal.capped === true) {
        await handleCap(taskId, leaf, leaves, budgets);
        return "continue";
      }

      // 页循环停止条件（fresh reviewer C2）：覆盖必须以唯一 UID 数证明——
      // leaf.uniqueCount >= leaf.total 才可判 done；重复行撑满 rawCount 但
      // 唯一数不足时继续翻页，直到 maxPages/重复页/预算停止并标记 cannot-prove。
      if (leaf.total !== null && leaf.uniqueCount >= leaf.total) {
        leaf.status = "done";
        await store.updateLeaf(taskId, leaf);
        return "continue";
      }
    }
  }

  async function fetchPageWithRetry(payload) {
    const session = typeof sessionProvider === "function" ? sessionProvider() : undefined;
    const call = { payload };
    if (session !== undefined) {
      call.session = session;
    }
    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        const result = await search.searchPage(call);
        return { outcome: "ok", result, attempts };
      } catch (error) {
        const kind = error && typeof error === "object" ? error.kind : undefined;
        if (kind === "auth-expired") {
          return { outcome: "auth-expired", error };
        }
        if (kind === "risk-control") {
          return { outcome: "risk-control", error };
        }
        if (isRetryableError(error) && attempts <= maxAttempts) {
          if (backoffMs > 0) {
            await sleep(backoffMs * attempts);
          }
          continue;
        }
        const rawMessage =
          error && typeof error.message === "string" ? error.message : String(error);
        return { outcome: "failed", attempts, message: PgySessionRequest.redactText(rawMessage) };
      }
    }
  }

  async function handleCap(taskId, leaf, leaves, budgets) {
    let plan = null;
    if (Array.isArray(leaf.range) && leaf.range.length === 2) {
      try {
        plan = planSplit(leaf.filterState);
      } catch {
        plan = null;
      }
    }
    const subRanges = plan && Array.isArray(plan.subRanges) ? plan.subRanges : [];
    // 互斥切分契约：必须恰好 2 个有限整数区间 [L,M]/[M+1,U]，左端=原下界、
    // 右端=原上界、无重叠无空隙；任何形状不符都不得静默截断（宁可 cannot-prove）。
    const splitShapeValid =
      subRanges.length === 2 &&
      subRanges.every(
        (range) =>
          Array.isArray(range) &&
          range.length === 2 &&
          Number.isInteger(range[0]) &&
          Number.isInteger(range[1]) &&
          range[0] <= range[1],
      ) &&
      subRanges[0][0] === leaf.range[0] &&
      subRanges[0][1] + 1 === subRanges[1][0] &&
      subRanges[1][1] === leaf.range[1];
    const canSplit =
      Boolean(plan && plan.canSplit === true) &&
      leaf.depth < budgets.maxDepth &&
      leaves.length + 2 <= budgets.maxLeaves &&
      splitShapeValid;

    if (canSplit) {
      leaf.status = "split";
      await store.updateLeaf(taskId, leaf);
      for (const subRange of subRanges) {
        const child = makeChildLeaf(leaf, nextLeafId(leaves), subRange);
        leaves.push(child);
        await store.addLeaf(taskId, child);
      }
    } else {
      leaf.status = "capped-unprovable";
      await store.updateLeaf(taskId, leaf);
    }
  }

  async function finalize(taskId, leaves, state) {
    const task = await store.getTask(taskId);
    const completeness = computeCompleteness(leaves, state.stopReason);
    // Phase 4.1：循环级停止（预算/页数/重复页/切分/检查点）未证明完整时，
    // 收口为 incomplete 而非 completed——只有真正完整才显示绿色“已完成”。
    const effectiveStopReason = computeStopReason(leaves, state.stopReason);
    let finalStatus = task ? task.status : "completed";
    if (!STOP_STATUSES.has(finalStatus)) {
      finalStatus = completeness === "complete" ? "completed" : "incomplete";
      await setTaskStatus(taskId, finalStatus);
    }
    const summary = buildSummary(task, leaves, completeness, effectiveStopReason);
    await persistFinalization(taskId, { completeness, summary, budgetUsed: state.budgetUsed });
    emitEvent({ taskId, type: "done", status: finalStatus, completeness, summary, finishedAt: now() });
  }

  async function persistBudget(taskId, budgetUsed) {
    if (typeof store.setTaskBudget !== "function") {
      return;
    }
    try {
      await store.setTaskBudget(taskId, Number.isFinite(budgetUsed) ? budgetUsed : 0);
    } catch (error) {
      // 预算落盘失败必须可见（fails closed）：反复 resume 不得绕过预算红线。
      const rawMessage = error && typeof error.message === "string" ? error.message : String(error);
      throw new Error(
        `批量任务预算落盘失败: ${PgySessionRequest.redactText(PgySessionRequest.redactLocalPathText(rawMessage))}`,
      );
    }
  }

  function computeCompleteness(leaves, stopReason) {
    if (stopReason) {
      return "cannot-prove";
    }
    if (leaves.length === 0) {
      return "not-started";
    }
    // fresh reviewer H1：split 叶子必须已有子叶子（切分发生在标记 split 之后）；
    // 且必须恰好 2 个互斥子区间 [L,M]/[M+1,U] 完整覆盖父区间；
    // 崩溃/写盘失败导致 0 或 1 个子叶子（半区间丢失）时不得判 complete。
    for (const leaf of leaves) {
      if (leaf.status === "split") {
        const children = leaves.filter((candidate) => candidate.parentId === leaf.leafId);
        const parentRange = Array.isArray(leaf.range) && leaf.range.length === 2 ? leaf.range : null;
        const shapeValid =
          parentRange !== null &&
          children.length === 2 &&
          Array.isArray(children[0].range) &&
          children[0].range.length === 2 &&
          Array.isArray(children[1].range) &&
          children[1].range.length === 2 &&
          children[0].range[0] === parentRange[0] &&
          children[0].range[1] + 1 === children[1].range[0] &&
          children[1].range[1] === parentRange[1];
        if (!shapeValid) {
          return "cannot-prove";
        }
      }
    }
    for (const leaf of leaves) {
      if (leaf.failure) {
        return "cannot-prove";
      }
      if (leaf.status === "capped-unprovable") {
        return "cannot-prove";
      }
      if (leaf.status === "max-pages-unprovable") {
        return "cannot-prove";
      }
      if (leaf.status === "pending" || leaf.status === "running") {
        return "cannot-prove";
      }
      if (leaf.status === "done" && leaf.capSignal && leaf.capSignal.capped === true) {
        return "cannot-prove";
      }
    }
    return "complete";
  }

  function buildSummary(task, leaves, completeness, stopReason) {
    const cappedLeaves = [];
    const splitDimensions = new Set();
    let uniqueUidCount = 0;
    for (const leaf of leaves) {
      if (Number.isFinite(leaf.uniqueCount)) {
        uniqueUidCount += leaf.uniqueCount;
      }
      if (leaf.capSignal && leaf.capSignal.capped === true) {
        cappedLeaves.push({ leafId: leaf.leafId, uniqueUidCount: leaf.uniqueCount, capped: true });
      }
      if (leaf.status === "split" && Array.isArray(leaf.range) && leaf.range.length === 2) {
        splitDimensions.add("fansNumber");
      }
    }
    const failureCount = leaves.filter((leaf) => leaf.failure).length;
    const warnings = [];
    if (cappedLeaves.length > 0) {
      warnings.push("当前接口下无法证明完整：存在 capped 叶子，且触顶不等于总数恰好 5000");
    }
    if (failureCount > 0) {
      warnings.push(`存在 ${failureCount} 个失败子查询，结果集不完整`);
    }
    if (stopReason === "repeat-page") {
      warnings.push("检测到连续重复页，已停止翻页");
    }
    if (stopReason === "budget-exhausted") {
      warnings.push("查询预算已耗尽");
    }
    if (stopReason === "max-pages-reached") {
      warnings.push("已达到单叶子最大页数但未覆盖全部结果");
    }
    if (stopReason === "capped-unprovable") {
      warnings.push("无安全切分维度，无法证明完整");
    }
    if (stopReason === "checkpoint-desync") {
      warnings.push("检查点与行数据不一致，禁止继续");
    }
    return {
      uniqueUidCount,
      subqueryCount: leaves.length,
      mergedDupCount: task && task.counts ? task.counts.dup ?? 0 : 0,
      failureCount,
      cappedLeaves,
      splitDimension: splitDimensions.size === 1 ? Array.from(splitDimensions)[0] : null,
      completeness,
      warnings,
      stopReason: stopReason ?? null,
    };
  }

  async function persistFinalization(taskId, { completeness, summary, budgetUsed }) {
    // 工作包 B 的 store 契约：setCompleteness(taskId, completeness, extra)，
    // extra.summary 合并进任务 summary。
    if (typeof store.setCompleteness === "function") {
      await store.setCompleteness(taskId, completeness, { summary });
    } else if (typeof store.setTaskMeta === "function") {
      await store.setTaskMeta(taskId, { completeness, summary });
    } else if (typeof store.setFinalize === "function") {
      await store.setFinalize(taskId, { completeness, summary });
    } else if (typeof store.setSummary === "function") {
      await store.setSummary(taskId, summary);
    }
    // 查询预算跨实例持久化：失败/暂停/取消/鉴权/风控等所有停止路径都必须落盘，
    // 防止反复 resume 绕过预算红线（fresh reviewer C3）；落盘失败向上抛（M2）。
    await persistBudget(taskId, budgetUsed);
    // store 未提供专用 setter 时：completeness/summary 通过 done 事件承载，
    // 持久化缺失属于工作包 B 的契约范围。
  }

  return { start, resume, pause, cancel };
}
