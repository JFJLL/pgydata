// Phase 5.2 Electron real acceptance driver (CDP).
// Usage: node artifacts/verification/pgy-phase52-acceptance/driver.js <step|run>
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CDP_BASE = "http://127.0.0.1:9333";
const DIR = __dirname;
const SHOT_DIR = path.join(DIR, "shots");
const EVIDENCE = path.join(DIR, "evidence.json");
fs.mkdirSync(SHOT_DIR, { recursive: true });

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.logErrors = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ").slice(0, 300);
        this.consoleErrors.push(text);
      }
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        this.logErrors.push(String(msg.params.entry.text || "").slice(0, 300));
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after 20s`));
      }, 20000);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalExpr(expression) {
    const res = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error("eval failed: " + JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails).slice(0, 500));
    }
    return res.result ? res.result.value : undefined;
  }
  async setViewport(width, height, dpr) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: width,
      height: height,
      deviceScaleFactor: dpr,
      mobile: false,
    });
  }
  async shot(name, requiredViewport = VIEWPORT) {
    const file = path.join(SHOT_DIR, name + ".png");
    // 验收图不应让无关的高 z-index「采集助手」遮住目标节点；通过它自身
    // 的关闭按钮收起，不直接删除节点或篡改样式。
    await this.evalExpr(`(() => {
      const root = document.getElementById('magiorix-ops-assistant');
      if (!root) return { found: false, closed: false };
      const close = root.querySelector('[data-close]');
      if (close) { close.click(); return { found: true, closed: true }; }
      return { found: true, closed: false };
    })()`);
    // fromSurface:true 让截图遵从 CDP 模拟的 DPR；false 会退回宿主显示器 1.5x
    // 缩放，造成证据标注为 2x 而 PNG 实际为 1.5x。
    const res = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const buf = Buffer.from(res.data, "base64");
    if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("CDP screenshot is not a PNG");
    const physical = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    const cssViewport = await this.evalExpr("({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio })");
    const expected = { width: Math.round(cssViewport.width * cssViewport.dpr), height: Math.round(cssViewport.height * cssViewport.dpr) };
    // 历史证据曾将 1.5 DPR 图标为 DPR=2。此处同时核对页面运行值和 PNG
    // 物理像素，任一方向不匹配都不能作为视觉对照证据。
    const expectedDpr = requiredViewport.dpr;
    const target = { width: Math.round(cssViewport.width * expectedDpr), height: Math.round(cssViewport.height * expectedDpr) };
    if (cssViewport.width !== requiredViewport.width || cssViewport.height !== requiredViewport.height || Math.abs(cssViewport.dpr - expectedDpr) > 0.01 || Math.abs(physical.width - expected.width) > 1 || Math.abs(physical.height - expected.height) > 1 || Math.abs(physical.width - target.width) > 1 || Math.abs(physical.height - target.height) > 1) {
      throw new Error("screenshot viewport/DPR mismatch: " + JSON.stringify({ cssViewport, physical, expected, target, requiredViewport, requiredDpr: expectedDpr }));
    }
    fs.writeFileSync(file, buf);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (seenShotHashes.has(sha)) throw new Error("duplicate screenshot hash across scenes: " + sha + " for " + name);
    seenShotHashes.add(sha);
    lastShot = { file, sha256: sha, cssViewport, physical, expectedPhysical: expected };
    return { file, sha, cssViewport, physical, expectedPhysical: expected };
  }
  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cdp = null;
const evidence = [];
const VIEWPORT = { width: 1280, height: 631, dpr: 2 };
let lastShot = null;
const seenShotHashes = new Set();

function record(name, action, visible, extra) {
  const entry = {
    scene: name,
    action: action || "",
    viewport: lastShot && lastShot.cssViewport ? lastShot.cssViewport : Object.assign({}, VIEWPORT),
    capturedAt: new Date().toISOString(),
    visibleText: visible || [],
  };
  if (lastVisibility) {
    entry.visibility = lastVisibility;
    entry.keyNodeRects = Object.fromEntries(Object.entries(lastVisibility.checks || {}).map(([key, detail]) => [key, detail.node && detail.node.rect || null]));
  }
  if (extra && extra.png && lastShot) entry.screenshot = lastShot;
  if (extra) Object.assign(entry, extra);
  evidence.push(entry);
  console.log(JSON.stringify(entry));
}

const clickText = (selector, text) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
  // 精确匹配 + 容忍「新」徽标与「（N）」数量后缀（避免误中「收起筛选」等前缀）。
  const t = ${JSON.stringify(text)};
  const el = els.find(e => {
    const x = (e.textContent||'').trim();
    if (x === t) return true;
    if (x.indexOf(t) === 0) {
      const rest = x.slice(t.length);
      return /^新/.test(rest) || /^（\d+）/.test(rest) || /^新（\d+）/.test(rest);
    }
    return false;
  });
  if (!el) return { ok: false, found: els.map(e => (e.textContent||'').trim().slice(0, 40)).slice(0, 20) };
  el.scrollIntoView({ block: "center" });
  el.click();
  return { ok: true };
})()`;

const bodyText = () => cdp.evalExpr("document.body.innerText || ''");

