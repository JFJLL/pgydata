const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const mainPath = path.join(projectRoot, "app-source", "dist-electron", "index.js");

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) {
    if (source.includes(to)) return source;
    throw new Error(`Missing patch target: ${label}`);
  }
  return source.replace(from, to);
}

function insertAfterOnce(source, marker, insert, already, label) {
  if (source.includes(already)) return source;
  if (!source.includes(marker)) throw new Error(`Missing patch marker: ${label}`);
  return source.replace(marker, `${marker}\n${insert}`);
}

let main = fs.readFileSync(mainPath, "utf8");

const legacyHost = `https://${"api"}.red-magic.cn`;
main = main.split(legacyHost).join("https://xhs.red-magic.cn");

main = replaceOnce(
  main,
  'const oo = Y("WindowState"), La = Oe(ye.getPath("userData"), "main-window-state.json"), Ur = 500, tn = 1024, nn = 768;',
  'const oo = Y("WindowState"), La = Oe(ye.getPath("userData"), "main-window-state.json"), Ur = 500, tn = 900, nn = 600;',
  "window minimum size",
);

if (!main.includes("a.width - 160")) {
  main = replaceOnce(
    main,
    `function Fr() {
  const { workAreaSize: a } = Gi.getPrimaryDisplay(), e = a.width, t = a.height, n = [
    { minW: 3e3, minH: 1700, width: 2200, height: 1400 },
    { minW: 2200, minH: 1300, width: 1760, height: 1100 },
    { minW: 1700, minH: 1e3, width: 1440, height: 900 },
    { minW: 1366, minH: 860, width: 1280, height: 820 }
  ];
  for (const s of n)
    if (e >= s.minW && t >= s.minH)
      return { width: s.width, height: s.height };
  return {
    width: Math.max(tn, e - 80),
    height: Math.max(nn, t - 80)
  };
}`,
    `function Fr() {
  const { workAreaSize: a } = Gi.getPrimaryDisplay(), e = Math.max(tn, Math.min(1280, a.width - 160)), t = Math.max(nn, Math.min(820, a.height - 140));
  return { width: e, height: t };
}`,
    "default window size",
  );
}

if (!main.includes("Number(e.width)")) {
  main = replaceOnce(
    main,
    `function jr(a) {
  let e;
  try {
    e = JSON.parse(a);
  } catch {
    return null;
  }
  if (!Br(e)) return null;
  const t = e.width, n = e.height;
  if (typeof t != "number" || typeof n != "number" || t < tn || n < nn) return null;
  const s = { width: t, height: n };
  return typeof e.x == "number" && typeof e.y == "number" && (s.x = e.x, s.y = e.y), s;
}`,
    `function jr(a) {
  let e;
  try {
    e = JSON.parse(a);
  } catch {
    return null;
  }
  if (!Br(e)) return null;
  const t = Number(e.width), n = Number(e.height);
  if (!Number.isFinite(t) || !Number.isFinite(n) || t < tn || n < nn) return null;
  const s = Gi.getPrimaryDisplay().workArea, i = Math.max(tn, Math.min(t, Math.max(tn, s.width - 120))), o = Math.max(nn, Math.min(n, Math.max(nn, s.height - 120))), r = { width: i, height: o };
  return typeof e.x == "number" && typeof e.y == "number" && (r.x = Math.max(s.x, Math.min(e.x, s.x + s.width - i)), r.y = Math.max(s.y, Math.min(e.y, s.y + s.height - o))), r;
}`,
    "restore window state clamp",
  );
}

if (!main.includes("s.__pgyLastLoginState")) {
  main = replaceOnce(
    main,
    's.setResizable(!1), s.setMinimumSize(725, 486), s.setSize(725, 486), s.setPosition(Math.round(u - 725 / 2), Math.round(l - 486 / 2));',
    's.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(u - 900 / 2), Math.round(l - 640 / 2));',
    "login window resizable",
  );
}

