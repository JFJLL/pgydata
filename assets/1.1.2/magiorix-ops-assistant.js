(function () {
  const STORAGE_KEY = "magiorix.opsAssistant.v2";
  const LEGACY_STORAGE_KEY = "magiorix.opsAssistant.v1";
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
    root: null,
    panel: null,
    currentBox: null,
    assistantBox: null,
    historyBox: null,
    tabs: null,
    bound: false,
    deferRender: false,
    pendingRender: false,
  };

  function loadState() {
    const fallback = { open: false, activeTab: "assistant", paceMode: "balanced", logs: [], history: [], lastTaskId: "" };
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        open: !!parsed.open,
        activeTab: ["assistant", "current", "history"].includes(parsed.activeTab) ? parsed.activeTab : "assistant",
        paceMode: PACE[parsed.paceMode || legacy.paceMode] ? parsed.paceMode || legacy.paceMode : "balanced",
        logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-160) : Array.isArray(legacy.logs) ? legacy.logs.slice(-160) : [],
        history: Array.isArray(parsed.history) ? parsed.history.slice(-40) : [],
        lastTaskId: typeof parsed.lastTaskId === "string" ? parsed.lastTaskId : typeof legacy.lastTaskId === "string" ? legacy.lastTaskId : "",
      };
    } catch {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        open: state.open,
        activeTab: state.activeTab,
        paceMode: state.paceMode,
        logs: state.logs.slice(-160),
        history: state.history.slice(-40),
        lastTaskId: state.lastTaskId,
      }),
    );
  }

  function isLoginView() {
    const url = `${location.pathname}${location.hash}`.toLowerCase();
    if (url.includes("sign-in") || url.includes("login")) return true;
    const text = document.body?.innerText || "";
    return text.includes("登录magiorix") && (text.includes("手机号注册") || text.includes("密码登录"));
  }

  function pluginLabel(id) {
    return PLUGINS.find((item) => item.id === id)?.label || id || "未知平台";
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error || "");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
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
    state.logs = state.logs.slice(-160);
    saveState();
    render();
  }

  function flushDeferredRender() {
    runtime.deferRender = false;
    if (!runtime.pendingRender) return;
    runtime.pendingRender = false;
    render({ force: true });
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
        startedAt: Date.now(),
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
    task.startedAt = Date.now();
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
    retryTask.startedAt = Date.now();
    state.lastTaskId = retryId;
    state.activeTab = "current";
    saveState();
    log("info", `开始重跑失败项：${urls.length} 条`);
    window.bridge.scraper.task.start(payload);
    render();
  }

  function bindBridge() {
    const bridge = window.bridge;
    if (!bridge?.scraper?.task || runtime.bound) return false;

    const task = bridge.scraper.task;
    const originalStart = task.start.bind(task);
    task.start = async function (payload) {
      const enhanced = withPace(payload || {});
      await precheck(enhanced);
      return originalStart(enhanced);
    };
    runtime.bound = true;

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
      const record = {
        id: event.taskId,
        fileName: item.payload?.fileName || event.taskId,
        pluginId: item.payload?.pluginId || "",
        taskType: item.payload?.taskType || "",
        total: item.total,
        success: event.successCount || item.success || 0,
        failed: event.errorCount || item.failed.length || 0,
        duration: event.duration || Date.now() - item.startedAt,
        finishedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      };
      state.history = [record, ...state.history.filter((old) => old.id !== record.id)].slice(0, 40);
      log(record.failed > 0 ? "warn" : "success", `任务完成：成功 ${record.success}，失败 ${record.failed}`);
      saveState();
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

  function removeUi() {
    runtime.root?.remove();
    runtime.root = null;
    runtime.panel = null;
    runtime.deferRender = false;
    runtime.pendingRender = false;
  }

  function ensureUi() {
    if (isLoginView()) {
      removeUi();
      return false;
    }
    if (runtime.root && document.body.contains(runtime.root)) return true;

    if (!document.querySelector('[data-moa-style="true"]')) {
      const style = document.createElement("style");
      style.setAttribute("data-moa-style", "true");
      style.textContent = `
      #magiorix-ops-assistant{position:fixed;right:24px;bottom:24px;z-index:1600;font:13px/1.5 "Microsoft YaHei",system-ui,sans-serif;color:#17202a;--moa-red:#ff2a3b;--moa-ink:#17202a;--moa-muted:#7b8794;--moa-line:rgba(145,158,171,.22)}
      #magiorix-ops-assistant button,#magiorix-ops-assistant select{font:inherit}
      .moa-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,42,59,.18);border-radius:999px;padding:10px 16px;background:#fff;color:var(--moa-ink);box-shadow:0 14px 34px rgba(23,32,42,.16);cursor:pointer;font-weight:700;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
      .moa-toggle:hover{transform:translateY(-1px);box-shadow:0 18px 42px rgba(23,32,42,.2);border-color:rgba(255,42,59,.38)}
      .moa-panel.open + .moa-toggle{display:none}
      .moa-toggle-icon{width:24px;height:24px;border-radius:8px;background:var(--moa-red);display:inline-flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 18px rgba(255,42,59,.28)}
      .moa-panel{display:none;width:440px;max-width:calc(100vw - 32px);height:min(640px,calc(100vh - 96px));overflow:hidden;background:#fff;border:1px solid var(--moa-line);border-radius:10px;box-shadow:0 22px 58px rgba(23,32,42,.2)}
      .moa-panel.open{display:block}
      .moa-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--moa-line)}
      .moa-head-title{font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px}
      .moa-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px;border-bottom:1px solid var(--moa-line);background:#fbfcfd}
      .moa-tab{border:0;background:transparent;border-radius:8px;padding:8px 8px;color:#637381;cursor:pointer;font-weight:700}
      .moa-tab.active{background:#fff;color:var(--moa-red);box-shadow:0 1px 6px rgba(23,32,42,.08)}
      .moa-body{padding:12px;overflow:auto;height:calc(100% - 104px)}
      .moa-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      .moa-card{border:1px solid var(--moa-line);border-radius:8px;padding:12px;margin-bottom:10px;background:#fff}
      .moa-card.soft{background:#fbfcfd}
      .moa-title{font-size:12px;color:#637381;margin-bottom:7px;font-weight:700}
      .moa-btn{border:1px solid rgba(145,158,171,.28);background:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;color:var(--moa-ink)}
      .moa-btn.primary{background:var(--moa-red);color:#fff;border-color:var(--moa-red);box-shadow:0 8px 18px rgba(255,42,59,.18)}
      .moa-btn:disabled{opacity:.45;cursor:not-allowed}
      .moa-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;background:#f2f4f7;color:#344054;font-size:12px}
      .moa-pill.red{background:#fff1f3;color:var(--moa-red)}
      .moa-select{border:1px solid rgba(145,158,171,.32);border-radius:7px;padding:6px 10px;background:#fff}
      .moa-log,.moa-history{border-top:1px solid var(--moa-line);padding:9px 0}
      .moa-log:first-child,.moa-history:first-child{border-top:0}
      .moa-log-time,.moa-sub{font-size:11px;color:#8a96a3}
      .moa-log.error{color:#b42318}.moa-log.warn{color:#b54708}.moa-log.success{color:#067647}
      .moa-fail{font-size:12px;border-top:1px dashed var(--moa-line);padding:7px 0}
    `;
      document.head.appendChild(style);
    }

    const root = document.createElement("div");
    root.id = "magiorix-ops-assistant";
    root.innerHTML = `
      <div class="moa-panel${state.open ? " open" : ""}">
        <div class="moa-head">
          <div class="moa-head-title"><span class="moa-toggle-icon">采</span><span>采集助手</span></div>
          <button class="moa-btn" data-close>收起</button>
        </div>
        <div class="moa-tabs" data-tabs></div>
        <div class="moa-body">
          <section data-tab-panel="assistant"></section>
          <section data-tab-panel="current"></section>
          <section data-tab-panel="history"></section>
        </div>
      </div>
      <button class="moa-toggle" data-open><span class="moa-toggle-icon">采</span><span>采集助手</span></button>
    `;
    document.body.appendChild(root);
    runtime.root = root;
    runtime.panel = root.querySelector(".moa-panel");
    runtime.tabs = root.querySelector("[data-tabs]");
    runtime.assistantBox = root.querySelector('[data-tab-panel="assistant"]');
    runtime.currentBox = root.querySelector('[data-tab-panel="current"]');
    runtime.historyBox = root.querySelector('[data-tab-panel="history"]');
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
    return true;
  }

  function render(options = {}) {
    if (!options.force && runtime.deferRender) {
      runtime.pendingRender = true;
      return;
    }
    if (!ensureUi()) return;
    runtime.panel.classList.toggle("open", state.open);
    renderTabs();
    renderAssistant();
    renderCurrent();
    renderHistory();
  }

  function renderTabs() {
    const tabs = [
      ["assistant", "采集助手"],
      ["current", "当前任务"],
      ["history", "历史记录"],
    ];
    runtime.tabs.innerHTML = tabs.map(([key, label]) => `<button class="moa-tab ${state.activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`).join("");
    runtime.tabs.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTab = button.getAttribute("data-tab");
        saveState();
        render();
      });
    });
    runtime.assistantBox.style.display = state.activeTab === "assistant" ? "" : "none";
    runtime.currentBox.style.display = state.activeTab === "current" ? "" : "none";
    runtime.historyBox.style.display = state.activeTab === "history" ? "" : "none";
  }

  function renderAssistant() {
    const pace = PACE[state.paceMode];
    runtime.assistantBox.innerHTML = `
      <div class="moa-card soft">
        <div class="moa-title">授权检测</div>
        <div class="moa-row">
          ${PLUGINS.map((item) => {
            const status = runtime.auth.get(item.id) || "unknown";
            const label = status === "authorized" ? "可用" : status === "checking" ? "检测中" : status === "unauthorized" ? "不可用" : status === "error" ? "异常" : "未检测";
            return `<button class="moa-btn" data-auth="${item.id}">${item.label} · ${label}</button>`;
          }).join("")}
        </div>
      </div>
      <div class="moa-card">
        <div class="moa-title">采集节奏</div>
        <div class="moa-row">
          <select class="moa-select" data-pace>
            ${Object.entries(PACE).map(([key, item]) => `<option value="${key}" ${key === state.paceMode ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
          <span class="moa-pill">每批 ${pace.batchSize}</span>
          <span class="moa-pill">批间 ${Math.round(pace.batchRestMs / 1000)} 秒</span>
        </div>
        <div class="moa-sub">上传或手动输入开始采集时会自动带入当前节奏。</div>
      </div>
    `;
    runtime.assistantBox.querySelectorAll("[data-auth]").forEach((button) => {
      button.addEventListener("click", () => checkAuth(button.getAttribute("data-auth")));
    });
    const paceSelect = runtime.assistantBox.querySelector("[data-pace]");
    paceSelect.addEventListener("pointerdown", () => {
      runtime.deferRender = true;
    });
    paceSelect.addEventListener("focus", () => {
      runtime.deferRender = true;
    });
    paceSelect.addEventListener("blur", () => {
      setTimeout(flushDeferredRender, 120);
    });
    paceSelect.addEventListener("change", (event) => {
      runtime.deferRender = false;
      state.paceMode = event.target.value;
      log("info", `采集节奏已切换为${PACE[state.paceMode].label}`);
      saveState();
      render({ force: true });
    });
  }

  function renderCurrent() {
    const task = runtime.tasks.get(state.lastTaskId);
    const failed = task?.failed?.length || 0;
    const failures = task?.failed?.slice(-10).reverse() || [];
    runtime.currentBox.innerHTML = `
      <div class="moa-card soft">
        <div class="moa-title">当前任务</div>
        <div class="moa-row">
          <span class="moa-pill ${task ? "red" : ""}">${task ? `${task.current}/${task.total}` : "暂无任务"}</span>
          <span class="moa-pill">成功 ${task?.success || 0}</span>
          <span class="moa-pill">失败 ${failed}</span>
        </div>
        <button class="moa-btn primary" data-retry ${failed ? "" : "disabled"}>重跑失败项</button>
      </div>
      <div class="moa-card">
        <div class="moa-title">最近失败项</div>
        ${failures.length ? failures.map((item) => `<div class="moa-fail"><b>${escapeHtml(item.category.label)}</b><div class="moa-sub">${escapeHtml(item.message || item.url || "")}</div></div>`).join("") : '<div class="moa-sub">暂无失败项</div>'}
      </div>
    `;
    runtime.currentBox.querySelector("[data-retry]").addEventListener("click", () => retryFailed(state.lastTaskId));
  }

  function renderHistory() {
    runtime.historyBox.innerHTML = `
      <div class="moa-card soft">
        <div class="moa-title">历史任务</div>
        ${state.history.length ? state.history.map((item) => `
          <div class="moa-history">
            <div><b>${escapeHtml(item.fileName)}</b></div>
            <div class="moa-sub">${escapeHtml(pluginLabel(item.pluginId))} · ${item.finishedAt} · 成功 ${item.success} · 失败 ${item.failed}</div>
          </div>
        `).join("") : '<div class="moa-sub">暂无历史任务</div>'}
      </div>
      <div class="moa-card">
        <div class="moa-title">事件日志</div>
        <button class="moa-btn" data-clear style="margin-bottom:8px">清空日志</button>
        ${state.logs.slice().reverse().map((entry) => `
          <div class="moa-log ${entry.level}">
            <div class="moa-log-time">${entry.time}</div>
            <div>${escapeHtml(entry.message)}</div>
            ${entry.details ? `<div class="moa-log-time">${escapeHtml(String(entry.details)).slice(0, 180)}</div>` : ""}
          </div>
        `).join("") || '<div class="moa-sub">暂无日志</div>'}
      </div>
    `;
    runtime.historyBox.querySelector("[data-clear]").addEventListener("click", () => {
      state.logs = [];
      saveState();
      render();
    });
  }

  function init() {
    render();
    const bindTimer = setInterval(() => {
      if (bindBridge()) {
        clearInterval(bindTimer);
        log("info", "采集助手已接入");
      }
    }, 300);
    setTimeout(() => clearInterval(bindTimer), 15000);

    setInterval(() => {
      if (isLoginView()) {
        removeUi();
      } else if (!runtime.root || !document.body.contains(runtime.root)) {
        render();
      }
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
