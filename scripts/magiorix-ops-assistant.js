(function () {
  const STORAGE_KEY = "magiorix.opsAssistant.v1";
  const PACE = {
    stable: { label: "稳定", itemDelayMs: 5000, batchSize: 20, batchRestMs: 120000 },
    balanced: { label: "均衡", itemDelayMs: 2500, batchSize: 50, batchRestMs: 60000 },
    fast: { label: "快速", itemDelayMs: 800, batchSize: 100, batchRestMs: 15000 },
  };
  const PLUGINS = [
    { id: "pgy", label: "蒲公英" },
    { id: "starmap", label: "星图" },
    { id: "douyin", label: "抖音" },
  ];

  const state = loadState();
  const runtime = {
    tasks: new Map(),
    auth: new Map(),
    panel: null,
    list: null,
    summary: null,
    authBox: null,
    settingsBox: null,
  };

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        open: !!parsed.open,
        paceMode: PACE[parsed.paceMode] ? parsed.paceMode : "balanced",
        logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-120) : [],
        lastTaskId: typeof parsed.lastTaskId === "string" ? parsed.lastTaskId : "",
      };
    } catch {
      return { open: false, paceMode: "balanced", logs: [], lastTaskId: "" };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        open: state.open,
        paceMode: state.paceMode,
        logs: state.logs.slice(-120),
        lastTaskId: state.lastTaskId,
      }),
    );
  }

  function classifyFailure(event) {
    const code = String(event?.errorCode || "").toUpperCase();
    const text = `${code} ${event?.errorMessage || ""} ${JSON.stringify(event?.errorDetails || {})}`.toLowerCase();
    if (event?.errorCategory && event?.errorCategoryLabel) {
      return { code: event.errorCategory, label: event.errorCategoryLabel };
    }
    if (code.includes("INVALID") || (text.includes("链接") && text.includes("无效"))) return { code: "invalid-input", label: "链接无效" };
    if (code.includes("NOT_FOUND") || text.includes("不存在") || text.includes("未找到")) return { code: "not-found", label: "目标不存在" };
    if (code.includes("AUTH") || code.includes("UNAUTHORIZED") || text.includes("401") || text.includes("登录") || text.includes("授权")) return { code: "auth", label: "授权失效" };
    if (code.includes("CAPTCHA") || text.includes("验证码") || text.includes("verify") || text.includes("安全验证")) return { code: "captcha", label: "验证码/安全验证" };
    if (code.includes("TIMEOUT") || text.includes("timeout") || text.includes("超时")) return { code: "timeout", label: "网络或平台超时" };
    if (code.includes("RISK") || text.includes("风控") || text.includes("risk") || text.includes("461") || text.includes("2155") || text.includes("2154")) return { code: "risk", label: "平台风控" };
    return { code: "unknown", label: "未知错误" };
  }

  function log(level, message, details) {
    state.logs.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toLocaleString("zh-CN", { hour12: false }),
      level,
      message,
      details: details || null,
    });
    state.logs = state.logs.slice(-120);
    saveState();
    render();
  }

  function getTask(id) {
    if (!runtime.tasks.has(id)) {
      runtime.tasks.set(id, {
        id,
        payload: null,
        current: 0,
        total: 0,
        success: 0,
        failed: [],
        completed: false,
      });
    }
    return runtime.tasks.get(id);
  }

  function withPace(payload) {
    const pace = PACE[state.paceMode] || PACE.balanced;
    return {
      ...payload,
      paceMode: state.paceMode,
      itemDelayMs: pace.itemDelayMs,
      batchSize: pace.batchSize,
      batchRestMs: pace.batchRestMs,
    };
  }

  async function precheck(payload) {
    const task = getTask(payload.taskId);
    task.payload = payload;
    task.total = Array.isArray(payload.urls) ? payload.urls.length : 0;
    state.lastTaskId = payload.taskId;
    saveState();
    log("info", `启动前检查：${payload.fileName || payload.taskId}，${task.total} 条，${PACE[state.paceMode].label}模式`);
    if (!task.total) {
      log("warn", "启动前检查发现没有可采集链接");
      return;
    }
    try {
      if (payload.accountSource === "enterprise") {
        log("info", "企业账号池任务将由主进程检查可用账号和额度");
        return;
      }
      const result = await window.bridge.scraper.auth.check(payload.pluginId);
      runtime.auth.set(payload.pluginId, result?.authorized ? "authorized" : "unauthorized");
      log(result?.authorized ? "success" : "warn", `${pluginLabel(payload.pluginId)}授权${result?.authorized ? "可用" : "不可用"}`);
    } catch (error) {
      runtime.auth.set(payload.pluginId, "error");
      log("warn", `${pluginLabel(payload.pluginId)}授权检测失败`, errorMessage(error));
    }
  }

  function pluginLabel(id) {
    return PLUGINS.find((item) => item.id === id)?.label || id || "未知平台";
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error || "");
  }

  function retryFailed(taskId) {
    const source = runtime.tasks.get(taskId || state.lastTaskId);
    if (!source || !source.payload || source.failed.length === 0) return;
    const urls = Array.from(new Set(source.failed.map((item) => item.url).filter(Boolean)));
    if (urls.length === 0) return;
    const retryId = `${source.id}-retry-${Date.now().toString(36)}`;
    const payload = withPace({
      ...source.payload,
      taskId: retryId,
      urls,
      fileName: `重跑失败项-${source.payload.fileName || "manual"}`,
      retryOf: source.id,
    });
    const retryTask = getTask(retryId);
    retryTask.payload = payload;
    retryTask.total = urls.length;
    state.lastTaskId = retryId;
    saveState();
    log("info", `开始重跑失败项：${urls.length} 条`);
    window.bridge.scraper.task.start(payload);
    render();
  }

  function bindBridge() {
    const bridge = window.bridge;
    if (!bridge?.scraper?.task || bridge.scraper.task.__opsAssistantBound) return false;

    const task = bridge.scraper.task;
    const originalStart = task.start.bind(task);
    task.start = async function (payload) {
      const enhanced = withPace(payload || {});
      await precheck(enhanced);
      return originalStart(enhanced);
    };
    task.__opsAssistantBound = true;

    task.onProgress((event) => {
      const item = getTask(event.taskId);
      item.current = event.current ?? item.current;
      item.total = event.total ?? item.total;
      if (event.batchResting) {
        log("info", `批次休息：已完成 ${event.current}/${event.total}，等待 ${Math.round((event.batchRestMs || 0) / 1000)} 秒`);
      }
      render();
    });
    task.onItemResult((event) => {
      const item = getTask(event.taskId);
      const url = item.payload?.urls?.[event.index] || "";
      if (event.status === "success") {
        item.success += 1;
        log("success", `采集成功：第 ${(event.index ?? 0) + 1} 条`);
      } else {
        const category = classifyFailure(event);
        item.failed.push({ url, index: event.index, category, message: event.errorMessage || "" });
        log("error", `采集失败：${category.label}`, event.errorMessage || url);
      }
      render();
    });
    task.onComplete((event) => {
      const item = getTask(event.taskId);
      item.completed = true;
      log(event.errorCount > 0 ? "warn" : "success", `任务完成：成功 ${event.successCount || 0}，失败 ${event.errorCount || 0}`);
      render();
    });
    task.onError((event) => {
      const category = classifyFailure(event);
      log("error", `任务启动失败：${category.label}`, event.message || "");
      render();
    });
    task.onCaptchaRequired((event) => {
      log("warn", `需要验证码：${pluginLabel(event.platform || event.pluginId)}`);
    });
    return true;
  }

  async function checkAuth(id) {
    runtime.auth.set(id, "checking");
    render();
    try {
      const result = await window.bridge.scraper.auth.check(id);
      runtime.auth.set(id, result?.authorized ? "authorized" : "unauthorized");
      log(result?.authorized ? "success" : "warn", `${pluginLabel(id)}授权${result?.authorized ? "可用" : "不可用"}`);
    } catch (error) {
      runtime.auth.set(id, "error");
      log("warn", `${pluginLabel(id)}授权检测失败`, errorMessage(error));
    }
    render();
  }

  function ensureUi() {
    if (document.getElementById("magiorix-ops-assistant")) return;
    const style = document.createElement("style");
    style.textContent = `
      #magiorix-ops-assistant{position:fixed;right:18px;bottom:18px;z-index:9999;font:13px/1.5 "Microsoft YaHei",system-ui,sans-serif;color:#17202a}
      #magiorix-ops-assistant button{font:inherit}
      .moa-toggle{border:0;border-radius:999px;padding:10px 14px;background:#17202a;color:white;box-shadow:0 10px 28px rgba(23,32,42,.22);cursor:pointer}
      .moa-panel{display:none;width:390px;max-width:calc(100vw - 28px);max-height:min(720px,calc(100vh - 88px));overflow:hidden;background:#fff;border:1px solid rgba(23,32,42,.12);border-radius:8px;box-shadow:0 18px 48px rgba(23,32,42,.22)}
      .moa-panel.open{display:block}
      .moa-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(23,32,42,.08);font-weight:700}
      .moa-body{padding:12px;overflow:auto;max-height:calc(min(720px,calc(100vh - 88px)) - 48px)}
      .moa-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      .moa-card{border:1px solid rgba(23,32,42,.1);border-radius:8px;padding:10px;margin-bottom:10px;background:#fbfcfd}
      .moa-title{font-size:12px;color:#637381;margin-bottom:6px}
      .moa-btn{border:1px solid rgba(23,32,42,.18);background:white;border-radius:6px;padding:5px 9px;cursor:pointer}
      .moa-btn.primary{background:#1f6feb;color:white;border-color:#1f6feb}
      .moa-btn.warn{background:#fff7e6;border-color:#f0b45b}
      .moa-pill{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;background:#eef2f6;color:#344054;font-size:12px}
      .moa-log{border-top:1px solid rgba(23,32,42,.08);padding:8px 0}
      .moa-log:first-child{border-top:0}
      .moa-log-time{font-size:11px;color:#8a96a3}
      .moa-log.error{color:#b42318}.moa-log.warn{color:#b54708}.moa-log.success{color:#067647}
      .moa-select{border:1px solid rgba(23,32,42,.18);border-radius:6px;padding:5px 8px;background:#fff}
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "magiorix-ops-assistant";
    root.innerHTML = `
      <div class="moa-panel${state.open ? " open" : ""}">
        <div class="moa-head"><span>采集助手</span><button class="moa-btn" data-close>收起</button></div>
        <div class="moa-body">
          <div class="moa-card" data-summary></div>
          <div class="moa-card" data-settings></div>
          <div class="moa-card" data-auth></div>
          <div class="moa-card"><div class="moa-title">采集日志</div><div data-list></div></div>
        </div>
      </div>
      <button class="moa-toggle" data-open>采集助手</button>
    `;
    document.body.appendChild(root);
    runtime.panel = root.querySelector(".moa-panel");
    runtime.list = root.querySelector("[data-list]");
    runtime.summary = root.querySelector("[data-summary]");
    runtime.authBox = root.querySelector("[data-auth]");
    runtime.settingsBox = root.querySelector("[data-settings]");
    root.querySelector("[data-open]").addEventListener("click", () => {
      state.open = true;
      saveState();
      render();
    });
    root.querySelector("[data-close]").addEventListener("click", () => {
      state.open = false;
      saveState();
      render();
    });
  }

  function render() {
    ensureUi();
    runtime.panel.classList.toggle("open", state.open);
    renderSummary();
    renderSettings();
    renderAuth();
    renderLogs();
  }

  function renderSummary() {
    const task = runtime.tasks.get(state.lastTaskId);
    const failed = task?.failed?.length || 0;
    runtime.summary.innerHTML = `
      <div class="moa-title">当前任务</div>
      <div class="moa-row">
        <span class="moa-pill">${task ? `${task.current}/${task.total}` : "暂无任务"}</span>
        <span class="moa-pill">成功 ${task?.success || 0}</span>
        <span class="moa-pill">失败 ${failed}</span>
      </div>
      <button class="moa-btn primary" data-retry ${failed ? "" : "disabled"}>重跑失败项</button>
      <button class="moa-btn" data-clear>清空日志</button>
    `;
    runtime.summary.querySelector("[data-retry]").addEventListener("click", () => retryFailed(state.lastTaskId));
    runtime.summary.querySelector("[data-clear]").addEventListener("click", () => {
      state.logs = [];
      saveState();
      render();
    });
  }

  function renderSettings() {
    const pace = PACE[state.paceMode];
    runtime.settingsBox.innerHTML = `
      <div class="moa-title">采集节奏</div>
      <div class="moa-row">
        <select class="moa-select" data-pace>
          ${Object.entries(PACE).map(([key, item]) => `<option value="${key}" ${key === state.paceMode ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
        <span class="moa-pill">每批 ${pace.batchSize}</span>
        <span class="moa-pill">批间 ${Math.round(pace.batchRestMs / 1000)} 秒</span>
      </div>
    `;
    runtime.settingsBox.querySelector("[data-pace]").addEventListener("change", (event) => {
      state.paceMode = event.target.value;
      log("info", `采集节奏已切换为${PACE[state.paceMode].label}`);
      saveState();
      render();
    });
  }

  function renderAuth() {
    runtime.authBox.innerHTML = `
      <div class="moa-title">授权检测</div>
      <div class="moa-row">
        ${PLUGINS.map((item) => {
          const status = runtime.auth.get(item.id) || "unknown";
          const label = status === "authorized" ? "可用" : status === "checking" ? "检测中" : status === "unauthorized" ? "不可用" : status === "error" ? "异常" : "未检测";
          return `<button class="moa-btn" data-auth="${item.id}">${item.label} · ${label}</button>`;
        }).join("")}
      </div>
    `;
    runtime.authBox.querySelectorAll("[data-auth]").forEach((button) => {
      button.addEventListener("click", () => checkAuth(button.getAttribute("data-auth")));
    });
  }

  function renderLogs() {
    runtime.list.innerHTML = state.logs.slice().reverse().map((entry) => `
      <div class="moa-log ${entry.level}">
        <div class="moa-log-time">${entry.time}</div>
        <div>${escapeHtml(entry.message)}</div>
        ${entry.details ? `<div class="moa-log-time">${escapeHtml(String(entry.details)).slice(0, 180)}</div>` : ""}
      </div>
    `).join("") || '<div class="moa-log-time">暂无日志</div>';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function init() {
    ensureUi();
    render();
    const timer = setInterval(() => {
      if (bindBridge()) {
        clearInterval(timer);
        log("info", "采集助手已接入");
      }
    }, 300);
    setTimeout(() => clearInterval(timer), 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