// 验收中的「可见」不是 DOM 存在或 body.innerText 包含即可：节点必须有
// 实际尺寸、未被 CSS 隐藏或透明、与当前 viewport 相交，并且没有被主要遮挡。
// 结果同时作为每个场景的关键节点几何证据保存。
let lastVisibility = null;
async function visibleKeys(keys, scopeText) {
  const result = await cdp.evalExpr(`(() => {
    const keys = ${JSON.stringify(keys)};
    const scopeText = ${JSON.stringify(scopeText || "")};
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const nodeText = e => (e.textContent || '').trim();
    const matches = (text, key) => text === key || text.startsWith(key) || text.includes(key);
    const dialogNeedle = scopeText.startsWith('dialog:') ? scopeText.slice('dialog:'.length) : '';
    const layerCandidates = dialogNeedle ? [...document.querySelectorAll('[role="dialog"]')].filter(e => matches(nodeText(e), dialogNeedle)) : scopeText ? [...document.querySelectorAll('div')].filter(e => {
      const cs = getComputedStyle(e);
      return cs.position === 'fixed' && Number(cs.zIndex || 0) >= 1400 && matches(nodeText(e), scopeText);
    }) : [];
    const scope = layerCandidates.sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0] || document;
    function ancestorVisible(el) {
      let cur = el;
      let opacity = 1;
      while (cur && cur.nodeType === 1) {
        const cs = getComputedStyle(cur);
        opacity *= Number(cs.opacity || 1);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || opacity <= 0) return false;
        cur = cur.parentElement;
      }
      return true;
    }
    function inspect(el) {
      const r = el.getBoundingClientRect();
      const intersects = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < viewport.width && r.top < viewport.height;
      const points = intersects ? [
        [Math.max(r.left + 2, Math.min(r.right - 2, r.left + r.width / 2)), Math.max(r.top + 2, Math.min(r.bottom - 2, r.top + r.height / 2))],
        [Math.max(r.left + 1, Math.min(r.right - 1, r.left + 2)), Math.max(r.top + 1, Math.min(r.bottom - 1, r.top + 2))],
        [Math.max(r.left + 1, Math.min(r.right - 1, r.right - 2)), Math.max(r.top + 1, Math.min(r.bottom - 1, r.top + 2))],
        [Math.max(r.left + 1, Math.min(r.right - 1, r.left + 2)), Math.max(r.top + 1, Math.min(r.bottom - 1, r.bottom - 2))],
        [Math.max(r.left + 1, Math.min(r.right - 1, r.right - 2)), Math.max(r.top + 1, Math.min(r.bottom - 1, r.bottom - 2))],
      ] : [];
      const unobscured = points.filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit && (hit === el || el.contains(hit) || hit.contains(el));
      }).length;
      const cs = getComputedStyle(el);
      return {
        text: nodeText(el).slice(0, 120),
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        css: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity },
        viewportIntersects: intersects,
        unobscuredPoints: unobscured,
        visible: ancestorVisible(el) && intersects && unobscured >= 3,
      };
    }
    const out = {};
    for (const key of keys) {
      const candidates = [...scope.querySelectorAll('button,[role="button"],input,textarea,select,label,span,p,div,li,td,th')]
        .filter(e => matches(nodeText(e), key))
        .filter(e => ![...e.children].some(c => matches(nodeText(c), key)))
        .map(inspect);
      const visible = candidates.filter(c => c.visible).sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0] || null;
      out[key] = { visible: !!visible, node: visible, candidates: candidates.slice(0, 12) };
    }
    return { scope: scope === document ? 'document' : dialogNeedle ? 'dialog' : 'fixed-layer', viewport, checks: out };
  })()`);
  lastVisibility = result;
  const checks = Object.fromEntries(Object.entries(result.checks).map(([key, detail]) => [key, detail.visible]));
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  if (missing.length) throw new Error("visible geometry check failed: " + missing.join(", ") + "; " + JSON.stringify(result).slice(0, 1200));
  return { checks, nodes: result.checks, scope: result.scope, viewport: result.viewport };
}

async function visiblePlaceholder(fragment) {
  const result = await cdp.evalExpr(`(() => {
    const fragment = ${JSON.stringify(fragment)};
    const input = [...document.querySelectorAll('input,textarea')].find(e => (e.placeholder || '').includes(fragment));
    if (!input) return { key: 'placeholder:' + fragment, visible: false, reason: 'input not found' };
    let opacity = 1;
    for (let e = input; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      opacity *= Number(cs.opacity || 1);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || opacity <= 0) return { key: 'placeholder:' + fragment, visible: false, reason: 'css hidden' };
    }
    const r = input.getBoundingClientRect(), intersects = r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0;
    const hit = intersects ? document.elementFromPoint(Math.max(r.left + 2, Math.min(r.right - 2, r.left + r.width / 2)), Math.max(r.top + 2, Math.min(r.bottom - 2, r.top + r.height / 2))) : null;
    const unobscured = !!(hit && (hit === input || input.contains(hit) || hit.contains(input)));
    return { key: 'placeholder:' + fragment, visible: intersects && unobscured, node: { placeholder: input.placeholder, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, viewportIntersects: intersects, unobscured } };
  })()`);
  if (!result.visible) throw new Error("placeholder geometry check failed: " + JSON.stringify(result));
  if (!lastVisibility) lastVisibility = { scope: 'document', viewport: await cdp.evalExpr("({ width: innerWidth, height: innerHeight })"), checks: {} };
  lastVisibility.checks[result.key] = { visible: true, node: result.node, candidates: [result.node] };
  return result;
}

async function resultCountEvidence() {
  return cdp.evalExpr(`(() => {
    const node = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].find(e => /^共\\s*(\\d+)\\s*位博主$/.test((e.textContent || '').trim()));
    if (!node) return { visible: false, total: null, reason: 'result count heading not found' };
    const r = node.getBoundingClientRect(), cs = getComputedStyle(node);
    const visible = r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
    const m = (node.textContent || '').trim().match(/^共\\s*(\\d+)\\s*位博主$/);
    return { visible, total: m ? Number(m[1]) : null, text: (node.textContent || '').trim(), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
  })()`);
}

async function matrixHorizontalScrollEvidence() {
  const titles = ["合作目标", "匹配度", "数据表现", "平台推荐", "常规剔除"];
  const result = await cdp.evalExpr(`(() => {
    const titles = ${JSON.stringify(titles)};
    function exactNode(text) {
      return [...document.querySelectorAll('span,p,div')].find(e => e.children.length === 0 && (e.textContent || '').trim() === text);
    }
    const details = [];
    for (const title of titles) {
      const node = exactNode(title);
      const scrollables = [];
      for (let el = node && node.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1) {
          scrollables.push({ tag: el.tagName, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowX: getComputedStyle(el).overflowX });
        }
      }
      details.push({ title, found: !!node, scrollables });
    }
    return { details, count: details.reduce((n, d) => n + d.scrollables.length, 0) };
  })()`);
  if (result.count !== 0 || result.details.some(d => !d.found)) throw new Error("matrix horizontal scroll invariant failed: " + JSON.stringify(result));
  return result;
}

