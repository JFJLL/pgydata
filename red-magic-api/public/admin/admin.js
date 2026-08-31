(() => {
  const state = {
    token: localStorage.getItem("magiorixAdminToken") || "",
    view: "overview",
    range: "30d",
    from: "",
    to: "",
    cache: new Map(),
    userPage: 1,
    userPageSize: 10,
    userTotal: 0,
    userKeyword: "",
    userList: [],
    transactionPage: 1,
    transactionPageSize: 10,
    transactionTotal: 0,
    transactionKeyword: "",
    transactionView: "tasks",
    resetUser: null,
    pointsUser: null,
    transactionDetails: new Map(),
  };
  const $ = (id) => document.getElementById(id);
  const VIEW_META = {
    overview: ["magiorix 数据中心", "最近 30 天核心经营与产品使用数据"],
    usersAnalytics: ["用户分析", "用户增长、核心活跃和成熟 cohort 留存"],
    usage: ["功能分析", "核心采集历史与新增产品事件数据"],
    finance: ["充值与积分", "已到账收入、订单创建 cohort 与积分流向"],
    system: ["系统质量", "任务、更新与支付状态的轻量质量视图"],
    userManagement: ["用户管理", "保留搜索、积分调整与密码重置能力"],
    transactions: ["流水记录", "按任务汇总的有效采集消耗记录"],
  };
  const ANALYTICS_VIEWS = new Set(["overview", "usersAnalytics", "usage", "finance", "system"]);
  const endpoint = { overview: "overview", usersAnalytics: "users", usage: "usage", finance: "finance", system: "system" };
  const labels = {
    effectiveActiveUsers: "有效活跃用户",
    newUsers: "新增用户",
    effectiveTasks: "有效任务",
    collectedItems: "成功采集量",
    rechargeRevenueYuan: "充值收入",
    payers: "付费用户",
  };
  const money = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const integer = (value) => Number(value || 0).toLocaleString("zh-CN");
  const percent = (value) => value === null || value === undefined ? "样本不足" : `${Number(value).toFixed(1)}%`;
  const date = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
  const metricValue = (value, formatter = integer) => value === null || value === undefined ? "尚未采集" : formatter(value);
  const cstDateLabel = (value) => {
    if (!value) return "-";
    const shifted = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
    if (Number.isNaN(shifted.getTime())) return "-";
    return shifted.toISOString().slice(0, 10);
  };
  const escape = (value) => String(value ?? "-").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const rangeQuery = () => state.range === "custom" ? `from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}` : `range=${state.range}`;

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || body.code === 401) {
      logout(body.message || "管理员登录已过期，请重新登录");
      throw new Error(body.message || "管理员登录已过期");
    }
    if (!response.ok || body.code !== 200) throw new Error(body.message || "请求失败");
    return body.data;
  }
  function setStatus(id, type, text = "") {
    const el = $(id);
    if (!el) return;
    el.className = `section-status ${type || ""}`;
    el.textContent = text;
  }
  function cacheKey(name) { return `${name}:${state.range}:${state.from}:${state.to}`; }
  async function cached(name, force = false) {
    const key = cacheKey(name), current = state.cache.get(key);
    if (!force && current && Date.now() - current.at < 60000) return current.data;
    const data = await api(`/api/admin/analytics/${endpoint[name]}?${rangeQuery()}`);
    state.cache.set(key, { at: Date.now(), data });
    return data;
  }
  function renderEmpty(id, text = "暂无数据") {
    $(id).innerHTML = `<div class="chart-empty">${escape(text)}</div>`;
  }

  function lineChart(id, rows, unit = "") {
    const el = $(id);
    if (!el) return;
    if (!rows || rows.length === 0 || rows.every((row) => Number(row.value || 0) === 0)) return renderEmpty(id);
    const width = 720, height = 220, pad = { l: 48, r: 16, t: 20, b: 34 }, values = rows.map((row) => Number(row.value || 0));
    const max = Math.max(...values, 1), min = Math.min(...values, 0), span = Math.max(max - min, 1);
    const point = (value, index) => [
      pad.l + (index * (width - pad.l - pad.r)) / Math.max(rows.length - 1, 1),
      pad.t + (max - value) * (height - pad.t - pad.b) / span,
    ];
    const points = values.map(point);
    const line = points.map((p) => p.join(",")).join(" ");
    const area = `${pad.l},${height - pad.b} ${line} ${width - pad.r},${height - pad.b}`;
    const grid = [0, .5, 1].map((ratio) => {
      const y = pad.t + ratio * (height - pad.t - pad.b);
      const value = max - ratio * span;
      return `<line class="chart-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}"/><text class="chart-label" x="2" y="${y + 4}">${escape(Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 }))}${unit}</text>`;
    }).join("");
    const dots = points.map((p, index) => `<circle class="chart-point" cx="${p[0]}" cy="${p[1]}" r="3.5" data-idx="${index}"></circle>`).join("");
    const xLabels = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((index) => `<text class="chart-label" text-anchor="middle" x="${points[index][0]}" y="${height - 8}">${rows[index].day.slice(5)}</text>`)
      .join("");

    el.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">
        <g>${grid}</g>
        <polygon class="chart-area" points="${area}"/>
        <polyline class="chart-line" points="${line}"/>
        <line class="chart-cursor-line" x1="0" x2="0" y1="${pad.t}" y2="${height - pad.b}" style="display:none;"/>
        ${dots}
        <circle class="chart-highlight-dot" cx="0" cy="0" r="5" style="display:none;"/>
        ${xLabels}
      </svg>
      <div class="chart-tooltip"></div>
    `;

    const svg = el.querySelector(".chart-svg");
    const cursorLine = el.querySelector(".chart-cursor-line");
    const highlightDot = el.querySelector(".chart-highlight-dot");
    const tooltip = el.querySelector(".chart-tooltip");

    function onMove(e) {
      const rect = svg.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const mouseXInSvg = Math.max(0, Math.min(width, ((clientX - rect.left) / rect.width) * width));

      let closestIdx = 0;
      let minDistance = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i][0] - mouseXInSvg);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }
      const pt = points[closestIdx];
      if (!pt) return;

      cursorLine.setAttribute("x1", pt[0]);
      cursorLine.setAttribute("x2", pt[0]);
      cursorLine.style.display = "block";

      highlightDot.setAttribute("cx", pt[0]);
      highlightDot.setAttribute("cy", pt[1]);
      highlightDot.style.display = "block";

      const valFormatted = Number(values[closestIdx]).toLocaleString("zh-CN", { minimumFractionDigits: unit === " 元" ? 2 : 0, maximumFractionDigits: 2 });
      tooltip.innerHTML = `<div class="tooltip-date">${escape(rows[closestIdx].day)}</div><div class="tooltip-value">${escape(valFormatted)}${unit}</div>`;
      tooltip.classList.add("visible");

      const screenX = (pt[0] / width) * rect.width;
      const screenY = (pt[1] / height) * rect.height;
      tooltip.style.left = `${screenX}px`;
      tooltip.style.top = `${screenY}px`;
      if (screenX < 60) {
        tooltip.style.transform = "translate(0, -125%)";
      } else if (screenX > rect.width - 60) {
        tooltip.style.transform = "translate(-100%, -125%)";
      } else {
        tooltip.style.transform = "translate(-50%, -125%)";
      }
    }

    function onLeave() {
      cursorLine.style.display = "none";
      highlightDot.style.display = "none";
      tooltip.classList.remove("visible");
    }

    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("touchmove", onMove, { passive: true });
    svg.addEventListener("mouseleave", onLeave);
    svg.addEventListener("touchend", onLeave);
  }

  function renderKpis(container, entries, moneyKeys = new Set()) {
    $(container).innerHTML = entries.map(([key, item]) => {
      const display = moneyKeys.has(key) ? money(item.value) : integer(item.value);
      const trend = item.changeType === "new" ? "新增" : item.changePercent > 0 ? `↑ ${item.changePercent}%` : item.changePercent < 0 ? `↓ ${Math.abs(item.changePercent)}%` : "持平";
      const cls = item.changeType === "new" ? "trend-new" : item.changeType === "up" ? "trend-up" : item.changeType === "down" ? "trend-down" : "";
      return `<div class="kpi"><div class="kpi-label">${labels[key] || key}</div><div class="kpi-value">${display}</div><div class="kpi-change ${cls}">较上一等长周期：${trend}</div></div>`;
    }).join("");
  }
  function miniCard(label, value, hint = "") { return `<div class="mini-kpi"><div class="mini-kpi-label">${escape(label)}</div><div class="mini-kpi-value">${value}</div>${hint ? `<div class="kpi-change">${escape(hint)}</div>` : ""}</div>`; }
  function htmlTable(headers, rows) { return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">暂无数据</td></tr>`}</tbody></table>`; }

  function setupCustomSelect(selectEl) {
    if (!selectEl || selectEl.dataset.customized === "1") return;
    selectEl.dataset.customized = "1";
    selectEl.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";

    const labelSpan = document.createElement("span");
    labelSpan.className = "custom-select-label";

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "custom-select-arrow";

    trigger.appendChild(labelSpan);
    trigger.appendChild(arrowSpan);
    wrapper.appendChild(trigger);

    const menu = document.createElement("div");
    menu.className = "custom-select-menu";
    wrapper.appendChild(menu);

    function syncOptions() {
      menu.innerHTML = "";
      const options = Array.from(selectEl.options);
      const selected = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
      labelSpan.textContent = selected ? selected.text : "";

      options.forEach((opt) => {
        const item = document.createElement("div");
        item.className = `custom-select-option ${opt.selected ? "selected" : ""}`;
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          syncOptions();
          wrapper.classList.remove("open");
        });
        menu.appendChild(item);
      });
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains("open");
      document.querySelectorAll(".custom-select.open").forEach((el) => el.classList.remove("open"));
      if (!isOpen) {
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 170 || wrapper.closest(".pager")) {
          wrapper.classList.add("drop-up");
        } else {
          wrapper.classList.remove("drop-up");
        }
        wrapper.classList.add("open");
      }
    });

    selectEl.addEventListener("change", syncOptions);
    syncOptions();
  }

  function initAllCustomSelects() {
    document.querySelectorAll("select").forEach(setupCustomSelect);
  }

  async function loadOverview(force = false) {
    setStatus("overviewStatus", "loading", "正在加载数据总览…");
    try {
      const [data, usage, finance] = await Promise.all([cached("overview", force), cached("usage", force), cached("finance", force)]);
      renderKpis("overviewKpis", Object.entries(data.kpis), new Set(["rechargeRevenueYuan"]));
      lineChart("overviewChart", data.trends[$("overviewMetric").value], $("overviewMetric").value === "rechargeRevenueYuan" ? " 元" : "");
      const features = usage.coreCollection.byFeature.map((row) => `<tr><td>${escape(row.featureLabel)}</td><td>${integer(row.users)}</td><td>${integer(row.tasks)}</td><td>${integer(row.items)}</td><td>${integer(row.points)}</td><td><div class="progress"><span style="width:${Math.min(100, row.share)}%"></span></div> ${row.share}%</td></tr>`).join("");
      $("overviewFeatures").innerHTML = htmlTable(["功能", "使用用户", "任务", "采集量", "积分", "占比"], features);
      const r = finance.recharge, alipay = r.byChannel.find((x) => x.channel === "alipay"), wxpay = r.byChannel.find((x) => x.channel === "wxpay");
      $("overviewFinance").innerHTML = `<div class="metric-list"><div><span>创建订单</span><strong>${integer(r.createdOrders)}</strong></div><div><span>到账订单</span><strong>${integer(r.creditedOrders)}</strong></div><div><span>支付转化</span><strong>${percent(r.paymentConversionRate)}</strong></div><div><span>支付宝收入</span><strong>${money(alipay?.revenueYuan)}</strong></div><div><span>微信收入</span><strong>${money(wxpay?.revenueYuan)}</strong></div><div><span>AOV / ARPPU</span><strong>${r.aovYuan === null ? "-" : money(r.aovYuan)} / ${r.arppuYuan === null ? "-" : money(r.arppuYuan)}</strong></div></div>`;
      setStatus("overviewStatus", "", "");
    } catch (error) { setStatus("overviewStatus", "error", `数据总览加载失败：${error.message}`); }
  }
  async function loadUsersAnalytics(force = false) {
    setStatus("usersAnalyticsStatus", "loading", "正在加载用户分析…");
    try {
      const data = await cached("usersAnalytics", force);
      $("usersAnalyticsKpis").innerHTML = [miniCard("总用户", integer(data.totalUsers)), miniCard("正常账号", integer(data.activeAccounts)), miniCard("注销账号", integer(data.deletedUsers)), miniCard("DAU", integer(data.dau), `截至 ${data.activityAnchorDate || data.period?.to || "-"}`), miniCard("WAU", integer(data.wau), `截至 ${data.activityAnchorDate || data.period?.to || "-"}`), miniCard("MAU", integer(data.mau), `截至 ${data.activityAnchorDate || data.period?.to || "-"}`)].join("");
      lineChart("newUserChart", data.newUserTrend.map((row) => ({ day: row.day, value: row.newUsers })));
      lineChart("activeUserChart", data.effectiveActiveTrend);
      $("retentionCards").innerHTML = [miniCard("新用户已激活率", percent(data.activationRate), `已激活 ${integer(data.activatedNewUsers)} / 新增 ${integer(data.newUsers)}`), ...[["D1", data.retention.d1], ["D7", data.retention.d7], ["D30", data.retention.d30]].map(([name, item]) => miniCard(name, percent(item.value), item.value === null ? "样本不足" : `${integer(item.retainedUsers)} / ${integer(item.cohortSize)}`))].join("");
      setStatus("usersAnalyticsStatus", "", "");
    } catch (error) { setStatus("usersAnalyticsStatus", "error", `用户分析加载失败：${error.message}`); }
  }
  function coverageText(capability, label) {
    if (!capability || !capability.available) return `${label}尚未采集`;
    const start = cstDateLabel(capability.coverageStartAt);
    if (capability.periodStatus === "before") return `该时间范围早于${label}埋点覆盖范围（${start} 起）`;
    if (capability.periodStatus === "partial") return `${label}仅覆盖 ${start} 起的数据`;
    return `${label}覆盖开始日期：${start}`;
  }
  async function loadUsage(force = false) {
    setStatus("usageStatus", "loading", "正在加载功能分析…");
    try {
      const data = await cached("usage", force), core = data.coreCollection;
      $("coreCollectionKpis").innerHTML = [miniCard("有效用户", integer(core.effectiveUsers)), miniCard("有效任务", integer(core.effectiveTasks)), miniCard("成功采集量", integer(core.collectedItems)), miniCard("积分消耗", integer(core.consumedPoints)), miniCard("平均任务规模", core.avgItemsPerTask === null ? "-" : integer(core.avgItemsPerTask))].join("");
      $("featureRows").innerHTML = core.byFeature.map((row) => `<tr><td>${escape(row.featureLabel)}</td><td>${integer(row.users)}</td><td>${integer(row.tasks)}</td><td>${integer(row.items)}</td><td>${integer(row.points)}</td><td>${row.avgItemsPerTask === null ? "-" : integer(row.avgItemsPerTask)}</td><td>${row.share}%</td></tr>`).join("");
      const events = data.eventAnalytics, lifecycle = events.capabilities?.taskLifecycle, exporting = events.capabilities?.export, appOpen = events.capabilities?.appOpen;
      const metric = (name, value, formatter = integer) => `<div><span>${name}</span><strong>${metricValue(value, formatter)}</strong></div>`;
      if (!lifecycle?.available && !exporting?.available && !appOpen?.available) { $("eventAnalytics").innerHTML = `<div class="event-cover">产品事件尚未采集。以下指标将在客户端埋点版本上线后开始累计。</div>`; }
      else {
        $("eventAnalytics").innerHTML = `<div class="event-cover">${escape(coverageText(lifecycle, "任务生命周期"))}。${escape(coverageText(exporting, "导出"))}。${escape(coverageText(appOpen, "软件启动"))}。埋点失败不会影响采集、积分、导出、登录或更新。</div><div class="event-grid">${metric("软件启动", appOpen?.periodStatus === "before" ? null : events.appOpens)}${metric("任务启动", lifecycle?.periodStatus === "before" ? null : events.tasksStarted)}${metric("任务完成", lifecycle?.periodStatus === "before" ? null : events.tasksCompleted)}${metric("任务失败", lifecycle?.periodStatus === "before" ? null : events.tasksFailed)}${metric("任务取消", lifecycle?.periodStatus === "before" ? null : events.tasksCancelled)}${metric("导出完成", exporting?.periodStatus === "before" ? null : events.exportsCompleted)}${metric("任务完成率", lifecycle?.periodStatus === "before" ? null : events.taskCompletionRate, percent)}${metric("条目成功率", lifecycle?.periodStatus === "before" ? null : events.itemSuccessRate, percent)}</div>`;
      }
      setStatus("usageStatus", "", "");
    } catch (error) { setStatus("usageStatus", "error", `功能分析加载失败：${error.message}`); }
  }
  async function loadFinance(force = false) {
    setStatus("financeStatus", "loading", "正在加载充值与积分…");
    try {
      const data = await cached("finance", force), r = data.recharge, p = data.points;
      $("financeKpis").innerHTML = [miniCard("已到账充值收入", money(r.revenueYuan)), miniCard("付费用户", integer(r.payers)), miniCard("期间到账订单", integer(r.creditedOrders)), miniCard("AOV", r.aovYuan === null ? "-" : money(r.aovYuan)), miniCard("ARPPU", r.arppuYuan === null ? "-" : money(r.arppuYuan)), miniCard("首次付费用户", integer(r.firstTimePayers)), miniCard("复购付费用户", integer(r.repeatPayers))].join("");
      
      const width = Math.max(r.createdOrders, 1);
      const funnelStages = [
        { label: "创建订单", count: r.createdOrders, color: "var(--red)", widthPct: 100, tag: "100%" },
        { label: "已到账 (Cohort)", count: r.creditedCreatedOrders, color: "var(--green)", widthPct: Math.min(100, Math.max(3, (r.creditedCreatedOrders / width) * 100)), tag: percent(r.paymentConversionRate) },
        { label: "待支付 (Pending)", count: r.pendingOrders, color: "var(--orange)", widthPct: Math.min(100, Math.max(3, (r.pendingOrders / width) * 100)), tag: percent((r.pendingOrders / width) * 100) },
        { label: "已关闭 (Closed)", count: r.closedOrders, color: "#8d959f", widthPct: Math.min(100, Math.max(3, (r.closedOrders / width) * 100)), tag: percent((r.closedOrders / width) * 100) },
      ];
      $("paymentFunnel").innerHTML = `
        <div class="funnel-container">
          ${funnelStages.map((s) => `
            <div class="funnel-row">
              <div class="funnel-label">${escape(s.label)}</div>
              <div class="funnel-track"><div class="funnel-fill" style="width:${s.widthPct}%;background:${s.color}"></div></div>
              <div class="funnel-meta"><strong class="funnel-count">${integer(s.count)}</strong><span class="funnel-tag">${s.tag}</span></div>
            </div>
          `).join("")}
        </div>
        <div class="funnel-footer">
          <div class="funnel-rate-box">
            <span class="funnel-rate-label">创建 Cohort 转化率</span>
            <strong class="funnel-rate-val">${percent(r.paymentConversionRate)}</strong>
          </div>
          <p class="funnel-note">按选定周期内创建的订单跟踪最终支付结果；期间到账订单与收入按实际 credited_at 统计。</p>
        </div>
      `;

      $("pointsPanel").innerHTML = [["当前全站积分余额", integer(p.totalCurrentBalance)], ["期间消耗", integer(p.consumed)], ["充值基础积分", integer(p.creditedBase)], ["套餐赠送", integer(p.creditedGift)], ["活动赠送", integer(p.creditedPromotion)], ["后台加积分", integer(p.adminAdded)], ["后台扣积分", integer(p.adminDeducted)]].map(([name, value]) => `<div><span>${name}</span><strong>${value}</strong></div>`).join("");
      $("channelTable").innerHTML = htmlTable(["渠道", "创建订单", "创建 cohort 已到账", "创建 cohort 转化率", "期间到账订单", "期间收入", "期间付费用户", "期间 AOV"], r.byChannel.map((row) => `<tr><td>${escape(row.label)}</td><td>${integer(row.createdOrders)}</td><td>${integer(row.creditedCreatedOrders)}</td><td>${percent(row.paymentConversionRate)}</td><td>${integer(row.creditedOrders)}</td><td>${money(row.revenueYuan)}</td><td>${integer(row.payers)}</td><td>${row.aovYuan === null ? "-" : money(row.aovYuan)}</td></tr>`).join(""));
      $("packageTable").innerHTML = htmlTable(["套餐", "创建订单", "创建 cohort 已到账", "创建 cohort 转化率", "期间到账订单", "期间收入", "期间付费用户", "期间 AOV", "基础积分", "套餐赠送", "活动赠送"], r.byPackage.map((row) => `<tr><td>${escape(row.packageLabel)}</td><td>${integer(row.createdOrders)}</td><td>${integer(row.creditedCreatedOrders)}</td><td>${percent(row.paymentConversionRate)}</td><td>${integer(row.creditedOrders)}</td><td>${money(row.revenueYuan)}</td><td>${integer(row.payers)}</td><td>${row.aovYuan === null ? "-" : money(row.aovYuan)}</td><td>${integer(row.basePoints)}</td><td>${integer(row.giftPoints)}</td><td>${integer(row.promotionPoints)}</td></tr>`).join(""));
      const promo = r.firstRechargePromo;
      $("promoPanel").innerHTML = [miniCard("优惠创建订单", integer(promo.createdOrders)), miniCard("期间到账订单", integer(promo.creditedOrders)), miniCard("使用优惠用户", integer(promo.users)), miniCard("额外首充积分", integer(promo.extraPoints)), miniCard("优惠创建 cohort 转化", percent(promo.paymentConversionRate))].join("");
      setStatus("financeStatus", "", "");
    } catch (error) { setStatus("financeStatus", "error", `充值与积分加载失败：${error.message}`); }
  }
  async function loadSystem(force = false) {
    setStatus("systemStatus", "loading", "正在加载系统质量…");
    try {
      const data = await cached("system", force), caps = data.analyticsCoverage?.capabilities || {}; const lifecycle = caps.taskLifecycle, appOpen = caps.appOpen, update = caps.update;
      const metric = (name, value, formatter = integer) => `<div><span>${name}</span><strong>${metricValue(value, formatter)}</strong></div>`;
      const lifecycleHtml = lifecycle?.available ? `<div class="event-cover">${escape(coverageText(lifecycle, "任务生命周期"))}</div><div class="event-grid">${metric("任务失败", lifecycle.periodStatus === "before" ? null : data.taskFailures)}${metric("任务取消", lifecycle.periodStatus === "before" ? null : data.taskCancellations)}${metric("任务完成率", lifecycle.periodStatus === "before" ? null : data.taskCompletionRate, percent)}${metric("条目成功率", lifecycle.periodStatus === "before" ? null : data.itemSuccessRate, percent)}</div>${data.appVersions ? `<h3>客户端版本分布</h3>${htmlTable(["版本", "用户", "事件"], data.appVersions.map((row) => `<tr><td>${escape(row.appVersion)}</td><td>${integer(row.users)}</td><td>${integer(row.events)}</td></tr>`).join(""))}` : ""}` : `<div class="event-cover">任务生命周期尚未采集。</div>`;
      const payment = data.payment;
      $("systemContent").innerHTML = `${lifecycleHtml}<div class="detail-section"><h3>软件启动与更新</h3><div class="event-cover">${escape(coverageText(appOpen, "软件启动"))}。${escape(coverageText(update, "更新"))}。</div><div class="event-grid">${metric("软件启动", appOpen?.periodStatus === "before" ? null : data.appOpens)}${metric("更新成功", update?.periodStatus === "before" ? null : data.updateSuccess)}${metric("更新失败", update?.periodStatus === "before" ? null : data.updateFailures)}</div></div><div class="detail-section"><h3>当前支付异常快照</h3><p class="event-cover">不受上方历史日期范围影响。</p><div class="mini-kpi-grid">${miniCard("当前待支付", integer(payment.pendingOrders))}${miniCard("当前超时 Pending", integer(payment.stalePendingOrders), "使用订单实际 expires_at 判断")}${miniCard("当前查询错误状态", integer(payment.queryErrors))}${miniCard("当前人工复核", integer(payment.manualReviewOrders))}</div></div>`;
      setStatus("systemStatus", "", "");
    } catch (error) { setStatus("systemStatus", "error", `系统质量加载失败：${error.message}`); }
  }
  async function loadUsers() {
    const params = new URLSearchParams({ page: String(state.userPage), pageSize: String(state.userPageSize), keyword: state.userKeyword });
    const data = await api(`/api/admin/users?${params}`);
    state.userTotal = data.total;
    state.userList = data.list || [];
    const pages = Math.max(1, Math.ceil(data.total / state.userPageSize));
    $("userRows").innerHTML = data.list.map((user) => `
      <tr>
        <td><strong>${escape(user.nickname || "未命名用户")}</strong><br/><span class="kpi-label">${escape(user.phone)}</span></td>
        <td><span class="badge ${Number(user.status) === 1 ? "" : "deleted"}">${Number(user.status) === 1 ? "正常" : "已注销"}</span></td>
        <td>${integer(user.balance)}</td>
        <td>${date(user.lastEffectiveUse)}</td>
        <td>${integer(user.effectiveTasks)}</td>
        <td>${integer(user.collectedItems)}</td>
        <td>${money(user.totalRechargeYuan)}</td>
        <td>${integer(user.rechargeCount)}</td>
        <td>${date(user.createdAt)}</td>
        <td>
          <div class="table-actions">
            <div class="action-group">
              <button class="text-button" data-user-detail="${user.id}">详情</button>
              <button class="text-button" data-user-points="${user.id}" ${Number(user.status) === 1 ? "" : "disabled"}>积分</button>
            </div>
            <button class="text-button text-button-reset" data-user-reset="${user.id}" ${Number(user.status) === 1 ? "" : "disabled"}>重置密码</button>
          </div>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="10">暂无用户</td></tr>`;
    $("userTableMeta").textContent = `共 ${integer(data.total)} 位用户 · 第 ${data.page} / ${pages} 页`;
    $("usersPrev").disabled = state.userPage <= 1;
    $("usersNext").disabled = state.userPage >= pages;
  }
  async function loadTransactions() {
    const params = new URLSearchParams({
      page: String(state.transactionPage),
      pageSize: String(state.transactionPageSize),
      keyword: state.transactionKeyword,
      view: state.transactionView,
    });
    const data = await api(`/api/admin/user-transactions?${params}`);
    state.transactionTotal = data.total;
    const pages = Math.max(1, Math.ceil(data.total / state.transactionPageSize));
    state.transactionDetails.clear();
    for (const row of data.list) if (row.detail) state.transactionDetails.set(String(row.id), row.detail);
    $("transactionRows").innerHTML = data.list.map((row) => `
      <tr>
        <td>${escape(row.nickname || row.phone)}</td>
        <td>${date(row.createdAt)}</td>
        <td>${integer(row.consumedQuota)}</td>
        <td>${row.balanceAfter ?? "-"}</td>
        <td>${escape(row.source || row.detailType || row.operation || "-")}</td>
        <td>${escape(row.taskId || "-")}</td>
        <td>${escape(row.detailSummary || row.remark || "-")}</td>
        <td>${row.detail ? `<button class="text-button" data-transaction-detail="${escape(row.id)}">查看</button>` : "-"}</td>
      </tr>
    `).join("") || `<tr><td colspan="8">暂无流水</td></tr>`;
    $("transactionMeta").textContent = `共 ${integer(data.total)} 条流水 · 第 ${data.page} / ${pages} 页`;
    $("transactionsPrev").disabled = state.transactionPage <= 1;
    $("transactionsNext").disabled = state.transactionPage >= pages;
  }
  async function loadView(force = false) {
    if (state.view === "overview") return loadOverview(force);
    if (state.view === "usersAnalytics") return loadUsersAnalytics(force);
    if (state.view === "usage") return loadUsage(force);
    if (state.view === "finance") return loadFinance(force);
    if (state.view === "system") return loadSystem(force);
    if (state.view === "userManagement") return loadUsers();
    if (state.view === "transactions") return loadTransactions();
  }
  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
    document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
    const [title, subtitle] = VIEW_META[view];
    $("pageTitle").textContent = title;
    $("pageSubtitle").textContent = subtitle;
    loadView().catch((error) => alert(error.message));
  }
  function showModal(id, visible) { $(id).classList.toggle("hidden", !visible); }
  async function showUserDetail(userId) {
    showModal("userDetailModal", true);
    $("userDetailContent").innerHTML = "正在加载…";
    try {
      const data = await api(`/api/admin/users/${userId}/analytics`), u = data.user, usage = data.usage, recharge = data.recharge;
      $("userDetailContent").innerHTML = `<div class="detail-grid"><div><span>用户</span><strong>${escape(u.nickname || "未命名用户")} · ${escape(u.phone)}</strong></div><div><span>账号状态</span><strong>${Number(u.status) === 1 ? "正常" : "已注销"}</strong></div><div><span>注册时间</span><strong>${date(u.createdAt)}</strong></div><div><span>当前积分</span><strong>${integer(u.balance)}</strong></div><div><span>最近有效使用</span><strong>${date(usage.lastEffectiveUse)}</strong></div><div><span>近30天有效活跃日</span><strong>${integer(usage.activeDaysLast30)}</strong></div><div><span>累计有效任务</span><strong>${integer(usage.effectiveTasks)}</strong></div><div><span>累计采集量 / 消耗</span><strong>${integer(usage.collectedItems)} / ${integer(usage.consumedPoints)}</strong></div><div><span>最常用功能</span><strong>${escape(usage.mostUsedFeature?.label || "-")}</strong></div><div><span>累计充值</span><strong>${money(recharge.totalYuan)}</strong></div><div><span>充值次数</span><strong>${integer(recharge.count)}</strong></div><div><span>首次 / 最后充值</span><strong>${date(recharge.firstRechargeAt)}<br/>${date(recharge.lastRechargeAt)}</strong></div></div><div class="detail-section"><h3>最近任务</h3>${htmlTable(["功能", "采集量", "完成时间"], data.recentTasks.map((row) => `<tr><td>${escape(row.feature.label)}</td><td>${integer(row.items)}</td><td>${date(row.finishedAt)}</td></tr>`).join(""))}</div><div class="detail-section"><h3>最近充值</h3>${htmlTable(["套餐", "渠道", "金额", "到账时间"], data.recentRecharge.map((row) => `<tr><td>${escape(row.packageId)}</td><td>${escape(row.channel)}</td><td>${money(row.amountYuan)}</td><td>${date(row.creditedAt)}</td></tr>`).join(""))}</div>`;
    } catch (error) { $("userDetailContent").textContent = `加载失败：${error.message}`; }
  }
  function openAdjustPointsModal(userId) {
    const user = (state.userList || []).find((u) => String(u.id) === String(userId));
    state.pointsUser = user || { id: userId, nickname: `用户 ${userId}`, phone: "", balance: 0 };
    $("adjustPointsTarget").textContent = `目标用户：${escape(state.pointsUser.nickname || "未命名")} (${escape(state.pointsUser.phone || "-")}) · 当前可用积分：${integer(state.pointsUser.balance)}`;
    $("adjustPointsDelta").value = "100";
    $("adjustPointsRemark").value = "管理员加积分";
    $("adjustPointsMessage").textContent = "";
    showModal("adjustPointsModal", true);
  }

  function showTransactionDetail(id) {
    const detail = state.transactionDetails.get(String(id));
    if (!detail) return;
    const fields = [
      ["摘要", detail.summary], ["输入类型", detail.inputType], ["功能", `${detail.pluginId || "-"} · ${detail.taskType || "-"}`],
      ["文件名", detail.fileName], ["计划条数", detail.totalRows], ["有效条数", detail.validCount], ["任务 ID", detail.taskId],
      ["条目数", detail.itemCount], ["条目范围", detail.itemRange], ["开始时间", date(detail.startedAt)], ["完成时间", date(detail.finishedAt)], ["已截断", detail.truncated ? "是" : "否"],
    ];
    $("transactionDetailContent").innerHTML = `<p class="event-cover">详情为服务端脱敏结构；不展示 rows、URL 或原始采集内容。</p><div class="detail-grid">${fields.map(([name, value]) => `<div><span>${escape(name)}</span><strong>${escape(value ?? "-")}</strong></div>`).join("")}</div>`;
    showModal("transactionDetailModal", true);
  }
  async function login(event) {
    event.preventDefault();
    $("loginBtn").disabled = true;
    $("loginMessage").textContent = "";
    try {
      const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value }) });
      state.token = data.token;
      localStorage.setItem("magiorixAdminToken", state.token);
      $("loginView").classList.add("hidden");
      $("adminView").classList.remove("hidden");
      await loadView();
    } catch (error) { $("loginMessage").textContent = error.message; }
    finally { $("loginBtn").disabled = false; }
  }
  function logout(message = "") {
    state.token = "";
    state.cache.clear();
    localStorage.removeItem("magiorixAdminToken");
    $("adminView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    if (message && $("loginMessage")) $("loginMessage").textContent = message;
  }

  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", () => { state.cache.clear(); loadView(true).catch((e) => alert(e.message)); });
  $("nav").addEventListener("click", (event) => { const button = event.target.closest("[data-view]"); if (button) switchView(button.dataset.view); });
  $("overviewMetric").addEventListener("change", () => {
    const data = state.cache.get(cacheKey("overview"))?.data;
    if (data) lineChart("overviewChart", data.trends[$("overviewMetric").value], $("overviewMetric").value === "rechargeRevenueYuan" ? " 元" : "");
  });
  document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
    state.range = button.dataset.range;
    state.from = state.to = "";
    document.querySelectorAll("[data-range]").forEach((item) => item.classList.toggle("selected", item === button));
    state.cache.clear();
    loadView().catch((e) => alert(e.message));
  }));
  $("customRangeBtn").addEventListener("click", () => showModal("customRangeModal", true));
  $("customRangeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.range = "custom";
    state.from = $("customFrom").value;
    state.to = $("customTo").value;
    if (!state.from || !state.to || state.to < state.from) return alert("请选择有效的日期范围");
    state.cache.clear();
    showModal("customRangeModal", false);
    loadView().catch((e) => alert(e.message));
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => showModal(button.dataset.close, false)));
  document.querySelectorAll(".modal-backdrop").forEach((el) => el.addEventListener("click", (event) => { if (event.target === el) showModal(el.id, false); }));

  // 用户管理事件绑定
  $("userSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.userKeyword = $("userKeyword").value.trim();
    state.userPage = 1;
    loadUsers().catch((e) => alert(e.message));
  });
  $("usersPrev").addEventListener("click", () => {
    state.userPage = Math.max(1, state.userPage - 1);
    loadUsers().catch((e) => alert(e.message));
  });
  $("usersNext").addEventListener("click", () => {
    state.userPage += 1;
    loadUsers().catch((e) => alert(e.message));
  });
  $("usersPageSize").addEventListener("change", (e) => {
    state.userPageSize = Number(e.target.value) || 10;
    state.userPage = 1;
    loadUsers().catch((e) => alert(e.message));
  });
  $("userRows").addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || target.disabled) return;
    if (target.dataset.userDetail) showUserDetail(target.dataset.userDetail);
    if (target.dataset.userPoints) openAdjustPointsModal(target.dataset.userPoints);
    if (target.dataset.userReset) {
      state.resetUser = target.dataset.userReset;
      $("resetPasswordTarget").textContent = "用户 ID：" + state.resetUser;
      showModal("resetPasswordModal", true);
    }
  });

  // 积分调整表单提交
  $("adjustPointsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.pointsUser) return;
    const delta = Number($("adjustPointsDelta").value);
    if (!Number.isFinite(delta) || delta === 0) {
      $("adjustPointsMessage").textContent = "请输入非 0 的有效整数（正数加分，负数扣分）";
      return;
    }
    const remark = $("adjustPointsRemark").value.trim() || (delta > 0 ? "管理员加积分" : "管理员扣积分");
    try {
      await api(`/api/admin/users/${state.pointsUser.id}/add-points`, {
        method: "POST",
        body: JSON.stringify({ delta, remark }),
      });
      showModal("adjustPointsModal", false);
      state.cache.clear();
      await loadUsers();
    } catch (error) {
      $("adjustPointsMessage").textContent = error.message;
    }
  });

  // 重置密码表单提交
  $("resetPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("resetPasswordValue").value;
    if (password !== $("resetPasswordConfirmValue").value) return $("resetPasswordMessage").textContent = "两次输入的密码不一致";
    try {
      await api(`/api/admin/users/${state.resetUser}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword: password }) });
      showModal("resetPasswordModal", false);
      alert("密码已重置，用户当前登录已失效");
    } catch (error) { $("resetPasswordMessage").textContent = error.message; }
  });

  // 流水记录事件绑定
  $("transactionRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-transaction-detail]");
    if (button) showTransactionDetail(button.dataset.transactionDetail);
  });
  $("transactionSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.transactionKeyword = $("transactionKeyword").value.trim();
    state.transactionView = $("transactionView").value;
    state.transactionPage = 1;
    loadTransactions().catch((e) => alert(e.message));
  });
  $("transactionsPrev").addEventListener("click", () => {
    state.transactionPage = Math.max(1, state.transactionPage - 1);
    loadTransactions().catch((e) => alert(e.message));
  });
  $("transactionsNext").addEventListener("click", () => {
    state.transactionPage += 1;
    loadTransactions().catch((e) => alert(e.message));
  });
  $("transactionsPageSize").addEventListener("change", (e) => {
    state.transactionPageSize = Number(e.target.value) || 10;
    state.transactionPage = 1;
    loadTransactions().catch((e) => alert(e.message));
  });

  // 点击外部关闭自定义下拉框
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select")) {
      document.querySelectorAll(".custom-select.open").forEach((el) => el.classList.remove("open"));
    }
  });

  initAllCustomSelects();

  if (state.token) {
    $("loginView").classList.add("hidden");
    $("adminView").classList.remove("hidden");
    loadView().catch(() => logout("管理员登录已过期，请重新登录"));
  }
})();