if (!main.includes("s.__pgyLastLoginState")) {
  main = replaceOnce(
    main,
    `    const [i, o] = s.getPosition(), [r, c] = s.getSize(), u = i + r / 2, l = o + c / 2;
    if (n) {
      const p = ro(), d = p ?? co();
      s.setResizable(!0), s.setMinimumSize(tn, nn), s.setSize(d.width, d.height), p && p.x !== void 0 && p.y !== void 0 ? s.setPosition(p.x, p.y) : s.setPosition(
        Math.round(u - d.width / 2),
        Math.round(l - d.height / 2)
      );
    } else
      s.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(u - 900 / 2), Math.round(l - 640 / 2));
    s.isVisible() || s.show();`,
    `    const i = !!n;
    if (s.isMinimized()) {
      s.__pgyLastLoginState = i;
      return;
    }
    const o = s.__pgyLastLoginState === i, [r, c] = s.getPosition(), [u, l] = s.getSize(), p = r + u / 2, d = c + l / 2;
    if (o && s.isVisible()) return;
    if (s.__pgyLastLoginState = i, i) {
      const h = ro(), m = h ?? co();
      s.setResizable(!0), s.setMinimumSize(tn, nn), s.setSize(m.width, m.height), h && h.x !== void 0 && h.y !== void 0 ? s.setPosition(h.x, h.y) : s.setPosition(
        Math.round(p - m.width / 2),
        Math.round(d - m.height / 2)
      );
    } else
      s.setResizable(!0), s.setMinimumSize(725, 486), s.setSize(900, 640), s.setPosition(Math.round(p - 900 / 2), Math.round(d - 640 / 2));
    s.isMinimized() || s.isVisible() || s.show();`,
    "login-state geometry only once",
  );
}

main = insertAfterOnce(
  main,
  'import $r from "tty";',
  `const pgyUserDataDir = Oe(ye.getPath("appData"), "pygdata-desktop");
try {
  ye.setName("PYGdata"), ye.setPath("userData", pgyUserDataDir);
} catch {
}`,
  "const pgyUserDataDir =",
  "userData override",
);

main = insertAfterOnce(
  main,
  `function mn(a, e, t) {
  return \`[\${(/* @__PURE__ */ new Date()).toISOString()}] [\${a.toUpperCase()}] [\${e}] \${t}\`;
}`,
  `function pgyFormatLogExtra(a) {
  return a.map((e) => {
    if (e instanceof Error)
      return e.stack || e.message;
    if (typeof e == "string")
      return e;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }).join(" ");
}
function pgyMainLogFilePath() {
  const a = Oe(ye.getPath("userData"), "logs");
  Sr(a, { recursive: !0 });
  return Oe(a, \`pgydata-main-\${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.log\`);
}
function pgyWriteMainLog(a, e = []) {
  const t = e.length ? \`\${a} \${pgyFormatLogExtra(e)}\` : a;
  if (!ye.isPackaged) {
    console.log(t);
    return;
  }
  try {
    Kt.appendFileSync(pgyMainLogFilePath(), \`\${t}\\n\`, "utf8");
  } catch {
  }
}`,
  "function pgyWriteMainLog",
  "main file logger",
);

main = replaceOnce(
  main,
  'ye.isPackaged || console.debug(mn("debug", a, e), ...t);',
  'ye.isPackaged || pgyWriteMainLog(mn("debug", a, e), t);',
  "debug logger",
);
main = replaceOnce(main, 'console.log(mn("info", a, e), ...t);', 'pgyWriteMainLog(mn("info", a, e), t);', "info logger");
main = replaceOnce(main, 'console.warn(mn("warn", a, e), ...t);', 'pgyWriteMainLog(mn("warn", a, e), t);', "warn logger");
main = replaceOnce(main, 'console.error(mn("error", a, e), ...t);', 'pgyWriteMainLog(mn("error", a, e), t);', "error logger");

if (!main.includes("minimizable: !0")) {
  main = replaceOnce(
    main,
    `minHeight: nn,
    show: !1,`,
    `minHeight: nn,
    resizable: !0,
    minimizable: !0,
    maximizable: !0,
    fullscreenable: !1,
    show: !1,`,
    "browser window chrome options",
  );
}

if (!main.includes("movable: !0")) {
  main = replaceOnce(
    main,
    `fullscreenable: !1,
    show: !1,`,
    `fullscreenable: !1,
    movable: !0,
    show: !1,`,
    "main window movable",
  );
}

main = replaceOnce(
  main,
  'return a.push("D:\\\\download\\\\pic-vec\\\\pgydata\\\\pgy-cookie.txt", "D:\\\\download\\\\pic-vec\\\\pgydata\\\\token.txt", "D:\\\\download\\\\token.txt", Oe(Dr.homedir(), "pgy-cookie.txt"), Oe(Dr.homedir(), "token.txt")), a;',
  "return a;",
  "remove development cookie fallback",
);

main = replaceOnce(
  main,
  'return a.push(Oe(Dr.homedir(), "pgy-cookie.txt"), Oe(Dr.homedir(), "token.txt")), a;',
  "return a;",
  "remove home cookie fallback",
);

