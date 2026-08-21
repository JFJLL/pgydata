/* magiorix 网页充值中心（无构建，hash 路由） */
(function () {
  "use strict";

  var AUTH_KEY = "magiorix-recharge-auth";
  var ORDER_CACHE_KEY = "magiorix-recharge-orders";
  var POLL_INTERVAL_MS = 3000;
  var POLL_QUERY_AFTER_MS = 15000;
  var POLL_MAX_ATTEMPTS = 60;

  // ---------- 会话 ----------
  function getAuth() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.token) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function setAuth(auth) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth || {}));
  }
  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  }
  function getToken() {
    var auth = getAuth();
    return auth ? auth.token : "";
  }
  function getUser() {
    var auth = getAuth();
    return auth && auth.userInfo ? auth.userInfo : null;
  }
  function setUserInfo(userInfo) {
    var auth = getAuth();
    if (!auth) return;
    auth.userInfo = userInfo;
    setAuth(auth);
  }

  // 二维码只在创建订单时返回，这里按订单号缓存创建快照，供支付页/继续支付渲染。
  function cacheOrder(payload) {
    try {
      var map = JSON.parse(localStorage.getItem(ORDER_CACHE_KEY) || "{}");
      map[payload.orderNo] = Object.assign({ cachedAt: Date.now() }, payload);
      localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }
  function getCachedOrder(orderNo) {
    try {
      var map = JSON.parse(localStorage.getItem(ORDER_CACHE_KEY) || "{}");
      var item = map[orderNo];
      if (!item) return null;
      if (Date.now() - (item.cachedAt || 0) > 2 * 60 * 60 * 1000) {
        delete map[orderNo];
        localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(map));
        return null;
      }
      return item;
    } catch (e) { return null; }
  }

  // ---------- API ----------
  function ApiError(message, payload) {
    this.name = "ApiError";
    this.message = message || "请求失败";
    this.payload = payload || null;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function api(path, options) {
    options = options || {};
    var token = getToken();
    var headers = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.satoken = token;
    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      var newToken = res.headers.get("x-new-token");
      if (newToken) {
        var auth = getAuth() || {};
        auth.token = newToken;
        setAuth(auth);
      }
      return res.json().catch(function () { return null; }).then(function (payload) {
        if (!payload) throw new ApiError("请求失败（HTTP " + res.status + "）");
        if (payload.code === 401) {
          clearAuth();
          toast("登录已过期，请重新登录", "error");
          location.hash = "#/login";
          throw new ApiError(payload.message || "登录已过期", payload);
        }
        if (payload.code !== 200) throw new ApiError(payload.message || "请求失败", payload);
        return payload.data;
      });
    });
  }

  function apiGet(path) { return api(path); }
  function apiPost(path, body) { return api(path, { method: "POST", body: body }); }

  // ---------- 工具 ----------
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtTime(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function fmtMoney(cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return "0.00";
    return (n / 100).toFixed(2);
  }
  function fmtCount(n) {
    return Number(n || 0).toLocaleString("zh-CN");
  }
  function parseHash() {
    var hash = location.hash || "#/";
    var qIndex = hash.indexOf("?");
    var path = qIndex >= 0 ? hash.slice(1, qIndex) : hash.slice(1);
    var params = {};
    if (qIndex >= 0) {
      new URLSearchParams(hash.slice(qIndex + 1)).forEach(function (v, k) { params[k] = v; });
    }
    if (!path || path === "/") path = "/recharge";
    return { path: path, params: params };
  }
  function go(path) {
    location.hash = "#" + path;
  }
  function parsePhone(value) {
    var phone = String(value || "").trim();
    return /^1[3-9]\d{9}$/.test(phone) ? phone : "";
  }
  function isStrongPassword(value) {
    return typeof value === "string" && value.length >= 8 && value.length <= 64;
  }
  function statusBadge(order) {
    var status = Number(order.status);
    if (status === 1) return '<span class="badge badge-paid"><span class="dot"></span>已到账</span>';
    if (status === 2) return '<span class="badge badge-closed"><span class="dot"></span>已关闭</span>';
    return '<span class="badge badge-pending"><span class="dot"></span>待支付</span>';
  }
  function channelText(channel) {
    return channel === "wxpay" ? "微信支付" : "支付宝";
  }

  // ---------- DOM 帮助 ----------
  var appEl = document.getElementById("app");
  var modalRoot = document.getElementById("modal-root");
  var toastRoot = document.getElementById("toast-root");
  var viewTimers = [];

  function clearViewTimers() {
    viewTimers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    viewTimers = [];
  }
  function mount(html, bind) {
    clearViewTimers();
    closeModal();
    appEl.innerHTML = html;
    if (typeof bind === "function") bind(appEl);
  }
  function toast(message, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "info");
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2800);
  }
  function openModal(html) {
    modalRoot.innerHTML = '<div class="modal-mask">' + html + "</div>";
  }
  function closeModal() {
    modalRoot.innerHTML = "";
  }
  function onModalClick(e) {
    var mask = e.target.closest(".modal-mask");
    if (mask && e.target === mask) closeModal();
  }
  document.addEventListener("click", onModalClick);

  // ---------- 路由 ----------
  function router() {
    var route = parseHash();
    if (!getAuth()) {
      if (route.path !== "/login") go("/login");
      else viewLogin();
      return;
    }
    if (route.path === "/login") {
      go("/recharge");
      return;
    }
    if (route.path === "/recharge") {
      if (route.params.view === "checkout") {
        viewCheckout(route.params);
        return;
      }
      if (route.params.view === "pay") {
        viewPay(route.params);
        return;
      }
      if (route.params.view === "detail") {
        viewDetail(route.params);
        return;
      }
      viewRecharge(route.params);
      return;
    }
    if (route.path === "/records/recharge") {
      viewRechargeRecords(route.params);
      return;
    }
    if (route.path === "/records/consume") {
      viewConsumeRecords(route.params);
      return;
    }
    viewRecharge({});
  }
  window.addEventListener("hashchange", router);

  // ---------- 登录 / 注册 / 忘记密码 ----------
  function viewLogin() {
    var html = ''
      + '<div class="auth-shell">'
      + '  <section class="auth-hero">'
      + '    <div class="auth-hero-top"><div class="auth-hero-brand">Σ.<b>magiorix</b></div><span class="auth-hero-mode">ACCOUNT CENTER</span></div>'
      + '    <div class="auth-hero-copy">'
      + '      <span class="auth-eyebrow">MAGIORIX ACCOUNT SERVICE</span>'
      + '      <h1>账户服务，<br>统一管理。</h1>'
      + '      <p>为 magiorix 桌面端提供独立、安全的额度与订单管理服务，账户状态与支付记录清晰可查。</p>'
      + '    </div>'
      + '    <div class="auth-hero-note"><span></span><div><b>安全支付与额度同步</b><small>订单记录可在账户服务中心随时查阅</small></div></div>'
      + '  </section>'
      + '  <section class="auth-panel-wrap">'
      + '    <div class="login-card">'
      + '      <div class="login-brand">Σ.<b>magiorix</b></div>'
      + '      <div class="form-panel" data-panel="login">'
      + '        <div class="auth-heading"><span class="auth-eyebrow">欢迎回来</span><h2>登录充值中心</h2><p>使用你的手机号和密码管理额度与订单。</p></div>'
      + '        <div class="form-field"><label>手机号</label><input class="input" id="l-phone" type="tel" maxlength="11" placeholder="请输入手机号" autocomplete="tel"></div>'
      + '        <div class="form-field"><div class="field-line"><label>密码</label><a href="javascript:void(0)" data-auth-switch="forgot">忘记密码？</a></div><input class="input" id="l-pass" type="password" maxlength="64" placeholder="请输入密码" autocomplete="current-password"></div>'
      + '        <div class="form-err" id="l-err"></div>'
      + '        <button class="btn btn-primary btn-lg" id="l-submit">登录并进入充值中心 <span>→</span></button>'
      + '        <p class="form-hint auth-bottom-link">还没有账号？<a href="javascript:void(0)" data-auth-switch="register">立即注册</a></p>'
      + '      </div>'
      + '      <div class="form-panel hidden" data-panel="register">'
      + '        <button class="auth-return" type="button" data-auth-switch="login">← 返回登录</button>'
      + '        <div class="auth-heading"><span class="auth-eyebrow">创建账号</span><h2>注册充值账户</h2><p>注册后即可查看额度、充值订单和消费记录。</p></div>'
      + '        <div class="form-field"><label>手机号</label><input class="input" id="r-phone" type="tel" maxlength="11" placeholder="请输入手机号" autocomplete="tel"></div>'
      + '        <div class="form-field"><label>密码</label><input class="input" id="r-pass" type="password" maxlength="64" placeholder="8-64 位密码" autocomplete="new-password"></div>'
      + '        <div class="form-field"><label>确认密码</label><input class="input" id="r-pass2" type="password" maxlength="64" placeholder="再次输入密码" autocomplete="new-password"></div>'
      + '        <div class="form-err" id="r-err"></div>'
      + '        <button class="btn btn-primary btn-lg" id="r-submit">创建账号 <span>→</span></button>'
      + '        <p class="form-hint">注册成功后将赠送 100 积分。</p>'
      + '      </div>'
      + '      <div class="form-panel hidden" data-panel="forgot">'
      + '        <button class="auth-return" type="button" data-auth-switch="login">← 返回登录</button>'
      + '        <div class="auth-heading"><span class="auth-eyebrow">账户恢复</span><h2>重置登录密码</h2><p>验证手机号后，可以为账号设置新密码。</p></div>'
      + '        <div class="form-field"><label>手机号</label><input class="input" id="f-phone" type="tel" maxlength="11" placeholder="请输入手机号"></div>'
      + '        <div class="form-field"><label>验证码</label><span class="code-row"><input class="input" id="f-code" type="text" maxlength="4" placeholder="4 位验证码"><button class="btn btn-ghost code-btn" id="f-send">获取验证码</button></span></div>'
      + '        <div class="form-field"><label>新密码</label><input class="input" id="f-pass" type="password" maxlength="64" placeholder="8-64 位新密码" autocomplete="new-password"></div>'
      + '        <div class="form-err" id="f-err"></div>'
      + '        <div class="form-ok" id="f-ok"></div>'
      + '        <button class="btn btn-primary btn-lg" id="f-submit">确认重置密码</button>'
      + '        <p class="form-hint">验证码将发送至你的手机。</p>'
      + '      </div>'
      + '    </div>'
      + '    <p class="auth-security-note">登录即表示你同意按平台规则使用账户服务。请勿向他人泄露密码或验证码。</p>'
      + '  </section>'
      + '</div>';

    mount(html, function (root) {
      function showAuthPanel(name) {
        root.querySelectorAll(".form-panel").forEach(function (p) {
          p.classList.toggle("hidden", p.getAttribute("data-panel") !== name);
        });
      }
      root.querySelectorAll("[data-auth-switch]").forEach(function (trigger) {
        trigger.addEventListener("click", function () { showAuthPanel(trigger.getAttribute("data-auth-switch")); });
      });

      // 登录
      document.getElementById("l-submit").addEventListener("click", function () {
        var phone = parsePhone(document.getElementById("l-phone").value);
        var password = document.getElementById("l-pass").value;
        var err = document.getElementById("l-err");
        if (!phone) { err.textContent = "请输入正确的手机号"; return; }
        if (!password) { err.textContent = "请输入密码"; return; }
        err.textContent = "";
        var btn = document.getElementById("l-submit");
        btn.disabled = true; btn.textContent = "登录中…";
        apiPost("/api/auth/login", { phone: phone, password: password })
          .then(function (data) {
            setAuth({ token: data.token, userInfo: data.userInfo });
            toast("登录成功", "success");
            go("/recharge");
          })
          .catch(function (e) { err.textContent = e.message || "登录失败"; })
          .finally(function () { btn.disabled = false; btn.textContent = "登 录"; });
      });

      // 注册
      document.getElementById("r-submit").addEventListener("click", function () {
        var phone = parsePhone(document.getElementById("r-phone").value);
        var password = document.getElementById("r-pass").value;
        var confirm = document.getElementById("r-pass2").value;
        var err = document.getElementById("r-err");
        if (!phone) { err.textContent = "请输入正确的手机号"; return; }
        if (!isStrongPassword(password)) { err.textContent = "密码长度必须在 8 到 64 个字符之间"; return; }
        if (password !== confirm) { err.textContent = "两次输入的密码不一致"; return; }
        err.textContent = "";
        var btn = document.getElementById("r-submit");
        btn.disabled = true; btn.textContent = "注册中…";
        apiPost("/api/auth/register", { phone: phone, password: password })
          .then(function (data) {
            setAuth({ token: data.token, userInfo: data.userInfo });
            toast("注册成功，已赠送 100 积分", "success");
            go("/recharge");
          })
          .catch(function (e) { err.textContent = e.message || "注册失败"; })
          .finally(function () { btn.disabled = false; btn.textContent = "注 册"; });
      });

      // 忘记密码
      var sendBtn = document.getElementById("f-send");
      var countdown = 0;
      var timer = null;
      function resetSendBtn() {
        if (timer) clearInterval(timer);
        timer = setInterval(function () {
          countdown -= 1;
          if (countdown <= 0) {
            clearInterval(timer); timer = null;
            sendBtn.disabled = false; sendBtn.textContent = "获取验证码";
          } else {
            sendBtn.textContent = countdown + "s 后重试";
          }
        }, 1000);
      }
      sendBtn.addEventListener("click", function () {
        var phone = parsePhone(document.getElementById("f-phone").value);
        var err = document.getElementById("f-err");
        if (!phone) { err.textContent = "请输入正确的手机号"; return; }
        err.textContent = "";
        sendBtn.disabled = true;
        apiPost("/api/auth/sms/send", { phone: phone, purpose: "reset_password" })
          .then(function (data) {
            countdown = 60;
            resetSendBtn();
            var msg = "验证码已发送";
            if (data && data.debugCode) msg += "（测试环境验证码：" + data.debugCode + "）";
            document.getElementById("f-ok").textContent = msg;
          })
          .catch(function (e) {
            sendBtn.disabled = false; sendBtn.textContent = "获取验证码";
            err.textContent = e.message || "发送失败";
          });
      });
      document.getElementById("f-submit").addEventListener("click", function () {
        var phone = parsePhone(document.getElementById("f-phone").value);
        var code = String(document.getElementById("f-code").value || "").trim();
        var newPassword = document.getElementById("f-pass").value;
        var err = document.getElementById("f-err");
        if (!phone) { err.textContent = "请输入正确的手机号"; return; }
        if (!/^\d{4}$/.test(code)) { err.textContent = "请输入 4 位验证码"; return; }
        if (!isStrongPassword(newPassword)) { err.textContent = "新密码长度必须在 8 到 64 个字符之间"; return; }
        err.textContent = "";
        var btn = document.getElementById("f-submit");
        btn.disabled = true; btn.textContent = "重置中…";
        apiPost("/api/auth/password/reset", { phone: phone, code: code, newPassword: newPassword })
          .then(function () {
            toast("密码已重置，请使用新密码登录", "success");
            showAuthPanel("login");
            document.getElementById("f-ok").textContent = "";
          })
          .catch(function (e) { err.textContent = e.message || "重置失败"; })
          .finally(function () { btn.disabled = false; btn.textContent = "重置密码"; });
      });
    });
  }

  // ---------- 页面外壳 ----------
  function shell(activeNav, contentHtml) {
    var user = getUser() || {};
    var name = user.nickname || user.username || "用户";
    var phone = user.phone || "";
    var avatar = String(name || "?").slice(0, 1).toUpperCase();
    function navItem(href, label, dotClass, active) {
      return '<a class="nav-item' + (active ? " active" : "") + '" href="#' + href + '">'
        + '<span class="dot ' + dotClass + '"></span>' + label + "</a>";
    }
    return ''
      + '<div class="layout">'
      + '  <aside class="sidebar">'
      + '    <div class="sidebar-brand"><span>Σ.<b>magiorix</b></span><small>账户服务</small></div>'
      + '    <nav class="sidebar-nav" aria-label="账户服务导航">'
      + navItem("/recharge", "额度充值", "coin", activeNav === "recharge")
      + navItem("/records/recharge", "充值订单", "in", activeNav === "records-recharge")
      + navItem("/records/consume", "消费记录", "out", activeNav === "records-consume")
      + '    </nav>'
      + '    <div class="sidebar-note"><strong>桌面端主应用</strong><span>数据采集、创作与分析请继续在 magiorix 客户端完成。</span></div>'
      + '    <div class="sidebar-foot">'
      + '      <div class="user-avatar">' + esc(avatar) + "</div>"
      + '      <div class="user-meta">'
      + '        <div class="user-name">' + esc(name) + "</div>"
      + '        <div class="user-phone">' + esc(phone) + "</div>"
      + "      </div>"
      + '      <button class="btn btn-ghost" id="logout-btn" style="padding:6px 12px;font-size:12px">退出</button>'
      + "    </div>"
      + "  </aside>"
      + '  <main class="main">' + contentHtml + "</main>"
      + "</div>";
  }

  function bindLogout(root) {
    var btn = document.getElementById("logout-btn");
    if (btn) btn.addEventListener("click", function () {
      apiPost("/api/auth/logout", {}).catch(function () { /* 忽略 */ }).finally(function () {
        clearAuth();
        toast("已退出登录", "info");
        go("/login");
      });
    });
  }

  // ---------- 充值首页 ----------
  function viewRecharge(params) {
    var html = shell("recharge", ''
      + '  <div class="page-head recharge-head">'
      + '    <div><p class="kicker">账户额度</p><h1 class="page-title">充值中心</h1>'
      + '    <p class="page-sub">为 magiorix 账户补充服务额度；数据采集与内容创作仍在桌面端主应用中完成。</p></div>'
      + '    <div class="recharge-head-note"><span>安全支付</span><b>支付完成后自动到账</b></div>'
      + '  </div>'
      + '  <div class="balance-card">'
      + '    <div><div class="balance-label">当前可用额度</div>'
      + '      <div class="balance-value" id="balance-value">--<small>积分</small></div></div>'
      + '    <div class="balance-side"><b>账户服务</b><br>充值订单和消费明细均可随时查看</div>'
      + "  </div>"
      + '  <div class="promo-banner-wrap" id="promo-banner-wrap"></div>'
      + '  <div class="section-head"><div><p class="kicker">选择套餐</p><h3 class="card-title">按你的使用节奏选择额度包</h3></div><p>确认订单前可随时返回重新选择</p></div>'
      + '  <div class="package-grid" id="package-grid"><div class="empty">正在加载套餐…</div></div>'
      + '  <div class="section-head orders-head"><div><p class="kicker">最近订单</p><h3 class="card-title">充值订单</h3></div><a href="#/records/recharge">查看全部记录 →</a></div>'
      + '  <div class="card orders-card"><div id="recent-orders"><div class="empty">正在加载…</div></div></div>'
    );

    mount(html, function (root) {
      bindLogout(root);
      var packages = [];
      var pendingOrders = [];

      function loadPackages() {
        apiGet("/api/shumiao/packages").then(function (rows) {
          packages = rows || [];
          renderPackages();
        }).catch(function (e) {
          var grid = document.getElementById("package-grid");
          grid.innerHTML = '<div class="empty">套餐加载失败：' + esc(e.message) + "</div>";
        });
      }
      function loadPendingOrders() {
        return apiGet("/api/shumiao/recharge-records?page=1&pageSize=20").then(function (data) {
          pendingOrders = (data.list || []).filter(function (o) { return Number(o.status) === 0; });
        }).catch(function () { pendingOrders = []; });
      }
      function renderPackages() {
        var grid = document.getElementById("package-grid");
        var bannerWrap = document.getElementById("promo-banner-wrap");
        if (!grid) return;
        if (!packages.length) {
          grid.innerHTML = '<div class="empty">暂无可用套餐</div>';
          if (bannerWrap) bannerWrap.innerHTML = "";
          return;
        }
        var isEligible = Boolean(packages[0] && packages[0].firstRechargeEligible);
        if (bannerWrap) {
          bannerWrap.innerHTML = isEligible
            ? '<div class="promo-banner"><span class="promo-tag">首充专享</span><span>首次充值 50 元及以上，再送基础积分 20%，最高再送 300 积分。</span></div>'
            : "";
        }
        grid.innerHTML = packages.map(function (pkg) {
          var gift = Number(pkg.giftCount || 0);
          var promo = Number(pkg.promotionCount || 0);
          var isFirstRecharge = Boolean(pkg.firstRechargeEligible);
          var extra = gift + (isFirstRecharge ? promo : 0);
          var recommended = Boolean(pkg.recommended);
          var scene = pkg.scene || "额度包";
          var mobileGiftBadge = "";
          var desktopGiftBadge = "";
          if (isFirstRecharge && (gift > 0 || promo > 0)) {
            mobileGiftBadge = '<span class="package-gift package-mobile-gift">首充共赠 ' + fmtCount(gift + promo) + '</span>';
            desktopGiftBadge = '<span class="package-gift package-desktop-gift">首充多得 +' + fmtCount(extra) + '</span>';
          } else if (gift > 0) {
            mobileGiftBadge = '<span class="package-gift package-mobile-gift">加赠 ' + fmtCount(gift) + '</span>';
            desktopGiftBadge = '<span class="package-gift package-desktop-gift">套餐加赠 +' + fmtCount(gift) + '</span>';
          }
          var amountStr = (pkg.amountCents % 100 === 0) ? String(pkg.amountCents / 100) : fmtMoney(pkg.amountCents);
          var mobileMetaHtml = "";
          if (isFirstRecharge && promo > 0) {
            mobileMetaHtml = '<span>基础 ' + fmtCount(pkg.baseCount) + ' + 套餐加赠 ' + fmtCount(gift) + ' + 首充再赠 ' + fmtCount(promo) + '</span>';
          } else if (gift > 0) {
            mobileMetaHtml = '<span>基础 ' + fmtCount(pkg.baseCount) + ' + 加赠 ' + fmtCount(gift) + ' 积分</span>';
          } else {
            mobileMetaHtml = '<span>基础 ' + fmtCount(pkg.baseCount) + ' 积分</span>';
          }
          var payablePoints = fmtCount(pkg.payableTotalCount || pkg.totalCount);
          var mobilePointsLabel = (isFirstRecharge && promo > 0) ? "首充到账积分" : "到账积分";
          var desktopPointsLabel = isFirstRecharge ? "首充预计到账" : "到账积分";
          var desktopPointsHtml = extra > 0
            ? '<div class="package-desktop-points"><span>' + fmtCount(pkg.baseCount) + '<small> 常规积分</small></span><b>+</b><span class="extra">' + fmtCount(extra) + '<small> 额外积分</small></span></div>'
            : '<div class="package-desktop-points muted"><span>' + fmtCount(pkg.baseCount) + '<small> 常规积分</small></span></div>';
          var desktopDetailsHtml = "";
          if (extra > 0) {
            desktopDetailsHtml = '<div class="package-hover-details"><div class="package-hover-title">额外积分明细</div>'
              + (gift > 0 ? '<span>套餐加赠 <b>+' + fmtCount(gift) + ' 积分</b></span>' : '')
              + (isFirstRecharge && promo > 0 ? '<span>首充加赠 <b>+' + fmtCount(promo) + ' 积分</b></span>' : '')
              + '</div>';
          }
          return ''
            + '<button class="package-card' + (recommended ? ' recommended' : '') + (extra > 0 ? ' has-extra' : '') + '" type="button" data-plan="' + esc(pkg.id) + '">'
            + mobileGiftBadge
            + desktopGiftBadge
            + '<div class="package-card-top">'
            + '  <span class="package-scene">' + esc(scene) + '</span>'
            + (recommended ? '  <span class="package-recommend">高频推荐</span>' : '')
            + '</div>'
            + '<div class="package-amount"><span>¥</span>' + amountStr + '</div>'
            + '<div class="package-credit package-mobile-credit"><strong>' + payablePoints + '</strong><span>' + mobilePointsLabel + '</span></div>'
            + '<div class="package-meta package-mobile-meta">' + mobileMetaHtml + '</div>'
            + '<div class="package-desktop-credit"><span>' + desktopPointsLabel + '</span><strong>' + payablePoints + '<small> 积分</small></strong></div>'
            + desktopPointsHtml
            + desktopDetailsHtml
            + '<span class="package-btn"><span>选择此套餐</span><b>→</b></span>'
            + "</button>";
        }).join("");
        grid.querySelectorAll(".package-card").forEach(function (card) {
          card.addEventListener("click", function () {
            var planId = card.getAttribute("data-plan");
            if (pendingOrders.length) {
              openInterceptor(pendingOrders[0], planId);
            } else {
              go("/recharge?view=checkout&plan=" + encodeURIComponent(planId));
            }
          });
        });
      }
      function loadRecentOrders() {
        apiGet("/api/shumiao/recharge-records?page=1&pageSize=5").then(function (data) {
          var box = document.getElementById("recent-orders");
          if (!box) return;
          var list = data.list || [];
          if (!list.length) {
            box.innerHTML = '<div class="empty">暂无充值记录</div>';
            return;
          }
          box.innerHTML = ordersTable(list);
          bindOrdersTable(box, list);
        }).catch(function (e) {
          var box = document.getElementById("recent-orders");
          if (box) box.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + "</div>";
        });
      }
      function loadBalance() {
        apiGet("/api/shumiao/balance").then(function (data) {
          var el = document.getElementById("balance-value");
          if (el) el.innerHTML = fmtCount(data.balance) + "<small>积分</small>";
          var auth = getAuth();
          if (auth && auth.userInfo) {
            auth.userInfo.balance = data.balance;
            setAuth(auth);
          }
        }).catch(function () { /* 忽略，下次刷新 */ });
      }

      // 待支付订单拦截
      function openInterceptor(order, planId) {
        openModal(""
          + '<div class="modal-card">'
          + '  <h3 class="modal-title">您还有未完成的订单</h3>'
          + '  <div class="modal-body">订单 <span class="mono">' + esc(order.orderNo) + "</span> 尚未支付，"
          + "购买前需要先取消。确定要取消之前的订单吗？</div>"
          + '  <div class="modal-actions">'
          + '    <button class="btn btn-ghost" id="interceptor-back">返回我的订单</button>'
          + '    <button class="btn btn-danger" id="interceptor-cancel">确认取消</button>'
          + "  </div>"
          + "</div>");
        document.getElementById("interceptor-back").addEventListener("click", function () {
          closeModal();
          go("/recharge?view=pay&orderNo=" + encodeURIComponent(order.orderNo));
        });
        document.getElementById("interceptor-cancel").addEventListener("click", function () {
          var btn = document.getElementById("interceptor-cancel");
          btn.disabled = true; btn.textContent = "取消中…";
          apiPost("/api/shumiao/order/" + encodeURIComponent(order.orderNo) + "/close", {})
            .then(function () {
              closeModal();
              toast("原订单已取消", "success");
              return loadPendingOrders();
            })
            .then(function () { go("/recharge?view=checkout&plan=" + encodeURIComponent(planId)); })
            .catch(function (e) {
              toast("取消失败：" + e.message, "error");
              closeModal();
            });
        });
      }

      loadBalance();
      loadPackages();
      loadPendingOrders().then(loadRecentOrders);
    });
  }

  // ---------- 订单表格 ----------
  function ordersTable(list) {
    if (!list || !list.length) return '<div class="empty">暂无记录</div>';
    var head = ""
      + "<thead><tr>"
      + "<th>订单号</th><th>套餐</th><th>金额</th><th>到账积分</th>"
      + "<th>支付方式</th><th>状态</th><th>创建时间</th><th>支付时间</th><th></th>"
      + "</tr></thead>";
    var rows = list.map(function (o) {
      var packageName = packageTitle(o.packageId);
      var action = Number(o.status) === 0
        ? '<button class="link-btn" data-order-no="' + esc(o.orderNo) + '">继续支付</button>'
        : "";
      return "<tr>"
        + '<td class="mono">' + esc(o.orderNo) + "</td>"
        + "<td>" + esc(packageName) + "</td>"
        + "<td>¥" + fmtMoney(o.amountYuan != null ? o.amountYuan * 100 : o.amountCents) + "</td>"
        + "<td>" + fmtCount(o.totalCount) + "</td>"
        + "<td>" + channelText(o.channel) + "</td>"
        + "<td>" + statusBadge(o) + "</td>"
        + "<td>" + fmtTime(o.createdAt) + "</td>"
        + "<td>" + fmtTime(o.paidAt || o.creditedAt) + "</td>"
        + "<td>" + action + "</td>"
        + "</tr>";
    }).join("");
    return '<div class="table-wrap"><table>' + head + "<tbody>" + rows + "</tbody></table></div>";
  }
  function bindOrdersTable(container, list) {
    container.querySelectorAll("[data-order-no]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var orderNo = btn.getAttribute("data-order-no");
        go("/recharge?view=pay&orderNo=" + encodeURIComponent(orderNo));
      });
    });
  }

  // 套餐名映射（packages 可能未加载，回退为套餐 ID）
  var packageTitleCache = {};
  function packageTitle(packageId) {
    if (packageTitleCache[packageId]) return packageTitleCache[packageId];
    return String(packageId || "");
  }
  function warmPackageTitles() {
    apiGet("/api/shumiao/packages").then(function (rows) {
      (rows || []).forEach(function (pkg) {
        packageTitleCache[pkg.id] = pkg.title || pkg.id;
      });
    }).catch(function () { /* 忽略 */ });
  }

  // ---------- 确认页 ----------
  function viewCheckout(params) {
    var planId = String(params.plan || "");
    var html = shell("recharge", ''
      + '  <div class="checkout-page-head">'
      + '    <a href="#/recharge" class="checkout-return">← 返回套餐</a>'
      + '    <div class="checkout-step">第 2 步 / 3　确认订单</div>'
      + '    <div><p class="kicker">订单确认</p><h1 class="page-title">确认订单</h1>'
      + '    <p class="page-sub">核对套餐和支付方式；下单后可在充值订单中持续查看状态。</p></div>'
      + "  </div>"
      + '  <div class="checkout-grid">'
      + '    <div class="card checkout-card"><div class="checkout-card-head"><span>1</span><div><h3 class="card-title">订单信息</h3><p>请核对本次购买内容</p></div></div><div id="checkout-info"><div class="empty">正在加载套餐…</div></div></div>'
      + '    <div class="card checkout-card"><div class="checkout-card-head"><span>2</span><div><h3 class="card-title">选择支付方式</h3><p>订单创建后将在对应渠道完成支付</p></div></div>'
      + '      <div class="pay-methods" id="pay-methods"></div>'
      + '      <div class="form-err" id="checkout-err"></div>'
      + "    </div>"
      + "  </div>"
      + '  <div class="checkout-submit-bar"><div><span>应付金额</span><strong id="checkout-total">--</strong><small>订单生成后 30 分钟内有效</small></div>'
      + '  <button class="btn btn-primary btn-lg" id="checkout-submit">确认订单并去支付 <span>→</span></button></div>'
    );
    mount(html, function (root) {
      bindLogout(root);
      var channel = "alipay";
      var pkg = null;

      function renderMethods() {
        var box = document.getElementById("pay-methods");
        var methods = [
          { id: "alipay", name: "支付宝", desc: "在支付宝中安全完成支付" },
          { id: "wxpay", name: "微信支付", desc: "使用微信扫码完成支付" },
        ];
        box.innerHTML = methods.map(function (m) {
          var selected = channel === m.id;
          return ''
            + '<div class="pay-method ' + m.id + (selected ? " selected" : "") + '" data-channel="' + m.id + '">'
            + '  <span class="pay-logo ' + m.id + '">' + (m.id === "alipay" ? "支" : "微") + "</span>"
            + '  <span class="pay-method-info"><span class="pay-method-name">' + m.name + "</span>"
            + '    <span class="pay-method-desc">' + m.desc + "</span></span>"
            + '  <span class="pay-radio"></span>'
            + "</div>";
        }).join("");
        box.querySelectorAll(".pay-method").forEach(function (el) {
          el.addEventListener("click", function () {
            channel = el.getAttribute("data-channel");
            renderMethods();
          });
        });
      }

      apiGet("/api/shumiao/packages").then(function (rows) {
        pkg = (rows || []).find(function (p) { return String(p.id) === String(planId); });
        if (!pkg) throw new Error("套餐不存在或已下架");
        var gift = Number(pkg.giftCount || 0);
        var promo = Number(pkg.promotionCount || 0);
        var arrivalPoints = fmtCount(pkg.payableTotalCount || pkg.totalCount);
        document.getElementById("checkout-info").innerHTML = ''
          + '<div class="info-rows">'
          + '  <div class="info-row"><span class="k">商品名称</span><span class="v">' + esc(pkg.title || pkg.id) + "</span></div>"
          + '  <div class="info-row"><span class="k">充值金额</span><span class="v strong">¥' + fmtMoney(pkg.amountCents) + "</span></div>"
          + '  <div class="info-row"><span class="k">基础积分</span><span class="v">' + fmtCount(pkg.baseCount) + " 积分</span></div>"
          + (gift > 0 ? '  <div class="info-row"><span class="k">套餐加赠</span><span class="v">' + fmtCount(gift) + " 积分</span></div>" : "")
          + (promo > 0 ? '  <div class="info-row"><span class="k">首充加赠</span><span class="v" style="color:var(--brand);font-weight:700">+' + fmtCount(promo) + " 积分</span></div>" : "")
          + '  <div class="info-row"><span class="k">本次到账积分</span><span class="v strong">' + arrivalPoints + " 积分</span></div>"
          + '  <div class="info-row"><span class="k">订单号</span><span class="v">支付时自动生成</span></div>'
          + '  <div class="info-row"><span class="k">有效期</span><span class="v">30 分钟</span></div>'
          + "</div>";
        var totalEl = document.getElementById("checkout-total");
        if (totalEl) totalEl.textContent = "¥" + fmtMoney(pkg.amountCents);
      }).catch(function (e) {
        document.getElementById("checkout-info").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
      });

      renderMethods();
      document.getElementById("checkout-submit").addEventListener("click", function () {
        if (!pkg) { document.getElementById("checkout-err").textContent = "套餐信息未加载完成"; return; }
        var btn = document.getElementById("checkout-submit");
        btn.disabled = true; btn.textContent = "正在创建订单…";
        apiPost("/api/shumiao/recharge", { packageId: pkg.id, channel: channel })
          .then(function (data) {
            cacheOrder(data);
            go("/recharge?view=pay&orderNo=" + encodeURIComponent(data.orderNo));
          })
          .catch(function (e) {
            document.getElementById("checkout-err").textContent = e.message || "创建订单失败";
            btn.disabled = false; btn.textContent = "确认订单并去支付 →";
          });
      });
    });
  }

  // ---------- 支付页 ----------
  function viewPay(params) {
    var orderNo = String(params.orderNo || "");
    var html = shell("recharge", ''
      + '  <div class="page-head">'
      + '    <div><p class="kicker">Payment</p><h1 class="page-title">扫码支付</h1>'
      + '    <p class="page-sub" id="pay-sub">正在获取订单…</p></div>'
      + '    <a href="#/recharge" class="btn btn-ghost">返回充值中心</a>'
      + "  </div>"
      + '  <div class="pay-wrap"><div class="pay-card" id="pay-card"><div class="empty" style="padding:60px 0">正在加载订单…</div></div></div>'
    );
    mount(html, function (root) {
      bindLogout(root);
      if (!orderNo) {
        document.getElementById("pay-card").innerHTML = '<div class="empty">缺少订单号</div>';
        return;
      }

      var startedAt = Date.now();
      var queryAt = 0;
      var attempts = 0;
      var stopped = false;

      function stopPolling() {
        stopped = true;
      }

      function renderPaid(order) {
        stopPolling();
        var card = document.getElementById("pay-card");
        card.innerHTML = ''
          + '<div class="detail-ok">'
          + '  <div class="big-icon" style="color:var(--green)">✓</div>'
          + '  <h2>支付完成</h2>'
          + '  <p>已到账 <b>' + fmtCount(order.totalCount) + "</b> 积分，余额已更新。</p>"
          + '  <div class="modal-actions" style="justify-content:center">'
          + '    <a href="#/recharge" class="btn btn-primary">返回充值中心</a>'
          + '    <a href="#/records/recharge" class="btn btn-ghost">查看充值记录</a>'
          + "  </div>"
          + "</div>";
      }
      function renderClosed() {
        stopPolling();
        var card = document.getElementById("pay-card");
        card.innerHTML = ''
          + '<div class="detail-ok">'
          + '  <div class="big-icon" style="color:var(--gray)">✕</div>'
          + '  <h2>订单已关闭</h2>'
          + '  <p>该订单已取消或超过支付有效期。</p>'
          + '  <div class="modal-actions" style="justify-content:center"><a href="#/recharge" class="btn btn-primary">返回充值中心</a></div>'
          + "</div>";
      }
      function renderPay(order, cached) {
        var isAlipay = String(order.channel || "alipay") !== "wxpay";
        var accentClass = isAlipay ? "alipay" : "wxpay";
        var brandName = isAlipay ? "支付宝" : "微信支付";
        var scanHint = isAlipay ? "请使用支付宝扫码付款" : "请使用微信扫码付款";
        var amountYuan = fmtMoney(order.amountYuan != null ? order.amountYuan * 100 : order.amountCents);
        var totalCount = fmtCount(order.totalCount);
        var qrBlock = "";
        var qrSource = cached ? cached.qrCode || "" : "";
        if (qrSource) {
          qrBlock = '<div class="qr-box"><img id="pay-qr" alt="' + (isAlipay ? "支付宝付款二维码" : "微信付款二维码") + '"></div>';
        } else {
          qrBlock = '<div class="qr-box" style="color:var(--muted);font-size:12px;text-align:center">二维码已失效<br>请返回充值中心重新下单</div>';
        }

        var card = document.getElementById("pay-card");
        card.innerHTML = ''
          + '<div class="pay-brand ' + accentClass + '">'
          + '  <span class="pay-brand-logo">' + (isAlipay ? "支" : "微") + "</span>"
          + '  <span><div class="pay-brand-name">' + brandName + " 收银台</div>"
          + '  <div class="pay-brand-sub">magiorix 积分充值</div></span>'
          + "</div>"
          + '<div class="pay-body">'
          + '  <div class="pay-left">'
          + '    <div class="pay-amount-label">应付金额</div>'
          + '    <div class="pay-amount">¥' + amountYuan + "</div>"
          + '    <div class="pay-order-no">订单号：<span class="mono">' + esc(orderNo) + "</span></div>"
          + '    <div class="info-row" style="padding:8px 0;border-bottom:1px dashed var(--border)"><span class="k">到账积分</span><span class="v">' + totalCount + "</span></div>"
          + '    <div class="pay-actions">'
          + (isAlipay
            ? (cached && cached.payUrl
              ? '<a class="pay-link-btn alipay" href="' + esc(cached.payUrl) + '" target="_blank" rel="noopener noreferrer">打开支付宝付款</a>'
              : "")
            : '<a class="pay-link-btn wxpay" href="javascript:void(0)" id="wx-copy">复制支付链接</a>')
          + '      <button class="pay-link-btn ghost" id="check-status">↻ 检测支付状态</button>'
          + "    </div>"
          + "  </div>"
          + '  <div class="pay-right">'
          + qrBlock
          + '    <div class="qr-hint"><b>' + scanHint + "</b></div>"
          + '    <div class="pay-status" id="pay-status"></div>'
          + "  </div>"
          + "</div>";

        if (qrSource) {
          QRCode.toDataURL(String(qrSource), {
            width: 248,
            margin: 1,
            errorCorrectionLevel: "M",
            color: { dark: "#111827", light: "#ffffff" },
          }, function (err, url) {
            var img = document.getElementById("pay-qr");
            if (!err && url && img) img.src = url;
            else if (img) {
              img.style.display = "none";
              var box = img.closest(".qr-box");
              if (box) box.innerHTML = '<div style="color:var(--muted);font-size:12px">二维码生成失败，请点击左侧付款按钮</div>';
            }
          });
        }
        var copyBtn = document.getElementById("wx-copy");
        if (copyBtn && cached && cached.qrCode) {
          copyBtn.addEventListener("click", function () {
            copyText(String(cached.qrCode));
          });
        }
        document.getElementById("check-status").addEventListener("click", function () {
          checkNow(true);
        });
        startPolling();
      }

      function copyText(text) {
        function done() {
          toast("支付链接已复制", "success");
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
        } else {
          fallbackCopy(text);
          done();
        }
      }
      function fallbackCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { /* ignore */ }
        ta.remove();
      }

      function statusEl() {
        return document.getElementById("pay-status");
      }
      function handleOrder(order) {
        if (Number(order.status) === 1) {
          renderPaid(order);
          apiGet("/api/shumiao/balance").catch(function () { /* 忽略 */ });
          return true;
        }
        if (Number(order.status) === 2) {
          renderClosed();
          return true;
        }
        return false;
      }

      function checkNow(forceQuery) {
        if (stopped) return;
        attempts += 1;
        var url = "/api/shumiao/order/" + encodeURIComponent(orderNo);
        apiGet(url)
          .then(function (order) {
            if (handleOrder(order)) return;
            if ((forceQuery || Date.now() - startedAt >= POLL_QUERY_AFTER_MS) && Date.now() - queryAt >= POLL_QUERY_AFTER_MS) {
              queryAt = Date.now();
              return apiPost(url + "/query", {});
            }
            return null;
          })
          .then(function (queried) {
            if (queried && !stopped && !handleOrder(queried)) {
              if (queried.queryInProgress) {
                var s = statusEl();
                if (s) s.textContent = "查询请求已排队，请稍后刷新…";
              }
            }
            if (!stopped && attempts >= POLL_MAX_ATTEMPTS) {
              var s = statusEl();
              if (s) { s.className = "pay-status"; s.textContent = "支付结果暂未确认，请点击「检测支付状态」重试"; }
              return;
            }
            if (!stopped) viewTimers.push(setTimeout(checkNow, POLL_INTERVAL_MS));
          })
          .catch(function () {
            if (!stopped && attempts >= POLL_MAX_ATTEMPTS) {
              var s = statusEl();
              if (s) s.textContent = "网络异常，请点击「检测支付状态」重试";
              return;
            }
            if (!stopped) viewTimers.push(setTimeout(checkNow, POLL_INTERVAL_MS));
          });
      }

      function startPolling() {
        checkNow(false);
      }

      apiGet("/api/shumiao/order/" + encodeURIComponent(orderNo))
        .then(function (order) {
          var sub = document.getElementById("pay-sub");
          if (sub) sub.textContent = "订单号：" + order.orderNo + " · " + channelText(order.channel);
          if (handleOrder(order)) return;
          var cached = getCachedOrder(orderNo);
          renderPay(order, cached);
        })
        .catch(function (e) {
          document.getElementById("pay-card").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
        });
    });
  }

  // ---------- 详情页 ----------
  function viewDetail(params) {
    var orderNo = String(params.orderNo || "");
    var html = shell("recharge", ''
      + '  <div class="page-head">'
      + '    <div><p class="kicker">Order</p><h1 class="page-title">订单详情</h1></div>'
      + '    <a href="#/recharge" class="btn btn-ghost">返回充值中心</a>'
      + "  </div>"
      + '  <div class="pay-wrap"><div class="pay-card" id="detail-card"><div class="empty" style="padding:60px 0">正在加载订单…</div></div></div>'
    );
    mount(html, function (root) {
      bindLogout(root);
      if (!orderNo) {
        document.getElementById("detail-card").innerHTML = '<div class="empty">缺少订单号</div>';
        return;
      }
      function loadDetail() {
        return apiGet("/api/shumiao/order/" + encodeURIComponent(orderNo))
        .then(function (order) {
          var card = document.getElementById("detail-card");
          if (Number(order.status) === 1) {
            card.innerHTML = ''
              + '<div class="detail-ok">'
              + '  <div class="big-icon" style="color:var(--green)">✓</div>'
              + '  <h2>支付完成</h2>'
              + '  <p>订单 <span class="mono">' + esc(orderNo) + "</span> 已到账 "
              + fmtCount(order.totalCount) + " 积分。</p>"
              + '  <div class="modal-actions" style="justify-content:center">'
              + '    <a href="#/recharge" class="btn btn-primary">返回充值中心</a>'
              + '    <a href="#/records/recharge" class="btn btn-ghost">查看充值记录</a>'
              + "  </div>"
              + "</div>";
            return;
          }
          if (Number(order.status) === 2) {
            card.innerHTML = ''
              + '<div class="detail-ok">'
              + '  <div class="big-icon" style="color:var(--gray)">✕</div>'
              + '  <h2>订单已关闭</h2>'
              + '  <p>该订单已取消，不会扣除任何积分。</p>'
              + '  <div class="modal-actions" style="justify-content:center"><a href="#/recharge" class="btn btn-primary">返回充值中心</a></div>'
              + "</div>";
            return;
          }
          var rows = ""
            + '<div class="info-row"><span class="k">订单号</span><span class="v mono">' + esc(orderNo) + "</span></div>"
            + '<div class="info-row"><span class="k">支付金额</span><span class="v strong">¥' + fmtMoney(order.amountYuan != null ? order.amountYuan * 100 : order.amountCents) + "</span></div>"
            + '<div class="info-row"><span class="k">到账积分</span><span class="v">' + fmtCount(order.totalCount) + "</span></div>"
            + '<div class="info-row"><span class="k">支付方式</span><span class="v">' + channelText(order.channel) + "</span></div>"
            + '<div class="info-row"><span class="k">状态</span><span class="v">' + statusBadge(order) + "</span></div>"
            + '<div class="info-row"><span class="k">创建时间</span><span class="v">' + fmtTime(order.createdAt) + "</span></div>";
          var actions = '<div class="modal-actions">'
            + '  <button class="btn btn-danger" id="detail-close">关闭订单</button>'
            + '  <button class="btn btn-primary" id="detail-continue">继续支付</button>'
            + "</div>";
          card.innerHTML = ''
            + '<div style="padding:26px 28px">'
            + '  <h3 class="card-title">订单信息</h3>'
            + '  <div class="info-rows">' + rows + "</div>"
            + '  <div class="form-err" id="detail-err" style="margin-top:12px"></div>'
            + actions
            + "</div>";
          var continueBtn = document.getElementById("detail-continue");
          if (continueBtn) {
            continueBtn.addEventListener("click", function () {
              go("/recharge?view=pay&orderNo=" + encodeURIComponent(orderNo));
            });
          }
          var closeBtn = document.getElementById("detail-close");
          if (closeBtn) {
            closeBtn.addEventListener("click", function () {
              closeBtn.disabled = true; closeBtn.textContent = "关闭中…";
              apiPost("/api/shumiao/order/" + encodeURIComponent(orderNo) + "/close", {})
                .then(function (data) {
                  if (data.paidOnClose) {
                    toast("订单已支付，积分已到账", "success");
                  } else if (data.closed) {
                    toast("订单已关闭", "success");
                  } else {
                    toast(data && data.queryInProgress ? "查询请求已排队，请稍后刷新" : "订单状态已更新", "info");
                  }
                  // 就地重新拉取并渲染，避免相同 URL 不触发 hashchange 导致视图不刷新
                  loadDetail().catch(function () { /* 忽略，保留当前视图 */ });
                })
                .catch(function (e) {
                  document.getElementById("detail-err").textContent = e.message || "关闭失败";
                  closeBtn.disabled = false; closeBtn.textContent = "关闭订单";
                });
            });
          }
        })
        .catch(function (e) {
          document.getElementById("detail-card").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
        });
      }
      loadDetail();
    });
  }

  // ---------- 充值记录 ----------
  function viewRechargeRecords(params) {
    var page = Math.max(1, Number(params.page || 1));
    var pageSize = 10;
    var html = shell("records-recharge", ''
      + '  <div class="page-head">'
      + '    <div><p class="kicker">Recharge Records</p><h1 class="page-title">充值记录</h1>'
      + '    <p class="page-sub">全部充值订单与支付状态。</p></div>'
      + "  </div>"
      + '  <div class="card"><div id="records-box"><div class="empty">正在加载…</div></div></div>'
    );
    mount(html, function (root) {
      bindLogout(root);
      apiGet("/api/shumiao/recharge-records?page=" + page + "&pageSize=" + pageSize)
        .then(function (data) {
          var box = document.getElementById("records-box");
          var total = Number(data.total || 0);
          var pages = Math.max(1, Math.ceil(total / pageSize));
          box.innerHTML = ordersTable(data.list || [])
            + '<div class="pagination">'
            + '  <button class="page-btn" id="prev-page" ' + (page <= 1 ? "disabled" : "") + ">上一页</button>"
            + '  <span class="page-info">第 ' + page + " / " + pages + " 页 · 共 " + total + " 条</span>"
            + '  <button class="page-btn" id="next-page" ' + (page >= pages ? "disabled" : "") + ">下一页</button>"
            + "</div>";
          bindOrdersTable(box, data.list || []);
          var prev = document.getElementById("prev-page");
          var next = document.getElementById("next-page");
          if (prev) prev.addEventListener("click", function () { go("/records/recharge?page=" + (page - 1)); });
          if (next) next.addEventListener("click", function () { go("/records/recharge?page=" + (page + 1)); });
        })
        .catch(function (e) {
          document.getElementById("records-box").innerHTML = '<div class="empty">加载失败：' + esc(e.message) + "</div>";
        });
    });
  }

  // ---------- 消耗记录 ----------
  function viewConsumeRecords(params) {
    var page = Math.max(1, Number(params.page || 1));
    var requestedPageSize = Number(params.pageSize || 10);
    var pageSize = [10, 20, 50, 100].indexOf(requestedPageSize) >= 0 ? requestedPageSize : 10;
    var html = shell("records-consume", ''
      + '  <div class="page-head">'
      + '    <div><p class="kicker">Consume Records</p><h1 class="page-title">消耗记录</h1>'
      + '    <p class="page-sub">积分消耗明细（一次提交任务聚合为一条流水）。</p></div>'
      + "  </div>"
      + '  <div class="card"><div id="records-box"><div class="empty">正在加载…</div></div></div>'
    );
    mount(html, function (root) {
      bindLogout(root);
      apiGet("/api/shumiao/consume-records?page=" + page + "&pageSize=" + pageSize)
        .then(function (data) {
          var box = document.getElementById("records-box");
          var total = Number(data.total || 0);
          var pages = Math.max(1, Math.ceil(total / pageSize));
          var list = data.list || [];
          var pageSizeOptions = [10, 20, 50, 100].map(function (size) {
            return '<option value="' + size + '"' + (size === pageSize ? " selected" : "") + ">" + size + " 条</option>";
          }).join("");
          var head = ""
            + "<thead><tr>"
            + "<th>时间</th><th>消耗积分</th><th>明细条数</th><th>备注</th><th>消耗后余额</th>"
            + "</tr></thead>";
          var rows = list.map(function (r) {
            return "<tr>"
              + "<td>" + fmtTime(r.createdAt) + "</td>"
              + "<td style=\"color:var(--red);font-weight:600\">-" + fmtCount(r.consumeCount) + "</td>"
              + "<td>" + fmtCount(r.itemCount) + "</td>"
              + "<td>" + esc(String(r.remark || "").replace(/树苗/g, "积分")) + "</td>"
              + "<td>" + fmtCount(r.balanceAfter) + "</td>"
              + "</tr>";
          }).join("");
          box.innerHTML = list.length
            ? '<div class="table-wrap"><table>' + head + "<tbody>" + rows + "</tbody></table></div>"
            : '<div class="empty">暂无消耗记录</div>';
          box.innerHTML += '<div class="pagination">'
            + '  <label class="page-size-control"><span>每页</span><select id="consume-page-size">' + pageSizeOptions + "</select></label>"
            + '  <button class="page-btn" id="prev-page" ' + (page <= 1 ? "disabled" : "") + ">上一页</button>"
            + '  <span class="page-info">第 ' + page + " / " + pages + " 页 · 共 " + total + " 条</span>"
            + '  <button class="page-btn" id="next-page" ' + (page >= pages ? "disabled" : "") + ">下一页</button>"
            + "</div>";
          var pageSizeSelect = document.getElementById("consume-page-size");
          var prev = document.getElementById("prev-page");
          var next = document.getElementById("next-page");
          if (pageSizeSelect) pageSizeSelect.addEventListener("change", function () {
            go("/records/consume?page=1&pageSize=" + encodeURIComponent(pageSizeSelect.value));
          });
          if (prev) prev.addEventListener("click", function () { go("/records/consume?page=" + (page - 1) + "&pageSize=" + pageSize); });
          if (next) next.addEventListener("click", function () { go("/records/consume?page=" + (page + 1) + "&pageSize=" + pageSize); });
        })
        .catch(function (e) {
          document.getElementById("records-box").innerHTML = '<div class="empty">加载失败：' + esc(e.message) + "</div>";
        });
    });
  }

  // ---------- 启动 ----------
  warmPackageTitles();
  router();
})();