async function popoverAnchorEvidence(label) {
  const result = await cdp.evalExpr(`(() => {
    const label = ${JSON.stringify(label)};
    const buttons = [...document.querySelectorAll('button')].filter(e => {
      const t = (e.textContent || '').trim();
      return t === label || t.startsWith(label);
    });
    const anchor = buttons.filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).position !== 'fixed';
    }).pop();
    const pop = [...document.querySelectorAll('div')].filter(e => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const popText = (e.textContent || '').trim();
      return cs.position === 'fixed' && Number(cs.zIndex || 0) >= 1400 && r.width > 0 && r.height > 0 && (popText === label || popText.startsWith(label) || popText.includes(label));
    }).sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0];
    if (!anchor || !pop) return { ok: false, reason: !anchor ? 'anchor not found' : 'popover not found' };
    const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
    const verticalGap = p.top >= a.bottom ? p.top - a.bottom : (p.bottom <= a.top ? a.top - p.bottom : 0);
    const horizontalGap = p.right < a.left ? a.left - p.right : (a.right < p.left ? p.left - a.right : 0);
    return {
      ok: verticalGap <= 12 && horizontalGap <= 12,
      anchor: { left: a.left, top: a.top, right: a.right, bottom: a.bottom, width: a.width, height: a.height },
      popover: { left: p.left, top: p.top, right: p.right, bottom: p.bottom, width: p.width, height: p.height },
      verticalGap, horizontalGap,
    };
  })()`);
  if (!result.ok) throw new Error("popover anchor invariant failed: " + JSON.stringify(result));
  return result;
}

async function clickTrigger(label) {
  return cdp.evalExpr(clickText("button", label));
}

async function clickAny(selector) {
  return cdp.evalExpr(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    if (!els.length) return { ok: false, count: 0 };
    els[els.length - 1].scrollIntoView({ block: "center" });
    els[els.length - 1].click();
    return { ok: true, count: els.length };
  })()`);
}

async function closePopover() {
  // 点击固定定位遮罩（左上角 5,5 必是遮罩）。
  return cdp.evalExpr(`(() => {
    const el = document.elementFromPoint(5, 5);
    if (!el) return { ok: false };
    el.click();
    return { ok: true };
  })()`);
}

async function setInputValue(placeholderFragment, value) {
  return cdp.evalExpr(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const kw = inputs.find(i => (i.placeholder||'').includes(${JSON.stringify(placeholderFragment)}));
    if (!kw) return { ok: false, placeholders: inputs.map(i => i.placeholder).slice(0, 10) };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(kw, ${JSON.stringify(value)});
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`);
}

async function scrollTop() {
  await cdp.evalExpr("window.scrollTo(0,0)");
  await sleep(500);
}

async function scrollToText(text) {
  await cdp.evalExpr(`(() => {
    const all = [...document.querySelectorAll('*')];
    const el = all.filter(e => (e.textContent||'').includes(${JSON.stringify(text)}))
      .sort((a,b) => (a.textContent||'').length - (b.textContent||'').length)[0];
    if (el) el.scrollIntoView({ block: "center" });
    return !!el;
  })()`);
  await sleep(500);
}

async function enablePage() {
  await cdp.evalExpr("localStorage.setItem('magiorix-pgy-kol-enabled','1'); location.hash = '#/pgy-kol-search'; 'ok'");
  await sleep(2500);
  await cdp.evalExpr(`(() => {
    window.__pgyErrors = [];
    window.addEventListener('error', function (e) { window.__pgyErrors.push(String(e.message||e.error||'').slice(0,200)); });
    window.addEventListener('unhandledrejection', function (e) { window.__pgyErrors.push('rejection:' + String((e.reason&&e.reason.message)||e.reason||'').slice(0,200)); });
    return 'hooks';
  })()`);
  await sleep(2500);
}

async function dismissUpdateModal() {
  // 应用会检测到远程 1.1.13 并弹「新版本已准备就绪」，必须先点「稍后提醒」。
  const r = await cdp.evalExpr(`(() => {
    const bs = [...document.querySelectorAll('button')];
    const later = bs.find(b => (b.textContent||'').trim() === '稍后提醒');
    if (later) { later.click(); return 'dismissed'; }
    if ((document.body.innerText||'').includes('新版本已准备就绪')) {
      const el = document.elementFromPoint(8, 8);
      if (el) { el.click(); return 'backdrop-click'; }
    }
    return 'none';
  })()`);
  await sleep(600);
  return r;
}

async function resetFilters() {
  const r = await clickTrigger("一键清空");
  await sleep(700);
  return r;
}

async function stepState() {
  const out = await cdp.evalExpr(`(() => {
    const bridge = window.bridge && window.bridge.pgyKol ? window.bridge.pgyKol : null;
    return {
      href: location.href,
      hasRoot: !!document.getElementById('root') && !!document.getElementById('root').children.length,
      bridgeType: typeof window.bridge,
      pgyKolType: typeof (window.bridge && window.bridge.pgyKol),
      methodCount: bridge ? Object.keys(bridge).length : 0,
      flag: localStorage.getItem('magiorix-pgy-kol-enabled'),
    };
  })()`);
  console.log(JSON.stringify(out));
  // 登录态探测（不泄露任何凭据）。
  if (cdp) {
    const st = await cdp.evalExpr(`(async () => {
      const b = window.bridge && window.bridge.pgyKol;
      if (!b || !b.getStatus) return { status: 'no-bridge' };
      const r = await b.getStatus();
      return { status: r && r.ok ? 'ok' : 'err', code: r && r.error && r.error.code || null };
    })()`);
    console.log(JSON.stringify(st));
  }
}