main = insertAfterOnce(
  main,
  `    this.windowManager = e;
  }`,
  `  async clearAuthSession(e) {
    const t = e ? Pn.fromPartition(e) : Pn.defaultSession, n = Re;
    Ct.info("[startAuth] 清理本地蒲公英授权会话后重新授权");
    try {
      await t.clearStorageData({ origin: n, storages: ["cookies", "localstorage", "indexdb", "filesystem", "serviceworkers", "cachestorage"] });
    } catch (s) {
      Ct.warn("[startAuth] 清理授权存储失败:", s);
    }
    try {
      const s = await t.cookies.get({ url: n });
      await Promise.all(s.map((i) => t.cookies.remove(n, i.name).catch((o) => Ct.warn(\`[startAuth] 清理 Cookie 失败: \${i.name}\`, o))));
    } catch (s) {
      Ct.warn("[startAuth] 清理授权 Cookie 失败:", s);
    }
  }`,
  "clearAuthSession(e)",
  "pgy auth session reset",
);

main = replaceOnce(
  main,
  'return this.pendingLogin = this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition).finally(() => {',
  'return this.pendingLogin = (async () => (await this.clearAuthSession(e == null ? void 0 : e.sessionPartition), this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition)))().finally(() => {',
  "pgy reauth clears existing session",
);

const xhsDirectHost = `https://${"www"}.xiaohongshu.com`;
const xhsDirectCookie = `__xhs_${"direct"}_auth`;
const xhsDirectLogger = `Xhs${"Direct"}Auth`;
const xhsDirectStart = `const Fn = "${xhsDirectHost}", af = (a) => \`\${Fn}/user/profile/\${a}\`, ki = "${xhsDirectCookie}", ie = Y("${xhsDirectLogger}"), sf = 3e3, Ti = 8e3;`;
const xhsDirectEnd = 'const $i = Y("ExcelExport"), dr = {';
const xhsDirectStartIndex = main.indexOf(xhsDirectStart);
if (xhsDirectStartIndex !== -1) {
  const xhsDirectEndIndex = main.indexOf(xhsDirectEnd, xhsDirectStartIndex);
  if (xhsDirectEndIndex === -1) throw new Error("Missing XHS direct removal end marker");
  main = main.slice(0, xhsDirectStartIndex) + main.slice(xhsDirectEndIndex);
}

main = main.replace("ge.registerPlugin(new df()), ", "");

if (!main.includes("F.removeAllListeners(Lt.ready)")) {
  main = replaceOnce(
    main,
    `function Qr(a) {
  F.on(Lt.ready, () => {
    Rs.info("启动页已准备就绪");
  }), F.on(Lt.retry, () => {
    Rs.info("用户请求重试"), a();
  });
}`,
    `function Qr(a) {
  F.removeAllListeners(Lt.ready), F.removeAllListeners(Lt.retry), F.on(Lt.ready, () => {
    Rs.info("启动页已准备就绪");
  }), F.on(Lt.retry, () => {
    Rs.info("用户请求重试"), a();
  });
}`,
    "splash retry handler",
  );
}

main = insertAfterOnce(
  main,
  'K.debug(`初始化 — API: ${po}, 资源目录: ${$n}`);',
  `function pgyAssetErrorMessage(a) {
  return a instanceof Error ? a.message : String(a || "未知错误");
}
function pgyNormalizeAssetPath(a) {
  return String(a || "").replace(/\\\\/g, "/").replace(/^\\/+/, "");
}
function pgyHashFile(a) {
  return no.createHash("sha256").update(Qi(a)).digest("hex");
}
function pgyVerifyAssets(a) {
  const e = Oe(a, "integrity-manifest.json");
  if (!kt(e))
    throw new Error("资源被修改或损坏：缺少完整性校验文件 integrity-manifest.json");
  let t;
  try {
    t = JSON.parse(Qi(e, "utf-8"));
  } catch (n) {
    throw new Error(\`资源被修改或损坏：完整性校验文件无法读取（\${pgyAssetErrorMessage(n)}）\`);
  }
  const n = Array.isArray(t.files) ? t.files : [];
  if (n.length === 0)
    throw new Error("资源被修改或损坏：完整性校验文件为空");
  for (const s of n) {
    const i = pgyNormalizeAssetPath(s.path);
    if (!i || i.split("/").includes(".."))
      throw new Error(\`资源被修改或损坏：非法文件路径 \${i || "(空)"}\`);
    const o = Oe(a, ...i.split("/"));
    if (!kt(o))
      throw new Error(\`资源被修改或损坏：缺少文件 \${i}\`);
    const r = Kt.statSync(o);
    if (!r.isFile())
      throw new Error(\`资源被修改或损坏：\${i} 不是文件\`);
    if (Number(s.size) !== r.size)
      throw new Error(\`资源被修改或损坏：\${i} 文件大小不匹配\`);
    const c = String(s.sha256 || "").toLowerCase().replace(/^sha256:/, "");
    if (!c || pgyHashFile(o) !== c)
      throw new Error(\`资源被修改或损坏：\${i} 校验失败\`);
  }
  return !0;
}`,
  "function pgyVerifyAssets",
  "asset integrity helpers",
);