// 只读布局探针：用于识别仍在挤压找博主宽内容模式的重复二级导航。
// 不点击、不滚动、不改 localStorage，也不参与 run 的任何验收场景。
async function stepInspectLayout() {
  const out = await cdp.evalExpr(`(() => {
    const vp = { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
    const text = e => (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    const rect = e => {
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const describe = e => {
      const cs = getComputedStyle(e);
      return {
        tag: e.tagName.toLowerCase(),
        class: typeof e.className === 'string' ? e.className.slice(0, 240) : '',
        role: e.getAttribute('role') || '',
        rect: rect(e),
        overflow: { x: cs.overflowX, y: cs.overflowY },
        position: cs.position,
        text: text(e),
      };
    };
    const candidates = [...document.querySelectorAll('*')].filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 56 || r.height < 48 || r.bottom <= 0 || r.top >= vp.height) return false;
      const cs = getComputedStyle(e);
      const classRole = ((typeof e.className === 'string' ? e.className : '') + ' ' + (e.getAttribute('role') || '')).toLowerCase();
      const namedSideRegion = /sidebar|side-bar|sider|secondary|subnav|sub-nav|navigation|nav|menu|aside/.test(classRole) || e.tagName === 'ASIDE' || e.tagName === 'NAV';
      const viewportEdge = r.left <= 8 || r.right >= vp.width - 8;
      const pinned = cs.position === 'fixed' || cs.position === 'sticky';
      return namedSideRegion || (viewportEdge && pinned) || (viewportEdge && r.height >= Math.min(160, vp.height * 0.45));
    }).map(describe);
    const fixedLayers = [...document.querySelectorAll('*')].filter(e => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      return cs.position === 'fixed' && Number(cs.zIndex || 0) >= 1399 && r.width > 0 && r.height > 0;
    }).map(e => {
      const d = describe(e);
      d.zIndex = getComputedStyle(e).zIndex;
      return d;
    });
    const routeLeaves = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && text(e) === '找博主');
    const routeLeaf = routeLeaves.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    })[0] || null;
    const ancestorChain = [];
    for (let e = routeLeaf; e && e.nodeType === 1; e = e.parentElement) ancestorChain.push(describe(e));
    // 与页面文案实际渲染方式一致：TreeWalker 逐文本节点找两段菜单文案，
    // 文案即使被拆到不同 span/div 也能通过其父元素的最小共同祖先定位导航。
    const bloggerTextParents = [], noteTextParents = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue || '';
      if (value.includes('蒲公英博主采集') && node.parentElement) bloggerTextParents.push(node.parentElement);
      if (value.includes('蒲公英笔记采集') && node.parentElement) noteTextParents.push(node.parentElement);
    }
    function elementAncestors(e) {
      const out = [];
      for (let cur = e; cur && cur.nodeType === 1; cur = cur.parentElement) out.push(cur);
      return out;
    }
    function commonAncestor(a, b) {
      const aa = new Set(elementAncestors(a));
      for (const cur of elementAncestors(b)) if (aa.has(cur)) return cur;
      return null;
    }
    const collectorCommonCandidates = [];
    for (const bloggerParent of bloggerTextParents) for (const noteParent of noteTextParents) {
      const common = commonAncestor(bloggerParent, noteParent);
      if (!common) continue;
      const r = common.getBoundingClientRect();
      if (r.left > 72 && r.width > 0 && r.height > 0) collectorCommonCandidates.push(common);
    }
    const collector = collectorCommonCandidates.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    })[0] || null;
    const collectorAncestors = [];
    for (let e = collector; e && e.nodeType === 1; e = e.parentElement) collectorAncestors.push(describe(e));
    const developerTitleCandidates = [...document.querySelectorAll('*')].filter(e => {
      const t = e.textContent || '', r = e.getBoundingClientRect();
      return t.includes('找博主') && t.includes('开发说明') && r.width > 0 && r.height > 0;
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    });
    const developerTitleContainer = developerTitleCandidates[0] || null;
    const developerTitleAncestors = [];
    for (let e = developerTitleContainer; e && e.nodeType === 1; e = e.parentElement) developerTitleAncestors.push(describe(e));
    return {
      viewport: vp,
      sidebarCandidates: candidates,
      fixedLayers,
      routeAnchor: routeLeaf ? describe(routeLeaf) : null,
      routeContentAncestors: ancestorChain,
      collectorTextParents: { blogger: bloggerTextParents.map(describe), note: noteTextParents.map(describe) },
      collectorCommonAncestor: collector ? describe(collector) : null,
      collectorCommonAncestorChain: collectorAncestors,
      developerTitleContainer: developerTitleContainer ? describe(developerTitleContainer) : null,
      developerTitleAncestors,
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

// 不交互的当前画面捕获：用于人工查看某轮布局，不写页面状态。
async function stepCaptureCurrent() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shot = await cdp.shot("inspect-current-" + stamp);
  const out = { png: shot.file, sha256: shot.sha, cssViewport: shot.cssViewport, physical: shot.physical };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function stepShotDefault() {
  await resetFilters();
  await scrollTop();
  // 首屏只断言当前 631px viewport 必见的官网主流程；下方分区分别在
  // 其独立场景滚动到位后检查，不能把“DOM存在”误当作“首屏可见”。
  const vis = await visibleKeys(["找博主", "搜笔记", "搜昵称", "已选条件", "合作目标", "匹配度", "博主类目", "展开"]);
  await visiblePlaceholder("按笔记关键词找博主，试试搜");
  const matrixScroll = await matrixHorizontalScrollEvidence();
  const shot = await cdp.shot("01-default-collapsed");
  record("01-default-collapsed", "点击「一键清空」重置筛选后滚动到顶部", Object.keys(vis.checks).filter((k) => vis.checks[k]), { checks: vis.checks, matrixScroll, png: shot.file, sha256: shot.sha });
}

async function stepShotCategory() {
  await scrollTop();
  const r = await clickTrigger("展开");
  await sleep(700);
  const vis = await visibleKeys(["情感", "摄影", "游戏", "科技数码", "汽车", "婚嫁", "收起"]);
  const shot = await cdp.shot("02-category-expanded");
  record("02-category-expanded", "点击博主类目行的「展开」按钮", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await clickTrigger("收起");
  await sleep(400);
}

async function stepShotGender() {
  await scrollToText("性别");
  const r = await clickTrigger("性别");
  await sleep(700);
  const vis = await visibleKeys(["性别", "不限", "男", "女"], "性别");
  const anchor = await popoverAnchorEvidence("性别");
  const shot = await cdp.shot("03-gender-popover");
  record("03-gender-popover", "点击「性别」触发器打开 Popover", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, anchor, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await closePopover();
  await sleep(400);
}

async function stepShotLocation() {
  await scrollToText("地域");
  let r = await clickTrigger("地域");
  await sleep(900);
  // 若未打开则重试一次。
  let opened = (await bodyText()).includes("省份");
  if (!opened) {
    r = await clickTrigger("地域");
    await sleep(900);
    opened = (await bodyText()).includes("省份");
  }
  // 在弹层（fixed zIndex 1400）中选择省（优先广东省，否则省份列首项）。
  const sel = await cdp.evalExpr(`(() => {
    const pop = [...document.querySelectorAll('div')].find(e => {
      const s = getComputedStyle(e);
      return s.position === 'fixed' && s.zIndex === '1400';
    });
    if (!pop) return { ok: false, reason: 'popover not found' };
    // 省份列 = 以「省份」为表头的列容器内所有叶子行。
    const header = [...pop.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.textContent||'').trim() === '省份');
    const col = header ? header.parentElement : pop;
    const rows = [...col.querySelectorAll('*')].filter(e => {
      const t = (e.textContent||'').trim();
      return e.childElementCount === 0 && t.length > 0 && t.length <= 8 && e.offsetParent !== null;
    });
    const target = rows.find(e => ['广东省','广东'].includes((e.textContent||'').trim()))
      || rows.find(e => !['省份','城市','区县','已选：','地域'].includes((e.textContent||'').trim()));
    if (!target) return { ok: false, rows: rows.map(r => (r.textContent||'').trim()).slice(0, 15) };
    target.click();
    return { ok: true, picked: (target.textContent||'').trim() };
  })()`);
  await sleep(900);
  // 再选一个城市，展开第三级「区县」列。
  const sel2 = await cdp.evalExpr(`(() => {
    const pop = [...document.querySelectorAll('div')].find(e => {
      const s = getComputedStyle(e);
      return s.position === 'fixed' && s.zIndex === '1400';
    });
    if (!pop) return { ok: false };
    const header = [...pop.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.textContent||'').trim() === '城市');
    const col = header ? header.parentElement : null;
    if (!col) return { ok: false, reason: 'no city column' };
    const rows = [...col.querySelectorAll('*')].filter(e => {
      const t = (e.textContent||'').trim();
      return e.childElementCount === 0 && t.length > 0 && t.length <= 8 && t !== '城市' && e.offsetParent !== null;
    });
    if (!rows.length) return { ok: false, rows: [] };
    rows[0].click();
    return { ok: true, picked: (rows[0].textContent||'').trim() };
  })()`);
  await sleep(900);
  const vis = await visibleKeys(["省份", "城市", "区县"], "地域");
  const shot = await cdp.shot("04-location-cascade");
  record("04-location-cascade", "打开「地域」三级级联 Popover，选中省份与城市展开区县列", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, opened, sel, sel2, checks: vis.checks, png: shot.file, sha256: shot.sha });
  // 确定后关闭。
  await cdp.evalExpr(`(() => {
    const bs = [...document.querySelectorAll('button')].filter(b => (b.textContent||'').trim() === '确定');
    if (bs.length) { bs[bs.length - 1].click(); return { ok: true }; }
    return { ok: false };
  })()`);
  await sleep(500);
  await closePopover();
  await sleep(400);
}

async function stepShotAudience20() {
  await scrollToText("二十大人群");
  const r = await clickTrigger("二十大人群");
  await sleep(900);
  const vis = await visibleKeys(["二十大人群", "已选 0 项", "清空", "确定"], "二十大人群");
  const shot = await cdp.shot("05-audience20-tree");
  record("05-audience20-tree", "打开「二十大人群」树形弹层", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await closePopover();
  await sleep(400);
}

async function stepShotAutomotive() {
  await scrollToText("行业特色画像");
  const r = await clickTrigger("行业特色画像");
  await sleep(900);
  const vis = await visibleKeys(["行业特色画像", "清空", "确定"], "行业特色画像");
  const shot = await cdp.shot("06-automotive-tree");
  record("06-automotive-tree", "打开「行业特色画像」树形弹层", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await closePopover();
  await sleep(400);
}

async function stepShotConsume() {
  await scrollToText("预估消费行为");
  const r = await clickTrigger("预估消费行为");
  await sleep(900);
  const vis = await visibleKeys(["预估消费行为", "清空", "确定"], "预估消费行为");
  const shot = await cdp.shot("07-consume-tree");
  record("07-consume-tree", "打开「预估消费行为」树形弹层", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await closePopover();
  await sleep(400);
}

async function stepShotNickname() {
  await resetFilters();
  await scrollTop();
  const t = await clickTrigger("搜昵称");
  await sleep(600);
  const f = await setInputValue("昵称", "奶茶测评");
  await sleep(300);
  const s = await clickTrigger("搜索");
  await sleep(4500);
  const vis = await visibleKeys(["搜索历史", "奶茶测评", "清空历史"]);
  const shot = await cdp.shot("08-nickname-history");
  record("08-nickname-history", "切到「搜昵称」，搜索「奶茶测评」后显示搜索历史", Object.keys(vis.checks).filter((k) => vis.checks[k]), { t, f, s, checks: vis.checks, png: shot.file, sha256: shot.sha });
  await cdp.evalExpr(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '清空历史');
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(500);
}

async function stepShotColumns() {
  await scrollTop();
  let r;
  try {
    r = await clickTrigger("选择展示指标");
    await sleep(900);
    const vis = await visibleKeys(["官网展示指标（41）", "固定列", "博主信息", "已添加", "以上为横向固定列", "清空", "取消", "确定"], "dialog:官网展示指标（41）");
    const shot = await cdp.shot("09-columns-dialog");
    record("09-columns-dialog", "打开「选择展示指标」弹窗", Object.keys(vis.checks).filter((k) => vis.checks[k]), { r, checks: vis.checks, png: shot.file, sha256: shot.sha });
  } finally {
    await closeColumnsDialog();
    await sleep(500);
  }
}

async function closeColumnsDialog() {
  return cdp.evalExpr(`(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(e => (e.textContent || '').includes('官网展示指标（41）'));
    const cancel = dialog && [...dialog.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
    if (cancel) { cancel.click(); return { closed: true }; }
    return { closed: false };
  })()`);
}

async function stepShotColumnsExtension() {
  await scrollTop();
  let r;
  try {
    r = await clickTrigger("选择展示指标");
    await sleep(900);
    // 先证明官方 41 项语义在 dialog 中真实出现，再滚动到扩展分区；两者
    // 分开记录，避免滚动后拿页面其它同名文本冒充官方分区。
    const official = await visibleKeys(["官网展示指标（41）", "固定列"], "dialog:官网展示指标（41）");
    const extensionScroll = await cdp.evalExpr(`(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(e => (e.textContent || '').includes('官网展示指标（41）'));
      if (!dialog) return { ok: false, reason: 'official metrics dialog not found' };
      const header = [...dialog.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim().startsWith('Magiorix 扩展字段'));
      const field = [...dialog.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === '博主UID');
      if (!header || !field) return { ok: false, reason: !header ? 'extension header not found' : 'extension field not found' };
      header.scrollIntoView({ block: 'center' });
      return { ok: true, headerText: (header.textContent || '').trim(), fieldText: (field.textContent || '').trim() };
    })()`);
    if (!extensionScroll.ok) throw new Error("extension-column scroll setup failed: " + JSON.stringify(extensionScroll));
    await sleep(700);
    const extension = await visibleKeys(["Magiorix 扩展字段", "博主UID"], "dialog:官网展示指标（41）");
    const shot = await cdp.shot("09-columns-extension-" + Date.now());
    record("09-columns-extension", "打开官网 41 项指标 dialog 后滚动到 Magiorix 扩展字段并验证字段", Object.keys(extension.checks).filter((k) => extension.checks[k]), { r, officialChecks: official.checks, officialNodes: official.nodes, extensionScroll, checks: extension.checks, png: shot.file, sha256: shot.sha });
  } finally {
    await closeColumnsDialog();
    await sleep(500);
  }
}

// 只读观察已有批量任务和页面入口：绝不调用 batchStart/pause/resume/export，
// 因此不会新建任务或修改用户本地/生产数据。
async function stepInspectBatchReadOnly() {
  const out = await cdp.evalExpr(`(async () => {
    const bridge = window.bridge && window.bridge.pgyKol;
    const list = bridge && typeof bridge.batchList === 'function' ? await bridge.batchList() : null;
    const viewportVisible = e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
    };
    const labels = ['开始采集', '暂停', '继续', '增加预算并继续', '增加页数并继续', '导出', '任务历史'];
    const controls = Object.fromEntries(labels.map(label => [label, [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === label).some(viewportVisible)]));
    const tasks = list && list.ok && Array.isArray(list.data) ? list.data.map(t => ({ status: t.status || null, completeness: t.completeness || null, hasResume: !!(t.resume || t.resumePlan), hasExport: true })) : [];
    return {
      bridgeMethods: bridge ? ['batchList', 'batchGet', 'batchPause', 'batchResume', 'batchExport'].reduce((o, k) => { o[k] = typeof bridge[k] === 'function'; return o; }, {}) : null,
      listOk: !!(list && list.ok),
      taskCount: tasks.length,
      tasks,
      visibleControls: controls,
      fallbackDeterministicTests: [
        'pgy-kol-batch-resume.test.mjs: budget-exhausted → incomplete/cannot-prove（非 completed），数据仍可导出',
        'pgy-kol-batch-resume.test.mjs: 增加 queryBudget 后从原检查点继续：不重抓已提交页、计数不清零、taskId 不变',
        'pgy-kol-batch-runner.test.mjs: 预算耗尽：queryBudget 用尽停止，stopReason=budget-exhausted',
        'pgy-kol-batch-export.test.mjs: fixed/computed/unavailable 列不可导出：getPgyKolExportHeaders 拒绝，绝不进入 payload',
      ],
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

// 仅选择已有 paused 任务以查看详情；不会调用 pause/resume/export 或创建任务。
async function stepShotBatchExistingPaused() {
  const listed = await cdp.evalExpr(`(async () => {
    const bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || typeof bridge.batchList !== 'function') return { ok: false, reason: 'batchList bridge unavailable' };
    const res = await bridge.batchList();
    if (!res || !res.ok || !Array.isArray(res.data)) return { ok: false, reason: 'batchList failed' };
    const task = res.data.find(t => t && t.status === 'paused');
    return task ? { ok: true, taskId: task.taskId, status: task.status, completeness: task.completeness || null } : { ok: false, reason: 'no existing paused task' };
  })()`);
  if (!listed.ok || !listed.taskId) throw new Error("paused task cannot be safely inspected: " + JSON.stringify(listed));
  const selected = await cdp.evalExpr(`(() => {
    const taskId = ${JSON.stringify(listed.taskId)};
    const idNode = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === taskId);
    if (!idNode) return { ok: false, reason: 'paused task is not rendered in task history', taskId };
    let row = null;
    for (let e = idNode.parentElement; e && e !== document.body; e = e.parentElement) {
      const view = [...e.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '查看');
      if (view && (e.textContent || '').includes(taskId)) { row = e; break; }
    }
    if (!row) return { ok: false, reason: 'task history row has no safe 查看 control', taskId };
    row.scrollIntoView({ block: 'center' });
    const view = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '查看');
    view.click(); // 只改变当前页面详情选择，不改变任务状态或数据。
    return { ok: true, taskId };
  })()`);
  if (!selected.ok) throw new Error("paused task UI selection unavailable: " + JSON.stringify(selected));
  await sleep(900);
  const detail = await cdp.evalExpr(`(() => {
    const taskId = ${JSON.stringify(listed.taskId)};
    const visible = e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0) || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity || 1) <= 0) return false;
      const hit = document.elementFromPoint(Math.max(r.left + 2, Math.min(r.right - 2, r.left + r.width / 2)), Math.max(r.top + 2, Math.min(r.bottom - 2, r.top + r.height / 2)));
      return !!(hit && (hit === e || e.contains(hit) || hit.contains(e)));
    };
    const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const idNode = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').includes(taskId) && visible(e));
    let panel = null;
    for (let e = idNode && idNode.parentElement; e && e !== document.body; e = e.parentElement) {
      if ((e.textContent || '').includes('任务进度') && (e.textContent || '').includes(taskId)) { panel = e; break; }
    }
    if (!panel) return { ok: false, reason: 'selected paused task detail panel not visibly rendered', taskId };
    panel.scrollIntoView({ block: 'center' });
    const leaves = [...panel.querySelectorAll('*')].filter(e => e.children.length === 0);
    const status = leaves.find(e => (e.textContent || '').trim() === '已暂停' && visible(e));
    const completeness = leaves.find(e => (e.textContent || '').trim().startsWith('完整性') && visible(e));
    const resume = [...panel.querySelectorAll('button')].find(b => ((b.textContent || '').trim() === '继续' || (b.textContent || '').trim().includes('继续')) && visible(b));
    return {
      ok: !!(status && completeness && resume),
      taskId,
      status: status ? (status.textContent || '').trim() : null,
      completeness: completeness ? (completeness.textContent || '').trim() : null,
      resumeLabel: resume ? (resume.textContent || '').trim() : null,
      rects: { taskId: idNode ? rect(idNode) : null, status: status ? rect(status) : null, completeness: completeness ? rect(completeness) : null, resume: resume ? rect(resume) : null },
    };
  })()`);
  if (!detail.ok) throw new Error("paused task detail is not safely/verifiably visible: " + JSON.stringify(detail));
  const shot = await cdp.shot("13-batch-existing-paused-" + Date.now());
  record("13-batch-existing-paused", "只读选择已有 paused 任务并查看恢复入口（未调用恢复）", ["已暂停", detail.completeness, detail.resumeLabel].filter(Boolean), { taskId: listed.taskId, listedStatus: listed.status, listedCompleteness: listed.completeness, detail, png: shot.file, sha256: shot.sha });
}

async function stepShotSummary() {
  await resetFilters();
  await scrollTop();
  // 性别=女（Popover 单选）。
  await scrollToText("性别");
  await clickTrigger("性别");
  await sleep(600);
  await cdp.evalExpr(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && (e.textContent||'').trim() === '女' && e.offsetParent !== null);
    if (els.length) { els[els.length - 1].click(); return { ok: true }; }
    return { ok: false };
  })()`);
  await sleep(600);
  // 曝光中位数=5万以上（Popover 单选）。
  await scrollToText("曝光中位数");
  await clickTrigger("曝光中位数");
  await sleep(600);
  await cdp.evalExpr(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && (e.textContent||'').trim() === '5万以上' && e.offsetParent !== null);
    if (els.length) { els[els.length - 1].click(); return { ok: true }; }
    return { ok: false };
  })()`);
  await sleep(600);
  // 剔除低活（checkbox）。
  await scrollToText("剔除低活博主");
  await cdp.evalExpr(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && (e.textContent||'').trim() === '剔除低活博主' && e.offsetParent !== null);
    if (els.length) { els[els.length - 1].click(); return { ok: true }; }
    return { ok: false };
  })()`);
  await sleep(600);
  await scrollToText("已选条件");
  const vis = await visibleKeys(["已选条件", "性别：女", "曝光中位数：5万以上", "剔除低活博主", "一键清空"]);
  const shot = await cdp.shot("10-summary-selected");
  record("10-summary-selected", "选择性别=女、曝光中位数=5万以上、剔除低活博主后查看已选条件", Object.keys(vis.checks).filter((k) => vis.checks[k]), { checks: vis.checks, png: shot.file, sha256: shot.sha });
}

async function stepShotEmpty() {
  await resetFilters();
  await scrollTop();
  const t = await clickTrigger("搜昵称");
  await sleep(400);
  const f = await setInputValue("昵称", "zzzzqqxxnonexistentnick");
  await sleep(300);
  const s = await clickTrigger("搜索");
  // 轮询等待搜索结果/错误（最多 12 秒）。
  let outcome = "pending";
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    const txt = await bodyText();
    if (txt.includes("没有匹配的博主")) { outcome = "empty"; break; }
    if (txt.includes("查询失败") || txt.includes("登录已失效")) { outcome = "error"; break; }
    if (txt.includes("共 ") && txt.includes("位博主")) { outcome = "result"; break; }
  }
  // 滚动到空结果提示，确保截图可见。
  await cdp.evalExpr(`(() => {
    const all = [...document.querySelectorAll('*')];
    const el = all.filter(e => (e.textContent||'').includes('没有匹配的博主'))
      .sort((a,b) => (a.textContent||'').length - (b.textContent||'').length)[0];
    if (el) el.scrollIntoView({ block: "center" });
    return !!el;
  })()`);
  await sleep(500);
  const text = await bodyText();
  if (outcome !== "empty") throw new Error("empty-result scenario did not reach a real empty state: " + outcome);
  const vis = await visibleKeys(["没有匹配的博主"]);
  const shot = await cdp.shot("11-empty-result");
  record("11-empty-result", "搜索不存在关键词", Object.keys(vis.checks).filter((k) => vis.checks[k]), { t, f, s, outcome, checks: vis.checks, sample: text.slice(0, 400), png: shot.file, sha256: shot.sha });
}

async function stepShotTableScroll() {
  await resetFilters();
  await scrollTop();
  const t = await clickTrigger("搜笔记");
  await sleep(400);
  const f = await setInputValue("试试搜", "面膜");
  await sleep(300);
  const s = await clickTrigger("搜索");
  await sleep(5000);
  // 结果总数在结果区（而非首屏）时，先以语义 heading 锚定并滚入当前 viewport。
  const countScroll = await cdp.evalExpr(`(() => {
    const node = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].find(e => /^共\\s*(\\d+)\\s*位博主$/.test((e.textContent || '').trim()));
    if (!node) return { found: false };
    node.scrollIntoView({ block: 'center' });
    return { found: true, text: (node.textContent || '').trim() };
  })()`);
  if (!countScroll.found) throw new Error("result count heading not found after successful search");
  await sleep(700);
  const count = await resultCountEvidence();
  if (!count.visible || !Number.isInteger(count.total) || count.total <= 0) throw new Error("result count heading is not visibly positive: " + JSON.stringify(count));
  // 同一 1280×631 / DPR2 viewport 下，表格必须真实可见，且它的实际 wrapper
  // 必须是本页唯一被允许横向滚动的区域。
  const tableReady = await cdp.evalExpr(`(() => {
    const table = [...document.querySelectorAll('table')].find(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0);
    if (!table) return { ok: false, reason: 'table not found' };
    table.scrollIntoView({ block: 'center' });
    return { ok: true };
  })()`);
  if (!tableReady.ok) throw new Error("result table missing: " + JSON.stringify(tableReady));
  await sleep(700);
  const sc = await cdp.evalExpr(`(() => {
    const visible = r => r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0;
    const table = [...document.querySelectorAll('table')].find(e => visible(e.getBoundingClientRect()));
    if (!table) return { ok: false, reason: 'table not visible' };
    let wrapper = null;
    for (let e = table.parentElement; e && e !== document.body; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 1) { wrapper = e; break; }
    }
    if (!wrapper) return { ok: false, reason: 'horizontal table wrapper not found' };
    const tr = table.getBoundingClientRect(), wr = wrapper.getBoundingClientRect();
    if (!visible(tr) || !visible(wr) || wrapper.scrollWidth <= wrapper.clientWidth + 1) {
      return { ok: false, reason: 'table/wrapper not visibly scrollable', tableRect: tr.toJSON(), wrapperRect: wr.toJSON(), scrollWidth: wrapper.scrollWidth, clientWidth: wrapper.clientWidth };
    }
    wrapper.scrollLeft = Math.min(200, wrapper.scrollWidth - wrapper.clientWidth);
    return { ok: wrapper.scrollLeft > 0, tableRect: tr.toJSON(), wrapperRect: wr.toJSON(), scrollWidth: wrapper.scrollWidth, clientWidth: wrapper.clientWidth, scrollLeft: wrapper.scrollLeft };
  })()`);
  if (!sc.ok) throw new Error("result table horizontal-scroll invariant failed: " + JSON.stringify(sc));
  const shot = await cdp.shot("12-table-hscroll");
  record("12-table-hscroll", "搜索「面膜」后滚动到真实结果表格并横向滚动", [], { t, f, s, count, countScroll, table: sc, png: shot.file, sha256: shot.sha });
}

async function stepErrors() {
  const errs = await cdp.evalExpr("(window.__pgyErrors || []).slice(0, 20)");
  const out = { pageErrors: errs, consoleErrors: cdp.consoleErrors.slice(0, 20), logErrors: cdp.logErrors.slice(0, 20) };
  record("00-console-errors", "收集页面运行错误", [], out);
  const bad = (errs && errs.length) || cdp.consoleErrors.length || cdp.logErrors.length;
  return bad === 0;
}

async function stepWatchReload() {
  cdp.consoleErrors = [];
  cdp.logErrors = [];
  const exceptions = [];
  const listener = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      const desc = d.exception && (d.exception.description || d.exception.value) || d.text || "";
      exceptions.push(JSON.stringify({
        text: d.text,
        desc: String(desc).slice(0, 1200),
        url: d.url,
        line: d.lineNumber,
        col: d.columnNumber,
        stack: d.exception && d.exception.stack ? String(d.exception.stack).slice(0, 1500) : null,
      }));
    }
  };
  cdp.ws.addEventListener("message", listener);
  await cdp.send("Page.reload", { ignoreCache: true });
  await sleep(9000);
  cdp.ws.removeEventListener("message", listener);
  const out = {
    exceptions,
    consoleErrors: cdp.consoleErrors.slice(0, 30),
    logErrors: cdp.logErrors.slice(0, 30),
    rootChildren: await cdp.evalExpr("document.getElementById('root') ? document.getElementById('root').children.length : -1"),
    body: (await cdp.evalExpr("document.body.innerText || ''")).slice(0, 300),
  };
  record("00-reload-watch", "监听加载期异常后强制刷新", [], out);
  console.log(JSON.stringify(out));
}

async function stepRun() {
  await dismissUpdateModal();
  // 确保矩阵展开（避免上一次运行遗留的收起状态）。
  await cdp.evalExpr(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '展开筛选');
    if (b) { b.click(); return 'expanded'; }
    return 'already-open';
  })()`);
  await sleep(600);
  const steps = [
    ["enable", enablePage],
    ["state", stepState],
    ["shot-default", stepShotDefault],
    ["shot-category", stepShotCategory],
    ["shot-gender", stepShotGender],
    ["shot-location", stepShotLocation],
    ["shot-audience20", stepShotAudience20],
    ["shot-automotive", stepShotAutomotive],
    ["shot-consume", stepShotConsume],
    ["shot-nickname", stepShotNickname],
    ["shot-columns", stepShotColumns],
    ["shot-columns-extension", stepShotColumnsExtension],
    ["shot-summary", stepShotSummary],
    ["shot-empty", stepShotEmpty],
    ["shot-table-scroll", stepShotTableScroll],
    ["errors", stepErrors],
  ];
  const results = {};
  for (const [name, fn] of steps) {
    try {
      await fn();
      results[name] = "pass";
    } catch (e) {
      results[name] = "fail: " + String((e && e.message) || e).slice(0, 300);
      console.error(JSON.stringify({ step: name, error: String((e && e.message) || e).slice(0, 500) }));
    }
  }
  fs.writeFileSync(EVIDENCE, JSON.stringify({ generatedAt: new Date().toISOString(), results, evidence }, null, 2), "utf8");
  console.log(JSON.stringify({ results }));
  const failed = Object.keys(results).filter((k) => results[k] !== "pass");
  process.exit(failed.length ? 2 : 0);
}

async function main() {
  const step = process.argv[2] || "help";
  const targets = await httpGetJson(`${CDP_BASE}/json/list`);
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target found");
  cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: VIEWPORT.dpr, mobile: false });
  await cdp.send("Page.bringToFront");

  const handlers = {
    state: stepState,
    enable: enablePage,
    "shot-default": stepShotDefault,
    "shot-category": stepShotCategory,
    "shot-gender": stepShotGender,
    "shot-location": stepShotLocation,
    "shot-audience20": stepShotAudience20,
    "shot-automotive": stepShotAutomotive,
    "shot-consume": stepShotConsume,
    "shot-nickname": stepShotNickname,
    "shot-columns": stepShotColumns,
    "shot-columns-extension": stepShotColumnsExtension,
    "shot-summary": stepShotSummary,
    "shot-empty": stepShotEmpty,
    "shot-table-scroll": stepShotTableScroll,
    errors: stepErrors,
    "dismiss-update": dismissUpdateModal,
    "watch-reload": stepWatchReload,
    "inspect-layout": stepInspectLayout,
    "capture-current": stepCaptureCurrent,
    "inspect-batch-readonly": stepInspectBatchReadOnly,
    "shot-batch-existing-paused": stepShotBatchExistingPaused,
    run: stepRun,
  };
  const fn = handlers[step];
  if (!fn) {
    console.log(JSON.stringify({ steps: Object.keys(handlers) }));
    cdp.close();
    process.exit(0);
  }
  await fn();
  cdp.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String((e && e.message) || e) }));
  if (cdp) cdp.close();
  process.exit(1);
});