if (!main.includes("Z.loadFile(t).catch")) {
  main = replaceOnce(
    main,
    'Ee.info("加载前端资源:", t), Z.loadFile(t);',
    `Ee.info("加载前端资源:", t), Z.loadFile(t).catch((n) => {
      Ee.error("加载前端资源失败:", n), Xr(\`加载前端资源失败：\${pgyAssetErrorMessage(n)}\`);
    });`,
    "loadFile handling",
  );
}

if (!main.includes('Xr(`加载前端资源失败：${n} ${s} ${i || ""}`)')) {
  main = replaceOnce(
    main,
    'Ee.error(`页面加载失败: ${n} ${s} URL: ${i}`), Rn(), Z && !Z.isDestroyed() && !Z.isVisible() && Z.show();',
    'Ee.error(`页面加载失败: ${n} ${s} URL: ${i}`), Xr(`加载前端资源失败：${n} ${s} ${i || ""}`);',
    "did-fail-load handling",
  );
}

if (!main.includes("!Z.isMinimized() && (Ee.warn(\"主窗口 10 秒内未显示")) {
  main = replaceOnce(
    main,
    'Z && !Z.isDestroyed() && !Z.isVisible() && (Ee.warn("主窗口 10 秒内未显示，强制显示（渲染进程可能未调用 setLoginState）"), Z.show(), Rn());',
    'Z && !Z.isDestroyed() && !Z.isVisible() && !Z.isMinimized() && (Ee.warn("主窗口 10 秒内未显示，强制显示（渲染进程可能未调用 setLoginState）"), Z.show(), Rn());',
    "do not reshow minimized main window",
  );
}

if (!main.includes('throw new Error("资源解压失败：缺少 index.html")')) {
  main = replaceOnce(
    main,
    'kt(n) || Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));',
    `kt(n) && Kt.rmSync(n, { recursive: !0, force: !0 }), Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));
    if (!kt(Oe(n, "index.html")))
      throw new Error("资源解压失败：缺少 index.html");
    if (!kt(Oe(n, "integrity-manifest.json")))
      throw new Error("资源解压失败：缺少 integrity-manifest.json");
    pgyVerifyAssets(n);`,
    "applyAssets verification",
  );
}

if (!main.includes('pgyVerifyAssets(Ae.getCurrentAssetsPath())')) {
  main = replaceOnce(
    main,
    'jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("更新完成"), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());',
    'jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("正在校验资源完整性..."), zt(95), pgyVerifyAssets(Ae.getCurrentAssetsPath()), jt("正在加载前端资源..."), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());',
    "download startup verification",
  );
}

if (!main.includes("ee || await Jr()")) {
  main = replaceOnce(
    main,
    `async function Vi() {
  if (Ee.debug("startApp 执行"), Xt) {
    Ga(Oe(yr, "../dist"));
    return;
  }
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html"));
  Ee.info(\`资源检查 — assetsPath: \${a}, hasLocalAssets: \${e}\`), e ? (Ee.info("本地资源已存在，立即启动，路径:", a), Ga(a), mh()) : (Ee.info("无本地资源，显示启动页下载"), await Jr(), Kr(), Qr(() => {
    Wi();
  }), await Wi());
}`,
    `async function Vi() {
  if (Ee.debug("startApp 执行"), Xt) {
    Ga(Oe(yr, "../dist"));
    return;
  }
  ee || await Jr(), Kr(), Qr(() => {
    Vi();
  }), jt("正在检查本地资源..."), zt(10);
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html"));
  Ee.info(\`资源检查 — assetsPath: \${a}, hasLocalAssets: \${e}\`);
  if (e)
    try {
      jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a), mh();
    } catch (t) {
      const n = pgyAssetErrorMessage(t);
      Ee.error("本地资源校验失败:", t), Xr(n.includes("资源被修改或损坏") ? n : \`资源被修改或损坏：\${n}\`);
    }
  else
    Ee.info("无本地资源，显示启动页下载"), jt("未找到本地资源，准备下载..."), zt(20), await Wi();
}`,
    "startup flow",
  );
}

const pgyChartRootLegacy = `function pgyChartRoot() {
  const a = "D:\\\\download\\\\pic-vec\\\\pgydata\\\\pic";
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
const pgyChartRootExe = `function pgyChartRoot() {
  const a = Oe(ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
const pgyChartRootInstall = `function pgyChartRoot() {
  const a = Oe(Ja(ye.getPath("exe")), "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`;
if (main.includes(pgyChartRootLegacy))
  main = main.replace(pgyChartRootLegacy, pgyChartRootInstall);
else if (main.includes(pgyChartRootExe))
  main = main.replace(pgyChartRootExe, pgyChartRootInstall);
else if (main.includes(`function pgyChartRoot() {
  const a = Oe(process.resourcesPath || ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`))
  main = main.replace(`function pgyChartRoot() {
  const a = Oe(process.resourcesPath || ye.getPath("exe"), "..", "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}`, pgyChartRootInstall);
else if (!main.includes(pgyChartRootInstall) && !main.includes('const a = Oe(Ja(ye.getPath("exe")), "pic");'))
  throw new Error("Missing patch target: pgy chart output under install path");

main = main.replace(
  `async function pgyRenderChartsWithPython(a) {
  if (!a.length) return {};
  if (process.env.PGY_ENABLE_EXTERNAL_CHART_RENDERER !== "1")
    return {};
  const e = JSON.stringify({ charts: a }), t = Math.max(15e3, 5e3 + a.length * 4e3), n = [];`,
  `async function pgyRenderChartsWithPython(a) {
  if (!a.length) return {};
  const e = JSON.stringify({ charts: a }), t = Math.max(15e3, 5e3 + a.length * 4e3), n = [];`,
);

if (!main.includes("[pgy-chart] 调用内置绘图程序")) {
  main = replaceOnce(
    main,
    `  for (const s of pgyChartRendererCandidates())
    try {
      const i = await pgySpawnChartRenderer(s, e, t), o = JSON.parse(i.trim().split(/\\r?\\n/).pop() || "{}");`,
    `  for (const s of pgyChartRendererCandidates())
    try {
      j.info(\`[pgy-chart] 调用内置绘图程序: \${s}, charts=\${a.length}, timeout=\${t}\`);
      const i = await pgySpawnChartRenderer(s, e, t), o = JSON.parse(i.trim().split(/\\r?\\n/).pop() || "{}");`,
    "pgy chart renderer diagnostics",
  );
}

main = main.replace(
  `const o = Array.isArray(t) ? t : [];
    o.length >= 2 && i.push({ field: "fansGrowthTrendChart", type: "trend", rows: o, output: pgyChartFile("trend", a, "trend") });`,
  `const o = Array.isArray(t) ? t.slice(-120) : [];
    o.length >= 2 && i.push({ field: "fansGrowthTrendChart", type: "trend", rows: o, output: pgyChartFile("trend", a, "trend") });`,
);

if (!main.includes("粉丝趋势接口使用主进程请求")) {
  main = replaceOnce(
    main,
    `    const o = e.replace(Re, ""), r = sm.encryptSign(o);
    if (i && !i.isDestroyed()) {`,
    `    const o = e.replace(Re, ""), r = sm.encryptSign(o);
    if (o.includes("/fans_overall_new_history")) {
      return j.info(\`[pgy-fetch] 粉丝趋势接口使用主进程请求，避免页面渲染线程卡顿: url=\${o}\`), await gt.requestJson({
        url: e,
        session: t,
        headers: {
          ...n,
          referer: s,
          "Sec-Fetch-Mode": "no-cors",
          "X-s": r["X-s"],
          "X-t": String(r["X-t"])
        },
        timeout: tm
      });
    }
    if (i && !i.isDestroyed()) {`,
    "pgy fans trend main-process fetch",
  );
}

main = main.replace(
  "`, o = await e.webContents.executeJavaScript(i, !0);",
  "`, o = await pgyTimeout(e.webContents.executeJavaScript(i, !0), 15e3, \"pgy.windowFetch\");",
);

main = main.replace(
  `    const o = await pgyRenderChartsWithPython(i);
    for (const r of i)
      o[r.field] && kt(o[r.field]) && (s[r.field] = o[r.field]);`,
  `    const o = await pgyRenderChartsWithPython(i);
    j.info(\`[pgy-chart] 内置绘图返回字段: \${Object.keys(o).join(",") || "(empty)"}\`);
    for (const r of i)
      typeof o[r.field] == "string" && o[r.field] && (s[r.field] = o[r.field]);`,
);

if (!main.includes("function pgyDataWithoutImageText")) {
  main = replaceOnce(
    main,
    `async function pgyEmbedImagesInWorkbook(a, e, t) {`,
    `function pgyDataWithoutImageText(a, e) {
  const t = Array.isArray(e) ? e : [];
  const n = new Set((Array.isArray(a) ? a : []).filter((s) => s && PGY_IMAGE_FIELDS.has(s.key)).map((s) => s.key));
  return n.size === 0 ? t : t.map((s) => {
    const i = { ...s };
    for (const o of n)
      typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "__PGY_IMAGE_CELL_BLANK__");
    return i;
  });
}
async function pgyEmbedImagesInWorkbook(a, e, t) {`,
    "pgy data without image path text",
  );
}

main = replaceOnce(
  main,
  'typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "");',
  'typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "__PGY_IMAGE_CELL_BLANK__");',
  "pgy image path blank sentinel",
);

main = replaceOnce(
  main,
  'const n = a.mode === "two-row" ? gf(a.headers, a.data) : hf(a.data), s = Ve.utils.book_new();',
  'const i = a.data ?? [], n = a.mode === "two-row" ? gf(a.headers ?? [], pgyDataWithoutImageText(a.headers ?? [], i)) : hf(i), s = Ve.utils.book_new();',
  "excel export clears image path cells",
);

main = replaceOnce(
  main,
  'return y == null || y === "" ? "-" : typeof y == "number" || typeof y == "boolean" ? y : String(y);',
  'return y === "__PGY_IMAGE_CELL_BLANK__" ? "" : y == null || y === "" ? "-" : typeof y == "number" || typeof y == "boolean" ? y : String(y);',
  "excel blank image path cells",
);

main = replaceOnce(
  main,
  'return Ve.utils.book_append_sheet(s, n, "Sheet1"), Ve.writeFile(s, t), a.mode === "two-row" && await pgyEmbedImagesInWorkbook(t, a.headers ?? [], a.data ?? []), $i.info(`Excel 已导出: ${t}`), { success: !0, filePath: t };',
  'return Ve.utils.book_append_sheet(s, n, "Sheet1"), Ve.writeFile(s, t), a.mode === "two-row" && await pgyEmbedImagesInWorkbook(t, a.headers ?? [], i), $i.info(`Excel 已导出: ${t}`), { success: !0, filePath: t };',
  "excel export embeds images from original data",
);

if (!main.includes("桌面端启动")) {
  main = replaceOnce(
    main,
    `ye.whenReady().then(() => {
  fh(), Vi(), ye.on("activate", () => {
    Dt.getAllWindows().length === 0 && Vi();
  });
});`,
    `process.on("unhandledRejection", (a) => {
  Ee.error("未处理的 Promise 异常:", a);
});
process.on("uncaughtException", (a) => {
  Ee.error("未捕获异常:", a);
});
ye.whenReady().then(() => {
  Ee.info("桌面端启动", {
    platform: process.platform,
    arch: process.arch,
    packaged: ye.isPackaged,
    version: ye.getVersion(),
    userData: ye.getPath("userData"),
    resourcesPath: process.resourcesPath
  }), fh(), Vi(), ye.on("activate", () => {
    Dt.getAllWindows().length === 0 && Vi();
  });
});`,
    "desktop startup logging",
  );
}

main = replaceOnce(
  main,
  `ye.on("window-all-closed", () => {
  process.platform !== "darwin" && ye.quit();
});`,
  `ye.on("window-all-closed", () => {
  Ee.info("所有窗口已关闭");
  process.platform !== "darwin" && ye.quit();
});`,
  "window closed logging",
);

main = replaceOnce(
  main,
  `ye.on("before-quit", () => {
  Rn(), lh(), yf();
});`,
  `ye.on("before-quit", () => {
  Ee.info("应用准备退出");
  Rn(), lh(), yf();
});`,
  "before quit logging",
);

fs.writeFileSync(mainPath, main);
console.log("Applied PYGdata runtime patches.");
