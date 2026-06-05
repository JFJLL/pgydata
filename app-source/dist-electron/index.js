var br = Object.defineProperty;
var wr = (a, e, t) => e in a ? br(a, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : a[e] = t;
var w = (a, e, t) => wr(a, typeof e != "symbol" ? e + "" : e, t);
import { ipcMain as F, BrowserWindow as Dt, app as ye, screen as Gi, shell as Ji, dialog as Ki, net as Jt, Notification as Et, session as Pn, nativeImage as PgyNativeImage } from "electron";
import * as Xi from "path";
import Yi, { join as Oe, dirname as Ja } from "path";
import jn, { fileURLToPath as Ka } from "url";
import * as Kt from "fs";
import _r, { existsSync as kt, readFileSync as Qi, writeFileSync as Zi, mkdirSync as Sr, createReadStream as Cr, unlinkSync as Rr, createWriteStream as Ar } from "fs";
import Xa, { get as eo } from "https";
import Ya, { get as to } from "http";
import { pipeline as Er } from "stream/promises";
import { Extract as kr } from "unzipper";
import { spawn as Tr } from "child_process";
import wt from "util";
import Te, { Readable as Ir } from "stream";
import * as no from "crypto";
import ao, { randomBytes as so } from "crypto";
import io from "http2";
import Pr from "assert";
import $r from "tty";
const pgyUserDataDir = Oe(ye.getPath("appData"), "magiorix-desktop");
try {
  ye.setName("magiorix"), ye.setPath("userData", pgyUserDataDir);
} catch {
}
import Dr from "os";
import et, { brotliDecompressSync as Lr, gunzipSync as Nr } from "zlib";
import { EventEmitter as Or } from "events";
import { webcrypto as Ss } from "node:crypto";
import Ve from "xlsx-js-style";
import JSZip from "jszip";
import * as Da from "node-cron";
const Fe = {
  shell: {
    openExternal: "system:shell:open-external"
  },
  window: {
    minimize: "system:window:minimize",
    maximize: "system:window:maximize",
    close: "system:window:close",
    isMaximized: "system:window:is-maximized",
    onMaximizedChange: "system:window:maximized-change"
  },
  navigation: {
    openRoute: "system:navigation:open-route"
  },
  auth: {
    setLoginState: "system:auth:set-login-state"
  },
  dialog: {
    openFile: "system:dialog:open-file"
  },
  net: {
    expandShortUrl: "system:net:expand-short-url"
  }
}, Cs = {
  post: "message:post",
  receive: "message:receive"
}, Lt = {
  /** 渲染进程 → 主进程: 启动页加载完成 */
  ready: "splash:ready",
  /** 渲染进程 → 主进程: 用户请求重试 */
  retry: "splash:retry",
  /** 主进程 → 渲染进程: 状态文本更新 */
  status: "splash:status",
  /** 主进程 → 渲染进程: 进度更新 */
  progress: "splash:progress",
  /** 主进程 → 渲染进程: 错误信息 */
  error: "splash:error",
  /** 主进程 → 渲染进程: 加载完成 */
  complete: "splash:complete"
}, Me = {
  getLocalVersion: "assets:get-local-version",
  getRemoteVersion: "assets:get-remote-version",
  download: "assets:download",
  apply: "assets:apply",
  getCurrentPath: "assets:get-current-path",
  downloadProgress: "assets:download-progress",
  /** 主进程 → 渲染进程: 资源更新通知事件 */
  assetsUpdateAvailable: "assets:update-available",
  assetsUpdateDownloaded: "assets:update-downloaded",
  assetsUpdateError: "assets:update-error",
  /** 渲染进程 → 主进程: 重启应用命令 */
  restartApp: "assets:restart-app"
}, qe = {
  /** 主进程 → 渲染进程: 通知事件 */
  updateAvailable: "update-available",
  updateNotAvailable: "update-not-available",
  downloadProgress: "download-progress",
  updateDownloaded: "update-downloaded",
  updateError: "update-error",
  manualInstall: "update-manual-install",
  /** 渲染进程 → 主进程: 命令 */
  startDownload: "start-download",
  installUpdate: "install-update",
  checkForUpdates: "check-for-updates"
}, Mr = () => {
  F.on(Cs.post, (a, e) => {
    const t = Dt.fromWebContents(a.sender), n = Dt.getAllWindows();
    (e.windowName ? n.filter((i) => i.getTitle() === e.windowName) : n.filter((i) => i !== t)).forEach((i) => {
      i.webContents.send(Cs.receive, e.params);
    });
  });
};
function mn(a, e, t) {
  return `[${pgyBeijingTimestamp()}] [${a.toUpperCase()}] [${e}] ${t}`;
}
function pgyBeijingIsoDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function pgyBeijingTimestamp() {
  const a = new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString();
  return `${a.slice(0, 10)} ${a.slice(11, 19)} +08:00`;
}
function pgyFormatLogExtra(a) {
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
  return Oe(a, `magiorix-main-${pgyBeijingIsoDate()}.log`);
}
function pgyWriteMainLog(a, e = []) {
  const t = e.length ? `${a} ${pgyFormatLogExtra(e)}` : a;
  if (!ye.isPackaged) {
    console.log(t);
    return;
  }
  try {
    Kt.appendFileSync(pgyMainLogFilePath(), `${t}
`, "utf8");
  } catch {
  }
}
function Y(a) {
  return {
    debug(e, ...t) {
      ye.isPackaged || pgyWriteMainLog(mn("debug", a, e), t);
    },
    info(e, ...t) {
      pgyWriteMainLog(mn("info", a, e), t);
    },
    warn(e, ...t) {
      pgyWriteMainLog(mn("warn", a, e), t);
    },
    error(e, ...t) {
      pgyWriteMainLog(mn("error", a, e), t);
    }
  };
}
const oo = Y("WindowState"), La = Oe(ye.getPath("userData"), "main-window-state.json"), Ur = 500, tn = 900, nn = 600;
function Fr() {
  const { workAreaSize: a } = Gi.getPrimaryDisplay(), e = Math.max(tn, Math.min(1280, a.width - 160)), t = Math.max(nn, Math.min(820, a.height - 140));
  return { width: e, height: t };
}
function Br(a) {
  return typeof a == "object" && a !== null && !Array.isArray(a);
}
function jr(a) {
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
}
function zr(a) {
  return a.x === void 0 || a.y === void 0 ? !1 : Gi.getAllDisplays().some((t) => {
    const n = t.workArea;
    return a.x + a.width > n.x && a.x < n.x + n.width && a.y + a.height > n.y && a.y < n.y + n.height;
  });
}
function ro() {
  if (!kt(La)) return null;
  try {
    const a = Qi(La, "utf-8"), e = jr(a);
    return e ? e.x !== void 0 && e.y !== void 0 && !zr(e) ? { width: e.width, height: e.height } : e : null;
  } catch (a) {
    return oo.warn("读取窗口状态失败:", a), null;
  }
}
function qr(a) {
  try {
    Zi(La, JSON.stringify(a, null, 2));
  } catch (e) {
    oo.warn("写入窗口状态失败:", e);
  }
}
function co() {
  const a = ro();
  return a ? { width: a.width, height: a.height } : Fr();
}
function Hr(a) {
  let e = null;
  const t = () => {
    if (a.isDestroyed() || !a.isResizable()) return;
    const [s, i] = a.getPosition(), [o, r] = a.getSize();
    o < tn || r < nn || qr({ width: o, height: r, x: s, y: i });
  }, n = () => {
    e && clearTimeout(e), e = setTimeout(t, Ur);
  };
  a.on("resize", n), a.on("move", n), a.on("close", () => {
    e && clearTimeout(e), t();
  });
}
const Wr = (a) => {
  F.on(Fe.shell.openExternal, (t, n) => {
    Ji.openExternal(n);
  }), F.on(Fe.window.minimize, () => {
    var t;
    (t = a()) == null || t.minimize();
  }), F.on(Fe.window.maximize, () => {
    const t = a();
    t && (t.isMaximized() ? t.unmaximize() : t.maximize());
  }), F.on(Fe.window.close, () => {
    var t;
    (t = a()) == null || t.close();
  }), F.handle(Fe.window.isMaximized, () => {
    var t;
    return ((t = a()) == null ? void 0 : t.isMaximized()) ?? !1;
  }), setTimeout(() => {
    const t = a();
    t && (t.on("maximize", () => {
      t.webContents.send(Fe.window.onMaximizedChange, !0);
    }), t.on("unmaximize", () => {
      t.webContents.send(Fe.window.onMaximizedChange, !1);
    }));
  }, 100), F.on(Fe.auth.setLoginState, (t, n) => {
    const s = a();
    if (!s) return;
    const i = !!n;
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
    s.isMinimized() || s.isVisible() || s.show();
  }), F.handle(Fe.dialog.openFile, async () => (await Ki.showOpenDialog({
    properties: ["openFile"]
  })).filePaths), F.handle(
    Fe.net.expandShortUrl,
    async (t, n) => {
      const s = (o) => new Promise((r) => {
        const c = Jt.request({
          url: o,
          method: "HEAD",
          redirect: "manual"
        }), u = setTimeout(() => {
          c.abort(), r(null);
        }, 8e3);
        c.on("redirect", (l, p, d) => {
          clearTimeout(u), c.abort(), r(d);
        }), c.on("response", () => {
          clearTimeout(u), r(null);
        }), c.on("error", () => {
          clearTimeout(u), r(null);
        }), c.end();
      });
      let i = n;
      for (let o = 0; o < 5; o++) {
        const r = await s(i);
        if (!r || r === i) break;
        i = r;
      }
      return i;
    }
  );
}, Vr = Ka(import.meta.url), Gr = Ja(Vr), Rs = Y("Splash");
let ee = null;
function Jr() {
  return new Promise((a) => {
    ee = new Dt({
      width: 500,
      height: 400,
      frame: !1,
      transparent: !0,
      resizable: !1,
      center: !0,
      alwaysOnTop: !0,
      show: !1,
      // 等 HTML 加载完成再显示，避免白屏闪烁
      backgroundColor: "#00000000",
      webPreferences: {
        nodeIntegration: !0,
        contextIsolation: !1
      }
    }), ee.once("ready-to-show", () => {
      a(ee);
    }), ee.loadFile(Oe(Gr, "static/splash.html")), ee.on("closed", () => {
      ee = null;
    });
  });
}
function Kr() {
  ee && !ee.isDestroyed() && ee.show();
}
function Rn() {
  ee && !ee.isDestroyed() && (ee.close(), ee = null);
}
function jt(a) {
  ee && !ee.isDestroyed() && ee.webContents.send(Lt.status, a);
}
function zt(a) {
  ee && !ee.isDestroyed() && ee.webContents.send(Lt.progress, a);
}
function Xr(a) {
  ee && !ee.isDestroyed() && ee.webContents.send(Lt.error, a);
}
function Yr() {
  ee && !ee.isDestroyed() && ee.webContents.send(Lt.complete);
}
function Qr(a) {
  F.removeAllListeners(Lt.ready), F.removeAllListeners(Lt.retry), F.on(Lt.ready, () => {
    Rs.info("启动页已准备就绪");
  }), F.on(Lt.retry, () => {
    Rs.info("用户请求重试"), a();
  });
}
const lo = "https://magiorix.red-magic.cn";
function uo(a, e, t, n = 5) {
  (a.startsWith("https") ? eo : to)(a, (i) => {
    if (i.statusCode && i.statusCode >= 300 && i.statusCode < 400 && i.headers.location) {
      if (n <= 0) {
        e(i);
        return;
      }
      const o = i.headers.location.startsWith("http") ? i.headers.location : (
        // eslint-disable-next-line no-undef
        new URL(i.headers.location, a).href
      );
      K.info(`重定向 ${i.statusCode} → ${o}`), i.resume(), uo(o, e, t, n - 1);
    } else
      e(i);
  }).on("error", (i) => {
    t && t(i);
  });
}
const Zr = Ka(import.meta.url), ec = Ja(Zr), K = Y("Assets"), $n = Oe(ye.getPath("userData"), "assets"), Xn = Oe($n, "version.json"), po = `${lo}/api/frontend-assets`;
K.debug(`初始化 — API: ${po}, 资源目录: ${$n}`);
function pgyAssetErrorMessage(a) {
  return a instanceof Error ? a.message : String(a || "未知错误");
}
function pgyNormalizeAssetPath(a) {
  return String(a || "").replace(/\\/g, "/").replace(/^\/+/, "");
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
    throw new Error(`资源被修改或损坏：完整性校验文件无法读取（${pgyAssetErrorMessage(n)}）`);
  }
  const n = Array.isArray(t.files) ? t.files : [];
  if (n.length === 0)
    throw new Error("资源被修改或损坏：完整性校验文件为空");
  for (const s of n) {
    const i = pgyNormalizeAssetPath(s.path);
    if (!i || i.split("/").includes(".."))
      throw new Error(`资源被修改或损坏：非法文件路径 ${i || "(空)"}`);
    const o = Oe(a, ...i.split("/"));
    if (!kt(o))
      throw new Error(`资源被修改或损坏：缺少文件 ${i}`);
    const r = Kt.statSync(o);
    if (!r.isFile())
      throw new Error(`资源被修改或损坏：${i} 不是文件`);
    if (Number(s.size) !== r.size)
      throw new Error(`资源被修改或损坏：${i} 文件大小不匹配`);
    const c = String(s.sha256 || "").toLowerCase().replace(/^sha256:/, "");
    if (!c || pgyHashFile(o) !== c)
      throw new Error(`资源被修改或损坏：${i} 校验失败`);
  }
  return !0;
}
class Ae {
  // 5分钟
  /**
   * 设置主窗口引用（用于发送事件给渲染进程）
   */
  static setMainWindow(e) {
    this.mainWindow = e;
  }
  /**
   * 获取本地资源版本
   */
  static getLocalVersion() {
    try {
      if (!kt(Xn))
        return null;
      const e = Qi(Xn, "utf-8");
      return JSON.parse(e).version;
    } catch (e) {
      return K.error("读取本地版本失败:", e), null;
    }
  }
  /**
   * 获取远程最新版本信息
   */
  static async getRemoteVersion() {
    return new Promise((e, t) => {
      const n = `${po}/latest/desktop`, s = n.startsWith("https") ? eo : to;
      K.info(`检查远程版本: ${n}`);
      const i = s(n, (o) => {
        if (K.debug("响应状态码:", o.statusCode), o.statusCode !== 200) {
          t(new Error(`请求失败: ${o.statusCode}`));
          return;
        }
        let r = "";
        o.on("data", (c) => {
          r += c;
        }), o.on("end", () => {
          try {
            K.debug("响应数据:", r);
            const c = JSON.parse(r);
            c.code === 200 && c.data ? (K.info("远程版本:", c.data.version), e(c.data)) : (K.error("响应错误:", c), t(new Error(c.message || "获取版本信息失败")));
          } catch (c) {
            K.error("解析版本信息失败:", c), t(new Error("解析版本信息失败"));
          }
        });
      });
      i.on("error", (o) => {
        K.error("请求失败:", o), t(o);
      }), i.end();
    });
  }
  /**
   * 下载资源包
   */
  static async downloadAssets(e, t) {
    return new Promise((n, s) => {
      const i = Oe(ye.getPath("temp"), `assets-${e.version}.zip`);
      K.info("下载资源包:", e.downloadUrl), uo(
        e.downloadUrl,
        (o) => {
          if (K.info(`下载响应 — 状态码: ${o.statusCode}, URL: ${e.downloadUrl}`), o.statusCode !== 200) {
            s(
              new Error(`下载失败，状态码: ${o.statusCode}, URL: ${e.downloadUrl}`)
            ), o.resume();
            return;
          }
          const r = parseInt(o.headers["content-length"] || "0", 10);
          let c = 0;
          const u = Ar(i);
          o.on("data", (l) => {
            c += l.length;
            const p = r > 0 ? c / r * 100 : 0;
            t(p);
          }), o.pipe(u), u.on("finish", () => {
            u.close(), K.info(`下载完成，文件大小: ${c} bytes`), n(i);
          }), u.on("error", (l) => {
            s(l);
          });
        },
        (o) => {
          s(o);
        }
      );
    });
  }
  /**
   * 解压并应用资源包
   */
  static async applyAssets(e, t) {
    const n = Oe($n, t);
    kt(n) && Kt.rmSync(n, { recursive: !0, force: !0 }), Sr(n, { recursive: !0 }), await Er(Cr(e), kr({ path: n }));
    if (!kt(Oe(n, "index.html")))
      throw new Error("资源解压失败：缺少 index.html");
    if (!kt(Oe(n, "integrity-manifest.json")))
      throw new Error("资源解压失败：缺少 integrity-manifest.json");
    pgyVerifyAssets(n);
    const s = {
      version: t,
      appliedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    Zi(Xn, JSON.stringify(s, null, 2)), kt(e) && Rr(e);
  }
  /**
   * 获取当前资源路径
   */
  static getCurrentAssetsPath() {
    const e = this.getLocalVersion();
    if (e) {
      const t = Oe($n, e);
      if (kt(t))
        return t;
    }
    return Oe(ec, "../dist");
  }
  /**
   * 注册 IPC 处理器
   */
  static registerHandlers() {
    F.handle(Me.getLocalVersion, () => this.getLocalVersion()), F.handle(Me.getRemoteVersion, async () => {
      try {
        return (await this.getRemoteVersion()).version;
      } catch (e) {
        throw K.error("获取远程版本失败:", e), e;
      }
    }), F.handle(Me.download, async (e, t) => {
      try {
        const n = await this.getRemoteVersion();
        if (n.version !== t)
          throw new Error("版本不匹配");
        return await this.downloadAssets(n, (i) => {
          e.sender.send(Me.downloadProgress, i);
        });
      } catch (n) {
        throw K.error("下载资源失败:", n), n;
      }
    }), F.handle(Me.apply, async (e, t, n) => {
      try {
        return await this.applyAssets(t, n), !0;
      } catch (s) {
        throw K.error("应用资源失败:", s), s;
      }
    }), F.handle(Me.getCurrentPath, () => this.getCurrentAssetsPath()), F.on(Me.restartApp, () => {
      this.restartApp();
    });
  }
  /**
   * 设置窗口激活时检测更新（替代定时轮询）
   */
  static setupWindowFocusListener(e) {
    this.setMainWindow(e), e.on("focus", () => {
      const t = Date.now();
      if (t - this.lastCheckTime < this.CHECK_INTERVAL) {
        K.debug("5分钟内已检查过，跳过");
        return;
      }
      this.isDownloading || (this.lastCheckTime = t, this.checkAndDownloadUpdate().catch((n) => {
        K.error("检查更新失败:", n);
      }));
    }), this.checkAndDownloadUpdate().catch((t) => {
      K.error("首次检查更新失败:", t);
    });
  }
  /**
   * 检查并下载更新（窗口激活时调用）
   */
  static async checkAndDownloadUpdate() {
    if (this.isDownloading) {
      K.debug("正在下载中，跳过");
      return;
    }
    try {
      this.isDownloading = !0;
      const e = this.getLocalVersion(), t = await this.getRemoteVersion();
      if (K.info(`版本对比 — 本地: ${e}, 远程: ${t.version}`), e === t.version) {
        K.info("已是最新版本");
        return;
      }
      K.info(`发现新版本 ${t.version}，开始下载...`), this.sendToRenderer(Me.assetsUpdateAvailable, {
        version: t.version,
        releaseNotes: t.releaseNotes || "修复已知问题，优化性能",
        size: t.size
      });
      const n = await this.downloadAssets(t, (s) => {
        this.sendToRenderer(Me.downloadProgress, s);
      });
      K.info("下载完成，开始应用资源包..."), await this.applyAssets(n, t.version), K.info("资源包应用成功"), this.sendToRenderer(Me.assetsUpdateDownloaded, {
        version: t.version
      });
    } catch (e) {
      K.error("检查或下载更新失败:", e);
      const t = e instanceof Error ? e.message : "更新失败";
      this.sendToRenderer(Me.assetsUpdateError, t);
    } finally {
      this.isDownloading = !1;
    }
  }
  /**
   * 重启应用
   */
  static restartApp() {
    K.info("用户请求重启应用"), ye.relaunch(), ye.quit();
  }
  /**
   * 发送事件到渲染进程
   */
  static sendToRenderer(e, t) {
    this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents.send(e, t);
  }
}
w(Ae, "mainWindow", null), w(Ae, "isDownloading", !1), w(Ae, "lastCheckTime", 0), w(Ae, "CHECK_INTERVAL", 5 * 60 * 1e3);
function mo(a, e) {
  return function() {
    return a.apply(e, arguments);
  };
}
const { toString: tc } = Object.prototype, { getPrototypeOf: Qa } = Object, { iterator: zn, toStringTag: fo } = Symbol, qn = /* @__PURE__ */ ((a) => (e) => {
  const t = tc.call(e);
  return a[t] || (a[t] = t.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null)), Be = (a) => (a = a.toLowerCase(), (e) => qn(e) === a), Hn = (a) => (e) => typeof e === a, { isArray: Ut } = Array, Nt = Hn("undefined");
function an(a) {
  return a !== null && !Nt(a) && a.constructor !== null && !Nt(a.constructor) && Pe(a.constructor.isBuffer) && a.constructor.isBuffer(a);
}
const ho = Be("ArrayBuffer");
function nc(a) {
  let e;
  return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? e = ArrayBuffer.isView(a) : e = a && a.buffer && ho(a.buffer), e;
}
const ac = Hn("string"), Pe = Hn("function"), go = Hn("number"), sn = (a) => a !== null && typeof a == "object", sc = (a) => a === !0 || a === !1, An = (a) => {
  if (qn(a) !== "object")
    return !1;
  const e = Qa(a);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(fo in a) && !(zn in a);
}, ic = (a) => {
  if (!sn(a) || an(a))
    return !1;
  try {
    return Object.keys(a).length === 0 && Object.getPrototypeOf(a) === Object.prototype;
  } catch {
    return !1;
  }
}, oc = Be("Date"), rc = Be("File"), cc = Be("Blob"), lc = Be("FileList"), uc = (a) => sn(a) && Pe(a.pipe), pc = (a) => {
  let e;
  return a && (typeof FormData == "function" && a instanceof FormData || Pe(a.append) && ((e = qn(a)) === "formdata" || // detect form-data instance
  e === "object" && Pe(a.toString) && a.toString() === "[object FormData]"));
}, dc = Be("URLSearchParams"), [mc, fc, hc, gc] = ["ReadableStream", "Request", "Response", "Headers"].map(Be), xc = (a) => a.trim ? a.trim() : a.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function on(a, e, { allOwnKeys: t = !1 } = {}) {
  if (a === null || typeof a > "u")
    return;
  let n, s;
  if (typeof a != "object" && (a = [a]), Ut(a))
    for (n = 0, s = a.length; n < s; n++)
      e.call(null, a[n], n, a);
  else {
    if (an(a))
      return;
    const i = t ? Object.getOwnPropertyNames(a) : Object.keys(a), o = i.length;
    let r;
    for (n = 0; n < o; n++)
      r = i[n], e.call(null, a[r], r, a);
  }
}
function xo(a, e) {
  if (an(a))
    return null;
  e = e.toLowerCase();
  const t = Object.keys(a);
  let n = t.length, s;
  for (; n-- > 0; )
    if (s = t[n], e === s.toLowerCase())
      return s;
  return null;
}
const lt = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global, vo = (a) => !Nt(a) && a !== lt;
function Na() {
  const { caseless: a, skipUndefined: e } = vo(this) && this || {}, t = {}, n = (s, i) => {
    const o = a && xo(t, i) || i;
    An(t[o]) && An(s) ? t[o] = Na(t[o], s) : An(s) ? t[o] = Na({}, s) : Ut(s) ? t[o] = s.slice() : (!e || !Nt(s)) && (t[o] = s);
  };
  for (let s = 0, i = arguments.length; s < i; s++)
    arguments[s] && on(arguments[s], n);
  return t;
}
const vc = (a, e, t, { allOwnKeys: n } = {}) => (on(e, (s, i) => {
  t && Pe(s) ? Object.defineProperty(a, i, {
    value: mo(s, t),
    writable: !0,
    enumerable: !0,
    configurable: !0
  }) : Object.defineProperty(a, i, {
    value: s,
    writable: !0,
    enumerable: !0,
    configurable: !0
  });
}, { allOwnKeys: n }), a), yc = (a) => (a.charCodeAt(0) === 65279 && (a = a.slice(1)), a), bc = (a, e, t, n) => {
  a.prototype = Object.create(e.prototype, n), Object.defineProperty(a.prototype, "constructor", {
    value: a,
    writable: !0,
    enumerable: !1,
    configurable: !0
  }), Object.defineProperty(a, "super", {
    value: e.prototype
  }), t && Object.assign(a.prototype, t);
}, wc = (a, e, t, n) => {
  let s, i, o;
  const r = {};
  if (e = e || {}, a == null) return e;
  do {
    for (s = Object.getOwnPropertyNames(a), i = s.length; i-- > 0; )
      o = s[i], (!n || n(o, a, e)) && !r[o] && (e[o] = a[o], r[o] = !0);
    a = t !== !1 && Qa(a);
  } while (a && (!t || t(a, e)) && a !== Object.prototype);
  return e;
}, _c = (a, e, t) => {
  a = String(a), (t === void 0 || t > a.length) && (t = a.length), t -= e.length;
  const n = a.indexOf(e, t);
  return n !== -1 && n === t;
}, Sc = (a) => {
  if (!a) return null;
  if (Ut(a)) return a;
  let e = a.length;
  if (!go(e)) return null;
  const t = new Array(e);
  for (; e-- > 0; )
    t[e] = a[e];
  return t;
}, Cc = /* @__PURE__ */ ((a) => (e) => a && e instanceof a)(typeof Uint8Array < "u" && Qa(Uint8Array)), Rc = (a, e) => {
  const n = (a && a[zn]).call(a);
  let s;
  for (; (s = n.next()) && !s.done; ) {
    const i = s.value;
    e.call(a, i[0], i[1]);
  }
}, Ac = (a, e) => {
  let t;
  const n = [];
  for (; (t = a.exec(e)) !== null; )
    n.push(t);
  return n;
}, Ec = Be("HTMLFormElement"), kc = (a) => a.toLowerCase().replace(
  /[-_\s]([a-z\d])(\w*)/g,
  function(t, n, s) {
    return n.toUpperCase() + s;
  }
), As = (({ hasOwnProperty: a }) => (e, t) => a.call(e, t))(Object.prototype), Tc = Be("RegExp"), yo = (a, e) => {
  const t = Object.getOwnPropertyDescriptors(a), n = {};
  on(t, (s, i) => {
    let o;
    (o = e(s, i, a)) !== !1 && (n[i] = o || s);
  }), Object.defineProperties(a, n);
}, Ic = (a) => {
  yo(a, (e, t) => {
    if (Pe(a) && ["arguments", "caller", "callee"].indexOf(t) !== -1)
      return !1;
    const n = a[t];
    if (Pe(n)) {
      if (e.enumerable = !1, "writable" in e) {
        e.writable = !1;
        return;
      }
      e.set || (e.set = () => {
        throw Error("Can not rewrite read-only method '" + t + "'");
      });
    }
  });
}, Pc = (a, e) => {
  const t = {}, n = (s) => {
    s.forEach((i) => {
      t[i] = !0;
    });
  };
  return Ut(a) ? n(a) : n(String(a).split(e)), t;
}, $c = () => {
}, Dc = (a, e) => a != null && Number.isFinite(a = +a) ? a : e;
function Lc(a) {
  return !!(a && Pe(a.append) && a[fo] === "FormData" && a[zn]);
}
const Nc = (a) => {
  const e = new Array(10), t = (n, s) => {
    if (sn(n)) {
      if (e.indexOf(n) >= 0)
        return;
      if (an(n))
        return n;
      if (!("toJSON" in n)) {
        e[s] = n;
        const i = Ut(n) ? [] : {};
        return on(n, (o, r) => {
          const c = t(o, s + 1);
          !Nt(c) && (i[r] = c);
        }), e[s] = void 0, i;
      }
    }
    return n;
  };
  return t(a, 0);
}, Oc = Be("AsyncFunction"), Mc = (a) => a && (sn(a) || Pe(a)) && Pe(a.then) && Pe(a.catch), bo = ((a, e) => a ? setImmediate : e ? ((t, n) => (lt.addEventListener("message", ({ source: s, data: i }) => {
  s === lt && i === t && n.length && n.shift()();
}, !1), (s) => {
  n.push(s), lt.postMessage(t, "*");
}))(`axios@${Math.random()}`, []) : (t) => setTimeout(t))(
  typeof setImmediate == "function",
  Pe(lt.postMessage)
), Uc = typeof queueMicrotask < "u" ? queueMicrotask.bind(lt) : typeof process < "u" && process.nextTick || bo, Fc = (a) => a != null && Pe(a[zn]), x = {
  isArray: Ut,
  isArrayBuffer: ho,
  isBuffer: an,
  isFormData: pc,
  isArrayBufferView: nc,
  isString: ac,
  isNumber: go,
  isBoolean: sc,
  isObject: sn,
  isPlainObject: An,
  isEmptyObject: ic,
  isReadableStream: mc,
  isRequest: fc,
  isResponse: hc,
  isHeaders: gc,
  isUndefined: Nt,
  isDate: oc,
  isFile: rc,
  isBlob: cc,
  isRegExp: Tc,
  isFunction: Pe,
  isStream: uc,
  isURLSearchParams: dc,
  isTypedArray: Cc,
  isFileList: lc,
  forEach: on,
  merge: Na,
  extend: vc,
  trim: xc,
  stripBOM: yc,
  inherits: bc,
  toFlatObject: wc,
  kindOf: qn,
  kindOfTest: Be,
  endsWith: _c,
  toArray: Sc,
  forEachEntry: Rc,
  matchAll: Ac,
  isHTMLForm: Ec,
  hasOwnProperty: As,
  hasOwnProp: As,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors: yo,
  freezeMethods: Ic,
  toObjectSet: Pc,
  toCamelCase: kc,
  noop: $c,
  toFiniteNumber: Dc,
  findKey: xo,
  global: lt,
  isContextDefined: vo,
  isSpecCompliantForm: Lc,
  toJSONObject: Nc,
  isAsyncFn: Oc,
  isThenable: Mc,
  setImmediate: bo,
  asap: Uc,
  isIterable: Fc
};
let E = class wo extends Error {
  static from(e, t, n, s, i, o) {
    const r = new wo(e.message, t || e.code, n, s, i);
    return r.cause = e, r.name = e.name, o && Object.assign(r, o), r;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(e, t, n, s, i) {
    super(e), this.name = "AxiosError", this.isAxiosError = !0, t && (this.code = t), n && (this.config = n), s && (this.request = s), i && (this.response = i, this.status = i.status);
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: x.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
E.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
E.ERR_BAD_OPTION = "ERR_BAD_OPTION";
E.ECONNABORTED = "ECONNABORTED";
E.ETIMEDOUT = "ETIMEDOUT";
E.ERR_NETWORK = "ERR_NETWORK";
E.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
E.ERR_DEPRECATED = "ERR_DEPRECATED";
E.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
E.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
E.ERR_CANCELED = "ERR_CANCELED";
E.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
E.ERR_INVALID_URL = "ERR_INVALID_URL";
function _o(a) {
  return a && a.__esModule && Object.prototype.hasOwnProperty.call(a, "default") ? a.default : a;
}
var So = Te.Stream, Bc = wt, jc = je;
function je() {
  this.source = null, this.dataSize = 0, this.maxDataSize = 1024 * 1024, this.pauseStream = !0, this._maxDataSizeExceeded = !1, this._released = !1, this._bufferedEvents = [];
}
Bc.inherits(je, So);
je.create = function(a, e) {
  var t = new this();
  e = e || {};
  for (var n in e)
    t[n] = e[n];
  t.source = a;
  var s = a.emit;
  return a.emit = function() {
    return t._handleEmit(arguments), s.apply(a, arguments);
  }, a.on("error", function() {
  }), t.pauseStream && a.pause(), t;
};
Object.defineProperty(je.prototype, "readable", {
  configurable: !0,
  enumerable: !0,
  get: function() {
    return this.source.readable;
  }
});
je.prototype.setEncoding = function() {
  return this.source.setEncoding.apply(this.source, arguments);
};
je.prototype.resume = function() {
  this._released || this.release(), this.source.resume();
};
je.prototype.pause = function() {
  this.source.pause();
};
je.prototype.release = function() {
  this._released = !0, this._bufferedEvents.forEach((function(a) {
    this.emit.apply(this, a);
  }).bind(this)), this._bufferedEvents = [];
};
je.prototype.pipe = function() {
  var a = So.prototype.pipe.apply(this, arguments);
  return this.resume(), a;
};
je.prototype._handleEmit = function(a) {
  if (this._released) {
    this.emit.apply(this, a);
    return;
  }
  a[0] === "data" && (this.dataSize += a[1].length, this._checkIfMaxDataSizeExceeded()), this._bufferedEvents.push(a);
};
je.prototype._checkIfMaxDataSizeExceeded = function() {
  if (!this._maxDataSizeExceeded && !(this.dataSize <= this.maxDataSize)) {
    this._maxDataSizeExceeded = !0;
    var a = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
    this.emit("error", new Error(a));
  }
};
var zc = wt, Co = Te.Stream, Es = jc, qc = re;
function re() {
  this.writable = !1, this.readable = !0, this.dataSize = 0, this.maxDataSize = 2 * 1024 * 1024, this.pauseStreams = !0, this._released = !1, this._streams = [], this._currentStream = null, this._insideLoop = !1, this._pendingNext = !1;
}
zc.inherits(re, Co);
re.create = function(a) {
  var e = new this();
  a = a || {};
  for (var t in a)
    e[t] = a[t];
  return e;
};
re.isStreamLike = function(a) {
  return typeof a != "function" && typeof a != "string" && typeof a != "boolean" && typeof a != "number" && !Buffer.isBuffer(a);
};
re.prototype.append = function(a) {
  var e = re.isStreamLike(a);
  if (e) {
    if (!(a instanceof Es)) {
      var t = Es.create(a, {
        maxDataSize: 1 / 0,
        pauseStream: this.pauseStreams
      });
      a.on("data", this._checkDataSize.bind(this)), a = t;
    }
    this._handleErrors(a), this.pauseStreams && a.pause();
  }
  return this._streams.push(a), this;
};
re.prototype.pipe = function(a, e) {
  return Co.prototype.pipe.call(this, a, e), this.resume(), a;
};
re.prototype._getNext = function() {
  if (this._currentStream = null, this._insideLoop) {
    this._pendingNext = !0;
    return;
  }
  this._insideLoop = !0;
  try {
    do
      this._pendingNext = !1, this._realGetNext();
    while (this._pendingNext);
  } finally {
    this._insideLoop = !1;
  }
};
re.prototype._realGetNext = function() {
  var a = this._streams.shift();
  if (typeof a > "u") {
    this.end();
    return;
  }
  if (typeof a != "function") {
    this._pipeNext(a);
    return;
  }
  var e = a;
  e((function(t) {
    var n = re.isStreamLike(t);
    n && (t.on("data", this._checkDataSize.bind(this)), this._handleErrors(t)), this._pipeNext(t);
  }).bind(this));
};
re.prototype._pipeNext = function(a) {
  this._currentStream = a;
  var e = re.isStreamLike(a);
  if (e) {
    a.on("end", this._getNext.bind(this)), a.pipe(this, { end: !1 });
    return;
  }
  var t = a;
  this.write(t), this._getNext();
};
re.prototype._handleErrors = function(a) {
  var e = this;
  a.on("error", function(t) {
    e._emitError(t);
  });
};
re.prototype.write = function(a) {
  this.emit("data", a);
};
re.prototype.pause = function() {
  this.pauseStreams && (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function" && this._currentStream.pause(), this.emit("pause"));
};
re.prototype.resume = function() {
  this._released || (this._released = !0, this.writable = !0, this._getNext()), this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function" && this._currentStream.resume(), this.emit("resume");
};
re.prototype.end = function() {
  this._reset(), this.emit("end");
};
re.prototype.destroy = function() {
  this._reset(), this.emit("close");
};
re.prototype._reset = function() {
  this.writable = !1, this._streams = [], this._currentStream = null;
};
re.prototype._checkDataSize = function() {
  if (this._updateDataSize(), !(this.dataSize <= this.maxDataSize)) {
    var a = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
    this._emitError(new Error(a));
  }
};
re.prototype._updateDataSize = function() {
  this.dataSize = 0;
  var a = this;
  this._streams.forEach(function(e) {
    e.dataSize && (a.dataSize += e.dataSize);
  }), this._currentStream && this._currentStream.dataSize && (this.dataSize += this._currentStream.dataSize);
};
re.prototype._emitError = function(a) {
  this._reset(), this.emit("error", a);
};
var Ro = {};
const Hc = {
  "application/1d-interleaved-parityfec": {
    source: "iana"
  },
  "application/3gpdash-qoe-report+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/3gpp-ims+xml": {
    source: "iana",
    compressible: !0
  },
  "application/3gpphal+json": {
    source: "iana",
    compressible: !0
  },
  "application/3gpphalforms+json": {
    source: "iana",
    compressible: !0
  },
  "application/a2l": {
    source: "iana"
  },
  "application/ace+cbor": {
    source: "iana"
  },
  "application/activemessage": {
    source: "iana"
  },
  "application/activity+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-costmap+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-costmapfilter+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-directory+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointcost+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointcostparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointprop+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointpropparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-error+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-networkmap+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-networkmapfilter+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-updatestreamcontrol+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-updatestreamparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/aml": {
    source: "iana"
  },
  "application/andrew-inset": {
    source: "iana",
    extensions: [
      "ez"
    ]
  },
  "application/applefile": {
    source: "iana"
  },
  "application/applixware": {
    source: "apache",
    extensions: [
      "aw"
    ]
  },
  "application/at+jwt": {
    source: "iana"
  },
  "application/atf": {
    source: "iana"
  },
  "application/atfx": {
    source: "iana"
  },
  "application/atom+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atom"
    ]
  },
  "application/atomcat+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomcat"
    ]
  },
  "application/atomdeleted+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomdeleted"
    ]
  },
  "application/atomicmail": {
    source: "iana"
  },
  "application/atomsvc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomsvc"
    ]
  },
  "application/atsc-dwd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dwd"
    ]
  },
  "application/atsc-dynamic-event-message": {
    source: "iana"
  },
  "application/atsc-held+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "held"
    ]
  },
  "application/atsc-rdt+json": {
    source: "iana",
    compressible: !0
  },
  "application/atsc-rsat+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rsat"
    ]
  },
  "application/atxml": {
    source: "iana"
  },
  "application/auth-policy+xml": {
    source: "iana",
    compressible: !0
  },
  "application/bacnet-xdd+zip": {
    source: "iana",
    compressible: !1
  },
  "application/batch-smtp": {
    source: "iana"
  },
  "application/bdoc": {
    compressible: !1,
    extensions: [
      "bdoc"
    ]
  },
  "application/beep+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/calendar+json": {
    source: "iana",
    compressible: !0
  },
  "application/calendar+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xcs"
    ]
  },
  "application/call-completion": {
    source: "iana"
  },
  "application/cals-1840": {
    source: "iana"
  },
  "application/captive+json": {
    source: "iana",
    compressible: !0
  },
  "application/cbor": {
    source: "iana"
  },
  "application/cbor-seq": {
    source: "iana"
  },
  "application/cccex": {
    source: "iana"
  },
  "application/ccmp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ccxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ccxml"
    ]
  },
  "application/cdfx+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cdfx"
    ]
  },
  "application/cdmi-capability": {
    source: "iana",
    extensions: [
      "cdmia"
    ]
  },
  "application/cdmi-container": {
    source: "iana",
    extensions: [
      "cdmic"
    ]
  },
  "application/cdmi-domain": {
    source: "iana",
    extensions: [
      "cdmid"
    ]
  },
  "application/cdmi-object": {
    source: "iana",
    extensions: [
      "cdmio"
    ]
  },
  "application/cdmi-queue": {
    source: "iana",
    extensions: [
      "cdmiq"
    ]
  },
  "application/cdni": {
    source: "iana"
  },
  "application/cea": {
    source: "iana"
  },
  "application/cea-2018+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cellml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cfw": {
    source: "iana"
  },
  "application/city+json": {
    source: "iana",
    compressible: !0
  },
  "application/clr": {
    source: "iana"
  },
  "application/clue+xml": {
    source: "iana",
    compressible: !0
  },
  "application/clue_info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cms": {
    source: "iana"
  },
  "application/cnrp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/coap-group+json": {
    source: "iana",
    compressible: !0
  },
  "application/coap-payload": {
    source: "iana"
  },
  "application/commonground": {
    source: "iana"
  },
  "application/conference-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cose": {
    source: "iana"
  },
  "application/cose-key": {
    source: "iana"
  },
  "application/cose-key-set": {
    source: "iana"
  },
  "application/cpl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cpl"
    ]
  },
  "application/csrattrs": {
    source: "iana"
  },
  "application/csta+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cstadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/csvm+json": {
    source: "iana",
    compressible: !0
  },
  "application/cu-seeme": {
    source: "apache",
    extensions: [
      "cu"
    ]
  },
  "application/cwt": {
    source: "iana"
  },
  "application/cybercash": {
    source: "iana"
  },
  "application/dart": {
    compressible: !0
  },
  "application/dash+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpd"
    ]
  },
  "application/dash-patch+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpp"
    ]
  },
  "application/dashdelta": {
    source: "iana"
  },
  "application/davmount+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "davmount"
    ]
  },
  "application/dca-rft": {
    source: "iana"
  },
  "application/dcd": {
    source: "iana"
  },
  "application/dec-dx": {
    source: "iana"
  },
  "application/dialog-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dicom": {
    source: "iana"
  },
  "application/dicom+json": {
    source: "iana",
    compressible: !0
  },
  "application/dicom+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dii": {
    source: "iana"
  },
  "application/dit": {
    source: "iana"
  },
  "application/dns": {
    source: "iana"
  },
  "application/dns+json": {
    source: "iana",
    compressible: !0
  },
  "application/dns-message": {
    source: "iana"
  },
  "application/docbook+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "dbk"
    ]
  },
  "application/dots+cbor": {
    source: "iana"
  },
  "application/dskpp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dssc+der": {
    source: "iana",
    extensions: [
      "dssc"
    ]
  },
  "application/dssc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdssc"
    ]
  },
  "application/dvcs": {
    source: "iana"
  },
  "application/ecmascript": {
    source: "iana",
    compressible: !0,
    extensions: [
      "es",
      "ecma"
    ]
  },
  "application/edi-consent": {
    source: "iana"
  },
  "application/edi-x12": {
    source: "iana",
    compressible: !1
  },
  "application/edifact": {
    source: "iana",
    compressible: !1
  },
  "application/efi": {
    source: "iana"
  },
  "application/elm+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/elm+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.cap+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/emergencycalldata.comment+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.deviceinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.ecall.msd": {
    source: "iana"
  },
  "application/emergencycalldata.providerinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.serviceinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.subscriberinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.veds+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emma+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "emma"
    ]
  },
  "application/emotionml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "emotionml"
    ]
  },
  "application/encaprtp": {
    source: "iana"
  },
  "application/epp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/epub+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "epub"
    ]
  },
  "application/eshop": {
    source: "iana"
  },
  "application/exi": {
    source: "iana",
    extensions: [
      "exi"
    ]
  },
  "application/expect-ct-report+json": {
    source: "iana",
    compressible: !0
  },
  "application/express": {
    source: "iana",
    extensions: [
      "exp"
    ]
  },
  "application/fastinfoset": {
    source: "iana"
  },
  "application/fastsoap": {
    source: "iana"
  },
  "application/fdt+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "fdt"
    ]
  },
  "application/fhir+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/fhir+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/fido.trusted-apps+json": {
    compressible: !0
  },
  "application/fits": {
    source: "iana"
  },
  "application/flexfec": {
    source: "iana"
  },
  "application/font-sfnt": {
    source: "iana"
  },
  "application/font-tdpfr": {
    source: "iana",
    extensions: [
      "pfr"
    ]
  },
  "application/font-woff": {
    source: "iana",
    compressible: !1
  },
  "application/framework-attributes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/geo+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "geojson"
    ]
  },
  "application/geo+json-seq": {
    source: "iana"
  },
  "application/geopackage+sqlite3": {
    source: "iana"
  },
  "application/geoxacml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/gltf-buffer": {
    source: "iana"
  },
  "application/gml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "gml"
    ]
  },
  "application/gpx+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "gpx"
    ]
  },
  "application/gxf": {
    source: "apache",
    extensions: [
      "gxf"
    ]
  },
  "application/gzip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "gz"
    ]
  },
  "application/h224": {
    source: "iana"
  },
  "application/held+xml": {
    source: "iana",
    compressible: !0
  },
  "application/hjson": {
    extensions: [
      "hjson"
    ]
  },
  "application/http": {
    source: "iana"
  },
  "application/hyperstudio": {
    source: "iana",
    extensions: [
      "stk"
    ]
  },
  "application/ibe-key-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ibe-pkg-reply+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ibe-pp-data": {
    source: "iana"
  },
  "application/iges": {
    source: "iana"
  },
  "application/im-iscomposing+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/index": {
    source: "iana"
  },
  "application/index.cmd": {
    source: "iana"
  },
  "application/index.obj": {
    source: "iana"
  },
  "application/index.response": {
    source: "iana"
  },
  "application/index.vnd": {
    source: "iana"
  },
  "application/inkml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ink",
      "inkml"
    ]
  },
  "application/iotp": {
    source: "iana"
  },
  "application/ipfix": {
    source: "iana",
    extensions: [
      "ipfix"
    ]
  },
  "application/ipp": {
    source: "iana"
  },
  "application/isup": {
    source: "iana"
  },
  "application/its+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "its"
    ]
  },
  "application/java-archive": {
    source: "apache",
    compressible: !1,
    extensions: [
      "jar",
      "war",
      "ear"
    ]
  },
  "application/java-serialized-object": {
    source: "apache",
    compressible: !1,
    extensions: [
      "ser"
    ]
  },
  "application/java-vm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "class"
    ]
  },
  "application/javascript": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "js",
      "mjs"
    ]
  },
  "application/jf2feed+json": {
    source: "iana",
    compressible: !0
  },
  "application/jose": {
    source: "iana"
  },
  "application/jose+json": {
    source: "iana",
    compressible: !0
  },
  "application/jrd+json": {
    source: "iana",
    compressible: !0
  },
  "application/jscalendar+json": {
    source: "iana",
    compressible: !0
  },
  "application/json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "json",
      "map"
    ]
  },
  "application/json-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/json-seq": {
    source: "iana"
  },
  "application/json5": {
    extensions: [
      "json5"
    ]
  },
  "application/jsonml+json": {
    source: "apache",
    compressible: !0,
    extensions: [
      "jsonml"
    ]
  },
  "application/jwk+json": {
    source: "iana",
    compressible: !0
  },
  "application/jwk-set+json": {
    source: "iana",
    compressible: !0
  },
  "application/jwt": {
    source: "iana"
  },
  "application/kpml-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/kpml-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ld+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "jsonld"
    ]
  },
  "application/lgr+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lgr"
    ]
  },
  "application/link-format": {
    source: "iana"
  },
  "application/load-control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/lost+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lostxml"
    ]
  },
  "application/lostsync+xml": {
    source: "iana",
    compressible: !0
  },
  "application/lpf+zip": {
    source: "iana",
    compressible: !1
  },
  "application/lxf": {
    source: "iana"
  },
  "application/mac-binhex40": {
    source: "iana",
    extensions: [
      "hqx"
    ]
  },
  "application/mac-compactpro": {
    source: "apache",
    extensions: [
      "cpt"
    ]
  },
  "application/macwriteii": {
    source: "iana"
  },
  "application/mads+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mads"
    ]
  },
  "application/manifest+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "webmanifest"
    ]
  },
  "application/marc": {
    source: "iana",
    extensions: [
      "mrc"
    ]
  },
  "application/marcxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mrcx"
    ]
  },
  "application/mathematica": {
    source: "iana",
    extensions: [
      "ma",
      "nb",
      "mb"
    ]
  },
  "application/mathml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mathml"
    ]
  },
  "application/mathml-content+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mathml-presentation+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-associated-procedure-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-deregister+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-envelope+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-msk+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-msk-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-protection-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-reception-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-register+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-register-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-schedule+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-user-service-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbox": {
    source: "iana",
    extensions: [
      "mbox"
    ]
  },
  "application/media-policy-dataset+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpf"
    ]
  },
  "application/media_control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mediaservercontrol+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mscml"
    ]
  },
  "application/merge-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/metalink+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "metalink"
    ]
  },
  "application/metalink4+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "meta4"
    ]
  },
  "application/mets+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mets"
    ]
  },
  "application/mf4": {
    source: "iana"
  },
  "application/mikey": {
    source: "iana"
  },
  "application/mipc": {
    source: "iana"
  },
  "application/missing-blocks+cbor-seq": {
    source: "iana"
  },
  "application/mmt-aei+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "maei"
    ]
  },
  "application/mmt-usd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "musd"
    ]
  },
  "application/mods+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mods"
    ]
  },
  "application/moss-keys": {
    source: "iana"
  },
  "application/moss-signature": {
    source: "iana"
  },
  "application/mosskey-data": {
    source: "iana"
  },
  "application/mosskey-request": {
    source: "iana"
  },
  "application/mp21": {
    source: "iana",
    extensions: [
      "m21",
      "mp21"
    ]
  },
  "application/mp4": {
    source: "iana",
    extensions: [
      "mp4s",
      "m4p"
    ]
  },
  "application/mpeg4-generic": {
    source: "iana"
  },
  "application/mpeg4-iod": {
    source: "iana"
  },
  "application/mpeg4-iod-xmt": {
    source: "iana"
  },
  "application/mrb-consumer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mrb-publish+xml": {
    source: "iana",
    compressible: !0
  },
  "application/msc-ivr+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/msc-mixer+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/msword": {
    source: "iana",
    compressible: !1,
    extensions: [
      "doc",
      "dot"
    ]
  },
  "application/mud+json": {
    source: "iana",
    compressible: !0
  },
  "application/multipart-core": {
    source: "iana"
  },
  "application/mxf": {
    source: "iana",
    extensions: [
      "mxf"
    ]
  },
  "application/n-quads": {
    source: "iana",
    extensions: [
      "nq"
    ]
  },
  "application/n-triples": {
    source: "iana",
    extensions: [
      "nt"
    ]
  },
  "application/nasdata": {
    source: "iana"
  },
  "application/news-checkgroups": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-groupinfo": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-transmission": {
    source: "iana"
  },
  "application/nlsml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/node": {
    source: "iana",
    extensions: [
      "cjs"
    ]
  },
  "application/nss": {
    source: "iana"
  },
  "application/oauth-authz-req+jwt": {
    source: "iana"
  },
  "application/oblivious-dns-message": {
    source: "iana"
  },
  "application/ocsp-request": {
    source: "iana"
  },
  "application/ocsp-response": {
    source: "iana"
  },
  "application/octet-stream": {
    source: "iana",
    compressible: !1,
    extensions: [
      "bin",
      "dms",
      "lrf",
      "mar",
      "so",
      "dist",
      "distz",
      "pkg",
      "bpk",
      "dump",
      "elc",
      "deploy",
      "exe",
      "dll",
      "deb",
      "dmg",
      "iso",
      "img",
      "msi",
      "msp",
      "msm",
      "buffer"
    ]
  },
  "application/oda": {
    source: "iana",
    extensions: [
      "oda"
    ]
  },
  "application/odm+xml": {
    source: "iana",
    compressible: !0
  },
  "application/odx": {
    source: "iana"
  },
  "application/oebps-package+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "opf"
    ]
  },
  "application/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ogx"
    ]
  },
  "application/omdoc+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "omdoc"
    ]
  },
  "application/onenote": {
    source: "apache",
    extensions: [
      "onetoc",
      "onetoc2",
      "onetmp",
      "onepkg"
    ]
  },
  "application/opc-nodeset+xml": {
    source: "iana",
    compressible: !0
  },
  "application/oscore": {
    source: "iana"
  },
  "application/oxps": {
    source: "iana",
    extensions: [
      "oxps"
    ]
  },
  "application/p21": {
    source: "iana"
  },
  "application/p21+zip": {
    source: "iana",
    compressible: !1
  },
  "application/p2p-overlay+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "relo"
    ]
  },
  "application/parityfec": {
    source: "iana"
  },
  "application/passport": {
    source: "iana"
  },
  "application/patch-ops-error+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xer"
    ]
  },
  "application/pdf": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pdf"
    ]
  },
  "application/pdx": {
    source: "iana"
  },
  "application/pem-certificate-chain": {
    source: "iana"
  },
  "application/pgp-encrypted": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pgp"
    ]
  },
  "application/pgp-keys": {
    source: "iana",
    extensions: [
      "asc"
    ]
  },
  "application/pgp-signature": {
    source: "iana",
    extensions: [
      "asc",
      "sig"
    ]
  },
  "application/pics-rules": {
    source: "apache",
    extensions: [
      "prf"
    ]
  },
  "application/pidf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/pidf-diff+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/pkcs10": {
    source: "iana",
    extensions: [
      "p10"
    ]
  },
  "application/pkcs12": {
    source: "iana"
  },
  "application/pkcs7-mime": {
    source: "iana",
    extensions: [
      "p7m",
      "p7c"
    ]
  },
  "application/pkcs7-signature": {
    source: "iana",
    extensions: [
      "p7s"
    ]
  },
  "application/pkcs8": {
    source: "iana",
    extensions: [
      "p8"
    ]
  },
  "application/pkcs8-encrypted": {
    source: "iana"
  },
  "application/pkix-attr-cert": {
    source: "iana",
    extensions: [
      "ac"
    ]
  },
  "application/pkix-cert": {
    source: "iana",
    extensions: [
      "cer"
    ]
  },
  "application/pkix-crl": {
    source: "iana",
    extensions: [
      "crl"
    ]
  },
  "application/pkix-pkipath": {
    source: "iana",
    extensions: [
      "pkipath"
    ]
  },
  "application/pkixcmp": {
    source: "iana",
    extensions: [
      "pki"
    ]
  },
  "application/pls+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "pls"
    ]
  },
  "application/poc-settings+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/postscript": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ai",
      "eps",
      "ps"
    ]
  },
  "application/ppsp-tracker+json": {
    source: "iana",
    compressible: !0
  },
  "application/problem+json": {
    source: "iana",
    compressible: !0
  },
  "application/problem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/provenance+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "provx"
    ]
  },
  "application/prs.alvestrand.titrax-sheet": {
    source: "iana"
  },
  "application/prs.cww": {
    source: "iana",
    extensions: [
      "cww"
    ]
  },
  "application/prs.cyn": {
    source: "iana",
    charset: "7-BIT"
  },
  "application/prs.hpub+zip": {
    source: "iana",
    compressible: !1
  },
  "application/prs.nprend": {
    source: "iana"
  },
  "application/prs.plucker": {
    source: "iana"
  },
  "application/prs.rdf-xml-crypt": {
    source: "iana"
  },
  "application/prs.xsf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/pskc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "pskcxml"
    ]
  },
  "application/pvd+json": {
    source: "iana",
    compressible: !0
  },
  "application/qsig": {
    source: "iana"
  },
  "application/raml+yaml": {
    compressible: !0,
    extensions: [
      "raml"
    ]
  },
  "application/raptorfec": {
    source: "iana"
  },
  "application/rdap+json": {
    source: "iana",
    compressible: !0
  },
  "application/rdf+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rdf",
      "owl"
    ]
  },
  "application/reginfo+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rif"
    ]
  },
  "application/relax-ng-compact-syntax": {
    source: "iana",
    extensions: [
      "rnc"
    ]
  },
  "application/remote-printing": {
    source: "iana"
  },
  "application/reputon+json": {
    source: "iana",
    compressible: !0
  },
  "application/resource-lists+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rl"
    ]
  },
  "application/resource-lists-diff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rld"
    ]
  },
  "application/rfc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/riscos": {
    source: "iana"
  },
  "application/rlmi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/rls-services+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rs"
    ]
  },
  "application/route-apd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rapd"
    ]
  },
  "application/route-s-tsid+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sls"
    ]
  },
  "application/route-usd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rusd"
    ]
  },
  "application/rpki-ghostbusters": {
    source: "iana",
    extensions: [
      "gbr"
    ]
  },
  "application/rpki-manifest": {
    source: "iana",
    extensions: [
      "mft"
    ]
  },
  "application/rpki-publication": {
    source: "iana"
  },
  "application/rpki-roa": {
    source: "iana",
    extensions: [
      "roa"
    ]
  },
  "application/rpki-updown": {
    source: "iana"
  },
  "application/rsd+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "rsd"
    ]
  },
  "application/rss+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "rss"
    ]
  },
  "application/rtf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtf"
    ]
  },
  "application/rtploopback": {
    source: "iana"
  },
  "application/rtx": {
    source: "iana"
  },
  "application/samlassertion+xml": {
    source: "iana",
    compressible: !0
  },
  "application/samlmetadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sarif+json": {
    source: "iana",
    compressible: !0
  },
  "application/sarif-external-properties+json": {
    source: "iana",
    compressible: !0
  },
  "application/sbe": {
    source: "iana"
  },
  "application/sbml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sbml"
    ]
  },
  "application/scaip+xml": {
    source: "iana",
    compressible: !0
  },
  "application/scim+json": {
    source: "iana",
    compressible: !0
  },
  "application/scvp-cv-request": {
    source: "iana",
    extensions: [
      "scq"
    ]
  },
  "application/scvp-cv-response": {
    source: "iana",
    extensions: [
      "scs"
    ]
  },
  "application/scvp-vp-request": {
    source: "iana",
    extensions: [
      "spq"
    ]
  },
  "application/scvp-vp-response": {
    source: "iana",
    extensions: [
      "spp"
    ]
  },
  "application/sdp": {
    source: "iana",
    extensions: [
      "sdp"
    ]
  },
  "application/secevent+jwt": {
    source: "iana"
  },
  "application/senml+cbor": {
    source: "iana"
  },
  "application/senml+json": {
    source: "iana",
    compressible: !0
  },
  "application/senml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "senmlx"
    ]
  },
  "application/senml-etch+cbor": {
    source: "iana"
  },
  "application/senml-etch+json": {
    source: "iana",
    compressible: !0
  },
  "application/senml-exi": {
    source: "iana"
  },
  "application/sensml+cbor": {
    source: "iana"
  },
  "application/sensml+json": {
    source: "iana",
    compressible: !0
  },
  "application/sensml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sensmlx"
    ]
  },
  "application/sensml-exi": {
    source: "iana"
  },
  "application/sep+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sep-exi": {
    source: "iana"
  },
  "application/session-info": {
    source: "iana"
  },
  "application/set-payment": {
    source: "iana"
  },
  "application/set-payment-initiation": {
    source: "iana",
    extensions: [
      "setpay"
    ]
  },
  "application/set-registration": {
    source: "iana"
  },
  "application/set-registration-initiation": {
    source: "iana",
    extensions: [
      "setreg"
    ]
  },
  "application/sgml": {
    source: "iana"
  },
  "application/sgml-open-catalog": {
    source: "iana"
  },
  "application/shf+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "shf"
    ]
  },
  "application/sieve": {
    source: "iana",
    extensions: [
      "siv",
      "sieve"
    ]
  },
  "application/simple-filter+xml": {
    source: "iana",
    compressible: !0
  },
  "application/simple-message-summary": {
    source: "iana"
  },
  "application/simplesymbolcontainer": {
    source: "iana"
  },
  "application/sipc": {
    source: "iana"
  },
  "application/slate": {
    source: "iana"
  },
  "application/smil": {
    source: "iana"
  },
  "application/smil+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "smi",
      "smil"
    ]
  },
  "application/smpte336m": {
    source: "iana"
  },
  "application/soap+fastinfoset": {
    source: "iana"
  },
  "application/soap+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sparql-query": {
    source: "iana",
    extensions: [
      "rq"
    ]
  },
  "application/sparql-results+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "srx"
    ]
  },
  "application/spdx+json": {
    source: "iana",
    compressible: !0
  },
  "application/spirits-event+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sql": {
    source: "iana"
  },
  "application/srgs": {
    source: "iana",
    extensions: [
      "gram"
    ]
  },
  "application/srgs+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "grxml"
    ]
  },
  "application/sru+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sru"
    ]
  },
  "application/ssdl+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ssdl"
    ]
  },
  "application/ssml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ssml"
    ]
  },
  "application/stix+json": {
    source: "iana",
    compressible: !0
  },
  "application/swid+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "swidtag"
    ]
  },
  "application/tamp-apex-update": {
    source: "iana"
  },
  "application/tamp-apex-update-confirm": {
    source: "iana"
  },
  "application/tamp-community-update": {
    source: "iana"
  },
  "application/tamp-community-update-confirm": {
    source: "iana"
  },
  "application/tamp-error": {
    source: "iana"
  },
  "application/tamp-sequence-adjust": {
    source: "iana"
  },
  "application/tamp-sequence-adjust-confirm": {
    source: "iana"
  },
  "application/tamp-status-query": {
    source: "iana"
  },
  "application/tamp-status-response": {
    source: "iana"
  },
  "application/tamp-update": {
    source: "iana"
  },
  "application/tamp-update-confirm": {
    source: "iana"
  },
  "application/tar": {
    compressible: !0
  },
  "application/taxii+json": {
    source: "iana",
    compressible: !0
  },
  "application/td+json": {
    source: "iana",
    compressible: !0
  },
  "application/tei+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tei",
      "teicorpus"
    ]
  },
  "application/tetra_isi": {
    source: "iana"
  },
  "application/thraud+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tfi"
    ]
  },
  "application/timestamp-query": {
    source: "iana"
  },
  "application/timestamp-reply": {
    source: "iana"
  },
  "application/timestamped-data": {
    source: "iana",
    extensions: [
      "tsd"
    ]
  },
  "application/tlsrpt+gzip": {
    source: "iana"
  },
  "application/tlsrpt+json": {
    source: "iana",
    compressible: !0
  },
  "application/tnauthlist": {
    source: "iana"
  },
  "application/token-introspection+jwt": {
    source: "iana"
  },
  "application/toml": {
    compressible: !0,
    extensions: [
      "toml"
    ]
  },
  "application/trickle-ice-sdpfrag": {
    source: "iana"
  },
  "application/trig": {
    source: "iana",
    extensions: [
      "trig"
    ]
  },
  "application/ttml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ttml"
    ]
  },
  "application/tve-trigger": {
    source: "iana"
  },
  "application/tzif": {
    source: "iana"
  },
  "application/tzif-leap": {
    source: "iana"
  },
  "application/ubjson": {
    compressible: !1,
    extensions: [
      "ubj"
    ]
  },
  "application/ulpfec": {
    source: "iana"
  },
  "application/urc-grpsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/urc-ressheet+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rsheet"
    ]
  },
  "application/urc-targetdesc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "td"
    ]
  },
  "application/urc-uisocketdesc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vcard+json": {
    source: "iana",
    compressible: !0
  },
  "application/vcard+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vemmi": {
    source: "iana"
  },
  "application/vividence.scriptfile": {
    source: "apache"
  },
  "application/vnd.1000minds.decision-model+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "1km"
    ]
  },
  "application/vnd.3gpp-prose+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp-prose-pc3ch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp-v2x-local-service-information": {
    source: "iana"
  },
  "application/vnd.3gpp.5gnas": {
    source: "iana"
  },
  "application/vnd.3gpp.access-transfer-events+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.bsf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.gmop+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.gtpc": {
    source: "iana"
  },
  "application/vnd.3gpp.interworking-data": {
    source: "iana"
  },
  "application/vnd.3gpp.lpp": {
    source: "iana"
  },
  "application/vnd.3gpp.mc-signalling-ear": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-payload": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-signalling": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-floor-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-location-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-signed+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-location-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mid-call+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.ngap": {
    source: "iana"
  },
  "application/vnd.3gpp.pfcp": {
    source: "iana"
  },
  "application/vnd.3gpp.pic-bw-large": {
    source: "iana",
    extensions: [
      "plb"
    ]
  },
  "application/vnd.3gpp.pic-bw-small": {
    source: "iana",
    extensions: [
      "psb"
    ]
  },
  "application/vnd.3gpp.pic-bw-var": {
    source: "iana",
    extensions: [
      "pvb"
    ]
  },
  "application/vnd.3gpp.s1ap": {
    source: "iana"
  },
  "application/vnd.3gpp.sms": {
    source: "iana"
  },
  "application/vnd.3gpp.sms+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.srvcc-ext+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.srvcc-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.state-and-event-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.ussd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp2.bcmcsinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp2.sms": {
    source: "iana"
  },
  "application/vnd.3gpp2.tcap": {
    source: "iana",
    extensions: [
      "tcap"
    ]
  },
  "application/vnd.3lightssoftware.imagescal": {
    source: "iana"
  },
  "application/vnd.3m.post-it-notes": {
    source: "iana",
    extensions: [
      "pwn"
    ]
  },
  "application/vnd.accpac.simply.aso": {
    source: "iana",
    extensions: [
      "aso"
    ]
  },
  "application/vnd.accpac.simply.imp": {
    source: "iana",
    extensions: [
      "imp"
    ]
  },
  "application/vnd.acucobol": {
    source: "iana",
    extensions: [
      "acu"
    ]
  },
  "application/vnd.acucorp": {
    source: "iana",
    extensions: [
      "atc",
      "acutc"
    ]
  },
  "application/vnd.adobe.air-application-installer-package+zip": {
    source: "apache",
    compressible: !1,
    extensions: [
      "air"
    ]
  },
  "application/vnd.adobe.flash.movie": {
    source: "iana"
  },
  "application/vnd.adobe.formscentral.fcdt": {
    source: "iana",
    extensions: [
      "fcdt"
    ]
  },
  "application/vnd.adobe.fxp": {
    source: "iana",
    extensions: [
      "fxp",
      "fxpl"
    ]
  },
  "application/vnd.adobe.partial-upload": {
    source: "iana"
  },
  "application/vnd.adobe.xdp+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdp"
    ]
  },
  "application/vnd.adobe.xfdf": {
    source: "iana",
    extensions: [
      "xfdf"
    ]
  },
  "application/vnd.aether.imp": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata-pagedef": {
    source: "iana"
  },
  "application/vnd.afpc.cmoca-cmresource": {
    source: "iana"
  },
  "application/vnd.afpc.foca-charset": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codedfont": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codepage": {
    source: "iana"
  },
  "application/vnd.afpc.modca": {
    source: "iana"
  },
  "application/vnd.afpc.modca-cmtable": {
    source: "iana"
  },
  "application/vnd.afpc.modca-formdef": {
    source: "iana"
  },
  "application/vnd.afpc.modca-mediummap": {
    source: "iana"
  },
  "application/vnd.afpc.modca-objectcontainer": {
    source: "iana"
  },
  "application/vnd.afpc.modca-overlay": {
    source: "iana"
  },
  "application/vnd.afpc.modca-pagesegment": {
    source: "iana"
  },
  "application/vnd.age": {
    source: "iana",
    extensions: [
      "age"
    ]
  },
  "application/vnd.ah-barcode": {
    source: "iana"
  },
  "application/vnd.ahead.space": {
    source: "iana",
    extensions: [
      "ahead"
    ]
  },
  "application/vnd.airzip.filesecure.azf": {
    source: "iana",
    extensions: [
      "azf"
    ]
  },
  "application/vnd.airzip.filesecure.azs": {
    source: "iana",
    extensions: [
      "azs"
    ]
  },
  "application/vnd.amadeus+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.amazon.ebook": {
    source: "apache",
    extensions: [
      "azw"
    ]
  },
  "application/vnd.amazon.mobi8-ebook": {
    source: "iana"
  },
  "application/vnd.americandynamics.acc": {
    source: "iana",
    extensions: [
      "acc"
    ]
  },
  "application/vnd.amiga.ami": {
    source: "iana",
    extensions: [
      "ami"
    ]
  },
  "application/vnd.amundsen.maze+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.android.ota": {
    source: "iana"
  },
  "application/vnd.android.package-archive": {
    source: "apache",
    compressible: !1,
    extensions: [
      "apk"
    ]
  },
  "application/vnd.anki": {
    source: "iana"
  },
  "application/vnd.anser-web-certificate-issue-initiation": {
    source: "iana",
    extensions: [
      "cii"
    ]
  },
  "application/vnd.anser-web-funds-transfer-initiation": {
    source: "apache",
    extensions: [
      "fti"
    ]
  },
  "application/vnd.antix.game-component": {
    source: "iana",
    extensions: [
      "atx"
    ]
  },
  "application/vnd.apache.arrow.file": {
    source: "iana"
  },
  "application/vnd.apache.arrow.stream": {
    source: "iana"
  },
  "application/vnd.apache.thrift.binary": {
    source: "iana"
  },
  "application/vnd.apache.thrift.compact": {
    source: "iana"
  },
  "application/vnd.apache.thrift.json": {
    source: "iana"
  },
  "application/vnd.api+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.aplextor.warrp+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.apothekende.reservation+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.apple.installer+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpkg"
    ]
  },
  "application/vnd.apple.keynote": {
    source: "iana",
    extensions: [
      "key"
    ]
  },
  "application/vnd.apple.mpegurl": {
    source: "iana",
    extensions: [
      "m3u8"
    ]
  },
  "application/vnd.apple.numbers": {
    source: "iana",
    extensions: [
      "numbers"
    ]
  },
  "application/vnd.apple.pages": {
    source: "iana",
    extensions: [
      "pages"
    ]
  },
  "application/vnd.apple.pkpass": {
    compressible: !1,
    extensions: [
      "pkpass"
    ]
  },
  "application/vnd.arastra.swi": {
    source: "iana"
  },
  "application/vnd.aristanetworks.swi": {
    source: "iana",
    extensions: [
      "swi"
    ]
  },
  "application/vnd.artisan+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.artsquare": {
    source: "iana"
  },
  "application/vnd.astraea-software.iota": {
    source: "iana",
    extensions: [
      "iota"
    ]
  },
  "application/vnd.audiograph": {
    source: "iana",
    extensions: [
      "aep"
    ]
  },
  "application/vnd.autopackage": {
    source: "iana"
  },
  "application/vnd.avalon+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.avistar+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.balsamiq.bmml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "bmml"
    ]
  },
  "application/vnd.balsamiq.bmpr": {
    source: "iana"
  },
  "application/vnd.banana-accounting": {
    source: "iana"
  },
  "application/vnd.bbf.usp.error": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.bekitzur-stech+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.bint.med-content": {
    source: "iana"
  },
  "application/vnd.biopax.rdf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.blink-idb-value-wrapper": {
    source: "iana"
  },
  "application/vnd.blueice.multipass": {
    source: "iana",
    extensions: [
      "mpm"
    ]
  },
  "application/vnd.bluetooth.ep.oob": {
    source: "iana"
  },
  "application/vnd.bluetooth.le.oob": {
    source: "iana"
  },
  "application/vnd.bmi": {
    source: "iana",
    extensions: [
      "bmi"
    ]
  },
  "application/vnd.bpf": {
    source: "iana"
  },
  "application/vnd.bpf3": {
    source: "iana"
  },
  "application/vnd.businessobjects": {
    source: "iana",
    extensions: [
      "rep"
    ]
  },
  "application/vnd.byu.uapi+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cab-jscript": {
    source: "iana"
  },
  "application/vnd.canon-cpdl": {
    source: "iana"
  },
  "application/vnd.canon-lips": {
    source: "iana"
  },
  "application/vnd.capasystems-pg+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cendio.thinlinc.clientconf": {
    source: "iana"
  },
  "application/vnd.century-systems.tcp_stream": {
    source: "iana"
  },
  "application/vnd.chemdraw+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cdxml"
    ]
  },
  "application/vnd.chess-pgn": {
    source: "iana"
  },
  "application/vnd.chipnuts.karaoke-mmd": {
    source: "iana",
    extensions: [
      "mmd"
    ]
  },
  "application/vnd.ciedi": {
    source: "iana"
  },
  "application/vnd.cinderella": {
    source: "iana",
    extensions: [
      "cdy"
    ]
  },
  "application/vnd.cirpack.isdn-ext": {
    source: "iana"
  },
  "application/vnd.citationstyles.style+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "csl"
    ]
  },
  "application/vnd.claymore": {
    source: "iana",
    extensions: [
      "cla"
    ]
  },
  "application/vnd.cloanto.rp9": {
    source: "iana",
    extensions: [
      "rp9"
    ]
  },
  "application/vnd.clonk.c4group": {
    source: "iana",
    extensions: [
      "c4g",
      "c4d",
      "c4f",
      "c4p",
      "c4u"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config": {
    source: "iana",
    extensions: [
      "c11amc"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config-pkg": {
    source: "iana",
    extensions: [
      "c11amz"
    ]
  },
  "application/vnd.coffeescript": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet-template": {
    source: "iana"
  },
  "application/vnd.collection+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.collection.doc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.collection.next+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.comicbook+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.comicbook-rar": {
    source: "iana"
  },
  "application/vnd.commerce-battelle": {
    source: "iana"
  },
  "application/vnd.commonspace": {
    source: "iana",
    extensions: [
      "csp"
    ]
  },
  "application/vnd.contact.cmsg": {
    source: "iana",
    extensions: [
      "cdbcmsg"
    ]
  },
  "application/vnd.coreos.ignition+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cosmocaller": {
    source: "iana",
    extensions: [
      "cmc"
    ]
  },
  "application/vnd.crick.clicker": {
    source: "iana",
    extensions: [
      "clkx"
    ]
  },
  "application/vnd.crick.clicker.keyboard": {
    source: "iana",
    extensions: [
      "clkk"
    ]
  },
  "application/vnd.crick.clicker.palette": {
    source: "iana",
    extensions: [
      "clkp"
    ]
  },
  "application/vnd.crick.clicker.template": {
    source: "iana",
    extensions: [
      "clkt"
    ]
  },
  "application/vnd.crick.clicker.wordbank": {
    source: "iana",
    extensions: [
      "clkw"
    ]
  },
  "application/vnd.criticaltools.wbs+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wbs"
    ]
  },
  "application/vnd.cryptii.pipe+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.crypto-shade-file": {
    source: "iana"
  },
  "application/vnd.cryptomator.encrypted": {
    source: "iana"
  },
  "application/vnd.cryptomator.vault": {
    source: "iana"
  },
  "application/vnd.ctc-posml": {
    source: "iana",
    extensions: [
      "pml"
    ]
  },
  "application/vnd.ctct.ws+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cups-pdf": {
    source: "iana"
  },
  "application/vnd.cups-postscript": {
    source: "iana"
  },
  "application/vnd.cups-ppd": {
    source: "iana",
    extensions: [
      "ppd"
    ]
  },
  "application/vnd.cups-raster": {
    source: "iana"
  },
  "application/vnd.cups-raw": {
    source: "iana"
  },
  "application/vnd.curl": {
    source: "iana"
  },
  "application/vnd.curl.car": {
    source: "apache",
    extensions: [
      "car"
    ]
  },
  "application/vnd.curl.pcurl": {
    source: "apache",
    extensions: [
      "pcurl"
    ]
  },
  "application/vnd.cyan.dean.root+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cybank": {
    source: "iana"
  },
  "application/vnd.cyclonedx+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cyclonedx+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.d2l.coursepackage1p0+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.d3m-dataset": {
    source: "iana"
  },
  "application/vnd.d3m-problem": {
    source: "iana"
  },
  "application/vnd.dart": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dart"
    ]
  },
  "application/vnd.data-vision.rdz": {
    source: "iana",
    extensions: [
      "rdz"
    ]
  },
  "application/vnd.datapackage+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dataresource+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dbf": {
    source: "iana",
    extensions: [
      "dbf"
    ]
  },
  "application/vnd.debian.binary-package": {
    source: "iana"
  },
  "application/vnd.dece.data": {
    source: "iana",
    extensions: [
      "uvf",
      "uvvf",
      "uvd",
      "uvvd"
    ]
  },
  "application/vnd.dece.ttml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uvt",
      "uvvt"
    ]
  },
  "application/vnd.dece.unspecified": {
    source: "iana",
    extensions: [
      "uvx",
      "uvvx"
    ]
  },
  "application/vnd.dece.zip": {
    source: "iana",
    extensions: [
      "uvz",
      "uvvz"
    ]
  },
  "application/vnd.denovo.fcselayout-link": {
    source: "iana",
    extensions: [
      "fe_launch"
    ]
  },
  "application/vnd.desmume.movie": {
    source: "iana"
  },
  "application/vnd.dir-bi.plate-dl-nosuffix": {
    source: "iana"
  },
  "application/vnd.dm.delegation+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dna": {
    source: "iana",
    extensions: [
      "dna"
    ]
  },
  "application/vnd.document+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dolby.mlp": {
    source: "apache",
    extensions: [
      "mlp"
    ]
  },
  "application/vnd.dolby.mobile.1": {
    source: "iana"
  },
  "application/vnd.dolby.mobile.2": {
    source: "iana"
  },
  "application/vnd.doremir.scorecloud-binary-document": {
    source: "iana"
  },
  "application/vnd.dpgraph": {
    source: "iana",
    extensions: [
      "dpg"
    ]
  },
  "application/vnd.dreamfactory": {
    source: "iana",
    extensions: [
      "dfac"
    ]
  },
  "application/vnd.drive+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ds-keypoint": {
    source: "apache",
    extensions: [
      "kpxx"
    ]
  },
  "application/vnd.dtg.local": {
    source: "iana"
  },
  "application/vnd.dtg.local.flash": {
    source: "iana"
  },
  "application/vnd.dtg.local.html": {
    source: "iana"
  },
  "application/vnd.dvb.ait": {
    source: "iana",
    extensions: [
      "ait"
    ]
  },
  "application/vnd.dvb.dvbisl+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.dvbj": {
    source: "iana"
  },
  "application/vnd.dvb.esgcontainer": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcdftnotifaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess2": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgpdd": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcroaming": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-base": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-enhancement": {
    source: "iana"
  },
  "application/vnd.dvb.notif-aggregate-root+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-container+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-generic+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-msglist+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-registration-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-registration-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-init+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.pfr": {
    source: "iana"
  },
  "application/vnd.dvb.service": {
    source: "iana",
    extensions: [
      "svc"
    ]
  },
  "application/vnd.dxr": {
    source: "iana"
  },
  "application/vnd.dynageo": {
    source: "iana",
    extensions: [
      "geo"
    ]
  },
  "application/vnd.dzr": {
    source: "iana"
  },
  "application/vnd.easykaraoke.cdgdownload": {
    source: "iana"
  },
  "application/vnd.ecdis-update": {
    source: "iana"
  },
  "application/vnd.ecip.rlp": {
    source: "iana"
  },
  "application/vnd.eclipse.ditto+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ecowin.chart": {
    source: "iana",
    extensions: [
      "mag"
    ]
  },
  "application/vnd.ecowin.filerequest": {
    source: "iana"
  },
  "application/vnd.ecowin.fileupdate": {
    source: "iana"
  },
  "application/vnd.ecowin.series": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesrequest": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesupdate": {
    source: "iana"
  },
  "application/vnd.efi.img": {
    source: "iana"
  },
  "application/vnd.efi.iso": {
    source: "iana"
  },
  "application/vnd.emclient.accessrequest+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.enliven": {
    source: "iana",
    extensions: [
      "nml"
    ]
  },
  "application/vnd.enphase.envoy": {
    source: "iana"
  },
  "application/vnd.eprints.data+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.epson.esf": {
    source: "iana",
    extensions: [
      "esf"
    ]
  },
  "application/vnd.epson.msf": {
    source: "iana",
    extensions: [
      "msf"
    ]
  },
  "application/vnd.epson.quickanime": {
    source: "iana",
    extensions: [
      "qam"
    ]
  },
  "application/vnd.epson.salt": {
    source: "iana",
    extensions: [
      "slt"
    ]
  },
  "application/vnd.epson.ssf": {
    source: "iana",
    extensions: [
      "ssf"
    ]
  },
  "application/vnd.ericsson.quickcall": {
    source: "iana"
  },
  "application/vnd.espass-espass+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.eszigno3+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "es3",
      "et3"
    ]
  },
  "application/vnd.etsi.aoc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.asic-e+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.etsi.asic-s+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.etsi.cug+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvcommand+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvdiscovery+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-bc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-cod+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-npvr+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvservice+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsync+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvueprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.mcid+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.mheg5": {
    source: "iana"
  },
  "application/vnd.etsi.overload-control-policy-dataset+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.pstn+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.sci+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.simservs+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.timestamp-token": {
    source: "iana"
  },
  "application/vnd.etsi.tsl+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.tsl.der": {
    source: "iana"
  },
  "application/vnd.eu.kasparian.car+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.eudora.data": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.profile": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.settings": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.theme": {
    source: "iana"
  },
  "application/vnd.exstream-empower+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.exstream-package": {
    source: "iana"
  },
  "application/vnd.ezpix-album": {
    source: "iana",
    extensions: [
      "ez2"
    ]
  },
  "application/vnd.ezpix-package": {
    source: "iana",
    extensions: [
      "ez3"
    ]
  },
  "application/vnd.f-secure.mobile": {
    source: "iana"
  },
  "application/vnd.familysearch.gedcom+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.fastcopy-disk-image": {
    source: "iana"
  },
  "application/vnd.fdf": {
    source: "iana",
    extensions: [
      "fdf"
    ]
  },
  "application/vnd.fdsn.mseed": {
    source: "iana",
    extensions: [
      "mseed"
    ]
  },
  "application/vnd.fdsn.seed": {
    source: "iana",
    extensions: [
      "seed",
      "dataless"
    ]
  },
  "application/vnd.ffsns": {
    source: "iana"
  },
  "application/vnd.ficlab.flb+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.filmit.zfc": {
    source: "iana"
  },
  "application/vnd.fints": {
    source: "iana"
  },
  "application/vnd.firemonkeys.cloudcell": {
    source: "iana"
  },
  "application/vnd.flographit": {
    source: "iana",
    extensions: [
      "gph"
    ]
  },
  "application/vnd.fluxtime.clip": {
    source: "iana",
    extensions: [
      "ftc"
    ]
  },
  "application/vnd.font-fontforge-sfd": {
    source: "iana"
  },
  "application/vnd.framemaker": {
    source: "iana",
    extensions: [
      "fm",
      "frame",
      "maker",
      "book"
    ]
  },
  "application/vnd.frogans.fnc": {
    source: "iana",
    extensions: [
      "fnc"
    ]
  },
  "application/vnd.frogans.ltf": {
    source: "iana",
    extensions: [
      "ltf"
    ]
  },
  "application/vnd.fsc.weblaunch": {
    source: "iana",
    extensions: [
      "fsc"
    ]
  },
  "application/vnd.fujifilm.fb.docuworks": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.binder": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.jfi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.fujitsu.oasys": {
    source: "iana",
    extensions: [
      "oas"
    ]
  },
  "application/vnd.fujitsu.oasys2": {
    source: "iana",
    extensions: [
      "oa2"
    ]
  },
  "application/vnd.fujitsu.oasys3": {
    source: "iana",
    extensions: [
      "oa3"
    ]
  },
  "application/vnd.fujitsu.oasysgp": {
    source: "iana",
    extensions: [
      "fg5"
    ]
  },
  "application/vnd.fujitsu.oasysprs": {
    source: "iana",
    extensions: [
      "bh2"
    ]
  },
  "application/vnd.fujixerox.art-ex": {
    source: "iana"
  },
  "application/vnd.fujixerox.art4": {
    source: "iana"
  },
  "application/vnd.fujixerox.ddd": {
    source: "iana",
    extensions: [
      "ddd"
    ]
  },
  "application/vnd.fujixerox.docuworks": {
    source: "iana",
    extensions: [
      "xdw"
    ]
  },
  "application/vnd.fujixerox.docuworks.binder": {
    source: "iana",
    extensions: [
      "xbd"
    ]
  },
  "application/vnd.fujixerox.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujixerox.hbpl": {
    source: "iana"
  },
  "application/vnd.fut-misnet": {
    source: "iana"
  },
  "application/vnd.futoin+cbor": {
    source: "iana"
  },
  "application/vnd.futoin+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.fuzzysheet": {
    source: "iana",
    extensions: [
      "fzs"
    ]
  },
  "application/vnd.genomatix.tuxedo": {
    source: "iana",
    extensions: [
      "txd"
    ]
  },
  "application/vnd.gentics.grd+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geo+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geocube+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geogebra.file": {
    source: "iana",
    extensions: [
      "ggb"
    ]
  },
  "application/vnd.geogebra.slides": {
    source: "iana"
  },
  "application/vnd.geogebra.tool": {
    source: "iana",
    extensions: [
      "ggt"
    ]
  },
  "application/vnd.geometry-explorer": {
    source: "iana",
    extensions: [
      "gex",
      "gre"
    ]
  },
  "application/vnd.geonext": {
    source: "iana",
    extensions: [
      "gxt"
    ]
  },
  "application/vnd.geoplan": {
    source: "iana",
    extensions: [
      "g2w"
    ]
  },
  "application/vnd.geospace": {
    source: "iana",
    extensions: [
      "g3w"
    ]
  },
  "application/vnd.gerber": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt-response": {
    source: "iana"
  },
  "application/vnd.gmx": {
    source: "iana",
    extensions: [
      "gmx"
    ]
  },
  "application/vnd.google-apps.document": {
    compressible: !1,
    extensions: [
      "gdoc"
    ]
  },
  "application/vnd.google-apps.presentation": {
    compressible: !1,
    extensions: [
      "gslides"
    ]
  },
  "application/vnd.google-apps.spreadsheet": {
    compressible: !1,
    extensions: [
      "gsheet"
    ]
  },
  "application/vnd.google-earth.kml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "kml"
    ]
  },
  "application/vnd.google-earth.kmz": {
    source: "iana",
    compressible: !1,
    extensions: [
      "kmz"
    ]
  },
  "application/vnd.gov.sk.e-form+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.gov.sk.e-form+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.gov.sk.xmldatacontainer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.grafeq": {
    source: "iana",
    extensions: [
      "gqf",
      "gqs"
    ]
  },
  "application/vnd.gridmp": {
    source: "iana"
  },
  "application/vnd.groove-account": {
    source: "iana",
    extensions: [
      "gac"
    ]
  },
  "application/vnd.groove-help": {
    source: "iana",
    extensions: [
      "ghf"
    ]
  },
  "application/vnd.groove-identity-message": {
    source: "iana",
    extensions: [
      "gim"
    ]
  },
  "application/vnd.groove-injector": {
    source: "iana",
    extensions: [
      "grv"
    ]
  },
  "application/vnd.groove-tool-message": {
    source: "iana",
    extensions: [
      "gtm"
    ]
  },
  "application/vnd.groove-tool-template": {
    source: "iana",
    extensions: [
      "tpl"
    ]
  },
  "application/vnd.groove-vcard": {
    source: "iana",
    extensions: [
      "vcg"
    ]
  },
  "application/vnd.hal+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hal+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "hal"
    ]
  },
  "application/vnd.handheld-entertainment+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "zmm"
    ]
  },
  "application/vnd.hbci": {
    source: "iana",
    extensions: [
      "hbci"
    ]
  },
  "application/vnd.hc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hcl-bireports": {
    source: "iana"
  },
  "application/vnd.hdt": {
    source: "iana"
  },
  "application/vnd.heroku+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hhe.lesson-player": {
    source: "iana",
    extensions: [
      "les"
    ]
  },
  "application/vnd.hl7cda+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.hl7v2+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.hp-hpgl": {
    source: "iana",
    extensions: [
      "hpgl"
    ]
  },
  "application/vnd.hp-hpid": {
    source: "iana",
    extensions: [
      "hpid"
    ]
  },
  "application/vnd.hp-hps": {
    source: "iana",
    extensions: [
      "hps"
    ]
  },
  "application/vnd.hp-jlyt": {
    source: "iana",
    extensions: [
      "jlt"
    ]
  },
  "application/vnd.hp-pcl": {
    source: "iana",
    extensions: [
      "pcl"
    ]
  },
  "application/vnd.hp-pclxl": {
    source: "iana",
    extensions: [
      "pclxl"
    ]
  },
  "application/vnd.httphone": {
    source: "iana"
  },
  "application/vnd.hydrostatix.sof-data": {
    source: "iana",
    extensions: [
      "sfd-hdstx"
    ]
  },
  "application/vnd.hyper+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hyper-item+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hyperdrive+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hzn-3d-crossword": {
    source: "iana"
  },
  "application/vnd.ibm.afplinedata": {
    source: "iana"
  },
  "application/vnd.ibm.electronic-media": {
    source: "iana"
  },
  "application/vnd.ibm.minipay": {
    source: "iana",
    extensions: [
      "mpy"
    ]
  },
  "application/vnd.ibm.modcap": {
    source: "iana",
    extensions: [
      "afp",
      "listafp",
      "list3820"
    ]
  },
  "application/vnd.ibm.rights-management": {
    source: "iana",
    extensions: [
      "irm"
    ]
  },
  "application/vnd.ibm.secure-container": {
    source: "iana",
    extensions: [
      "sc"
    ]
  },
  "application/vnd.iccprofile": {
    source: "iana",
    extensions: [
      "icc",
      "icm"
    ]
  },
  "application/vnd.ieee.1905": {
    source: "iana"
  },
  "application/vnd.igloader": {
    source: "iana",
    extensions: [
      "igl"
    ]
  },
  "application/vnd.imagemeter.folder+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.imagemeter.image+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.immervision-ivp": {
    source: "iana",
    extensions: [
      "ivp"
    ]
  },
  "application/vnd.immervision-ivu": {
    source: "iana",
    extensions: [
      "ivu"
    ]
  },
  "application/vnd.ims.imsccv1p1": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p2": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p3": {
    source: "iana"
  },
  "application/vnd.ims.lis.v2.result+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolproxy+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolproxy.id+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolsettings+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.informedcontrol.rms+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.informix-visionary": {
    source: "iana"
  },
  "application/vnd.infotech.project": {
    source: "iana"
  },
  "application/vnd.infotech.project+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.innopath.wamp.notification": {
    source: "iana"
  },
  "application/vnd.insors.igm": {
    source: "iana",
    extensions: [
      "igm"
    ]
  },
  "application/vnd.intercon.formnet": {
    source: "iana",
    extensions: [
      "xpw",
      "xpx"
    ]
  },
  "application/vnd.intergeo": {
    source: "iana",
    extensions: [
      "i2g"
    ]
  },
  "application/vnd.intertrust.digibox": {
    source: "iana"
  },
  "application/vnd.intertrust.nncp": {
    source: "iana"
  },
  "application/vnd.intu.qbo": {
    source: "iana",
    extensions: [
      "qbo"
    ]
  },
  "application/vnd.intu.qfx": {
    source: "iana",
    extensions: [
      "qfx"
    ]
  },
  "application/vnd.iptc.g2.catalogitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.conceptitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.knowledgeitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.newsitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.newsmessage+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.packageitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.planningitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ipunplugged.rcprofile": {
    source: "iana",
    extensions: [
      "rcprofile"
    ]
  },
  "application/vnd.irepository.package+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "irp"
    ]
  },
  "application/vnd.is-xpr": {
    source: "iana",
    extensions: [
      "xpr"
    ]
  },
  "application/vnd.isac.fcs": {
    source: "iana",
    extensions: [
      "fcs"
    ]
  },
  "application/vnd.iso11783-10+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.jam": {
    source: "iana",
    extensions: [
      "jam"
    ]
  },
  "application/vnd.japannet-directory-service": {
    source: "iana"
  },
  "application/vnd.japannet-jpnstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-payment-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-registration": {
    source: "iana"
  },
  "application/vnd.japannet-registration-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-setstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-verification": {
    source: "iana"
  },
  "application/vnd.japannet-verification-wakeup": {
    source: "iana"
  },
  "application/vnd.jcp.javame.midlet-rms": {
    source: "iana",
    extensions: [
      "rms"
    ]
  },
  "application/vnd.jisp": {
    source: "iana",
    extensions: [
      "jisp"
    ]
  },
  "application/vnd.joost.joda-archive": {
    source: "iana",
    extensions: [
      "joda"
    ]
  },
  "application/vnd.jsk.isdn-ngn": {
    source: "iana"
  },
  "application/vnd.kahootz": {
    source: "iana",
    extensions: [
      "ktz",
      "ktr"
    ]
  },
  "application/vnd.kde.karbon": {
    source: "iana",
    extensions: [
      "karbon"
    ]
  },
  "application/vnd.kde.kchart": {
    source: "iana",
    extensions: [
      "chrt"
    ]
  },
  "application/vnd.kde.kformula": {
    source: "iana",
    extensions: [
      "kfo"
    ]
  },
  "application/vnd.kde.kivio": {
    source: "iana",
    extensions: [
      "flw"
    ]
  },
  "application/vnd.kde.kontour": {
    source: "iana",
    extensions: [
      "kon"
    ]
  },
  "application/vnd.kde.kpresenter": {
    source: "iana",
    extensions: [
      "kpr",
      "kpt"
    ]
  },
  "application/vnd.kde.kspread": {
    source: "iana",
    extensions: [
      "ksp"
    ]
  },
  "application/vnd.kde.kword": {
    source: "iana",
    extensions: [
      "kwd",
      "kwt"
    ]
  },
  "application/vnd.kenameaapp": {
    source: "iana",
    extensions: [
      "htke"
    ]
  },
  "application/vnd.kidspiration": {
    source: "iana",
    extensions: [
      "kia"
    ]
  },
  "application/vnd.kinar": {
    source: "iana",
    extensions: [
      "kne",
      "knp"
    ]
  },
  "application/vnd.koan": {
    source: "iana",
    extensions: [
      "skp",
      "skd",
      "skt",
      "skm"
    ]
  },
  "application/vnd.kodak-descriptor": {
    source: "iana",
    extensions: [
      "sse"
    ]
  },
  "application/vnd.las": {
    source: "iana"
  },
  "application/vnd.las.las+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.las.las+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lasxml"
    ]
  },
  "application/vnd.laszip": {
    source: "iana"
  },
  "application/vnd.leap+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.liberty-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.llamagraphics.life-balance.desktop": {
    source: "iana",
    extensions: [
      "lbd"
    ]
  },
  "application/vnd.llamagraphics.life-balance.exchange+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lbe"
    ]
  },
  "application/vnd.logipipe.circuit+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.loom": {
    source: "iana"
  },
  "application/vnd.lotus-1-2-3": {
    source: "iana",
    extensions: [
      "123"
    ]
  },
  "application/vnd.lotus-approach": {
    source: "iana",
    extensions: [
      "apr"
    ]
  },
  "application/vnd.lotus-freelance": {
    source: "iana",
    extensions: [
      "pre"
    ]
  },
  "application/vnd.lotus-notes": {
    source: "iana",
    extensions: [
      "nsf"
    ]
  },
  "application/vnd.lotus-organizer": {
    source: "iana",
    extensions: [
      "org"
    ]
  },
  "application/vnd.lotus-screencam": {
    source: "iana",
    extensions: [
      "scm"
    ]
  },
  "application/vnd.lotus-wordpro": {
    source: "iana",
    extensions: [
      "lwp"
    ]
  },
  "application/vnd.macports.portpkg": {
    source: "iana",
    extensions: [
      "portpkg"
    ]
  },
  "application/vnd.mapbox-vector-tile": {
    source: "iana",
    extensions: [
      "mvt"
    ]
  },
  "application/vnd.marlin.drm.actiontoken+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.conftoken+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.license+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.mdcf": {
    source: "iana"
  },
  "application/vnd.mason+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.maxar.archive.3tz+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.maxmind.maxmind-db": {
    source: "iana"
  },
  "application/vnd.mcd": {
    source: "iana",
    extensions: [
      "mcd"
    ]
  },
  "application/vnd.medcalcdata": {
    source: "iana",
    extensions: [
      "mc1"
    ]
  },
  "application/vnd.mediastation.cdkey": {
    source: "iana",
    extensions: [
      "cdkey"
    ]
  },
  "application/vnd.meridian-slingshot": {
    source: "iana"
  },
  "application/vnd.mfer": {
    source: "iana",
    extensions: [
      "mwf"
    ]
  },
  "application/vnd.mfmp": {
    source: "iana",
    extensions: [
      "mfm"
    ]
  },
  "application/vnd.micro+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.micrografx.flo": {
    source: "iana",
    extensions: [
      "flo"
    ]
  },
  "application/vnd.micrografx.igx": {
    source: "iana",
    extensions: [
      "igx"
    ]
  },
  "application/vnd.microsoft.portable-executable": {
    source: "iana"
  },
  "application/vnd.microsoft.windows.thumbnail-cache": {
    source: "iana"
  },
  "application/vnd.miele+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.mif": {
    source: "iana",
    extensions: [
      "mif"
    ]
  },
  "application/vnd.minisoft-hp3000-save": {
    source: "iana"
  },
  "application/vnd.mitsubishi.misty-guard.trustweb": {
    source: "iana"
  },
  "application/vnd.mobius.daf": {
    source: "iana",
    extensions: [
      "daf"
    ]
  },
  "application/vnd.mobius.dis": {
    source: "iana",
    extensions: [
      "dis"
    ]
  },
  "application/vnd.mobius.mbk": {
    source: "iana",
    extensions: [
      "mbk"
    ]
  },
  "application/vnd.mobius.mqy": {
    source: "iana",
    extensions: [
      "mqy"
    ]
  },
  "application/vnd.mobius.msl": {
    source: "iana",
    extensions: [
      "msl"
    ]
  },
  "application/vnd.mobius.plc": {
    source: "iana",
    extensions: [
      "plc"
    ]
  },
  "application/vnd.mobius.txf": {
    source: "iana",
    extensions: [
      "txf"
    ]
  },
  "application/vnd.mophun.application": {
    source: "iana",
    extensions: [
      "mpn"
    ]
  },
  "application/vnd.mophun.certificate": {
    source: "iana",
    extensions: [
      "mpc"
    ]
  },
  "application/vnd.motorola.flexsuite": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.adsi": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.fis": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.gotap": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.kmr": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.ttc": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.wem": {
    source: "iana"
  },
  "application/vnd.motorola.iprm": {
    source: "iana"
  },
  "application/vnd.mozilla.xul+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xul"
    ]
  },
  "application/vnd.ms-3mfdocument": {
    source: "iana"
  },
  "application/vnd.ms-artgalry": {
    source: "iana",
    extensions: [
      "cil"
    ]
  },
  "application/vnd.ms-asf": {
    source: "iana"
  },
  "application/vnd.ms-cab-compressed": {
    source: "iana",
    extensions: [
      "cab"
    ]
  },
  "application/vnd.ms-color.iccprofile": {
    source: "apache"
  },
  "application/vnd.ms-excel": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xls",
      "xlm",
      "xla",
      "xlc",
      "xlt",
      "xlw"
    ]
  },
  "application/vnd.ms-excel.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlam"
    ]
  },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsb"
    ]
  },
  "application/vnd.ms-excel.sheet.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsm"
    ]
  },
  "application/vnd.ms-excel.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "xltm"
    ]
  },
  "application/vnd.ms-fontobject": {
    source: "iana",
    compressible: !0,
    extensions: [
      "eot"
    ]
  },
  "application/vnd.ms-htmlhelp": {
    source: "iana",
    extensions: [
      "chm"
    ]
  },
  "application/vnd.ms-ims": {
    source: "iana",
    extensions: [
      "ims"
    ]
  },
  "application/vnd.ms-lrm": {
    source: "iana",
    extensions: [
      "lrm"
    ]
  },
  "application/vnd.ms-office.activex+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-officetheme": {
    source: "iana",
    extensions: [
      "thmx"
    ]
  },
  "application/vnd.ms-opentype": {
    source: "apache",
    compressible: !0
  },
  "application/vnd.ms-outlook": {
    compressible: !1,
    extensions: [
      "msg"
    ]
  },
  "application/vnd.ms-package.obfuscated-opentype": {
    source: "apache"
  },
  "application/vnd.ms-pki.seccat": {
    source: "apache",
    extensions: [
      "cat"
    ]
  },
  "application/vnd.ms-pki.stl": {
    source: "apache",
    extensions: [
      "stl"
    ]
  },
  "application/vnd.ms-playready.initiator+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-powerpoint": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ppt",
      "pps",
      "pot"
    ]
  },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppam"
    ]
  },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
    source: "iana",
    extensions: [
      "pptm"
    ]
  },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": {
    source: "iana",
    extensions: [
      "sldm"
    ]
  },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppsm"
    ]
  },
  "application/vnd.ms-powerpoint.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "potm"
    ]
  },
  "application/vnd.ms-printdevicecapabilities+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-printing.printticket+xml": {
    source: "apache",
    compressible: !0
  },
  "application/vnd.ms-printschematicket+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-project": {
    source: "iana",
    extensions: [
      "mpp",
      "mpt"
    ]
  },
  "application/vnd.ms-tnef": {
    source: "iana"
  },
  "application/vnd.ms-windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.nwprinting.oob": {
    source: "iana"
  },
  "application/vnd.ms-windows.printerpairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.wsd.oob": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-resp": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-resp": {
    source: "iana"
  },
  "application/vnd.ms-word.document.macroenabled.12": {
    source: "iana",
    extensions: [
      "docm"
    ]
  },
  "application/vnd.ms-word.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "dotm"
    ]
  },
  "application/vnd.ms-works": {
    source: "iana",
    extensions: [
      "wps",
      "wks",
      "wcm",
      "wdb"
    ]
  },
  "application/vnd.ms-wpl": {
    source: "iana",
    extensions: [
      "wpl"
    ]
  },
  "application/vnd.ms-xpsdocument": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xps"
    ]
  },
  "application/vnd.msa-disk-image": {
    source: "iana"
  },
  "application/vnd.mseq": {
    source: "iana",
    extensions: [
      "mseq"
    ]
  },
  "application/vnd.msign": {
    source: "iana"
  },
  "application/vnd.multiad.creator": {
    source: "iana"
  },
  "application/vnd.multiad.creator.cif": {
    source: "iana"
  },
  "application/vnd.music-niff": {
    source: "iana"
  },
  "application/vnd.musician": {
    source: "iana",
    extensions: [
      "mus"
    ]
  },
  "application/vnd.muvee.style": {
    source: "iana",
    extensions: [
      "msty"
    ]
  },
  "application/vnd.mynfc": {
    source: "iana",
    extensions: [
      "taglet"
    ]
  },
  "application/vnd.nacamar.ybrid+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ncd.control": {
    source: "iana"
  },
  "application/vnd.ncd.reference": {
    source: "iana"
  },
  "application/vnd.nearst.inv+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nebumind.line": {
    source: "iana"
  },
  "application/vnd.nervana": {
    source: "iana"
  },
  "application/vnd.netfpx": {
    source: "iana"
  },
  "application/vnd.neurolanguage.nlu": {
    source: "iana",
    extensions: [
      "nlu"
    ]
  },
  "application/vnd.nimn": {
    source: "iana"
  },
  "application/vnd.nintendo.nitro.rom": {
    source: "iana"
  },
  "application/vnd.nintendo.snes.rom": {
    source: "iana"
  },
  "application/vnd.nitf": {
    source: "iana",
    extensions: [
      "ntf",
      "nitf"
    ]
  },
  "application/vnd.noblenet-directory": {
    source: "iana",
    extensions: [
      "nnd"
    ]
  },
  "application/vnd.noblenet-sealer": {
    source: "iana",
    extensions: [
      "nns"
    ]
  },
  "application/vnd.noblenet-web": {
    source: "iana",
    extensions: [
      "nnw"
    ]
  },
  "application/vnd.nokia.catalogs": {
    source: "iana"
  },
  "application/vnd.nokia.conml+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.conml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.iptv.config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.isds-radio-presets": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.landmarkcollection+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.n-gage.ac+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ac"
    ]
  },
  "application/vnd.nokia.n-gage.data": {
    source: "iana",
    extensions: [
      "ngdat"
    ]
  },
  "application/vnd.nokia.n-gage.symbian.install": {
    source: "iana",
    extensions: [
      "n-gage"
    ]
  },
  "application/vnd.nokia.ncd": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.radio-preset": {
    source: "iana",
    extensions: [
      "rpst"
    ]
  },
  "application/vnd.nokia.radio-presets": {
    source: "iana",
    extensions: [
      "rpss"
    ]
  },
  "application/vnd.novadigm.edm": {
    source: "iana",
    extensions: [
      "edm"
    ]
  },
  "application/vnd.novadigm.edx": {
    source: "iana",
    extensions: [
      "edx"
    ]
  },
  "application/vnd.novadigm.ext": {
    source: "iana",
    extensions: [
      "ext"
    ]
  },
  "application/vnd.ntt-local.content-share": {
    source: "iana"
  },
  "application/vnd.ntt-local.file-transfer": {
    source: "iana"
  },
  "application/vnd.ntt-local.ogw_remote-access": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_remote": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_tcp_stream": {
    source: "iana"
  },
  "application/vnd.oasis.opendocument.chart": {
    source: "iana",
    extensions: [
      "odc"
    ]
  },
  "application/vnd.oasis.opendocument.chart-template": {
    source: "iana",
    extensions: [
      "otc"
    ]
  },
  "application/vnd.oasis.opendocument.database": {
    source: "iana",
    extensions: [
      "odb"
    ]
  },
  "application/vnd.oasis.opendocument.formula": {
    source: "iana",
    extensions: [
      "odf"
    ]
  },
  "application/vnd.oasis.opendocument.formula-template": {
    source: "iana",
    extensions: [
      "odft"
    ]
  },
  "application/vnd.oasis.opendocument.graphics": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odg"
    ]
  },
  "application/vnd.oasis.opendocument.graphics-template": {
    source: "iana",
    extensions: [
      "otg"
    ]
  },
  "application/vnd.oasis.opendocument.image": {
    source: "iana",
    extensions: [
      "odi"
    ]
  },
  "application/vnd.oasis.opendocument.image-template": {
    source: "iana",
    extensions: [
      "oti"
    ]
  },
  "application/vnd.oasis.opendocument.presentation": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odp"
    ]
  },
  "application/vnd.oasis.opendocument.presentation-template": {
    source: "iana",
    extensions: [
      "otp"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ods"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet-template": {
    source: "iana",
    extensions: [
      "ots"
    ]
  },
  "application/vnd.oasis.opendocument.text": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odt"
    ]
  },
  "application/vnd.oasis.opendocument.text-master": {
    source: "iana",
    extensions: [
      "odm"
    ]
  },
  "application/vnd.oasis.opendocument.text-template": {
    source: "iana",
    extensions: [
      "ott"
    ]
  },
  "application/vnd.oasis.opendocument.text-web": {
    source: "iana",
    extensions: [
      "oth"
    ]
  },
  "application/vnd.obn": {
    source: "iana"
  },
  "application/vnd.ocf+cbor": {
    source: "iana"
  },
  "application/vnd.oci.image.manifest.v1+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oftn.l10n+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.contentaccessdownload+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.contentaccessstreaming+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.cspg-hexbinary": {
    source: "iana"
  },
  "application/vnd.oipf.dae.svg+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.dae.xhtml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.mippvcontrolmessage+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.pae.gem": {
    source: "iana"
  },
  "application/vnd.oipf.spdiscovery+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.spdlist+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.ueprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.userprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.olpc-sugar": {
    source: "iana",
    extensions: [
      "xo"
    ]
  },
  "application/vnd.oma-scws-config": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-request": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-response": {
    source: "iana"
  },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.drm-trigger+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.imd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.ltkm": {
    source: "iana"
  },
  "application/vnd.oma.bcast.notification+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.provisioningtrigger": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgboot": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgdd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.sgdu": {
    source: "iana"
  },
  "application/vnd.oma.bcast.simple-symbol-container": {
    source: "iana"
  },
  "application/vnd.oma.bcast.smartcard-trigger+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.sprov+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.stkm": {
    source: "iana"
  },
  "application/vnd.oma.cab-address-book+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-feature-handler+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-pcc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-subs-invite+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-user-prefs+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.dcd": {
    source: "iana"
  },
  "application/vnd.oma.dcdc": {
    source: "iana"
  },
  "application/vnd.oma.dd2+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dd2"
    ]
  },
  "application/vnd.oma.drm.risd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.group-usage-list+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.lwm2m+cbor": {
    source: "iana"
  },
  "application/vnd.oma.lwm2m+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.lwm2m+tlv": {
    source: "iana"
  },
  "application/vnd.oma.pal+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.detailed-progress-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.final-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.groups+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.invocation-descriptor+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.optimized-progress-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.push": {
    source: "iana"
  },
  "application/vnd.oma.scidm.messages+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.xcap-directory+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.omads-email+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omads-file+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omads-folder+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omaloc-supl-init": {
    source: "iana"
  },
  "application/vnd.onepager": {
    source: "iana"
  },
  "application/vnd.onepagertamp": {
    source: "iana"
  },
  "application/vnd.onepagertamx": {
    source: "iana"
  },
  "application/vnd.onepagertat": {
    source: "iana"
  },
  "application/vnd.onepagertatp": {
    source: "iana"
  },
  "application/vnd.onepagertatx": {
    source: "iana"
  },
  "application/vnd.openblox.game+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "obgx"
    ]
  },
  "application/vnd.openblox.game-binary": {
    source: "iana"
  },
  "application/vnd.openeye.oeb": {
    source: "iana"
  },
  "application/vnd.openofficeorg.extension": {
    source: "apache",
    extensions: [
      "oxt"
    ]
  },
  "application/vnd.openstreetmap.data+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "osm"
    ]
  },
  "application/vnd.opentimestamps.ots": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawing+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pptx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": {
    source: "iana",
    extensions: [
      "sldx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
    source: "iana",
    extensions: [
      "ppsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template": {
    source: "iana",
    extensions: [
      "potx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xlsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
    source: "iana",
    extensions: [
      "xltx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.theme+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.vmldrawing": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    source: "iana",
    compressible: !1,
    extensions: [
      "docx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
    source: "iana",
    extensions: [
      "dotx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.core-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.relationships+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oracle.resource+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.orange.indata": {
    source: "iana"
  },
  "application/vnd.osa.netdeploy": {
    source: "iana"
  },
  "application/vnd.osgeo.mapguide.package": {
    source: "iana",
    extensions: [
      "mgp"
    ]
  },
  "application/vnd.osgi.bundle": {
    source: "iana"
  },
  "application/vnd.osgi.dp": {
    source: "iana",
    extensions: [
      "dp"
    ]
  },
  "application/vnd.osgi.subsystem": {
    source: "iana",
    extensions: [
      "esa"
    ]
  },
  "application/vnd.otps.ct-kip+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oxli.countgraph": {
    source: "iana"
  },
  "application/vnd.pagerduty+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.palm": {
    source: "iana",
    extensions: [
      "pdb",
      "pqa",
      "oprc"
    ]
  },
  "application/vnd.panoply": {
    source: "iana"
  },
  "application/vnd.paos.xml": {
    source: "iana"
  },
  "application/vnd.patentdive": {
    source: "iana"
  },
  "application/vnd.patientecommsdoc": {
    source: "iana"
  },
  "application/vnd.pawaafile": {
    source: "iana",
    extensions: [
      "paw"
    ]
  },
  "application/vnd.pcos": {
    source: "iana"
  },
  "application/vnd.pg.format": {
    source: "iana",
    extensions: [
      "str"
    ]
  },
  "application/vnd.pg.osasli": {
    source: "iana",
    extensions: [
      "ei6"
    ]
  },
  "application/vnd.piaccess.application-licence": {
    source: "iana"
  },
  "application/vnd.picsel": {
    source: "iana",
    extensions: [
      "efif"
    ]
  },
  "application/vnd.pmi.widget": {
    source: "iana",
    extensions: [
      "wg"
    ]
  },
  "application/vnd.poc.group-advertisement+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.pocketlearn": {
    source: "iana",
    extensions: [
      "plf"
    ]
  },
  "application/vnd.powerbuilder6": {
    source: "iana",
    extensions: [
      "pbd"
    ]
  },
  "application/vnd.powerbuilder6-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder7": {
    source: "iana"
  },
  "application/vnd.powerbuilder7-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder75": {
    source: "iana"
  },
  "application/vnd.powerbuilder75-s": {
    source: "iana"
  },
  "application/vnd.preminet": {
    source: "iana"
  },
  "application/vnd.previewsystems.box": {
    source: "iana",
    extensions: [
      "box"
    ]
  },
  "application/vnd.proteus.magazine": {
    source: "iana",
    extensions: [
      "mgz"
    ]
  },
  "application/vnd.psfs": {
    source: "iana"
  },
  "application/vnd.publishare-delta-tree": {
    source: "iana",
    extensions: [
      "qps"
    ]
  },
  "application/vnd.pvi.ptid1": {
    source: "iana",
    extensions: [
      "ptid"
    ]
  },
  "application/vnd.pwg-multiplexed": {
    source: "iana"
  },
  "application/vnd.pwg-xhtml-print+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.qualcomm.brew-app-res": {
    source: "iana"
  },
  "application/vnd.quarantainenet": {
    source: "iana"
  },
  "application/vnd.quark.quarkxpress": {
    source: "iana",
    extensions: [
      "qxd",
      "qxt",
      "qwd",
      "qwt",
      "qxl",
      "qxb"
    ]
  },
  "application/vnd.quobject-quoxdocument": {
    source: "iana"
  },
  "application/vnd.radisys.moml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-conf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-conn+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-dialog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-stream+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-conf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-base+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-group+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-speech+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-transform+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.rainstor.data": {
    source: "iana"
  },
  "application/vnd.rapid": {
    source: "iana"
  },
  "application/vnd.rar": {
    source: "iana",
    extensions: [
      "rar"
    ]
  },
  "application/vnd.realvnc.bed": {
    source: "iana",
    extensions: [
      "bed"
    ]
  },
  "application/vnd.recordare.musicxml": {
    source: "iana",
    extensions: [
      "mxl"
    ]
  },
  "application/vnd.recordare.musicxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "musicxml"
    ]
  },
  "application/vnd.renlearn.rlprint": {
    source: "iana"
  },
  "application/vnd.resilient.logic": {
    source: "iana"
  },
  "application/vnd.restful+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.rig.cryptonote": {
    source: "iana",
    extensions: [
      "cryptonote"
    ]
  },
  "application/vnd.rim.cod": {
    source: "apache",
    extensions: [
      "cod"
    ]
  },
  "application/vnd.rn-realmedia": {
    source: "apache",
    extensions: [
      "rm"
    ]
  },
  "application/vnd.rn-realmedia-vbr": {
    source: "apache",
    extensions: [
      "rmvb"
    ]
  },
  "application/vnd.route66.link66+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "link66"
    ]
  },
  "application/vnd.rs-274x": {
    source: "iana"
  },
  "application/vnd.ruckus.download": {
    source: "iana"
  },
  "application/vnd.s3sms": {
    source: "iana"
  },
  "application/vnd.sailingtracker.track": {
    source: "iana",
    extensions: [
      "st"
    ]
  },
  "application/vnd.sar": {
    source: "iana"
  },
  "application/vnd.sbm.cid": {
    source: "iana"
  },
  "application/vnd.sbm.mid2": {
    source: "iana"
  },
  "application/vnd.scribus": {
    source: "iana"
  },
  "application/vnd.sealed.3df": {
    source: "iana"
  },
  "application/vnd.sealed.csf": {
    source: "iana"
  },
  "application/vnd.sealed.doc": {
    source: "iana"
  },
  "application/vnd.sealed.eml": {
    source: "iana"
  },
  "application/vnd.sealed.mht": {
    source: "iana"
  },
  "application/vnd.sealed.net": {
    source: "iana"
  },
  "application/vnd.sealed.ppt": {
    source: "iana"
  },
  "application/vnd.sealed.tiff": {
    source: "iana"
  },
  "application/vnd.sealed.xls": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.html": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.pdf": {
    source: "iana"
  },
  "application/vnd.seemail": {
    source: "iana",
    extensions: [
      "see"
    ]
  },
  "application/vnd.seis+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.sema": {
    source: "iana",
    extensions: [
      "sema"
    ]
  },
  "application/vnd.semd": {
    source: "iana",
    extensions: [
      "semd"
    ]
  },
  "application/vnd.semf": {
    source: "iana",
    extensions: [
      "semf"
    ]
  },
  "application/vnd.shade-save-file": {
    source: "iana"
  },
  "application/vnd.shana.informed.formdata": {
    source: "iana",
    extensions: [
      "ifm"
    ]
  },
  "application/vnd.shana.informed.formtemplate": {
    source: "iana",
    extensions: [
      "itp"
    ]
  },
  "application/vnd.shana.informed.interchange": {
    source: "iana",
    extensions: [
      "iif"
    ]
  },
  "application/vnd.shana.informed.package": {
    source: "iana",
    extensions: [
      "ipk"
    ]
  },
  "application/vnd.shootproof+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.shopkick+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.shp": {
    source: "iana"
  },
  "application/vnd.shx": {
    source: "iana"
  },
  "application/vnd.sigrok.session": {
    source: "iana"
  },
  "application/vnd.simtech-mindmapper": {
    source: "iana",
    extensions: [
      "twd",
      "twds"
    ]
  },
  "application/vnd.siren+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.smaf": {
    source: "iana",
    extensions: [
      "mmf"
    ]
  },
  "application/vnd.smart.notebook": {
    source: "iana"
  },
  "application/vnd.smart.teacher": {
    source: "iana",
    extensions: [
      "teacher"
    ]
  },
  "application/vnd.snesdev-page-table": {
    source: "iana"
  },
  "application/vnd.software602.filler.form+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "fo"
    ]
  },
  "application/vnd.software602.filler.form-xml-zip": {
    source: "iana"
  },
  "application/vnd.solent.sdkm+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sdkm",
      "sdkd"
    ]
  },
  "application/vnd.spotfire.dxp": {
    source: "iana",
    extensions: [
      "dxp"
    ]
  },
  "application/vnd.spotfire.sfs": {
    source: "iana",
    extensions: [
      "sfs"
    ]
  },
  "application/vnd.sqlite3": {
    source: "iana"
  },
  "application/vnd.sss-cod": {
    source: "iana"
  },
  "application/vnd.sss-dtf": {
    source: "iana"
  },
  "application/vnd.sss-ntf": {
    source: "iana"
  },
  "application/vnd.stardivision.calc": {
    source: "apache",
    extensions: [
      "sdc"
    ]
  },
  "application/vnd.stardivision.draw": {
    source: "apache",
    extensions: [
      "sda"
    ]
  },
  "application/vnd.stardivision.impress": {
    source: "apache",
    extensions: [
      "sdd"
    ]
  },
  "application/vnd.stardivision.math": {
    source: "apache",
    extensions: [
      "smf"
    ]
  },
  "application/vnd.stardivision.writer": {
    source: "apache",
    extensions: [
      "sdw",
      "vor"
    ]
  },
  "application/vnd.stardivision.writer-global": {
    source: "apache",
    extensions: [
      "sgl"
    ]
  },
  "application/vnd.stepmania.package": {
    source: "iana",
    extensions: [
      "smzip"
    ]
  },
  "application/vnd.stepmania.stepchart": {
    source: "iana",
    extensions: [
      "sm"
    ]
  },
  "application/vnd.street-stream": {
    source: "iana"
  },
  "application/vnd.sun.wadl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wadl"
    ]
  },
  "application/vnd.sun.xml.calc": {
    source: "apache",
    extensions: [
      "sxc"
    ]
  },
  "application/vnd.sun.xml.calc.template": {
    source: "apache",
    extensions: [
      "stc"
    ]
  },
  "application/vnd.sun.xml.draw": {
    source: "apache",
    extensions: [
      "sxd"
    ]
  },
  "application/vnd.sun.xml.draw.template": {
    source: "apache",
    extensions: [
      "std"
    ]
  },
  "application/vnd.sun.xml.impress": {
    source: "apache",
    extensions: [
      "sxi"
    ]
  },
  "application/vnd.sun.xml.impress.template": {
    source: "apache",
    extensions: [
      "sti"
    ]
  },
  "application/vnd.sun.xml.math": {
    source: "apache",
    extensions: [
      "sxm"
    ]
  },
  "application/vnd.sun.xml.writer": {
    source: "apache",
    extensions: [
      "sxw"
    ]
  },
  "application/vnd.sun.xml.writer.global": {
    source: "apache",
    extensions: [
      "sxg"
    ]
  },
  "application/vnd.sun.xml.writer.template": {
    source: "apache",
    extensions: [
      "stw"
    ]
  },
  "application/vnd.sus-calendar": {
    source: "iana",
    extensions: [
      "sus",
      "susp"
    ]
  },
  "application/vnd.svd": {
    source: "iana",
    extensions: [
      "svd"
    ]
  },
  "application/vnd.swiftview-ics": {
    source: "iana"
  },
  "application/vnd.sycle+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.syft+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.symbian.install": {
    source: "apache",
    extensions: [
      "sis",
      "sisx"
    ]
  },
  "application/vnd.syncml+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "xsm"
    ]
  },
  "application/vnd.syncml.dm+wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "bdm"
    ]
  },
  "application/vnd.syncml.dm+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "xdm"
    ]
  },
  "application/vnd.syncml.dm.notification": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "ddf"
    ]
  },
  "application/vnd.syncml.dmtnds+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmtnds+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.syncml.ds.notification": {
    source: "iana"
  },
  "application/vnd.tableschema+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tao.intent-module-archive": {
    source: "iana",
    extensions: [
      "tao"
    ]
  },
  "application/vnd.tcpdump.pcap": {
    source: "iana",
    extensions: [
      "pcap",
      "cap",
      "dmp"
    ]
  },
  "application/vnd.think-cell.ppttc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tmd.mediaflex.api+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tml": {
    source: "iana"
  },
  "application/vnd.tmobile-livetv": {
    source: "iana",
    extensions: [
      "tmo"
    ]
  },
  "application/vnd.tri.onesource": {
    source: "iana"
  },
  "application/vnd.trid.tpt": {
    source: "iana",
    extensions: [
      "tpt"
    ]
  },
  "application/vnd.triscape.mxs": {
    source: "iana",
    extensions: [
      "mxs"
    ]
  },
  "application/vnd.trueapp": {
    source: "iana",
    extensions: [
      "tra"
    ]
  },
  "application/vnd.truedoc": {
    source: "iana"
  },
  "application/vnd.ubisoft.webplayer": {
    source: "iana"
  },
  "application/vnd.ufdl": {
    source: "iana",
    extensions: [
      "ufd",
      "ufdl"
    ]
  },
  "application/vnd.uiq.theme": {
    source: "iana",
    extensions: [
      "utz"
    ]
  },
  "application/vnd.umajin": {
    source: "iana",
    extensions: [
      "umj"
    ]
  },
  "application/vnd.unity": {
    source: "iana",
    extensions: [
      "unityweb"
    ]
  },
  "application/vnd.uoml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uoml"
    ]
  },
  "application/vnd.uplanet.alert": {
    source: "iana"
  },
  "application/vnd.uplanet.alert-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.channel": {
    source: "iana"
  },
  "application/vnd.uplanet.channel-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.list": {
    source: "iana"
  },
  "application/vnd.uplanet.list-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.signal": {
    source: "iana"
  },
  "application/vnd.uri-map": {
    source: "iana"
  },
  "application/vnd.valve.source.material": {
    source: "iana"
  },
  "application/vnd.vcx": {
    source: "iana",
    extensions: [
      "vcx"
    ]
  },
  "application/vnd.vd-study": {
    source: "iana"
  },
  "application/vnd.vectorworks": {
    source: "iana"
  },
  "application/vnd.vel+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.verimatrix.vcas": {
    source: "iana"
  },
  "application/vnd.veritone.aion+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.veryant.thin": {
    source: "iana"
  },
  "application/vnd.ves.encrypted": {
    source: "iana"
  },
  "application/vnd.vidsoft.vidconference": {
    source: "iana"
  },
  "application/vnd.visio": {
    source: "iana",
    extensions: [
      "vsd",
      "vst",
      "vss",
      "vsw"
    ]
  },
  "application/vnd.visionary": {
    source: "iana",
    extensions: [
      "vis"
    ]
  },
  "application/vnd.vividence.scriptfile": {
    source: "iana"
  },
  "application/vnd.vsf": {
    source: "iana",
    extensions: [
      "vsf"
    ]
  },
  "application/vnd.wap.sic": {
    source: "iana"
  },
  "application/vnd.wap.slc": {
    source: "iana"
  },
  "application/vnd.wap.wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "wbxml"
    ]
  },
  "application/vnd.wap.wmlc": {
    source: "iana",
    extensions: [
      "wmlc"
    ]
  },
  "application/vnd.wap.wmlscriptc": {
    source: "iana",
    extensions: [
      "wmlsc"
    ]
  },
  "application/vnd.webturbo": {
    source: "iana",
    extensions: [
      "wtb"
    ]
  },
  "application/vnd.wfa.dpp": {
    source: "iana"
  },
  "application/vnd.wfa.p2p": {
    source: "iana"
  },
  "application/vnd.wfa.wsc": {
    source: "iana"
  },
  "application/vnd.windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.wmc": {
    source: "iana"
  },
  "application/vnd.wmf.bootstrap": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica.package": {
    source: "iana"
  },
  "application/vnd.wolfram.player": {
    source: "iana",
    extensions: [
      "nbp"
    ]
  },
  "application/vnd.wordperfect": {
    source: "iana",
    extensions: [
      "wpd"
    ]
  },
  "application/vnd.wqd": {
    source: "iana",
    extensions: [
      "wqd"
    ]
  },
  "application/vnd.wrq-hp3000-labelled": {
    source: "iana"
  },
  "application/vnd.wt.stf": {
    source: "iana",
    extensions: [
      "stf"
    ]
  },
  "application/vnd.wv.csp+wbxml": {
    source: "iana"
  },
  "application/vnd.wv.csp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.wv.ssp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xacml+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xara": {
    source: "iana",
    extensions: [
      "xar"
    ]
  },
  "application/vnd.xfdl": {
    source: "iana",
    extensions: [
      "xfdl"
    ]
  },
  "application/vnd.xfdl.webform": {
    source: "iana"
  },
  "application/vnd.xmi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xmpie.cpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.dpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.plan": {
    source: "iana"
  },
  "application/vnd.xmpie.ppkg": {
    source: "iana"
  },
  "application/vnd.xmpie.xlim": {
    source: "iana"
  },
  "application/vnd.yamaha.hv-dic": {
    source: "iana",
    extensions: [
      "hvd"
    ]
  },
  "application/vnd.yamaha.hv-script": {
    source: "iana",
    extensions: [
      "hvs"
    ]
  },
  "application/vnd.yamaha.hv-voice": {
    source: "iana",
    extensions: [
      "hvp"
    ]
  },
  "application/vnd.yamaha.openscoreformat": {
    source: "iana",
    extensions: [
      "osf"
    ]
  },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "osfpvg"
    ]
  },
  "application/vnd.yamaha.remote-setup": {
    source: "iana"
  },
  "application/vnd.yamaha.smaf-audio": {
    source: "iana",
    extensions: [
      "saf"
    ]
  },
  "application/vnd.yamaha.smaf-phrase": {
    source: "iana",
    extensions: [
      "spf"
    ]
  },
  "application/vnd.yamaha.through-ngn": {
    source: "iana"
  },
  "application/vnd.yamaha.tunnel-udpencap": {
    source: "iana"
  },
  "application/vnd.yaoweme": {
    source: "iana"
  },
  "application/vnd.yellowriver-custom-menu": {
    source: "iana",
    extensions: [
      "cmp"
    ]
  },
  "application/vnd.youtube.yt": {
    source: "iana"
  },
  "application/vnd.zul": {
    source: "iana",
    extensions: [
      "zir",
      "zirz"
    ]
  },
  "application/vnd.zzazz.deck+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "zaz"
    ]
  },
  "application/voicexml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "vxml"
    ]
  },
  "application/voucher-cms+json": {
    source: "iana",
    compressible: !0
  },
  "application/vq-rtcpxr": {
    source: "iana"
  },
  "application/wasm": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wasm"
    ]
  },
  "application/watcherinfo+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wif"
    ]
  },
  "application/webpush-options+json": {
    source: "iana",
    compressible: !0
  },
  "application/whoispp-query": {
    source: "iana"
  },
  "application/whoispp-response": {
    source: "iana"
  },
  "application/widget": {
    source: "iana",
    extensions: [
      "wgt"
    ]
  },
  "application/winhlp": {
    source: "apache",
    extensions: [
      "hlp"
    ]
  },
  "application/wita": {
    source: "iana"
  },
  "application/wordperfect5.1": {
    source: "iana"
  },
  "application/wsdl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wsdl"
    ]
  },
  "application/wspolicy+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wspolicy"
    ]
  },
  "application/x-7z-compressed": {
    source: "apache",
    compressible: !1,
    extensions: [
      "7z"
    ]
  },
  "application/x-abiword": {
    source: "apache",
    extensions: [
      "abw"
    ]
  },
  "application/x-ace-compressed": {
    source: "apache",
    extensions: [
      "ace"
    ]
  },
  "application/x-amf": {
    source: "apache"
  },
  "application/x-apple-diskimage": {
    source: "apache",
    extensions: [
      "dmg"
    ]
  },
  "application/x-arj": {
    compressible: !1,
    extensions: [
      "arj"
    ]
  },
  "application/x-authorware-bin": {
    source: "apache",
    extensions: [
      "aab",
      "x32",
      "u32",
      "vox"
    ]
  },
  "application/x-authorware-map": {
    source: "apache",
    extensions: [
      "aam"
    ]
  },
  "application/x-authorware-seg": {
    source: "apache",
    extensions: [
      "aas"
    ]
  },
  "application/x-bcpio": {
    source: "apache",
    extensions: [
      "bcpio"
    ]
  },
  "application/x-bdoc": {
    compressible: !1,
    extensions: [
      "bdoc"
    ]
  },
  "application/x-bittorrent": {
    source: "apache",
    extensions: [
      "torrent"
    ]
  },
  "application/x-blorb": {
    source: "apache",
    extensions: [
      "blb",
      "blorb"
    ]
  },
  "application/x-bzip": {
    source: "apache",
    compressible: !1,
    extensions: [
      "bz"
    ]
  },
  "application/x-bzip2": {
    source: "apache",
    compressible: !1,
    extensions: [
      "bz2",
      "boz"
    ]
  },
  "application/x-cbr": {
    source: "apache",
    extensions: [
      "cbr",
      "cba",
      "cbt",
      "cbz",
      "cb7"
    ]
  },
  "application/x-cdlink": {
    source: "apache",
    extensions: [
      "vcd"
    ]
  },
  "application/x-cfs-compressed": {
    source: "apache",
    extensions: [
      "cfs"
    ]
  },
  "application/x-chat": {
    source: "apache",
    extensions: [
      "chat"
    ]
  },
  "application/x-chess-pgn": {
    source: "apache",
    extensions: [
      "pgn"
    ]
  },
  "application/x-chrome-extension": {
    extensions: [
      "crx"
    ]
  },
  "application/x-cocoa": {
    source: "nginx",
    extensions: [
      "cco"
    ]
  },
  "application/x-compress": {
    source: "apache"
  },
  "application/x-conference": {
    source: "apache",
    extensions: [
      "nsc"
    ]
  },
  "application/x-cpio": {
    source: "apache",
    extensions: [
      "cpio"
    ]
  },
  "application/x-csh": {
    source: "apache",
    extensions: [
      "csh"
    ]
  },
  "application/x-deb": {
    compressible: !1
  },
  "application/x-debian-package": {
    source: "apache",
    extensions: [
      "deb",
      "udeb"
    ]
  },
  "application/x-dgc-compressed": {
    source: "apache",
    extensions: [
      "dgc"
    ]
  },
  "application/x-director": {
    source: "apache",
    extensions: [
      "dir",
      "dcr",
      "dxr",
      "cst",
      "cct",
      "cxt",
      "w3d",
      "fgd",
      "swa"
    ]
  },
  "application/x-doom": {
    source: "apache",
    extensions: [
      "wad"
    ]
  },
  "application/x-dtbncx+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ncx"
    ]
  },
  "application/x-dtbook+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "dtb"
    ]
  },
  "application/x-dtbresource+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "res"
    ]
  },
  "application/x-dvi": {
    source: "apache",
    compressible: !1,
    extensions: [
      "dvi"
    ]
  },
  "application/x-envoy": {
    source: "apache",
    extensions: [
      "evy"
    ]
  },
  "application/x-eva": {
    source: "apache",
    extensions: [
      "eva"
    ]
  },
  "application/x-font-bdf": {
    source: "apache",
    extensions: [
      "bdf"
    ]
  },
  "application/x-font-dos": {
    source: "apache"
  },
  "application/x-font-framemaker": {
    source: "apache"
  },
  "application/x-font-ghostscript": {
    source: "apache",
    extensions: [
      "gsf"
    ]
  },
  "application/x-font-libgrx": {
    source: "apache"
  },
  "application/x-font-linux-psf": {
    source: "apache",
    extensions: [
      "psf"
    ]
  },
  "application/x-font-pcf": {
    source: "apache",
    extensions: [
      "pcf"
    ]
  },
  "application/x-font-snf": {
    source: "apache",
    extensions: [
      "snf"
    ]
  },
  "application/x-font-speedo": {
    source: "apache"
  },
  "application/x-font-sunos-news": {
    source: "apache"
  },
  "application/x-font-type1": {
    source: "apache",
    extensions: [
      "pfa",
      "pfb",
      "pfm",
      "afm"
    ]
  },
  "application/x-font-vfont": {
    source: "apache"
  },
  "application/x-freearc": {
    source: "apache",
    extensions: [
      "arc"
    ]
  },
  "application/x-futuresplash": {
    source: "apache",
    extensions: [
      "spl"
    ]
  },
  "application/x-gca-compressed": {
    source: "apache",
    extensions: [
      "gca"
    ]
  },
  "application/x-glulx": {
    source: "apache",
    extensions: [
      "ulx"
    ]
  },
  "application/x-gnumeric": {
    source: "apache",
    extensions: [
      "gnumeric"
    ]
  },
  "application/x-gramps-xml": {
    source: "apache",
    extensions: [
      "gramps"
    ]
  },
  "application/x-gtar": {
    source: "apache",
    extensions: [
      "gtar"
    ]
  },
  "application/x-gzip": {
    source: "apache"
  },
  "application/x-hdf": {
    source: "apache",
    extensions: [
      "hdf"
    ]
  },
  "application/x-httpd-php": {
    compressible: !0,
    extensions: [
      "php"
    ]
  },
  "application/x-install-instructions": {
    source: "apache",
    extensions: [
      "install"
    ]
  },
  "application/x-iso9660-image": {
    source: "apache",
    extensions: [
      "iso"
    ]
  },
  "application/x-iwork-keynote-sffkey": {
    extensions: [
      "key"
    ]
  },
  "application/x-iwork-numbers-sffnumbers": {
    extensions: [
      "numbers"
    ]
  },
  "application/x-iwork-pages-sffpages": {
    extensions: [
      "pages"
    ]
  },
  "application/x-java-archive-diff": {
    source: "nginx",
    extensions: [
      "jardiff"
    ]
  },
  "application/x-java-jnlp-file": {
    source: "apache",
    compressible: !1,
    extensions: [
      "jnlp"
    ]
  },
  "application/x-javascript": {
    compressible: !0
  },
  "application/x-keepass2": {
    extensions: [
      "kdbx"
    ]
  },
  "application/x-latex": {
    source: "apache",
    compressible: !1,
    extensions: [
      "latex"
    ]
  },
  "application/x-lua-bytecode": {
    extensions: [
      "luac"
    ]
  },
  "application/x-lzh-compressed": {
    source: "apache",
    extensions: [
      "lzh",
      "lha"
    ]
  },
  "application/x-makeself": {
    source: "nginx",
    extensions: [
      "run"
    ]
  },
  "application/x-mie": {
    source: "apache",
    extensions: [
      "mie"
    ]
  },
  "application/x-mobipocket-ebook": {
    source: "apache",
    extensions: [
      "prc",
      "mobi"
    ]
  },
  "application/x-mpegurl": {
    compressible: !1
  },
  "application/x-ms-application": {
    source: "apache",
    extensions: [
      "application"
    ]
  },
  "application/x-ms-shortcut": {
    source: "apache",
    extensions: [
      "lnk"
    ]
  },
  "application/x-ms-wmd": {
    source: "apache",
    extensions: [
      "wmd"
    ]
  },
  "application/x-ms-wmz": {
    source: "apache",
    extensions: [
      "wmz"
    ]
  },
  "application/x-ms-xbap": {
    source: "apache",
    extensions: [
      "xbap"
    ]
  },
  "application/x-msaccess": {
    source: "apache",
    extensions: [
      "mdb"
    ]
  },
  "application/x-msbinder": {
    source: "apache",
    extensions: [
      "obd"
    ]
  },
  "application/x-mscardfile": {
    source: "apache",
    extensions: [
      "crd"
    ]
  },
  "application/x-msclip": {
    source: "apache",
    extensions: [
      "clp"
    ]
  },
  "application/x-msdos-program": {
    extensions: [
      "exe"
    ]
  },
  "application/x-msdownload": {
    source: "apache",
    extensions: [
      "exe",
      "dll",
      "com",
      "bat",
      "msi"
    ]
  },
  "application/x-msmediaview": {
    source: "apache",
    extensions: [
      "mvb",
      "m13",
      "m14"
    ]
  },
  "application/x-msmetafile": {
    source: "apache",
    extensions: [
      "wmf",
      "wmz",
      "emf",
      "emz"
    ]
  },
  "application/x-msmoney": {
    source: "apache",
    extensions: [
      "mny"
    ]
  },
  "application/x-mspublisher": {
    source: "apache",
    extensions: [
      "pub"
    ]
  },
  "application/x-msschedule": {
    source: "apache",
    extensions: [
      "scd"
    ]
  },
  "application/x-msterminal": {
    source: "apache",
    extensions: [
      "trm"
    ]
  },
  "application/x-mswrite": {
    source: "apache",
    extensions: [
      "wri"
    ]
  },
  "application/x-netcdf": {
    source: "apache",
    extensions: [
      "nc",
      "cdf"
    ]
  },
  "application/x-ns-proxy-autoconfig": {
    compressible: !0,
    extensions: [
      "pac"
    ]
  },
  "application/x-nzb": {
    source: "apache",
    extensions: [
      "nzb"
    ]
  },
  "application/x-perl": {
    source: "nginx",
    extensions: [
      "pl",
      "pm"
    ]
  },
  "application/x-pilot": {
    source: "nginx",
    extensions: [
      "prc",
      "pdb"
    ]
  },
  "application/x-pkcs12": {
    source: "apache",
    compressible: !1,
    extensions: [
      "p12",
      "pfx"
    ]
  },
  "application/x-pkcs7-certificates": {
    source: "apache",
    extensions: [
      "p7b",
      "spc"
    ]
  },
  "application/x-pkcs7-certreqresp": {
    source: "apache",
    extensions: [
      "p7r"
    ]
  },
  "application/x-pki-message": {
    source: "iana"
  },
  "application/x-rar-compressed": {
    source: "apache",
    compressible: !1,
    extensions: [
      "rar"
    ]
  },
  "application/x-redhat-package-manager": {
    source: "nginx",
    extensions: [
      "rpm"
    ]
  },
  "application/x-research-info-systems": {
    source: "apache",
    extensions: [
      "ris"
    ]
  },
  "application/x-sea": {
    source: "nginx",
    extensions: [
      "sea"
    ]
  },
  "application/x-sh": {
    source: "apache",
    compressible: !0,
    extensions: [
      "sh"
    ]
  },
  "application/x-shar": {
    source: "apache",
    extensions: [
      "shar"
    ]
  },
  "application/x-shockwave-flash": {
    source: "apache",
    compressible: !1,
    extensions: [
      "swf"
    ]
  },
  "application/x-silverlight-app": {
    source: "apache",
    extensions: [
      "xap"
    ]
  },
  "application/x-sql": {
    source: "apache",
    extensions: [
      "sql"
    ]
  },
  "application/x-stuffit": {
    source: "apache",
    compressible: !1,
    extensions: [
      "sit"
    ]
  },
  "application/x-stuffitx": {
    source: "apache",
    extensions: [
      "sitx"
    ]
  },
  "application/x-subrip": {
    source: "apache",
    extensions: [
      "srt"
    ]
  },
  "application/x-sv4cpio": {
    source: "apache",
    extensions: [
      "sv4cpio"
    ]
  },
  "application/x-sv4crc": {
    source: "apache",
    extensions: [
      "sv4crc"
    ]
  },
  "application/x-t3vm-image": {
    source: "apache",
    extensions: [
      "t3"
    ]
  },
  "application/x-tads": {
    source: "apache",
    extensions: [
      "gam"
    ]
  },
  "application/x-tar": {
    source: "apache",
    compressible: !0,
    extensions: [
      "tar"
    ]
  },
  "application/x-tcl": {
    source: "apache",
    extensions: [
      "tcl",
      "tk"
    ]
  },
  "application/x-tex": {
    source: "apache",
    extensions: [
      "tex"
    ]
  },
  "application/x-tex-tfm": {
    source: "apache",
    extensions: [
      "tfm"
    ]
  },
  "application/x-texinfo": {
    source: "apache",
    extensions: [
      "texinfo",
      "texi"
    ]
  },
  "application/x-tgif": {
    source: "apache",
    extensions: [
      "obj"
    ]
  },
  "application/x-ustar": {
    source: "apache",
    extensions: [
      "ustar"
    ]
  },
  "application/x-virtualbox-hdd": {
    compressible: !0,
    extensions: [
      "hdd"
    ]
  },
  "application/x-virtualbox-ova": {
    compressible: !0,
    extensions: [
      "ova"
    ]
  },
  "application/x-virtualbox-ovf": {
    compressible: !0,
    extensions: [
      "ovf"
    ]
  },
  "application/x-virtualbox-vbox": {
    compressible: !0,
    extensions: [
      "vbox"
    ]
  },
  "application/x-virtualbox-vbox-extpack": {
    compressible: !1,
    extensions: [
      "vbox-extpack"
    ]
  },
  "application/x-virtualbox-vdi": {
    compressible: !0,
    extensions: [
      "vdi"
    ]
  },
  "application/x-virtualbox-vhd": {
    compressible: !0,
    extensions: [
      "vhd"
    ]
  },
  "application/x-virtualbox-vmdk": {
    compressible: !0,
    extensions: [
      "vmdk"
    ]
  },
  "application/x-wais-source": {
    source: "apache",
    extensions: [
      "src"
    ]
  },
  "application/x-web-app-manifest+json": {
    compressible: !0,
    extensions: [
      "webapp"
    ]
  },
  "application/x-www-form-urlencoded": {
    source: "iana",
    compressible: !0
  },
  "application/x-x509-ca-cert": {
    source: "iana",
    extensions: [
      "der",
      "crt",
      "pem"
    ]
  },
  "application/x-x509-ca-ra-cert": {
    source: "iana"
  },
  "application/x-x509-next-ca-cert": {
    source: "iana"
  },
  "application/x-xfig": {
    source: "apache",
    extensions: [
      "fig"
    ]
  },
  "application/x-xliff+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xlf"
    ]
  },
  "application/x-xpinstall": {
    source: "apache",
    compressible: !1,
    extensions: [
      "xpi"
    ]
  },
  "application/x-xz": {
    source: "apache",
    extensions: [
      "xz"
    ]
  },
  "application/x-zmachine": {
    source: "apache",
    extensions: [
      "z1",
      "z2",
      "z3",
      "z4",
      "z5",
      "z6",
      "z7",
      "z8"
    ]
  },
  "application/x400-bp": {
    source: "iana"
  },
  "application/xacml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xaml+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xaml"
    ]
  },
  "application/xcap-att+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xav"
    ]
  },
  "application/xcap-caps+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xca"
    ]
  },
  "application/xcap-diff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdf"
    ]
  },
  "application/xcap-el+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xel"
    ]
  },
  "application/xcap-error+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xcap-ns+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xns"
    ]
  },
  "application/xcon-conference-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xcon-conference-info-diff+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xenc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xenc"
    ]
  },
  "application/xhtml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xhtml",
      "xht"
    ]
  },
  "application/xhtml-voice+xml": {
    source: "apache",
    compressible: !0
  },
  "application/xliff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xlf"
    ]
  },
  "application/xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xml",
      "xsl",
      "xsd",
      "rng"
    ]
  },
  "application/xml-dtd": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dtd"
    ]
  },
  "application/xml-external-parsed-entity": {
    source: "iana"
  },
  "application/xml-patch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xmpp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xop+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xop"
    ]
  },
  "application/xproc+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xpl"
    ]
  },
  "application/xslt+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xsl",
      "xslt"
    ]
  },
  "application/xspf+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xspf"
    ]
  },
  "application/xv+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mxml",
      "xhvml",
      "xvml",
      "xvm"
    ]
  },
  "application/yang": {
    source: "iana",
    extensions: [
      "yang"
    ]
  },
  "application/yang-data+json": {
    source: "iana",
    compressible: !0
  },
  "application/yang-data+xml": {
    source: "iana",
    compressible: !0
  },
  "application/yang-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/yang-patch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/yin+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "yin"
    ]
  },
  "application/zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "zip"
    ]
  },
  "application/zlib": {
    source: "iana"
  },
  "application/zstd": {
    source: "iana"
  },
  "audio/1d-interleaved-parityfec": {
    source: "iana"
  },
  "audio/32kadpcm": {
    source: "iana"
  },
  "audio/3gpp": {
    source: "iana",
    compressible: !1,
    extensions: [
      "3gpp"
    ]
  },
  "audio/3gpp2": {
    source: "iana"
  },
  "audio/aac": {
    source: "iana"
  },
  "audio/ac3": {
    source: "iana"
  },
  "audio/adpcm": {
    source: "apache",
    extensions: [
      "adp"
    ]
  },
  "audio/amr": {
    source: "iana",
    extensions: [
      "amr"
    ]
  },
  "audio/amr-wb": {
    source: "iana"
  },
  "audio/amr-wb+": {
    source: "iana"
  },
  "audio/aptx": {
    source: "iana"
  },
  "audio/asc": {
    source: "iana"
  },
  "audio/atrac-advanced-lossless": {
    source: "iana"
  },
  "audio/atrac-x": {
    source: "iana"
  },
  "audio/atrac3": {
    source: "iana"
  },
  "audio/basic": {
    source: "iana",
    compressible: !1,
    extensions: [
      "au",
      "snd"
    ]
  },
  "audio/bv16": {
    source: "iana"
  },
  "audio/bv32": {
    source: "iana"
  },
  "audio/clearmode": {
    source: "iana"
  },
  "audio/cn": {
    source: "iana"
  },
  "audio/dat12": {
    source: "iana"
  },
  "audio/dls": {
    source: "iana"
  },
  "audio/dsr-es201108": {
    source: "iana"
  },
  "audio/dsr-es202050": {
    source: "iana"
  },
  "audio/dsr-es202211": {
    source: "iana"
  },
  "audio/dsr-es202212": {
    source: "iana"
  },
  "audio/dv": {
    source: "iana"
  },
  "audio/dvi4": {
    source: "iana"
  },
  "audio/eac3": {
    source: "iana"
  },
  "audio/encaprtp": {
    source: "iana"
  },
  "audio/evrc": {
    source: "iana"
  },
  "audio/evrc-qcp": {
    source: "iana"
  },
  "audio/evrc0": {
    source: "iana"
  },
  "audio/evrc1": {
    source: "iana"
  },
  "audio/evrcb": {
    source: "iana"
  },
  "audio/evrcb0": {
    source: "iana"
  },
  "audio/evrcb1": {
    source: "iana"
  },
  "audio/evrcnw": {
    source: "iana"
  },
  "audio/evrcnw0": {
    source: "iana"
  },
  "audio/evrcnw1": {
    source: "iana"
  },
  "audio/evrcwb": {
    source: "iana"
  },
  "audio/evrcwb0": {
    source: "iana"
  },
  "audio/evrcwb1": {
    source: "iana"
  },
  "audio/evs": {
    source: "iana"
  },
  "audio/flexfec": {
    source: "iana"
  },
  "audio/fwdred": {
    source: "iana"
  },
  "audio/g711-0": {
    source: "iana"
  },
  "audio/g719": {
    source: "iana"
  },
  "audio/g722": {
    source: "iana"
  },
  "audio/g7221": {
    source: "iana"
  },
  "audio/g723": {
    source: "iana"
  },
  "audio/g726-16": {
    source: "iana"
  },
  "audio/g726-24": {
    source: "iana"
  },
  "audio/g726-32": {
    source: "iana"
  },
  "audio/g726-40": {
    source: "iana"
  },
  "audio/g728": {
    source: "iana"
  },
  "audio/g729": {
    source: "iana"
  },
  "audio/g7291": {
    source: "iana"
  },
  "audio/g729d": {
    source: "iana"
  },
  "audio/g729e": {
    source: "iana"
  },
  "audio/gsm": {
    source: "iana"
  },
  "audio/gsm-efr": {
    source: "iana"
  },
  "audio/gsm-hr-08": {
    source: "iana"
  },
  "audio/ilbc": {
    source: "iana"
  },
  "audio/ip-mr_v2.5": {
    source: "iana"
  },
  "audio/isac": {
    source: "apache"
  },
  "audio/l16": {
    source: "iana"
  },
  "audio/l20": {
    source: "iana"
  },
  "audio/l24": {
    source: "iana",
    compressible: !1
  },
  "audio/l8": {
    source: "iana"
  },
  "audio/lpc": {
    source: "iana"
  },
  "audio/melp": {
    source: "iana"
  },
  "audio/melp1200": {
    source: "iana"
  },
  "audio/melp2400": {
    source: "iana"
  },
  "audio/melp600": {
    source: "iana"
  },
  "audio/mhas": {
    source: "iana"
  },
  "audio/midi": {
    source: "apache",
    extensions: [
      "mid",
      "midi",
      "kar",
      "rmi"
    ]
  },
  "audio/mobile-xmf": {
    source: "iana",
    extensions: [
      "mxmf"
    ]
  },
  "audio/mp3": {
    compressible: !1,
    extensions: [
      "mp3"
    ]
  },
  "audio/mp4": {
    source: "iana",
    compressible: !1,
    extensions: [
      "m4a",
      "mp4a"
    ]
  },
  "audio/mp4a-latm": {
    source: "iana"
  },
  "audio/mpa": {
    source: "iana"
  },
  "audio/mpa-robust": {
    source: "iana"
  },
  "audio/mpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mpga",
      "mp2",
      "mp2a",
      "mp3",
      "m2a",
      "m3a"
    ]
  },
  "audio/mpeg4-generic": {
    source: "iana"
  },
  "audio/musepack": {
    source: "apache"
  },
  "audio/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "oga",
      "ogg",
      "spx",
      "opus"
    ]
  },
  "audio/opus": {
    source: "iana"
  },
  "audio/parityfec": {
    source: "iana"
  },
  "audio/pcma": {
    source: "iana"
  },
  "audio/pcma-wb": {
    source: "iana"
  },
  "audio/pcmu": {
    source: "iana"
  },
  "audio/pcmu-wb": {
    source: "iana"
  },
  "audio/prs.sid": {
    source: "iana"
  },
  "audio/qcelp": {
    source: "iana"
  },
  "audio/raptorfec": {
    source: "iana"
  },
  "audio/red": {
    source: "iana"
  },
  "audio/rtp-enc-aescm128": {
    source: "iana"
  },
  "audio/rtp-midi": {
    source: "iana"
  },
  "audio/rtploopback": {
    source: "iana"
  },
  "audio/rtx": {
    source: "iana"
  },
  "audio/s3m": {
    source: "apache",
    extensions: [
      "s3m"
    ]
  },
  "audio/scip": {
    source: "iana"
  },
  "audio/silk": {
    source: "apache",
    extensions: [
      "sil"
    ]
  },
  "audio/smv": {
    source: "iana"
  },
  "audio/smv-qcp": {
    source: "iana"
  },
  "audio/smv0": {
    source: "iana"
  },
  "audio/sofa": {
    source: "iana"
  },
  "audio/sp-midi": {
    source: "iana"
  },
  "audio/speex": {
    source: "iana"
  },
  "audio/t140c": {
    source: "iana"
  },
  "audio/t38": {
    source: "iana"
  },
  "audio/telephone-event": {
    source: "iana"
  },
  "audio/tetra_acelp": {
    source: "iana"
  },
  "audio/tetra_acelp_bb": {
    source: "iana"
  },
  "audio/tone": {
    source: "iana"
  },
  "audio/tsvcis": {
    source: "iana"
  },
  "audio/uemclip": {
    source: "iana"
  },
  "audio/ulpfec": {
    source: "iana"
  },
  "audio/usac": {
    source: "iana"
  },
  "audio/vdvi": {
    source: "iana"
  },
  "audio/vmr-wb": {
    source: "iana"
  },
  "audio/vnd.3gpp.iufp": {
    source: "iana"
  },
  "audio/vnd.4sb": {
    source: "iana"
  },
  "audio/vnd.audiokoz": {
    source: "iana"
  },
  "audio/vnd.celp": {
    source: "iana"
  },
  "audio/vnd.cisco.nse": {
    source: "iana"
  },
  "audio/vnd.cmles.radio-events": {
    source: "iana"
  },
  "audio/vnd.cns.anp1": {
    source: "iana"
  },
  "audio/vnd.cns.inf1": {
    source: "iana"
  },
  "audio/vnd.dece.audio": {
    source: "iana",
    extensions: [
      "uva",
      "uvva"
    ]
  },
  "audio/vnd.digital-winds": {
    source: "iana",
    extensions: [
      "eol"
    ]
  },
  "audio/vnd.dlna.adts": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.1": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.2": {
    source: "iana"
  },
  "audio/vnd.dolby.mlp": {
    source: "iana"
  },
  "audio/vnd.dolby.mps": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2x": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2z": {
    source: "iana"
  },
  "audio/vnd.dolby.pulse.1": {
    source: "iana"
  },
  "audio/vnd.dra": {
    source: "iana",
    extensions: [
      "dra"
    ]
  },
  "audio/vnd.dts": {
    source: "iana",
    extensions: [
      "dts"
    ]
  },
  "audio/vnd.dts.hd": {
    source: "iana",
    extensions: [
      "dtshd"
    ]
  },
  "audio/vnd.dts.uhd": {
    source: "iana"
  },
  "audio/vnd.dvb.file": {
    source: "iana"
  },
  "audio/vnd.everad.plj": {
    source: "iana"
  },
  "audio/vnd.hns.audio": {
    source: "iana"
  },
  "audio/vnd.lucent.voice": {
    source: "iana",
    extensions: [
      "lvp"
    ]
  },
  "audio/vnd.ms-playready.media.pya": {
    source: "iana",
    extensions: [
      "pya"
    ]
  },
  "audio/vnd.nokia.mobile-xmf": {
    source: "iana"
  },
  "audio/vnd.nortel.vbk": {
    source: "iana"
  },
  "audio/vnd.nuera.ecelp4800": {
    source: "iana",
    extensions: [
      "ecelp4800"
    ]
  },
  "audio/vnd.nuera.ecelp7470": {
    source: "iana",
    extensions: [
      "ecelp7470"
    ]
  },
  "audio/vnd.nuera.ecelp9600": {
    source: "iana",
    extensions: [
      "ecelp9600"
    ]
  },
  "audio/vnd.octel.sbc": {
    source: "iana"
  },
  "audio/vnd.presonus.multitrack": {
    source: "iana"
  },
  "audio/vnd.qcelp": {
    source: "iana"
  },
  "audio/vnd.rhetorex.32kadpcm": {
    source: "iana"
  },
  "audio/vnd.rip": {
    source: "iana",
    extensions: [
      "rip"
    ]
  },
  "audio/vnd.rn-realaudio": {
    compressible: !1
  },
  "audio/vnd.sealedmedia.softseal.mpeg": {
    source: "iana"
  },
  "audio/vnd.vmx.cvsd": {
    source: "iana"
  },
  "audio/vnd.wave": {
    compressible: !1
  },
  "audio/vorbis": {
    source: "iana",
    compressible: !1
  },
  "audio/vorbis-config": {
    source: "iana"
  },
  "audio/wav": {
    compressible: !1,
    extensions: [
      "wav"
    ]
  },
  "audio/wave": {
    compressible: !1,
    extensions: [
      "wav"
    ]
  },
  "audio/webm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "weba"
    ]
  },
  "audio/x-aac": {
    source: "apache",
    compressible: !1,
    extensions: [
      "aac"
    ]
  },
  "audio/x-aiff": {
    source: "apache",
    extensions: [
      "aif",
      "aiff",
      "aifc"
    ]
  },
  "audio/x-caf": {
    source: "apache",
    compressible: !1,
    extensions: [
      "caf"
    ]
  },
  "audio/x-flac": {
    source: "apache",
    extensions: [
      "flac"
    ]
  },
  "audio/x-m4a": {
    source: "nginx",
    extensions: [
      "m4a"
    ]
  },
  "audio/x-matroska": {
    source: "apache",
    extensions: [
      "mka"
    ]
  },
  "audio/x-mpegurl": {
    source: "apache",
    extensions: [
      "m3u"
    ]
  },
  "audio/x-ms-wax": {
    source: "apache",
    extensions: [
      "wax"
    ]
  },
  "audio/x-ms-wma": {
    source: "apache",
    extensions: [
      "wma"
    ]
  },
  "audio/x-pn-realaudio": {
    source: "apache",
    extensions: [
      "ram",
      "ra"
    ]
  },
  "audio/x-pn-realaudio-plugin": {
    source: "apache",
    extensions: [
      "rmp"
    ]
  },
  "audio/x-realaudio": {
    source: "nginx",
    extensions: [
      "ra"
    ]
  },
  "audio/x-tta": {
    source: "apache"
  },
  "audio/x-wav": {
    source: "apache",
    extensions: [
      "wav"
    ]
  },
  "audio/xm": {
    source: "apache",
    extensions: [
      "xm"
    ]
  },
  "chemical/x-cdx": {
    source: "apache",
    extensions: [
      "cdx"
    ]
  },
  "chemical/x-cif": {
    source: "apache",
    extensions: [
      "cif"
    ]
  },
  "chemical/x-cmdf": {
    source: "apache",
    extensions: [
      "cmdf"
    ]
  },
  "chemical/x-cml": {
    source: "apache",
    extensions: [
      "cml"
    ]
  },
  "chemical/x-csml": {
    source: "apache",
    extensions: [
      "csml"
    ]
  },
  "chemical/x-pdb": {
    source: "apache"
  },
  "chemical/x-xyz": {
    source: "apache",
    extensions: [
      "xyz"
    ]
  },
  "font/collection": {
    source: "iana",
    extensions: [
      "ttc"
    ]
  },
  "font/otf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "otf"
    ]
  },
  "font/sfnt": {
    source: "iana"
  },
  "font/ttf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ttf"
    ]
  },
  "font/woff": {
    source: "iana",
    extensions: [
      "woff"
    ]
  },
  "font/woff2": {
    source: "iana",
    extensions: [
      "woff2"
    ]
  },
  "image/aces": {
    source: "iana",
    extensions: [
      "exr"
    ]
  },
  "image/apng": {
    compressible: !1,
    extensions: [
      "apng"
    ]
  },
  "image/avci": {
    source: "iana",
    extensions: [
      "avci"
    ]
  },
  "image/avcs": {
    source: "iana",
    extensions: [
      "avcs"
    ]
  },
  "image/avif": {
    source: "iana",
    compressible: !1,
    extensions: [
      "avif"
    ]
  },
  "image/bmp": {
    source: "iana",
    compressible: !0,
    extensions: [
      "bmp"
    ]
  },
  "image/cgm": {
    source: "iana",
    extensions: [
      "cgm"
    ]
  },
  "image/dicom-rle": {
    source: "iana",
    extensions: [
      "drle"
    ]
  },
  "image/emf": {
    source: "iana",
    extensions: [
      "emf"
    ]
  },
  "image/fits": {
    source: "iana",
    extensions: [
      "fits"
    ]
  },
  "image/g3fax": {
    source: "iana",
    extensions: [
      "g3"
    ]
  },
  "image/gif": {
    source: "iana",
    compressible: !1,
    extensions: [
      "gif"
    ]
  },
  "image/heic": {
    source: "iana",
    extensions: [
      "heic"
    ]
  },
  "image/heic-sequence": {
    source: "iana",
    extensions: [
      "heics"
    ]
  },
  "image/heif": {
    source: "iana",
    extensions: [
      "heif"
    ]
  },
  "image/heif-sequence": {
    source: "iana",
    extensions: [
      "heifs"
    ]
  },
  "image/hej2k": {
    source: "iana",
    extensions: [
      "hej2"
    ]
  },
  "image/hsj2": {
    source: "iana",
    extensions: [
      "hsj2"
    ]
  },
  "image/ief": {
    source: "iana",
    extensions: [
      "ief"
    ]
  },
  "image/jls": {
    source: "iana",
    extensions: [
      "jls"
    ]
  },
  "image/jp2": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jp2",
      "jpg2"
    ]
  },
  "image/jpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpeg",
      "jpg",
      "jpe"
    ]
  },
  "image/jph": {
    source: "iana",
    extensions: [
      "jph"
    ]
  },
  "image/jphc": {
    source: "iana",
    extensions: [
      "jhc"
    ]
  },
  "image/jpm": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpm"
    ]
  },
  "image/jpx": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpx",
      "jpf"
    ]
  },
  "image/jxr": {
    source: "iana",
    extensions: [
      "jxr"
    ]
  },
  "image/jxra": {
    source: "iana",
    extensions: [
      "jxra"
    ]
  },
  "image/jxrs": {
    source: "iana",
    extensions: [
      "jxrs"
    ]
  },
  "image/jxs": {
    source: "iana",
    extensions: [
      "jxs"
    ]
  },
  "image/jxsc": {
    source: "iana",
    extensions: [
      "jxsc"
    ]
  },
  "image/jxsi": {
    source: "iana",
    extensions: [
      "jxsi"
    ]
  },
  "image/jxss": {
    source: "iana",
    extensions: [
      "jxss"
    ]
  },
  "image/ktx": {
    source: "iana",
    extensions: [
      "ktx"
    ]
  },
  "image/ktx2": {
    source: "iana",
    extensions: [
      "ktx2"
    ]
  },
  "image/naplps": {
    source: "iana"
  },
  "image/pjpeg": {
    compressible: !1
  },
  "image/png": {
    source: "iana",
    compressible: !1,
    extensions: [
      "png"
    ]
  },
  "image/prs.btif": {
    source: "iana",
    extensions: [
      "btif"
    ]
  },
  "image/prs.pti": {
    source: "iana",
    extensions: [
      "pti"
    ]
  },
  "image/pwg-raster": {
    source: "iana"
  },
  "image/sgi": {
    source: "apache",
    extensions: [
      "sgi"
    ]
  },
  "image/svg+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "svg",
      "svgz"
    ]
  },
  "image/t38": {
    source: "iana",
    extensions: [
      "t38"
    ]
  },
  "image/tiff": {
    source: "iana",
    compressible: !1,
    extensions: [
      "tif",
      "tiff"
    ]
  },
  "image/tiff-fx": {
    source: "iana",
    extensions: [
      "tfx"
    ]
  },
  "image/vnd.adobe.photoshop": {
    source: "iana",
    compressible: !0,
    extensions: [
      "psd"
    ]
  },
  "image/vnd.airzip.accelerator.azv": {
    source: "iana",
    extensions: [
      "azv"
    ]
  },
  "image/vnd.cns.inf2": {
    source: "iana"
  },
  "image/vnd.dece.graphic": {
    source: "iana",
    extensions: [
      "uvi",
      "uvvi",
      "uvg",
      "uvvg"
    ]
  },
  "image/vnd.djvu": {
    source: "iana",
    extensions: [
      "djvu",
      "djv"
    ]
  },
  "image/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "image/vnd.dwg": {
    source: "iana",
    extensions: [
      "dwg"
    ]
  },
  "image/vnd.dxf": {
    source: "iana",
    extensions: [
      "dxf"
    ]
  },
  "image/vnd.fastbidsheet": {
    source: "iana",
    extensions: [
      "fbs"
    ]
  },
  "image/vnd.fpx": {
    source: "iana",
    extensions: [
      "fpx"
    ]
  },
  "image/vnd.fst": {
    source: "iana",
    extensions: [
      "fst"
    ]
  },
  "image/vnd.fujixerox.edmics-mmr": {
    source: "iana",
    extensions: [
      "mmr"
    ]
  },
  "image/vnd.fujixerox.edmics-rlc": {
    source: "iana",
    extensions: [
      "rlc"
    ]
  },
  "image/vnd.globalgraphics.pgb": {
    source: "iana"
  },
  "image/vnd.microsoft.icon": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ico"
    ]
  },
  "image/vnd.mix": {
    source: "iana"
  },
  "image/vnd.mozilla.apng": {
    source: "iana"
  },
  "image/vnd.ms-dds": {
    compressible: !0,
    extensions: [
      "dds"
    ]
  },
  "image/vnd.ms-modi": {
    source: "iana",
    extensions: [
      "mdi"
    ]
  },
  "image/vnd.ms-photo": {
    source: "apache",
    extensions: [
      "wdp"
    ]
  },
  "image/vnd.net-fpx": {
    source: "iana",
    extensions: [
      "npx"
    ]
  },
  "image/vnd.pco.b16": {
    source: "iana",
    extensions: [
      "b16"
    ]
  },
  "image/vnd.radiance": {
    source: "iana"
  },
  "image/vnd.sealed.png": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.gif": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.jpg": {
    source: "iana"
  },
  "image/vnd.svf": {
    source: "iana"
  },
  "image/vnd.tencent.tap": {
    source: "iana",
    extensions: [
      "tap"
    ]
  },
  "image/vnd.valve.source.texture": {
    source: "iana",
    extensions: [
      "vtf"
    ]
  },
  "image/vnd.wap.wbmp": {
    source: "iana",
    extensions: [
      "wbmp"
    ]
  },
  "image/vnd.xiff": {
    source: "iana",
    extensions: [
      "xif"
    ]
  },
  "image/vnd.zbrush.pcx": {
    source: "iana",
    extensions: [
      "pcx"
    ]
  },
  "image/webp": {
    source: "apache",
    extensions: [
      "webp"
    ]
  },
  "image/wmf": {
    source: "iana",
    extensions: [
      "wmf"
    ]
  },
  "image/x-3ds": {
    source: "apache",
    extensions: [
      "3ds"
    ]
  },
  "image/x-cmu-raster": {
    source: "apache",
    extensions: [
      "ras"
    ]
  },
  "image/x-cmx": {
    source: "apache",
    extensions: [
      "cmx"
    ]
  },
  "image/x-freehand": {
    source: "apache",
    extensions: [
      "fh",
      "fhc",
      "fh4",
      "fh5",
      "fh7"
    ]
  },
  "image/x-icon": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ico"
    ]
  },
  "image/x-jng": {
    source: "nginx",
    extensions: [
      "jng"
    ]
  },
  "image/x-mrsid-image": {
    source: "apache",
    extensions: [
      "sid"
    ]
  },
  "image/x-ms-bmp": {
    source: "nginx",
    compressible: !0,
    extensions: [
      "bmp"
    ]
  },
  "image/x-pcx": {
    source: "apache",
    extensions: [
      "pcx"
    ]
  },
  "image/x-pict": {
    source: "apache",
    extensions: [
      "pic",
      "pct"
    ]
  },
  "image/x-portable-anymap": {
    source: "apache",
    extensions: [
      "pnm"
    ]
  },
  "image/x-portable-bitmap": {
    source: "apache",
    extensions: [
      "pbm"
    ]
  },
  "image/x-portable-graymap": {
    source: "apache",
    extensions: [
      "pgm"
    ]
  },
  "image/x-portable-pixmap": {
    source: "apache",
    extensions: [
      "ppm"
    ]
  },
  "image/x-rgb": {
    source: "apache",
    extensions: [
      "rgb"
    ]
  },
  "image/x-tga": {
    source: "apache",
    extensions: [
      "tga"
    ]
  },
  "image/x-xbitmap": {
    source: "apache",
    extensions: [
      "xbm"
    ]
  },
  "image/x-xcf": {
    compressible: !1
  },
  "image/x-xpixmap": {
    source: "apache",
    extensions: [
      "xpm"
    ]
  },
  "image/x-xwindowdump": {
    source: "apache",
    extensions: [
      "xwd"
    ]
  },
  "message/cpim": {
    source: "iana"
  },
  "message/delivery-status": {
    source: "iana"
  },
  "message/disposition-notification": {
    source: "iana",
    extensions: [
      "disposition-notification"
    ]
  },
  "message/external-body": {
    source: "iana"
  },
  "message/feedback-report": {
    source: "iana"
  },
  "message/global": {
    source: "iana",
    extensions: [
      "u8msg"
    ]
  },
  "message/global-delivery-status": {
    source: "iana",
    extensions: [
      "u8dsn"
    ]
  },
  "message/global-disposition-notification": {
    source: "iana",
    extensions: [
      "u8mdn"
    ]
  },
  "message/global-headers": {
    source: "iana",
    extensions: [
      "u8hdr"
    ]
  },
  "message/http": {
    source: "iana",
    compressible: !1
  },
  "message/imdn+xml": {
    source: "iana",
    compressible: !0
  },
  "message/news": {
    source: "iana"
  },
  "message/partial": {
    source: "iana",
    compressible: !1
  },
  "message/rfc822": {
    source: "iana",
    compressible: !0,
    extensions: [
      "eml",
      "mime"
    ]
  },
  "message/s-http": {
    source: "iana"
  },
  "message/sip": {
    source: "iana"
  },
  "message/sipfrag": {
    source: "iana"
  },
  "message/tracking-status": {
    source: "iana"
  },
  "message/vnd.si.simp": {
    source: "iana"
  },
  "message/vnd.wfa.wsc": {
    source: "iana",
    extensions: [
      "wsc"
    ]
  },
  "model/3mf": {
    source: "iana",
    extensions: [
      "3mf"
    ]
  },
  "model/e57": {
    source: "iana"
  },
  "model/gltf+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "gltf"
    ]
  },
  "model/gltf-binary": {
    source: "iana",
    compressible: !0,
    extensions: [
      "glb"
    ]
  },
  "model/iges": {
    source: "iana",
    compressible: !1,
    extensions: [
      "igs",
      "iges"
    ]
  },
  "model/mesh": {
    source: "iana",
    compressible: !1,
    extensions: [
      "msh",
      "mesh",
      "silo"
    ]
  },
  "model/mtl": {
    source: "iana",
    extensions: [
      "mtl"
    ]
  },
  "model/obj": {
    source: "iana",
    extensions: [
      "obj"
    ]
  },
  "model/step": {
    source: "iana"
  },
  "model/step+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "stpx"
    ]
  },
  "model/step+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "stpz"
    ]
  },
  "model/step-xml+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "stpxz"
    ]
  },
  "model/stl": {
    source: "iana",
    extensions: [
      "stl"
    ]
  },
  "model/vnd.collada+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dae"
    ]
  },
  "model/vnd.dwf": {
    source: "iana",
    extensions: [
      "dwf"
    ]
  },
  "model/vnd.flatland.3dml": {
    source: "iana"
  },
  "model/vnd.gdl": {
    source: "iana",
    extensions: [
      "gdl"
    ]
  },
  "model/vnd.gs-gdl": {
    source: "apache"
  },
  "model/vnd.gs.gdl": {
    source: "iana"
  },
  "model/vnd.gtw": {
    source: "iana",
    extensions: [
      "gtw"
    ]
  },
  "model/vnd.moml+xml": {
    source: "iana",
    compressible: !0
  },
  "model/vnd.mts": {
    source: "iana",
    extensions: [
      "mts"
    ]
  },
  "model/vnd.opengex": {
    source: "iana",
    extensions: [
      "ogex"
    ]
  },
  "model/vnd.parasolid.transmit.binary": {
    source: "iana",
    extensions: [
      "x_b"
    ]
  },
  "model/vnd.parasolid.transmit.text": {
    source: "iana",
    extensions: [
      "x_t"
    ]
  },
  "model/vnd.pytha.pyox": {
    source: "iana"
  },
  "model/vnd.rosette.annotated-data-model": {
    source: "iana"
  },
  "model/vnd.sap.vds": {
    source: "iana",
    extensions: [
      "vds"
    ]
  },
  "model/vnd.usdz+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "usdz"
    ]
  },
  "model/vnd.valve.source.compiled-map": {
    source: "iana",
    extensions: [
      "bsp"
    ]
  },
  "model/vnd.vtu": {
    source: "iana",
    extensions: [
      "vtu"
    ]
  },
  "model/vrml": {
    source: "iana",
    compressible: !1,
    extensions: [
      "wrl",
      "vrml"
    ]
  },
  "model/x3d+binary": {
    source: "apache",
    compressible: !1,
    extensions: [
      "x3db",
      "x3dbz"
    ]
  },
  "model/x3d+fastinfoset": {
    source: "iana",
    extensions: [
      "x3db"
    ]
  },
  "model/x3d+vrml": {
    source: "apache",
    compressible: !1,
    extensions: [
      "x3dv",
      "x3dvz"
    ]
  },
  "model/x3d+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "x3d",
      "x3dz"
    ]
  },
  "model/x3d-vrml": {
    source: "iana",
    extensions: [
      "x3dv"
    ]
  },
  "multipart/alternative": {
    source: "iana",
    compressible: !1
  },
  "multipart/appledouble": {
    source: "iana"
  },
  "multipart/byteranges": {
    source: "iana"
  },
  "multipart/digest": {
    source: "iana"
  },
  "multipart/encrypted": {
    source: "iana",
    compressible: !1
  },
  "multipart/form-data": {
    source: "iana",
    compressible: !1
  },
  "multipart/header-set": {
    source: "iana"
  },
  "multipart/mixed": {
    source: "iana"
  },
  "multipart/multilingual": {
    source: "iana"
  },
  "multipart/parallel": {
    source: "iana"
  },
  "multipart/related": {
    source: "iana",
    compressible: !1
  },
  "multipart/report": {
    source: "iana"
  },
  "multipart/signed": {
    source: "iana",
    compressible: !1
  },
  "multipart/vnd.bint.med-plus": {
    source: "iana"
  },
  "multipart/voice-message": {
    source: "iana"
  },
  "multipart/x-mixed-replace": {
    source: "iana"
  },
  "text/1d-interleaved-parityfec": {
    source: "iana"
  },
  "text/cache-manifest": {
    source: "iana",
    compressible: !0,
    extensions: [
      "appcache",
      "manifest"
    ]
  },
  "text/calendar": {
    source: "iana",
    extensions: [
      "ics",
      "ifb"
    ]
  },
  "text/calender": {
    compressible: !0
  },
  "text/cmd": {
    compressible: !0
  },
  "text/coffeescript": {
    extensions: [
      "coffee",
      "litcoffee"
    ]
  },
  "text/cql": {
    source: "iana"
  },
  "text/cql-expression": {
    source: "iana"
  },
  "text/cql-identifier": {
    source: "iana"
  },
  "text/css": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "css"
    ]
  },
  "text/csv": {
    source: "iana",
    compressible: !0,
    extensions: [
      "csv"
    ]
  },
  "text/csv-schema": {
    source: "iana"
  },
  "text/directory": {
    source: "iana"
  },
  "text/dns": {
    source: "iana"
  },
  "text/ecmascript": {
    source: "iana"
  },
  "text/encaprtp": {
    source: "iana"
  },
  "text/enriched": {
    source: "iana"
  },
  "text/fhirpath": {
    source: "iana"
  },
  "text/flexfec": {
    source: "iana"
  },
  "text/fwdred": {
    source: "iana"
  },
  "text/gff3": {
    source: "iana"
  },
  "text/grammar-ref-list": {
    source: "iana"
  },
  "text/html": {
    source: "iana",
    compressible: !0,
    extensions: [
      "html",
      "htm",
      "shtml"
    ]
  },
  "text/jade": {
    extensions: [
      "jade"
    ]
  },
  "text/javascript": {
    source: "iana",
    compressible: !0
  },
  "text/jcr-cnd": {
    source: "iana"
  },
  "text/jsx": {
    compressible: !0,
    extensions: [
      "jsx"
    ]
  },
  "text/less": {
    compressible: !0,
    extensions: [
      "less"
    ]
  },
  "text/markdown": {
    source: "iana",
    compressible: !0,
    extensions: [
      "markdown",
      "md"
    ]
  },
  "text/mathml": {
    source: "nginx",
    extensions: [
      "mml"
    ]
  },
  "text/mdx": {
    compressible: !0,
    extensions: [
      "mdx"
    ]
  },
  "text/mizar": {
    source: "iana"
  },
  "text/n3": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "n3"
    ]
  },
  "text/parameters": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/parityfec": {
    source: "iana"
  },
  "text/plain": {
    source: "iana",
    compressible: !0,
    extensions: [
      "txt",
      "text",
      "conf",
      "def",
      "list",
      "log",
      "in",
      "ini"
    ]
  },
  "text/provenance-notation": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/prs.fallenstein.rst": {
    source: "iana"
  },
  "text/prs.lines.tag": {
    source: "iana",
    extensions: [
      "dsc"
    ]
  },
  "text/prs.prop.logic": {
    source: "iana"
  },
  "text/raptorfec": {
    source: "iana"
  },
  "text/red": {
    source: "iana"
  },
  "text/rfc822-headers": {
    source: "iana"
  },
  "text/richtext": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtx"
    ]
  },
  "text/rtf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtf"
    ]
  },
  "text/rtp-enc-aescm128": {
    source: "iana"
  },
  "text/rtploopback": {
    source: "iana"
  },
  "text/rtx": {
    source: "iana"
  },
  "text/sgml": {
    source: "iana",
    extensions: [
      "sgml",
      "sgm"
    ]
  },
  "text/shaclc": {
    source: "iana"
  },
  "text/shex": {
    source: "iana",
    extensions: [
      "shex"
    ]
  },
  "text/slim": {
    extensions: [
      "slim",
      "slm"
    ]
  },
  "text/spdx": {
    source: "iana",
    extensions: [
      "spdx"
    ]
  },
  "text/strings": {
    source: "iana"
  },
  "text/stylus": {
    extensions: [
      "stylus",
      "styl"
    ]
  },
  "text/t140": {
    source: "iana"
  },
  "text/tab-separated-values": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tsv"
    ]
  },
  "text/troff": {
    source: "iana",
    extensions: [
      "t",
      "tr",
      "roff",
      "man",
      "me",
      "ms"
    ]
  },
  "text/turtle": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "ttl"
    ]
  },
  "text/ulpfec": {
    source: "iana"
  },
  "text/uri-list": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uri",
      "uris",
      "urls"
    ]
  },
  "text/vcard": {
    source: "iana",
    compressible: !0,
    extensions: [
      "vcard"
    ]
  },
  "text/vnd.a": {
    source: "iana"
  },
  "text/vnd.abc": {
    source: "iana"
  },
  "text/vnd.ascii-art": {
    source: "iana"
  },
  "text/vnd.curl": {
    source: "iana",
    extensions: [
      "curl"
    ]
  },
  "text/vnd.curl.dcurl": {
    source: "apache",
    extensions: [
      "dcurl"
    ]
  },
  "text/vnd.curl.mcurl": {
    source: "apache",
    extensions: [
      "mcurl"
    ]
  },
  "text/vnd.curl.scurl": {
    source: "apache",
    extensions: [
      "scurl"
    ]
  },
  "text/vnd.debian.copyright": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.dmclientscript": {
    source: "iana"
  },
  "text/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "text/vnd.esmertec.theme-descriptor": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.familysearch.gedcom": {
    source: "iana",
    extensions: [
      "ged"
    ]
  },
  "text/vnd.ficlab.flt": {
    source: "iana"
  },
  "text/vnd.fly": {
    source: "iana",
    extensions: [
      "fly"
    ]
  },
  "text/vnd.fmi.flexstor": {
    source: "iana",
    extensions: [
      "flx"
    ]
  },
  "text/vnd.gml": {
    source: "iana"
  },
  "text/vnd.graphviz": {
    source: "iana",
    extensions: [
      "gv"
    ]
  },
  "text/vnd.hans": {
    source: "iana"
  },
  "text/vnd.hgl": {
    source: "iana"
  },
  "text/vnd.in3d.3dml": {
    source: "iana",
    extensions: [
      "3dml"
    ]
  },
  "text/vnd.in3d.spot": {
    source: "iana",
    extensions: [
      "spot"
    ]
  },
  "text/vnd.iptc.newsml": {
    source: "iana"
  },
  "text/vnd.iptc.nitf": {
    source: "iana"
  },
  "text/vnd.latex-z": {
    source: "iana"
  },
  "text/vnd.motorola.reflex": {
    source: "iana"
  },
  "text/vnd.ms-mediapackage": {
    source: "iana"
  },
  "text/vnd.net2phone.commcenter.command": {
    source: "iana"
  },
  "text/vnd.radisys.msml-basic-layout": {
    source: "iana"
  },
  "text/vnd.senx.warpscript": {
    source: "iana"
  },
  "text/vnd.si.uricatalogue": {
    source: "iana"
  },
  "text/vnd.sosi": {
    source: "iana"
  },
  "text/vnd.sun.j2me.app-descriptor": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "jad"
    ]
  },
  "text/vnd.trolltech.linguist": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.wap.si": {
    source: "iana"
  },
  "text/vnd.wap.sl": {
    source: "iana"
  },
  "text/vnd.wap.wml": {
    source: "iana",
    extensions: [
      "wml"
    ]
  },
  "text/vnd.wap.wmlscript": {
    source: "iana",
    extensions: [
      "wmls"
    ]
  },
  "text/vtt": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "vtt"
    ]
  },
  "text/x-asm": {
    source: "apache",
    extensions: [
      "s",
      "asm"
    ]
  },
  "text/x-c": {
    source: "apache",
    extensions: [
      "c",
      "cc",
      "cxx",
      "cpp",
      "h",
      "hh",
      "dic"
    ]
  },
  "text/x-component": {
    source: "nginx",
    extensions: [
      "htc"
    ]
  },
  "text/x-fortran": {
    source: "apache",
    extensions: [
      "f",
      "for",
      "f77",
      "f90"
    ]
  },
  "text/x-gwt-rpc": {
    compressible: !0
  },
  "text/x-handlebars-template": {
    extensions: [
      "hbs"
    ]
  },
  "text/x-java-source": {
    source: "apache",
    extensions: [
      "java"
    ]
  },
  "text/x-jquery-tmpl": {
    compressible: !0
  },
  "text/x-lua": {
    extensions: [
      "lua"
    ]
  },
  "text/x-markdown": {
    compressible: !0,
    extensions: [
      "mkd"
    ]
  },
  "text/x-nfo": {
    source: "apache",
    extensions: [
      "nfo"
    ]
  },
  "text/x-opml": {
    source: "apache",
    extensions: [
      "opml"
    ]
  },
  "text/x-org": {
    compressible: !0,
    extensions: [
      "org"
    ]
  },
  "text/x-pascal": {
    source: "apache",
    extensions: [
      "p",
      "pas"
    ]
  },
  "text/x-processing": {
    compressible: !0,
    extensions: [
      "pde"
    ]
  },
  "text/x-sass": {
    extensions: [
      "sass"
    ]
  },
  "text/x-scss": {
    extensions: [
      "scss"
    ]
  },
  "text/x-setext": {
    source: "apache",
    extensions: [
      "etx"
    ]
  },
  "text/x-sfv": {
    source: "apache",
    extensions: [
      "sfv"
    ]
  },
  "text/x-suse-ymp": {
    compressible: !0,
    extensions: [
      "ymp"
    ]
  },
  "text/x-uuencode": {
    source: "apache",
    extensions: [
      "uu"
    ]
  },
  "text/x-vcalendar": {
    source: "apache",
    extensions: [
      "vcs"
    ]
  },
  "text/x-vcard": {
    source: "apache",
    extensions: [
      "vcf"
    ]
  },
  "text/xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xml"
    ]
  },
  "text/xml-external-parsed-entity": {
    source: "iana"
  },
  "text/yaml": {
    compressible: !0,
    extensions: [
      "yaml",
      "yml"
    ]
  },
  "video/1d-interleaved-parityfec": {
    source: "iana"
  },
  "video/3gpp": {
    source: "iana",
    extensions: [
      "3gp",
      "3gpp"
    ]
  },
  "video/3gpp-tt": {
    source: "iana"
  },
  "video/3gpp2": {
    source: "iana",
    extensions: [
      "3g2"
    ]
  },
  "video/av1": {
    source: "iana"
  },
  "video/bmpeg": {
    source: "iana"
  },
  "video/bt656": {
    source: "iana"
  },
  "video/celb": {
    source: "iana"
  },
  "video/dv": {
    source: "iana"
  },
  "video/encaprtp": {
    source: "iana"
  },
  "video/ffv1": {
    source: "iana"
  },
  "video/flexfec": {
    source: "iana"
  },
  "video/h261": {
    source: "iana",
    extensions: [
      "h261"
    ]
  },
  "video/h263": {
    source: "iana",
    extensions: [
      "h263"
    ]
  },
  "video/h263-1998": {
    source: "iana"
  },
  "video/h263-2000": {
    source: "iana"
  },
  "video/h264": {
    source: "iana",
    extensions: [
      "h264"
    ]
  },
  "video/h264-rcdo": {
    source: "iana"
  },
  "video/h264-svc": {
    source: "iana"
  },
  "video/h265": {
    source: "iana"
  },
  "video/iso.segment": {
    source: "iana",
    extensions: [
      "m4s"
    ]
  },
  "video/jpeg": {
    source: "iana",
    extensions: [
      "jpgv"
    ]
  },
  "video/jpeg2000": {
    source: "iana"
  },
  "video/jpm": {
    source: "apache",
    extensions: [
      "jpm",
      "jpgm"
    ]
  },
  "video/jxsv": {
    source: "iana"
  },
  "video/mj2": {
    source: "iana",
    extensions: [
      "mj2",
      "mjp2"
    ]
  },
  "video/mp1s": {
    source: "iana"
  },
  "video/mp2p": {
    source: "iana"
  },
  "video/mp2t": {
    source: "iana",
    extensions: [
      "ts"
    ]
  },
  "video/mp4": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mp4",
      "mp4v",
      "mpg4"
    ]
  },
  "video/mp4v-es": {
    source: "iana"
  },
  "video/mpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mpeg",
      "mpg",
      "mpe",
      "m1v",
      "m2v"
    ]
  },
  "video/mpeg4-generic": {
    source: "iana"
  },
  "video/mpv": {
    source: "iana"
  },
  "video/nv": {
    source: "iana"
  },
  "video/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ogv"
    ]
  },
  "video/parityfec": {
    source: "iana"
  },
  "video/pointer": {
    source: "iana"
  },
  "video/quicktime": {
    source: "iana",
    compressible: !1,
    extensions: [
      "qt",
      "mov"
    ]
  },
  "video/raptorfec": {
    source: "iana"
  },
  "video/raw": {
    source: "iana"
  },
  "video/rtp-enc-aescm128": {
    source: "iana"
  },
  "video/rtploopback": {
    source: "iana"
  },
  "video/rtx": {
    source: "iana"
  },
  "video/scip": {
    source: "iana"
  },
  "video/smpte291": {
    source: "iana"
  },
  "video/smpte292m": {
    source: "iana"
  },
  "video/ulpfec": {
    source: "iana"
  },
  "video/vc1": {
    source: "iana"
  },
  "video/vc2": {
    source: "iana"
  },
  "video/vnd.cctv": {
    source: "iana"
  },
  "video/vnd.dece.hd": {
    source: "iana",
    extensions: [
      "uvh",
      "uvvh"
    ]
  },
  "video/vnd.dece.mobile": {
    source: "iana",
    extensions: [
      "uvm",
      "uvvm"
    ]
  },
  "video/vnd.dece.mp4": {
    source: "iana"
  },
  "video/vnd.dece.pd": {
    source: "iana",
    extensions: [
      "uvp",
      "uvvp"
    ]
  },
  "video/vnd.dece.sd": {
    source: "iana",
    extensions: [
      "uvs",
      "uvvs"
    ]
  },
  "video/vnd.dece.video": {
    source: "iana",
    extensions: [
      "uvv",
      "uvvv"
    ]
  },
  "video/vnd.directv.mpeg": {
    source: "iana"
  },
  "video/vnd.directv.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dlna.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dvb.file": {
    source: "iana",
    extensions: [
      "dvb"
    ]
  },
  "video/vnd.fvt": {
    source: "iana",
    extensions: [
      "fvt"
    ]
  },
  "video/vnd.hns.video": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsavc": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsmpeg2": {
    source: "iana"
  },
  "video/vnd.motorola.video": {
    source: "iana"
  },
  "video/vnd.motorola.videop": {
    source: "iana"
  },
  "video/vnd.mpegurl": {
    source: "iana",
    extensions: [
      "mxu",
      "m4u"
    ]
  },
  "video/vnd.ms-playready.media.pyv": {
    source: "iana",
    extensions: [
      "pyv"
    ]
  },
  "video/vnd.nokia.interleaved-multimedia": {
    source: "iana"
  },
  "video/vnd.nokia.mp4vr": {
    source: "iana"
  },
  "video/vnd.nokia.videovoip": {
    source: "iana"
  },
  "video/vnd.objectvideo": {
    source: "iana"
  },
  "video/vnd.radgamettools.bink": {
    source: "iana"
  },
  "video/vnd.radgamettools.smacker": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg1": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg4": {
    source: "iana"
  },
  "video/vnd.sealed.swf": {
    source: "iana"
  },
  "video/vnd.sealedmedia.softseal.mov": {
    source: "iana"
  },
  "video/vnd.uvvu.mp4": {
    source: "iana",
    extensions: [
      "uvu",
      "uvvu"
    ]
  },
  "video/vnd.vivo": {
    source: "iana",
    extensions: [
      "viv"
    ]
  },
  "video/vnd.youtube.yt": {
    source: "iana"
  },
  "video/vp8": {
    source: "iana"
  },
  "video/vp9": {
    source: "iana"
  },
  "video/webm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "webm"
    ]
  },
  "video/x-f4v": {
    source: "apache",
    extensions: [
      "f4v"
    ]
  },
  "video/x-fli": {
    source: "apache",
    extensions: [
      "fli"
    ]
  },
  "video/x-flv": {
    source: "apache",
    compressible: !1,
    extensions: [
      "flv"
    ]
  },
  "video/x-m4v": {
    source: "apache",
    extensions: [
      "m4v"
    ]
  },
  "video/x-matroska": {
    source: "apache",
    compressible: !1,
    extensions: [
      "mkv",
      "mk3d",
      "mks"
    ]
  },
  "video/x-mng": {
    source: "apache",
    extensions: [
      "mng"
    ]
  },
  "video/x-ms-asf": {
    source: "apache",
    extensions: [
      "asf",
      "asx"
    ]
  },
  "video/x-ms-vob": {
    source: "apache",
    extensions: [
      "vob"
    ]
  },
  "video/x-ms-wm": {
    source: "apache",
    extensions: [
      "wm"
    ]
  },
  "video/x-ms-wmv": {
    source: "apache",
    compressible: !1,
    extensions: [
      "wmv"
    ]
  },
  "video/x-ms-wmx": {
    source: "apache",
    extensions: [
      "wmx"
    ]
  },
  "video/x-ms-wvx": {
    source: "apache",
    extensions: [
      "wvx"
    ]
  },
  "video/x-msvideo": {
    source: "apache",
    extensions: [
      "avi"
    ]
  },
  "video/x-sgi-movie": {
    source: "apache",
    extensions: [
      "movie"
    ]
  },
  "video/x-smv": {
    source: "apache",
    extensions: [
      "smv"
    ]
  },
  "x-conference/x-cooltalk": {
    source: "apache",
    extensions: [
      "ice"
    ]
  },
  "x-shader/x-fragment": {
    compressible: !0
  },
  "x-shader/x-vertex": {
    compressible: !0
  }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var Wc = Hc;
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
(function(a) {
  var e = Wc, t = Yi.extname, n = /^\s*([^;\s]*)(?:;|\s|$)/, s = /^text\//i;
  a.charset = i, a.charsets = { lookup: i }, a.contentType = o, a.extension = r, a.extensions = /* @__PURE__ */ Object.create(null), a.lookup = c, a.types = /* @__PURE__ */ Object.create(null), u(a.extensions, a.types);
  function i(l) {
    if (!l || typeof l != "string")
      return !1;
    var p = n.exec(l), d = p && e[p[1].toLowerCase()];
    return d && d.charset ? d.charset : p && s.test(p[1]) ? "UTF-8" : !1;
  }
  function o(l) {
    if (!l || typeof l != "string")
      return !1;
    var p = l.indexOf("/") === -1 ? a.lookup(l) : l;
    if (!p)
      return !1;
    if (p.indexOf("charset") === -1) {
      var d = a.charset(p);
      d && (p += "; charset=" + d.toLowerCase());
    }
    return p;
  }
  function r(l) {
    if (!l || typeof l != "string")
      return !1;
    var p = n.exec(l), d = p && a.extensions[p[1].toLowerCase()];
    return !d || !d.length ? !1 : d[0];
  }
  function c(l) {
    if (!l || typeof l != "string")
      return !1;
    var p = t("x." + l).toLowerCase().substr(1);
    return p && a.types[p] || !1;
  }
  function u(l, p) {
    var d = ["nginx", "apache", void 0, "iana"];
    Object.keys(e).forEach(function(m) {
      var f = e[m], g = f.extensions;
      if (!(!g || !g.length)) {
        l[m] = g;
        for (var v = 0; v < g.length; v++) {
          var y = g[v];
          if (p[y]) {
            var b = d.indexOf(e[p[y]].source), S = d.indexOf(f.source);
            if (p[y] !== "application/octet-stream" && (b > S || b === S && p[y].substr(0, 12) === "application/"))
              continue;
          }
          p[y] = m;
        }
      }
    });
  }
})(Ro);
var Vc = Gc;
function Gc(a) {
  var e = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
  e ? e(a) : setTimeout(a, 0);
}
var ks = Vc, Ao = Jc;
function Jc(a) {
  var e = !1;
  return ks(function() {
    e = !0;
  }), function(n, s) {
    e ? a(n, s) : ks(function() {
      a(n, s);
    });
  };
}
var Eo = Kc;
function Kc(a) {
  Object.keys(a.jobs).forEach(Xc.bind(a)), a.jobs = {};
}
function Xc(a) {
  typeof this.jobs[a] == "function" && this.jobs[a]();
}
var Ts = Ao, Yc = Eo, ko = Qc;
function Qc(a, e, t, n) {
  var s = t.keyedList ? t.keyedList[t.index] : t.index;
  t.jobs[s] = Zc(e, s, a[s], function(i, o) {
    s in t.jobs && (delete t.jobs[s], i ? Yc(t) : t.results[s] = o, n(i, t.results));
  });
}
function Zc(a, e, t, n) {
  var s;
  return a.length == 2 ? s = a(t, Ts(n)) : s = a(t, e, Ts(n)), s;
}
var To = el;
function el(a, e) {
  var t = !Array.isArray(a), n = {
    index: 0,
    keyedList: t || e ? Object.keys(a) : null,
    jobs: {},
    results: t ? {} : [],
    size: t ? Object.keys(a).length : a.length
  };
  return e && n.keyedList.sort(t ? e : function(s, i) {
    return e(a[s], a[i]);
  }), n;
}
var tl = Eo, nl = Ao, Io = al;
function al(a) {
  Object.keys(this.jobs).length && (this.index = this.size, tl(this), nl(a)(null, this.results));
}
var sl = ko, il = To, ol = Io, rl = cl;
function cl(a, e, t) {
  for (var n = il(a); n.index < (n.keyedList || a).length; )
    sl(a, e, n, function(s, i) {
      if (s) {
        t(s, i);
        return;
      }
      if (Object.keys(n.jobs).length === 0) {
        t(null, n.results);
        return;
      }
    }), n.index++;
  return ol.bind(n, t);
}
var Wn = { exports: {} }, Is = ko, ll = To, ul = Io;
Wn.exports = pl;
Wn.exports.ascending = Po;
Wn.exports.descending = dl;
function pl(a, e, t, n) {
  var s = ll(a, t);
  return Is(a, e, s, function i(o, r) {
    if (o) {
      n(o, r);
      return;
    }
    if (s.index++, s.index < (s.keyedList || a).length) {
      Is(a, e, s, i);
      return;
    }
    n(null, s.results);
  }), ul.bind(s, n);
}
function Po(a, e) {
  return a < e ? -1 : a > e ? 1 : 0;
}
function dl(a, e) {
  return -1 * Po(a, e);
}
var $o = Wn.exports, ml = $o, fl = hl;
function hl(a, e, t) {
  return ml(a, e, null, t);
}
var gl = {
  parallel: rl,
  serial: fl,
  serialOrdered: $o
}, Do = Object, xl = Error, vl = EvalError, yl = RangeError, bl = ReferenceError, wl = SyntaxError, Za = TypeError, _l = URIError, Sl = Math.abs, Cl = Math.floor, Rl = Math.max, Al = Math.min, El = Math.pow, kl = Math.round, Tl = Number.isNaN || function(e) {
  return e !== e;
}, Il = Tl, Pl = function(e) {
  return Il(e) || e === 0 ? e : e < 0 ? -1 : 1;
}, $l = Object.getOwnPropertyDescriptor, En = $l;
if (En)
  try {
    En([], "length");
  } catch {
    En = null;
  }
var Lo = En, kn = Object.defineProperty || !1;
if (kn)
  try {
    kn({}, "a", { value: 1 });
  } catch {
    kn = !1;
  }
var Dl = kn, Yn, Ps;
function No() {
  return Ps || (Ps = 1, Yn = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function")
      return !1;
    if (typeof Symbol.iterator == "symbol")
      return !0;
    var e = {}, t = Symbol("test"), n = Object(t);
    if (typeof t == "string" || Object.prototype.toString.call(t) !== "[object Symbol]" || Object.prototype.toString.call(n) !== "[object Symbol]")
      return !1;
    var s = 42;
    e[t] = s;
    for (var i in e)
      return !1;
    if (typeof Object.keys == "function" && Object.keys(e).length !== 0 || typeof Object.getOwnPropertyNames == "function" && Object.getOwnPropertyNames(e).length !== 0)
      return !1;
    var o = Object.getOwnPropertySymbols(e);
    if (o.length !== 1 || o[0] !== t || !Object.prototype.propertyIsEnumerable.call(e, t))
      return !1;
    if (typeof Object.getOwnPropertyDescriptor == "function") {
      var r = (
        /** @type {PropertyDescriptor} */
        Object.getOwnPropertyDescriptor(e, t)
      );
      if (r.value !== s || r.enumerable !== !0)
        return !1;
    }
    return !0;
  }), Yn;
}
var Qn, $s;
function Ll() {
  if ($s) return Qn;
  $s = 1;
  var a = typeof Symbol < "u" && Symbol, e = No();
  return Qn = function() {
    return typeof a != "function" || typeof Symbol != "function" || typeof a("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? !1 : e();
  }, Qn;
}
var Zn, Ds;
function Oo() {
  return Ds || (Ds = 1, Zn = typeof Reflect < "u" && Reflect.getPrototypeOf || null), Zn;
}
var ea, Ls;
function Mo() {
  if (Ls) return ea;
  Ls = 1;
  var a = Do;
  return ea = a.getPrototypeOf || null, ea;
}
var Nl = "Function.prototype.bind called on incompatible ", Ol = Object.prototype.toString, Ml = Math.max, Ul = "[object Function]", Ns = function(e, t) {
  for (var n = [], s = 0; s < e.length; s += 1)
    n[s] = e[s];
  for (var i = 0; i < t.length; i += 1)
    n[i + e.length] = t[i];
  return n;
}, Fl = function(e, t) {
  for (var n = [], s = t, i = 0; s < e.length; s += 1, i += 1)
    n[i] = e[s];
  return n;
}, Bl = function(a, e) {
  for (var t = "", n = 0; n < a.length; n += 1)
    t += a[n], n + 1 < a.length && (t += e);
  return t;
}, jl = function(e) {
  var t = this;
  if (typeof t != "function" || Ol.apply(t) !== Ul)
    throw new TypeError(Nl + t);
  for (var n = Fl(arguments, 1), s, i = function() {
    if (this instanceof s) {
      var l = t.apply(
        this,
        Ns(n, arguments)
      );
      return Object(l) === l ? l : this;
    }
    return t.apply(
      e,
      Ns(n, arguments)
    );
  }, o = Ml(0, t.length - n.length), r = [], c = 0; c < o; c++)
    r[c] = "$" + c;
  if (s = Function("binder", "return function (" + Bl(r, ",") + "){ return binder.apply(this,arguments); }")(i), t.prototype) {
    var u = function() {
    };
    u.prototype = t.prototype, s.prototype = new u(), u.prototype = null;
  }
  return s;
}, zl = jl, Vn = Function.prototype.bind || zl, ta, Os;
function es() {
  return Os || (Os = 1, ta = Function.prototype.call), ta;
}
var na, Ms;
function Uo() {
  return Ms || (Ms = 1, na = Function.prototype.apply), na;
}
var aa, Us;
function ql() {
  return Us || (Us = 1, aa = typeof Reflect < "u" && Reflect && Reflect.apply), aa;
}
var sa, Fs;
function Hl() {
  if (Fs) return sa;
  Fs = 1;
  var a = Vn, e = Uo(), t = es(), n = ql();
  return sa = n || a.call(t, e), sa;
}
var ia, Bs;
function Wl() {
  if (Bs) return ia;
  Bs = 1;
  var a = Vn, e = Za, t = es(), n = Hl();
  return ia = function(i) {
    if (i.length < 1 || typeof i[0] != "function")
      throw new e("a function is required");
    return n(a, t, i);
  }, ia;
}
var oa, js;
function Vl() {
  if (js) return oa;
  js = 1;
  var a = Wl(), e = Lo, t;
  try {
    t = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (o) {
    if (!o || typeof o != "object" || !("code" in o) || o.code !== "ERR_PROTO_ACCESS")
      throw o;
  }
  var n = !!t && e && e(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  ), s = Object, i = s.getPrototypeOf;
  return oa = n && typeof n.get == "function" ? a([n.get]) : typeof i == "function" ? (
    /** @type {import('./get')} */
    function(r) {
      return i(r == null ? r : s(r));
    }
  ) : !1, oa;
}
var ra, zs;
function Gl() {
  if (zs) return ra;
  zs = 1;
  var a = Oo(), e = Mo(), t = Vl();
  return ra = a ? function(s) {
    return a(s);
  } : e ? function(s) {
    if (!s || typeof s != "object" && typeof s != "function")
      throw new TypeError("getProto: not an object");
    return e(s);
  } : t ? function(s) {
    return t(s);
  } : null, ra;
}
var Jl = Function.prototype.call, Kl = Object.prototype.hasOwnProperty, Xl = Vn, ts = Xl.call(Jl, Kl), U, Yl = Do, Ql = xl, Zl = vl, eu = yl, tu = bl, Ot = wl, $t = Za, nu = _l, au = Sl, su = Cl, iu = Rl, ou = Al, ru = El, cu = kl, lu = Pl, Fo = Function, ca = function(a) {
  try {
    return Fo('"use strict"; return (' + a + ").constructor;")();
  } catch {
  }
}, Yt = Lo, uu = Dl, la = function() {
  throw new $t();
}, pu = Yt ? function() {
  try {
    return arguments.callee, la;
  } catch {
    try {
      return Yt(arguments, "callee").get;
    } catch {
      return la;
    }
  }
}() : la, St = Ll()(), xe = Gl(), du = Mo(), mu = Oo(), Bo = Uo(), rn = es(), At = {}, fu = typeof Uint8Array > "u" || !xe ? U : xe(Uint8Array), mt = {
  __proto__: null,
  "%AggregateError%": typeof AggregateError > "u" ? U : AggregateError,
  "%Array%": Array,
  "%ArrayBuffer%": typeof ArrayBuffer > "u" ? U : ArrayBuffer,
  "%ArrayIteratorPrototype%": St && xe ? xe([][Symbol.iterator]()) : U,
  "%AsyncFromSyncIteratorPrototype%": U,
  "%AsyncFunction%": At,
  "%AsyncGenerator%": At,
  "%AsyncGeneratorFunction%": At,
  "%AsyncIteratorPrototype%": At,
  "%Atomics%": typeof Atomics > "u" ? U : Atomics,
  "%BigInt%": typeof BigInt > "u" ? U : BigInt,
  "%BigInt64Array%": typeof BigInt64Array > "u" ? U : BigInt64Array,
  "%BigUint64Array%": typeof BigUint64Array > "u" ? U : BigUint64Array,
  "%Boolean%": Boolean,
  "%DataView%": typeof DataView > "u" ? U : DataView,
  "%Date%": Date,
  "%decodeURI%": decodeURI,
  "%decodeURIComponent%": decodeURIComponent,
  "%encodeURI%": encodeURI,
  "%encodeURIComponent%": encodeURIComponent,
  "%Error%": Ql,
  "%eval%": eval,
  // eslint-disable-line no-eval
  "%EvalError%": Zl,
  "%Float16Array%": typeof Float16Array > "u" ? U : Float16Array,
  "%Float32Array%": typeof Float32Array > "u" ? U : Float32Array,
  "%Float64Array%": typeof Float64Array > "u" ? U : Float64Array,
  "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? U : FinalizationRegistry,
  "%Function%": Fo,
  "%GeneratorFunction%": At,
  "%Int8Array%": typeof Int8Array > "u" ? U : Int8Array,
  "%Int16Array%": typeof Int16Array > "u" ? U : Int16Array,
  "%Int32Array%": typeof Int32Array > "u" ? U : Int32Array,
  "%isFinite%": isFinite,
  "%isNaN%": isNaN,
  "%IteratorPrototype%": St && xe ? xe(xe([][Symbol.iterator]())) : U,
  "%JSON%": typeof JSON == "object" ? JSON : U,
  "%Map%": typeof Map > "u" ? U : Map,
  "%MapIteratorPrototype%": typeof Map > "u" || !St || !xe ? U : xe((/* @__PURE__ */ new Map())[Symbol.iterator]()),
  "%Math%": Math,
  "%Number%": Number,
  "%Object%": Yl,
  "%Object.getOwnPropertyDescriptor%": Yt,
  "%parseFloat%": parseFloat,
  "%parseInt%": parseInt,
  "%Promise%": typeof Promise > "u" ? U : Promise,
  "%Proxy%": typeof Proxy > "u" ? U : Proxy,
  "%RangeError%": eu,
  "%ReferenceError%": tu,
  "%Reflect%": typeof Reflect > "u" ? U : Reflect,
  "%RegExp%": RegExp,
  "%Set%": typeof Set > "u" ? U : Set,
  "%SetIteratorPrototype%": typeof Set > "u" || !St || !xe ? U : xe((/* @__PURE__ */ new Set())[Symbol.iterator]()),
  "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? U : SharedArrayBuffer,
  "%String%": String,
  "%StringIteratorPrototype%": St && xe ? xe(""[Symbol.iterator]()) : U,
  "%Symbol%": St ? Symbol : U,
  "%SyntaxError%": Ot,
  "%ThrowTypeError%": pu,
  "%TypedArray%": fu,
  "%TypeError%": $t,
  "%Uint8Array%": typeof Uint8Array > "u" ? U : Uint8Array,
  "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? U : Uint8ClampedArray,
  "%Uint16Array%": typeof Uint16Array > "u" ? U : Uint16Array,
  "%Uint32Array%": typeof Uint32Array > "u" ? U : Uint32Array,
  "%URIError%": nu,
  "%WeakMap%": typeof WeakMap > "u" ? U : WeakMap,
  "%WeakRef%": typeof WeakRef > "u" ? U : WeakRef,
  "%WeakSet%": typeof WeakSet > "u" ? U : WeakSet,
  "%Function.prototype.call%": rn,
  "%Function.prototype.apply%": Bo,
  "%Object.defineProperty%": uu,
  "%Object.getPrototypeOf%": du,
  "%Math.abs%": au,
  "%Math.floor%": su,
  "%Math.max%": iu,
  "%Math.min%": ou,
  "%Math.pow%": ru,
  "%Math.round%": cu,
  "%Math.sign%": lu,
  "%Reflect.getPrototypeOf%": mu
};
if (xe)
  try {
    null.error;
  } catch (a) {
    var hu = xe(xe(a));
    mt["%Error.prototype%"] = hu;
  }
var gu = function a(e) {
  var t;
  if (e === "%AsyncFunction%")
    t = ca("async function () {}");
  else if (e === "%GeneratorFunction%")
    t = ca("function* () {}");
  else if (e === "%AsyncGeneratorFunction%")
    t = ca("async function* () {}");
  else if (e === "%AsyncGenerator%") {
    var n = a("%AsyncGeneratorFunction%");
    n && (t = n.prototype);
  } else if (e === "%AsyncIteratorPrototype%") {
    var s = a("%AsyncGenerator%");
    s && xe && (t = xe(s.prototype));
  }
  return mt[e] = t, t;
}, qs = {
  __proto__: null,
  "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
  "%ArrayPrototype%": ["Array", "prototype"],
  "%ArrayProto_entries%": ["Array", "prototype", "entries"],
  "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
  "%ArrayProto_keys%": ["Array", "prototype", "keys"],
  "%ArrayProto_values%": ["Array", "prototype", "values"],
  "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
  "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
  "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
  "%BooleanPrototype%": ["Boolean", "prototype"],
  "%DataViewPrototype%": ["DataView", "prototype"],
  "%DatePrototype%": ["Date", "prototype"],
  "%ErrorPrototype%": ["Error", "prototype"],
  "%EvalErrorPrototype%": ["EvalError", "prototype"],
  "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
  "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
  "%FunctionPrototype%": ["Function", "prototype"],
  "%Generator%": ["GeneratorFunction", "prototype"],
  "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
  "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
  "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
  "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
  "%JSONParse%": ["JSON", "parse"],
  "%JSONStringify%": ["JSON", "stringify"],
  "%MapPrototype%": ["Map", "prototype"],
  "%NumberPrototype%": ["Number", "prototype"],
  "%ObjectPrototype%": ["Object", "prototype"],
  "%ObjProto_toString%": ["Object", "prototype", "toString"],
  "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
  "%PromisePrototype%": ["Promise", "prototype"],
  "%PromiseProto_then%": ["Promise", "prototype", "then"],
  "%Promise_all%": ["Promise", "all"],
  "%Promise_reject%": ["Promise", "reject"],
  "%Promise_resolve%": ["Promise", "resolve"],
  "%RangeErrorPrototype%": ["RangeError", "prototype"],
  "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
  "%RegExpPrototype%": ["RegExp", "prototype"],
  "%SetPrototype%": ["Set", "prototype"],
  "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
  "%StringPrototype%": ["String", "prototype"],
  "%SymbolPrototype%": ["Symbol", "prototype"],
  "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
  "%TypedArrayPrototype%": ["TypedArray", "prototype"],
  "%TypeErrorPrototype%": ["TypeError", "prototype"],
  "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
  "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
  "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
  "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
  "%URIErrorPrototype%": ["URIError", "prototype"],
  "%WeakMapPrototype%": ["WeakMap", "prototype"],
  "%WeakSetPrototype%": ["WeakSet", "prototype"]
}, cn = Vn, Dn = ts, xu = cn.call(rn, Array.prototype.concat), vu = cn.call(Bo, Array.prototype.splice), Hs = cn.call(rn, String.prototype.replace), Ln = cn.call(rn, String.prototype.slice), yu = cn.call(rn, RegExp.prototype.exec), bu = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, wu = /\\(\\)?/g, _u = function(e) {
  var t = Ln(e, 0, 1), n = Ln(e, -1);
  if (t === "%" && n !== "%")
    throw new Ot("invalid intrinsic syntax, expected closing `%`");
  if (n === "%" && t !== "%")
    throw new Ot("invalid intrinsic syntax, expected opening `%`");
  var s = [];
  return Hs(e, bu, function(i, o, r, c) {
    s[s.length] = r ? Hs(c, wu, "$1") : o || i;
  }), s;
}, Su = function(e, t) {
  var n = e, s;
  if (Dn(qs, n) && (s = qs[n], n = "%" + s[0] + "%"), Dn(mt, n)) {
    var i = mt[n];
    if (i === At && (i = gu(n)), typeof i > "u" && !t)
      throw new $t("intrinsic " + e + " exists, but is not available. Please file an issue!");
    return {
      alias: s,
      name: n,
      value: i
    };
  }
  throw new Ot("intrinsic " + e + " does not exist!");
}, Cu = function(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new $t("intrinsic name must be a non-empty string");
  if (arguments.length > 1 && typeof t != "boolean")
    throw new $t('"allowMissing" argument must be a boolean');
  if (yu(/^%?[^%]*%?$/, e) === null)
    throw new Ot("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
  var n = _u(e), s = n.length > 0 ? n[0] : "", i = Su("%" + s + "%", t), o = i.name, r = i.value, c = !1, u = i.alias;
  u && (s = u[0], vu(n, xu([0, 1], u)));
  for (var l = 1, p = !0; l < n.length; l += 1) {
    var d = n[l], h = Ln(d, 0, 1), m = Ln(d, -1);
    if ((h === '"' || h === "'" || h === "`" || m === '"' || m === "'" || m === "`") && h !== m)
      throw new Ot("property names with quotes must have matching quotes");
    if ((d === "constructor" || !p) && (c = !0), s += "." + d, o = "%" + s + "%", Dn(mt, o))
      r = mt[o];
    else if (r != null) {
      if (!(d in r)) {
        if (!t)
          throw new $t("base intrinsic for " + e + " exists, but the property is not available.");
        return;
      }
      if (Yt && l + 1 >= n.length) {
        var f = Yt(r, d);
        p = !!f, p && "get" in f && !("originalValue" in f.get) ? r = f.get : r = r[d];
      } else
        p = Dn(r, d), r = r[d];
      p && !c && (mt[o] = r);
    }
  }
  return r;
}, ua, Ws;
function Ru() {
  if (Ws) return ua;
  Ws = 1;
  var a = No();
  return ua = function() {
    return a() && !!Symbol.toStringTag;
  }, ua;
}
var Au = Cu, Vs = Au("%Object.defineProperty%", !0), Eu = Ru()(), ku = ts, Tu = Za, fn = Eu ? Symbol.toStringTag : null, Iu = function(e, t) {
  var n = arguments.length > 2 && !!arguments[2] && arguments[2].force, s = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
  if (typeof n < "u" && typeof n != "boolean" || typeof s < "u" && typeof s != "boolean")
    throw new Tu("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
  fn && (n || !ku(e, fn)) && (Vs ? Vs(e, fn, {
    configurable: !s,
    enumerable: !1,
    value: t,
    writable: !1
  }) : e[fn] = t);
}, Pu = function(a, e) {
  return Object.keys(e).forEach(function(t) {
    a[t] = a[t] || e[t];
  }), a;
}, ns = qc, $u = wt, pa = Yi, Du = Ya, Lu = Xa, Nu = jn.parse, Ou = _r, Mu = Te.Stream, Uu = ao, da = Ro, Fu = gl, Bu = Iu, tt = ts, Oa = Pu;
function B(a) {
  if (!(this instanceof B))
    return new B(a);
  this._overheadLength = 0, this._valueLength = 0, this._valuesToMeasure = [], ns.call(this), a = a || {};
  for (var e in a)
    this[e] = a[e];
}
$u.inherits(B, ns);
B.LINE_BREAK = `\r
`;
B.DEFAULT_CONTENT_TYPE = "application/octet-stream";
B.prototype.append = function(a, e, t) {
  t = t || {}, typeof t == "string" && (t = { filename: t });
  var n = ns.prototype.append.bind(this);
  if ((typeof e == "number" || e == null) && (e = String(e)), Array.isArray(e)) {
    this._error(new Error("Arrays are not supported."));
    return;
  }
  var s = this._multiPartHeader(a, e, t), i = this._multiPartFooter();
  n(s), n(e), n(i), this._trackLength(s, e, t);
};
B.prototype._trackLength = function(a, e, t) {
  var n = 0;
  t.knownLength != null ? n += Number(t.knownLength) : Buffer.isBuffer(e) ? n = e.length : typeof e == "string" && (n = Buffer.byteLength(e)), this._valueLength += n, this._overheadLength += Buffer.byteLength(a) + B.LINE_BREAK.length, !(!e || !e.path && !(e.readable && tt(e, "httpVersion")) && !(e instanceof Mu)) && (t.knownLength || this._valuesToMeasure.push(e));
};
B.prototype._lengthRetriever = function(a, e) {
  tt(a, "fd") ? a.end != null && a.end != 1 / 0 && a.start != null ? e(null, a.end + 1 - (a.start ? a.start : 0)) : Ou.stat(a.path, function(t, n) {
    if (t) {
      e(t);
      return;
    }
    var s = n.size - (a.start ? a.start : 0);
    e(null, s);
  }) : tt(a, "httpVersion") ? e(null, Number(a.headers["content-length"])) : tt(a, "httpModule") ? (a.on("response", function(t) {
    a.pause(), e(null, Number(t.headers["content-length"]));
  }), a.resume()) : e("Unknown stream");
};
B.prototype._multiPartHeader = function(a, e, t) {
  if (typeof t.header == "string")
    return t.header;
  var n = this._getContentDisposition(e, t), s = this._getContentType(e, t), i = "", o = {
    // add custom disposition as third element or keep it two elements if not
    "Content-Disposition": ["form-data", 'name="' + a + '"'].concat(n || []),
    // if no content type. allow it to be empty array
    "Content-Type": [].concat(s || [])
  };
  typeof t.header == "object" && Oa(o, t.header);
  var r;
  for (var c in o)
    if (tt(o, c)) {
      if (r = o[c], r == null)
        continue;
      Array.isArray(r) || (r = [r]), r.length && (i += c + ": " + r.join("; ") + B.LINE_BREAK);
    }
  return "--" + this.getBoundary() + B.LINE_BREAK + i + B.LINE_BREAK;
};
B.prototype._getContentDisposition = function(a, e) {
  var t;
  if (typeof e.filepath == "string" ? t = pa.normalize(e.filepath).replace(/\\/g, "/") : e.filename || a && (a.name || a.path) ? t = pa.basename(e.filename || a && (a.name || a.path)) : a && a.readable && tt(a, "httpVersion") && (t = pa.basename(a.client._httpMessage.path || "")), t)
    return 'filename="' + t + '"';
};
B.prototype._getContentType = function(a, e) {
  var t = e.contentType;
  return !t && a && a.name && (t = da.lookup(a.name)), !t && a && a.path && (t = da.lookup(a.path)), !t && a && a.readable && tt(a, "httpVersion") && (t = a.headers["content-type"]), !t && (e.filepath || e.filename) && (t = da.lookup(e.filepath || e.filename)), !t && a && typeof a == "object" && (t = B.DEFAULT_CONTENT_TYPE), t;
};
B.prototype._multiPartFooter = function() {
  return (function(a) {
    var e = B.LINE_BREAK, t = this._streams.length === 0;
    t && (e += this._lastBoundary()), a(e);
  }).bind(this);
};
B.prototype._lastBoundary = function() {
  return "--" + this.getBoundary() + "--" + B.LINE_BREAK;
};
B.prototype.getHeaders = function(a) {
  var e, t = {
    "content-type": "multipart/form-data; boundary=" + this.getBoundary()
  };
  for (e in a)
    tt(a, e) && (t[e.toLowerCase()] = a[e]);
  return t;
};
B.prototype.setBoundary = function(a) {
  if (typeof a != "string")
    throw new TypeError("FormData boundary must be a string");
  this._boundary = a;
};
B.prototype.getBoundary = function() {
  return this._boundary || this._generateBoundary(), this._boundary;
};
B.prototype.getBuffer = function() {
  for (var a = new Buffer.alloc(0), e = this.getBoundary(), t = 0, n = this._streams.length; t < n; t++)
    typeof this._streams[t] != "function" && (Buffer.isBuffer(this._streams[t]) ? a = Buffer.concat([a, this._streams[t]]) : a = Buffer.concat([a, Buffer.from(this._streams[t])]), (typeof this._streams[t] != "string" || this._streams[t].substring(2, e.length + 2) !== e) && (a = Buffer.concat([a, Buffer.from(B.LINE_BREAK)])));
  return Buffer.concat([a, Buffer.from(this._lastBoundary())]);
};
B.prototype._generateBoundary = function() {
  this._boundary = "--------------------------" + Uu.randomBytes(12).toString("hex");
};
B.prototype.getLengthSync = function() {
  var a = this._overheadLength + this._valueLength;
  return this._streams.length && (a += this._lastBoundary().length), this.hasKnownLength() || this._error(new Error("Cannot calculate proper length in synchronous way.")), a;
};
B.prototype.hasKnownLength = function() {
  var a = !0;
  return this._valuesToMeasure.length && (a = !1), a;
};
B.prototype.getLength = function(a) {
  var e = this._overheadLength + this._valueLength;
  if (this._streams.length && (e += this._lastBoundary().length), !this._valuesToMeasure.length) {
    process.nextTick(a.bind(this, null, e));
    return;
  }
  Fu.parallel(this._valuesToMeasure, this._lengthRetriever, function(t, n) {
    if (t) {
      a(t);
      return;
    }
    n.forEach(function(s) {
      e += s;
    }), a(null, e);
  });
};
B.prototype.submit = function(a, e) {
  var t, n, s = { method: "post" };
  return typeof a == "string" ? (a = Nu(a), n = Oa({
    port: a.port,
    path: a.pathname,
    host: a.hostname,
    protocol: a.protocol
  }, s)) : (n = Oa(a, s), n.port || (n.port = n.protocol === "https:" ? 443 : 80)), n.headers = this.getHeaders(a.headers), n.protocol === "https:" ? t = Lu.request(n) : t = Du.request(n), this.getLength((function(i, o) {
    if (i && i !== "Unknown stream") {
      this._error(i);
      return;
    }
    if (o && t.setHeader("Content-Length", o), this.pipe(t), e) {
      var r, c = function(u, l) {
        return t.removeListener("error", c), t.removeListener("response", r), e.call(this, u, l);
      };
      r = c.bind(this, null), t.on("error", c), t.on("response", r);
    }
  }).bind(this)), t;
};
B.prototype._error = function(a) {
  this.error || (this.error = a, this.pause(), this.emit("error", a));
};
B.prototype.toString = function() {
  return "[object FormData]";
};
Bu(B.prototype, "FormData");
var ju = B;
const jo = /* @__PURE__ */ _o(ju);
function Ma(a) {
  return x.isPlainObject(a) || x.isArray(a);
}
function zo(a) {
  return x.endsWith(a, "[]") ? a.slice(0, -2) : a;
}
function Gs(a, e, t) {
  return a ? a.concat(e).map(function(s, i) {
    return s = zo(s), !t && i ? "[" + s + "]" : s;
  }).join(t ? "." : "") : e;
}
function zu(a) {
  return x.isArray(a) && !a.some(Ma);
}
const qu = x.toFlatObject(x, {}, null, function(e) {
  return /^is[A-Z]/.test(e);
});
function Gn(a, e, t) {
  if (!x.isObject(a))
    throw new TypeError("target must be an object");
  e = e || new (jo || FormData)(), t = x.toFlatObject(t, {
    metaTokens: !0,
    dots: !1,
    indexes: !1
  }, !1, function(f, g) {
    return !x.isUndefined(g[f]);
  });
  const n = t.metaTokens, s = t.visitor || l, i = t.dots, o = t.indexes, c = (t.Blob || typeof Blob < "u" && Blob) && x.isSpecCompliantForm(e);
  if (!x.isFunction(s))
    throw new TypeError("visitor must be a function");
  function u(m) {
    if (m === null) return "";
    if (x.isDate(m))
      return m.toISOString();
    if (x.isBoolean(m))
      return m.toString();
    if (!c && x.isBlob(m))
      throw new E("Blob is not supported. Use a Buffer instead.");
    return x.isArrayBuffer(m) || x.isTypedArray(m) ? c && typeof Blob == "function" ? new Blob([m]) : Buffer.from(m) : m;
  }
  function l(m, f, g) {
    let v = m;
    if (m && !g && typeof m == "object") {
      if (x.endsWith(f, "{}"))
        f = n ? f : f.slice(0, -2), m = JSON.stringify(m);
      else if (x.isArray(m) && zu(m) || (x.isFileList(m) || x.endsWith(f, "[]")) && (v = x.toArray(m)))
        return f = zo(f), v.forEach(function(b, S) {
          !(x.isUndefined(b) || b === null) && e.append(
            // eslint-disable-next-line no-nested-ternary
            o === !0 ? Gs([f], S, i) : o === null ? f : f + "[]",
            u(b)
          );
        }), !1;
    }
    return Ma(m) ? !0 : (e.append(Gs(g, f, i), u(m)), !1);
  }
  const p = [], d = Object.assign(qu, {
    defaultVisitor: l,
    convertValue: u,
    isVisitable: Ma
  });
  function h(m, f) {
    if (!x.isUndefined(m)) {
      if (p.indexOf(m) !== -1)
        throw Error("Circular reference detected in " + f.join("."));
      p.push(m), x.forEach(m, function(v, y) {
        (!(x.isUndefined(v) || v === null) && s.call(
          e,
          v,
          x.isString(y) ? y.trim() : y,
          f,
          d
        )) === !0 && h(v, f ? f.concat(y) : [y]);
      }), p.pop();
    }
  }
  if (!x.isObject(a))
    throw new TypeError("data must be an object");
  return h(a), e;
}
function Js(a) {
  const e = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(a).replace(/[!'()~]|%20|%00/g, function(n) {
    return e[n];
  });
}
function qo(a, e) {
  this._pairs = [], a && Gn(a, this, e);
}
const Ho = qo.prototype;
Ho.append = function(e, t) {
  this._pairs.push([e, t]);
};
Ho.toString = function(e) {
  const t = e ? function(n) {
    return e.call(this, n, Js);
  } : Js;
  return this._pairs.map(function(s) {
    return t(s[0]) + "=" + t(s[1]);
  }, "").join("&");
};
function Hu(a) {
  return encodeURIComponent(a).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function as(a, e, t) {
  if (!e)
    return a;
  const n = t && t.encode || Hu, s = x.isFunction(t) ? {
    serialize: t
  } : t, i = s && s.serialize;
  let o;
  if (i ? o = i(e, s) : o = x.isURLSearchParams(e) ? e.toString() : new qo(e, s).toString(n), o) {
    const r = a.indexOf("#");
    r !== -1 && (a = a.slice(0, r)), a += (a.indexOf("?") === -1 ? "?" : "&") + o;
  }
  return a;
}
class Ks {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(e, t, n) {
    return this.handlers.push({
      fulfilled: e,
      rejected: t,
      synchronous: n ? n.synchronous : !1,
      runWhen: n ? n.runWhen : null
    }), this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(e) {
    this.handlers[e] && (this.handlers[e] = null);
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    this.handlers && (this.handlers = []);
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(e) {
    x.forEach(this.handlers, function(n) {
      n !== null && e(n);
    });
  }
}
const ss = {
  silentJSONParsing: !0,
  forcedJSONParsing: !0,
  clarifyTimeoutError: !1
}, Wu = jn.URLSearchParams, ma = "abcdefghijklmnopqrstuvwxyz", Xs = "0123456789", Wo = {
  DIGIT: Xs,
  ALPHA: ma,
  ALPHA_DIGIT: ma + ma.toUpperCase() + Xs
}, Vu = (a = 16, e = Wo.ALPHA_DIGIT) => {
  let t = "";
  const { length: n } = e, s = new Uint32Array(a);
  ao.randomFillSync(s);
  for (let i = 0; i < a; i++)
    t += e[s[i] % n];
  return t;
}, Gu = {
  isNode: !0,
  classes: {
    URLSearchParams: Wu,
    FormData: jo,
    Blob: typeof Blob < "u" && Blob || null
  },
  ALPHABET: Wo,
  generateString: Vu,
  protocols: ["http", "https", "file", "data"]
}, is = typeof window < "u" && typeof document < "u", Ua = typeof navigator == "object" && navigator || void 0, Ju = is && (!Ua || ["ReactNative", "NativeScript", "NS"].indexOf(Ua.product) < 0), Ku = typeof WorkerGlobalScope < "u" && // eslint-disable-next-line no-undef
self instanceof WorkerGlobalScope && typeof self.importScripts == "function", Xu = is && window.location.href || "http://localhost", Yu = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv: is,
  hasStandardBrowserEnv: Ju,
  hasStandardBrowserWebWorkerEnv: Ku,
  navigator: Ua,
  origin: Xu
}, Symbol.toStringTag, { value: "Module" })), oe = {
  ...Yu,
  ...Gu
};
function Qu(a, e) {
  return Gn(a, new oe.classes.URLSearchParams(), {
    visitor: function(t, n, s, i) {
      return oe.isNode && x.isBuffer(t) ? (this.append(n, t.toString("base64")), !1) : i.defaultVisitor.apply(this, arguments);
    },
    ...e
  });
}
function Zu(a) {
  return x.matchAll(/\w+|\[(\w*)]/g, a).map((e) => e[0] === "[]" ? "" : e[1] || e[0]);
}
function ep(a) {
  const e = {}, t = Object.keys(a);
  let n;
  const s = t.length;
  let i;
  for (n = 0; n < s; n++)
    i = t[n], e[i] = a[i];
  return e;
}
function Vo(a) {
  function e(t, n, s, i) {
    let o = t[i++];
    if (o === "__proto__") return !0;
    const r = Number.isFinite(+o), c = i >= t.length;
    return o = !o && x.isArray(s) ? s.length : o, c ? (x.hasOwnProp(s, o) ? s[o] = [s[o], n] : s[o] = n, !r) : ((!s[o] || !x.isObject(s[o])) && (s[o] = []), e(t, n, s[o], i) && x.isArray(s[o]) && (s[o] = ep(s[o])), !r);
  }
  if (x.isFormData(a) && x.isFunction(a.entries)) {
    const t = {};
    return x.forEachEntry(a, (n, s) => {
      e(Zu(n), s, t, 0);
    }), t;
  }
  return null;
}
function tp(a, e, t) {
  if (x.isString(a))
    try {
      return (e || JSON.parse)(a), x.trim(a);
    } catch (n) {
      if (n.name !== "SyntaxError")
        throw n;
    }
  return (t || JSON.stringify)(a);
}
const ln = {
  transitional: ss,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function(e, t) {
    const n = t.getContentType() || "", s = n.indexOf("application/json") > -1, i = x.isObject(e);
    if (i && x.isHTMLForm(e) && (e = new FormData(e)), x.isFormData(e))
      return s ? JSON.stringify(Vo(e)) : e;
    if (x.isArrayBuffer(e) || x.isBuffer(e) || x.isStream(e) || x.isFile(e) || x.isBlob(e) || x.isReadableStream(e))
      return e;
    if (x.isArrayBufferView(e))
      return e.buffer;
    if (x.isURLSearchParams(e))
      return t.setContentType("application/x-www-form-urlencoded;charset=utf-8", !1), e.toString();
    let r;
    if (i) {
      if (n.indexOf("application/x-www-form-urlencoded") > -1)
        return Qu(e, this.formSerializer).toString();
      if ((r = x.isFileList(e)) || n.indexOf("multipart/form-data") > -1) {
        const c = this.env && this.env.FormData;
        return Gn(
          r ? { "files[]": e } : e,
          c && new c(),
          this.formSerializer
        );
      }
    }
    return i || s ? (t.setContentType("application/json", !1), tp(e)) : e;
  }],
  transformResponse: [function(e) {
    const t = this.transitional || ln.transitional, n = t && t.forcedJSONParsing, s = this.responseType === "json";
    if (x.isResponse(e) || x.isReadableStream(e))
      return e;
    if (e && x.isString(e) && (n && !this.responseType || s)) {
      const o = !(t && t.silentJSONParsing) && s;
      try {
        return JSON.parse(e, this.parseReviver);
      } catch (r) {
        if (o)
          throw r.name === "SyntaxError" ? E.from(r, E.ERR_BAD_RESPONSE, this, null, this.response) : r;
      }
    }
    return e;
  }],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: oe.classes.FormData,
    Blob: oe.classes.Blob
  },
  validateStatus: function(e) {
    return e >= 200 && e < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
x.forEach(["delete", "get", "head", "post", "put", "patch"], (a) => {
  ln.headers[a] = {};
});
const np = x.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]), ap = (a) => {
  const e = {};
  let t, n, s;
  return a && a.split(`
`).forEach(function(o) {
    s = o.indexOf(":"), t = o.substring(0, s).trim().toLowerCase(), n = o.substring(s + 1).trim(), !(!t || e[t] && np[t]) && (t === "set-cookie" ? e[t] ? e[t].push(n) : e[t] = [n] : e[t] = e[t] ? e[t] + ", " + n : n);
  }), e;
}, Ys = Symbol("internals");
function qt(a) {
  return a && String(a).trim().toLowerCase();
}
function Tn(a) {
  return a === !1 || a == null ? a : x.isArray(a) ? a.map(Tn) : String(a);
}
function sp(a) {
  const e = /* @__PURE__ */ Object.create(null), t = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let n;
  for (; n = t.exec(a); )
    e[n[1]] = n[2];
  return e;
}
const ip = (a) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(a.trim());
function fa(a, e, t, n, s) {
  if (x.isFunction(n))
    return n.call(this, e, t);
  if (s && (e = t), !!x.isString(e)) {
    if (x.isString(n))
      return e.indexOf(n) !== -1;
    if (x.isRegExp(n))
      return n.test(e);
  }
}
function op(a) {
  return a.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (e, t, n) => t.toUpperCase() + n);
}
function rp(a, e) {
  const t = x.toCamelCase(" " + e);
  ["get", "set", "has"].forEach((n) => {
    Object.defineProperty(a, n + t, {
      value: function(s, i, o) {
        return this[n].call(this, e, s, i, o);
      },
      configurable: !0
    });
  });
}
let _e = class {
  constructor(e) {
    e && this.set(e);
  }
  set(e, t, n) {
    const s = this;
    function i(r, c, u) {
      const l = qt(c);
      if (!l)
        throw new Error("header name must be a non-empty string");
      const p = x.findKey(s, l);
      (!p || s[p] === void 0 || u === !0 || u === void 0 && s[p] !== !1) && (s[p || c] = Tn(r));
    }
    const o = (r, c) => x.forEach(r, (u, l) => i(u, l, c));
    if (x.isPlainObject(e) || e instanceof this.constructor)
      o(e, t);
    else if (x.isString(e) && (e = e.trim()) && !ip(e))
      o(ap(e), t);
    else if (x.isObject(e) && x.isIterable(e)) {
      let r = {}, c, u;
      for (const l of e) {
        if (!x.isArray(l))
          throw TypeError("Object iterator must return a key-value pair");
        r[u = l[0]] = (c = r[u]) ? x.isArray(c) ? [...c, l[1]] : [c, l[1]] : l[1];
      }
      o(r, t);
    } else
      e != null && i(t, e, n);
    return this;
  }
  get(e, t) {
    if (e = qt(e), e) {
      const n = x.findKey(this, e);
      if (n) {
        const s = this[n];
        if (!t)
          return s;
        if (t === !0)
          return sp(s);
        if (x.isFunction(t))
          return t.call(this, s, n);
        if (x.isRegExp(t))
          return t.exec(s);
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(e, t) {
    if (e = qt(e), e) {
      const n = x.findKey(this, e);
      return !!(n && this[n] !== void 0 && (!t || fa(this, this[n], n, t)));
    }
    return !1;
  }
  delete(e, t) {
    const n = this;
    let s = !1;
    function i(o) {
      if (o = qt(o), o) {
        const r = x.findKey(n, o);
        r && (!t || fa(n, n[r], r, t)) && (delete n[r], s = !0);
      }
    }
    return x.isArray(e) ? e.forEach(i) : i(e), s;
  }
  clear(e) {
    const t = Object.keys(this);
    let n = t.length, s = !1;
    for (; n--; ) {
      const i = t[n];
      (!e || fa(this, this[i], i, e, !0)) && (delete this[i], s = !0);
    }
    return s;
  }
  normalize(e) {
    const t = this, n = {};
    return x.forEach(this, (s, i) => {
      const o = x.findKey(n, i);
      if (o) {
        t[o] = Tn(s), delete t[i];
        return;
      }
      const r = e ? op(i) : String(i).trim();
      r !== i && delete t[i], t[r] = Tn(s), n[r] = !0;
    }), this;
  }
  concat(...e) {
    return this.constructor.concat(this, ...e);
  }
  toJSON(e) {
    const t = /* @__PURE__ */ Object.create(null);
    return x.forEach(this, (n, s) => {
      n != null && n !== !1 && (t[s] = e && x.isArray(n) ? n.join(", ") : n);
    }), t;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([e, t]) => e + ": " + t).join(`
`);
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(e) {
    return e instanceof this ? e : new this(e);
  }
  static concat(e, ...t) {
    const n = new this(e);
    return t.forEach((s) => n.set(s)), n;
  }
  static accessor(e) {
    const n = (this[Ys] = this[Ys] = {
      accessors: {}
    }).accessors, s = this.prototype;
    function i(o) {
      const r = qt(o);
      n[r] || (rp(s, o), n[r] = !0);
    }
    return x.isArray(e) ? e.forEach(i) : i(e), this;
  }
};
_e.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
x.reduceDescriptors(_e.prototype, ({ value: a }, e) => {
  let t = e[0].toUpperCase() + e.slice(1);
  return {
    get: () => a,
    set(n) {
      this[t] = n;
    }
  };
});
x.freezeMethods(_e);
function ha(a, e) {
  const t = this || ln, n = e || t, s = _e.from(n.headers);
  let i = n.data;
  return x.forEach(a, function(r) {
    i = r.call(t, i, s.normalize(), e ? e.status : void 0);
  }), s.normalize(), i;
}
function Go(a) {
  return !!(a && a.__CANCEL__);
}
let vt = class extends E {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(e, t, n) {
    super(e ?? "canceled", E.ERR_CANCELED, t, n), this.name = "CanceledError", this.__CANCEL__ = !0;
  }
};
function Tt(a, e, t) {
  const n = t.config.validateStatus;
  !t.status || !n || n(t.status) ? a(t) : e(new E(
    "Request failed with status code " + t.status,
    [E.ERR_BAD_REQUEST, E.ERR_BAD_RESPONSE][Math.floor(t.status / 100) - 4],
    t.config,
    t.request,
    t
  ));
}
function cp(a) {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(a);
}
function lp(a, e) {
  return e ? a.replace(/\/?\/$/, "") + "/" + e.replace(/^\/+/, "") : a;
}
function os(a, e, t) {
  let n = !cp(e);
  return a && (n || t == !1) ? lp(a, e) : e;
}
var Jo = {}, up = jn.parse, pp = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443
}, dp = String.prototype.endsWith || function(a) {
  return a.length <= this.length && this.indexOf(a, this.length - a.length) !== -1;
};
function mp(a) {
  var e = typeof a == "string" ? up(a) : a || {}, t = e.protocol, n = e.host, s = e.port;
  if (typeof n != "string" || !n || typeof t != "string" || (t = t.split(":", 1)[0], n = n.replace(/:\d*$/, ""), s = parseInt(s) || pp[t] || 0, !fp(n, s)))
    return "";
  var i = It("npm_config_" + t + "_proxy") || It(t + "_proxy") || It("npm_config_proxy") || It("all_proxy");
  return i && i.indexOf("://") === -1 && (i = t + "://" + i), i;
}
function fp(a, e) {
  var t = (It("npm_config_no_proxy") || It("no_proxy")).toLowerCase();
  return t ? t === "*" ? !1 : t.split(/[,\s]/).every(function(n) {
    if (!n)
      return !0;
    var s = n.match(/^(.+):(\d+)$/), i = s ? s[1] : n, o = s ? parseInt(s[2]) : 0;
    return o && o !== e ? !0 : /^[.*]/.test(i) ? (i.charAt(0) === "*" && (i = i.slice(1)), !dp.call(a, i)) : a !== i;
  }) : !0;
}
function It(a) {
  return process.env[a.toLowerCase()] || process.env[a.toUpperCase()] || "";
}
Jo.getProxyForUrl = mp;
var rs = { exports: {} }, hn = { exports: {} }, gn = { exports: {} }, ga, Qs;
function hp() {
  if (Qs) return ga;
  Qs = 1;
  var a = 1e3, e = a * 60, t = e * 60, n = t * 24, s = n * 7, i = n * 365.25;
  ga = function(l, p) {
    p = p || {};
    var d = typeof l;
    if (d === "string" && l.length > 0)
      return o(l);
    if (d === "number" && isFinite(l))
      return p.long ? c(l) : r(l);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(l)
    );
  };
  function o(l) {
    if (l = String(l), !(l.length > 100)) {
      var p = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        l
      );
      if (p) {
        var d = parseFloat(p[1]), h = (p[2] || "ms").toLowerCase();
        switch (h) {
          case "years":
          case "year":
          case "yrs":
          case "yr":
          case "y":
            return d * i;
          case "weeks":
          case "week":
          case "w":
            return d * s;
          case "days":
          case "day":
          case "d":
            return d * n;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            return d * t;
          case "minutes":
          case "minute":
          case "mins":
          case "min":
          case "m":
            return d * e;
          case "seconds":
          case "second":
          case "secs":
          case "sec":
          case "s":
            return d * a;
          case "milliseconds":
          case "millisecond":
          case "msecs":
          case "msec":
          case "ms":
            return d;
          default:
            return;
        }
      }
    }
  }
  function r(l) {
    var p = Math.abs(l);
    return p >= n ? Math.round(l / n) + "d" : p >= t ? Math.round(l / t) + "h" : p >= e ? Math.round(l / e) + "m" : p >= a ? Math.round(l / a) + "s" : l + "ms";
  }
  function c(l) {
    var p = Math.abs(l);
    return p >= n ? u(l, p, n, "day") : p >= t ? u(l, p, t, "hour") : p >= e ? u(l, p, e, "minute") : p >= a ? u(l, p, a, "second") : l + " ms";
  }
  function u(l, p, d, h) {
    var m = p >= d * 1.5;
    return Math.round(l / d) + " " + h + (m ? "s" : "");
  }
  return ga;
}
var xa, Zs;
function Ko() {
  if (Zs) return xa;
  Zs = 1;
  function a(e) {
    n.debug = n, n.default = n, n.coerce = u, n.disable = r, n.enable = i, n.enabled = c, n.humanize = hp(), n.destroy = l, Object.keys(e).forEach((p) => {
      n[p] = e[p];
    }), n.names = [], n.skips = [], n.formatters = {};
    function t(p) {
      let d = 0;
      for (let h = 0; h < p.length; h++)
        d = (d << 5) - d + p.charCodeAt(h), d |= 0;
      return n.colors[Math.abs(d) % n.colors.length];
    }
    n.selectColor = t;
    function n(p) {
      let d, h = null, m, f;
      function g(...v) {
        if (!g.enabled)
          return;
        const y = g, b = Number(/* @__PURE__ */ new Date()), S = b - (d || b);
        y.diff = S, y.prev = d, y.curr = b, d = b, v[0] = n.coerce(v[0]), typeof v[0] != "string" && v.unshift("%O");
        let C = 0;
        v[0] = v[0].replace(/%([a-zA-Z%])/g, (k, P) => {
          if (k === "%%")
            return "%";
          C++;
          const T = n.formatters[P];
          if (typeof T == "function") {
            const L = v[C];
            k = T.call(y, L), v.splice(C, 1), C--;
          }
          return k;
        }), n.formatArgs.call(y, v), (y.log || n.log).apply(y, v);
      }
      return g.namespace = p, g.useColors = n.useColors(), g.color = n.selectColor(p), g.extend = s, g.destroy = n.destroy, Object.defineProperty(g, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => h !== null ? h : (m !== n.namespaces && (m = n.namespaces, f = n.enabled(p)), f),
        set: (v) => {
          h = v;
        }
      }), typeof n.init == "function" && n.init(g), g;
    }
    function s(p, d) {
      const h = n(this.namespace + (typeof d > "u" ? ":" : d) + p);
      return h.log = this.log, h;
    }
    function i(p) {
      n.save(p), n.namespaces = p, n.names = [], n.skips = [];
      const d = (typeof p == "string" ? p : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const h of d)
        h[0] === "-" ? n.skips.push(h.slice(1)) : n.names.push(h);
    }
    function o(p, d) {
      let h = 0, m = 0, f = -1, g = 0;
      for (; h < p.length; )
        if (m < d.length && (d[m] === p[h] || d[m] === "*"))
          d[m] === "*" ? (f = m, g = h, m++) : (h++, m++);
        else if (f !== -1)
          m = f + 1, g++, h = g;
        else
          return !1;
      for (; m < d.length && d[m] === "*"; )
        m++;
      return m === d.length;
    }
    function r() {
      const p = [
        ...n.names,
        ...n.skips.map((d) => "-" + d)
      ].join(",");
      return n.enable(""), p;
    }
    function c(p) {
      for (const d of n.skips)
        if (o(p, d))
          return !1;
      for (const d of n.names)
        if (o(p, d))
          return !0;
      return !1;
    }
    function u(p) {
      return p instanceof Error ? p.stack || p.message : p;
    }
    function l() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return n.enable(n.load()), n;
  }
  return xa = a, xa;
}
var ei;
function gp() {
  return ei || (ei = 1, function(a, e) {
    e.formatArgs = n, e.save = s, e.load = i, e.useColors = t, e.storage = o(), e.destroy = /* @__PURE__ */ (() => {
      let c = !1;
      return () => {
        c || (c = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
      };
    })(), e.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function t() {
      if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs))
        return !0;
      if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))
        return !1;
      let c;
      return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator < "u" && navigator.userAgent && (c = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(c[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function n(c) {
      if (c[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + c[0] + (this.useColors ? "%c " : " ") + "+" + a.exports.humanize(this.diff), !this.useColors)
        return;
      const u = "color: " + this.color;
      c.splice(1, 0, u, "color: inherit");
      let l = 0, p = 0;
      c[0].replace(/%[a-zA-Z%]/g, (d) => {
        d !== "%%" && (l++, d === "%c" && (p = l));
      }), c.splice(p, 0, u);
    }
    e.log = console.debug || console.log || (() => {
    });
    function s(c) {
      try {
        c ? e.storage.setItem("debug", c) : e.storage.removeItem("debug");
      } catch {
      }
    }
    function i() {
      let c;
      try {
        c = e.storage.getItem("debug") || e.storage.getItem("DEBUG");
      } catch {
      }
      return !c && typeof process < "u" && "env" in process && (c = process.env.DEBUG), c;
    }
    function o() {
      try {
        return localStorage;
      } catch {
      }
    }
    a.exports = Ko()(e);
    const { formatters: r } = a.exports;
    r.j = function(c) {
      try {
        return JSON.stringify(c);
      } catch (u) {
        return "[UnexpectedJSONParseError]: " + u.message;
      }
    };
  }(gn, gn.exports)), gn.exports;
}
var xn = { exports: {} }, va, ti;
function xp() {
  return ti || (ti = 1, va = (a, e) => {
    e = e || process.argv;
    const t = a.startsWith("-") ? "" : a.length === 1 ? "-" : "--", n = e.indexOf(t + a), s = e.indexOf("--");
    return n !== -1 && (s === -1 ? !0 : n < s);
  }), va;
}
var ya, ni;
function vp() {
  if (ni) return ya;
  ni = 1;
  const a = Dr, e = xp(), t = process.env;
  let n;
  e("no-color") || e("no-colors") || e("color=false") ? n = !1 : (e("color") || e("colors") || e("color=true") || e("color=always")) && (n = !0), "FORCE_COLOR" in t && (n = t.FORCE_COLOR.length === 0 || parseInt(t.FORCE_COLOR, 10) !== 0);
  function s(r) {
    return r === 0 ? !1 : {
      level: r,
      hasBasic: !0,
      has256: r >= 2,
      has16m: r >= 3
    };
  }
  function i(r) {
    if (n === !1)
      return 0;
    if (e("color=16m") || e("color=full") || e("color=truecolor"))
      return 3;
    if (e("color=256"))
      return 2;
    if (r && !r.isTTY && n !== !0)
      return 0;
    const c = n ? 1 : 0;
    if (process.platform === "win32") {
      const u = a.release().split(".");
      return Number(process.versions.node.split(".")[0]) >= 8 && Number(u[0]) >= 10 && Number(u[2]) >= 10586 ? Number(u[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in t)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI"].some((u) => u in t) || t.CI_NAME === "codeship" ? 1 : c;
    if ("TEAMCITY_VERSION" in t)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(t.TEAMCITY_VERSION) ? 1 : 0;
    if (t.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in t) {
      const u = parseInt((t.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (t.TERM_PROGRAM) {
        case "iTerm.app":
          return u >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(t.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(t.TERM) || "COLORTERM" in t ? 1 : (t.TERM === "dumb", c);
  }
  function o(r) {
    const c = i(r);
    return s(c);
  }
  return ya = {
    supportsColor: o,
    stdout: o(process.stdout),
    stderr: o(process.stderr)
  }, ya;
}
var ai;
function yp() {
  return ai || (ai = 1, function(a, e) {
    const t = $r, n = wt;
    e.init = l, e.log = r, e.formatArgs = i, e.save = c, e.load = u, e.useColors = s, e.destroy = n.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), e.colors = [6, 2, 3, 4, 5, 1];
    try {
      const d = vp();
      d && (d.stderr || d).level >= 2 && (e.colors = [
        20,
        21,
        26,
        27,
        32,
        33,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        56,
        57,
        62,
        63,
        68,
        69,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        92,
        93,
        98,
        99,
        112,
        113,
        128,
        129,
        134,
        135,
        148,
        149,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        178,
        179,
        184,
        185,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        203,
        204,
        205,
        206,
        207,
        208,
        209,
        214,
        215,
        220,
        221
      ]);
    } catch {
    }
    e.inspectOpts = Object.keys(process.env).filter((d) => /^debug_/i.test(d)).reduce((d, h) => {
      const m = h.substring(6).toLowerCase().replace(/_([a-z])/g, (g, v) => v.toUpperCase());
      let f = process.env[h];
      return /^(yes|on|true|enabled)$/i.test(f) ? f = !0 : /^(no|off|false|disabled)$/i.test(f) ? f = !1 : f === "null" ? f = null : f = Number(f), d[m] = f, d;
    }, {});
    function s() {
      return "colors" in e.inspectOpts ? !!e.inspectOpts.colors : t.isatty(process.stderr.fd);
    }
    function i(d) {
      const { namespace: h, useColors: m } = this;
      if (m) {
        const f = this.color, g = "\x1B[3" + (f < 8 ? f : "8;5;" + f), v = `  ${g};1m${h} \x1B[0m`;
        d[0] = v + d[0].split(`
`).join(`
` + v), d.push(g + "m+" + a.exports.humanize(this.diff) + "\x1B[0m");
      } else
        d[0] = o() + h + " " + d[0];
    }
    function o() {
      return e.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function r(...d) {
      return process.stderr.write(n.formatWithOptions(e.inspectOpts, ...d) + `
`);
    }
    function c(d) {
      d ? process.env.DEBUG = d : delete process.env.DEBUG;
    }
    function u() {
      return process.env.DEBUG;
    }
    function l(d) {
      d.inspectOpts = {};
      const h = Object.keys(e.inspectOpts);
      for (let m = 0; m < h.length; m++)
        d.inspectOpts[h[m]] = e.inspectOpts[h[m]];
    }
    a.exports = Ko()(e);
    const { formatters: p } = a.exports;
    p.o = function(d) {
      return this.inspectOpts.colors = this.useColors, n.inspect(d, this.inspectOpts).split(`
`).map((h) => h.trim()).join(" ");
    }, p.O = function(d) {
      return this.inspectOpts.colors = this.useColors, n.inspect(d, this.inspectOpts);
    };
  }(xn, xn.exports)), xn.exports;
}
var si;
function bp() {
  return si || (si = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? hn.exports = gp() : hn.exports = yp()), hn.exports;
}
var Ht, wp = function() {
  if (!Ht) {
    try {
      Ht = bp()("follow-redirects");
    } catch {
    }
    typeof Ht != "function" && (Ht = function() {
    });
  }
  Ht.apply(null, arguments);
}, un = jn, Qt = un.URL, _p = Ya, Sp = Xa, cs = Te.Writable, ls = Pr, Xo = wp;
(function() {
  var e = typeof process < "u", t = typeof window < "u" && typeof document < "u", n = yt(Error.captureStackTrace);
  !e && (t || !n) && console.warn("The follow-redirects package should be excluded from browser builds.");
})();
var us = !1;
try {
  ls(new Qt(""));
} catch (a) {
  us = a.code === "ERR_INVALID_URL";
}
var Cp = [
  "auth",
  "host",
  "hostname",
  "href",
  "path",
  "pathname",
  "port",
  "protocol",
  "query",
  "search",
  "hash"
], ps = ["abort", "aborted", "connect", "error", "socket", "timeout"], ds = /* @__PURE__ */ Object.create(null);
ps.forEach(function(a) {
  ds[a] = function(e, t, n) {
    this._redirectable.emit(a, e, t, n);
  };
});
var Fa = pn(
  "ERR_INVALID_URL",
  "Invalid URL",
  TypeError
), Ba = pn(
  "ERR_FR_REDIRECTION_FAILURE",
  "Redirected request failed"
), Rp = pn(
  "ERR_FR_TOO_MANY_REDIRECTS",
  "Maximum number of redirects exceeded",
  Ba
), Ap = pn(
  "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
  "Request body larger than maxBodyLength limit"
), Ep = pn(
  "ERR_STREAM_WRITE_AFTER_END",
  "write after end"
), kp = cs.prototype.destroy || Qo;
function $e(a, e) {
  cs.call(this), this._sanitizeOptions(a), this._options = a, this._ended = !1, this._ending = !1, this._redirectCount = 0, this._redirects = [], this._requestBodyLength = 0, this._requestBodyBuffers = [], e && this.on("response", e);
  var t = this;
  this._onNativeResponse = function(n) {
    try {
      t._processResponse(n);
    } catch (s) {
      t.emit("error", s instanceof Ba ? s : new Ba({ cause: s }));
    }
  }, this._performRequest();
}
$e.prototype = Object.create(cs.prototype);
$e.prototype.abort = function() {
  fs(this._currentRequest), this._currentRequest.abort(), this.emit("abort");
};
$e.prototype.destroy = function(a) {
  return fs(this._currentRequest, a), kp.call(this, a), this;
};
$e.prototype.write = function(a, e, t) {
  if (this._ending)
    throw new Ep();
  if (!ft(a) && !Pp(a))
    throw new TypeError("data should be a string, Buffer or Uint8Array");
  if (yt(e) && (t = e, e = null), a.length === 0) {
    t && t();
    return;
  }
  this._requestBodyLength + a.length <= this._options.maxBodyLength ? (this._requestBodyLength += a.length, this._requestBodyBuffers.push({ data: a, encoding: e }), this._currentRequest.write(a, e, t)) : (this.emit("error", new Ap()), this.abort());
};
$e.prototype.end = function(a, e, t) {
  if (yt(a) ? (t = a, a = e = null) : yt(e) && (t = e, e = null), !a)
    this._ended = this._ending = !0, this._currentRequest.end(null, null, t);
  else {
    var n = this, s = this._currentRequest;
    this.write(a, e, function() {
      n._ended = !0, s.end(null, null, t);
    }), this._ending = !0;
  }
};
$e.prototype.setHeader = function(a, e) {
  this._options.headers[a] = e, this._currentRequest.setHeader(a, e);
};
$e.prototype.removeHeader = function(a) {
  delete this._options.headers[a], this._currentRequest.removeHeader(a);
};
$e.prototype.setTimeout = function(a, e) {
  var t = this;
  function n(o) {
    o.setTimeout(a), o.removeListener("timeout", o.destroy), o.addListener("timeout", o.destroy);
  }
  function s(o) {
    t._timeout && clearTimeout(t._timeout), t._timeout = setTimeout(function() {
      t.emit("timeout"), i();
    }, a), n(o);
  }
  function i() {
    t._timeout && (clearTimeout(t._timeout), t._timeout = null), t.removeListener("abort", i), t.removeListener("error", i), t.removeListener("response", i), t.removeListener("close", i), e && t.removeListener("timeout", e), t.socket || t._currentRequest.removeListener("socket", s);
  }
  return e && this.on("timeout", e), this.socket ? s(this.socket) : this._currentRequest.once("socket", s), this.on("socket", n), this.on("abort", i), this.on("error", i), this.on("response", i), this.on("close", i), this;
};
[
  "flushHeaders",
  "getHeader",
  "setNoDelay",
  "setSocketKeepAlive"
].forEach(function(a) {
  $e.prototype[a] = function(e, t) {
    return this._currentRequest[a](e, t);
  };
});
["aborted", "connection", "socket"].forEach(function(a) {
  Object.defineProperty($e.prototype, a, {
    get: function() {
      return this._currentRequest[a];
    }
  });
});
$e.prototype._sanitizeOptions = function(a) {
  if (a.headers || (a.headers = {}), a.host && (a.hostname || (a.hostname = a.host), delete a.host), !a.pathname && a.path) {
    var e = a.path.indexOf("?");
    e < 0 ? a.pathname = a.path : (a.pathname = a.path.substring(0, e), a.search = a.path.substring(e));
  }
};
$e.prototype._performRequest = function() {
  var a = this._options.protocol, e = this._options.nativeProtocols[a];
  if (!e)
    throw new TypeError("Unsupported protocol " + a);
  if (this._options.agents) {
    var t = a.slice(0, -1);
    this._options.agent = this._options.agents[t];
  }
  var n = this._currentRequest = e.request(this._options, this._onNativeResponse);
  n._redirectable = this;
  for (var s of ps)
    n.on(s, ds[s]);
  if (this._currentUrl = /^\//.test(this._options.path) ? un.format(this._options) : (
    // When making a request to a proxy, […]
    // a client MUST send the target URI in absolute-form […].
    this._options.path
  ), this._isRedirect) {
    var i = 0, o = this, r = this._requestBodyBuffers;
    (function c(u) {
      if (n === o._currentRequest)
        if (u)
          o.emit("error", u);
        else if (i < r.length) {
          var l = r[i++];
          n.finished || n.write(l.data, l.encoding, c);
        } else o._ended && n.end();
    })();
  }
};
$e.prototype._processResponse = function(a) {
  var e = a.statusCode;
  this._options.trackRedirects && this._redirects.push({
    url: this._currentUrl,
    headers: a.headers,
    statusCode: e
  });
  var t = a.headers.location;
  if (!t || this._options.followRedirects === !1 || e < 300 || e >= 400) {
    a.responseUrl = this._currentUrl, a.redirects = this._redirects, this.emit("response", a), this._requestBodyBuffers = [];
    return;
  }
  if (fs(this._currentRequest), a.destroy(), ++this._redirectCount > this._options.maxRedirects)
    throw new Rp();
  var n, s = this._options.beforeRedirect;
  s && (n = Object.assign({
    // The Host header was set by nativeProtocol.request
    Host: a.req.getHeader("host")
  }, this._options.headers));
  var i = this._options.method;
  ((e === 301 || e === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
  // the server is redirecting the user agent to a different resource […]
  // A user agent can perform a retrieval request targeting that URI
  // (a GET or HEAD request if using HTTP) […]
  e === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) && (this._options.method = "GET", this._requestBodyBuffers = [], ba(/^content-/i, this._options.headers));
  var o = ba(/^host$/i, this._options.headers), r = ms(this._currentUrl), c = o || r.host, u = /^\w+:/.test(t) ? this._currentUrl : un.format(Object.assign(r, { host: c })), l = Tp(t, u);
  if (Xo("redirecting to", l.href), this._isRedirect = !0, ja(l, this._options), (l.protocol !== r.protocol && l.protocol !== "https:" || l.host !== c && !Ip(l.host, c)) && ba(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers), yt(s)) {
    var p = {
      headers: a.headers,
      statusCode: e
    }, d = {
      url: u,
      method: i,
      headers: n
    };
    s(this._options, p, d), this._sanitizeOptions(this._options);
  }
  this._performRequest();
};
function Yo(a) {
  var e = {
    maxRedirects: 21,
    maxBodyLength: 10485760
  }, t = {};
  return Object.keys(a).forEach(function(n) {
    var s = n + ":", i = t[s] = a[n], o = e[n] = Object.create(i);
    function r(u, l, p) {
      return $p(u) ? u = ja(u) : ft(u) ? u = ja(ms(u)) : (p = l, l = Zo(u), u = { protocol: s }), yt(l) && (p = l, l = null), l = Object.assign({
        maxRedirects: e.maxRedirects,
        maxBodyLength: e.maxBodyLength
      }, u, l), l.nativeProtocols = t, !ft(l.host) && !ft(l.hostname) && (l.hostname = "::1"), ls.equal(l.protocol, s, "protocol mismatch"), Xo("options", l), new $e(l, p);
    }
    function c(u, l, p) {
      var d = o.request(u, l, p);
      return d.end(), d;
    }
    Object.defineProperties(o, {
      request: { value: r, configurable: !0, enumerable: !0, writable: !0 },
      get: { value: c, configurable: !0, enumerable: !0, writable: !0 }
    });
  }), e;
}
function Qo() {
}
function ms(a) {
  var e;
  if (us)
    e = new Qt(a);
  else if (e = Zo(un.parse(a)), !ft(e.protocol))
    throw new Fa({ input: a });
  return e;
}
function Tp(a, e) {
  return us ? new Qt(a, e) : ms(un.resolve(e, a));
}
function Zo(a) {
  if (/^\[/.test(a.hostname) && !/^\[[:0-9a-f]+\]$/i.test(a.hostname))
    throw new Fa({ input: a.href || a });
  if (/^\[/.test(a.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(a.host))
    throw new Fa({ input: a.href || a });
  return a;
}
function ja(a, e) {
  var t = e || {};
  for (var n of Cp)
    t[n] = a[n];
  return t.hostname.startsWith("[") && (t.hostname = t.hostname.slice(1, -1)), t.port !== "" && (t.port = Number(t.port)), t.path = t.search ? t.pathname + t.search : t.pathname, t;
}
function ba(a, e) {
  var t;
  for (var n in e)
    a.test(n) && (t = e[n], delete e[n]);
  return t === null || typeof t > "u" ? void 0 : String(t).trim();
}
function pn(a, e, t) {
  function n(s) {
    yt(Error.captureStackTrace) && Error.captureStackTrace(this, this.constructor), Object.assign(this, s || {}), this.code = a, this.message = this.cause ? e + ": " + this.cause.message : e;
  }
  return n.prototype = new (t || Error)(), Object.defineProperties(n.prototype, {
    constructor: {
      value: n,
      enumerable: !1
    },
    name: {
      value: "Error [" + a + "]",
      enumerable: !1
    }
  }), n;
}
function fs(a, e) {
  for (var t of ps)
    a.removeListener(t, ds[t]);
  a.on("error", Qo), a.destroy(e);
}
function Ip(a, e) {
  ls(ft(a) && ft(e));
  var t = a.length - e.length - 1;
  return t > 0 && a[t] === "." && a.endsWith(e);
}
function ft(a) {
  return typeof a == "string" || a instanceof String;
}
function yt(a) {
  return typeof a == "function";
}
function Pp(a) {
  return typeof a == "object" && "length" in a;
}
function $p(a) {
  return Qt && a instanceof Qt;
}
rs.exports = Yo({ http: _p, https: Sp });
rs.exports.wrap = Yo;
var Dp = rs.exports;
const Lp = /* @__PURE__ */ _o(Dp), Nn = "1.13.4";
function er(a) {
  const e = /^([-+\w]{1,25})(:?\/\/|:)/.exec(a);
  return e && e[1] || "";
}
const Np = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function Op(a, e, t) {
  const n = t && t.Blob || oe.classes.Blob, s = er(a);
  if (e === void 0 && n && (e = !0), s === "data") {
    a = s.length ? a.slice(s.length + 1) : a;
    const i = Np.exec(a);
    if (!i)
      throw new E("Invalid URL", E.ERR_INVALID_URL);
    const o = i[1], r = i[2], c = i[3], u = Buffer.from(decodeURIComponent(c), r ? "base64" : "utf8");
    if (e) {
      if (!n)
        throw new E("Blob is not supported", E.ERR_NOT_SUPPORT);
      return new n([u], { type: o });
    }
    return u;
  }
  throw new E("Unsupported protocol " + s, E.ERR_NOT_SUPPORT);
}
const wa = Symbol("internals");
class ii extends Te.Transform {
  constructor(e) {
    e = x.toFlatObject(e, {
      maxRate: 0,
      chunkSize: 64 * 1024,
      minChunkSize: 100,
      timeWindow: 500,
      ticksRate: 2,
      samplesCount: 15
    }, null, (n, s) => !x.isUndefined(s[n])), super({
      readableHighWaterMark: e.chunkSize
    });
    const t = this[wa] = {
      timeWindow: e.timeWindow,
      chunkSize: e.chunkSize,
      maxRate: e.maxRate,
      minChunkSize: e.minChunkSize,
      bytesSeen: 0,
      isCaptured: !1,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null
    };
    this.on("newListener", (n) => {
      n === "progress" && (t.isCaptured || (t.isCaptured = !0));
    });
  }
  _read(e) {
    const t = this[wa];
    return t.onReadCallback && t.onReadCallback(), super._read(e);
  }
  _transform(e, t, n) {
    const s = this[wa], i = s.maxRate, o = this.readableHighWaterMark, r = s.timeWindow, c = 1e3 / r, u = i / c, l = s.minChunkSize !== !1 ? Math.max(s.minChunkSize, u * 0.01) : 0, p = (h, m) => {
      const f = Buffer.byteLength(h);
      s.bytesSeen += f, s.bytes += f, s.isCaptured && this.emit("progress", s.bytesSeen), this.push(h) ? process.nextTick(m) : s.onReadCallback = () => {
        s.onReadCallback = null, process.nextTick(m);
      };
    }, d = (h, m) => {
      const f = Buffer.byteLength(h);
      let g = null, v = o, y, b = 0;
      if (i) {
        const S = Date.now();
        (!s.ts || (b = S - s.ts) >= r) && (s.ts = S, y = u - s.bytes, s.bytes = y < 0 ? -y : 0, b = 0), y = u - s.bytes;
      }
      if (i) {
        if (y <= 0)
          return setTimeout(() => {
            m(null, h);
          }, r - b);
        y < v && (v = y);
      }
      v && f > v && f - v > l && (g = h.subarray(v), h = h.subarray(0, v)), p(h, g ? () => {
        process.nextTick(m, null, g);
      } : m);
    };
    d(e, function h(m, f) {
      if (m)
        return n(m);
      f ? d(f, h) : n(null);
    });
  }
}
const { asyncIterator: oi } = Symbol, tr = async function* (a) {
  a.stream ? yield* a.stream() : a.arrayBuffer ? yield await a.arrayBuffer() : a[oi] ? yield* a[oi]() : yield a;
}, Mp = oe.ALPHABET.ALPHA_DIGIT + "-_", Zt = typeof TextEncoder == "function" ? new TextEncoder() : new wt.TextEncoder(), ut = `\r
`, Up = Zt.encode(ut), Fp = 2;
class Bp {
  constructor(e, t) {
    const { escapeName: n } = this.constructor, s = x.isString(t);
    let i = `Content-Disposition: form-data; name="${n(e)}"${!s && t.name ? `; filename="${n(t.name)}"` : ""}${ut}`;
    s ? t = Zt.encode(String(t).replace(/\r?\n|\r\n?/g, ut)) : i += `Content-Type: ${t.type || "application/octet-stream"}${ut}`, this.headers = Zt.encode(i + ut), this.contentLength = s ? t.byteLength : t.size, this.size = this.headers.byteLength + this.contentLength + Fp, this.name = e, this.value = t;
  }
  async *encode() {
    yield this.headers;
    const { value: e } = this;
    x.isTypedArray(e) ? yield e : yield* tr(e), yield Up;
  }
  static escapeName(e) {
    return String(e).replace(/[\r\n"]/g, (t) => ({
      "\r": "%0D",
      "\n": "%0A",
      '"': "%22"
    })[t]);
  }
}
const jp = (a, e, t) => {
  const {
    tag: n = "form-data-boundary",
    size: s = 25,
    boundary: i = n + "-" + oe.generateString(s, Mp)
  } = t || {};
  if (!x.isFormData(a))
    throw TypeError("FormData instance required");
  if (i.length < 1 || i.length > 70)
    throw Error("boundary must be 10-70 characters long");
  const o = Zt.encode("--" + i + ut), r = Zt.encode("--" + i + "--" + ut);
  let c = r.byteLength;
  const u = Array.from(a.entries()).map(([p, d]) => {
    const h = new Bp(p, d);
    return c += h.size, h;
  });
  c += o.byteLength * u.length, c = x.toFiniteNumber(c);
  const l = {
    "Content-Type": `multipart/form-data; boundary=${i}`
  };
  return Number.isFinite(c) && (l["Content-Length"] = c), e && e(l), Ir.from(async function* () {
    for (const p of u)
      yield o, yield* p.encode();
    yield r;
  }());
};
class zp extends Te.Transform {
  __transform(e, t, n) {
    this.push(e), n();
  }
  _transform(e, t, n) {
    if (e.length !== 0 && (this._transform = this.__transform, e[0] !== 120)) {
      const s = Buffer.alloc(2);
      s[0] = 120, s[1] = 156, this.push(s, t);
    }
    this.__transform(e, t, n);
  }
}
const qp = (a, e) => x.isAsyncFn(a) ? function(...t) {
  const n = t.pop();
  a.apply(this, t).then((s) => {
    try {
      e ? n(null, ...e(s)) : n(null, s);
    } catch (i) {
      n(i);
    }
  }, n);
} : a;
function Hp(a, e) {
  a = a || 10;
  const t = new Array(a), n = new Array(a);
  let s = 0, i = 0, o;
  return e = e !== void 0 ? e : 1e3, function(c) {
    const u = Date.now(), l = n[i];
    o || (o = u), t[s] = c, n[s] = u;
    let p = i, d = 0;
    for (; p !== s; )
      d += t[p++], p = p % a;
    if (s = (s + 1) % a, s === i && (i = (i + 1) % a), u - o < e)
      return;
    const h = l && u - l;
    return h ? Math.round(d * 1e3 / h) : void 0;
  };
}
function Wp(a, e) {
  let t = 0, n = 1e3 / e, s, i;
  const o = (u, l = Date.now()) => {
    t = l, s = null, i && (clearTimeout(i), i = null), a(...u);
  };
  return [(...u) => {
    const l = Date.now(), p = l - t;
    p >= n ? o(u, l) : (s = u, i || (i = setTimeout(() => {
      i = null, o(s);
    }, n - p)));
  }, () => s && o(s)];
}
const Mt = (a, e, t = 3) => {
  let n = 0;
  const s = Hp(50, 250);
  return Wp((i) => {
    const o = i.loaded, r = i.lengthComputable ? i.total : void 0, c = o - n, u = s(c), l = o <= r;
    n = o;
    const p = {
      loaded: o,
      total: r,
      progress: r ? o / r : void 0,
      bytes: c,
      rate: u || void 0,
      estimated: u && r && l ? (r - o) / u : void 0,
      event: i,
      lengthComputable: r != null,
      [e ? "download" : "upload"]: !0
    };
    a(p);
  }, t);
}, On = (a, e) => {
  const t = a != null;
  return [(n) => e[0]({
    lengthComputable: t,
    total: a,
    loaded: n
  }), e[1]];
}, Mn = (a) => (...e) => x.asap(() => a(...e));
function Vp(a) {
  if (!a || typeof a != "string" || !a.startsWith("data:")) return 0;
  const e = a.indexOf(",");
  if (e < 0) return 0;
  const t = a.slice(5, e), n = a.slice(e + 1);
  if (/;base64/i.test(t)) {
    let i = n.length;
    const o = n.length;
    for (let d = 0; d < o; d++)
      if (n.charCodeAt(d) === 37 && d + 2 < o) {
        const h = n.charCodeAt(d + 1), m = n.charCodeAt(d + 2);
        (h >= 48 && h <= 57 || h >= 65 && h <= 70 || h >= 97 && h <= 102) && (m >= 48 && m <= 57 || m >= 65 && m <= 70 || m >= 97 && m <= 102) && (i -= 2, d += 2);
      }
    let r = 0, c = o - 1;
    const u = (d) => d >= 2 && n.charCodeAt(d - 2) === 37 && // '%'
    n.charCodeAt(d - 1) === 51 && // '3'
    (n.charCodeAt(d) === 68 || n.charCodeAt(d) === 100);
    c >= 0 && (n.charCodeAt(c) === 61 ? (r++, c--) : u(c) && (r++, c -= 3)), r === 1 && c >= 0 && (n.charCodeAt(c) === 61 || u(c)) && r++;
    const p = Math.floor(i / 4) * 3 - (r || 0);
    return p > 0 ? p : 0;
  }
  return Buffer.byteLength(n, "utf8");
}
const ri = {
  flush: et.constants.Z_SYNC_FLUSH,
  finishFlush: et.constants.Z_SYNC_FLUSH
}, Gp = {
  flush: et.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: et.constants.BROTLI_OPERATION_FLUSH
}, ci = x.isFunction(et.createBrotliDecompress), { http: Jp, https: Kp } = Lp, Xp = /https:?/, li = oe.protocols.map((a) => a + ":"), ui = (a, [e, t]) => (a.on("end", t).on("error", t), e);
class Yp {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(e, t) {
    t = Object.assign({
      sessionTimeout: 1e3
    }, t);
    let n = this.sessions[e];
    if (n) {
      let l = n.length;
      for (let p = 0; p < l; p++) {
        const [d, h] = n[p];
        if (!d.destroyed && !d.closed && wt.isDeepStrictEqual(h, t))
          return d;
      }
    }
    const s = io.connect(e, t);
    let i;
    const o = () => {
      if (i)
        return;
      i = !0;
      let l = n, p = l.length, d = p;
      for (; d--; )
        if (l[d][0] === s) {
          p === 1 ? delete this.sessions[e] : l.splice(d, 1);
          return;
        }
    }, r = s.request, { sessionTimeout: c } = t;
    if (c != null) {
      let l, p = 0;
      s.request = function() {
        const d = r.apply(this, arguments);
        return p++, l && (clearTimeout(l), l = null), d.once("close", () => {
          --p || (l = setTimeout(() => {
            l = null, o();
          }, c));
        }), d;
      };
    }
    s.once("close", o);
    let u = [
      s,
      t
    ];
    return n ? n.push(u) : n = this.sessions[e] = [u], s;
  }
}
const Qp = new Yp();
function Zp(a, e) {
  a.beforeRedirects.proxy && a.beforeRedirects.proxy(a), a.beforeRedirects.config && a.beforeRedirects.config(a, e);
}
function nr(a, e, t) {
  let n = e;
  if (!n && n !== !1) {
    const s = Jo.getProxyForUrl(t);
    s && (n = new URL(s));
  }
  if (n) {
    if (n.username && (n.auth = (n.username || "") + ":" + (n.password || "")), n.auth) {
      if (!!(n.auth.username || n.auth.password))
        n.auth = (n.auth.username || "") + ":" + (n.auth.password || "");
      else if (typeof n.auth == "object")
        throw new E("Invalid proxy authorization", E.ERR_BAD_OPTION, { proxy: n });
      const o = Buffer.from(n.auth, "utf8").toString("base64");
      a.headers["Proxy-Authorization"] = "Basic " + o;
    }
    a.headers.host = a.hostname + (a.port ? ":" + a.port : "");
    const s = n.hostname || n.host;
    a.hostname = s, a.host = s, a.port = n.port, a.path = t, n.protocol && (a.protocol = n.protocol.includes(":") ? n.protocol : `${n.protocol}:`);
  }
  a.beforeRedirects.proxy = function(i) {
    nr(i, e, i.href);
  };
}
const ed = typeof process < "u" && x.kindOf(process) === "process", td = (a) => new Promise((e, t) => {
  let n, s;
  const i = (c, u) => {
    s || (s = !0, n && n(c, u));
  }, o = (c) => {
    i(c), e(c);
  }, r = (c) => {
    i(c, !0), t(c);
  };
  a(o, r, (c) => n = c).catch(r);
}), nd = ({ address: a, family: e }) => {
  if (!x.isString(a))
    throw TypeError("address must be a string");
  return {
    address: a,
    family: e || (a.indexOf(".") < 0 ? 6 : 4)
  };
}, pi = (a, e) => nd(x.isObject(a) ? a : { address: a, family: e }), ad = {
  request(a, e) {
    const t = a.protocol + "//" + a.hostname + ":" + (a.port || (a.protocol === "https:" ? 443 : 80)), { http2Options: n, headers: s } = a, i = Qp.getSession(t, n), {
      HTTP2_HEADER_SCHEME: o,
      HTTP2_HEADER_METHOD: r,
      HTTP2_HEADER_PATH: c,
      HTTP2_HEADER_STATUS: u
    } = io.constants, l = {
      [o]: a.protocol.replace(":", ""),
      [r]: a.method,
      [c]: a.path
    };
    x.forEach(s, (d, h) => {
      h.charAt(0) !== ":" && (l[h] = d);
    });
    const p = i.request(l);
    return p.once("response", (d) => {
      const h = p;
      d = Object.assign({}, d);
      const m = d[u];
      delete d[u], h.headers = d, h.statusCode = +m, e(h);
    }), p;
  }
}, sd = ed && function(e) {
  return td(async function(n, s, i) {
    let { data: o, lookup: r, family: c, httpVersion: u = 1, http2Options: l } = e;
    const { responseType: p, responseEncoding: d } = e, h = e.method.toUpperCase();
    let m, f = !1, g;
    if (u = +u, Number.isNaN(u))
      throw TypeError(`Invalid protocol version: '${e.httpVersion}' is not a number`);
    if (u !== 1 && u !== 2)
      throw TypeError(`Unsupported protocol version '${u}'`);
    const v = u === 2;
    if (r) {
      const A = qp(r, (R) => x.isArray(R) ? R : [R]);
      r = (R, $, ae) => {
        A(R, $, (X, fe, De) => {
          if (X)
            return ae(X);
          const Q = x.isArray(fe) ? fe.map((at) => pi(at)) : [pi(fe, De)];
          $.all ? ae(X, Q) : ae(X, Q[0].address, Q[0].family);
        });
      };
    }
    const y = new Or();
    function b(A) {
      try {
        y.emit("abort", !A || A.type ? new vt(null, e, g) : A);
      } catch (R) {
        console.warn("emit error", R);
      }
    }
    y.once("abort", s);
    const S = () => {
      e.cancelToken && e.cancelToken.unsubscribe(b), e.signal && e.signal.removeEventListener("abort", b), y.removeAllListeners();
    };
    (e.cancelToken || e.signal) && (e.cancelToken && e.cancelToken.subscribe(b), e.signal && (e.signal.aborted ? b() : e.signal.addEventListener("abort", b))), i((A, R) => {
      if (m = !0, R) {
        f = !0, S();
        return;
      }
      const { data: $ } = A;
      if ($ instanceof Te.Readable || $ instanceof Te.Duplex) {
        const ae = Te.finished($, () => {
          ae(), S();
        });
      } else
        S();
    });
    const C = os(e.baseURL, e.url, e.allowAbsoluteUrls), _ = new URL(C, oe.hasBrowserEnv ? oe.origin : void 0), k = _.protocol || li[0];
    if (k === "data:") {
      if (e.maxContentLength > -1) {
        const R = String(e.url || C || "");
        if (Vp(R) > e.maxContentLength)
          return s(new E(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            E.ERR_BAD_RESPONSE,
            e
          ));
      }
      let A;
      if (h !== "GET")
        return Tt(n, s, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config: e
        });
      try {
        A = Op(e.url, p === "blob", {
          Blob: e.env && e.env.Blob
        });
      } catch (R) {
        throw E.from(R, E.ERR_BAD_REQUEST, e);
      }
      return p === "text" ? (A = A.toString(d), (!d || d === "utf8") && (A = x.stripBOM(A))) : p === "stream" && (A = Te.Readable.from(A)), Tt(n, s, {
        data: A,
        status: 200,
        statusText: "OK",
        headers: new _e(),
        config: e
      });
    }
    if (li.indexOf(k) === -1)
      return s(new E(
        "Unsupported protocol " + k,
        E.ERR_BAD_REQUEST,
        e
      ));
    const P = _e.from(e.headers).normalize();
    P.set("User-Agent", "axios/" + Nn, !1);
    const { onUploadProgress: T, onDownloadProgress: L } = e, z = e.maxRate;
    let G, O;
    if (x.isSpecCompliantForm(o)) {
      const A = P.getContentType(/boundary=([-_\w\d]{10,70})/i);
      o = jp(o, (R) => {
        P.set(R);
      }, {
        tag: `axios-${Nn}-boundary`,
        boundary: A && A[1] || void 0
      });
    } else if (x.isFormData(o) && x.isFunction(o.getHeaders)) {
      if (P.set(o.getHeaders()), !P.hasContentLength())
        try {
          const A = await wt.promisify(o.getLength).call(o);
          Number.isFinite(A) && A >= 0 && P.setContentLength(A);
        } catch {
        }
    } else if (x.isBlob(o) || x.isFile(o))
      o.size && P.setContentType(o.type || "application/octet-stream"), P.setContentLength(o.size || 0), o = Te.Readable.from(tr(o));
    else if (o && !x.isStream(o)) {
      if (!Buffer.isBuffer(o)) if (x.isArrayBuffer(o))
        o = Buffer.from(new Uint8Array(o));
      else if (x.isString(o))
        o = Buffer.from(o, "utf-8");
      else
        return s(new E(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          E.ERR_BAD_REQUEST,
          e
        ));
      if (P.setContentLength(o.length, !1), e.maxBodyLength > -1 && o.length > e.maxBodyLength)
        return s(new E(
          "Request body larger than maxBodyLength limit",
          E.ERR_BAD_REQUEST,
          e
        ));
    }
    const le = x.toFiniteNumber(P.getContentLength());
    x.isArray(z) ? (G = z[0], O = z[1]) : G = O = z, o && (T || G) && (x.isStream(o) || (o = Te.Readable.from(o, { objectMode: !1 })), o = Te.pipeline([o, new ii({
      maxRate: x.toFiniteNumber(G)
    })], x.noop), T && o.on("progress", ui(
      o,
      On(
        le,
        Mt(Mn(T), !1, 3)
      )
    )));
    let de;
    if (e.auth) {
      const A = e.auth.username || "", R = e.auth.password || "";
      de = A + ":" + R;
    }
    if (!de && _.username) {
      const A = _.username, R = _.password;
      de = A + ":" + R;
    }
    de && P.delete("authorization");
    let H;
    try {
      H = as(
        _.pathname + _.search,
        e.params,
        e.paramsSerializer
      ).replace(/^\?/, "");
    } catch (A) {
      const R = new Error(A.message);
      return R.config = e, R.url = e.url, R.exists = !0, s(R);
    }
    P.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (ci ? ", br" : ""),
      !1
    );
    const N = {
      path: H,
      method: h,
      headers: P.toJSON(),
      agents: { http: e.httpAgent, https: e.httpsAgent },
      auth: de,
      protocol: k,
      family: c,
      beforeRedirect: Zp,
      beforeRedirects: {},
      http2Options: l
    };
    !x.isUndefined(r) && (N.lookup = r), e.socketPath ? N.socketPath = e.socketPath : (N.hostname = _.hostname.startsWith("[") ? _.hostname.slice(1, -1) : _.hostname, N.port = _.port, nr(N, e.proxy, k + "//" + _.hostname + (_.port ? ":" + _.port : "") + N.path));
    let q;
    const M = Xp.test(N.protocol);
    if (N.agent = M ? e.httpsAgent : e.httpAgent, v ? q = ad : e.transport ? q = e.transport : e.maxRedirects === 0 ? q = M ? Xa : Ya : (e.maxRedirects && (N.maxRedirects = e.maxRedirects), e.beforeRedirect && (N.beforeRedirects.config = e.beforeRedirect), q = M ? Kp : Jp), e.maxBodyLength > -1 ? N.maxBodyLength = e.maxBodyLength : N.maxBodyLength = 1 / 0, e.insecureHTTPParser && (N.insecureHTTPParser = e.insecureHTTPParser), g = q.request(N, function(R) {
      if (g.destroyed) return;
      const $ = [R], ae = x.toFiniteNumber(R.headers["content-length"]);
      if (L || O) {
        const Q = new ii({
          maxRate: x.toFiniteNumber(O)
        });
        L && Q.on("progress", ui(
          Q,
          On(
            ae,
            Mt(Mn(L), !0, 3)
          )
        )), $.push(Q);
      }
      let X = R;
      const fe = R.req || g;
      if (e.decompress !== !1 && R.headers["content-encoding"])
        switch ((h === "HEAD" || R.statusCode === 204) && delete R.headers["content-encoding"], (R.headers["content-encoding"] || "").toLowerCase()) {
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            $.push(et.createUnzip(ri)), delete R.headers["content-encoding"];
            break;
          case "deflate":
            $.push(new zp()), $.push(et.createUnzip(ri)), delete R.headers["content-encoding"];
            break;
          case "br":
            ci && ($.push(et.createBrotliDecompress(Gp)), delete R.headers["content-encoding"]);
        }
      X = $.length > 1 ? Te.pipeline($, x.noop) : $[0];
      const De = {
        status: R.statusCode,
        statusText: R.statusMessage,
        headers: new _e(R.headers),
        config: e,
        request: fe
      };
      if (p === "stream")
        De.data = X, Tt(n, s, De);
      else {
        const Q = [];
        let at = 0;
        X.on("data", function(be) {
          Q.push(be), at += be.length, e.maxContentLength > -1 && at > e.maxContentLength && (f = !0, X.destroy(), b(new E(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            E.ERR_BAD_RESPONSE,
            e,
            fe
          )));
        }), X.on("aborted", function() {
          if (f)
            return;
          const be = new E(
            "stream has been aborted",
            E.ERR_BAD_RESPONSE,
            e,
            fe
          );
          X.destroy(be), s(be);
        }), X.on("error", function(be) {
          g.destroyed || s(E.from(be, null, e, fe));
        }), X.on("end", function() {
          try {
            let be = Q.length === 1 ? Q[0] : Buffer.concat(Q);
            p !== "arraybuffer" && (be = be.toString(d), (!d || d === "utf8") && (be = x.stripBOM(be))), De.data = be;
          } catch (be) {
            return s(E.from(be, null, e, De.request, De));
          }
          Tt(n, s, De);
        });
      }
      y.once("abort", (Q) => {
        X.destroyed || (X.emit("error", Q), X.destroy());
      });
    }), y.once("abort", (A) => {
      g.close ? g.close() : g.destroy(A);
    }), g.on("error", function(R) {
      s(E.from(R, null, e, g));
    }), g.on("socket", function(R) {
      R.setKeepAlive(!0, 1e3 * 60);
    }), e.timeout) {
      const A = parseInt(e.timeout, 10);
      if (Number.isNaN(A)) {
        b(new E(
          "error trying to parse `config.timeout` to int",
          E.ERR_BAD_OPTION_VALUE,
          e,
          g
        ));
        return;
      }
      g.setTimeout(A, function() {
        if (m) return;
        let $ = e.timeout ? "timeout of " + e.timeout + "ms exceeded" : "timeout exceeded";
        const ae = e.transitional || ss;
        e.timeoutErrorMessage && ($ = e.timeoutErrorMessage), b(new E(
          $,
          ae.clarifyTimeoutError ? E.ETIMEDOUT : E.ECONNABORTED,
          e,
          g
        ));
      });
    } else
      g.setTimeout(0);
    if (x.isStream(o)) {
      let A = !1, R = !1;
      o.on("end", () => {
        A = !0;
      }), o.once("error", ($) => {
        R = !0, g.destroy($);
      }), o.on("close", () => {
        !A && !R && b(new vt("Request stream has been aborted", e, g));
      }), o.pipe(g);
    } else
      o && g.write(o), g.end();
  });
}, id = oe.hasStandardBrowserEnv ? /* @__PURE__ */ ((a, e) => (t) => (t = new URL(t, oe.origin), a.protocol === t.protocol && a.host === t.host && (e || a.port === t.port)))(
  new URL(oe.origin),
  oe.navigator && /(msie|trident)/i.test(oe.navigator.userAgent)
) : () => !0, od = oe.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(a, e, t, n, s, i, o) {
      if (typeof document > "u") return;
      const r = [`${a}=${encodeURIComponent(e)}`];
      x.isNumber(t) && r.push(`expires=${new Date(t).toUTCString()}`), x.isString(n) && r.push(`path=${n}`), x.isString(s) && r.push(`domain=${s}`), i === !0 && r.push("secure"), x.isString(o) && r.push(`SameSite=${o}`), document.cookie = r.join("; ");
    },
    read(a) {
      if (typeof document > "u") return null;
      const e = document.cookie.match(new RegExp("(?:^|; )" + a + "=([^;]*)"));
      return e ? decodeURIComponent(e[1]) : null;
    },
    remove(a) {
      this.write(a, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
), di = (a) => a instanceof _e ? { ...a } : a;
function bt(a, e) {
  e = e || {};
  const t = {};
  function n(u, l, p, d) {
    return x.isPlainObject(u) && x.isPlainObject(l) ? x.merge.call({ caseless: d }, u, l) : x.isPlainObject(l) ? x.merge({}, l) : x.isArray(l) ? l.slice() : l;
  }
  function s(u, l, p, d) {
    if (x.isUndefined(l)) {
      if (!x.isUndefined(u))
        return n(void 0, u, p, d);
    } else return n(u, l, p, d);
  }
  function i(u, l) {
    if (!x.isUndefined(l))
      return n(void 0, l);
  }
  function o(u, l) {
    if (x.isUndefined(l)) {
      if (!x.isUndefined(u))
        return n(void 0, u);
    } else return n(void 0, l);
  }
  function r(u, l, p) {
    if (p in e)
      return n(u, l);
    if (p in a)
      return n(void 0, u);
  }
  const c = {
    url: i,
    method: i,
    data: i,
    baseURL: o,
    transformRequest: o,
    transformResponse: o,
    paramsSerializer: o,
    timeout: o,
    timeoutMessage: o,
    withCredentials: o,
    withXSRFToken: o,
    adapter: o,
    responseType: o,
    xsrfCookieName: o,
    xsrfHeaderName: o,
    onUploadProgress: o,
    onDownloadProgress: o,
    decompress: o,
    maxContentLength: o,
    maxBodyLength: o,
    beforeRedirect: o,
    transport: o,
    httpAgent: o,
    httpsAgent: o,
    cancelToken: o,
    socketPath: o,
    responseEncoding: o,
    validateStatus: r,
    headers: (u, l, p) => s(di(u), di(l), p, !0)
  };
  return x.forEach(Object.keys({ ...a, ...e }), function(l) {
    const p = c[l] || s, d = p(a[l], e[l], l);
    x.isUndefined(d) && p !== r || (t[l] = d);
  }), t;
}
const ar = (a) => {
  const e = bt({}, a);
  let { data: t, withXSRFToken: n, xsrfHeaderName: s, xsrfCookieName: i, headers: o, auth: r } = e;
  if (e.headers = o = _e.from(o), e.url = as(os(e.baseURL, e.url, e.allowAbsoluteUrls), a.params, a.paramsSerializer), r && o.set(
    "Authorization",
    "Basic " + btoa((r.username || "") + ":" + (r.password ? unescape(encodeURIComponent(r.password)) : ""))
  ), x.isFormData(t)) {
    if (oe.hasStandardBrowserEnv || oe.hasStandardBrowserWebWorkerEnv)
      o.setContentType(void 0);
    else if (x.isFunction(t.getHeaders)) {
      const c = t.getHeaders(), u = ["content-type", "content-length"];
      Object.entries(c).forEach(([l, p]) => {
        u.includes(l.toLowerCase()) && o.set(l, p);
      });
    }
  }
  if (oe.hasStandardBrowserEnv && (n && x.isFunction(n) && (n = n(e)), n || n !== !1 && id(e.url))) {
    const c = s && i && od.read(i);
    c && o.set(s, c);
  }
  return e;
}, rd = typeof XMLHttpRequest < "u", cd = rd && function(a) {
  return new Promise(function(t, n) {
    const s = ar(a);
    let i = s.data;
    const o = _e.from(s.headers).normalize();
    let { responseType: r, onUploadProgress: c, onDownloadProgress: u } = s, l, p, d, h, m;
    function f() {
      h && h(), m && m(), s.cancelToken && s.cancelToken.unsubscribe(l), s.signal && s.signal.removeEventListener("abort", l);
    }
    let g = new XMLHttpRequest();
    g.open(s.method.toUpperCase(), s.url, !0), g.timeout = s.timeout;
    function v() {
      if (!g)
        return;
      const b = _e.from(
        "getAllResponseHeaders" in g && g.getAllResponseHeaders()
      ), C = {
        data: !r || r === "text" || r === "json" ? g.responseText : g.response,
        status: g.status,
        statusText: g.statusText,
        headers: b,
        config: a,
        request: g
      };
      Tt(function(k) {
        t(k), f();
      }, function(k) {
        n(k), f();
      }, C), g = null;
    }
    "onloadend" in g ? g.onloadend = v : g.onreadystatechange = function() {
      !g || g.readyState !== 4 || g.status === 0 && !(g.responseURL && g.responseURL.indexOf("file:") === 0) || setTimeout(v);
    }, g.onabort = function() {
      g && (n(new E("Request aborted", E.ECONNABORTED, a, g)), g = null);
    }, g.onerror = function(S) {
      const C = S && S.message ? S.message : "Network Error", _ = new E(C, E.ERR_NETWORK, a, g);
      _.event = S || null, n(_), g = null;
    }, g.ontimeout = function() {
      let S = s.timeout ? "timeout of " + s.timeout + "ms exceeded" : "timeout exceeded";
      const C = s.transitional || ss;
      s.timeoutErrorMessage && (S = s.timeoutErrorMessage), n(new E(
        S,
        C.clarifyTimeoutError ? E.ETIMEDOUT : E.ECONNABORTED,
        a,
        g
      )), g = null;
    }, i === void 0 && o.setContentType(null), "setRequestHeader" in g && x.forEach(o.toJSON(), function(S, C) {
      g.setRequestHeader(C, S);
    }), x.isUndefined(s.withCredentials) || (g.withCredentials = !!s.withCredentials), r && r !== "json" && (g.responseType = s.responseType), u && ([d, m] = Mt(u, !0), g.addEventListener("progress", d)), c && g.upload && ([p, h] = Mt(c), g.upload.addEventListener("progress", p), g.upload.addEventListener("loadend", h)), (s.cancelToken || s.signal) && (l = (b) => {
      g && (n(!b || b.type ? new vt(null, a, g) : b), g.abort(), g = null);
    }, s.cancelToken && s.cancelToken.subscribe(l), s.signal && (s.signal.aborted ? l() : s.signal.addEventListener("abort", l)));
    const y = er(s.url);
    if (y && oe.protocols.indexOf(y) === -1) {
      n(new E("Unsupported protocol " + y + ":", E.ERR_BAD_REQUEST, a));
      return;
    }
    g.send(i || null);
  });
}, ld = (a, e) => {
  const { length: t } = a = a ? a.filter(Boolean) : [];
  if (e || t) {
    let n = new AbortController(), s;
    const i = function(u) {
      if (!s) {
        s = !0, r();
        const l = u instanceof Error ? u : this.reason;
        n.abort(l instanceof E ? l : new vt(l instanceof Error ? l.message : l));
      }
    };
    let o = e && setTimeout(() => {
      o = null, i(new E(`timeout of ${e}ms exceeded`, E.ETIMEDOUT));
    }, e);
    const r = () => {
      a && (o && clearTimeout(o), o = null, a.forEach((u) => {
        u.unsubscribe ? u.unsubscribe(i) : u.removeEventListener("abort", i);
      }), a = null);
    };
    a.forEach((u) => u.addEventListener("abort", i));
    const { signal: c } = n;
    return c.unsubscribe = () => x.asap(r), c;
  }
}, ud = function* (a, e) {
  let t = a.byteLength;
  if (t < e) {
    yield a;
    return;
  }
  let n = 0, s;
  for (; n < t; )
    s = n + e, yield a.slice(n, s), n = s;
}, pd = async function* (a, e) {
  for await (const t of dd(a))
    yield* ud(t, e);
}, dd = async function* (a) {
  if (a[Symbol.asyncIterator]) {
    yield* a;
    return;
  }
  const e = a.getReader();
  try {
    for (; ; ) {
      const { done: t, value: n } = await e.read();
      if (t)
        break;
      yield n;
    }
  } finally {
    await e.cancel();
  }
}, mi = (a, e, t, n) => {
  const s = pd(a, e);
  let i = 0, o, r = (c) => {
    o || (o = !0, n && n(c));
  };
  return new ReadableStream({
    async pull(c) {
      try {
        const { done: u, value: l } = await s.next();
        if (u) {
          r(), c.close();
          return;
        }
        let p = l.byteLength;
        if (t) {
          let d = i += p;
          t(d);
        }
        c.enqueue(new Uint8Array(l));
      } catch (u) {
        throw r(u), u;
      }
    },
    cancel(c) {
      return r(c), s.return();
    }
  }, {
    highWaterMark: 2
  });
}, fi = 64 * 1024, { isFunction: vn } = x, md = (({ Request: a, Response: e }) => ({
  Request: a,
  Response: e
}))(x.global), {
  ReadableStream: hi,
  TextEncoder: gi
} = x.global, xi = (a, ...e) => {
  try {
    return !!a(...e);
  } catch {
    return !1;
  }
}, fd = (a) => {
  a = x.merge.call({
    skipUndefined: !0
  }, md, a);
  const { fetch: e, Request: t, Response: n } = a, s = e ? vn(e) : typeof fetch == "function", i = vn(t), o = vn(n);
  if (!s)
    return !1;
  const r = s && vn(hi), c = s && (typeof gi == "function" ? /* @__PURE__ */ ((m) => (f) => m.encode(f))(new gi()) : async (m) => new Uint8Array(await new t(m).arrayBuffer())), u = i && r && xi(() => {
    let m = !1;
    const f = new t(oe.origin, {
      body: new hi(),
      method: "POST",
      get duplex() {
        return m = !0, "half";
      }
    }).headers.has("Content-Type");
    return m && !f;
  }), l = o && r && xi(() => x.isReadableStream(new n("").body)), p = {
    stream: l && ((m) => m.body)
  };
  s && ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((m) => {
    !p[m] && (p[m] = (f, g) => {
      let v = f && f[m];
      if (v)
        return v.call(f);
      throw new E(`Response type '${m}' is not supported`, E.ERR_NOT_SUPPORT, g);
    });
  });
  const d = async (m) => {
    if (m == null)
      return 0;
    if (x.isBlob(m))
      return m.size;
    if (x.isSpecCompliantForm(m))
      return (await new t(oe.origin, {
        method: "POST",
        body: m
      }).arrayBuffer()).byteLength;
    if (x.isArrayBufferView(m) || x.isArrayBuffer(m))
      return m.byteLength;
    if (x.isURLSearchParams(m) && (m = m + ""), x.isString(m))
      return (await c(m)).byteLength;
  }, h = async (m, f) => {
    const g = x.toFiniteNumber(m.getContentLength());
    return g ?? d(f);
  };
  return async (m) => {
    let {
      url: f,
      method: g,
      data: v,
      signal: y,
      cancelToken: b,
      timeout: S,
      onDownloadProgress: C,
      onUploadProgress: _,
      responseType: k,
      headers: P,
      withCredentials: T = "same-origin",
      fetchOptions: L
    } = ar(m), z = e || fetch;
    k = k ? (k + "").toLowerCase() : "text";
    let G = ld([y, b && b.toAbortSignal()], S), O = null;
    const le = G && G.unsubscribe && (() => {
      G.unsubscribe();
    });
    let de;
    try {
      if (_ && u && g !== "get" && g !== "head" && (de = await h(P, v)) !== 0) {
        let R = new t(f, {
          method: "POST",
          body: v,
          duplex: "half"
        }), $;
        if (x.isFormData(v) && ($ = R.headers.get("content-type")) && P.setContentType($), R.body) {
          const [ae, X] = On(
            de,
            Mt(Mn(_))
          );
          v = mi(R.body, fi, ae, X);
        }
      }
      x.isString(T) || (T = T ? "include" : "omit");
      const H = i && "credentials" in t.prototype, N = {
        ...L,
        signal: G,
        method: g.toUpperCase(),
        headers: P.normalize().toJSON(),
        body: v,
        duplex: "half",
        credentials: H ? T : void 0
      };
      O = i && new t(f, N);
      let q = await (i ? z(O, L) : z(f, N));
      const M = l && (k === "stream" || k === "response");
      if (l && (C || M && le)) {
        const R = {};
        ["status", "statusText", "headers"].forEach((fe) => {
          R[fe] = q[fe];
        });
        const $ = x.toFiniteNumber(q.headers.get("content-length")), [ae, X] = C && On(
          $,
          Mt(Mn(C), !0)
        ) || [];
        q = new n(
          mi(q.body, fi, ae, () => {
            X && X(), le && le();
          }),
          R
        );
      }
      k = k || "text";
      let A = await p[x.findKey(p, k) || "text"](q, m);
      return !M && le && le(), await new Promise((R, $) => {
        Tt(R, $, {
          data: A,
          headers: _e.from(q.headers),
          status: q.status,
          statusText: q.statusText,
          config: m,
          request: O
        });
      });
    } catch (H) {
      throw le && le(), H && H.name === "TypeError" && /Load failed|fetch/i.test(H.message) ? Object.assign(
        new E("Network Error", E.ERR_NETWORK, m, O),
        {
          cause: H.cause || H
        }
      ) : E.from(H, H && H.code, m, O);
    }
  };
}, hd = /* @__PURE__ */ new Map(), sr = (a) => {
  let e = a && a.env || {};
  const { fetch: t, Request: n, Response: s } = e, i = [
    n,
    s,
    t
  ];
  let o = i.length, r = o, c, u, l = hd;
  for (; r--; )
    c = i[r], u = l.get(c), u === void 0 && l.set(c, u = r ? /* @__PURE__ */ new Map() : fd(e)), l = u;
  return u;
};
sr();
const hs = {
  http: sd,
  xhr: cd,
  fetch: {
    get: sr
  }
};
x.forEach(hs, (a, e) => {
  if (a) {
    try {
      Object.defineProperty(a, "name", { value: e });
    } catch {
    }
    Object.defineProperty(a, "adapterName", { value: e });
  }
});
const vi = (a) => `- ${a}`, gd = (a) => x.isFunction(a) || a === null || a === !1;
function xd(a, e) {
  a = x.isArray(a) ? a : [a];
  const { length: t } = a;
  let n, s;
  const i = {};
  for (let o = 0; o < t; o++) {
    n = a[o];
    let r;
    if (s = n, !gd(n) && (s = hs[(r = String(n)).toLowerCase()], s === void 0))
      throw new E(`Unknown adapter '${r}'`);
    if (s && (x.isFunction(s) || (s = s.get(e))))
      break;
    i[r || "#" + o] = s;
  }
  if (!s) {
    const o = Object.entries(i).map(
      ([c, u]) => `adapter ${c} ` + (u === !1 ? "is not supported by the environment" : "is not available in the build")
    );
    let r = t ? o.length > 1 ? `since :
` + o.map(vi).join(`
`) : " " + vi(o[0]) : "as no adapter specified";
    throw new E(
      "There is no suitable adapter to dispatch the request " + r,
      "ERR_NOT_SUPPORT"
    );
  }
  return s;
}
const ir = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter: xd,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: hs
};
function _a(a) {
  if (a.cancelToken && a.cancelToken.throwIfRequested(), a.signal && a.signal.aborted)
    throw new vt(null, a);
}
function yi(a) {
  return _a(a), a.headers = _e.from(a.headers), a.data = ha.call(
    a,
    a.transformRequest
  ), ["post", "put", "patch"].indexOf(a.method) !== -1 && a.headers.setContentType("application/x-www-form-urlencoded", !1), ir.getAdapter(a.adapter || ln.adapter, a)(a).then(function(n) {
    return _a(a), n.data = ha.call(
      a,
      a.transformResponse,
      n
    ), n.headers = _e.from(n.headers), n;
  }, function(n) {
    return Go(n) || (_a(a), n && n.response && (n.response.data = ha.call(
      a,
      a.transformResponse,
      n.response
    ), n.response.headers = _e.from(n.response.headers))), Promise.reject(n);
  });
}
const Jn = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((a, e) => {
  Jn[a] = function(n) {
    return typeof n === a || "a" + (e < 1 ? "n " : " ") + a;
  };
});
const bi = {};
Jn.transitional = function(e, t, n) {
  function s(i, o) {
    return "[Axios v" + Nn + "] Transitional option '" + i + "'" + o + (n ? ". " + n : "");
  }
  return (i, o, r) => {
    if (e === !1)
      throw new E(
        s(o, " has been removed" + (t ? " in " + t : "")),
        E.ERR_DEPRECATED
      );
    return t && !bi[o] && (bi[o] = !0, console.warn(
      s(
        o,
        " has been deprecated since v" + t + " and will be removed in the near future"
      )
    )), e ? e(i, o, r) : !0;
  };
};
Jn.spelling = function(e) {
  return (t, n) => (console.warn(`${n} is likely a misspelling of ${e}`), !0);
};
function vd(a, e, t) {
  if (typeof a != "object")
    throw new E("options must be an object", E.ERR_BAD_OPTION_VALUE);
  const n = Object.keys(a);
  let s = n.length;
  for (; s-- > 0; ) {
    const i = n[s], o = e[i];
    if (o) {
      const r = a[i], c = r === void 0 || o(r, i, a);
      if (c !== !0)
        throw new E("option " + i + " must be " + c, E.ERR_BAD_OPTION_VALUE);
      continue;
    }
    if (t !== !0)
      throw new E("Unknown option " + i, E.ERR_BAD_OPTION);
  }
}
const In = {
  assertOptions: vd,
  validators: Jn
}, ze = In.validators;
let ht = class {
  constructor(e) {
    this.defaults = e || {}, this.interceptors = {
      request: new Ks(),
      response: new Ks()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(e, t) {
    try {
      return await this._request(e, t);
    } catch (n) {
      if (n instanceof Error) {
        let s = {};
        Error.captureStackTrace ? Error.captureStackTrace(s) : s = new Error();
        const i = s.stack ? s.stack.replace(/^.+\n/, "") : "";
        try {
          n.stack ? i && !String(n.stack).endsWith(i.replace(/^.+\n.+\n/, "")) && (n.stack += `
` + i) : n.stack = i;
        } catch {
        }
      }
      throw n;
    }
  }
  _request(e, t) {
    typeof e == "string" ? (t = t || {}, t.url = e) : t = e || {}, t = bt(this.defaults, t);
    const { transitional: n, paramsSerializer: s, headers: i } = t;
    n !== void 0 && In.assertOptions(n, {
      silentJSONParsing: ze.transitional(ze.boolean),
      forcedJSONParsing: ze.transitional(ze.boolean),
      clarifyTimeoutError: ze.transitional(ze.boolean)
    }, !1), s != null && (x.isFunction(s) ? t.paramsSerializer = {
      serialize: s
    } : In.assertOptions(s, {
      encode: ze.function,
      serialize: ze.function
    }, !0)), t.allowAbsoluteUrls !== void 0 || (this.defaults.allowAbsoluteUrls !== void 0 ? t.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls : t.allowAbsoluteUrls = !0), In.assertOptions(t, {
      baseUrl: ze.spelling("baseURL"),
      withXsrfToken: ze.spelling("withXSRFToken")
    }, !0), t.method = (t.method || this.defaults.method || "get").toLowerCase();
    let o = i && x.merge(
      i.common,
      i[t.method]
    );
    i && x.forEach(
      ["delete", "get", "head", "post", "put", "patch", "common"],
      (m) => {
        delete i[m];
      }
    ), t.headers = _e.concat(o, i);
    const r = [];
    let c = !0;
    this.interceptors.request.forEach(function(f) {
      typeof f.runWhen == "function" && f.runWhen(t) === !1 || (c = c && f.synchronous, r.unshift(f.fulfilled, f.rejected));
    });
    const u = [];
    this.interceptors.response.forEach(function(f) {
      u.push(f.fulfilled, f.rejected);
    });
    let l, p = 0, d;
    if (!c) {
      const m = [yi.bind(this), void 0];
      for (m.unshift(...r), m.push(...u), d = m.length, l = Promise.resolve(t); p < d; )
        l = l.then(m[p++], m[p++]);
      return l;
    }
    d = r.length;
    let h = t;
    for (; p < d; ) {
      const m = r[p++], f = r[p++];
      try {
        h = m(h);
      } catch (g) {
        f.call(this, g);
        break;
      }
    }
    try {
      l = yi.call(this, h);
    } catch (m) {
      return Promise.reject(m);
    }
    for (p = 0, d = u.length; p < d; )
      l = l.then(u[p++], u[p++]);
    return l;
  }
  getUri(e) {
    e = bt(this.defaults, e);
    const t = os(e.baseURL, e.url, e.allowAbsoluteUrls);
    return as(t, e.params, e.paramsSerializer);
  }
};
x.forEach(["delete", "get", "head", "options"], function(e) {
  ht.prototype[e] = function(t, n) {
    return this.request(bt(n || {}, {
      method: e,
      url: t,
      data: (n || {}).data
    }));
  };
});
x.forEach(["post", "put", "patch"], function(e) {
  function t(n) {
    return function(i, o, r) {
      return this.request(bt(r || {}, {
        method: e,
        headers: n ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url: i,
        data: o
      }));
    };
  }
  ht.prototype[e] = t(), ht.prototype[e + "Form"] = t(!0);
});
let yd = class or {
  constructor(e) {
    if (typeof e != "function")
      throw new TypeError("executor must be a function.");
    let t;
    this.promise = new Promise(function(i) {
      t = i;
    });
    const n = this;
    this.promise.then((s) => {
      if (!n._listeners) return;
      let i = n._listeners.length;
      for (; i-- > 0; )
        n._listeners[i](s);
      n._listeners = null;
    }), this.promise.then = (s) => {
      let i;
      const o = new Promise((r) => {
        n.subscribe(r), i = r;
      }).then(s);
      return o.cancel = function() {
        n.unsubscribe(i);
      }, o;
    }, e(function(i, o, r) {
      n.reason || (n.reason = new vt(i, o, r), t(n.reason));
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason)
      throw this.reason;
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(e) {
    if (this.reason) {
      e(this.reason);
      return;
    }
    this._listeners ? this._listeners.push(e) : this._listeners = [e];
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(e) {
    if (!this._listeners)
      return;
    const t = this._listeners.indexOf(e);
    t !== -1 && this._listeners.splice(t, 1);
  }
  toAbortSignal() {
    const e = new AbortController(), t = (n) => {
      e.abort(n);
    };
    return this.subscribe(t), e.signal.unsubscribe = () => this.unsubscribe(t), e.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let e;
    return {
      token: new or(function(s) {
        e = s;
      }),
      cancel: e
    };
  }
};
function bd(a) {
  return function(t) {
    return a.apply(null, t);
  };
}
function wd(a) {
  return x.isObject(a) && a.isAxiosError === !0;
}
const za = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(za).forEach(([a, e]) => {
  za[e] = a;
});
function rr(a) {
  const e = new ht(a), t = mo(ht.prototype.request, e);
  return x.extend(t, ht.prototype, e, { allOwnKeys: !0 }), x.extend(t, e, null, { allOwnKeys: !0 }), t.create = function(s) {
    return rr(bt(a, s));
  }, t;
}
const ce = rr(ln);
ce.Axios = ht;
ce.CanceledError = vt;
ce.CancelToken = yd;
ce.isCancel = Go;
ce.VERSION = Nn;
ce.toFormData = Gn;
ce.AxiosError = E;
ce.Cancel = ce.CanceledError;
ce.all = function(e) {
  return Promise.all(e);
};
ce.spread = bd;
ce.isAxiosError = wd;
ce.mergeConfig = bt;
ce.AxiosHeaders = _e;
ce.formToJSON = (a) => Vo(x.isHTMLForm(a) ? new FormData(a) : a);
ce.getAdapter = ir.getAdapter;
ce.HttpStatusCode = za;
ce.default = ce;
const {
  Axios: Fh,
  AxiosError: Bh,
  CanceledError: jh,
  isCancel: zh,
  CancelToken: qh,
  VERSION: Hh,
  all: Wh,
  Cancel: Vh,
  isAxiosError: Gh,
  spread: Jh,
  toFormData: Kh,
  AxiosHeaders: Xh,
  HttpStatusCode: Yh,
  formToJSON: Qh,
  getAdapter: Zh,
  mergeConfig: eg
} = ce, Ie = Y("Updater"), _d = lo, Sa = Xi.join(ye.getPath("temp"), "magiorix-updates");
let ve = null, ot = null;
function Sd() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return process.arch === "arm64" ? "macos-apple" : "macos-intel";
    default:
      return "unknown";
  }
}
function Cd(a) {
  return new Promise((e, t) => {
    const n = no.createHash("sha256"), s = Kt.createReadStream(a);
    s.on("data", (i) => n.update(i)), s.on("end", () => e(n.digest("hex"))), s.on("error", t);
  });
}
function Rd(a) {
  ve = a;
}
async function cr() {
  if (!ve) {
    Ie.error("主窗口未设置");
    return;
  }
  try {
    const a = ye.getVersion(), e = Sd();
    Ie.info(`检查更新 — 当前版本: ${a}, 平台: ${e}`);
    const n = (await ce.get(`${_d}/api/desktop-versions/check`, {
      params: {
        currentVersion: a,
        platform: e
      }
    })).data;
    if (n.code !== 200)
      throw new Error(n.message || "检查更新失败");
    const s = n.data;
    if (!s.hasUpdate) {
      Ie.info("当前已是最新版本"), ve.webContents.send(qe.updateNotAvailable);
      return;
    }
    Ie.info("发现新版本:", s.version), ve.webContents.send(qe.updateAvailable, {
      version: s.version,
      updateLog: s.updateLog,
      forceUpdate: s.forceUpdate,
      fileSize: s.fileSize,
      fileName: s.fileName,
      downloadUrl: s.downloadUrl,
      checksum: s.checksum
    });
  } catch (a) {
    Ie.error("检查更新失败:", a);
    const e = a instanceof Error ? a.message : "检查更新失败";
    ve == null || ve.webContents.send(qe.updateError, e);
  }
}
async function Ad(a, e, t) {
  if (!ve) {
    Ie.error("主窗口未设置");
    return;
  }
  try {
    Kt.existsSync(Sa) || Kt.mkdirSync(Sa, { recursive: !0 });
    const n = Xi.join(Sa, e);
    ot = n, Ie.info(`下载更新: ${a}`), Ie.debug(`保存路径: ${n}`);
    const s = await ce({
      method: "get",
      url: a,
      responseType: "stream"
    }), i = parseInt(s.headers["content-length"] || "0", 10);
    let o = 0;
    const r = Kt.createWriteStream(n);
    if (s.data.on("data", (u) => {
      o += u.length;
      const l = i > 0 ? o / i * 100 : 0;
      ve == null || ve.webContents.send(qe.downloadProgress, {
        percent: Math.round(l),
        transferred: o,
        total: i
      });
    }), s.data.pipe(r), await new Promise((u, l) => {
      r.on("finish", () => u()), r.on("error", l);
    }), Ie.info("下载完成"), Ie.info("校验文件完整性..."), (await Cd(n)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))
      throw new Error("文件校验失败，请重新下载");
    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n
    }), setTimeout(() => Ed(), 1200);
  } catch (n) {
    Ie.error("下载更新失败:", n);
    const s = n instanceof Error ? n.message : "下载更新失败";
    ve == null || ve.webContents.send(qe.updateError, s);
  }
}
function Ed() {
  if (!ot || !Kt.existsSync(ot)) {
    Ie.error("下载文件未找到");
    return;
  }
  Ie.info("安装更新:", ot);
  const a = process.platform, e = Ja(ye.getPath("exe"));
  a === "win32" ? (Tr(ot, ["/S", `/D=${e}`], {
    detached: !0,
    stdio: "ignore"
  }).unref(), ye.quit()) : (a === "darwin" || a === "linux") && (Ji.openPath(ot), ve == null || ve.webContents.send(qe.manualInstall, {
    filePath: ot
  }));
}
function kd() {
  F.on(qe.startDownload, (a, { downloadUrl: e, fileName: t, checksum: n }) => {
    Ad(e, t, n);
  }), F.on(qe.installUpdate, () => {
    Ed();
  }), F.on(qe.checkForUpdates, () => {
    cr();
  });
}
const Td = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict", Id = 128;
let rt, Pt;
function Pd(a) {
  !rt || rt.length < a ? (rt = Buffer.allocUnsafe(a * Id), Ss.getRandomValues(rt), Pt = 0) : Pt + a > rt.length && (Ss.getRandomValues(rt), Pt = 0), Pt += a;
}
function $d(a = 21) {
  Pd(a |= 0);
  let e = "";
  for (let t = Pt - a; t < Pt; t++)
    e += Td[rt[t] & 63];
  return e;
}
const Dd = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "Win32"
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    platform: "Win32"
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    platform: "Win32"
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    platform: "Win32"
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "MacIntel"
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    platform: "MacIntel"
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    platform: "MacIntel"
  }
], Ld = [
  { language: "zh-CN", languages: ["zh-CN", "zh", "en"] },
  { language: "zh-CN", languages: ["zh-CN", "zh", "en-US", "en"] },
  { language: "zh", languages: ["zh", "zh-CN", "en-US"] }
], Nd = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Singapore"
], Od = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1680, height: 1050 },
  { width: 3840, height: 2160 }
], Md = [4, 8, 12, 16], Ud = [4, 8, 16], Fd = [
  { vendor: "Intel Inc.", renderer: "Intel Iris OpenGL Engine" },
  { vendor: "Intel Inc.", renderer: "Intel(R) UHD Graphics 630" },
  { vendor: "Intel Inc.", renderer: "Intel(R) Iris(R) Xe Graphics" },
  { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)" },
  { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)" },
  {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    vendor: "Google Inc. (AMD)",
    renderer: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    vendor: "Google Inc. (Intel)",
    renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  }
];
function lr() {
  return so(4).readUInt32BE(0) / 4294967296;
}
function wi(a, e) {
  return Math.floor(lr() * (e - a + 1)) + a;
}
function it(a) {
  if (a.length === 0)
    throw new Error("cannot pick from empty array");
  return a[Math.floor(lr() * a.length)];
}
function yn(a) {
  return so(a).toString("hex");
}
function Bd() {
  const a = it(Dd), e = it(Ld), t = it(Nd), n = it(Od), s = it(Md), i = it(Ud), o = it(Fd), r = n.width - wi(0, 100), c = n.height - wi(60, 120);
  return {
    userAgent: a.userAgent,
    platform: a.platform,
    language: e.language,
    languages: [...e.languages],
    timezone: t,
    screen: {
      width: n.width,
      height: n.height,
      colorDepth: 24
    },
    viewport: {
      width: r,
      height: c
    },
    hardwareConcurrency: s,
    deviceMemory: i,
    seeds: {
      canvas: yn(16),
      audio: yn(16),
      webgl: yn(16),
      fonts: yn(16)
    },
    webgl: {
      vendor: o.vendor,
      renderer: o.renderer
    }
  };
}
function jd(a) {
  return `(() => {
  try {
    const PROFILE = ${JSON.stringify(a)};

    // ====================== navigator 改写 ======================
    const safeDefine = (obj, key, getter) => {
      try {
        Object.defineProperty(obj, key, { get: getter, configurable: true });
      } catch (_e) {
        /* 某些 key 在某些 chromium 版本是不可重定义的，忽略 */
      }
    };

    safeDefine(navigator, 'userAgent', () => PROFILE.userAgent);
    safeDefine(navigator, 'appVersion', () => PROFILE.userAgent.replace(/^Mozilla\\//, ''));
    safeDefine(navigator, 'platform', () => PROFILE.platform);
    safeDefine(navigator, 'language', () => PROFILE.language);
    safeDefine(navigator, 'languages', () => PROFILE.languages);
    safeDefine(navigator, 'hardwareConcurrency', () => PROFILE.hardwareConcurrency);
    safeDefine(navigator, 'deviceMemory', () => PROFILE.deviceMemory);

    // plugins / mimeTypes 清空（现代 chromium 已废弃但仍是指纹点）
    const emptyArrayLike = () => Object.assign([], { length: 0, item: () => null, namedItem: () => null });
    safeDefine(navigator, 'plugins', emptyArrayLike);
    safeDefine(navigator, 'mimeTypes', emptyArrayLike);

    // ====================== screen 改写 ======================
    safeDefine(screen, 'width', () => PROFILE.screen.width);
    safeDefine(screen, 'height', () => PROFILE.screen.height);
    safeDefine(screen, 'availWidth', () => PROFILE.screen.width);
    safeDefine(screen, 'availHeight', () => PROFILE.screen.height);
    safeDefine(screen, 'colorDepth', () => PROFILE.screen.colorDepth);
    safeDefine(screen, 'pixelDepth', () => PROFILE.screen.colorDepth);

    // ====================== timezone 改写 ======================
    // 常见时区 → UTC offset（分钟，与 Date.getTimezoneOffset 同符号约定，东区为负）
    const TZ_OFFSET_MIN = {
      'Asia/Shanghai': -480,
      'Asia/Hong_Kong': -480,
      'Asia/Taipei': -480,
      'Asia/Singapore': -480,
      'Asia/Tokyo': -540,
      'Asia/Seoul': -540,
      'Europe/London': 0,
      'Europe/Berlin': -60,
      'America/New_York': 300,
      'America/Los_Angeles': 480,
      UTC: 0,
    };
    const tzOffset = TZ_OFFSET_MIN[PROFILE.timezone] != null ? TZ_OFFSET_MIN[PROFILE.timezone] : -480;

    const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      const r = origResolvedOptions.call(this);
      r.timeZone = PROFILE.timezone;
      return r;
    };
    Date.prototype.getTimezoneOffset = function () {
      return tzOffset;
    };

    // ====================== 确定性 PRNG（驱动各 seed 扰动） ======================
    function seededHash(seed, idx) {
      let h = 0;
      const s = String(seed);
      for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i) + idx) & 0xffff;
      }
      return h & 0xff;
    }

    // ====================== Canvas 指纹扰动 ======================
    const canvasSeed = PROFILE.seeds.canvas;
    if (typeof HTMLCanvasElement !== 'undefined') {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        try {
          const ctx = this.getContext && this.getContext('2d');
          if (ctx && this.width > 2 && this.height > 2) {
            const ox = seededHash(canvasSeed, 1) % 4;
            const oy = seededHash(canvasSeed, 2) % 4;
            ctx.fillStyle =
              'rgba(' +
              (seededHash(canvasSeed, 3) % 256) +
              ',' +
              (seededHash(canvasSeed, 4) % 256) +
              ',' +
              (seededHash(canvasSeed, 5) % 256) +
              ',0.01)';
            ctx.fillRect(this.width - ox - 1, this.height - oy - 1, 1, 1);
          }
        } catch (_e) {
          /* 不阻断主流程 */
        }
        return origToDataURL.apply(this, arguments);
      };
    }
    if (typeof CanvasRenderingContext2D !== 'undefined') {
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const data = origGetImageData.apply(this, arguments);
        try {
          const bytes = data.data;
          const len = bytes.length;
          for (let i = 0; i < 12 && i < len; i++) {
            const noise = (seededHash(canvasSeed, 100 + i) % 3) - 1;
            const idx = len - 1 - i;
            bytes[idx] = Math.max(0, Math.min(255, bytes[idx] + noise));
          }
        } catch (_e) {
          /* ignore */
        }
        return data;
      };
    }

    // ====================== Audio 指纹扰动 ======================
    const audioSeed = PROFILE.seeds.audio;
    if (typeof AudioBuffer !== 'undefined') {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function (channel) {
        const data = origGetChannelData.call(this, channel);
        try {
          const lim = Math.min(32, data.length);
          for (let i = 0; i < lim; i++) {
            const noise = ((seededHash(audioSeed, i) % 1000) - 500) * 1e-10;
            data[i] = data[i] + noise;
          }
        } catch (_e) {
          /* ignore */
        }
        return data;
      };
    }

    // ====================== WebGL 指纹改写 ======================
    const WEBGL_VENDOR = PROFILE.webgl.vendor;
    const WEBGL_RENDERER = PROFILE.webgl.renderer;
    function patchWebGL(proto) {
      const origGetParameter = proto.getParameter;
      proto.getParameter = function (param) {
        // 37445 = UNMASKED_VENDOR_WEBGL, 37446 = UNMASKED_RENDERER_WEBGL
        // 7936  = VENDOR,                7937  = RENDERER
        if (param === 37445 || param === 7936) return WEBGL_VENDOR;
        if (param === 37446 || param === 7937) return WEBGL_RENDERER;
        return origGetParameter.call(this, param);
      };
    }
    if (typeof WebGLRenderingContext !== 'undefined') {
      patchWebGL(WebGLRenderingContext.prototype);
    }
    if (typeof WebGL2RenderingContext !== 'undefined') {
      patchWebGL(WebGL2RenderingContext.prototype);
    }

    // ====================== WebRTC ICE 候选屏蔽 ======================
    // 防止本地 IP 通过 STUN 暴露给页面 JS。
    if (typeof RTCPeerConnection !== 'undefined') {
      const origCreateOffer = RTCPeerConnection.prototype.createOffer;
      RTCPeerConnection.prototype.createOffer = function () {
        const p = origCreateOffer.apply(this, arguments);
        return p && typeof p.then === 'function'
          ? p.then((offer) => {
              if (offer && typeof offer.sdp === 'string') {
                offer.sdp = offer.sdp.replace(/^a=candidate.*$/gim, '');
              }
              return offer;
            })
          : p;
      };
      const origCreateAnswer = RTCPeerConnection.prototype.createAnswer;
      RTCPeerConnection.prototype.createAnswer = function () {
        const p = origCreateAnswer.apply(this, arguments);
        return p && typeof p.then === 'function'
          ? p.then((answer) => {
              if (answer && typeof answer.sdp === 'string') {
                answer.sdp = answer.sdp.replace(/^a=candidate.*$/gim, '');
              }
              return answer;
            })
          : p;
      };
    }
  } catch (err) {
    // 不能影响页面渲染；只在 console 留痕方便定位
    try {
      console.warn('[fingerprint] inject failed:', err && err.message);
    } catch (_e) {
      /* ignore */
    }
  }
})();`;
}
const Ca = Y("ScraperWindowManager");
class _t {
  constructor() {
    w(this, "windows", /* @__PURE__ */ new Map());
    /** 记录每个 partition 已注册过 webRequest 拦截器，避免重复绑定 */
    w(this, "patchedSessions", /* @__PURE__ */ new Set());
  }
  /**
   * 创建或获取指定名称的窗口
   *
   * @param options.partition - Electron session partition。
   *   使用 `persist:xxx` 前缀可持久化 cookie 到磁盘，同名 partition 的窗口共享 session。
   *   例如 `persist:starmap` 使星图的授权窗口和采集窗口共享登录态。
   * @param options.fingerprintProfile - 可选的指纹 profile。
   *   传入后：
   *   1. 窗口尺寸覆盖为 profile.viewport
   *   2. session 全局 UA 设为 profile.userAgent（HTTP 头层面）
   *   3. webRequest.onBeforeSendHeaders 改写 Accept-Language
   *   4. 'did-start-loading' / 'did-frame-finish-load' 时把指纹脚本注入渲染上下文，
   *      在页面 JS 执行前覆盖 canvas / audio / webgl / navigator 等检测点。
   *   不传则窗口"裸奔"（行为同改造前）。
   */
  createWindow(e, t) {
    this.closeWindow(e);
    const n = t.fingerprintProfile ?? null, s = (n == null ? void 0 : n.viewport.width) ?? t.width ?? 1e3, i = (n == null ? void 0 : n.viewport.height) ?? t.height ?? 600, o = new Dt({
      width: s,
      height: i,
      show: t.show ?? !1,
      webPreferences: {
        nodeIntegration: !1,
        sandbox: !0,
        ...t.partition ? { partition: t.partition } : {}
      }
    });
    return o.webContents.setAudioMuted(!0), n && this.applyFingerprint(o, n, t.partition), o.webContents.loadURL(t.url), this.windows.set(e, o), o.on("closed", () => {
      this.windows.delete(e);
    }), o;
  }
  /**
   * 给指定窗口应用指纹 profile。
   *
   * 注入策略说明：
   * - HTTP 头层面：session.setUserAgent + webRequest.onBeforeSendHeaders 改 Accept-Language。
   *   这两层是"声明性"的，不会被页面 JS 篡改。
   * - DOM 层面：通过 'did-start-loading' / 'did-frame-finish-load' 两次注入字符串脚本，
   *   覆盖 navigator / screen / Intl / Canvas / Audio / WebGL / RTC 等检测点。
   *
   * 为什么不用 session.setPreloads：
   *   setPreloads 需要传一个磁盘上的 .js 文件路径，每个账号的 profile 不同就要每个账号
   *   写一份文件，并在 app.userData 下管理生命周期，代价高于收益。executeJavaScript +
   *   'did-start-loading' 在实测中能拦下 FingerprintJS / browserleaks 的全部指纹点
   *   （它们都在 DOMContentLoaded 之后才采集）。
   */
  applyFingerprint(e, t, n) {
    const s = e.webContents.session;
    try {
      s.setUserAgent(t.userAgent);
    } catch (c) {
      Ca.warn("setUserAgent 失败:", c);
    }
    const i = n ?? "__default";
    if (!this.patchedSessions.has(i))
      try {
        const c = zd(t.language, t.languages);
        s.webRequest.onBeforeSendHeaders((u, l) => {
          const p = { ...u.requestHeaders, "Accept-Language": c };
          l({ requestHeaders: p });
        }), this.patchedSessions.add(i);
      } catch (c) {
        Ca.warn("webRequest.onBeforeSendHeaders 绑定失败:", c);
      }
    const o = jd(t), r = () => {
      e.isDestroyed() || e.webContents.executeJavaScript(o, !1).catch((c) => {
        Ca.warn(
          "[fingerprint] executeJavaScript 失败:",
          c instanceof Error ? c.message : String(c)
        );
      });
    };
    e.webContents.on("did-start-loading", r), e.webContents.on("did-frame-finish-load", (c, u) => {
      u || r();
    });
  }
  /** 获取窗口 */
  getWindow(e) {
    const t = this.windows.get(e);
    if (t && !t.isDestroyed())
      return t;
    this.windows.delete(e);
  }
  /** 关闭窗口 */
  closeWindow(e) {
    const t = this.windows.get(e);
    t && !t.isDestroyed() && t.close(), this.windows.delete(e);
  }
  /** 关闭所有窗口 */
  closeAll() {
    for (const [, e] of this.windows)
      e.isDestroyed() || e.close();
    this.windows.clear();
  }
}
function zd(a, e) {
  const t = e.filter((i) => i !== a);
  if (t.length === 0) return a;
  const n = [a];
  let s = 9;
  for (const i of t)
    n.push(`${i};q=0.${s}`), s > 1 && s--;
  return n.join(",");
}
const W = {
  auth: {
    /** 检查指定插件的授权状态 (invoke, renderer → main) */
    check: "scraper:auth:check",
    /** 发起授权流程 (invoke, renderer → main) */
    login: "scraper:auth:login",
    /** 授权状态变更 (send, main → renderer) */
    statusChanged: "scraper:auth:status-changed"
  },
  task: {
    /** 启动采集任务 (send, renderer → main) */
    start: "scraper:task:start",
    /** 暂停任务 (send, renderer → main) */
    pause: "scraper:task:pause",
    /** 继续任务 (send, renderer → main) */
    resume: "scraper:task:resume",
    /** 取消任务 (send, renderer → main) */
    cancel: "scraper:task:cancel",
    /** 单条结果推送 (send, main → renderer) */
    itemResult: "scraper:task:item-result",
    /** 进度更新 (send, main → renderer) */
    progress: "scraper:task:progress",
    /** 任务完成 (send, main → renderer) */
    complete: "scraper:task:complete",
    /** 任务错误 (send, main → renderer) */
    error: "scraper:task:error",
    /** 任务暂停状态变更 (send, main → renderer) */
    paused: "scraper:task:paused",
    /** 普通上传采集触发验证码 (send, main → renderer) */
    captchaRequired: "scraper:task:captcha-required",
    /** 普通上传采集验证码解决/超时 (send, main → renderer) */
    captchaResolved: "scraper:task:captcha-resolved"
  },
  export: {
    /** 导出带样式的 Excel (invoke, renderer → main) */
    toExcel: "scraper:export:to-excel"
  }
}, Wt = Y("SchedulerApi"), qd = 500, ct = class ct {
  constructor() {
    w(this, "baseUrl", "");
    w(this, "token", null);
    w(this, "onAuthExpired", null);
    /**
     * 当前账号是否未加入企业。
     *
     * 调度器调用的所有接口（scraping-tasks / scraper-accounts / bloggers 等）都
     * 走 `getScopeFromCtx`：用户已登录但无 organizationMember 时统一回 403
     * "当前账号未加入企业"。这种状态下重试无意义，每 60s 一次拉取只会刷日志。
     *
     * 命中后置为 true，syncFromBackend 提前 short-circuit；setAuth（重新登录或
     * 加入企业后再登录）时复位为 false。
     */
    w(this, "noEnterprise", !1);
  }
  static get() {
    return ct.instance || (ct.instance = new ct()), ct.instance;
  }
  setAuth(e, t) {
    this.baseUrl = e.replace(/\/+$/, ""), this.token = t, this.noEnterprise = !1, Wt.info(`认证已更新: baseUrl=${this.baseUrl}, hasToken=${!!t}`);
  }
  /**
   * 注册 401 回调。模块 init 时调用，负责：
   *   1) emit IPC `scraping-scheduler:auth-expired` 给渲染进程
   *   2) 卸载所有 cron 任务，避免 60s 重试死循环
   */
  setAuthExpiredHandler(e) {
    this.onAuthExpired = e;
  }
  isAuthenticated() {
    return !!this.token && !!this.baseUrl;
  }
  /**
   * 是否已加入企业（有 organizationMember 范围）。
   *
   * Scheduler 在 isAuthenticated 之外再校验本方法，未加入企业时跳过整轮 sync，
   * 避免 60s 一次的 403 噪声。
   */
  isEnterpriseScoped() {
    return !this.noEnterprise;
  }
  // ===== ScrapingTask =====
  async listTasks(e) {
    const n = (await this.request(
      "GET",
      "/api/scraping-tasks"
    )).data;
    let s = [];
    return Array.isArray(n) ? s = n : n && Array.isArray(n.list) && (s = n.list), e !== void 0 && (s = s.filter((i) => i.enabled === e)), s.map(Hd);
  }
  async createRun(e, t = {}) {
    var s;
    const n = await this.request("POST", `/api/scraping-tasks/${encodeURIComponent(e)}/runs`, {
      targetCount: t.targetCount ?? 0,
      ...t.fromRunId ? { fromRunId: t.fromRunId } : {}
    });
    if (!((s = n.data) != null && s.id))
      throw new Error("创建 run 失败：返回缺 id");
    return {
      id: n.data.id,
      pendingBloggerIds: Array.isArray(n.data.pendingBloggerIds) ? n.data.pendingBloggerIds : null
    };
  }
  /**
   * 查询当前任务下最近一次 PAUSED 的 run（用于 in-place 续跑）。
   * 没有 PAUSED 时返回 null。
   *
   * 返回字段必须涵盖 dispatcher 续跑时需要的所有累计值：
   *   pendingBloggerIds（target 队列）/ processedBloggerIds（已处理去重）/
   *   successCount/failedCount/captchaCount（累计计数起点）/ errorLog（日志拼接）
   */
  async findLastPausedRun(e) {
    var s;
    const n = ((s = (await this.request("GET", `/api/scraping-tasks/${encodeURIComponent(e)}/runs?take=10`, void 0)).data) == null ? void 0 : s.list) ?? [];
    for (const i of n)
      if (i.status === "PAUSED")
        return {
          id: i.id,
          pendingBloggerIds: Array.isArray(i.pendingBloggerIds) ? i.pendingBloggerIds : null,
          processedBloggerIds: Array.isArray(i.processedBloggerIds) ? i.processedBloggerIds : null,
          targetCount: typeof i.targetCount == "number" ? i.targetCount : 0,
          successCount: typeof i.successCount == "number" ? i.successCount : 0,
          failedCount: typeof i.failedCount == "number" ? i.failedCount : 0,
          captchaCount: typeof i.captchaCount == "number" ? i.captchaCount : 0,
          errorLog: typeof i.errorLog == "string" ? i.errorLog : null,
          pauseReason: typeof i.pauseReason == "string" ? i.pauseReason : null
        };
    return null;
  }
  /**
   * In-place 复活 PAUSED run（PRD §3.3.9 v2）。
   * 后端把 status 从 PAUSED 改回 RUNNING + attempt+1 + 重建 platform locks。
   * 返回值不重要，dispatcher 直接复用本地已有的 parent 字段。
   */
  async resumeRun(e) {
    await this.request(
      "POST",
      `/api/scraping-task-runs/${encodeURIComponent(e)}/resume`,
      void 0
    );
  }
  async recoverInterruptedRuns() {
    var t, n;
    const e = await this.request(
      "POST",
      "/api/scraping-task-runs/recover-interrupted",
      void 0
    );
    return {
      updated: typeof ((t = e.data) == null ? void 0 : t.updated) == "number" ? e.data.updated : 0,
      runIds: Array.isArray((n = e.data) == null ? void 0 : n.runIds) ? e.data.runIds : []
    };
  }
  async updateRun(e, t) {
    await this.request(
      "PUT",
      `/api/scraping-task-runs/${encodeURIComponent(e)}`,
      t
    );
  }
  // ===== ScraperAccount =====
  async listAccounts(e = {}) {
    const t = new URLSearchParams();
    e.platform && t.set("platform", e.platform), e.status && t.set("status", e.status);
    const n = "/api/scraper-accounts" + (t.toString() ? `?${t.toString()}` : ""), i = (await this.request(
      "GET",
      n
    )).data;
    let o = [];
    return Array.isArray(i) ? o = i : i && Array.isArray(i.list) && (o = i.list), o;
  }
  async markAccountRisk(e) {
    await this.request(
      "POST",
      `/api/scraper-accounts/${encodeURIComponent(e)}/risk`
    );
  }
  /**
   * 上报"该账号触发了验证码"，由后端决定是第 1 次提醒还是 24h 内第 2 次惩罚。
   *
   * 后端实现：`scraperAccountService.reportCaptchaTriggered(id)`。
   * 路由：`POST /api/scraper-accounts/{id}/captcha-triggered`。
   *
   * 返回 outcome：
   * - `firstTrigger`：首次触发，前端仅 Toast 提示用户在窗口里完成验证
   * - `secondPenalty`：24h 内第 2 次触发，后端已把账号置 RISK + 设 24h 冷却
   *
   * 调用方（captcha-broker）务必对错误降级处理：本端点失败不应阻塞用户在
   * BrowserWindow 里完成滑块验证。
   */
  async reportCaptchaTriggered(e) {
    const t = await this.request(
      "POST",
      `/api/scraper-accounts/${encodeURIComponent(e)}/captcha-triggered`
    );
    if (!t.data)
      throw new Error("reportCaptchaTriggered: 响应缺 data");
    return t.data;
  }
  /**
   * 获取单个账号详情（含 fingerprintProfile）。
   *
   * 与 listAccounts 的区别：list 接口为减小 payload 不返回 fingerprintProfile，
   * dispatcher 在 run 启动前对每个 ACTIVE 账号调一次 GET 详情拿 profile。
   *
   * 后端 `GET /api/scraper-accounts/{id}` 返回完整 DTO，包含 partition 与 fingerprintProfile。
   */
  async getAccountWithProfile(e) {
    try {
      return (await this.request(
        "GET",
        `/api/scraper-accounts/${encodeURIComponent(e)}`
      )).data ?? null;
    } catch (t) {
      return Wt.warn(`getAccountWithProfile(${e}) 失败:`, t), null;
    }
  }
  // ===== P5.5 新增 =====
  /**
   * 拉某个平台的 PlatformPolicy。
   *
   * 后端实现：`platformPolicyService.get(platform)`（S1），路由 `GET /api/platform-policies/{platform}`（S2）。
   * 策略读取失败时必须 fail closed，由 dispatcher 暂停该平台任务，不能降级默认放行。
   */
  async getPlatformPolicy(e) {
    return (await this.request(
      "GET",
      `/api/platform-policies/${encodeURIComponent(e)}`
    )).data ?? null;
  }
  /**
   * 加载采集策略数值（PRD §5.3 v2）。
   * dispatcher 调用，带 60s 内存缓存，避免每个 run 都打 DB。
   *
   * 后端路由：`GET /api/pace-policies/{id}` — 任何登录用户可读。
   */
  async getPacePolicy(e) {
    return (await this.request(
      "GET",
      `/api/pace-policies/${encodeURIComponent(e)}`
    )).data ?? null;
  }
  /**
   * 批量扣减账号配额（usedToday / usedThisHour）。
   *
   * 后端实现：`accountUsageService.incrementUsageBatch(items)`（S1）。
   * 路由：`POST /api/scraper-accounts/usage-batch`（S2）。
   *
   * dispatcher 内存累加，每 10 条或 run 结束时 flush 一次，降低 DB 压力。
   */
  async incrementUsageBatch(e) {
    e.length !== 0 && await this.request("POST", "/api/scraper-accounts/usage-batch", { items: e });
  }
  /**
   * 调度器主动把账号标为风控（信号触发后调）。
   *
   * 与 `markAccountRisk()` 的区别：本方法**带 reason 和 cooldownMinutes**，
   * 由 dispatcher 在 risk-monitor 触发降速但仍持续失败时调用，将账号置 RISK + 落 cooldown。
   * 后端实现：`scraperAccountService.markRisk(id, reason, cooldownMinutes)`（S1）。
   * 路由：S2 决定，按 plan 默认 `POST /api/scraper-accounts/{id}/risk`（与无参的复用，加 body）。
   */
  async markAccountRiskWithReason(e, t, n) {
    await this.request(
      "POST",
      `/api/scraper-accounts/${encodeURIComponent(e)}/risk`,
      { reason: t, cooldownMinutes: n }
    );
  }
  async updateAccountShiftState(e, t) {
    await this.request(
      "PUT",
      `/api/scraper-accounts/${encodeURIComponent(e)}/shift-state`,
      t
    );
  }
  // ===== Bloggers（按 filter 列出，供 dispatcher 拉目标） =====
  async markBloggerSynced(e, t = /* @__PURE__ */ new Date()) {
    await this.request("PUT", `/api/bloggers/${encodeURIComponent(e)}/synced`, {
      syncedAt: t.toISOString()
    });
  }
  async markBloggersSynced(e, t = /* @__PURE__ */ new Date()) {
    const n = Array.from(new Set(e.filter(Boolean)));
    n.length !== 0 && await this.request("PUT", "/api/bloggers/synced", {
      ids: n,
      syncedAt: t.toISOString()
    });
  }
  async markBloggersPlatformStatus(e, t, n, s = /* @__PURE__ */ new Date()) {
    const i = Array.from(new Set(e.filter(Boolean)));
    i.length !== 0 && await this.request("PUT", "/api/bloggers/platform-status", {
      ids: i,
      platformStatus: t,
      reason: n,
      checkedAt: s.toISOString()
    });
  }
  async upsertBlogger(e) {
    await this.request("POST", "/api/bloggers", e);
  }
  async listBloggersForTask(e, t, n) {
    return (await Promise.all(
      e.map((i) => this.listRefreshQueueForPlatform(i, t, n))
    )).flatMap((i) => i.list);
  }
  /**
   * 续跑用：按 ID 批量拉达人（接口对侧最多 1000 个 id，多了分批）
   * 返回值与 BloggerQueueItem 同构 — dispatcher 取出后过滤掉 url 为空的项。
   */
  async listBloggersByIds(e) {
    var s;
    if (e.length === 0) return [];
    const t = [], n = 500;
    for (let i = 0; i < e.length; i += n) {
      const o = e.slice(i, i + n), c = ((s = (await this.request(
        "POST",
        "/api/bloggers/by-ids",
        { ids: o }
      )).data) == null ? void 0 : s.list) ?? [];
      t.push(...c);
    }
    return t;
  }
  async listRefreshQueueForPlatform(e, t, n) {
    const s = new URLSearchParams();
    if (s.set("platform", e), s.set("take", String(qd)), t === "FILTERED" && n)
      for (const [c, u] of Object.entries(n))
        ["platform", "platforms", "take", "limit", "cursor"].includes(c) || u != null && (typeof u == "string" || typeof u == "number" || typeof u == "boolean") && s.set(c, String(u));
    const i = `/api/bloggers/refresh-queue?${s.toString()}`, r = (await this.request("GET", i)).data;
    if (Array.isArray(r))
      return { list: r, take: null, totalCount: null };
    if (r && Array.isArray(r.list)) {
      const c = r;
      return {
        list: c.list,
        take: typeof c.take == "number" ? c.take : null,
        totalCount: typeof c.totalCount == "number" ? c.totalCount : null
      };
    }
    return { list: [], take: null, totalCount: null };
  }
  // ===== 内部：发请求 =====
  async request(e, t, n) {
    if (!this.baseUrl)
      throw new Error("SchedulerApi: baseUrl 未设置");
    if (!this.token)
      throw new Error("SchedulerApi: token 未设置（用户未登录）");
    const s = this.baseUrl + t;
    return new Promise((i, o) => {
      const r = Jt.request({ url: s, method: e });
      r.setHeader("Content-Type", "application/json"), r.setHeader("satoken", this.token);
      const c = [], u = setTimeout(() => {
        r.abort(), o(new Error(`请求超时: ${e} ${t}`));
      }, 2e4);
      r.on("error", (l) => {
        clearTimeout(u), o(l);
      }), r.on("response", (l) => {
        l.on("data", (p) => c.push(p)), l.on("end", () => {
          clearTimeout(u);
          const p = Buffer.concat(c).toString("utf8");
          let d;
          try {
            d = JSON.parse(p);
          } catch (h) {
            Wt.warn(`响应非 JSON: ${e} ${t}`, h), o(new Error(`响应解析失败 (status=${l.statusCode})`));
            return;
          }
          if (l.statusCode === 401) {
            const h = !!this.token;
            if (this.token = null, h && this.onAuthExpired)
              try {
                this.onAuthExpired();
              } catch (m) {
                Wt.warn("onAuthExpired 回调异常:", m);
              }
            o(new Error("未授权（401）"));
            return;
          }
          if (l.statusCode === 403 || d.code === 403) {
            this.noEnterprise || Wt.info(`API 返回 403，标记为未加入企业（${e} ${t}）`), this.noEnterprise = !0, o(new Error(d.message || `HTTP ${l.statusCode}`));
            return;
          }
          if (l.statusCode >= 400 || d.code >= 400) {
            o(new Error(d.message || `HTTP ${l.statusCode}`));
            return;
          }
          i(d);
        });
      }), n !== void 0 && r.write(JSON.stringify(n)), r.end();
    });
  }
};
w(ct, "instance", null);
let Le = ct;
function Hd(a) {
  let e = a.platforms;
  if (typeof e == "string")
    try {
      e = JSON.parse(e);
    } catch {
      e = [];
    }
  Array.isArray(e) || (e = []);
  let t = null;
  if (Array.isArray(a.fieldsJson))
    t = a.fieldsJson.filter((n) => typeof n == "string");
  else if (typeof a.fieldsJson == "string")
    try {
      const n = JSON.parse(a.fieldsJson);
      Array.isArray(n) && (t = n.filter((s) => typeof s == "string"));
    } catch {
      t = null;
    }
  return {
    ...a,
    platforms: e,
    fieldsJson: t && t.length > 0 ? t : null
  };
}
const ue = Y("ScraperOrchestrator"), _i = 2e3, Wd = 1e4, Vd = 9e4, Gd = 1500, Jd = [
  'iframe[src*="captcha"]',
  'iframe[src*="verify"]',
  '[class*="captcha"]',
  '[id*="captcha"]',
  ".secsdk-captcha-drag-wrapper",
  ".captcha_verify_img",
  '.reds-Modal[class*="verify"]',
  "#captcha_container",
  "#captcha-iframe"
], Kd = [
  "verify_pass",
  "verify-pass",
  "verifyPass",
  "verify_token",
  "verify-token",
  "verifyToken",
  "captcha_pass",
  "captcha-pass",
  "captchaPass",
  "secsdk_captcha_ticket"
];
class Xd {
  constructor(e) {
    w(this, "plugins", /* @__PURE__ */ new Map());
    w(this, "runningTasks", /* @__PURE__ */ new Map());
    w(this, "scrapeWindowManager");
    w(this, "getMainWindow");
    this.getMainWindow = e, this.scrapeWindowManager = new _t();
  }
  /** 注册插件 */
  registerPlugin(e) {
    this.plugins.set(e.id, e), ue.info(`插件已注册: ${e.id} (${e.name})`);
  }
  /** 获取插件 */
  getPlugin(e) {
    return this.plugins.get(e);
  }
  /** 获取所有已注册插件（供调度器 / 调试用） */
  getAllPlugins() {
    return this.plugins;
  }
  /** 检查授权 */
  async checkAuth(e) {
    const t = this.plugins.get(e);
    if (!t)
      return { authorized: !1 };
    this.sendToRenderer(W.auth.statusChanged, {
      pluginId: e,
      status: "checking"
    });
    try {
      const n = await this.withTimeout(
        t.checkAuth(),
        Wd,
        `授权检测超时: ${e}`
      );
      return this.sendToRenderer(W.auth.statusChanged, {
        pluginId: e,
        status: n.authorized ? "authorized" : "unauthorized",
        userInfo: n.userInfo
      }), n;
    } catch (n) {
      return ue.error(`授权检查失败: ${e}`, n), this.sendToRenderer(W.auth.statusChanged, {
        pluginId: e,
        status: "unauthorized"
      }), { authorized: !1 };
    }
  }
  /**
   * 发起授权。
   *
   * profile 来源决策（优先级从高到低）：
   *   1. options.fingerprintProfile —— 调用方显式传入；
   *   2. options.accountId —— 重新授权，从 DB 拉账号已有 profile；
   *   3. 现场生成（新建账号路径）。
   *
   * 返回的 AuthResult.fingerprintProfile 始终是本次"实际注入登录窗口"的那一份，
   * 渲染端在创建账号时透传给后端落库，保证三端（窗口/DB/采集）一致。
   */
  async startAuth(e, t) {
    const n = this.plugins.get(e);
    if (!n)
      return { authorized: !1 };
    this.sendToRenderer(W.auth.statusChanged, {
      pluginId: e,
      status: "authorizing"
    });
    const s = await this.resolveAuthContext(n, e, t);
    try {
      const i = await n.startAuth(s);
      return i.cancelled ? (ue.info(`授权已取消: ${e}`), this.sendToRenderer(W.auth.statusChanged, {
        pluginId: e,
        status: "unauthorized",
        cancelled: !0
      })) : this.sendToRenderer(W.auth.statusChanged, {
        pluginId: e,
        status: i.authorized ? "authorized" : "unauthorized",
        userInfo: i.userInfo
      }), {
        ...i,
        fingerprintProfile: i.fingerprintProfile ?? s.fingerprintProfile,
        sessionPartition: i.sessionPartition ?? s.sessionPartition
      };
    } catch (i) {
      return ue.error(`授权失败: ${e}`, i), this.sendToRenderer(W.auth.statusChanged, {
        pluginId: e,
        status: "unauthorized"
      }), {
        authorized: !1,
        fingerprintProfile: s.fingerprintProfile,
        sessionPartition: s.sessionPartition
      };
    }
  }
  /**
   * 决定本次授权窗口要用哪份指纹。
   *
   * 1. options.fingerprintProfile：调用方显式指定（最高优先级）
   * 2. options.accountId：重新授权 → 拉 DB 已有 profile
   *    - 拉失败时记 warn 然后兜底现场生成（避免阻塞授权）
   *    - 拉到 null（旧账号未补 profile）也走兜底
   * 3. 都没有：新建账号 → 现场生成
   */
  async resolveAuthContext(e, t, n) {
    const s = n == null ? void 0 : n.sessionPartition;
    if (n != null && n.fingerprintProfile)
      return ue.info(`[startAuth:${t}] 使用调用方显式传入的指纹`), {
        fingerprintProfile: n.fingerprintProfile,
        sessionPartition: s ?? (n.createAccountSession ? this.createAccountPartition() : e.sessionPartition)
      };
    if (n != null && n.accountId) {
      const o = Le.get();
      if (o.isAuthenticated())
        try {
          const r = await o.getAccountWithProfile(n.accountId), c = (r == null ? void 0 : r.fingerprintProfile) ?? null, u = (r == null ? void 0 : r.partition) ?? null;
          return c ? (ue.info(`[startAuth:${t}] 复用账号 ${n.accountId} 已落库的指纹`), {
            fingerprintProfile: c,
            sessionPartition: s ?? u ?? e.sessionPartition
          }) : (ue.warn(
            `[startAuth:${t}] 账号 ${n.accountId} 无落库指纹，本次授权不注入指纹`
          ), {
            sessionPartition: s ?? u ?? e.sessionPartition
          });
        } catch (r) {
          ue.warn(
            `[startAuth:${t}] 拉账号 ${n.accountId} 指纹失败，兜底现场生成:`,
            r
          );
        }
      else
        ue.warn(
          `[startAuth:${t}] SchedulerApi 未登录，无法拉账号 ${n.accountId} 指纹，兜底现场生成`
        );
    }
    if (!(n != null && n.createAccountSession))
      return {
        sessionPartition: s ?? e.sessionPartition
      };
    const i = Bd();
    return ue.info(
      `[startAuth:${t}] 现场生成新账号指纹 (UA=${i.userAgent.slice(0, 50)}...)`
    ), {
      fingerprintProfile: i,
      sessionPartition: s ?? (n != null && n.createAccountSession ? this.createAccountPartition() : e.sessionPartition)
    };
  }
  createAccountPartition() {
    return `persist:scraper-${$d(16)}`;
  }
  /** 启动采集任务 */
  async startTask(e) {
    const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);
    ue.info(`[task=${t}] 采集任务启动 plugin=${n} taskType=${s} accountSource=${c} total=${i.length} file=${o}`);
    if (!u) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: `未知插件: ${n}`
      });
      return;
    }
    if (!Array.isArray(i) || i.length === 0) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: "没有可采集的链接",
        errorCategory: "invalid-input",
        errorCategoryLabel: "链接无效"
      });
      return;
    }
    const existingTask = Array.from(this.runningTasks.values()).find((m) => m.pluginId === n && !m.cancelled);
    if (existingTask) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: `已有一个 ${u.name} 采集任务正在运行，请等待当前任务结束`
      });
      return;
    }
    const l = {
      taskId: t,
      pluginId: n,
      taskType: s,
      urls: i,
      fileName: o,
      fields: r,
      current: 0,
      total: i.length,
      successCount: 0,
      errorCount: 0,
      startTime: Date.now(),
      cancelled: !1,
      paused: !1,
      accountSource: c,
      pace: this.getPersonalTaskPace(e)
    };
    if (this.runningTasks.set(t, l), c !== "enterprise") {
      try {
        const m = await this.withTimeout(
          u.checkAuth(),
          Wd,
          `授权检测超时: ${n}`
        );
        if (!m.authorized) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: `${u.name} 授权不可用，请重新授权后再开始采集`,
            errorCategory: "auth",
            errorCategoryLabel: "授权不可用"
          });
          return;
        }
      } catch (m) {
        this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "auth",
          errorCategoryLabel: "授权检测失败"
        });
        return;
      } finally {
        this.runningTasks.has(t) && c !== "enterprise" && l.current === 0 && l.successCount === 0 && l.errorCount === 0 && this.runningTasks.delete(t);
      }
      this.runningTasks.set(t, l);
    }
    if (c === "enterprise") {
      try {
        await this.runEnterpriseTask(l, u, e.pacePolicyId ?? null);
      } catch (m) {
        ue.error(`[task=${t}] enterprise 采集失败:`, m), this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m)
        });
      } finally {
        this.runningTasks.delete(t);
      }
      return;
    }
    const p = `scrape-${t}`, d = this.scrapeWindowManager.createWindow(p, {
      url: u.baseUrl,
      show: !1,
      partition: u.sessionPartition
    });
    ue.info(`[task=${t}] 隐藏采集窗口已创建 plugin=${n} baseUrl=${u.baseUrl} partition=${u.sessionPartition ?? "(默认)"}`);
    await Promise.race([
      new Promise((m) => {
        const f = () => m();
        d.webContents.once("did-finish-load", f), d.webContents.once("did-fail-load", f);
      }),
      this.delay(12e3).then(() => {
        ue.warn(`[task=${t}] 隐藏采集窗口加载超时，继续尝试采集`);
      })
    ]);
    for (let m = 0; m < i.length && !(l.cancelled || l.paused && (await this.waitForResume(l), l.cancelled)); m++) {
      const f = i[m];
      l.current = m + 1;
      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: Math.max(0, Math.round(m / l.total * 100))
      });
      ue.info(`[task=${t}] 开始采集第 ${m + 1}/${i.length} 条 plugin=${n} taskType=${s} url=${String(f).slice(0, 180)}`);
      try {
        let v = !1;
        const y = await pgyTimeout(u.scrapeItem(f, s, {
          window: d,
          session: d.webContents.session,
          requestHeaders: {},
          taskId: t,
          platform: u.platforms[0],
          fields: l.fields,
          requestCaptcha: async (b) => (v = !0, this.handleUploadCaptcha(b))
        }), n === "pgy" ? 9e4 : 12e4, `${n}.${s}.item`);
        if (!v && this.isCaptchaInWindow(d)) {
          if ((await this.handleUploadCaptcha({
            window: d,
            taskId: t,
            platform: u.platforms[0]
          })).resolved) {
            l.current = m, m -= 1;
            continue;
          }
          y.status = "error", y.data = null, y.errorMessage = "安全验证超时或用户取消验证";
        }
        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });
        ue.info(`[task=${t}] 完成采集第 ${m + 1}/${i.length} 条 plugin=${n} status=${y.status} errorCode=${y.errorCode ?? "NONE"} success=${l.successCount} error=${l.errorCount}`);
      } catch (v) {
        const y = this.classifyFailure("UNKNOWN_ERROR", v instanceof Error ? v.message : String(v));
        ue.error(`[task=${t}] 采集第 ${m + 1}/${i.length} 条异常 plugin=${n} url=${String(f).slice(0, 180)}`, v);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: "error",
          data: null,
          errorMessage: v instanceof Error ? v.message : String(v),
          errorCode: "UNKNOWN_ERROR",
          errorCategory: y.code,
          errorCategoryLabel: y.label
        });
      }
      const g = Math.round(l.current / l.total * 100);
      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: g
      });
      if (m < i.length - 1 && !l.cancelled) {
        const v = l.pace, y = v.batchSize > 0 && (m + 1) % v.batchSize === 0, b = y ? v.batchRestMs : v.itemDelayMs;
        y && this.sendToRenderer(W.task.progress, {
          taskId: t,
          current: l.current,
          total: l.total,
          percent: g,
          batchResting: !0,
          batchRestMs: b,
          paceMode: v.mode
        });
        b > 0 && await this.delay(b);
      }
    }
    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;
    ue.info(`[task=${t}] 采集任务结束 plugin=${n} taskType=${s} cancelled=${l.cancelled} success=${l.successCount} error=${l.errorCount} durationMs=${h}`);
    l.cancelled ? this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,
      errorCount: l.errorCount,
      duration: h,
      cancelled: !0
    }) : (this.sendToRenderer(W.task.complete, {
      taskId: t,
      successCount: l.successCount,
      errorCount: l.errorCount,
      duration: h
    }), Et.isSupported() && new Et({
      title: "采集完成",
      body: `${o} 完成采集：成功 ${l.successCount} 条，失败 ${l.errorCount} 条`
    }).show()), this.runningTasks.delete(t);
  }
  /**
   * 企业模式采集：使用企业达人库授权账号池 + PacePolicy 节奏控制。
   *
   * 与个人模式（plugin.sessionPartition 单窗口走通）的关键差异：
   *  - 账号轮询：从 ACTIVE 账号池里按 weight 升序 + 跨班次轮休排序挑选；每条采集时复用当前账号的 partition + fingerprint
   *  - 节奏控制：从 PacePolicy / PlatformPolicy 读 minIntervalMs + shiftSize + shiftRestMinutes
   *  - 班次切换：账号 currentShiftCount 达到 shiftSize → 写入 shiftRestUntil 并切换下一个账号
   *  - 用量回写：每 10 条 batch 一次 incrementUsageBatch
   *  - 全员休息：所有账号都进入班次休息时，直接报错（不像调度器那样 PAUSED 等 60min）
   *
   * 调度器复杂度（token-bucket / 风控降级 / RUN_TIMEOUT / in-place 续跑）这里**不需要**，
   * 笔记采集是一次性任务，跑完导出 xlsx 即结束。
   */
  async runEnterpriseTask(e, t, n) {
    const s = [], i = Le.get();
    try {
      if (!i.isAuthenticated() || !i.isEnterpriseScoped())
        throw new Error("未登录企业账号，无法使用企业账号池");
      const o = t.platforms[0];
      if (!o)
        throw new Error(`插件 ${t.id} 未声明 platform，企业模式不可用`);
      const [r, c, u] = await Promise.all([
        i.listAccounts({ platform: o, status: "ACTIVE" }),
        i.getPlatformPolicy(o),
        n ? i.getPacePolicy(n) : Promise.resolve(null)
      ]);
      if (!c)
        throw new Error(`未找到平台 ${o} 的限速策略`);
      const l = this.mergeEnterprisePolicy(c, u), p = Date.now(), d = r.filter((v) => {
        const y = v.cooldownUntil ? new Date(v.cooldownUntil).getTime() : 0, b = v.shiftRestUntil ? new Date(v.shiftRestUntil).getTime() : 0, S = l.shiftSize - (v.currentShiftCount ?? 0), x = l.scrapesPerDay == null ? Number.POSITIVE_INFINITY : l.scrapesPerDay - (v.usedToday ?? 0);
        return y <= p && b <= p && S > 0 && x > 0;
      });
      if (d.length === 0)
        throw new Error(
          `企业账号池暂无可用账号（共 ${r.length} 个，全部在班次休息、冷却、日额度已满或本班次已满）`
        );
      d.sort((v, y) => {
        const b = v.lastShiftEndedAt ? new Date(v.lastShiftEndedAt).getTime() : 0, S = y.lastShiftEndedAt ? new Date(y.lastShiftEndedAt).getTime() : 0;
        return b !== S ? b - S : y.weight - v.weight;
      }), ue.info(
        `[task=${e.taskId}] enterprise 采集启动 platform=${o} 可用账号=${d.length} minIntervalMs=${l.minIntervalMs} shiftSize=${l.shiftSize} shiftRestMinutes=${l.shiftRestMinutes}`
      );
      const h = 10;
      let m = 0, f = 0;
      const g = async () => {
        if (s.length !== 0)
          try {
            await i.incrementUsageBatch(s.splice(0, s.length));
          } catch (v) {
            ue.warn(`[task=${e.taskId}] usage 回写失败:`, v);
          }
      };
      try {
        for (const v of d) {
          if (e.cancelled || f >= e.urls.length) break;
          const y = `scrape-${e.taskId}-${v.id}`, S = (v.fingerprintProfile ? v : await i.getAccountWithProfile(v.id) ?? v).fingerprintProfile ?? void 0, C = this.scrapeWindowManager.createWindow(y, {
            url: t.baseUrl,
            show: !1,
            partition: v.partition || t.sessionPartition,
            fingerprintProfile: S
          });
          await new Promise((k) => {
            C.webContents.once("did-finish-load", () => k());
          });
          let _ = v.currentShiftCount ?? 0;
          try {
            for (; f < e.urls.length && !e.cancelled && !(e.paused && (await this.waitForResume(e), e.cancelled)); ) {
              if (_ >= l.shiftSize) {
                const T = new Date(Date.now() + l.shiftRestMinutes * 6e4);
                try {
                  await i.updateAccountShiftState(v.id, {
                    currentShiftCount: 0,
                    shiftRestUntil: T.toISOString(),
                    lastShiftEndedAt: (/* @__PURE__ */ new Date()).toISOString()
                  });
                } catch (L) {
                  throw new Error(
                    `账号 ${v.displayName} 班次状态回写失败，为避免账号超班次采集已中止：${L instanceof Error ? L.message : String(L)}`
                  );
                }
                ue.info(
                  `[task=${e.taskId}] 账号 ${v.displayName} 班次满 ${l.shiftSize}，切换下一个`
                );
                break;
              }
              if (m > 0) {
                const T = Date.now() - m;
                if (T < l.minIntervalMs && (await this.delay(l.minIntervalMs - T), e.cancelled))
                  break;
              }
              const k = e.urls[f];
              e.current = f + 1, m = Date.now();
              try {
                let T = !1;
                const L = await t.scrapeItem(k, e.taskType, {
                  window: C,
                  session: C.webContents.session,
                  requestHeaders: {},
                  taskId: e.taskId,
                  platform: o,
                  fields: e.fields,
                  requestCaptcha: async (z) => (T = !0, this.handleUploadCaptcha(z))
                });
                if (!T && this.isCaptchaInWindow(C)) {
                  if ((await this.handleUploadCaptcha({
                    window: C,
                    taskId: e.taskId,
                    platform: o
                  })).resolved) {
                    e.current = f, m = 0;
                    continue;
                  }
                  L.status = "error", L.data = null, L.errorMessage = "安全验证超时或用户取消验证";
                }
                L.status === "success" ? e.successCount++ : e.errorCount++, this.sendToRenderer(W.task.itemResult, {
                  taskId: e.taskId,
                  index: f,
                  status: L.status,
                  data: L.data,
                  errorMessage: L.errorMessage,
                  errorCode: L.errorCode,
                  errorDetails: L.errorDetails
                });
              } catch (T) {
                e.errorCount++, this.sendToRenderer(W.task.itemResult, {
                  taskId: e.taskId,
                  index: f,
                  status: "error",
                  data: null,
                  errorMessage: T instanceof Error ? T.message : String(T),
                  errorCode: "UNKNOWN_ERROR"
                });
              }
              const P = Math.round(e.current / e.total * 100);
              this.sendToRenderer(W.task.progress, {
                taskId: e.taskId,
                current: e.current,
                total: e.total,
                percent: P
              }), _++, s.push({ accountId: v.id, count: 1 }), s.length >= h && await g(), f++;
            }
            if (_ > (v.currentShiftCount ?? 0) && _ < l.shiftSize)
              try {
                await i.updateAccountShiftState(v.id, {
                  currentShiftCount: _
                });
              } catch (k) {
                ue.warn(
                  `[task=${e.taskId}] 账号 ${v.displayName} shiftCount 回写失败:`,
                  k
                );
              }
          } finally {
            this.scrapeWindowManager.closeWindow(y);
          }
        }
      } finally {
        await g();
      }
      f < e.urls.length && !e.cancelled && this.sendToRenderer(W.task.error, {
        taskId: e.taskId,
        message: `企业账号池全部账号班次已耗尽，剩余 ${e.urls.length - f} 条未采集；请稍后再试或增加账号`
      });
    } finally {
      if (s.length > 0)
        try {
          await i.incrementUsageBatch(s.splice(0, s.length));
        } catch (o) {
          ue.warn(`[task=${e.taskId}] 收尾 usage 回写失败:`, o);
        }
      this.sendToRenderer(W.task.complete, {
        taskId: e.taskId,
        successCount: e.successCount,
        errorCount: e.errorCount,
        duration: Date.now() - e.startTime,
        cancelled: e.cancelled
      }), !e.cancelled && Et.isSupported() && new Et({
        title: "采集完成",
        body: `${e.fileName} 完成采集：成功 ${e.successCount} 条，失败 ${e.errorCount} 条`
      }).show();
    }
  }
  /** 把 PlatformPolicy 与 PacePolicy 合并出本次企业采集生效的节奏参数。 */
  mergeEnterprisePolicy(e, t) {
    const n = Math.max(
      (t == null ? void 0 : t.minIntervalMs) ?? e.minIntervalMs,
      _i
    ), s = (t == null ? void 0 : t.scrapesPerDay) ?? e.scrapesPerDay, i = (t == null ? void 0 : t.shiftSize) ?? e.shiftSize, o = Math.max(1, Math.floor(i * ((t == null ? void 0 : t.shiftSizeFactor) ?? 1))), r = (t == null ? void 0 : t.shiftRestMinutes) ?? e.shiftRestMinutes, c = Math.max(0, r * ((t == null ? void 0 : t.restFactor) ?? 1));
    return { minIntervalMs: n, scrapesPerDay: s, shiftSize: o, shiftRestMinutes: c };
  }
  /** 取消任务 */
  cancelTask(e) {
    const t = this.runningTasks.get(e);
    t && (t.cancelled = !0, t.paused && t.pauseResolver && t.pauseResolver(), ue.info(`任务已取消: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`));
  }
  /** 暂停任务 */
  pauseTask(e) {
    const t = this.runningTasks.get(e);
    t && !t.paused && !t.cancelled && (t.paused = !0, ue.info(`任务已暂停: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {
      taskId: e,
      paused: !0
    }));
  }
  /** 继续任务 */
  resumeTask(e) {
    const t = this.runningTasks.get(e);
    t && t.paused && (t.paused = !1, t.pauseResolver && (t.pauseResolver(), t.pauseResolver = void 0), ue.info(`任务已继续: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {
      taskId: e,
      paused: !1
    }));
  }
  /** 等待任务恢复 */
  waitForResume(e) {
    return new Promise((t) => {
      e.pauseResolver = t;
    });
  }
  /** 销毁所有资源 */
  dispose() {
    for (const [, e] of this.runningTasks)
      e.cancelled = !0;
    this.runningTasks.clear(), this.scrapeWindowManager.closeAll();
    for (const [, e] of this.plugins)
      e.dispose();
    this.plugins.clear();
  }
  sendToRenderer(e, t) {
    const n = this.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(e, t);
  }
  getPersonalTaskPace(e) {
    const t = {
      stable: { itemDelayMs: 5e3, batchSize: 20, batchRestMs: 12e4 },
      balanced: { itemDelayMs: 2500, batchSize: 50, batchRestMs: 6e4 },
      fast: { itemDelayMs: 800, batchSize: 100, batchRestMs: 15e3 }
    }, n = typeof e.paceMode == "string" && t[e.paceMode] ? e.paceMode : "balanced", s = t[n], i = Number(e.batchSize), o = Number(e.batchRestMs), r = Number(e.itemDelayMs);
    return {
      mode: n,
      itemDelayMs: Number.isFinite(r) && r >= 0 ? Math.max(0, Math.floor(r)) : s.itemDelayMs,
      batchSize: Number.isFinite(i) && i > 0 ? Math.max(1, Math.floor(i)) : s.batchSize,
      batchRestMs: Number.isFinite(o) && o >= 0 ? Math.max(0, Math.floor(o)) : s.batchRestMs
    };
  }
  classifyFailure(e, t = "", n = null) {
    const s = String(e || "").toUpperCase(), i = `${s} ${String(t || "")} ${JSON.stringify(n || {})}`.toLowerCase();
    if (s.includes("INVALID") || i.includes("链接") && i.includes("无效"))
      return { code: "invalid-input", label: "链接无效" };
    if (s.includes("NOT_FOUND") || i.includes("不存在") || i.includes("未找到"))
      return { code: "not-found", label: "目标不存在" };
    if (s.includes("AUTH") || s.includes("UNAUTHORIZED") || i.includes("401") || i.includes("登录") || i.includes("授权"))
      return { code: "auth", label: "授权失效" };
    if (s.includes("CAPTCHA") || i.includes("验证码") || i.includes("verify") || i.includes("安全验证"))
      return { code: "captcha", label: "验证码/安全验证" };
    if (s.includes("TIMEOUT") || i.includes("timeout") || i.includes("超时"))
      return { code: "timeout", label: "网络或平台超时" };
    if (s.includes("RISK") || i.includes("风控") || i.includes("risk") || i.includes("461") || i.includes("2155") || i.includes("2154"))
      return { code: "risk", label: "平台风控" };
    if (s.includes("UNSUPPORTED"))
      return { code: "unsupported", label: "暂不支持" };
    return { code: "unknown", label: "未知错误" };
  }
  delay(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  withTimeout(e, t, n) {
    let s = null;
    const i = new Promise((o, r) => {
      s = setTimeout(() => r(new Error(n)), t);
    });
    return Promise.race([e, i]).finally(() => {
      s && clearTimeout(s);
    });
  }
  /** 检测当前窗口 URL 是否停在验证码 / 安全验证页面。 */
  isCaptchaInWindow(e) {
    if (e.isDestroyed()) return !1;
    const t = e.webContents.getURL();
    return t.includes("captcha") || t.includes("security-verification") || t.includes("verify");
  }
  async handleUploadCaptcha(e) {
    const {
      window: t,
      platform: n,
      taskId: s = null,
      accountId: i = null,
      urlPatterns: o = ["captcha", "security-verification", "verify"],
      captchaSelectors: r = [...Jd],
      successCookieNames: c = [...Kd],
      timeoutMs: u = Vd
    } = e;
    if (t.isDestroyed())
      return { resolved: !1, timedOut: !1, cancelled: !0 };
    t.isVisible() || t.show(), t.focus(), t.setAlwaysOnTop(!0), this.sendToRenderer(W.task.captchaRequired, {
      taskId: s,
      accountId: i,
      platform: n
    });
    const l = await this.getCookieSnapshot(t, c), p = Date.now();
    let d = !1, h = !1, m = !1;
    try {
      for (; Date.now() - p < u; ) {
        if (t.isDestroyed())
          return { resolved: !1, timedOut: !1, cancelled: !0 };
        const g = t.webContents.getURL(), v = o.some((S) => g.includes(S)), y = await this.hasCaptchaDom(t, r);
        if (v || y)
          h = !0;
        else if (h) {
          d = !0;
          break;
        } else m || (m = !0, ue.info("[captcha] 等待验证码组件渲染后再开始通过判定"));
        if (await this.hasVerifyPassCookie(t, l, c)) {
          d = !0;
          break;
        }
        await this.delay(Gd);
      }
    } finally {
      if (!t.isDestroyed())
        try {
          t.setAlwaysOnTop(!1);
        } catch (g) {
          ue.warn("setAlwaysOnTop(false) 失败:", g);
        }
    }
    const f = {
      resolved: d,
      timedOut: !d
    };
    return this.sendToRenderer(W.task.captchaResolved, {
      taskId: s,
      accountId: i,
      platform: n,
      ...f
    }), f;
  }
  async hasVerifyPassCookie(e, t, n) {
    const s = await this.getCookieSnapshot(e, n);
    for (const [i, o] of s)
      if (t.get(i) !== o) return !0;
    return !1;
  }
  async getCookieSnapshot(e, t) {
    const n = /* @__PURE__ */ new Map();
    if (e.isDestroyed()) return n;
    try {
      const s = new Set(t.map((o) => o.toLowerCase())), i = await e.webContents.session.cookies.get({});
      for (const o of i)
        s.has(o.name.toLowerCase()) && n.set(this.cookieKey(o), o.value);
    } catch {
    }
    return n;
  }
  cookieKey(e) {
    return `${e.domain}|${e.path}|${e.name}`;
  }
  async hasCaptchaDom(e, t) {
    if (e.isDestroyed() || t.length === 0) return !1;
    try {
      const n = JSON.stringify(t.join(", "));
      return await e.webContents.executeJavaScript(
        `!!document.querySelector(${n})`
      ) === !0;
    } catch {
      return !1;
    }
  }
}
class gt {
  /** 发送请求并返回 JSON 字符串 */
  static request(e) {
    return new Promise((t, n) => {
      const s = e.timeout ?? 3e4, i = Jt.request({
        url: e.url,
        method: e.method ?? "GET",
        session: e.session
      });
      if (e.headers)
        for (const [r, c] of Object.entries(e.headers))
          i.setHeader(r, c);
      const o = setTimeout(() => {
        i.abort(), n(new Error(`Request timeout: ${e.url}`));
      }, s);
      i.on("error", (r) => {
        clearTimeout(o), n(r);
      }), i.on("response", (r) => {
        const c = [];
        r.on("error", (u) => {
          clearTimeout(o), n(u);
        }), r.on("data", (u) => {
          c.push(u);
        }), r.on("end", () => {
          clearTimeout(o);
          const l = Buffer.concat(c).toString("utf8");
          t({
            statusCode: r.statusCode,
            data: l
          });
        });
      }), e.body && i.write(e.body), i.end();
    });
  }
  /** 发送请求并返回解析后的 JSON */
  static async requestJson(e) {
    const t = await this.request(e);
    return JSON.parse(t.data);
  }
  /** 下载图片并返回 base64 */
  static async downloadImageAsBase64(e, t, n) {
    return new Promise((s) => {
      const o = Jt.request({
        url: e,
        method: "GET"
      }), r = setTimeout(() => {
        console.log(`[downloadImage] 超时: ${e}`), o.abort(), s(null);
      }, 1e4);
      o.on("error", (c) => {
        console.log(`[downloadImage] 请求错误: ${e}`, c), clearTimeout(r), s(null);
      }), o.on("redirect", (c, u, l) => {
        console.log(`[downloadImage] 重定向 ${c}: ${e} -> ${l}`);
      }), o.on("response", (c) => {
        if (console.log(`[downloadImage] 响应状态: ${c.statusCode}, Content-Type: ${c.headers["content-type"]}, URL: ${e}`), c.statusCode !== 200) {
          console.log("[downloadImage] 非200状态码，放弃下载"), clearTimeout(r), s(null);
          return;
        }
        const u = [];
        c.on("error", (l) => {
          console.log("[downloadImage] 响应流错误:", l), clearTimeout(r), s(null);
        }), c.on("data", (l) => {
          u.push(l);
        }), c.on("end", () => {
          clearTimeout(r);
          const l = Buffer.concat(u);
          if (console.log(`[downloadImage] 下载完成，buffer 大小: ${l.length} bytes`), l.length === 0) {
            console.log("[downloadImage] 警告: 下载的图片为空"), s(null);
            return;
          }
          const d = `data:${c.headers["content-type"] || "image/jpeg"};base64,${l.toString("base64")}`;
          s(d);
        });
      }), o.end();
    });
  }
  /** 解析短链接重定向 */
  static resolveRedirect(e) {
    return new Promise((t, n) => {
      const s = Jt.request({
        url: e,
        method: "GET"
      });
      s.on("error", (i) => {
        n(i);
      }), s.on("redirect", (i, o, r) => {
        s.abort(), t(r);
      }), s.on("response", () => {
        t(e);
      }), s.end();
    });
  }
}
function readLocalPgyCookieHeader() {
  const a = [process.env.PGY_COOKIE, process.env.XHS_COOKIE, process.env.PGY_TOKEN];
  for (const e of a) {
    const t = normalizeLocalPgyCookie(e);
    if (t) return t;
  }
  for (const e of getLocalPgyCookieFiles())
    try {
      if (!kt(e)) continue;
      const t = normalizeLocalPgyCookie(Qi(e, "utf8"));
      if (t) return t;
    } catch (t) {
      j.warn(`[pgy-cookie] 读取本地 Cookie 失败: ${e}`, t);
    }
  return null;
}
function getLocalPgyCookieFiles() {
  const a = [];
  try {
    const e = ye.getPath("userData");
    a.push(Oe(e, "pgy-cookie.txt"), Oe(e, "pgy-cookie.json"), Oe(e, "token.txt"));
  } catch {
  }
  return a;
}
function normalizeLocalPgyCookie(a) {
  if (!a || typeof a != "string") return null;
  const e = a.trim();
  if (!e) return null;
  const t = /^\s*(?:\{|\[|")/.test(e) || !/\r?\n/.test(e) ? parseLocalPgyCookieValue(e) : null;
  if (t) return t;
  for (const n of e.split(/\r?\n/)) {
    const s = parseLocalPgyCookieValue(n.trim());
    if (s) return s;
  }
  return null;
}
function parseLocalPgyCookieValue(a) {
  if (!a || a.startsWith("#")) return null;
  try {
    const e = JSON.parse(a);
    if (typeof e == "string") return parseLocalPgyCookieValue(e);
    if (Array.isArray(e)) {
      const t = e.map((n) => n && typeof n == "object" && typeof n.name == "string" && n.value != null ? `${n.name}=${n.value}` : null).filter(Boolean);
      return t.length ? t.join("; ") : null;
    }
    if (e && typeof e == "object") {
      const t = e.Cookie ?? e.cookie ?? e.PGY_COOKIE ?? e.XHS_COOKIE ?? e.raw ?? e.value;
      if (typeof t == "string") return parseLocalPgyCookieValue(t);
      const n = Object.entries(e).filter(([s, i]) => s && i != null && (typeof i == "string" || typeof i == "number")).map(([s, i]) => `${s}=${i}`);
      return n.length ? n.join("; ") : null;
    }
  } catch {
  }
  const e = a.replace(/^Cookie:\s*/i, "").replace(/^cookie\s*=\s*/i, "").trim();
  return e.includes("=") ? e : null;
}
function getLocalPgyRequestHeaders() {
  const a = readLocalPgyCookieHeader();
  return a ? {
    Cookie: a,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://pgy.xiaohongshu.com"
  } : {};
}
const Re = "https://pgy.xiaohongshu.com", Yd = `${Re}/api/solar/user/info`, Qd = {
  /** 博主基本信息 */
  profile: (a) => `${Re}/api/solar/cooperator/user/blogger/${a}`,
  /** 优效数据 */
  effective: (a) => `${Re}/api/pgy/kol/data/data_summary?userId=${a}&business=1`,
  /** 日常笔记近30天 */
  daily30: (a) => `${Re}/api/solar/kol/data_v3/notes_rate?userId=${a}&business=0&noteType=3&dateType=1&advertiseSwitch=1`,
  /** 日常笔记近90天 */
  daily90: (a) => `${Re}/api/solar/kol/data_v3/notes_rate?userId=${a}&business=0&noteType=3&dateType=2&advertiseSwitch=1`,
  /** 合作笔记近30天 */
  business30: (a) => `${Re}/api/solar/kol/data_v3/notes_rate?userId=${a}&business=1&noteType=3&dateType=1&advertiseSwitch=1`,
  /** 合作笔记近90天 */
  business90: (a) => `${Re}/api/solar/kol/data_v3/notes_rate?userId=${a}&business=1&noteType=3&dateType=2&advertiseSwitch=1`,
  /** 粉丝核心数据 */
  fansSummary: (a) => `${Re}/api/solar/kol/data_v3/fans_summary?userId=${a}`,
  /** 粉丝分布 */
  fansProfile: (a) => `${Re}/api/solar/kol/data/${a}/fans_profile`,
  /** 粉丝增长趋势图 */
  fansTrend: (a) => `${Re}/api/solar/kol/data/${a}/fans_overall_new_history?dateType=1&increaseType=1`,
  /** 近期笔记 */
  noteList10: (a) => `${Re}/api/solar/kol/data_v2/notes_detail?advertiseSwitch=1&orderType=1&pageNumber=1&pageSize=10&userId=${a}&noteType=4&withComponent=false`
}, Zd = [
  "profile",
  "effective",
  "daily30",
  "daily90",
  "business30",
  "business90",
  "fansSummary",
  "fansProfile",
  "fansTrend",
  "noteList10"
], em = (a) => `${Re}/api/solar/note/${a}/detail?bizCode=`, Si = (a) => `${Re}/solar/pre-trade/blogger-detail/${a}`, tm = 3e4, Ct = Y("PgyAuth"), nm = 1e4;
class am {
  constructor(e) {
    w(this, "windowManager");
    w(this, "requestHeaders", {});
    w(this, "intercepted", !1);
    /** 正在进行中的检查 Promise（去重用） */
    w(this, "pendingCheck", null);
    /** 正在进行中的登录 Promise（去重用） */
    w(this, "pendingLogin", null);
    this.windowManager = e;
  }
  async clearAuthSession(e) {
    const t = e ? Pn.fromPartition(e) : Pn.defaultSession, n = Re;
    Ct.info("[startAuth] 清理本地蒲公英授权会话后重新授权");
    try {
      await t.clearStorageData({ origin: n, storages: ["cookies", "localstorage", "indexdb", "filesystem", "serviceworkers", "cachestorage"] });
    } catch (s) {
      Ct.warn("[startAuth] 清理授权存储失败:", s);
    }
    try {
      const s = await t.cookies.get({ url: n });
      await Promise.all(s.map((i) => t.cookies.remove(n, i.name).catch((o) => Ct.warn(`[startAuth] 清理 Cookie 失败: ${i.name}`, o))));
    } catch (s) {
      Ct.warn("[startAuth] 清理授权 Cookie 失败:", s);
    }
  }
  /** 获取已捕获的请求头（供后续 API 调用使用） */
  getRequestHeaders() {
    return { ...this.requestHeaders };
  }
  /** 检查授权状态，开发环境显示窗口方便调试，生产环境隐藏窗口 */
  checkAuth() {
    if (this.pendingCheck)
      return Ct.info("[checkAuth] 已有进行中的检测，复用"), this.pendingCheck;
    const e = !ye.isPackaged;
    return this.pendingCheck = this.performAuth(e, !0).finally(() => {
      this.pendingCheck = null;
    }), this.pendingCheck;
  }
  /** 发起授权流程（显示窗口让用户登录），重复调用会复用同一个 Promise */
  startAuth(e) {
    if (this.pendingLogin)
      return Ct.info("[startAuth] 已有进行中的授权，复用"), this.pendingLogin;
    const t = e == null ? void 0 : e.fingerprintProfile;
    return this.pendingLogin = (async () => (await this.clearAuthSession(e == null ? void 0 : e.sessionPartition), this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition)))().finally(() => {
      this.pendingLogin = null;
    }), this.pendingLogin;
  }
  performAuth(e, t, n, s) {
    return new Promise((i) => {
      this.intercepted = !1;
      let o = !1;
      const r = (u) => {
        o || (o = !0, i(
          n || s ? { ...u, fingerprintProfile: n ?? null, sessionPartition: s ?? null } : u
        ));
      }, c = this.windowManager.createWindow("pgy-auth", {
        url: Re,
        show: e,
        width: 1e3,
        height: 600,
        partition: s,
        fingerprintProfile: n
      });
      t && setTimeout(() => {
        o || (Ct.info("[performAuth] 检查超时，视为未授权"), r({ authorized: !1 }), this.windowManager.closeWindow("pgy-auth"));
      }, nm), c.on("closed", () => {
        !this.intercepted && !o && r({ authorized: !1, cancelled: !t });
      }), this.setupAuthInterceptor(c, t, r);
    });
  }
  setupAuthInterceptor(e, t, n) {
    e.webContents.session.webRequest.onBeforeSendHeaders(
      (s, i) => {
        s.url.includes(Yd) && s.method.toUpperCase() === "GET" && !this.intercepted ? (this.intercepted = !0, this.requestHeaders = s.requestHeaders, this.interceptAndForward(e, s, i, t, n)) : i({ cancel: !1 });
      }
    );
  }
  async interceptAndForward(e, t, n, s, i) {
    var o;
    try {
      const r = await gt.request({
        url: t.url,
        method: "GET",
        session: e.webContents.session,
        headers: {
          ...t.requestHeaders,
          "Sec-Fetch-Mode": "no-cors"
        }
      }), c = JSON.parse(r.data);
      if (s) {
        const u = c.code === 0 && !((o = c.data) != null && o.guest);
        Ct.info(`授权检测: ${u ? "已授权" : "未授权"}`), i({
          authorized: u,
          userInfo: u ? c.data : void 0
        }), this.windowManager.closeWindow("pgy-auth");
      } else
        c.code === 0 ? (Ct.info("授权成功"), i({ authorized: !0, userInfo: c.data }), this.windowManager.closeWindow("pgy-auth")) : this.intercepted = !1;
      n({ cancel: !1 });
    } catch (r) {
      Ct.error("授权拦截失败:", r), this.intercepted = !1, n({ cancel: !1 });
    }
  }
  /** 销毁资源 */
  dispose() {
    this.windowManager.closeWindow("pgy-auth");
  }
}
function ur(a) {
  return !a || a.length === 0 ? null : new Set(a.filter((e) => e.trim().length > 0));
}
function Se(a, e) {
  const t = ur(a);
  return t ? e.some((n) => t.has(n)) : !0;
}
function en(a, e, t = {}) {
  const n = ur(e);
  if (!n) return a;
  const s = /* @__PURE__ */ new Set();
  for (const o of n) {
    s.add(o);
    const r = t[o];
    if (r)
      for (const c of r) s.add(c);
  }
  const i = {};
  for (const [o, r] of Object.entries(a))
    s.has(o) && (i[o] = r);
  return i;
}
class Ze {
  /** 从字符串中提取有效 URL */
  static extractUrl(e) {
    var s;
    let t = e.trim();
    t.startsWith("http") || (t = "https://" + t);
    const n = /https?:\/\/[\w.-]+[\w\/-]*[\w.-]*\??[\w=&:\-+%]*[/]*/;
    return ((s = t.match(n)) == null ? void 0 : s[0]) ?? "";
  }
  /** 从小红书笔记 URL 中提取笔记 ID（24位） */
  static extractNoteId(e) {
    const n = e.replace("https://", "").replace("http://", "").replace("www.xiaohongshu.com/explore/", "").replace("www.xiaohongshu.com/discovery/item/", "").substring(0, 24);
    return n.length === 24 && /^[a-f0-9]{24}$/.test(n) ? n : null;
  }
  /** 从小红书博主 URL 中提取用户 ID（24位） */
  static extractBloggerId(e) {
    const n = e.replace("https://", "").replace("http://", "").replace("www.xiaohongshu.com/user/profile/", "").substring(0, 24);
    return n.length === 24 && /^[a-f0-9]{24}$/.test(n) ? n : null;
  }
  /** 判断是否为短链接 */
  static isShortLink(e) {
    return e.includes("xhslink.com");
  }
}
const bn = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3";
class sm {
  /**
   * 生成 API 签名头
   * @param path - 请求路径（去掉域名部分）
   * @param body - 请求体数据（可选）
   * @returns 包含 X-s 和 X-t 的签名头
   */
  static encryptSign(e, t) {
    const n = "test", s = Date.now(), i = Object.prototype.toString.call(t) === "[object Object]" || Object.prototype.toString.call(t) === "[object Array]", o = [s, n, e, i ? JSON.stringify(t) : ""].join(""), r = no.createHash("md5").update(o).digest("hex");
    return {
      "X-s": im(r),
      "X-t": s
    };
  }
}
function im(a) {
  let e = "";
  for (let s = 0; s < a.length; s++) {
    const i = a.charCodeAt(s);
    i < 128 ? e += String.fromCharCode(i) : i > 127 && i < 2048 ? (e += String.fromCharCode(i >> 6 | 192), e += String.fromCharCode(63 & i | 128)) : (e += String.fromCharCode(i >> 12 | 224), e += String.fromCharCode(i >> 6 & 63 | 128), e += String.fromCharCode(63 & i | 128));
  }
  let t = "", n = 0;
  for (; n < e.length; ) {
    const s = e.charCodeAt(n++), i = e.charCodeAt(n++), o = e.charCodeAt(n++), r = s >> 2, c = (3 & s) << 4 | i >> 4;
    let u = (15 & i) << 2 | o >> 6, l = 63 & o;
    isNaN(i) ? u = l = 64 : isNaN(o) && (l = 64), t += bn.charAt(r) + bn.charAt(c) + bn.charAt(u) + bn.charAt(l);
  }
  return t;
}
const j = Y("PgyScraper"), om = /* @__PURE__ */ new Set([461]), qa = /* @__PURE__ */ new Set([401, -100]), rm = 12e4, cm = "https://pgy.xiaohongshu.com/solar/cooperator/dashboard/note-list", lm = /* @__PURE__ */ new Set([404]);
function Ci(a) {
  return qa.has(a) ? "AUTH_EXPIRED" : lm.has(a) ? "TARGET_NOT_FOUND" : "API_ERROR";
}
function um(a) {
  if (!a || typeof a != "object") return !1;
  const e = a;
  return typeof e.httpStatusCode == "number" && typeof e.text == "string";
}
function pm(a) {
  return !a || typeof a != "object" ? !1 : typeof a.code == "number";
}
const dm = {
  avatar: ["avatar"],
  url: ["url", "pgyUrl"],
  category: ["featureTags", "personalTags"],
  tags: ["featureTags", "personalTags"],
  interactRate: ["interactionRate30", "interactionRate90"],
  priceJson: [
    "picturePrice",
    "videoPrice",
    "pictureReadCost",
    "videoReadCost",
    "estimatePictureEngageCost",
    "estimateVideoEngageCost",
    "estimatePictureCpm",
    "estimateVideoCpm",
    "estimatePictureCpuv",
    "estimateVideoCpuv"
  ],
  fansProvinceChart: ["fansProvinceChart"],
  fansCityChart: ["fansCityChart"],
  fansAgeChart: ["fansAgeChart"],
  fansGenderChart: ["fansGenderChart"],
  fansGrowthTrendChart: ["fansGrowthTrendChart"]
}, mm = {
  profile: [
    "nickname",
    "avatar",
    "url",
    "pgyUrl",
    "redId",
    "currentLevel",
    "liveSign",
    "fansCount",
    "likeCollectCountInfo",
    "personalTags",
    "featureTags",
    "gender",
    "location",
    "picturePrice",
    "videoPrice",
    "category",
    "tags",
    "priceJson"
  ],
  effective: [
    "pictureReadCost",
    "videoReadCost",
    "estimatePictureEngageCost",
    "estimateVideoEngageCost",
    "estimatePictureCpm",
    "estimateVideoCpm",
    "estimatePictureCpuv",
    "estimateVideoCpuv",
    "priceJson"
  ],
  daily30: [
    "noteNumber30",
    "thousandLikePercent30",
    "hundredLikePercent30",
    "readMedian30",
    "interactionRate30",
    "videoFullViewRate30",
    "picture3sViewRate30",
    "mEngagementNum30",
    "impMedian30",
    "likeMedian",
    "collectMedian",
    "commentMedian",
    "shareMedian",
    "interactRate"
  ],
  daily90: [
    "noteNumber90",
    "thousandLikePercent90",
    "hundredLikePercent90",
    "readMedian90",
    "interactionRate90",
    "videoFullViewRate90",
    "picture3sViewRate90",
    "mEngagementNum90",
    "impMedian90",
    "interactRate"
  ],
  business30: [
    "noteNumberBusiness30",
    "thousandLikePercentBusiness30",
    "hundredLikePercentBusiness30",
    "readMedianBusiness30",
    "interactionRateBusiness30",
    "videoFullViewRateBusiness30",
    "picture3sViewRateBusiness30",
    "mEngagementNumBusiness30",
    "impMedianBusiness30",
    "interactRate"
  ],
  business90: [
    "noteNumberBusiness90",
    "thousandLikePercentBusiness90",
    "hundredLikePercentBusiness90",
    "readMedianBusiness90",
    "interactionRateBusiness90",
    "videoFullViewRateBusiness90",
    "picture3sViewRateBusiness90",
    "mEngagementNumBusiness90",
    "impMedianBusiness90",
    "interactRate"
  ],
  fansSummary: ["activeFansRate", "fansIncreaseNum", "fansGrowthRate", "engageFansRate"],
  fansProfile: [
    "fansFemale",
    "fansMale",
    "fansAges0",
    "fansAges1",
    "fansAges2",
    "fansAges3",
    "fansAges4",
    "maxFansAges",
    "fansRegions",
    "fansCities",
    "fansInterests",
    "fansDevices",
    "fansProvinceChart",
    "fansCityChart",
    "fansAgeChart",
    "fansGenderChart"
  ],
  fansTrend: ["fansGrowthTrendChart"],
  noteList10: ["avg10VideoRatio", "avg10ReadNum", "avg10LikeNum", "avg10CollectNum"]
};
function Ra(a) {
  const e = a.match(
    /pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/([a-f0-9]{24})(?:[/?#]|$)/i
  );
  return (e == null ? void 0 : e[1]) ?? null;
}
function Aa(a) {
  return Ze.extractBloggerId(a);
}
function fm(a) {
  try {
    const e = new URL(a).hostname.toLowerCase();
    return e === "xhslink.com" || e.endsWith(".xhslink.com") || e === "xiaohongshu.com" || e === "www.xiaohongshu.com";
  } catch {
    return !1;
  }
}
function Ri(a) {
  try {
    return new URL(a).hostname.toLowerCase() === "pgy.xiaohongshu.com";
  } catch {
    return !1;
  }
}
const PYG_CHART_FIELDS = {
  province: "fansProvinceChart",
  city: "fansCityChart",
  age: "fansAgeChart",
  gender: "fansGenderChart",
  trend: "fansGrowthTrendChart"
};
function pgyHasSelectedField(a, e) {
  const t = ur(a);
  return t ? t.has(e) : !0;
}
function pgyChartEscape(a) {
  return String(a ?? "").replace(/[&<>"']/g, (e) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[e]);
}
function pgyChartRoot() {
  const a = Oe(Ja(ye.getPath("exe")), "pic");
  try {
    return Sr(a, { recursive: !0 }), a;
  } catch {
    const e = Oe(ye.getPath("userData"), "pic");
    return Sr(e, { recursive: !0 }), e;
  }
}
function pgyChartFile(a, e, t) {
  const n = Oe(pgyChartRoot(), a);
  return Sr(n, { recursive: !0 }), Oe(n, `${String(e).replace(/[^\w.-]/g, "_")}_${t}.png`);
}
function pgyWriteSvgPng(a, e) {
  try {
    const t = `data:image/svg+xml;base64,${Buffer.from(a, "utf8").toString("base64")}`, n = PgyNativeImage.createFromDataURL(t), s = n.toPNG();
    if (s && s.length > 0)
      return Zi(e, s), e;
  } catch (t) {
    j.warn(`[pgy-chart] PNG 生成失败: ${e}`, t);
  }
  return "";
}
const PGY_IMAGE_FIELDS = new Set(Object.values(PYG_CHART_FIELDS)), PGY_CRC_TABLE = (() => {
  const a = new Uint32Array(256);
  for (let e = 0; e < 256; e++) {
    let t = e;
    for (let n = 0; n < 8; n++)
      t = t & 1 ? 3988292384 ^ t >>> 1 : t >>> 1;
    a[e] = t >>> 0;
  }
  return a;
})();
function pgyCrc32(a) {
  let e = 4294967295;
  for (const t of a)
    e = PGY_CRC_TABLE[(e ^ t) & 255] ^ e >>> 8;
  return (e ^ 4294967295) >>> 0;
}
function pgyPngChunk(a, e) {
  const t = Buffer.from(a, "ascii"), n = Buffer.alloc(4), s = Buffer.alloc(4), i = Buffer.alloc(4);
  return n.writeUInt32BE(e.length, 0), s.writeUInt32BE(pgyCrc32(Buffer.concat([t, e])), 0), Buffer.concat([n, t, e, s]);
}
function pgyEncodePng(a, e, t) {
  const n = Buffer.alloc((a * 4 + 1) * e);
  for (let s = 0; s < e; s++) {
    const i = s * (a * 4 + 1);
    n[i] = 0, t.copy(n, i + 1, s * a * 4, (s + 1) * a * 4);
  }
  const s = Buffer.alloc(13);
  return s.writeUInt32BE(a, 0), s.writeUInt32BE(e, 4), s[8] = 8, s[9] = 6, s[10] = 0, s[11] = 0, s[12] = 0, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pgyPngChunk("IHDR", s),
    pgyPngChunk("IDAT", et.deflateSync(n)),
    pgyPngChunk("IEND", Buffer.alloc(0))
  ]);
}
function pgyCanvas(a, e) {
  const t = Buffer.alloc(a * e * 4, 255), n = (i, o, r, c, u = 255) => {
    if (i < 0 || o < 0 || i >= a || o >= e) return;
    const l = (Math.floor(o) * a + Math.floor(i)) * 4;
    t[l] = r, t[l + 1] = c, t[l + 2] = u, t[l + 3] = 255;
  }, s = (i, o, r, c, u, l, p) => {
    const d = Math.max(0, Math.floor(i)), h = Math.max(0, Math.floor(o)), m = Math.min(a, Math.ceil(i + r)), f = Math.min(e, Math.ceil(o + c));
    for (let g = h; g < f; g++)
      for (let v = d; v < m; v++) n(v, g, u, l, p);
  };
  return {
    data: t,
    set: n,
    rect: s,
    line(i, o, r, c, u, l, p, d = 2) {
      const h = Math.abs(r - i), m = Math.abs(c - o), f = i < r ? 1 : -1, g = o < c ? 1 : -1;
      let v = h - m, y = i, b = o;
      for (; ; ) {
        s(y - d / 2, b - d / 2, d, d, u, l, p);
        if (Math.round(y) === Math.round(r) && Math.round(b) === Math.round(c)) break;
        const S = 2 * v;
        S > -m && (v -= m, y += f), S < h && (v += h, b += g);
      }
    }
  };
}
function pgyWritePng(a, e, t, n) {
  const s = pgyCanvas(e, t);
  return n(s), Zi(a, pgyEncodePng(e, t, s.data)), a;
}
function pgyWriteBarChartPng(a, e) {
  if (!a.length) return "";
  return pgyWritePng(e, 640, 500, (t) => {
    const n = 118, s = 34, i = 56, o = 58, r = 640 - n - i, c = Math.max(1, ...a.map((p) => p.value)), u = Math.max(36, (500 - s - o) / Math.max(1, a.length));
    for (let p = 0; p < 5; p++) {
      const d = n + p / 4 * r;
      t.line(d, s, d, 500 - o + 8, 232, 238, 245, 1);
    }
    a.forEach((p, d) => {
      const h = s + d * u + u * 0.28, m = Math.max(3, p.value / c * r);
      t.rect(n, h, r, Math.max(12, u * 0.32), 241, 245, 249);
      t.rect(n, h, m, Math.max(12, u * 0.32), 37, 99, 235);
      t.rect(n - 18, h + 3, 8, 8, 148, 163, 184);
    });
  });
}
function pgyWriteGenderChartPng(a, e) {
  const t = pgyPct(a == null ? void 0 : a.female), n = pgyPct(a == null ? void 0 : a.male), s = t + n;
  if (!s) return "";
  return pgyWritePng(e, 420, 420, (i) => {
    const o = 210, r = 190, c = 128, u = 70, l = Math.PI * 2 * (t / s);
    for (let p = 0; p < 420; p++)
      for (let d = 0; d < 420; d++) {
        const h = d - o, m = p - r, f = Math.sqrt(h * h + m * m);
        if (f >= u && f <= c) {
          let g = Math.atan2(m, h) + Math.PI / 2;
          g < 0 && (g += Math.PI * 2), g <= l ? i.set(d, p, 59, 125, 221) : i.set(d, p, 135, 206, 250);
        }
      }
    i.rect(90, 340, 30, 18, 59, 125, 221), i.rect(238, 340, 30, 18, 135, 206, 250);
  });
}
function pgyWriteTrendChartPng(a, e) {
  const t = Array.isArray(a) ? a.map((n) => Number(n.num ?? n.value ?? 0)).filter((n) => Number.isFinite(n)) : [];
  if (t.length < 2) return "";
  return pgyWritePng(e, 760, 420, (n) => {
    const s = 60, i = 26, o = 36, r = 54, c = Math.min(...t), u = Math.max(...t), l = u === c ? 1 : u - c, p = (f) => s + f / (t.length - 1) * (760 - s - i), d = (f) => 420 - r - (f - c) / l * (420 - o - r);
    for (let f = 0; f < 5; f++) {
      const g = o + f / 4 * (420 - o - r);
      n.line(s, g, 760 - i, g, 226, 232, 240, 1);
    }
    for (let f = 1; f < t.length; f++)
      n.line(p(f - 1), d(t[f - 1]), p(f), d(t[f]), 37, 99, 235, 4);
  });
}
const PGY_PYTHON_CHART_SCRIPT = String.raw`
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_PATHS = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]

def load_font(size, bold=False):
    paths = FONT_PATHS[:]
    if bold:
        paths = [r"C:\Windows\Fonts\msyhbd.ttc"] + paths
    for path in paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

FONT_TITLE = load_font(24, True)
FONT_TEXT = load_font(18)
FONT_SMALL = load_font(15)

def ensure_dir(path):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)

def to_num(value, default=0.0):
    try:
        n = float(value)
        if math.isfinite(n):
            return n
    except Exception:
        pass
    return default

def pct(value):
    n = to_num(value)
    if -1 <= n <= 1:
        return n * 100
    return n

def text_bbox(draw, value, font):
    try:
        return draw.textbbox((0, 0), str(value), font=font)
    except Exception:
        w, h = draw.textsize(str(value), font=font)
        return (0, 0, w, h)

def text_width(draw, value, font):
    box = text_bbox(draw, value, font)
    return box[2] - box[0]

def ellipsize(draw, value, font, max_width):
    value = str(value or "")
    if text_width(draw, value, font) <= max_width:
        return value
    suffix = "..."
    out = value
    while out and text_width(draw, out + suffix, font) > max_width:
        out = out[:-1]
    return (out + suffix) if out else suffix

def rounded_rect(draw, box, radius, fill):
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill)
    else:
        draw.rectangle(box, fill=fill)

def save_bar(chart):
    rows = []
    for row in chart.get("rows") or []:
        name = str(row.get("name") or "")
        value = to_num(row.get("value"))
        if name and value > 0:
            rows.append({"name": name, "value": value})
    if not rows:
        return False
    rows = rows[:10]
    width = 760
    height = max(420, 112 + len(rows) * 48)
    left = 170
    right = 78
    top = 72
    row_h = (height - top - 54) / max(1, len(rows))
    plot_w = width - left - right
    max_v = max(1.0, max(row["value"] for row in rows))
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((32, 24), str(chart.get("title") or "粉丝分布"), font=FONT_TITLE, fill="#111827")
    for i in range(5):
        x = left + plot_w * i / 4
        draw.line((x, top - 8, x, height - 48), fill="#e5e7eb", width=1)
    for idx, row in enumerate(rows):
        y = top + idx * row_h + row_h * 0.24
        bar_h = max(16, row_h * 0.42)
        label = ellipsize(draw, row["name"], FONT_TEXT, left - 48)
        draw.text((left - 18 - text_width(draw, label, FONT_TEXT), y - 1), label, font=FONT_TEXT, fill="#334155")
        rounded_rect(draw, (left, y, left + plot_w, y + bar_h), 7, "#f1f5f9")
        bar_w = max(4, plot_w * row["value"] / max_v)
        rounded_rect(draw, (left, y, left + bar_w, y + bar_h), 7, "#2563eb")
        value_text = f"{row['value']:.1f}%"
        draw.text((min(width - 70, left + bar_w + 12), y - 1), value_text, font=FONT_SMALL, fill="#1f2937")
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True

def save_gender(chart):
    data = chart.get("data") or {}
    female = pct(data.get("female"))
    male = pct(data.get("male"))
    total = female + male
    if total <= 0:
        return False
    width = height = 520
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((34, 24), "粉丝性别分布", font=FONT_TITLE, fill="#111827")
    box = (118, 92, 402, 376)
    female_angle = 360 * female / total
    draw.pieslice(box, start=-90, end=-90 + female_angle, fill="#2563eb")
    draw.pieslice(box, start=-90 + female_angle, end=270, fill="#7dd3fc")
    draw.ellipse((184, 158, 336, 310), fill="white")
    center = f"{female:.1f}%"
    draw.text((260 - text_width(draw, center, FONT_TITLE) / 2, 220), center, font=FONT_TITLE, fill="#111827")
    draw.text((220, 252), "女性占比", font=FONT_SMALL, fill="#64748b")
    rounded_rect(draw, (98, 424, 120, 446), 4, "#2563eb")
    draw.text((132, 420), f"女性 {female:.1f}%", font=FONT_TEXT, fill="#334155")
    rounded_rect(draw, (314, 424, 336, 446), 4, "#7dd3fc")
    draw.text((348, 420), f"男性 {male:.1f}%", font=FONT_TEXT, fill="#334155")
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True

def trend_points(rows):
    points = []
    for row in rows or []:
        value = to_num(row.get("num", row.get("value")))
        date = str(row.get("dateKey", row.get("date", "")) or "")
        if math.isfinite(value):
            points.append({"date": date, "num": value})
    return points

def save_trend(chart):
    rows = trend_points(chart.get("rows"))
    if len(rows) < 2:
        return False
    width, height = 800, 430
    left, right, top, bottom = 78, 34, 74, 58
    plot_w = width - left - right
    plot_h = height - top - bottom
    values = [row["num"] for row in rows]
    min_v = min(values)
    max_v = max(values)
    span = max(max_v - min_v, 1)
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((34, 24), "粉丝增长趋势", font=FONT_TITLE, fill="#111827")
    for i in range(5):
        y = top + plot_h * i / 4
        draw.line((left, y, width - right, y), fill="#e5e7eb", width=1)
        label_v = max_v - span * i / 4
        label = f"{label_v/10000:.1f}w" if abs(label_v) >= 10000 else str(int(round(label_v)))
        draw.text((left - 12 - text_width(draw, label, FONT_SMALL), y - 8), label, font=FONT_SMALL, fill="#64748b")
    def x_at(i):
        return left + plot_w * i / (len(rows) - 1)
    def y_at(v):
        return top + (max_v - v) / span * plot_h
    pts = [(x_at(i), y_at(row["num"])) for i, row in enumerate(rows)]
    for a, b in zip(pts, pts[1:]):
        draw.line((a[0], a[1], b[0], b[1]), fill="#2563eb", width=4)
    for x, y in pts:
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill="#2563eb")
    step = max(1, len(rows) // 6)
    for i, row in enumerate(rows):
        if i % step == 0 or i == len(rows) - 1:
            label = row["date"]
            if len(label) >= 8 and label.isdigit():
                label = label[4:6] + "/" + label[6:8]
            x = x_at(i)
            draw.text((x - text_width(draw, label, FONT_SMALL) / 2, height - 38), label, font=FONT_SMALL, fill="#64748b")
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True

def main():
    payload = json.load(sys.stdin)
    paths = {}
    errors = {}
    for chart in payload.get("charts") or []:
        field = chart.get("field")
        try:
            chart_type = chart.get("type")
            ok = False
            if chart_type == "bar":
                ok = save_bar(chart)
            elif chart_type == "gender":
                ok = save_gender(chart)
            elif chart_type == "trend":
                ok = save_trend(chart)
            if ok and field:
                paths[field] = chart.get("output")
        except Exception as exc:
            if field:
                errors[field] = str(exc)
    print(json.dumps({"ok": True, "paths": paths, "errors": errors}, ensure_ascii=False))

if __name__ == "__main__":
    main()
`;
function pgyChartRendererCandidates() {
  const a = [];
  for (const e of [process.env.PGY_CHART_RENDERER, process.env.PGY_RENDERER_EXE])
    e && a.push(e);
  const e = process.resourcesPath;
  e && a.push(Oe(e, "pgy-chart-renderer.exe"), Oe(e, "bin", "pgy-chart-renderer.exe"));
  const t = process.execPath ? Ja(process.execPath) : "";
  t && a.push(Oe(t, "resources", "pgy-chart-renderer.exe"), Oe(t, "pgy-chart-renderer.exe"));
  a.push(Oe(process.cwd(), "resources", "pgy-chart-renderer.exe"));
  return [...new Set(a)].filter((n) => n && kt(n));
}
function pgyPythonCandidates() {
  const a = [];
  for (const e of [process.env.PGY_PYTHON, process.env.PYTHON])
    e && a.push({ cmd: e, args: [] });
  return a.push({ cmd: "python", args: [] }, { cmd: "py", args: ["-3"] }), a;
}
function pgySpawnChartRenderer(a, e, t) {
  return new Promise((n, s) => {
    let i = "", o = "", r = !1;
    const c = Tr(a, [], {
      windowsHide: !0,
      stdio: ["pipe", "pipe", "pipe"]
    }), u = (p) => {
      r || (r = !0, clearTimeout(l), p ? s(p) : n(i));
    }, l = setTimeout(() => {
      try {
        c.kill();
      } catch {
      }
      u(new Error(`chart renderer timeout after ${t}ms`));
    }, t);
    c.on("error", (p) => u(p)), c.stdout.on("data", (p) => {
      i += p.toString("utf8");
    }), c.stderr.on("data", (p) => {
      o += p.toString("utf8");
    }), c.on("close", (p) => {
      p === 0 ? u(null) : u(new Error(`renderer exit ${p}: ${o.slice(0, 1200)}`));
    }), c.stdin.end(e);
  });
}
function pgySpawnPythonChart(a, e, t, n) {
  return new Promise((s, i) => {
    let o = "", r = "", c = !1;
    const u = Tr(a, [...e, "-c", PGY_PYTHON_CHART_SCRIPT], {
      windowsHide: !0,
      stdio: ["pipe", "pipe", "pipe"]
    }), l = (h) => {
      c || (c = !0, clearTimeout(p), h ? i(h) : s(o));
    }, p = setTimeout(() => {
      try {
        u.kill();
      } catch {
      }
      l(new Error(`Python chart timeout after ${n}ms`));
    }, n);
    u.on("error", (h) => l(h)), u.stdout.on("data", (h) => {
      o += h.toString("utf8");
    }), u.stderr.on("data", (h) => {
      r += h.toString("utf8");
    }), u.on("close", (h) => {
      h === 0 ? l(null) : l(new Error(`python exit ${h}: ${r.slice(0, 1200)}`));
    }), u.stdin.end(t);
  });
}
async function pgyRenderChartsWithPython(a) {
  if (!a.length) return {};
  const e = JSON.stringify({ charts: a }), t = Math.max(15e3, 5e3 + a.length * 4e3), n = [];
  for (const s of pgyChartRendererCandidates())
    try {
      j.info(`[pgy-chart] 调用内置绘图程序: ${s}, charts=${a.length}, timeout=${t}`);
      const i = await pgySpawnChartRenderer(s, e, t), o = JSON.parse(i.trim().split(/\r?\n/).pop() || "{}");
      if (o && o.ok)
        return o.errors && Object.keys(o.errors).length && j.warn(`[pgy-chart] 内置绘图程序部分图表生成失败: ${JSON.stringify(o.errors)}`), j.info(`[pgy-chart] 使用内置绘图程序: ${s}`), o.paths ?? {};
      n.push(`${s}: invalid response`);
    } catch (i) {
      n.push(`${s}: ${i instanceof Error ? i.message : String(i)}`);
    }
  for (const s of pgyPythonCandidates())
    try {
      const i = await pgySpawnPythonChart(s.cmd, s.args, e, t), o = JSON.parse(i.trim().split(/\r?\n/).pop() || "{}");
      if (o && o.ok)
        return o.errors && Object.keys(o.errors).length && j.warn(`[pgy-chart] Python 部分图表生成失败: ${JSON.stringify(o.errors)}`), o.paths ?? {};
      n.push(`${s.cmd}: invalid response`);
    } catch (i) {
      n.push(`${s.cmd}: ${i instanceof Error ? i.message : String(i)}`);
    }
  throw new Error(n.join("; "));
}
function pgyPct(a) {
  const e = Number(a);
  return Number.isFinite(e) ? e * 100 : 0;
}
function pgyTopPercentRows(a, e = 7) {
  return Array.isArray(a) ? a.map((t) => ({
    name: String(t.name ?? t.group ?? ""),
    value: pgyPct(t.percent)
  })).filter((t) => t.name && t.value > 0).sort((t, n) => n.value - t.value).slice(0, e) : [];
}
function pgyAgeSortValue(a) {
  const e = String(a ?? "").trim(), t = e.match(/\d+(?:\.\d+)?/);
  if (!t) return Number.MAX_SAFE_INTEGER;
  const n = Number(t[0]);
  return /[<≤]/.test(e) || /以下|以内/.test(e) ? n - 0.5 : n;
}
function pgyAgeRows(a) {
  return Array.isArray(a) ? a.map((t) => ({
    name: String(t.group ?? t.name ?? ""),
    value: pgyPct(t.percent)
  })).filter((t) => t.name && t.value > 0).sort((t, n) => pgyAgeSortValue(t.name) - pgyAgeSortValue(n.name)) : [];
}
function pgyBarChartSvg(a, e) {
  const t = 640, n = 520, s = 138, i = 34, o = 72, r = 44, c = Math.max(1, ...a.map((m) => m.value)), u = Math.max(34, (n - i - r) / Math.max(1, a.length)), l = t - s - o, p = a.map((m, f) => {
    const g = i + f * u + u * 0.24, v = Math.max(2, m.value / c * l), y = g + u * 0.24;
    return `<text x="${s - 12}" y="${y + 5}" text-anchor="end" font-size="18" fill="#1f2937">${pgyChartEscape(m.name)}</text><rect x="${s}" y="${g}" width="${v.toFixed(1)}" height="${Math.max(12, u * 0.36).toFixed(1)}" rx="4" fill="#2563eb"/><text x="${Math.min(t - 12, s + v + 10).toFixed(1)}" y="${y + 5}" font-size="16" fill="#334155">${m.value.toFixed(1)}%</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${n}" viewBox="0 0 ${t} ${n}"><rect width="100%" height="100%" fill="white"/><text x="${s}" y="24" font-size="20" font-weight="700" fill="#111827">${pgyChartEscape(e)}</text>${p}</svg>`;
}
function pgyGenderChartSvg(a) {
  const e = pgyPct(a == null ? void 0 : a.female), t = pgyPct(a == null ? void 0 : a.male), n = Math.max(0, e + t);
  if (!n) return "";
  const s = e / n, i = 260, o = 260, r = 132, l = (d) => {
    const h = (d - 90) * Math.PI / 180;
    return [i + r * Math.cos(h), o + r * Math.sin(h)];
  }, [p, h] = l(0), [m, f] = l(s * 360), g = s > 0.5 ? 1 : 0, v = `M ${i} ${o} L ${p} ${h} A ${r} ${r} 0 ${g} 1 ${m} ${f} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 520 520"><rect width="100%" height="100%" fill="white"/><path d="M ${i} ${o} m 0 -${r} a ${r} ${r} 0 1 1 0 ${r * 2} a ${r} ${r} 0 1 1 0 -${r * 2}" fill="#87cefa"/><path d="${v}" fill="#3b7ddd"/><circle cx="${i}" cy="${o}" r="76" fill="white"/><text x="260" y="254" text-anchor="middle" font-size="22" font-weight="700" fill="#111827">性别分布</text><text x="260" y="282" text-anchor="middle" font-size="18" fill="#64748b">女性 ${e.toFixed(2)}% / 男性 ${t.toFixed(2)}%</text><rect x="98" y="444" width="18" height="18" fill="#3b7ddd"/><text x="126" y="459" font-size="18" fill="#334155">女性 ${e.toFixed(2)}%</text><rect x="310" y="444" width="18" height="18" fill="#87cefa"/><text x="338" y="459" font-size="18" fill="#334155">男性 ${t.toFixed(2)}%</text></svg>`;
}
function pgyTrendChartSvg(a) {
  const e = Array.isArray(a) ? a.map((t) => ({
    date: String(t.dateKey ?? t.date ?? ""),
    num: Number(t.num ?? t.value ?? 0)
  })).filter((t) => t.date && Number.isFinite(t.num)) : [];
  if (e.length < 2) return "";
  const t = 760, n = 420, s = 70, i = 28, o = 44, r = 58, c = Math.min(...e.map((b) => b.num)), u = Math.max(...e.map((b) => b.num)), l = u === c ? 1 : u - c, p = (b) => s + b / (e.length - 1) * (t - s - i), h = (b) => n - r - (b - c) / l * (n - o - r), m = e.map((b, S) => `${p(S).toFixed(1)},${h(b.num).toFixed(1)}`).join(" "), f = Array.from({ length: 5 }, (_, b) => c + l * b / 4), g = f.map((b) => {
    const S = h(b);
    return `<line x1="${s}" y1="${S}" x2="${t - i}" y2="${S}" stroke="#e5e7eb" stroke-dasharray="4 4"/><text x="${s - 10}" y="${S + 5}" text-anchor="end" font-size="14" fill="#64748b">${b >= 1e4 ? (b / 1e4).toFixed(2) + "w" : Math.round(b)}</text>`;
  }).join(""), v = e.map((b, S) => S % 5 === 0 || S === e.length - 1 ? `<text x="${p(S)}" y="${n - 24}" text-anchor="middle" font-size="13" fill="#64748b">${pgyChartEscape(String(b.date).slice(4, 6) + "/" + String(b.date).slice(6, 8))}</text>` : "").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${n}" viewBox="0 0 ${t} ${n}"><rect width="100%" height="100%" fill="white"/><text x="${s}" y="26" font-size="20" font-weight="700" fill="#111827">粉丝增长趋势</text>${g}<polyline fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${m}"/>${v}</svg>`;
}
async function buildPgyBloggerChartFields(a, e, t, n) {
  const s = {}, i = [];
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.province)) {
    const o = pgyTopPercentRows(e.provinces);
    o.length && i.push({ field: "fansProvinceChart", type: "bar", title: "粉丝地域分布", rows: o, output: pgyChartFile("province", a, "province") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.city)) {
    const o = pgyTopPercentRows(e.cities);
    o.length && i.push({ field: "fansCityChart", type: "bar", title: "粉丝城市分布", rows: o, output: pgyChartFile("city", a, "city") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.age)) {
    const o = pgyAgeRows(e.ages);
    o.length && i.push({ field: "fansAgeChart", type: "bar", title: "粉丝年龄分布", rows: o, output: pgyChartFile("age", a, "age") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.gender)) {
    const o = e.gender ?? {};
    pgyPct(o.female) + pgyPct(o.male) > 0 && i.push({ field: "fansGenderChart", type: "gender", data: o, output: pgyChartFile("gender", a, "gender") });
  }
  if (pgyHasSelectedField(n, PYG_CHART_FIELDS.trend)) {
    const o = Array.isArray(t) ? t.slice(-120) : [];
    o.length >= 2 && i.push({ field: "fansGrowthTrendChart", type: "trend", rows: o, output: pgyChartFile("trend", a, "trend") });
  }
  if (!i.length) return s;
  try {
    const o = await pgyRenderChartsWithPython(i);
    j.info(`[pgy-chart] 内置绘图返回字段: ${Object.keys(o).join(",") || "(empty)"}`);
    for (const r of i)
      typeof o[r.field] == "string" && o[r.field] && (s[r.field] = o[r.field]);
  } catch (o) {
    j.warn(`[pgy-chart] Python 图表生成失败，使用 JS 兜底: ${o instanceof Error ? o.message : String(o)}`);
  }
  for (const o of i)
    if (!s[o.field]) {
      let r = "";
      o.type === "bar" ? r = pgyWriteBarChartPng(o.rows ?? [], o.output) : o.type === "gender" ? r = pgyWriteGenderChartPng(o.data ?? {}, o.output) : o.type === "trend" && (r = pgyWriteTrendChartPng(o.rows ?? [], o.output)), r && (s[o.field] = r);
    }
  if (Object.keys(s).length)
    j.info(`[pgy-chart] 已生成 ${Object.keys(s).length}/${i.length} 张粉丝图表`);
  else
    j.warn(`[pgy-chart] 未生成任何粉丝图表`);
  return s;
}
function pgyTimeout(a, e, t) {
  return Promise.race([
    a,
    new Promise((n, s) => setTimeout(() => s(new Error(`${t} timeout after ${e}ms`)), e))
  ]);
}

class wn extends Error {
  constructor(t, n) {
    super(n ?? `XHS cookie 失效: code=${t}`);
    w(this, "code");
    this.name = "XhsCookieExpiredError", this.code = t;
  }
}
class _n extends Error {
  constructor(t, n) {
    super(n ?? `XHS 风控: code=${t}`);
    w(this, "code");
    this.name = "XhsRiskError", this.code = t;
  }
}
class hm {
  /**
   * 触发蒲公英风控后，把窗口导到一个真实路由，让蒲公英注入滑块 modal，
   * 然后调上层 captcha handler 等待用户处理。
   *
   * @returns true 用户通过；false 超时或主动取消
   */
  async resolveXhsCaptcha(e, t, n, s) {
    if (e.isDestroyed()) return !1;
    j.warn(
      `[xhs-risk] 触发滑块风控，准备弹窗: reason=${s}, accountId=${t ?? "N/A"}`
    );
    try {
      await e.webContents.loadURL(cm);
    } catch (o) {
      j.warn("[xhs-risk] loadURL 触发滑块页失败（继续等待 captcha handler）:", o);
    }
    if (await new Promise((o) => setTimeout(o, 1500)), e.isDestroyed()) return !1;
    try {
      const o = await e.webContents.executeJavaScript(
        `!!document.querySelector('iframe[src*="captcha"], .reds-Modal[class*="verify"], #captcha-iframe, [class*="captcha"]')`
      );
      j.info(`[xhs-risk] modal 渲染检测: hasModal=${o === !0}`);
    } catch (o) {
      j.warn("[xhs-risk] modal 渲染检测失败（忽略）:", o);
    }
    const i = await n({
      window: e,
      platform: "PGY",
      accountId: t,
      reason: s,
      urlPatterns: ["captcha", "verify", "security-verification"],
      captchaSelectors: [
        'iframe[src*="captcha"]',
        '.reds-Modal[class*="verify"]',
        "#captcha-iframe",
        '[class*="captcha"]'
      ],
      timeoutMs: rm
    });
    return i.resolved ? j.info("[xhs-risk] 用户已通过滑块") : j.warn(
      `[xhs-risk] 滑块未通过: timedOut=${i.timedOut}, cancelled=${i.cancelled ?? !1}`
    ), i.resolved;
  }
  /**
   * 检查蒲公英 API 响应是否为风控/cookie 失效；命中即抛对应错误类。
   * 由顶层 catch 决定是「弹滑块重试」还是「直接 RISK + 提示重新授权」。
   */
  assertNotRiskCode(e, t) {
    if (qa.has(e))
      throw new wn(e, `code=${e} msg=${t ?? ""}`);
    if (om.has(e))
      throw new _n(e, `code=${e} msg=${t ?? ""}`);
  }
  /** 抓取笔记详情 */
  async scrapeNotebook(e, t, n, s, i, o, r) {
    let c = !1;
    for (; ; )
      try {
        let u = Ze.extractUrl(e);
        Ze.isShortLink(u) && (u = await gt.resolveRedirect(u));
        const l = Ze.extractNoteId(u);
        if (!l)
          return {
            status: "error",
            data: null,
            errorCode: "INVALID_TARGET_URL",
            errorDetails: {
              source: "pgy.extractNoteId",
              url: e,
              retryable: !1
            },
            errorMessage: `无效的笔记链接: ${e}`
          };
        const p = em(l), d = await this.fetchPgyApi(p, t, n, e, s);
        if (this.assertNotRiskCode(d.code, d.msg), d.code !== 0 || !d.data) {
          const g = Ci(d.code);
          return j.error(
            `[notebook] API 返回错误: errorCode=${g}, apiStatusCode=${d.code}, msg=${d.msg ?? ""}, noteId=${l}`
          ), {
            status: "error",
            data: null,
            errorCode: g,
            errorDetails: {
              source: "pgy.noteDetail",
              apiStatusCode: d.code,
              apiStatusMessage: d.msg,
              noteId: l,
              url: e,
              retryable: g !== "TARGET_NOT_FOUND"
            },
            errorMessage: `API 返回错误: code=${d.code}, msg=${d.msg}`
          };
        }
        const h = d.data, m = h.userInfo ?? {}, f = {
          userId: m.userId,
          nickname: m.nickName,
          title: h.title,
          content: h.content,
          fansNum: m.fansNum,
          clickMidNum: m.clickMidNum,
          mEngagementNum: m.mEngagementNum,
          picturePrice: m.picturePrice,
          videoPrice: m.videoPrice,
          noteId: h.noteId,
          noteLink: h.noteLink,
          impNum: h.impNum,
          readNum: h.readNum,
          likeNum: h.likeNum,
          favNum: h.favNum,
          cmtNum: h.cmtNum,
          shareNum: h.shareNum,
          followCnt: h.followCnt,
          createTime: h.createTime
        };
        return {
          status: "success",
          data: en(f, r)
        };
      } catch (u) {
        if (u instanceof wn)
          return j.warn(`[notebook] cookie 失效: code=${u.code}`), {
            status: "error",
            data: null,
            errorCode: "AUTH_EXPIRED",
            errorDetails: {
              source: "pgy.noteDetail",
              apiStatusCode: u.code,
              retryable: !0
            },
            errorMessage: `XHS cookie 失效 code: ${u.code}（请重新授权）`
          };
        if (u instanceof _n) {
          if (!c && i && s && !s.isDestroyed()) {
            if (c = !0, await this.resolveXhsCaptcha(
              s,
              o,
              i,
              `xhs-code-${u.code}`
            )) {
              j.info("[notebook] 滑块通过，重试");
              continue;
            }
            return {
              status: "error",
              data: null,
              errorCode: "CAPTCHA_UNRESOLVED",
              errorDetails: {
                source: "pgy.noteDetail",
                apiStatusCode: u.code,
                retryable: !0
              },
              errorMessage: `XHS 滑块未通过 code: ${u.code}`
            };
          }
          return {
            status: "error",
            data: null,
            errorCode: "RISK_CONTROL",
            errorDetails: {
              source: "pgy.noteDetail",
              apiStatusCode: u.code,
              retryable: !0
            },
            errorMessage: `XHS 风控（无 captcha 通道或重试后仍失败）code: ${u.code}`
          };
        }
        return j.error(`笔记采集失败: ${e}`, u), {
          status: "error",
          data: null,
          errorCode: "API_ERROR",
          errorDetails: {
            source: "pgy.noteDetail",
            retryable: !0
          },
          errorMessage: u instanceof Error ? u.message : String(u)
        };
      }
  }
  /** 抓取博主详情（并行调用 9 个 API） */
  async scrapeBlogger(e, t, n, s, i, o, r) {
    var u;
    let c = !1;
    for (; ; )
      try {
        j.info(`[blogger] ===== 开始采集 ===== url=${e}`);
        const l = await this.resolveBloggerTarget(e, s);
        if (!l)
          return j.warn(`[blogger] 无法识别蒲公英达人 ID: url=${e}`), {
            status: "error",
            data: null,
            errorCode: "INVALID_TARGET_URL",
            errorDetails: {
              source: "pgy.resolveBloggerTarget",
              url: e,
              retryable: !1
            },
            errorMessage: `无效的博主链接: ${e}`
          };
        const p = l.bloggerId, d = Si(p);
        s && !s.isDestroyed() && !Ri(s.webContents.getURL()) && await this.restorePgyPage(s, d), j.info(
          `[blogger] 解析完成: source=${l.source}, bloggerId=${p}, pgyUrl=${d}`
        );
        const h = Zd.filter(
          (b) => Se(r, mm[b])
        ).map((b) => {
          const S = Qd[b](p);
          return { key: b, apiUrl: S };
        });
        j.info(`[blogger] 准备调用 ${h.length} 个蒲公英接口`);
        const m = await Promise.allSettled(
          h.map(
            ({ key: b, apiUrl: S }) => pgyTimeout(this.fetchBloggerApi(S, t, n, d, s), b === "fansTrend" ? 1e4 : 35e3, `pgy.${b}`)
          )
        ), f = {};
        for (let b = 0; b < h.length; b++) {
          const S = m[b];
          if (S.status === "fulfilled") {
            if (f[h[b].key] = S.value, this.assertNotRiskCode(S.value.code, S.value.msg), S.value.code !== 0 || !S.value.data) {
              if (h[b].key === "fansTrend") {
                j.warn(
                  `[blogger] 粉丝趋势图接口无数据，跳过趋势图: code=${S.value.code}, msg=${S.value.msg ?? ""}, bloggerId=${p}`
                ), f[h[b].key] = null;
                continue;
              }
              const C = Ci(S.value.code);
              return j.error(
                `[blogger] API 返回错误: api=${h[b].key}, errorCode=${C}, apiStatusCode=${S.value.code}, msg=${S.value.msg ?? ""}, bloggerId=${p}`
              ), {
                status: "error",
                data: null,
                errorCode: C,
                errorDetails: {
                  source: `pgy.${h[b].key}`,
                  apiStatusCode: S.value.code,
                  apiStatusMessage: S.value.msg,
                  userId: p,
                  url: e,
                  retryable: C !== "TARGET_NOT_FOUND"
                },
                errorMessage: `API 返回错误: api=${h[b].key}, code=${S.value.code}, msg=${S.value.msg}`
              };
            }
          } else {
            const C = S.reason;
            if (C instanceof wn || C instanceof _n)
              throw C;
            if (h[b].key === "fansTrend") {
              j.warn(
                `[blogger] 粉丝趋势图接口超时或失败，跳过趋势图: message=${C instanceof Error ? C.message : String(C)}`
              ), f[h[b].key] = null;
              continue;
            }
            j.warn(
              `[blogger] 子接口失败但继续组装: api=${h[b].key}, message=${C instanceof Error ? C.message : String(C)}`
            ), f[h[b].key] = null;
          }
        }
        const v = (((u = f.profile) == null ? void 0 : u.data) ?? {}).headPhoto, y = await this.assembleBloggerData(p, f, v, r);
        return j.info(
          `[blogger] ===== 采集完成 ===== bloggerId=${p}, 字段数=${Object.keys(y).length}`
        ), {
          status: "success",
          data: en(y, r, dm)
        };
      } catch (l) {
        if (l instanceof wn)
          return j.warn(`[blogger] cookie 失效: code=${l.code}`), {
            status: "error",
            data: null,
            errorCode: "AUTH_EXPIRED",
            errorDetails: {
              source: "pgy.blogger",
              apiStatusCode: l.code,
              retryable: !0
            },
            errorMessage: `XHS cookie 失效 code: ${l.code}（请重新授权）`
          };
        if (l instanceof _n) {
          if (!c && i && s && !s.isDestroyed()) {
            if (c = !0, await this.resolveXhsCaptcha(
              s,
              o,
              i,
              `xhs-code-${l.code}`
            )) {
              j.info("[blogger] 滑块通过，重试");
              continue;
            }
            return {
              status: "error",
              data: null,
              errorCode: "CAPTCHA_UNRESOLVED",
              errorDetails: {
                source: "pgy.blogger",
                apiStatusCode: l.code,
                retryable: !0
              },
              errorMessage: `XHS 滑块未通过 code: ${l.code}`
            };
          }
          return {
            status: "error",
            data: null,
            errorCode: "RISK_CONTROL",
            errorDetails: {
              source: "pgy.blogger",
              apiStatusCode: l.code,
              retryable: !0
            },
            errorMessage: `XHS 风控（无 captcha 通道或重试后仍失败）code: ${l.code}`
          };
        }
        return j.error(`博主采集失败: ${e}`, l), {
          status: "error",
          data: null,
          errorCode: "API_ERROR",
          errorDetails: {
            source: "pgy.blogger",
            retryable: !0
          },
          errorMessage: l instanceof Error ? l.message : String(l)
        };
      }
  }
  async resolveBloggerTarget(e, t) {
    const n = Ze.extractUrl(e);
    if (!n) return null;
    const s = Ra(n);
    if (s) return { bloggerId: s, source: "pgy" };
    const i = Aa(n);
    if (i)
      return j.info(`[blogger] 识别小红书主页链接，首次用 userId 转蒲公英链接: userId=${i}`), { bloggerId: i, source: "xhs" };
    if (Ze.isShortLink(n))
      try {
        j.info(`[blogger] 识别小红书短链，开始解析重定向: ${n}`);
        const o = await gt.resolveRedirect(n), r = Aa(o) ?? Ra(o);
        if (j.info(
          `[blogger] 小红书短链解析完成: redirected=${o}, userId=${r ?? "(无)"}`
        ), r) return { bloggerId: r, source: "xhs-short" };
      } catch (o) {
        j.warn(
          `[blogger] 小红书短链解析失败: ${o instanceof Error ? o.message : String(o)}`
        );
      }
    if (t && !t.isDestroyed() && fm(n)) {
      j.info(`[blogger] 访问小红书页面尝试解析达人 ID: ${n}`);
      const o = await this.loadUrlAndGetFinalUrl(t, n, 15e3), r = o ? Aa(o) ?? Ra(o) : null;
      if (j.info(
        `[blogger] 小红书页面解析完成: final=${o ?? "(空)"}, userId=${r ?? "(无)"}`
      ), r) return { bloggerId: r, source: "xhs-page" };
    }
    return null;
  }
  async restorePgyPage(e, t) {
    const n = e.webContents.getURL();
    Ri(n) || (j.info(`[blogger] 恢复蒲公英页面上下文: ${t}`), await this.loadUrlAndGetFinalUrl(e, t, 1e4));
  }
  loadUrlAndGetFinalUrl(e, t, n) {
    return new Promise((s) => {
      if (e.isDestroyed()) {
        s(null);
        return;
      }
      let i = !1;
      const o = () => {
        i || (i = !0, clearTimeout(u), e.webContents.removeListener("did-finish-load", r), e.webContents.removeListener("did-fail-load", c), s(e.isDestroyed() ? null : e.webContents.getURL()));
      }, r = () => o(), c = () => o(), u = setTimeout(o, n);
      e.webContents.once("did-finish-load", r), e.webContents.once("did-fail-load", c), e.loadURL(t).catch((l) => {
        j.warn(`[blogger] 页面访问失败: ${l instanceof Error ? l.message : String(l)}`), o();
      });
    });
  }
  async fetchBloggerApi(e, t, n, s, i) {
    return this.fetchPgyApi(e, t, n, s, i);
  }
  async fetchPgyApi(e, t, n, s, i) {
    const o = e.replace(Re, ""), r = sm.encryptSign(o);
    if (o.includes("/fans_overall_new_history")) {
      return j.info(`[pgy-fetch] 粉丝趋势接口使用主进程请求，避免页面渲染线程卡顿: url=${o}`), await gt.requestJson({
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
    if (i && !i.isDestroyed()) {
      const c = await this.fetchPgyApiInPage(i, e, s, r);
      if (c) {
        if (qa.has(c.code)) {
          const u = await this.describeSessionCookies(t);
          j.warn(
            `[pgy-fetch] 窗口 fetch 返回登录失效: pageCode=${c.code}, cookieCount=${u.count}, cookieNames=${u.names.join("|")}, url=${o}`
          );
        }
        return c;
      }
      j.warn(`[pgy-fetch] 窗口 fetch 不可用，降级 net.request: url=${o}`);
    }
    return await gt.requestJson({
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
  async fetchPgyApiInPage(e, t, n, s) {
    try {
      const i = `
        (async () => {
          const response = await fetch(${JSON.stringify(t)}, {
            method: 'GET',
            credentials: 'include',
            referrer: ${JSON.stringify(n)},
            signal: AbortSignal.timeout(12000),
            headers: {
              'X-s': ${JSON.stringify(s["X-s"])},
              'X-t': ${JSON.stringify(String(s["X-t"]))}
            }
          });
          return {
            httpStatusCode: response.status,
            text: await response.text()
          };
        })()
      `, o = await pgyTimeout(e.webContents.executeJavaScript(i, !0), 15e3, "pgy.windowFetch");
      if (!um(o))
        return j.warn("[pgy-fetch] 窗口 fetch 返回结构异常"), null;
      const r = JSON.parse(o.text);
      return pm(r) ? r : (j.warn(`[pgy-fetch] 窗口 fetch JSON 结构异常: httpStatusCode=${o.httpStatusCode}`), null);
    } catch (i) {
      return j.warn("[pgy-fetch] 窗口 fetch 复核失败:", i), null;
    }
  }
  async describeSessionCookies(e) {
    try {
      const t = await e.cookies.get({ url: Re });
      return {
        count: t.length,
        names: t.slice(0, 8).map((n) => n.name)
      };
    } catch {
      return { count: -1, names: [] };
    }
  }
  /** 组装博主完整数据 */
  async assembleBloggerData(e, t, n, I) {
    var O, le, de, H, N, q, M, A, R, $, ae, X, fe, De;
    const s = ((O = t.profile) == null ? void 0 : O.data) ?? {}, i = ((le = t.effective) == null ? void 0 : le.data) ?? {}, o = ((de = t.daily30) == null ? void 0 : de.data) ?? {}, r = ((H = t.daily90) == null ? void 0 : H.data) ?? {}, c = ((N = t.business30) == null ? void 0 : N.data) ?? {}, u = ((q = t.business90) == null ? void 0 : q.data) ?? {}, l = ((M = t.fansSummary) == null ? void 0 : M.data) ?? {}, p = ((A = t.fansProfile) == null ? void 0 : A.data) ?? {}, h = (((R = t.noteList10) == null ? void 0 : R.data) ?? {}).list ?? [];
    let m = 0, f = 0, g = 0, v = 0;
    for (const Q of h)
      Q.isVideo && m++, f += Q.collectNum ?? 0, g += Q.likeNum ?? 0, v += Q.readNum ?? 0;
    const y = h.length || 1, b = p.ages ?? [];
    let S = 0, C = {};
    for (const Q of b)
      Q.percent > S && (S = Q.percent, C = Q);
    const _ = p.gender ?? {}, k = p.provinces ?? [], P = p.cities ?? [], T = p.interests ?? [], L = p.devices ?? [], z = s.liveSign, G = s.noteSign, Q = await buildPgyBloggerChartFields(e, p, (((t.fansTrend == null ? void 0 : t.fansTrend.data) ?? {}).list) ?? [], I);
    return {
      platformBloggerId: e,
      nickname: s.name,
      avatar: n,
      // 直接使用第三方头像 URL
      url: `https://www.xiaohongshu.com/user/profile/${e}`,
      pgyUrl: Si(e),
      redId: s.redId,
      currentLevel: s.currentLevel,
      liveSign: (z == null ? void 0 : z.name) ?? (G == null ? void 0 : G.name) ?? "无机构",
      fansCount: s.fansCount,
      likeCollectCountInfo: s.likeCollectCountInfo,
      avg10VideoRatio: (m / y * 100).toFixed(2) + "%",
      avg10ReadNum: Math.round(v / y),
      avg10LikeNum: Math.round(g / y),
      avg10CollectNum: Math.round(f / y),
      personalTags: Array.isArray(s.personalTags) ? s.personalTags.join("、") : "",
      featureTags: Array.isArray(s.featureTags) ? s.featureTags.join("、") : "",
      gender: s.gender ?? "未知",
      location: s.location ?? "未知",
      picturePrice: s.picturePrice,
      videoPrice: s.videoPrice,
      pictureReadCost: Ke(i.picReadCost),
      videoReadCost: Ke(i.videoReadCostV2),
      estimatePictureEngageCost: Ke(
        i.estimatePictureEngageCost
      ),
      estimateVideoEngageCost: Ke(
        i.estimateVideoEngageCost
      ),
      estimatePictureCpm: Ke(i.estimatePictureCpm),
      estimateVideoCpm: Ke(i.estimateVideoCpm),
      estimatePictureCpuv: Ke(i.estimatePictureCpuv),
      estimateVideoCpuv: Ke(i.estimateVideoCpuv),
      // 日常30天
      noteNumber30: o.noteNumber,
      thousandLikePercent30: o.thousandLikePercent + "%",
      hundredLikePercent30: o.hundredLikePercent + "%",
      readMedian30: o.readMedian,
      interactionRate30: o.interactionRate + "%",
      videoFullViewRate30: o.videoFullViewRate + "%",
      picture3sViewRate30: o.picture3sViewRate + "%",
      mEngagementNum30: o.mEngagementNum,
      impMedian30: o.impMedian || "无",
      likeMedian: o.likeMedian || "无",
      collectMedian: o.collectMedian || "无",
      commentMedian: o.commentMedian || "无",
      shareMedian: o.shareMedian || "无",
      // 日常90天
      noteNumber90: r.noteNumber,
      thousandLikePercent90: r.thousandLikePercent + "%",
      hundredLikePercent90: r.hundredLikePercent + "%",
      readMedian90: r.readMedian,
      interactionRate90: r.interactionRate + "%",
      videoFullViewRate90: r.videoFullViewRate + "%",
      picture3sViewRate90: r.picture3sViewRate + "%",
      mEngagementNum90: r.mEngagementNum,
      impMedian90: r.impMedian,
      // 合作30天
      noteNumberBusiness30: c.noteNumber,
      thousandLikePercentBusiness30: c.thousandLikePercent + "%",
      hundredLikePercentBusiness30: c.hundredLikePercent + "%",
      readMedianBusiness30: c.readMedian,
      interactionRateBusiness30: c.interactionRate + "%",
      videoFullViewRateBusiness30: c.videoFullViewRate + "%",
      picture3sViewRateBusiness30: c.picture3sViewRate + "%",
      mEngagementNumBusiness30: c.mEngagementNum,
      impMedianBusiness30: c.impMedian,
      // 合作90天
      noteNumberBusiness90: u.noteNumber,
      thousandLikePercentBusiness90: u.thousandLikePercent + "%",
      hundredLikePercentBusiness90: u.hundredLikePercent + "%",
      readMedianBusiness90: u.readMedian,
      interactionRateBusiness90: u.interactionRate + "%",
      videoFullViewRateBusiness90: u.videoFullViewRate + "%",
      picture3sViewRateBusiness90: u.picture3sViewRate + "%",
      mEngagementNumBusiness90: u.mEngagementNum,
      impMedianBusiness90: u.impMedian,
      // 粉丝核心数据
      activeFansRate: l.activeFansRate + "%",
      fansIncreaseNum: l.fansIncreaseNum,
      fansGrowthRate: l.fansGrowthRate + "%",
      engageFansRate: l.engageFansRate + "%",
      fansFemale: ((_.female ?? 0) * 100).toFixed(1) + "%",
      fansMale: ((_.male ?? 0) * 100).toFixed(1) + "%",
      fansAges0: Vt(($ = b[0]) == null ? void 0 : $.percent),
      fansAges1: Vt((ae = b[1]) == null ? void 0 : ae.percent),
      fansAges2: Vt((X = b[2]) == null ? void 0 : X.percent),
      fansAges3: Vt((fe = b[3]) == null ? void 0 : fe.percent),
      fansAges4: Vt((De = b[4]) == null ? void 0 : De.percent),
      maxFansAges: C.group ? `${C.group}占比最多，占比：${(C.percent * 100).toFixed(2)}%` : "无数据",
      fansRegions: Sn(k),
      fansCities: Sn(P),
      fansInterests: Sn(T),
      fansDevices: Sn(L),
      ...Q
    };
  }
}
function Ke(a) {
  return a == null ? "无" : a.toFixed(2);
}
function Vt(a) {
  return a == null ? "0.00%" : (a * 100).toFixed(2) + "%";
}
function Sn(a) {
  return !a || a.length === 0 ? "无数据" : a.map((e) => `${e.name}: ${((e.percent ?? 0) * 100).toFixed(2)}%`).join(" / ");
}
class gm {
  constructor() {
    w(this, "id", "pgy");
    w(this, "name", "蒲公英");
    w(this, "platforms", ["PGY"]);
    w(this, "defaultTaskType", "blogger");
    w(this, "baseUrl", "https://pgy.xiaohongshu.com");
    /**
     * XHS 风控兜底。code:461 = 滑块；code:401 = cookie 失效（不弹滑块，直接 RISK）。
     *
     * 插件内部已识别这两类错误，这里是 dispatcher 兜底，
     * 字符串 `code: 461` / `code: 401` 已写进 errorMessage（assertNotRiskCode 抛错时携带）。
     *
     * 注意 cookie 失效不应让 broker 弹滑块，所以不写 code:401 到 riskCodes。
     */
    w(this, "riskCodes", [
      {
        pattern: /\bcode:?\s*461\b/i,
        reason: "xhs-code-461",
        timeoutMs: 12e4
      }
    ]);
    w(this, "authService");
    w(this, "scraperService");
    w(this, "windowManager");
    this.windowManager = new _t(), this.authService = new am(this.windowManager), this.scraperService = new hm();
  }
  async checkAuth() {
    if (readLocalPgyCookieHeader())
      return {
        authorized: !0,
        userInfo: {
          source: "local-cookie"
        }
      };
    return this.authService.checkAuth();
  }
  async startAuth(e) {
    return this.authService.startAuth(e);
  }
  async scrapeItem(e, t, n) {
    const i = { ...n.accountId ? {} : { ...this.authService.getRequestHeaders(), ...getLocalPgyRequestHeaders() }, ...n.requestHeaders };
    switch (this.normalizeTaskType(t)) {
      case "blogger":
        return this.scraperService.scrapeBlogger(
          e,
          n.session,
          i,
          n.window,
          n.requestCaptcha,
          n.accountId,
          n.fields
        );
      case "notebook":
        return this.scraperService.scrapeNotebook(
          e,
          n.session,
          i,
          n.window,
          n.requestCaptcha,
          n.accountId,
          n.fields
        );
      default:
        return {
          status: "error",
          data: null,
          errorCode: "UNSUPPORTED_TASK_TYPE",
          errorDetails: {
            source: "pgy.scrapeItem",
            retryable: !1
          },
          errorMessage: `不支持的任务类型: ${t}`
        };
    }
  }
  normalizeTaskType(e) {
    return e === "default" ? this.defaultTaskType : e;
  }
  getTaskTypes() {
    return [
      {
        id: "blogger",
        label: "博主主页",
        templateFileName: "xhs_blogger_template.xlsx",
        templateDownloadName: "蒲公英博主主页链接模版.xlsx"
      },
      {
        id: "notebook",
        label: "笔记详情",
        templateFileName: "xhs_notebook_template.xlsx",
        templateDownloadName: "蒲公英笔记链接模版.xlsx"
      }
    ];
  }
  dispose() {
    this.authService.dispose(), this.windowManager.closeAll();
  }
}
const nt = "https://www.xingtu.cn", xm = "https://www.douyin.com", ke = `${nt}/gw/api`, vm = `${ke}/gsearch/search_for_author_square`, ym = (a) => `${nt}/ad/creator/author-homepage/douyin-video/${a}`, Ce = {
  /** 1. 博主基础信息（昵称/粉丝/性别/地区/机构/分类） */
  baseInfo: `${ke}/author/get_author_base_info`,
  /** 2. 博主统计信息（获赞数等） */
  statInfo: `${ke}/author/get_author_stat_info`,
  /** 3. 博主服务报价 */
  marketingInfo: `${ke}/author/get_author_marketing_info`,
  /** 4. 商业能力指数（星图/传播/种草/转化/性价比/合作） */
  authorScore: `${ke}/author/author_score_v2`,
  /** 5/6. 传播表现（type=1个人, type=2星图; range=2表示30日） */
  spreadInfo: `${ke}/data_sp/get_author_spread_info`,
  /** 7. 最新15个视频（个人+星图） */
  showItems: `${ke}/author/get_author_show_items_v2`,
  /** 8. 内容类型分析 */
  videoDistribution: `${ke}/data_sp/author_video_distribution`,
  /** 9. 连接用户分布 */
  linkStruct: `${ke}/data_sp/author_link_struct`,
  /** 12. 转化能力分析 */
  convertAbility: `${ke}/data_sp/get_author_convert_ability`,
  /** 13. 电商详情 */
  ecomDetail: `${ke}/data_sp/get_author_ecom_detail`,
  /** 14. 预期CPE/CPM */
  cpInfo: `${ke}/data_sp/author_cp_info`,
  /** 15. 粉丝画像 */
  fansDistribution: `${ke}/data_sp/get_author_fans_distribution`,
  /** 16. 视频列表（含发布总数） */
  homepageVideos: `${ke}/aggregator/get_author_homepage_videos`
};
function bm(a) {
  return JSON.stringify({
    scene_param: {
      platform_source: 1,
      search_scene: 1,
      display_scene: 1,
      task_category: 1,
      marketing_target: 1,
      first_industry_id: 0
    },
    page_param: {
      page: "1",
      limit: "20"
    },
    sort_param: {
      sort_field: { field_name: "score" },
      sort_type: 2
    },
    attribute_filter: [
      {
        field: { field_name: "price_by_video_type__ge", rel_id: "2" },
        field_value: "0"
      }
    ],
    search_param: {
      seach_type: 2,
      keyword: a,
      is_new_nickname_query: !0
    }
  });
}
const se = Y("StarmapAuth"), wm = 1e4, _m = 8e3;
class Sm {
  constructor(e, t) {
    w(this, "windowManager");
    w(this, "partition");
    /** 正在进行中的检查 Promise（去重用） */
    w(this, "pendingCheck", null);
    /** 正在进行中的登录 Promise（去重用） */
    w(this, "pendingLogin", null);
    /** 检查模式超时定时器（用于在 startAuth 时取消） */
    w(this, "checkTimer", null);
    this.windowManager = e, this.partition = t, se.info(`[StarmapAuth] 初始化, partition=${t ?? "(默认)"}`);
  }
  /** 获取请求头（采集时 session 自带 cookie，此处返回空即可） */
  getRequestHeaders() {
    return {};
  }
  /** 检查授权状态，开发环境显示窗口方便调试，生产环境隐藏窗口 */
  checkAuth() {
    if (this.pendingCheck)
      return se.info("[checkAuth] 已有进行中的检测，复用"), this.pendingCheck;
    const e = !ye.isPackaged;
    return this.pendingCheck = this.performAuth(e, !0).finally(() => {
      this.pendingCheck = null;
    }), this.pendingCheck;
  }
  /** 发起授权流程（显示窗口让用户登录），重复调用会复用同一个 Promise */
  startAuth(e) {
    if (this.pendingLogin)
      return se.info("[startAuth] 已有进行中的授权，复用"), this.pendingLogin;
    this.checkTimer && (clearTimeout(this.checkTimer), this.checkTimer = null, se.info("[startAuth] 已取消 checkAuth 超时定时器"));
    const t = e == null ? void 0 : e.fingerprintProfile;
    return this.pendingLogin = this.performAuth(!0, !1, t, e == null ? void 0 : e.sessionPartition).finally(
      () => {
        this.pendingLogin = null;
      }
    ), this.pendingLogin;
  }
  performAuth(e, t, n, s) {
    const i = s ?? this.partition, o = t ? `检查模式(${e ? "可见" : "隐藏"}窗口)` : "登录模式(可见窗口)";
    return se.info(`[performAuth] 开始授权: ${o}, hasFingerprint=${!!n}`), new Promise((r) => {
      let c = !1;
      const u = (p) => {
        c || (c = !0, r(
          n || i ? {
            ...p,
            fingerprintProfile: n ?? null,
            sessionPartition: i ?? null
          } : p
        ));
      }, l = this.windowManager.createWindow("starmap-auth", {
        url: nt,
        show: e,
        width: 1e3,
        height: 600,
        partition: i,
        fingerprintProfile: n
      });
      se.info(
        `[performAuth] 窗口已创建, 加载URL: ${nt}, partition=${i ?? "(默认)"}`
      ), t && (this.checkTimer = setTimeout(() => {
        this.checkTimer = null, c || (se.info("[performAuth] 检查超时，视为未授权"), u({ authorized: !1 }), this.windowManager.closeWindow("starmap-auth"));
      }, wm)), l.on("closed", () => {
        c || (se.info(`[performAuth] 窗口被关闭, 授权未完成 (cancelled=${!t})`), u({ authorized: !1, cancelled: !t }));
      }), l.webContents.on("did-finish-load", () => {
        const p = l.webContents.getURL();
        se.info(`页面加载完成: ${p}`), this.tryAuthCheck(l, t, u, () => c);
      }), l.webContents.on("did-navigate-in-page", (p, d) => {
        se.info(`SPA 导航: ${d}`), this.tryAuthCheck(l, t, u, () => c);
      }), l.webContents.on("did-fail-load", (p, d, h) => {
        se.error(`页面加载失败: code=${d}, desc=${h}`), t && (u({ authorized: !1 }), this.windowManager.closeWindow("starmap-auth"));
      });
    });
  }
  /**
   * 在页面上下文中调用 demander/info API 检测授权
   * 使用 executeJavaScript + fetch，自带页面 cookie，无需拦截器
   *
   * @param isResolved 闭包内 resolved 标志的 getter — 必须由调用方提供，
   *                   不能用 this.resolved（两次并发 performAuth 会串）
   */
  async tryAuthCheck(e, t, n, s) {
    var i, o, r;
    if (!(s() || e.isDestroyed()) && (await new Promise((c) => setTimeout(c, 1e3)), !(s() || e.isDestroyed())))
      try {
        se.info("通过 executeJavaScript 调用 demander/info...");
        const c = await Promise.race([
          e.webContents.executeJavaScript(`
          fetch('/u/api/demander/info', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          }).then(function(r) { return r.text(); }).catch(function() { return null; })
        `),
          new Promise((l) => setTimeout(() => l(null), _m))
        ]);
        if (!c) {
          se.info("demander/info 请求超时或无响应"), t && (se.info("检查模式: 请求无响应，结束检测"), n({ authorized: !1 }), this.windowManager.closeWindow("starmap-auth"));
          return;
        }
        const u = JSON.parse(c);
        se.info(`demander/info 响应: code=${u.code}, user=${((o = (i = u.data) == null ? void 0 : i.user) == null ? void 0 : o.nick_name) ?? "null"}`), u.code === 0 && ((r = u.data) != null && r.user) ? (se.info(`授权成功: ${u.data.user.nick_name}`), await this.persistSessionCookies(e), n({ authorized: !0, userInfo: u.data }), this.windowManager.closeWindow("starmap-auth")) : t && (se.info("检查模式: 未授权，结束检测"), n({ authorized: !1 }), this.windowManager.closeWindow("starmap-auth"));
      } catch (c) {
        se.error("授权检测失败:", c), t && (se.info("检查模式: 检测异常，结束检测"), n({ authorized: !1 }), this.windowManager.closeWindow("starmap-auth"));
      }
  }
  /**
   * 将 session cookie（无过期时间）转为持久化 cookie。
   *
   * Electron 的 persist: 分区只持久化有 Expires/Max-Age 的 cookie。
   * 没有过期时间的 session cookie 在最后一个使用该分区的窗口关闭时就被清除，
   * 而普通浏览器会在整个浏览器关闭前一直保留。
   * 这里在授权成功后手动给 session cookie 设置 30 天过期时间，
   * 确保关闭窗口或重启应用后登录态仍然有效。
   */
  async persistSessionCookies(e) {
    var t;
    try {
      const n = e.webContents.session, s = await n.cookies.get({ domain: "xingtu.cn" }), i = s.filter((r) => !r.expirationDate);
      if (se.info(
        `[persistCookies] 共 ${s.length} 个 cookie, 其中 ${i.length} 个为 session cookie`
      ), i.length === 0) {
        se.info("[persistCookies] 无需持久化");
        return;
      }
      const o = Math.floor(Date.now() / 1e3) + 86400 * 30;
      for (const r of i) {
        const u = `https://${((t = r.domain) == null ? void 0 : t.replace(/^\./, "")) || "www.xingtu.cn"}${r.path || "/"}`;
        await n.cookies.set({
          url: u,
          name: r.name,
          value: r.value,
          domain: r.domain,
          path: r.path,
          secure: r.secure,
          httpOnly: r.httpOnly,
          sameSite: r.sameSite,
          expirationDate: o
        });
      }
      await n.cookies.flushStore(), se.info(`[persistCookies] 已将 ${i.length} 个 session cookie 设为 30 天过期`);
    } catch (n) {
      se.error("[persistCookies] 持久化 cookie 失败:", n);
    }
  }
  /** 销毁资源 */
  dispose() {
    this.windowManager.closeWindow("starmap-auth");
  }
}
const he = Y("StarmapUrl"), Cm = "https://www.iesdouyin.com/web/api/v2/user/info/";
class Ha {
  /** 从输入文本中提取星图达人主页 ID */
  static extractStarmapAuthorInfo(e) {
    try {
      const t = Ze.extractUrl(e);
      if (!t) return null;
      const n = this.extractStarmapStarIdFromUrl(t);
      return n ? { starId: n, starmapUrl: t } : null;
    } catch (t) {
      return he.error("[extractStarmapAuthorInfo] 异常", t), null;
    }
  }
  /**
   * 从输入文本中提取抖音用户信息
   * 完整链路：输入 → URL → secUid → iesdouyin API → 抖音号(unique_id)
   */
  static async extractDouyinUserInfo(e) {
    he.info(
      `[extractDouyinUserInfo] 开始解析输入: ${e.substring(0, 120)}${e.length > 120 ? "..." : ""}`
    );
    try {
      const t = await this.extractDouyinSecUid(e);
      if (!t)
        return he.error(`[extractDouyinUserInfo] 无法提取secUid, input=${e.substring(0, 80)}`), null;
      he.info(`[extractDouyinUserInfo] secUid=${t}`);
      const n = await this.fetchDouyinNumber(t);
      return n ? (he.info(`[extractDouyinUserInfo] 解析完成: douyinNumber=${n}, secUid=${t}`), {
        douyinNumber: n,
        secUid: t,
        douyinUrl: `${xm}/user/${t}`
      }) : (he.error(`[extractDouyinUserInfo] 无法获取抖音号, secUid=${t}`), null);
    } catch (t) {
      return he.error(`[extractDouyinUserInfo] 异常: ${e.substring(0, 80)}`, t), null;
    }
  }
  /** 从输入文本中提取抖音用户 secUid */
  static async extractDouyinSecUid(e) {
    try {
      let t = Ze.extractUrl(e);
      if (he.info(`[extractSecUid] 提取到URL: ${t ?? "(空)"}`), !t)
        return he.error("[extractSecUid] 输入中未找到有效URL"), null;
      this.isDouyinShortLink(t) && (he.info(`[extractSecUid] 检测到短链接, 开始解析重定向: ${t}`), t = await gt.resolveRedirect(t), he.info(`[extractSecUid] 重定向结果: ${t}`));
      const n = this.extractSecUidFromUrl(t);
      return he.info(`[extractSecUid] 从URL提取secUid: ${n ?? "(失败)"}`), n;
    } catch (t) {
      return he.error("[extractSecUid] 异常", t), null;
    }
  }
  /** 判断是否为抖音短链接 */
  static isDouyinShortLink(e) {
    return e.includes("v.douyin.com");
  }
  /**
   * 从抖音长链接中提取 secUid
   * 格式: https://www.douyin.com/user/MS4wLjABAAAA...
   *
   * 优先从查询参数 sec_uid 提取（iesdouyin 重定向 URL 路径中可能是数字 UID 而非 secUid），
   * 其次从 /user/ 路径段提取。
   */
  static extractSecUidFromUrl(e) {
    const t = e.match(/sec_uid=([A-Za-z0-9_-]+)/);
    if (t != null && t[1])
      return t[1];
    const n = e.match(/\/user\/([A-Za-z0-9_-]+)/);
    return n != null && n[1] ? n[1] : null;
  }
  /**
   * 从星图达人主页中提取 star_id。
   * 格式: https://www.xingtu.cn/ad/creator/author-homepage/douyin-video/7017391538292391944
   */
  static extractStarmapStarIdFromUrl(e) {
    const t = e.match(
      /xingtu\.cn\/ad\/creator\/author-homepage\/[^/?#]+\/(\d{8,30})(?:[/?#]|$)/i
    );
    return (t == null ? void 0 : t[1]) ?? null;
  }
  /**
   * 通过 secUid 调用 iesdouyin API 获取抖音号（unique_id）
   *
   * iesdouyin API 无需登录，返回用户基础信息，
   * 其中 unique_id 就是用户自定义的抖音号，可用于星图搜索。
   */
  static async fetchDouyinNumber(e) {
    try {
      const t = `${Cm}?sec_uid=${e}`;
      he.info(`查询抖音号: secUid=${e}`);
      const s = (await gt.requestJson({
        url: t,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/json"
        },
        timeout: 15e3
      })).user_info;
      if (!s)
        return he.error(`iesdouyin API 未返回用户信息, secUid: ${e}`), null;
      const i = s.unique_id || s.short_id || "";
      return i ? (he.info(`获取到抖音号: ${i} (nickname: ${s.nickname ?? ""})`), i) : (he.error(`未找到抖音号, secUid: ${e}`), null);
    } catch (t) {
      return he.error(`查询抖音号失败: ${e}`, t), null;
    }
  }
}
const D = Y("StarmapScraper");
class Rt extends Error {
  constructor(t, n, s) {
    super(s ?? `字节风控触发: code=${t} source=${n}`);
    w(this, "code");
    w(this, "source");
    this.name = "BytedanceRiskError", this.code = t, this.source = n;
  }
}
const Ai = /* @__PURE__ */ new Set([2155, 2154, 9999, 4444006]), Ei = ".secsdk-captcha-drag-wrapper, #captcha_container, .captcha_verify_img", Rm = 18e4, Am = "https://www.xingtu.cn/admin/main/dashboard", Ue = {
  SHORT_1_20: 1,
  SHORT_20_60: 2,
  SHORT_60_PLUS: 71,
  NATURAL_CPM: 92,
  COLLECTION: 73,
  CO_CREATION: 91,
  IMAGE_TEXT: 130,
  SINGLE_VIDEO_AD: 103,
  MULTI_VIDEO_AD: 104,
  DOWNLOAD: 105
}, Em = {
  nickname: ["昵称"],
  avatar: ["头像"],
  url: ["主页链接", "星图链接"],
  fansCount: ["粉丝数"],
  interactRate: ["个人视频传播_互动率", "星图视频传播_互动率"],
  location: ["地区", "IP归属地"],
  gender: ["性别"],
  category: ["博主分类"],
  tags: ["描述", "博主分类"],
  priceJson: [
    "1-20s视频",
    "21-60s视频",
    "60s以上视频",
    "千次自然播放单价",
    "千次自然播放总价下限",
    "千次自然播放总价上限",
    "抖音短视频合集任务",
    "抖音短视频共创-参与博主",
    "抖音图文",
    "单视频推送广告平台",
    "多视频推送广告平台",
    "下载",
    "预期cpe_1-20s",
    "预期cpe_20-60s",
    "预期cpe_60s以上",
    "预期cpm_1-20s",
    "预期cpm_20-60s",
    "预期cpm_60s以上"
  ]
}, km = [
  "主页链接",
  "星图链接",
  "星图ID",
  "昵称",
  "头像",
  "抖音号",
  "粉丝数",
  "获赞数",
  "所属机构",
  "年龄",
  "发布视频数",
  "描述",
  "性别",
  "地区",
  "IP归属地",
  "博主分类",
  "nickname",
  "avatar",
  "url",
  "fansCount",
  "location",
  "gender",
  "category",
  "tags"
], Tm = [
  "1-20s视频",
  "21-60s视频",
  "60s以上视频",
  "千次自然播放单价",
  "千次自然播放总价下限",
  "千次自然播放总价上限",
  "抖音短视频合集任务",
  "抖音短视频共创-参与博主",
  "抖音图文",
  "单视频推送广告平台",
  "多视频推送广告平台",
  "下载",
  "priceJson"
], Im = [
  "星图指数",
  "传播指数",
  "传播指数行业中位数",
  "种草指数",
  "种草指数行业中位数",
  "转化指数",
  "转化指数行业中位数",
  "性价比指数",
  "性价比指数行业中位数",
  "合作指数",
  "合作指数行业中位数"
], Pm = [
  "个人视频传播_完播率",
  "个人视频传播_互动率",
  "个人视频传播_播放量中位数",
  "个人视频传播_发布作品数",
  "个人视频传播_平均时长",
  "个人视频传播_平均点赞",
  "个人视频传播_平均评论",
  "个人视频传播_平均转发",
  "interactRate"
], $m = [
  "星图视频传播_完播率",
  "星图视频传播_互动率",
  "星图视频传播_播放量中位数",
  "星图视频传播_发布作品数",
  "星图视频传播_平均时长",
  "星图视频传播_平均点赞",
  "星图视频传播_平均评论",
  "星图视频传播_平均转发",
  "interactRate"
], Dm = [
  "个人视频15个_最低播放量",
  "个人视频15个_最高播放量",
  "个人视频15个_爆量视频百分比",
  "个人视频15个_播放量均值",
  "个人视频15个_最低点赞量",
  "个人视频15个_最高点赞量",
  "个人视频15个_点赞量均值",
  "个人视频15个_最低评论量",
  "个人视频15个_最高评论量",
  "个人视频15个_评论量均值",
  "个人视频15个_最低转发量",
  "个人视频15个_最高转发量",
  "个人视频15个_转发量均值"
], Lm = [
  "星图视频15个_最低播放量",
  "星图视频15个_最高播放量",
  "星图视频15个_爆量视频百分比",
  "星图视频15个_播放量均值",
  "星图视频15个_最低点赞量",
  "星图视频15个_最高点赞量",
  "星图视频15个_点赞量均值",
  "星图视频15个_最低评论量",
  "星图视频15个_最高评论量",
  "星图视频15个_评论量均值",
  "星图视频15个_最低转发量",
  "星图视频15个_最高转发量",
  "星图视频15个_转发量均值"
], Nm = [
  "月连接用户数",
  "月深度用户数",
  "了解",
  "兴趣",
  "喜欢",
  "追随"
], Om = [
  "相关视频数",
  "播放中位数",
  "组件点击量",
  "组件点击率",
  "相关CPC",
  "带货商品数",
  "平均销售额区间",
  "带货商品价格",
  "GPM"
], Mm = [
  "预期cpe_1-20s",
  "预期cpe_20-60s",
  "预期cpe_60s以上",
  "预期cpm_1-20s",
  "预期cpm_20-60s",
  "预期cpm_60s以上",
  "priceJson"
], Um = [
  "观众画像男性占比",
  "观众画像女性占比",
  "18-23",
  "24-30",
  "31-40",
  "41-50",
  "50+",
  "其他",
  "汇总",
  "粉丝画像-年龄分布",
  "粉丝画像-地域占比 TOP10",
  "粉丝画像-城市等级分布",
  "粉丝画像-兴趣分布",
  "粉丝画像-八大人群占比",
  "粉丝画像-设备分布"
];
class Fm {
  /**
   * 在浏览器上下文中发送 API 请求（自动携带 cookie，解决登录态问题）。
   *
   * 副作用：每次请求前都会先 DOM 探针检查窗口是否已经被字节注入了滑块。
   * 命中即抛 BytedanceRiskError(dom-probe)，由顶层 catch 处理。
   * 与 starmap-auth.service.ts 中的 executeJavaScript + fetch 模式一致。
   */
  async browserFetch(e, t, n, s = 2) {
    if (e.isDestroyed())
      throw new Error("采集窗口已销毁");
    if (await this.detectDomCaptcha(e))
      throw new Rt(0, "dom-probe", "字节滑块 DOM 已注入（无错误码）");
    const o = (n == null ? void 0 : n.method) ?? "GET", r = {
      Accept: "application/json",
      "agw-js-conv": "str",
      ...(n == null ? void 0 : n.headers) ?? {}
    };
    let c = `{ method: '${o}', credentials: 'include', headers: ${JSON.stringify(r)}`;
    n != null && n.body && (c += `, body: ${JSON.stringify(n.body)}`), c += " }";
    const u = `
      fetch(${JSON.stringify(t)}, ${c})
        .then(function(r) {
          return r.text().then(function(t) {
            if (!t || t === 'null' || t === 'undefined') {
              return JSON.stringify({ __fetchError: 'empty body, HTTP ' + r.status + ' ' + r.statusText, __status: r.status, __retryable: true });
            }
            return t;
          });
        })
        .catch(function(e) {
          return JSON.stringify({
            __fetchError: e.message || String(e),
            __errorName: e.name || '',
            __location: location.href,
            __online: navigator.onLine,
            __retryable: true
          });
        })
    `, l = await e.webContents.executeJavaScript(u);
    if (!l || l === "null" || l === "undefined")
      throw new Error(`browserFetch 无响应 (executeJavaScript returned falsy): ${t}`);
    const p = JSON.parse(l);
    if (p.__fetchError) {
      if (p.__retryable && s > 0) {
        const d = e.webContents.getURL();
        if (!d.startsWith(nt))
          try {
            await e.webContents.loadURL(nt);
          } catch (h) {
            D.warn("[browserFetch] 重试前 loadURL 星图首页失败:", h);
          }
        return D.warn(
          `[browserFetch] 请求失败可重试, ${s}次重试剩余, error=${String(p.__fetchError)}, location=${String(p.__location ?? d)}, url=${t}`
        ), await new Promise((h) => setTimeout(h, 500)), this.browserFetch(e, t, n, s - 1);
      }
      throw new Error(
        `browserFetch 错误: ${String(p.__fetchError)} [status=${p.__status ?? "N/A"}, name=${String(p.__errorName ?? "")}, location=${String(
          p.__location ?? e.webContents.getURL()
        )}, online=${String(p.__online ?? "unknown")}]`
      );
    }
    return p;
  }
  /**
   * DOM 探针：检查页面是否被字节注入滑块。
   * 失败（窗口未加载等）一律视为「无滑块」返回 false，避免误抛。
   */
  async detectDomCaptcha(e) {
    if (e.isDestroyed()) return !1;
    try {
      const t = JSON.stringify(Ei);
      return await e.webContents.executeJavaScript(
        `document.querySelector(${t}) !== null`
      ) === !0;
    } catch {
      return !1;
    }
  }
  /**
   * 触发字节风控后，把窗口导到 dashboard 让字节注入滑块 SDK，再调上层 captcha handler 等待用户处理。
   *
   * @returns true 用户通过；false 超时或主动取消（调用方应抛错让 dispatcher 计 RISK）
   */
  async resolveBytedanceCaptcha(e, t, n, s) {
    if (e.isDestroyed()) return !1;
    D.warn(
      `[bytedance-risk] 触发风控，准备弹滑块: reason=${s}, accountId=${t ?? "N/A"}`
    );
    try {
      await e.webContents.loadURL(Am);
    } catch (o) {
      D.warn("[bytedance-risk] loadURL dashboard 失败（继续等待 captcha handler）:", o);
    }
    const i = await n({
      window: e,
      platform: "STARMAP",
      accountId: t,
      reason: s,
      urlPatterns: ["captcha", "verify", "security-verification"],
      captchaSelectors: [Ei],
      timeoutMs: Rm
    });
    return i.resolved ? D.info("[bytedance-risk] 用户已通过滑块") : D.warn(
      `[bytedance-risk] 滑块未通过: timedOut=${i.timedOut}, cancelled=${i.cancelled ?? !1}`
    ), i.resolved;
  }
  /** 抓取博主主页数据 */
  async scrapeBlogger(e, t, n, s, i, o) {
    var u;
    D.info(`[scrapeBlogger] ===== 开始采集 ===== url=${e}`);
    const r = Date.now();
    let c = !1;
    for (; ; )
      try {
        const l = Ha.extractStarmapAuthorInfo(e);
        let p, d;
        if (l)
          p = l.starId, d = {
            douyinNumber: "",
            secUid: "",
            douyinUrl: ""
          }, D.info(`[scrapeBlogger] 步骤1: 识别星图主页链接, star_id=${p}`), D.info("[scrapeBlogger] 步骤2: 已有星图ID，跳过抖音号搜索");
        else {
          D.info("[scrapeBlogger] 步骤1: 解析抖音链接...");
          const g = await Ha.extractDouyinUserInfo(e);
          if (!g)
            return D.info(
              `[scrapeBlogger] 步骤1跳过: errorCode=INVALID_TARGET_URL, retryable=false, url=${e}`
            ), {
              status: "error",
              data: null,
              errorCode: "INVALID_TARGET_URL",
              errorDetails: {
                source: "starmap.extractDouyinUserInfo",
                url: e,
                retryable: !1
              },
              errorMessage: `无效的星图/抖音链接或无法提取达人 ID: ${e}`
            };
          d = g, D.info(
            `[scrapeBlogger] 步骤1完成: douyinNumber=${d.douyinNumber}, secUid=${d.secUid}`
          ), D.info("[scrapeBlogger] 步骤2: 搜索星图博主...");
          const v = await this.searchAuthorByUid(
            d.douyinNumber,
            t,
            n
          ), y = v.author;
          if (!y)
            return (v.errorCode === "TARGET_NOT_FOUND" ? D.info.bind(D) : D.error.bind(D))(
              `[scrapeBlogger] 步骤2${v.errorCode === "TARGET_NOT_FOUND" ? "跳过" : "失败"}: errorCode=${v.errorCode ?? "API_ERROR"}, apiStatusCode=${v.apiStatusCode ?? "unknown"}, authorsCount=${v.authorsCount ?? "unknown"}, retryable=${v.retryable ?? !0}, douyinNumber=${d.douyinNumber}`
            ), {
              status: "error",
              data: null,
              errorCode: v.errorCode ?? "API_ERROR",
              errorDetails: {
                source: "starmap.search",
                apiStatusCode: v.apiStatusCode,
                apiStatusMessage: v.apiStatusMessage,
                authorsCount: v.authorsCount,
                douyinNumber: d.douyinNumber,
                url: e,
                retryable: v.retryable ?? !0
              },
              errorMessage: v.errorMessage ?? `星图搜索失败 (抖音号: ${d.douyinNumber}): ${e}`
            };
          p = y.star_id, D.info(
            `[scrapeBlogger] 步骤2完成: star_id=${p}, nickname=${((u = y.attribute_datas) == null ? void 0 : u.nick_name) ?? "未知"}`
          );
        }
        D.info("[scrapeBlogger] 步骤3: 并行调用详情API...");
        const h = await this.fetchAllAuthorData(
          p,
          t,
          n,
          d,
          o
        ), m = Date.now() - r, f = Object.keys(h).length;
        return D.info(
          `[scrapeBlogger] ===== 采集完成 ===== star_id=${p}, 字段数=${f}, 耗时=${m}ms`
        ), { status: "success", data: h };
      } catch (l) {
        if (l instanceof Rt) {
          if (!c && s && !t.isDestroyed()) {
            c = !0;
            const h = `bytedance-risk-${l.source}-${l.code}`;
            if (await this.resolveBytedanceCaptcha(
              t,
              i,
              s,
              h
            )) {
              try {
                await t.webContents.loadURL(nt);
              } catch (g) {
                D.warn("[bytedance-risk] loadURL baseUrl 失败:", g);
              }
              D.info("[bytedance-risk] 重试整个采集流程");
              continue;
            }
            const f = Date.now() - r;
            return D.error(
              `[scrapeBlogger] ===== 滑块未通过 ===== url=${e}, 耗时=${f}ms, code=${l.code}`
            ), {
              status: "error",
              data: null,
              errorCode: "CAPTCHA_UNRESOLVED",
              errorDetails: {
                source: l.source,
                apiStatusCode: l.code,
                retryable: !0
              },
              errorMessage: `字节风控滑块未通过 code=${l.code} source=${l.source}`
            };
          }
          const d = Date.now() - r;
          return D.error(
            `[scrapeBlogger] ===== 重试后仍触发风控 ===== url=${e}, 耗时=${d}ms, code=${l.code}`
          ), {
            status: "error",
            data: null,
            errorCode: "RISK_CONTROL",
            errorDetails: {
              source: l.source,
              apiStatusCode: l.code,
              retryable: !0
            },
            errorMessage: `字节风控（重试后）code=${l.code} source=${l.source}`
          };
        }
        const p = Date.now() - r;
        return D.error(`[scrapeBlogger] ===== 采集异常 ===== url=${e}, 耗时=${p}ms`, l), {
          status: "error",
          data: null,
          errorCode: "API_ERROR",
          errorDetails: {
            source: "starmap.scrapeBlogger",
            retryable: !0
          },
          errorMessage: l instanceof Error ? l.message : String(l)
        };
      }
  }
  /** 通过抖音号在星图搜索博主 */
  async searchAuthorByUid(e, t, n) {
    var s, i, o;
    D.info(`[search] 开始搜索博主: UID=${e}`);
    try {
      const r = bm(e), c = await this.browserFetch(t, vm, {
        method: "POST",
        headers: {
          ...n,
          "Content-Type": "application/json"
        },
        body: r
      });
      D.info(
        `[search] 搜索响应: status_code=${c.base_resp.status_code}, status_message=${c.base_resp.status_message}, authors_count=${((s = c.authors) == null ? void 0 : s.length) ?? 0}`
      );
      const u = c.base_resp.status_code;
      if (Ai.has(u))
        throw new Rt(
          u,
          "response-code",
          `[search] 命中字节风控码: ${c.base_resp.status_message}`
        );
      if (u !== 0)
        return D.error(`[search] 搜索失败: code=${u}, msg=${c.base_resp.status_message}`), {
          author: null,
          errorCode: "API_ERROR",
          errorMessage: `星图搜索 API 返回错误: code=${u}, msg=${c.base_resp.status_message}`,
          apiStatusCode: u,
          apiStatusMessage: c.base_resp.status_message,
          authorsCount: ((i = c.authors) == null ? void 0 : i.length) ?? 0,
          retryable: !0
        };
      if (!c.authors || c.authors.length === 0)
        return D.info(
          `[search] 搜索结果为空: errorCode=TARGET_NOT_FOUND, UID=${e}, status_code=${u}, retryable=false`
        ), {
          author: null,
          errorCode: "TARGET_NOT_FOUND",
          errorMessage: `星图搜索无匹配达人: douyinNumber=${e}`,
          apiStatusCode: u,
          apiStatusMessage: c.base_resp.status_message,
          authorsCount: 0,
          retryable: !1
        };
      const l = c.authors[0];
      return D.info(
        `[search] 匹配到博主: star_id=${l.star_id}, nick_name=${((o = l.attribute_datas) == null ? void 0 : o.nick_name) ?? "未知"}`
      ), {
        author: l,
        apiStatusCode: u,
        apiStatusMessage: c.base_resp.status_message,
        authorsCount: c.authors.length
      };
    } catch (r) {
      if (r instanceof Rt)
        throw r;
      return D.error(`[search] 搜索请求异常: UID=${e}`, r), {
        author: null,
        errorCode: "API_ERROR",
        errorMessage: r instanceof Error ? r.message : String(r),
        retryable: !0
      };
    }
  }
  /** 并行调用全部详情 API，组装完整数据 */
  async fetchAllAuthorData(e, t, n, s, i) {
    var xs, vs, ys, bs, ws, _s;
    const o = `o_author_id=${e}&platform_source=1&platform_channel=1`, r = (te, Ft) => {
      const dn = Date.now();
      return this.browserFetch(t, Ft, { headers: n }).then((Ge) => {
        const Bt = Date.now() - dn, Kn = Ge == null ? void 0 : Ge.base_resp, Je = Kn == null ? void 0 : Kn.status_code;
        if (Je !== void 0 && Ai.has(Je))
          throw D.warn(`[API] ${te}: 命中字节风控码 ${Je}, 耗时=${Bt}ms`), new Rt(Je, "response-code", `[${te}] 字节风控码 ${Je}`);
        return Je !== void 0 && Je !== 0 ? D.warn(`[API] ${te}: 业务错误 status_code=${Je}, 耗时=${Bt}ms`) : D.info(`[API] ${te}: 成功, 耗时=${Bt}ms`), Ge;
      }).catch((Ge) => {
        if (Ge instanceof Rt)
          throw Ge;
        const Bt = Date.now() - dn;
        return D.error(`[API] ${te}: 请求失败, 耗时=${Bt}ms`, Ge), null;
      });
    }, c = Se(i, km), u = Se(i, Tm), l = Se(i, Im), p = Se(i, Pm), d = Se(i, $m), h = Se(i, Dm), m = Se(i, Lm), f = h || m, g = Se(i, ["内容类型分析"]), v = Se(i, Nm), y = Se(i, Om), b = Se(i, Mm), S = Se(i, Um), C = {
      baseInfo: c,
      statInfo: c,
      marketingInfo: u,
      marketingInfoImageText: u,
      authorScore: l,
      spreadPersonal: p,
      spreadStar: d,
      showItems: f,
      videoDist: g,
      linkStruct: v,
      convertAbility: y,
      ecomDetail: y,
      cpInfo: b,
      fansDist: S,
      homepageVideos: c
    }, _ = Object.values(C).filter(Boolean).length;
    D.info(`[fetchAll] 开始按需并行调用 ${_} 个详情API, star_id=${e}`);
    const k = Date.now(), P = `o_author_id=${e}&platform_source=1&platform_channel=11`, [
      T,
      L,
      z,
      G,
      O,
      le,
      de,
      H,
      N,
      q,
      M,
      A,
      R,
      $,
      ae
    ] = await Promise.all([
      c ? r(
        "baseInfo",
        `${Ce.baseInfo}?${o}&recommend=true&need_sec_uid=true&need_linkage_info=true`
      ) : Promise.resolve(null),
      c ? r("statInfo", `${Ce.statInfo}?${o}`) : Promise.resolve(null),
      u ? r(
        "marketingInfo",
        `${Ce.marketingInfo}?${o}`
      ) : Promise.resolve(null),
      u ? r(
        "marketingInfoImageText",
        `${Ce.marketingInfo}?${P}`
      ) : Promise.resolve(null),
      l ? r("authorScore", `${Ce.authorScore}?${o}`) : Promise.resolve(null),
      p ? r(
        "spreadPersonal",
        `${Ce.spreadInfo}?${o}&range=2&type=1`
      ) : Promise.resolve(null),
      d ? r(
        "spreadStar",
        `${Ce.spreadInfo}?${o}&range=2&type=2`
      ) : Promise.resolve(null),
      f ? r("showItems", `${Ce.showItems}?${o}`) : Promise.resolve(null),
      g ? r(
        "videoDist",
        `${Ce.videoDistribution}?${o}`
      ) : Promise.resolve(null),
      v ? r("linkStruct", `${Ce.linkStruct}?${o}`) : Promise.resolve(null),
      y ? r(
        "convertAbility",
        `${Ce.convertAbility}?${o}&industry_id=0&range=2`
      ) : Promise.resolve(null),
      y ? r("ecomDetail", `${Ce.ecomDetail}?${o}`) : Promise.resolve(null),
      b ? r("cpInfo", `${Ce.cpInfo}?${o}`) : Promise.resolve(null),
      S ? r(
        "fansDist",
        `${Ce.fansDistribution}?${o}`
      ) : Promise.resolve(null),
      c ? r(
        "homepageVideos",
        `${Ce.homepageVideos}?${o}&page=0&limit=15`
      ) : Promise.resolve(null)
    ]), X = Date.now() - k, fe = [
      { name: "baseInfo", planned: C.baseInfo, success: !!T },
      { name: "statInfo", planned: C.statInfo, success: !!L },
      { name: "marketingInfo", planned: C.marketingInfo, success: !!z },
      {
        name: "marketingInfoImageText",
        planned: C.marketingInfoImageText,
        success: !!G
      },
      { name: "authorScore", planned: C.authorScore, success: !!O },
      { name: "spreadPersonal", planned: C.spreadPersonal, success: !!le },
      { name: "spreadStar", planned: C.spreadStar, success: !!de },
      { name: "showItems", planned: C.showItems, success: !!H },
      { name: "videoDist", planned: C.videoDist, success: !!N },
      { name: "linkStruct", planned: C.linkStruct, success: !!q },
      { name: "convertAbility", planned: C.convertAbility, success: !!M },
      { name: "ecomDetail", planned: C.ecomDetail, success: !!A },
      { name: "cpInfo", planned: C.cpInfo, success: !!R },
      { name: "fansDist", planned: C.fansDist, success: !!$ },
      { name: "homepageVideos", planned: C.homepageVideos, success: !!ae }
    ], De = fe.length, Q = fe.filter((te) => te.planned && te.success).length, at = fe.filter((te) => te.planned && !te.success).map((te) => te.name), st = fe.filter((te) => !te.planned).map((te) => te.name);
    if (D.info(
      `[fetchAll] API 调用完毕: 计划=${_}/${De}, 成功=${Q}/${_}, 跳过=${st.length}, 总耗时=${X}ms`
    ), at.length > 0 && D.warn(`[fetchAll] 失败的API: ${at.join(", ")}`), st.length > 0 && D.info(`[fetchAll] 按字段选择跳过的API: ${st.join(", ")}`), T && D.info(
      `[data] 基础信息: nick_name=${T.nick_name}, follower=${T.follower}, unique_id=${T.unique_id}, mcn_name=${JSON.stringify(T.mcn_name)}`
    ), L) {
      const te = L, Ft = Object.keys(te).filter((dn) => dn !== "base_resp");
      D.info(
        `[data] 统计信息: keys=[${Ft.join(",")}], total_favour_cnt=${JSON.stringify(te.total_favour_cnt)} (type=${typeof te.total_favour_cnt})`
      );
    }
    if (z && D.info(`[data] 报价: price_info共${((xs = z.price_info) == null ? void 0 : xs.length) ?? 0}条`), H && D.info(
      `[data] 视频: 个人视频${((vs = H.latest_item_info) == null ? void 0 : vs.length) ?? 0}条, 星图视频${((ys = H.latest_star_item_info) == null ? void 0 : ys.length) ?? 0}条`
    ), $) {
      D.info(`[data] 粉丝画像: ${((bs = $.distributions) == null ? void 0 : bs.length) ?? 0}个维度`);
      const te = (ws = $.distributions) == null ? void 0 : ws.find((Ft) => this.toNum(Ft.type) === 1);
      te && D.info(
        `[data] 性别分布原始: ${JSON.stringify((_s = te.distribution_list) == null ? void 0 : _s.slice(0, 2))}`
      );
    }
    D.info("[fetchAll] 开始组装数据...");
    const be = {
      // ---------- 基础信息 (A-O) ----------
      ...this.assembleBaseInfo(T, L, ae, s, e),
      // ---------- 博主服务报价 ----------
      ...this.assembleMarketingInfo(z, G),
      // ---------- 商业能力指数 (W-AG) ----------
      ...this.assembleAuthorScore(O),
      // ---------- 个人视频传播表现 30日 (AH-AO) ----------
      ...this.assembleSpreadInfo(le, "personal"),
      // ---------- 星图视频传播表现 30日 (AP-AW) ----------
      ...this.assembleSpreadInfo(de, "star"),
      // ---------- 个人视频最新15个 (AX-BJ) ----------
      ...this.assembleShowItems(H == null ? void 0 : H.latest_item_info, "personal"),
      // ---------- 星图视频最新15个 (BK-BW) ----------
      ...this.assembleShowItems(H == null ? void 0 : H.latest_star_item_info, "star"),
      // ---------- 内容类型分析 (BX) ----------
      ...this.assembleVideoDistribution(N),
      // ---------- 连接用户分布 (BY-CD) ----------
      ...this.assembleLinkStruct(q),
      // ---------- 转化能力分析 (CG-CO) ----------
      ...this.assembleConvertAbility(M, A),
      // ---------- 预期CPE (CP-CR) ----------
      ...this.assembleCpe(R),
      // ---------- 预期CPM (CS-CU) ----------
      ...this.assembleCpm(R),
      // ---------- 粉丝画像 (CV-DI) ----------
      ...this.assembleFansDistribution($),
      // ---------- 备注 (DJ) ----------
      备注: ""
    };
    return en(be, i, Em);
  }
  // ========================================================================
  //  数据组装方法
  // ========================================================================
  /** API 返回的字段类型可能与文档不符，安全地转为数组 */
  safeArray(e) {
    return Array.isArray(e) ? e : [];
  }
  /** 安全地将可能不是数组的值转为字符串（兼容 JSON 字符串如 '["母婴亲子"]'） */
  safeJoin(e, t = "、") {
    if (Array.isArray(e)) return e.join(t);
    if (typeof e == "string") {
      if (e.startsWith("["))
        try {
          const n = JSON.parse(e);
          if (Array.isArray(n)) return n.join(t);
        } catch {
        }
      return e;
    }
    return e == null ? "" : String(e);
  }
  /**
   * 安全地将 API 返回值转为数字。
   * 由于请求头 agw-js-conv: str 会将所有数字序列化为字符串以避免 int64 精度丢失，
   * 所有从 API 取到的"数字"字段实际运行时都是 string 类型，需要显式转换。
   */
  toNum(e) {
    if (e == null) return 0;
    const t = Number(e);
    return Number.isNaN(t) ? 0 : t;
  }
  /** 清理可能为 "None"/"null"/空 等无意义的字符串值 */
  cleanStr(e) {
    if (e == null) return "";
    const t = String(e).trim();
    return t === "" || t === "None" || t === "null" || t === "undefined" ? "" : t;
  }
  /** 基础信息 (A-O) */
  assembleBaseInfo(e, t, n, s, i) {
    var u;
    const o = (e == null ? void 0 : e.sec_uid) ?? s.secUid, r = o ? `https://www.douyin.com/user/${o}` : s.douyinUrl, c = this.toNum(e == null ? void 0 : e.gender);
    if (t) {
      const l = t;
      D.info(
        `[assembleBaseInfo] statInfo 原始数据: total_favour_cnt=${JSON.stringify(l.total_favour_cnt)}, type=${typeof l.total_favour_cnt}`
      );
    } else
      D.warn("[assembleBaseInfo] statInfo 为 null");
    return {
      主页链接: r,
      // A
      星图链接: ym(i),
      // B
      星图ID: i,
      // C
      昵称: (e == null ? void 0 : e.nick_name) ?? "",
      // D
      头像: (e == null ? void 0 : e.avatar_uri) ?? "",
      // 新增头像字段
      抖音号: (e == null ? void 0 : e.unique_id) ?? s.douyinNumber,
      // E
      粉丝数: this.toNum(e == null ? void 0 : e.follower),
      // F
      获赞数: this.toNum(t == null ? void 0 : t.total_favour_cnt),
      // G
      所属机构: this.cleanStr(e == null ? void 0 : e.mcn_name),
      // H
      年龄: "",
      // I (星图不返回博主本人年龄)
      发布视频数: this.toNum((u = n == null ? void 0 : n.pagination) == null ? void 0 : u.total_count),
      // J
      描述: this.safeJoin(e == null ? void 0 : e.tags),
      // K
      性别: c === 1 ? "男" : c === 2 ? "女" : "未知",
      // L
      地区: (e == null ? void 0 : e.province) ?? "",
      // M
      IP归属地: `${(e == null ? void 0 : e.province) ?? ""} ${(e == null ? void 0 : e.city) ?? ""}`.trim(),
      // N
      博主分类: this.safeJoin(e == null ? void 0 : e.tags_level_two)
      // O
    };
  }
  /** 博主服务报价 */
  assembleMarketingInfo(e, t) {
    var r, c;
    const n = /* @__PURE__ */ new Map(), s = [
      ...(e == null ? void 0 : e.price_info) ?? [],
      ...(t == null ? void 0 : t.price_info) ?? []
    ];
    for (const u of s)
      n.set(u.video_type, u);
    if (s.length > 0) {
      const u = s.map(
        (l) => `type=${l.video_type} desc="${l.desc}" price=${l.price}`
      );
      D.info(`[assembleMarketingInfo] 全部报价(${u.length}条): ${u.join(" | ")}`);
    }
    const i = (u) => {
      var l;
      return this.toNum((l = n.get(u)) == null ? void 0 : l.price);
    }, o = n.get(Ue.NATURAL_CPM);
    return {
      "1-20s视频": i(Ue.SHORT_1_20),
      "21-60s视频": i(Ue.SHORT_20_60),
      "60s以上视频": i(Ue.SHORT_60_PLUS),
      千次自然播放单价: i(Ue.NATURAL_CPM),
      千次自然播放总价下限: this.toNum((r = o == null ? void 0 : o.price_extra_info) == null ? void 0 : r.floor_price),
      千次自然播放总价上限: this.toNum((c = o == null ? void 0 : o.price_extra_info) == null ? void 0 : c.ceiling_price),
      抖音短视频合集任务: i(Ue.COLLECTION),
      "抖音短视频共创-参与博主": i(Ue.CO_CREATION),
      抖音图文: i(Ue.IMAGE_TEXT),
      单视频推送广告平台: i(Ue.SINGLE_VIDEO_AD),
      多视频推送广告平台: i(Ue.MULTI_VIDEO_AD),
      下载: i(Ue.DOWNLOAD)
    };
  }
  /** 商业能力指数 (W-AG)，API 数值需 ÷10000 */
  assembleAuthorScore(e) {
    var n, s, i, o, r;
    const t = (c) => {
      const u = this.toNum(c);
      return u !== 0 ? +(u / 1e4).toFixed(2) : 0;
    };
    return {
      星图指数: t(e == null ? void 0 : e.top_score),
      // W
      传播指数: t(e == null ? void 0 : e.spread_index),
      // X
      传播指数行业中位数: t((n = e == null ? void 0 : e.median) == null ? void 0 : n.spread_index),
      // Y
      种草指数: t(e == null ? void 0 : e.shopping_index),
      // Z
      种草指数行业中位数: t((s = e == null ? void 0 : e.median) == null ? void 0 : s.shopping_index),
      // AA
      转化指数: t(e == null ? void 0 : e.growth_index),
      // AB
      转化指数行业中位数: t((i = e == null ? void 0 : e.median) == null ? void 0 : i.growth_index),
      // AC
      性价比指数: t(e == null ? void 0 : e.cp_index),
      // AD
      性价比指数行业中位数: t((o = e == null ? void 0 : e.median) == null ? void 0 : o.cp_index),
      // AE
      合作指数: t(e == null ? void 0 : e.cooperate_index),
      // AF
      合作指数行业中位数: t((r = e == null ? void 0 : e.median) == null ? void 0 : r.cooperate_index)
      // AG
    };
  }
  /** 传播表现 30日 (AH-AO / AP-AW) */
  assembleSpreadInfo(e, t) {
    var l, p;
    const n = t === "personal" ? "个人视频传播" : "星图视频传播", s = this.toNum((l = e == null ? void 0 : e.play_over_rate) == null ? void 0 : l.value), i = s !== 0 ? +(s / 1e4 * 100).toFixed(2) : 0, o = this.toNum((p = e == null ? void 0 : e.interact_rate) == null ? void 0 : p.value), r = o !== 0 ? +(o / 1e4 * 100).toFixed(2) : 0, c = this.toNum(e == null ? void 0 : e.avg_duration), u = c !== 0 ? +(c / 100).toFixed(1) : 0;
    return {
      [`${n}_完播率`]: i,
      // AH/AP
      [`${n}_互动率`]: r,
      // AI/AQ
      [`${n}_播放量中位数`]: this.toNum(e == null ? void 0 : e.play_mid),
      // AJ/AR
      [`${n}_发布作品数`]: this.toNum(e == null ? void 0 : e.item_num),
      // AK/AS
      [`${n}_平均时长`]: u,
      // AL/AT
      [`${n}_平均点赞`]: this.toNum(e == null ? void 0 : e.like_avg),
      // AM/AU
      [`${n}_平均评论`]: this.toNum(e == null ? void 0 : e.comment_avg),
      // AN/AV
      [`${n}_平均转发`]: this.toNum(e == null ? void 0 : e.share_avg)
      // AO/AW
    };
  }
  /** 最新15个视频统计 (AX-BJ / BK-BW) */
  assembleShowItems(e, t) {
    const n = t === "personal" ? "个人视频15个" : "星图视频15个";
    if (!e || e.length === 0)
      return {
        [`${n}_最低播放量`]: 0,
        [`${n}_最高播放量`]: 0,
        [`${n}_爆量视频百分比`]: 0,
        [`${n}_播放量均值`]: 0,
        [`${n}_最低点赞量`]: 0,
        [`${n}_最高点赞量`]: 0,
        [`${n}_点赞量均值`]: 0,
        [`${n}_最低评论量`]: 0,
        [`${n}_最高评论量`]: 0,
        [`${n}_评论量均值`]: 0,
        [`${n}_最低转发量`]: 0,
        [`${n}_最高转发量`]: 0,
        [`${n}_转发量均值`]: 0
      };
    const s = e.map((l) => this.toNum(l.play)), i = e.map((l) => this.toNum(l.like)), o = e.map((l) => this.toNum(l.comment)), r = e.map((l) => this.toNum(l.share)), c = e.filter((l) => l.is_hot).length, u = (l) => Math.round(l.reduce((p, d) => p + d, 0) / l.length);
    return {
      [`${n}_最低播放量`]: Math.min(...s),
      // AX/BK
      [`${n}_最高播放量`]: Math.max(...s),
      // AY/BL
      [`${n}_爆量视频百分比`]: +(c / e.length * 100).toFixed(2),
      // AZ/BM
      [`${n}_播放量均值`]: u(s),
      // BA/BN
      [`${n}_最低点赞量`]: Math.min(...i),
      // BB/BO
      [`${n}_最高点赞量`]: Math.max(...i),
      // BC/BP
      [`${n}_点赞量均值`]: u(i),
      // BD/BQ
      [`${n}_最低评论量`]: Math.min(...o),
      // BE/BR
      [`${n}_最高评论量`]: Math.max(...o),
      // BF/BS
      [`${n}_评论量均值`]: u(o),
      // BG/BT
      [`${n}_最低转发量`]: Math.min(...r),
      // BH/BU
      [`${n}_最高转发量`]: Math.max(...r),
      // BI/BV
      [`${n}_转发量均值`]: u(r)
      // BJ/BW
    };
  }
  /** 内容类型分析 (BX) */
  assembleVideoDistribution(e) {
    return { 内容类型分析: [...this.safeArray(
      e == null ? void 0 : e.video_content_distribution
    )].sort((i, o) => this.toNum(o.proportion) - this.toNum(i.proportion)).map((i) => `${i.name}(${(this.toNum(i.proportion) * 100).toFixed(1)}%)`).join("、") };
  }
  /** 连接用户分布 (BY-CD) */
  assembleLinkStruct(e) {
    var n, s, i, o, r, c, u;
    const t = (e == null ? void 0 : e.link_struct) ?? {};
    return {
      月连接用户数: this.toNum((n = t[5]) == null ? void 0 : n.value),
      // BY
      月深度用户数: this.toNum((s = t[3]) == null ? void 0 : s.value) + this.toNum((i = t[4]) == null ? void 0 : i.value),
      // BZ (喜欢+追随)
      了解: this.toNum((o = t[1]) == null ? void 0 : o.value),
      // CA
      兴趣: this.toNum((r = t[2]) == null ? void 0 : r.value),
      // CB
      喜欢: this.toNum((c = t[3]) == null ? void 0 : c.value),
      // CC
      追随: this.toNum((u = t[4]) == null ? void 0 : u.value)
      // CD
    };
  }
  /** 转化能力分析 (CG-CO) */
  assembleConvertAbility(e, t) {
    var n, s, i;
    return {
      相关视频数: this.toNum((n = e == null ? void 0 : e.related_video_cnt) == null ? void 0 : n.value) || "-",
      // CG
      播放中位数: this.toNum((s = e == null ? void 0 : e.video_vv_median) == null ? void 0 : s.value) || "-",
      // CH
      组件点击量: (e == null ? void 0 : e.component_click_cnt_range) ?? "-",
      // CI
      组件点击率: (e == null ? void 0 : e.component_click_rate_range) ?? "-",
      // CJ
      相关CPC: (e == null ? void 0 : e.related_cpc_range) ?? "-",
      // CK
      带货商品数: this.toNum((i = e == null ? void 0 : e.rec_product_cnt) == null ? void 0 : i.value) || "-",
      // CL
      平均销售额区间: (e == null ? void 0 : e.avg_sales_amount_range) ?? "-",
      // CM
      带货商品价格: (e == null ? void 0 : e.rec_product_price_range) ?? "-",
      // CN
      GPM: (e == null ? void 0 : e.gpm_range) ?? "-"
      // CO
    };
  }
  /** 预期CPE (CP-CR)，API 数值需 ÷100 */
  assembleCpe(e) {
    var n, s, i;
    const t = (o) => {
      const r = this.toNum(o);
      return r !== 0 ? +(r / 100).toFixed(2) : 0;
    };
    return {
      "预期cpe_1-20s": t((n = e == null ? void 0 : e.expect_cpe) == null ? void 0 : n.cpe_1_20),
      // CP
      "预期cpe_20-60s": t((s = e == null ? void 0 : e.expect_cpe) == null ? void 0 : s.cpe_21_60),
      // CQ
      预期cpe_60s以上: t((i = e == null ? void 0 : e.expect_cpe) == null ? void 0 : i.cpe_60)
      // CR
    };
  }
  /** 预期CPM (CS-CU)，API 数值需 ÷100 */
  assembleCpm(e) {
    var n, s, i;
    const t = (o) => {
      const r = this.toNum(o);
      return r !== 0 ? +(r / 100).toFixed(2) : 0;
    };
    return {
      "预期cpm_1-20s": t((n = e == null ? void 0 : e.expect_cpm) == null ? void 0 : n.cpm_1_20),
      // CS
      "预期cpm_20-60s": t((s = e == null ? void 0 : e.expect_cpm) == null ? void 0 : s.cpm_21_60),
      // CT
      预期cpm_60s以上: t((i = e == null ? void 0 : e.expect_cpm) == null ? void 0 : i.cpm_60)
      // CU
    };
  }
  /** 粉丝画像 (CV-DJ) */
  assembleFansDistribution(e) {
    const t = /* @__PURE__ */ new Map();
    if (e != null && e.distributions)
      for (const M of e.distributions)
        t.set(M.type, M);
    const n = (M) => {
      var A;
      return this.safeArray(
        (A = t.get(M)) == null ? void 0 : A.distribution_list
      );
    }, s = (M, A) => {
      var $;
      const R = ($ = n(M).find((ae) => ae.distribution_key === A)) == null ? void 0 : $.distribution_value;
      return this.toNum(R);
    }, i = s(1, "male"), o = s(1, "female"), r = i + o, c = r > 0 ? +(i / r * 100).toFixed(2) : 0, u = r > 0 ? +(o / r * 100).toFixed(2) : 0, l = s(2, "18-23"), p = s(2, "24-30"), d = s(2, "31-40"), h = s(2, "41-50"), m = s(2, "50+"), f = s(2, "<18"), g = l + p + d + h + m + f, v = (M) => `${g > 0 ? (M / g * 100).toFixed(2) : "0.00"}%`, b = [...n(2)].sort(
      (M, A) => this.toNum(A.distribution_value) - this.toNum(M.distribution_value)
    ), S = (M) => {
      const A = M.reduce((R, $) => R + this.toNum($.distribution_value), 0);
      return M.map((R) => {
        const $ = this.toNum(R.distribution_value), ae = A > 0 ? ($ / A * 100).toFixed(1) : "0";
        return `${R.distribution_key} ${ae}%`;
      }).join("、");
    }, _ = [...n(4)].sort(
      (M, A) => this.toNum(A.distribution_value) - this.toNum(M.distribution_value)
    ), k = S(_.slice(0, 10)), P = n(32), T = S(P), z = [...n(64)].sort(
      (M, A) => this.toNum(A.distribution_value) - this.toNum(M.distribution_value)
    ), G = S(z), le = [...n(1024)].sort(
      (M, A) => this.toNum(A.distribution_value) - this.toNum(M.distribution_value)
    ), de = S(le), N = [...n(8)].sort(
      (M, A) => this.toNum(A.distribution_value) - this.toNum(M.distribution_value)
    ), q = S(N);
    return {
      观众画像男性占比: c,
      // CV
      观众画像女性占比: u,
      // CW
      "18-23": v(l),
      // CX
      "24-30": v(p),
      // CY
      "31-40": v(d),
      // CZ
      "41-50": v(h),
      // DA
      "50+": v(m),
      // DB
      其他: v(f),
      // DC
      汇总: g,
      // DD
      "粉丝画像-年龄分布": S(b),
      // DE (新增)
      "粉丝画像-地域占比 TOP10": k,
      // DF
      "粉丝画像-城市等级分布": T,
      // DF
      "粉丝画像-兴趣分布": G,
      // DG
      "粉丝画像-八大人群占比": de,
      // DH
      "粉丝画像-设备分布": q
      // DI
    };
  }
}
const He = Y("StarmapPlugin"), Ea = "persist:starmap";
class Bm {
  constructor() {
    w(this, "id", "starmap");
    w(this, "name", "星图");
    w(this, "platforms", ["STARMAP"]);
    w(this, "defaultTaskType", "blogger");
    w(this, "baseUrl", nt);
    w(this, "sessionPartition", Ea);
    /**
     * 字节风控兜底。
     *
     * 插件内部 `scrapeBlogger` 已经识别 2155/2154/9999/4444006 并调 requestCaptcha，
     * 这里是给「插件内部 catch 没覆盖到」时让 dispatcher 二次触发 broker 的安全网。
     */
    w(this, "riskCodes", [
      {
        pattern: /\b(2155|2154|9999|4444006)\b/,
        reason: "bytedance-risk-code",
        timeoutMs: 18e4
      }
    ]);
    w(this, "authService");
    w(this, "scraperService");
    w(this, "windowManager");
    this.windowManager = new _t(), this.authService = new Sm(this.windowManager, Ea), this.scraperService = new Fm(), He.info(`[StarmapPlugin] 插件已初始化, partition=${Ea}`);
  }
  async checkAuth() {
    He.info("[checkAuth] 开始检查授权状态...");
    const e = await this.authService.checkAuth();
    return He.info(
      `[checkAuth] 结果: authorized=${e.authorized}, cancelled=${e.cancelled ?? !1}`
    ), e;
  }
  async startAuth(e) {
    He.info("[startAuth] 开始授权流程...");
    const t = await this.authService.startAuth(e);
    return He.info(
      `[startAuth] 结果: authorized=${t.authorized}, cancelled=${t.cancelled ?? !1}`
    ), t;
  }
  async scrapeItem(e, t, n) {
    He.info(`[scrapeItem] 收到采集请求: type=${t}, url=${e}`);
    const s = this.authService.getRequestHeaders(), i = { ...s, ...n.requestHeaders };
    switch (He.info(
      `[scrapeItem] 请求头数量: auth=${Object.keys(s).length}, context=${Object.keys(n.requestHeaders).length}`
    ), this.normalizeTaskType(t)) {
      case "blogger": {
        const o = await this.scraperService.scrapeBlogger(
          e,
          n.window,
          i,
          n.requestCaptcha,
          n.accountId,
          n.fields
        );
        return He.info(
          `[scrapeItem] 采集结果: status=${o.status}, hasData=${!!o.data}, errorCode=${o.errorCode ?? "NONE"}, details=${JSON.stringify(o.errorDetails ?? {})}, error=${o.errorMessage ?? "无"}`
        ), o;
      }
      default:
        return He.error(`[scrapeItem] 不支持的任务类型: ${t}`), {
          status: "error",
          data: null,
          errorCode: "UNSUPPORTED_TASK_TYPE",
          errorDetails: {
            source: "starmap.scrapeItem",
            retryable: !1
          },
          errorMessage: `不支持的任务类型: ${t}`
        };
    }
  }
  normalizeTaskType(e) {
    return e === "default" ? this.defaultTaskType : e;
  }
  getTaskTypes() {
    return [
      {
        id: "blogger",
        label: "星图主页",
        templateFileName: "douyin_blogger_template.xlsx",
        templateDownloadName: "星图主页链接模版.xlsx"
      }
      // 预留：博主视频（暂不实现）
      // {
      //   id: 'video',
      //   label: '博主视频',
      //   templateFileName: 'douyin_video_template.xlsx',
      //   templateDownloadName: '星图博主视频链接模版.xlsx',
      // },
    ];
  }
  dispose() {
    this.authService.dispose(), this.windowManager.closeAll();
  }
}
const Un = "https://www.douyin.com", jm = "https://www.iesdouyin.com/web/api/v2/user/info/", zm = (a) => `${Un}/user/${a}`, qm = 15e3, we = Y("DouyinAuth"), Hm = 3e3, Wm = [
  "login_time",
  "passport_assist_user",
  "publish_badge_show_info",
  "FOLLOW_LIVE_POINT_INFO"
], Vm = 2;
class Gm {
  constructor(e, t) {
    w(this, "windowManager");
    w(this, "partition");
    w(this, "resolved", !1);
    w(this, "pendingCheck", null);
    w(this, "pendingLogin", null);
    this.windowManager = e, this.partition = t, we.info(`[DouyinAuth] 初始化, partition=${t ?? "(默认)"}`);
  }
  /**
   * 检查授权状态
   *
   * 直接通过 Electron session.cookies API 读取 cookie，无需打开浏览器窗口。
   * 检查 persist:douyin 分区中是否存在仅登录后才出现的 cookie。
   * 相比 executeJavaScript 方案，不依赖页面加载，速度更快更可靠。
   */
  checkAuth() {
    return this.pendingCheck ? (we.info("[checkAuth] 已有进行中的检测，复用"), this.pendingCheck) : (this.pendingCheck = this.performCheck().finally(() => {
      this.pendingCheck = null;
    }), this.pendingCheck);
  }
  /**
   * 发起授权流程
   *
   * 打开 douyin.com 可见窗口，让用户扫码登录。
   * 通过定时轮询 session cookie 检测登录状态。
   * 无超时限制，窗口保持打开直到登录成功或用户手动关闭。
   */
  startAuth(e) {
    if (this.pendingLogin)
      return we.info("[startAuth] 已有进行中的授权，复用"), this.pendingLogin;
    const t = e == null ? void 0 : e.fingerprintProfile;
    return this.pendingLogin = this.performLogin(t, e == null ? void 0 : e.sessionPartition).finally(() => {
      this.pendingLogin = null;
    }), this.pendingLogin;
  }
  /**
   * 检查模式：直接通过 session API 读取 cookie，无需打开窗口。
   */
  async performCheck() {
    we.info("[performCheck] 直接读取 session cookie...");
    try {
      const e = this.getSession(), t = await this.checkLoginCookies(e);
      return we.info(
        `[performCheck] 检测结果: loggedIn=${t.loggedIn}, count=${t.count}, indicators=${JSON.stringify(t.indicators)}`
      ), { authorized: t.loggedIn };
    } catch (e) {
      return we.error("[performCheck] 检查失败:", e), { authorized: !1 };
    }
  }
  /**
   * 登录模式：打开窗口让用户扫码，通过定时轮询 + 页面事件检测登录状态。
   * 不设超时，窗口保持打开直到登录成功或用户手动关闭。
   */
  performLogin(e, t) {
    const n = t ?? this.partition;
    return we.info(
      `[performLogin] 开始授权登录..., hasFingerprint=${!!e}, partition=${n ?? "(默认)"}`
    ), new Promise((s) => {
      this.resolved = !1;
      let i = null;
      const o = (u) => {
        this.resolved || (this.resolved = !0, i && (clearInterval(i), i = null), s(
          e ? { ...u, fingerprintProfile: e, sessionPartition: n ?? null } : u
        ));
      }, r = this.windowManager.createWindow("douyin-auth", {
        url: Un,
        show: !0,
        width: 1e3,
        height: 700,
        partition: n,
        fingerprintProfile: e
      });
      we.info(`[performLogin] 窗口已创建, 加载URL: ${Un}`);
      const c = r.webContents.session;
      r.on("closed", () => {
        this.resolved || (we.info("[performLogin] 窗口被关闭, 授权未完成"), o({ authorized: !1, cancelled: !0 }));
      }), i = setInterval(() => {
        this.trySessionCheck(c, r, o);
      }, Hm), r.webContents.on("did-finish-load", () => {
        we.info(`页面加载完成: ${r.webContents.getURL()}`), this.trySessionCheck(c, r, o);
      }), r.webContents.on("did-navigate-in-page", (u, l) => {
        we.info(`SPA 导航: ${l}`), this.trySessionCheck(c, r, o);
      });
    });
  }
  /**
   * 通过 Electron session.cookies.get() API 检查登录 cookie。
   * 直接从 session store 读取，不依赖页面 JS 环境。
   */
  async checkLoginCookies(e) {
    const t = await e.cookies.get({ domain: "douyin.com" }), n = {};
    let s = 0;
    for (const i of Wm) {
      const o = t.some((r) => r.name === i);
      n[i] = o, o && s++;
    }
    return we.info(
      `[checkLoginCookies] 共 ${t.length} 个 cookie, 登录指标: ${JSON.stringify(n)}, count=${s}`
    ), {
      loggedIn: s >= Vm,
      count: s,
      indicators: n
    };
  }
  /**
   * 在登录模式下检查 session cookie 并处理结果。
   */
  async trySessionCheck(e, t, n) {
    if (!(this.resolved || t.isDestroyed()))
      try {
        (await this.checkLoginCookies(e)).loggedIn && (we.info("抖音登录成功，持久化 cookie..."), await this.persistSessionCookies(e), n({ authorized: !0 }), this.windowManager.closeWindow("douyin-auth"));
      } catch (s) {
        we.error("登录检测失败:", s);
      }
  }
  /** 获取当前分区的 Electron Session */
  getSession() {
    return this.partition ? Pn.fromPartition(this.partition) : Pn.defaultSession;
  }
  /**
   * 将 session cookie（无过期时间）转为持久化 cookie。
   *
   * Electron 的 persist: 分区只持久化有 Expires/Max-Age 的 cookie。
   * 没有过期时间的 session cookie 在最后一个使用该分区的窗口关闭时就被清除。
   * 这里在登录成功后手动给 session cookie 设置 30 天过期时间，
   * 确保关闭窗口或重启应用后登录态仍然有效。
   */
  async persistSessionCookies(e) {
    var t;
    try {
      const n = await e.cookies.get({ domain: "douyin.com" }), s = n.filter((o) => !o.expirationDate);
      if (we.info(
        `[persistCookies] 共 ${n.length} 个 cookie, 其中 ${s.length} 个为 session cookie`
      ), s.length === 0) return;
      const i = Math.floor(Date.now() / 1e3) + 86400 * 30;
      for (const o of s) {
        const c = `https://${((t = o.domain) == null ? void 0 : t.replace(/^\./, "")) || "www.douyin.com"}${o.path || "/"}`;
        await e.cookies.set({
          url: c,
          name: o.name,
          value: o.value,
          domain: o.domain,
          path: o.path,
          secure: o.secure,
          httpOnly: o.httpOnly,
          sameSite: o.sameSite,
          expirationDate: i
        });
      }
      await e.cookies.flushStore(), we.info(`[persistCookies] 已将 ${s.length} 个 session cookie 设为 30 天过期`);
    } catch (n) {
      we.error("[persistCookies] 持久化 cookie 失败:", n);
    }
  }
  /** 销毁资源 */
  dispose() {
    this.windowManager.closeWindow("douyin-auth");
  }
}
const V = Y("DouyinScraper"), Jm = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", Km = 12e3, Xm = 18e4, Ym = {
  nickname: ["昵称"],
  avatar: ["头像"],
  url: ["主页链接"],
  fansCount: ["粉丝数"],
  gender: ["性别"],
  location: ["省份", "城市", "IP属地"],
  priceJson: ["商品橱窗", "橱窗商品数"],
  interactRate: ["平均点赞量", "平均评论量", "平均分享量", "平均收藏量"]
}, Qm = ["性别", "省份", "城市", "IP属地", "gender", "location"], Zm = [
  "视频样本数",
  "最低播放量",
  "最高播放量",
  "平均播放量",
  "最低点赞量",
  "最高点赞量",
  "平均点赞量",
  "最低评论量",
  "最高评论量",
  "平均评论量",
  "最低分享量",
  "最高分享量",
  "平均分享量",
  "最低收藏量",
  "最高收藏量",
  "平均收藏量",
  "interactRate"
], pr = /* @__PURE__ */ new Set([2155, 2154, 9999, 4444006]);
function ef(a) {
  if (a.verify_type !== void 0 || a.fp !== void 0 && typeof a.fp == "string" || (typeof a.error_code == "number" ? a.error_code : typeof a.errorCode == "number" ? a.errorCode : null) === 8) return !0;
  const t = typeof a.status_code == "number" ? a.status_code : typeof a.statusCode == "number" ? a.statusCode : null;
  return !!(t !== null && pr.has(t));
}
class tf {
  /**
   * 抓取抖音博主主页数据
   *
   * 采集流程：
   * 1. 解析 URL → 提取 sec_uid
   * 2. 调用 iesdouyin API → 基础数据（昵称、粉丝数、作品数等）
   * 3. 在 BrowserWindow 中加载主页，通过 CDP 拦截页面 API 响应
   *    → 用户 profile（性别、省份、城市、IP属地）+ 视频列表（播放/点赞/评论数）
   * 4. 组装数据 → 返回扁平对象
   */
  async scrapeBlogger(e, t, n, s, i) {
    V.info(`[scrapeBlogger] ===== 开始采集 ===== url=${e}`);
    const o = Date.now();
    let r = !1;
    for (; ; )
      try {
        V.info("[scrapeBlogger] 步骤1: 解析抖音链接...");
        const c = await this.extractSecUid(e);
        if (!c)
          return V.error(`[scrapeBlogger] 步骤1失败: 无法提取 sec_uid, url=${e}`), {
            status: "error",
            data: null,
            errorCode: "INVALID_TARGET_URL",
            errorDetails: {
              source: "douyin.extractSecUid",
              url: e,
              retryable: !1
            },
            errorMessage: `无效的抖音链接或无法提取用户ID: ${e}`
          };
        V.info(`[scrapeBlogger] 步骤1完成: sec_uid=${c}`);
        const u = Se(i, Qm) || Se(i, Zm);
        V.info(
          `[scrapeBlogger] 步骤2+3: 并行执行 iesdouyin API${u ? " 和 CDP 页面拦截" : ""}...`
        );
        const [l, p] = await Promise.all([
          this.fetchUserInfo(c),
          u ? this.interceptPageApiData(c, t) : Promise.resolve({ user: null, videos: [], captchaDetected: !1 })
        ]), d = l.userInfo;
        if (p.captchaDetected) {
          if (!r && n && !t.isDestroyed()) {
            if (r = !0, V.warn("[scrapeBlogger] CDP 探测到字节 verify 挑战，调上层 captcha handler"), (await n({
              window: t,
              platform: "STARMAP",
              accountId: s,
              reason: "douyin-cdp-verify-challenge",
              urlPatterns: ["captcha", "verify", "security-verification"],
              timeoutMs: Xm
            })).resolved) {
              V.info("[scrapeBlogger] 滑块已通过，重试整个采集");
              continue;
            }
            return {
              status: "error",
              data: null,
              errorCode: "CAPTCHA_UNRESOLVED",
              errorDetails: {
                source: "douyin.cdp",
                apiStatusCode: 8,
                secUid: c,
                url: e,
                retryable: !0
              },
              errorMessage: "douyin verify-challenge 滑块未通过"
            };
          }
          return {
            status: "error",
            data: null,
            errorCode: "RISK_CONTROL",
            errorDetails: {
              source: "douyin.cdp",
              apiStatusCode: 8,
              secUid: c,
              url: e,
              retryable: !0
            },
            errorMessage: "douyin verify-challenge（无 captcha 通道或重试后仍失败）"
          };
        }
        if (!d)
          return V.error(
            `[scrapeBlogger] iesdouyin API 未返回用户信息: errorCode=${l.errorCode ?? "API_ERROR"}, httpStatusCode=${l.httpStatusCode ?? "unknown"}, apiStatusCode=${l.apiStatusCode ?? "unknown"}, sec_uid=${c}`
          ), {
            status: "error",
            data: null,
            errorCode: l.errorCode ?? "API_ERROR",
            errorDetails: {
              source: "douyin.iesUserInfo",
              httpStatusCode: l.httpStatusCode,
              apiStatusCode: l.apiStatusCode,
              secUid: c,
              url: e,
              retryable: l.retryable ?? !0
            },
            errorMessage: l.errorMessage ?? `无法获取用户信息（可能用户不存在或 API 不可达）: ${e}`
          };
        V.info(
          `[scrapeBlogger] iesdouyin: nickname=${d.nickname ?? ""}, followers=${d.mplatform_followers_count ?? d.follower_count ?? 0}`
        ), p.user ? V.info(
          `[scrapeBlogger] CDP: gender=${p.user.gender ?? ""}, province=${p.user.province ?? ""}, city=${p.user.city ?? ""}, ip=${p.user.ipLocation ?? ""}, 视频=${p.videos.length}个`
        ) : V.warn(`[scrapeBlogger] CDP: 未获取到用户详情, 视频=${p.videos.length}个`), V.info("[scrapeBlogger] 步骤4: 组装数据...");
        const h = en(
          this.assembleData(c, d, p.user, p.videos),
          i,
          Ym
        ), m = Date.now() - o;
        return V.info(
          `[scrapeBlogger] ===== 采集完成 ===== 字段数=${Object.keys(h).length}, 耗时=${m}ms`
        ), { status: "success", data: h };
      } catch (c) {
        const u = Date.now() - o;
        return V.error(`[scrapeBlogger] ===== 采集异常 ===== url=${e}, 耗时=${u}ms`, c), {
          status: "error",
          data: null,
          errorCode: "API_ERROR",
          errorDetails: {
            source: "douyin.scrapeBlogger",
            url: e,
            retryable: !0
          },
          errorMessage: c instanceof Error ? c.message : String(c)
        };
      }
  }
  // ========================================================================
  //  数据获取方法
  // ========================================================================
  /** 从输入文本中提取 sec_uid */
  async extractSecUid(e) {
    return Ha.extractDouyinSecUid(e);
  }
  /** 调用 iesdouyin API 获取用户信息 */
  async fetchUserInfo(e) {
    try {
      const t = `${jm}?sec_uid=${e}`, n = await gt.request({
        url: t,
        method: "GET",
        headers: {
          "User-Agent": Jm,
          Accept: "application/json"
        },
        timeout: qm
      }), s = JSON.parse(n.data), i = s.status_code;
      return V.info(
        `[fetchUserInfo] 响应: httpStatusCode=${n.statusCode}, apiStatusCode=${i ?? "unknown"}, hasUserInfo=${!!s.user_info}, sec_uid=${e}`
      ), n.statusCode === 401 || n.statusCode === 403 ? {
        userInfo: null,
        errorCode: "AUTH_EXPIRED",
        errorMessage: `iesdouyin 鉴权失败: httpStatusCode=${n.statusCode}`,
        httpStatusCode: n.statusCode,
        apiStatusCode: i,
        retryable: !0
      } : n.statusCode === 404 ? {
        userInfo: null,
        errorCode: "TARGET_NOT_FOUND",
        errorMessage: `iesdouyin 用户不存在: httpStatusCode=${n.statusCode}`,
        httpStatusCode: n.statusCode,
        apiStatusCode: i,
        retryable: !1
      } : n.statusCode < 200 || n.statusCode >= 300 ? {
        userInfo: null,
        errorCode: "API_ERROR",
        errorMessage: `iesdouyin HTTP 异常: httpStatusCode=${n.statusCode}`,
        httpStatusCode: n.statusCode,
        apiStatusCode: i,
        retryable: !0
      } : i !== void 0 && pr.has(i) ? {
        userInfo: null,
        errorCode: "RISK_CONTROL",
        errorMessage: `iesdouyin 命中字节风控码: apiStatusCode=${i}`,
        httpStatusCode: n.statusCode,
        apiStatusCode: i,
        retryable: !0
      } : s.user_info ? {
        userInfo: s.user_info,
        httpStatusCode: n.statusCode,
        apiStatusCode: i
      } : (V.error(
        `[fetchUserInfo] API 未返回 user_info, sec_uid=${e}, httpStatusCode=${n.statusCode}, apiStatusCode=${i ?? "unknown"}`
      ), {
        userInfo: null,
        errorCode: i === 0 ? "TARGET_NOT_FOUND" : "API_ERROR",
        errorMessage: `iesdouyin API 未返回用户信息: status_code=${i ?? "unknown"}`,
        httpStatusCode: n.statusCode,
        apiStatusCode: i,
        retryable: i !== 0
      });
    } catch (t) {
      return V.error(`[fetchUserInfo] 请求失败, sec_uid=${e}`, t), {
        userInfo: null,
        errorCode: "API_ERROR",
        errorMessage: t instanceof Error ? t.message : String(t),
        retryable: !0
      };
    }
  }
  /**
   * 通过 CDP Fetch domain 在协议层拦截页面 API 响应。
   *
   * 加载 douyin.com/user/{secUid} 后，页面会自动调用：
   * - /aweme/v1/web/user/profile/other → 用户详情（性别、省份、城市、IP属地）
   * - /aweme/v1/web/aweme/post → 视频列表（播放、点赞、评论、分享、收藏数）
   *
   * 使用 Fetch.enable + requestStage:'Response' 在响应到达时暂停，
   * 通过 Fetch.getResponseBody 读取响应体，再 continueResponse 放行。
   * 这比 Network domain 更可靠，因为响应体在暂停状态下一定可用。
   */
  async interceptPageApiData(e, t) {
    if (t.isDestroyed()) return { user: null, videos: [], captchaDetected: !1 };
    const n = zm(e);
    V.info(`[interceptPageApiData] 通过 Fetch domain 拦截: ${n}`);
    const s = t.webContents.debugger;
    try {
      s.attach("1.3");
    } catch (g) {
      return V.warn("[interceptPageApiData] 无法附加 debugger:", g), { user: null, videos: [], captchaDetected: !1 };
    }
    let i = null, o = [], r = !1, c = !1, u = !1, l = null, p = null;
    const d = /* @__PURE__ */ new Set(), h = (g) => (d.add(g), g.catch(() => {
    }).finally(() => d.delete(g)), g), m = (g, v, y) => {
      if (v !== "Fetch.requestPaused") return;
      const b = y, S = b.requestId, C = b.request, _ = (C == null ? void 0 : C.url) || "", k = b.responseStatusCode;
      if (k === void 0) {
        h(s.sendCommand("Fetch.continueRequest", { requestId: S }));
        return;
      }
      const P = _.includes("/user/profile/other"), T = _.includes("/aweme/post");
      if (!P && !T) {
        this.continueFetchResponse(s, S, h);
        return;
      }
      V.info(
        `[interceptPageApiData] 捕获 ${P ? "user profile" : "video list"} 响应 (status=${k})`
      ), h(
        s.sendCommand("Fetch.getResponseBody", { requestId: S }).then((L) => {
          const z = L, G = this.decodeResponseBody(z.body, z.base64Encoded);
          if (!G) {
            V.warn(`[interceptPageApiData] ${P ? "user" : "video"} 响应体为空`), P && (c = !0), f();
            return;
          }
          try {
            const O = JSON.parse(G);
            if (ef(O)) {
              V.warn(
                `[interceptPageApiData] 探测到字节 verify 挑战 (${P ? "user" : "video"} 响应), bodyLen=${G.length}`
              ), r = !0, l && (clearTimeout(l), l = null), p == null || p();
              return;
            }
            P && !c && (i = this.parseWebApiUser(O), c = !0, i ? V.info(
              `[interceptPageApiData] 用户: ${i.nickname}, gender=${i.gender}, province=${i.province}, ip=${i.ipLocation}`
            ) : V.warn("[interceptPageApiData] user profile 解析返回 null")), T && !u && (o = this.parseWebApiVideos(O), u = !0, V.info(`[interceptPageApiData] 视频: ${o.length} 个`));
          } catch (O) {
            V.warn(
              `[interceptPageApiData] ${P ? "user" : "video"} JSON 解析失败 (bodyLen=${G.length}):`,
              O
            ), P && (c = !0);
          }
          f();
        }).catch((L) => {
          V.warn("[interceptPageApiData] getResponseBody 失败:", L), P && (c = !0), f();
        }).finally(() => {
          this.continueFetchResponse(s, S, h);
        })
      );
    }, f = () => {
      c && u && (l && (clearTimeout(l), l = null), p == null || p());
    };
    try {
      const g = new Promise((v) => {
        p = v, l = setTimeout(() => {
          V.info(`[interceptPageApiData] 超时, gotUser=${c}, gotVideo=${u}`), v();
        }, Km);
      });
      s.on("message", m), await s.sendCommand("Fetch.enable", {
        patterns: [
          { urlPattern: "*user/profile/other*", requestStage: "Response" },
          { urlPattern: "*aweme/post*", requestStage: "Response" }
        ]
      }), t.webContents.loadURL(n), await g;
    } catch (g) {
      V.error("[interceptPageApiData] Fetch domain 拦截失败:", g);
    } finally {
      l && (clearTimeout(l), l = null);
      try {
        s.off("message", m);
      } catch {
      }
      d.size > 0 && await Promise.allSettled(Array.from(d));
      try {
        s.detach();
      } catch {
      }
    }
    return { user: i, videos: o, captchaDetected: r };
  }
  /** 解码 CDP 响应体（支持 base64 + brotli/gzip 自动解压） */
  decodeResponseBody(e, t) {
    if (!e) return "";
    if (!t) return e;
    const n = Buffer.from(e, "base64"), s = n.toString("utf-8");
    if (s.startsWith("{") || s.startsWith("[")) return s;
    try {
      return Lr(n).toString("utf-8");
    } catch {
    }
    try {
      return Nr(n).toString("utf-8");
    } catch {
    }
    return s;
  }
  /** 放行 Fetch 暂停的响应（兼容不同 CDP 版本） */
  continueFetchResponse(e, t, n) {
    const s = n ?? ((i) => i);
    s(
      e.sendCommand("Fetch.continueResponse", { requestId: t }).catch(
        () => s(
          e.sendCommand("Fetch.continueRequest", { requestId: t }).catch(() => {
          })
        )
      )
    );
  }
  /** 解析 web API 用户 profile 响应 */
  parseWebApiUser(e) {
    const t = e.user;
    return !t || !t.nickname ? null : {
      uid: String(t.uid ?? ""),
      secUid: String(t.sec_uid ?? ""),
      nickname: String(t.nickname ?? ""),
      uniqueId: String(t.unique_id ?? ""),
      gender: Number(t.gender ?? 0),
      province: String(t.province ?? ""),
      city: String(t.city ?? ""),
      ipLocation: String(t.ip_location ?? ""),
      birthday: String(t.birthday ?? ""),
      schoolName: String(t.school_name ?? ""),
      followerCount: Number(t.follower_count ?? t.mplatform_followers_count ?? 0),
      followingCount: Number(t.following_count ?? 0),
      awemeCount: Number(t.aweme_count ?? 0),
      totalFavorited: Number(t.total_favorited ?? 0),
      signature: String(t.signature ?? "")
    };
  }
  /** 解析 web API 视频列表响应 */
  parseWebApiVideos(e) {
    const t = e.aweme_list;
    return Array.isArray(t) ? t.map((n) => {
      const s = n.statistics;
      return {
        aweme_id: String(n.aweme_id ?? ""),
        desc: String(n.desc ?? ""),
        create_time: Number(n.create_time ?? 0),
        duration: Number(n.duration ?? 0),
        statistics: s ? {
          play_count: Number(s.play_count ?? 0),
          digg_count: Number(s.digg_count ?? 0),
          comment_count: Number(s.comment_count ?? 0),
          share_count: Number(s.share_count ?? 0),
          collect_count: Number(s.collect_count ?? 0),
          download_count: Number(s.download_count ?? 0)
        } : void 0
      };
    }) : [];
  }
  // ========================================================================
  //  数据组装方法
  // ========================================================================
  /** 安全地将值转为数字 */
  toNum(e) {
    if (e == null) return 0;
    const t = Number(e);
    return Number.isNaN(t) ? 0 : t;
  }
  /** 组装最终数据对象 */
  assembleData(e, t, n, s) {
    const i = `https://www.douyin.com/user/${e}`;
    return {
      // ── 基础信息 ──
      ...this.assembleBaseInfo(t, n, i),
      // ── 核心数据 ──
      ...this.assembleCoreStats(t, n),
      // ── 认证信息 ──
      ...this.assembleVerification(t),
      // ── 地理信息（优先 web API 数据） ──
      ...this.assembleGeoInfo(n),
      // ── 商业信息 ──
      ...this.assembleCommerceInfo(t),
      // ── 视频统计 ──
      ...this.assembleVideoStats(s),
      // ── 备注 ──
      备注: ""
    };
  }
  /** 基础信息 */
  assembleBaseInfo(e, t, n) {
    var i, o;
    const s = ((o = (i = e.avatar_medium) == null ? void 0 : i.url_list) == null ? void 0 : o[0]) ?? "";
    return {
      主页链接: n,
      昵称: e.nickname ?? (t == null ? void 0 : t.nickname) ?? "",
      头像: s,
      抖音号: e.unique_id || e.short_id || (t == null ? void 0 : t.uniqueId) || "",
      个人简介: e.signature ?? (t == null ? void 0 : t.signature) ?? ""
    };
  }
  /** 核心数据 */
  assembleCoreStats(e, t) {
    const n = e.mplatform_followers_count ?? e.follower_count ?? (t == null ? void 0 : t.followerCount) ?? 0;
    return {
      粉丝数: this.toNum(n),
      关注数: this.toNum(e.following_count ?? (t == null ? void 0 : t.followingCount)),
      获赞数: this.toNum(e.total_favorited ?? (t == null ? void 0 : t.totalFavorited)),
      发布作品数: this.toNum(e.aweme_count ?? (t == null ? void 0 : t.awemeCount))
    };
  }
  /** 认证信息 */
  assembleVerification(e) {
    const t = this.toNum(e.verification_type);
    let n = "未认证";
    return t === 1 && (n = "个人认证"), t === 2 && (n = "企业认证"), {
      认证类型: n,
      认证描述: e.custom_verify ?? e.enterprise_verify_reason ?? ""
    };
  }
  /** 地理信息（来自 web API） */
  assembleGeoInfo(e) {
    const t = this.toNum(e == null ? void 0 : e.gender);
    return {
      性别: t === 1 ? "男" : t === 2 ? "女" : "未知",
      省份: (e == null ? void 0 : e.province) ?? "",
      城市: (e == null ? void 0 : e.city) ?? "",
      IP属地: (e == null ? void 0 : e.ipLocation) ?? ""
    };
  }
  /** 商业信息 */
  assembleCommerceInfo(e) {
    var s, i;
    const t = (s = e.card_entries) == null ? void 0 : s.find(
      (o) => {
        var r, c;
        return ((r = o.title) == null ? void 0 : r.includes("商品")) || ((c = o.title) == null ? void 0 : c.includes("橱窗"));
      }
    );
    let n = 0;
    if (t != null && t.card_data)
      try {
        const o = JSON.parse(t.card_data);
        n = this.toNum(o.product_count);
      } catch {
        const o = (i = t.sub_title) == null ? void 0 : i.match(/(\d+)/);
        o && (n = this.toNum(o[1]));
      }
    return {
      商品橱窗: t ? "已开通" : "未开通",
      橱窗商品数: n
    };
  }
  /** 视频统计 */
  assembleVideoStats(e) {
    if (e.length === 0)
      return {
        视频样本数: 0,
        最低播放量: 0,
        最高播放量: 0,
        平均播放量: 0,
        最低点赞量: 0,
        最高点赞量: 0,
        平均点赞量: 0,
        最低评论量: 0,
        最高评论量: 0,
        平均评论量: 0,
        最低分享量: 0,
        最高分享量: 0,
        平均分享量: 0,
        最低收藏量: 0,
        最高收藏量: 0,
        平均收藏量: 0
      };
    const t = e.map((c) => {
      var u;
      return this.toNum((u = c.statistics) == null ? void 0 : u.play_count);
    }), n = e.map((c) => {
      var u;
      return this.toNum((u = c.statistics) == null ? void 0 : u.digg_count);
    }), s = e.map((c) => {
      var u;
      return this.toNum((u = c.statistics) == null ? void 0 : u.comment_count);
    }), i = e.map((c) => {
      var u;
      return this.toNum((u = c.statistics) == null ? void 0 : u.share_count);
    }), o = e.map((c) => {
      var u;
      return this.toNum((u = c.statistics) == null ? void 0 : u.collect_count);
    }), r = (c) => Math.round(c.reduce((u, l) => u + l, 0) / c.length);
    return {
      视频样本数: e.length,
      最低播放量: Math.min(...t),
      最高播放量: Math.max(...t),
      平均播放量: r(t),
      最低点赞量: Math.min(...n),
      最高点赞量: Math.max(...n),
      平均点赞量: r(n),
      最低评论量: Math.min(...s),
      最高评论量: Math.max(...s),
      平均评论量: r(s),
      最低分享量: Math.min(...i),
      最高分享量: Math.max(...i),
      平均分享量: r(i),
      最低收藏量: Math.min(...o),
      最高收藏量: Math.max(...o),
      平均收藏量: r(o)
    };
  }
}
const Xe = Y("DouyinPlugin"), ka = "persist:douyin";
class nf {
  constructor() {
    w(this, "id", "douyin");
    w(this, "name", "抖音");
    // 抖音直采 → 抖音星图平台口径下的博主数据来源
    w(this, "platforms", ["STARMAP"]);
    w(this, "defaultTaskType", "blogger");
    w(this, "baseUrl", Un);
    w(this, "sessionPartition", ka);
    /**
     * 字节风控兜底（同 starmap）。
     *
     * 插件内部 `scrapeBlogger` 通过 CDP 拦截 verify_type/fp/error_code:8/status_code 风控码探测，
     * 这里 dispatcher 兜底再覆盖 errorMessage 残留场景。
     */
    w(this, "riskCodes", [
      {
        pattern: /\b(2155|2154|9999|4444006)\b|verify-challenge/,
        reason: "bytedance-risk-code",
        timeoutMs: 18e4
      }
    ]);
    w(this, "authService");
    w(this, "scraperService");
    w(this, "windowManager");
    this.windowManager = new _t(), this.authService = new Gm(this.windowManager, ka), this.scraperService = new tf(), Xe.info(`[DouyinPlugin] 插件已初始化, partition=${ka}`);
  }
  async checkAuth() {
    Xe.info("[checkAuth] 开始检查授权状态...");
    const e = await this.authService.checkAuth();
    return Xe.info(
      `[checkAuth] 结果: authorized=${e.authorized}, cancelled=${e.cancelled ?? !1}`
    ), e;
  }
  async startAuth(e) {
    Xe.info("[startAuth] 开始授权流程...");
    const t = await this.authService.startAuth(e);
    return Xe.info(
      `[startAuth] 结果: authorized=${t.authorized}, cancelled=${t.cancelled ?? !1}`
    ), t;
  }
  async scrapeItem(e, t, n) {
    switch (Xe.info(`[scrapeItem] 收到采集请求: type=${t}, url=${e}`), this.normalizeTaskType(t)) {
      case "blogger": {
        const s = await this.scraperService.scrapeBlogger(
          e,
          n.window,
          n.requestCaptcha,
          n.accountId,
          n.fields
        );
        return Xe.info(
          `[scrapeItem] 采集结果: status=${s.status}, hasData=${!!s.data}, errorCode=${s.errorCode ?? "NONE"}, details=${JSON.stringify(s.errorDetails ?? {})}, error=${s.errorMessage ?? "无"}`
        ), s;
      }
      default:
        return Xe.error(`[scrapeItem] 不支持的任务类型: ${t}`), {
          status: "error",
          data: null,
          errorCode: "UNSUPPORTED_TASK_TYPE",
          errorDetails: {
            source: "douyin.scrapeItem",
            retryable: !1
          },
          errorMessage: `不支持的任务类型: ${t}`
        };
    }
  }
  normalizeTaskType(e) {
    return e === "default" ? this.defaultTaskType : e;
  }
  getTaskTypes() {
    return [
      {
        id: "blogger",
        label: "抖音主页",
        templateFileName: "douyin_direct_blogger_template.xlsx",
        templateDownloadName: "抖音主页链接模版.xlsx"
      }
    ];
  }
  dispose() {
    this.authService.dispose(), this.windowManager.closeAll();
  }
}
const $i = Y("ExcelExport"), dr = {
  fill: { fgColor: { rgb: "E8D5F5" } },
  font: { bold: !0 },
  alignment: { horizontal: "center", vertical: "center", wrapText: !0 },
  border: {
    top: { style: "medium", color: { rgb: "000000" } },
    bottom: { style: "medium", color: { rgb: "000000" } },
    left: { style: "medium", color: { rgb: "000000" } },
    right: { style: "medium", color: { rgb: "000000" } }
  }
}, mr = {
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "DDDDDD" } },
    bottom: { style: "thin", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "DDDDDD" } },
    right: { style: "thin", color: { rgb: "DDDDDD" } }
  }
}, fr = {
  alignment: { horizontal: "left", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "DDDDDD" } },
    bottom: { style: "thin", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "DDDDDD" } },
    right: { style: "thin", color: { rgb: "DDDDDD" } }
  }
};
function Wa(a) {
  return a.includes("链接") || a.includes("link") || a.includes("url");
}
const mf = 8, Di = 25;
function gs(a) {
  let e = 0;
  for (const t of a)
    e += t.charCodeAt(0) > 127 ? 2 : 1;
  return e;
}
function hr(a, e) {
  const t = Math.ceil(a / 2), n = Math.min(e, Di), s = Math.max(t, n);
  return Math.max(mf, Math.min(s, Di));
}
function gr(a, e, t = 20) {
  const n = new Array(e.length).fill(0), s = a.slice(0, t);
  for (const i of s)
    for (let o = 0; o < e.length; o++) {
      const r = i[e[o]];
      if (r != null) {
        const c = gs(String(r));
        c > n[o] && (n[o] = c);
      }
    }
  return n;
}
function pgyXmlEscape(a) {
  return String(a).replace(/[&<>"']/g, (e) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[e]);
}
function pgyNextRelId(a) {
  let e = 1;
  for (const t of a.matchAll(/Id="rId(\d+)"/g))
    e = Math.max(e, Number(t[1]) + 1);
  return `rId${e}`;
}
function pgyAddContentTypes(a) {
  return a.includes('Extension="png"') || (a = a.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>')), a.includes('/xl/drawings/drawing1.xml') || (a = a.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')), a;
}
function pgySheetRelXml(a, e) {
  if (!a)
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${e}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  return a.includes('Target="../drawings/drawing1.xml"') ? a : a.replace("</Relationships>", `<Relationship Id="${e}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
}
function pgyPatchSheetXml(a, e, t) {
  a.includes("xmlns:r=") || (a = a.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '));
  for (const n of t) {
    const s = n.row + 1, i = new RegExp(`<row([^>]*\\sr="${s}"[^>]*)>`);
    a = a.replace(i, (o, r) => {
      let c = r.replace(/\sht="[^"]*"/g, "").replace(/\scustomHeight="[^"]*"/g, "");
      return `<row${c} ht="112" customHeight="1">`;
    });
  }
  return a.includes("<drawing ") ? a : a.replace("</worksheet>", `<drawing r:id="${e}"/></worksheet>`);
}
function pgyDrawingXml(a) {
  const e = a.map((t, n) => {
    const s = `rId${n + 1}`;
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${t.col}</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>${t.row}</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from><xdr:to><xdr:col>${t.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${t.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${n + 2}" name="${pgyXmlEscape(t.name)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${s}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${e}</xdr:wsDr>`;
}
function pgyDrawingRelXml(a) {
  const e = a.map((t, n) => `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${pgyXmlEscape(t.media)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${e}</Relationships>`;
}
function pgyDataWithoutImageText(a, e) {
  const t = Array.isArray(e) ? e : [];
  const n = new Set((Array.isArray(a) ? a : []).filter((s) => s && PGY_IMAGE_FIELDS.has(s.key)).map((s) => s.key));
  return n.size === 0 ? t : t.map((s) => {
    const i = { ...s };
    for (const o of n)
      typeof i[o] == "string" && i[o] && kt(i[o]) && (i[o] = "__PGY_IMAGE_CELL_BLANK__");
    return i;
  });
}
async function pgyEmbedImagesInWorkbook(a, e, t) {
  const n = [];
  for (let s = 0; s < e.length; s++) {
    const i = e[s];
    if (!PGY_IMAGE_FIELDS.has(i.key)) continue;
    for (let o = 0; o < t.length; o++) {
      const r = t[o][i.key];
      typeof r == "string" && r && kt(r) && n.push({ path: r, col: s, row: o + 2, name: `${i.label || i.key}-${o + 1}` });
    }
  }
  if (n.length === 0) return;
  const s = await JSZip.loadAsync(Qi(a));
  n.forEach((o, r) => {
    o.media = `pgy_chart_${r + 1}.png`, s.file(`xl/media/${o.media}`, Qi(o.path));
  });
  let i = await s.file("xl/worksheets/sheet1.xml").async("string");
  const o = s.file("xl/worksheets/_rels/sheet1.xml.rels"), r = o ? await o.async("string") : "";
  const c = r.match(/Id="([^"]+)"[^>]*Target="\.\.\/drawings\/drawing1\.xml"/), u = c ? c[1] : pgyNextRelId(r);
  s.file("[Content_Types].xml", pgyAddContentTypes(await s.file("[Content_Types].xml").async("string"))), s.file("xl/worksheets/sheet1.xml", pgyPatchSheetXml(i, u, n)), s.file("xl/worksheets/_rels/sheet1.xml.rels", pgySheetRelXml(r, u)), s.file("xl/drawings/drawing1.xml", pgyDrawingXml(n)), s.file("xl/drawings/_rels/drawing1.xml.rels", pgyDrawingRelXml(n)), Zi(a, await s.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
async function ff(a) {
  const { canceled: e, filePath: t } = await Ki.showSaveDialog({
    defaultPath: a.fileName,
    filters: [{ name: "Excel", extensions: ["xlsx"] }]
  });
  if (e || !t)
    return { success: !1 };
  try {
    const i = a.data ?? [], n = a.mode === "two-row" ? gf(a.headers ?? [], pgyDataWithoutImageText(a.headers ?? [], i)) : hf(i), s = Ve.utils.book_new();
    return Ve.utils.book_append_sheet(s, n, "Sheet1"), Ve.writeFile(s, t), a.mode === "two-row" && await pgyEmbedImagesInWorkbook(t, a.headers ?? [], i), $i.info(`Excel 已导出: ${t}`), { success: !0, filePath: t };
  } catch (n) {
    throw $i.error("Excel 导出失败:", n), n;
  }
}
function hf(a) {
  const e = a.map((n) => {
    const s = {};
    for (const [i, o] of Object.entries(n))
      s[i] = o == null || o === "" ? "-" : o;
    return s;
  }), t = Ve.utils.json_to_sheet(e);
  if (xf(t), a.length > 0) {
    const n = Object.keys(a[0]), s = gr(a, n);
    t["!cols"] = n.map((i, o) => {
      const r = gs(i);
      return { wch: hr(r, s[o]) };
    });
  }
  return t;
}
function gf(a, e) {
  const t = [];
  let n = "", s = 0;
  for (let f = 0; f < a.length; f++)
    a[f].group !== n && (f > 0 && t.push({ group: n, startCol: s, endCol: f - 1 }), n = a[f].group, s = f);
  a.length > 0 && t.push({ group: n, startCol: s, endCol: a.length - 1 });
  const i = new Array(a.length).fill(null), o = new Array(a.length).fill(null), r = [];
  for (const f of t) {
    const g = f.startCol === f.endCol;
    if (g && f.group === a[f.startCol].label)
      i[f.startCol] = f.group, r.push({ s: { r: 0, c: f.startCol }, e: { r: 1, c: f.startCol } });
    else if (g)
      i[f.startCol] = f.group, o[f.startCol] = a[f.startCol].label;
    else {
      i[f.startCol] = f.group, r.push({ s: { r: 0, c: f.startCol }, e: { r: 0, c: f.endCol } });
      for (let y = f.startCol; y <= f.endCol; y++)
        o[y] = a[y].label;
    }
  }
  const c = [i, o];
  for (const f of e) {
    const g = a.map((v) => {
      const y = f[v.key];
      return y === "__PGY_IMAGE_CELL_BLANK__" ? "" : y == null || y === "" ? "-" : typeof y == "number" || typeof y == "boolean" ? y : String(y);
    });
    c.push(g);
  }
  const u = Ve.utils.aoa_to_sheet(c);
  u["!merges"] = r;
  const l = a.length, p = c.length, d = new Set(
    a.map((f, g) => Wa(f.label) || Wa(f.key) ? g : -1).filter((f) => f >= 0)
  );
  for (let f = 0; f < p; f++)
    for (let g = 0; g < l; g++) {
      const v = Ve.utils.encode_cell({ r: f, c: g });
      u[v] || (u[v] = { v: "", t: "s" }), f <= 1 ? u[v].s = dr : u[v].s = d.has(g) ? fr : mr;
    }
  const h = a.map((f) => f.key), m = gr(e, h);
  return u["!rows"] = c.map((f, g) => g < 2 ? { hpx: 28 } : a.some((v, y) => PGY_IMAGE_FIELDS.has(v.key) && f[y] && f[y] !== "-") ? { hpx: 112 } : { hpx: 22 }), u["!cols"] = a.map((f, g) => {
    if (PGY_IMAGE_FIELDS.has(f.key))
      return { wch: 24 };
    const v = gs(f.label);
    return { wch: hr(v, m[g]) };
  }), u;
}
function xf(a) {
  const e = a["!ref"];
  if (!e) return;
  const t = Ve.utils.decode_range(e), n = /* @__PURE__ */ new Set();
  for (let s = t.s.c; s <= t.e.c; s++) {
    const i = Ve.utils.encode_cell({ r: 0, c: s }), o = a[i];
    o != null && o.v && Wa(String(o.v)) && n.add(s);
  }
  for (let s = t.s.r; s <= t.e.r; s++)
    for (let i = t.s.c; i <= t.e.c; i++) {
      const o = Ve.utils.encode_cell({ r: s, c: i });
      a[o] || (a[o] = { v: "", t: "s" }), s === 0 ? a[o].s = dr : a[o].s = n.has(i) ? fr : mr;
    }
}
const Qe = Y("Scraper");
let ge = null;
function vf(a) {
  ge = new Xd(a), ge.registerPlugin(new gm()), ge.registerPlugin(new Bm()), ge.registerPlugin(new nf()), Qe.info("采集平台初始化完成"), F.handle(W.auth.check, async (e, t) => ge.checkAuth(t.pluginId)), F.handle(
    W.auth.login,
    async (e, t) => ge.startAuth(t.pluginId, t.options)
  ), F.handle(
    "scraper:test-scrape",
    async (e, t) => {
      Qe.info(
        `[测试采集] pluginId=${t.pluginId}, url=${t.url}, taskType=${t.taskType}`
      );
      const n = ge.getPlugin(t.pluginId);
      if (!n)
        return { status: "error", data: null, errorMessage: `未知插件: ${t.pluginId}` };
      const s = new _t(), i = s.createWindow("test-scrape", {
        url: n.baseUrl,
        show: !0,
        width: 1200,
        height: 800,
        partition: n.sessionPartition
      });
      await new Promise((o) => {
        i.webContents.on("did-finish-load", () => o());
      });
      try {
        const o = await n.scrapeItem(t.url, t.taskType, {
          window: i,
          session: i.webContents.session,
          requestHeaders: {}
        });
        return Qe.info(`[测试采集] 结果: status=${o.status}, hasData=${!!o.data}`), o.data && (Qe.info(`[测试采集] 数据字段: ${JSON.stringify(Object.keys(o.data))}`), Qe.info(`[测试采集] 数据内容: ${JSON.stringify(o.data, null, 2)}`)), o.errorMessage && Qe.info(`[测试采集] 错误: ${o.errorMessage}`), o;
      } catch (o) {
        return Qe.error("[测试采集] 异常:", o), { status: "error", data: null, errorMessage: String(o) };
      } finally {
        setTimeout(() => {
          s.closeAll();
        }, 5e3);
      }
    }
  ), F.on(W.task.start, (e, t) => {
    ge.startTask(t).catch((n) => {
      Qe.error("任务启动失败:", n);
    });
  }), F.on(W.task.pause, (e, t) => {
    ge.pauseTask(t.taskId);
  }), F.on(W.task.resume, (e, t) => {
    ge.resumeTask(t.taskId);
  }), F.on(W.task.cancel, (e, t) => {
    ge.cancelTask(t.taskId);
  }), F.handle(W.export.toExcel, async (e, t) => ff(t));
}
function yf() {
  ge == null || ge.dispose(), ge = null;
}
function bf() {
  return ge ? ge.getAllPlugins() : /* @__PURE__ */ new Map();
}
const Ne = {
  /** 手动触发一次任务（invoke, renderer → main） */
  runNow: "scraping-scheduler:task:run-now",
  /** 取消正在运行的任务（invoke, renderer → main） */
  cancelRunning: "scraping-scheduler:task:cancel-running",
  /** 状态查询（invoke, renderer → main） */
  status: "scraping-scheduler:status",
  /** 进度推送（send, main → renderer） */
  progress: "scraping-scheduler:progress",
  /** 单个 run 状态变化（send, main → renderer） */
  runStatus: "scraping-scheduler:run-status",
  /** 调度变更通知（send, main → renderer） */
  scheduleChanged: "scraping-scheduler:schedule-changed",
  /** 主进程 API 拿到 401 → 通知渲染进程清登录态（send, main → renderer） */
  authExpired: "scraping-scheduler:auth-expired",
  /** 触发验证码（send, main → renderer） */
  captchaRequired: "captcha:required",
  /** 验证码解决/超时（send, main → renderer） */
  captchaResolved: "captcha:resolved"
}, pe = Y("CaptchaBroker"), wf = 12e4, _f = 1500, Li = [
  'iframe[src*="captcha"]',
  'iframe[src*="verify"]',
  '[class*="captcha"]',
  '[id*="captcha"]',
  ".secsdk-captcha-drag-wrapper",
  ".captcha_verify_img",
  '.reds-Modal[class*="verify"]',
  "#captcha_container",
  "#captcha-iframe"
], Sf = [
  "verify_pass",
  "verify-pass",
  "verifyPass",
  "verify_token",
  "verify-token",
  "verifyToken",
  "captcha_pass",
  "captcha-pass",
  "captchaPass",
  "secsdk_captcha_ticket"
], Gt = 3e4, Pa = 5;
class Cf {
  constructor(e) {
    w(this, "getMainWindow");
    /** 正在处理的验证码（accountId -> 解决 resolver） */
    w(this, "pending", /* @__PURE__ */ new Map());
    /**
     * P2-15：上报失败重试队列。Map 以 accountId 去重，
     * 如果同账号在重试间隙内再次触发上报失败，刷新 retryAt 但保留 attempts 计数。
     */
    w(this, "failedReports", /* @__PURE__ */ new Map());
    w(this, "retryTimer", null);
    this.getMainWindow = e, this.startRetryLoop();
  }
  /**
   * 启动重试扫描定时器。每 RETRY_INTERVAL_MS 扫一次 failedReports，
   * 把 retryAt <= now 的项重新上报。Electron 主进程退出时定时器自动随进程销毁。
   */
  startRetryLoop() {
    this.retryTimer || (this.retryTimer = setInterval(() => {
      this.processRetryQueue().catch((e) => {
        pe.warn("重试队列处理异常:", e);
      });
    }, Gt));
  }
  /** 扫一遍重试队列。返回值仅供测试，业务逻辑不依赖。 */
  async processRetryQueue() {
    if (this.failedReports.size === 0) return;
    const e = Date.now(), t = [];
    for (const n of this.failedReports.values())
      n.retryAt <= e && t.push(n);
    for (const n of t) {
      const { accountId: s } = n;
      n.attempts += 1;
      try {
        const i = await Le.get().reportCaptchaTriggered(s);
        this.failedReports.delete(s), pe.info(
          `[${s}] 验证码上报重试成功（第 ${n.attempts} 次）：outcome=${i.outcome}`
        );
      } catch (i) {
        this.shouldRetryReportError(i) ? n.attempts >= Pa ? (this.failedReports.delete(s), pe.error(`[${s}] 验证码上报重试 ${Pa} 次仍失败，永久放弃:`, i)) : (n.retryAt = e + Gt, pe.warn(
          `[${s}] 验证码上报重试第 ${n.attempts} 次失败，${Gt / 1e3}s 后再试:`,
          i
        )) : (this.failedReports.delete(s), pe.warn(`[${s}] 验证码上报重试遇到不可安全重放的错误，已停止重试:`, i));
      }
    }
  }
  /** 把一次失败的上报入队。已有同 accountId 时刷新 retryAt 并保留 attempts。 */
  enqueueFailedReport(e) {
    const t = this.failedReports.get(e), n = Date.now() + Gt;
    t ? (t.retryAt = n, pe.info(
      `[${e}] 上报失败入队（已存在，attempts=${t.attempts}/${Pa}）`
    )) : (this.failedReports.set(e, { accountId: e, retryAt: n, attempts: 0 }), pe.info(`[${e}] 上报失败入队（首次），${Gt / 1e3}s 后重试`));
  }
  /** 当前待重试上报数；预留给未来 IPC 暴露给渲染端展示。 */
  getPendingReportCount() {
    return this.failedReports.size;
  }
  /**
   * `reportCaptchaTriggered` 是有副作用的计数接口。只有连接明显没有到达服务端时才重试；
   * 请求超时 / 响应解析失败都可能是"服务端已落库但客户端没收到结果"，不能盲目重放。
   */
  shouldRetryReportError(e) {
    const t = e instanceof Error ? e.message : String(e), n = e.code, s = typeof n == "string" ? n : "";
    return t.includes("请求超时") || t.includes("响应解析失败") || t.includes("未授权") || t.includes("未加入企业") ? !1 : /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/.test(
      `${s} ${t}`
    );
  }
  /**
   * 处理验证码。
   *
   * 流程：
   *   1. 立即 show 窗口（用户体验最先）
   *   2. P2-4：1.5s 后 DOM 探针验证滑块真渲染（未渲染时记 ASSETS_LOAD_FAIL）
   *   3. P1-6：异步上报后端 reportCaptchaTriggered（不阻塞 show / 等待循环）
   *   4. 通知渲染端
   *   5. 主循环：URL 离开 captcha 模式 / 或 cookie 验证通过（P2-1）
   *
   * @returns true 表示用户完成验证；false 表示超时/窗口关闭
   */
  async handleCaptcha(e) {
    const {
      accountId: t,
      accountDisplayName: n,
      platform: s,
      taskId: i,
      runId: o,
      window: r,
      captchaUrlPatterns: c = ["captcha", "security-verification", "verify"],
      captchaSelectors: u = [...Li],
      successCookieNames: l = [...Sf],
      timeoutMs: p = wf,
      reportToBackend: d = !0
    } = e;
    if (r.isDestroyed())
      return pe.warn(`[${t}] 窗口已销毁，无法处理 captcha`), !1;
    pe.warn(
      `[${t}] 检测到验证码，平台=${s}, 等待用户处理（timeoutMs=${p}）...`
    ), r.isVisible() || r.show(), r.focus(), r.setAlwaysOnTop(!0);
    let h = null, m = null, f = Promise.resolve();
    d && (f = Le.get().reportCaptchaTriggered(t).then((P) => {
      h = P.outcome, m = P.cooldownUntil, pe.info(
        `[${t}] 验证码上报后端成功：outcome=${h}` + (m ? `, cooldownUntil=${m}` : "")
      ), this.notifyRenderer(Ne.captchaRequired, {
        accountId: t,
        accountDisplayName: n,
        platform: s,
        taskId: i,
        runId: o,
        outcome: h,
        cooldownUntil: m
      });
    }).catch((P) => {
      pe.error(`[${t}] 验证码上报后端失败（不阻塞滑块流程）:`, P), this.shouldRetryReportError(P) ? this.enqueueFailedReport(t) : pe.warn(`[${t}] 验证码上报失败未入重试队列，避免非幂等接口重复记账`);
    })), this.notifyRenderer(Ne.captchaRequired, {
      accountId: t,
      accountDisplayName: n,
      platform: s,
      taskId: i,
      runId: o,
      outcome: h,
      cooldownUntil: m
    }), this.probeAssetsLoad(r, t);
    const g = o ? `${t}:${o}` : t;
    let v = !1;
    const y = new Promise((P) => {
      this.pending.set(g, () => {
        v = !0, P();
      });
    }), b = await this.getCookieSnapshot(r, l), S = Date.now();
    let C = !1, _ = !1, k = !1;
    try {
      for (; Date.now() - S < p; ) {
        if (r.isDestroyed()) {
          pe.warn(`[${t}] 验证窗口被用户关闭`);
          break;
        }
        if (v) {
          pe.warn(`[${t}] 验证被主动取消`);
          break;
        }
        const P = r.webContents.getURL(), T = c.some((G) => P.includes(G)), L = await this.hasCaptchaDom(r, u);
        if (T || L)
          _ = !0;
        else if (_) {
          C = !0;
          break;
        } else k || (k = !0, pe.info(`[${t}] 等待验证码组件渲染后再开始通过判定`));
        if (await this.hasVerifyPassCookie(r, b, l)) {
          pe.info(`[${t}] cookie 探针命中明确验证通过标识，视为通过`), C = !0;
          break;
        }
        await Promise.race([this.delay(_f), y]);
      }
    } finally {
      if (this.pending.delete(g), !r.isDestroyed())
        try {
          r.setAlwaysOnTop(!1);
        } catch (P) {
          pe.warn("setAlwaysOnTop(false) 失败:", P);
        }
    }
    return await Promise.race([f, this.delay(500)]), this.notifyRenderer(Ne.captchaResolved, {
      accountId: t,
      resolved: C,
      timedOut: !C && !v
    }), C ? pe.info(`[${t}] 验证完成，耗时 ${Date.now() - S}ms`) : pe.warn(`[${t}] 验证未通过：${v ? "主动取消" : "超时"}`), C;
  }
  /**
   * P2-1：检查窗口的 session 是否有 verify-pass cookie（字节/小红书验证通过通常写一条）。
   *
   * 失败一律视为没命中，不抛错。
   */
  async hasVerifyPassCookie(e, t, n) {
    const s = await this.getCookieSnapshot(e, n);
    for (const [i, o] of s)
      if (t.get(i) !== o) return !0;
    return !1;
  }
  async getCookieSnapshot(e, t) {
    const n = /* @__PURE__ */ new Map();
    if (e.isDestroyed()) return n;
    try {
      const s = await e.webContents.session.cookies.get({}), i = new Set(t.map((o) => o.toLowerCase()));
      for (const o of s)
        i.has(o.name.toLowerCase()) && n.set(this.cookieKey(o), o.value);
    } catch {
    }
    return n;
  }
  cookieKey(e) {
    return `${e.domain}|${e.path}|${e.name}`;
  }
  async hasCaptchaDom(e, t) {
    if (e.isDestroyed() || t.length === 0) return !1;
    try {
      const n = JSON.stringify(t.join(", "));
      return await e.webContents.executeJavaScript(
        `!!document.querySelector(${n})`
      ) === !0;
    } catch {
      return !1;
    }
  }
  /**
   * P2-4：show 后 1.5s 探针检查滑块 DOM 是否真渲染。
   * 未渲染只记日志，不改返回值（避免误判）。
   */
  async probeAssetsLoad(e, t) {
    if (await this.delay(1500), !e.isDestroyed())
      try {
        await e.webContents.executeJavaScript(
          `!!document.querySelector(${JSON.stringify([...Li].join(", "))})`
        ) || pe.warn(
          `[${t}] ASSETS_LOAD_FAIL 滑块 DOM 未渲染（show 后 1.5s 探针未命中），可能资源加载失败或目标页面已切走`
        );
      } catch (n) {
        pe.warn(`[${t}] 资源加载探针执行失败:`, n);
      }
  }
  /**
   * 主动取消等待中的验证（例如任务取消）。
   *
   * P2-2 后 pendingKey 是 `${accountId}:${runId}`；调用方通常只有 accountId，
   * 所以这里做前缀匹配把该账号所有 run 的 captcha 都 cancel。
   */
  cancel(e) {
    const t = `${e}:`;
    for (const [n, s] of this.pending)
      (n === e || n.startsWith(t)) && s();
  }
  /** 取消所有等待中的验证 */
  cancelAll() {
    for (const [, e] of this.pending)
      e();
    this.pending.clear();
  }
  notifyRenderer(e, t) {
    const n = this.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(e, t);
  }
  delay(e) {
    return new Promise((t) => setTimeout(t, e));
  }
}
class $a {
  constructor(e, t) {
    w(this, "tokens");
    w(this, "lastRefill");
    this.burstSize = e, this.refillRatePerMin = t, this.tokens = Math.max(1, e), this.lastRefill = Date.now();
  }
  /** 内部：按经过时间补充令牌 */
  refill() {
    const e = Date.now(), t = e - this.lastRefill;
    if (t <= 0) return;
    const n = t / 6e4 * this.refillRatePerMin;
    this.tokens = Math.min(this.burstSize, this.tokens + n), this.lastRefill = e;
  }
  /**
   * 取 1 个令牌。
   *
   * @returns 取到返回 true；桶空返回 false（**不阻塞**，调用方自行决定跳过或等待）
   */
  tryAcquire() {
    return this.refill(), this.tokens >= 1 ? (this.tokens -= 1, !0) : !1;
  }
  /** 把桶强制清空。用于触发风控信号后让该账号立刻进入"冷却" */
  drain() {
    this.tokens = 0, this.lastRefill = Date.now();
  }
  /** 调试/UI 查询当前令牌数（带刷新） */
  current() {
    return this.refill(), this.tokens;
  }
  /** 配置只读访问 */
  getBurstSize() {
    return this.burstSize;
  }
  getRefillRatePerMin() {
    return this.refillRatePerMin;
  }
}
class Rf {
  constructor() {
    w(this, "buckets", /* @__PURE__ */ new Map());
  }
  /**
   * 确保 accountId 存在一个桶。
   *
   * 如果不存在 → 按当前 policy 新建并返回。
   * 如果已存在 → 直接返回（不会重置令牌数；想改 policy 用 `replace()`）。
   */
  ensure(e, t, n) {
    const s = this.buckets.get(e);
    if (s) {
      if (s.getBurstSize() !== t || s.getRefillRatePerMin() !== n) {
        const o = new $a(t, n);
        return this.buckets.set(e, o), o;
      }
      return s;
    }
    const i = new $a(t, n);
    return this.buckets.set(e, i), i;
  }
  get(e) {
    return this.buckets.get(e);
  }
  /** 强制替换（policy 变更时调用） */
  replace(e, t, n) {
    const s = new $a(t, n);
    return this.buckets.set(e, s), s;
  }
  remove(e) {
    this.buckets.delete(e);
  }
  /** 用于 scheduler dispose 或测试 reset */
  clear() {
    this.buckets.clear();
  }
  size() {
    return this.buckets.size;
  }
}
const Ni = new Rf(), Af = 5 * 60 * 1e3, Ef = 2, kf = 0.3, Tf = 10, If = 8e3, Pf = 5, $f = 0.2, Df = 10;
class Lf {
  constructor() {
    w(this, "states", /* @__PURE__ */ new Map());
  }
  recordCaptcha(e) {
    this.ensureState(e).captchaTimes.push(Date.now());
  }
  recordFailure(e) {
    this.ensureState(e).failureTimes.push(Date.now());
  }
  recordSuccess(e, t) {
    const n = this.ensureState(e), s = Date.now();
    n.successTimes.push(s), n.successDurations.push(Math.max(0, t));
  }
  recordTimeout(e) {
    this.ensureState(e).timeoutTimes.push(Date.now());
  }
  /**
   * 4 个信号检查 — 任一触发返回 `throttle: true`，附带 signal + reason。
   *
   * 阈值见模块顶部常量。样本数门槛是为了避免冷启动误判（前几条失败就被降速）。
   */
  shouldThrottle(e) {
    const t = this.states.get(e);
    if (!t) return { throttle: !1 };
    const n = Date.now();
    if (this.prune(t, n), t.captchaTimes.length >= Ef)
      return {
        throttle: !0,
        signal: "captcha-frequent",
        reason: `5min 内 ${t.captchaTimes.length} 次滑块`
      };
    const s = t.successTimes.length + t.failureTimes.length + t.timeoutTimes.length, i = t.successTimes.length + t.failureTimes.length;
    if (i >= Tf) {
      const o = t.failureTimes.length / i;
      if (o >= kf)
        return {
          throttle: !0,
          signal: "high-failure-rate",
          reason: `失败率 ${(o * 100).toFixed(1)}% (${t.failureTimes.length}/${i})`
        };
    }
    if (t.successDurations.length >= Pf) {
      const r = t.successDurations.reduce((c, u) => c + u, 0) / t.successDurations.length;
      if (r >= If)
        return {
          throttle: !0,
          signal: "slow-response",
          reason: `平均响应 ${r.toFixed(0)}ms (样本 ${t.successDurations.length})`
        };
    }
    if (s >= Df) {
      const o = t.timeoutTimes.length / s;
      if (o >= $f)
        return {
          throttle: !0,
          signal: "high-timeout-rate",
          reason: `超时率 ${(o * 100).toFixed(1)}% (${t.timeoutTimes.length}/${s})`
        };
    }
    return { throttle: !1 };
  }
  /** run 结束时清掉该账号的窗口（避免下次任务受上次干扰过度） */
  reset(e) {
    this.states.delete(e);
  }
  /** 模块 dispose 调用 */
  clear() {
    this.states.clear();
  }
  /** 测试/调试用 */
  snapshot(e) {
    const t = this.states.get(e);
    return t ? (this.prune(t, Date.now()), {
      captcha: t.captchaTimes.length,
      failure: t.failureTimes.length,
      success: t.successTimes.length,
      timeout: t.timeoutTimes.length
    }) : null;
  }
  // ===========================================================================
  // 内部
  // ===========================================================================
  ensureState(e) {
    let t = this.states.get(e);
    return t || (t = {
      captchaTimes: [],
      failureTimes: [],
      successTimes: [],
      successDurations: [],
      timeoutTimes: []
    }, this.states.set(e, t)), t;
  }
  /**
   * 清理超出 5 分钟窗口的时间戳。
   *
   * successDurations 与 successTimes 一一对应，必须**同步**裁剪。
   */
  prune(e, t) {
    const n = t - Af;
    e.captchaTimes = e.captchaTimes.filter((i) => i >= n), e.failureTimes = e.failureTimes.filter((i) => i >= n), e.timeoutTimes = e.timeoutTimes.filter((i) => i >= n);
    const s = [];
    for (let i = 0; i < e.successTimes.length; i++)
      e.successTimes[i] >= n && s.push(i);
    s.length !== e.successTimes.length && (e.successTimes = s.map((i) => e.successTimes[i]), e.successDurations = s.map((i) => e.successDurations[i]));
  }
}
const We = new Lf();
class Nf {
  constructor() {
    /**
     * 锁的"尾巴" promise：下一个 acquire 必须 await 它解决，
     * 然后把自己的 promise 挂到尾巴上。
     */
    w(this, "tails", /* @__PURE__ */ new Map());
  }
  /**
   * 取锁。返回 `release` 函数；同一 accountId 上调用方按 FIFO 排队。
   *
   * 不会抛出（即使前一个持有者的 release 没调，链路也会因为 GC 永远挂；
   * 因此调用方一定要在 finally 里 release）。
   */
  async acquire(e) {
    const t = this.tails.get(e) ?? Promise.resolve();
    let n;
    const s = new Promise((r) => {
      n = r;
    }), i = t.then(() => s);
    this.tails.set(e, i), await t;
    let o = !1;
    return () => {
      o || (o = !0, n(), this.tails.get(e) === i && Promise.resolve().then(() => {
        this.tails.get(e) === i && this.tails.delete(e);
      }));
    };
  }
  /** 当前有多少 account 处于排队中（测试用） */
  size() {
    return this.tails.size;
  }
  /** 模块 dispose 时调（注意：已 acquire 但未 release 的会被丢，调用方需自行清） */
  clear() {
    this.tails.clear();
  }
}
const Oi = new Nf(), ne = Y("AccountDispatcher"), Mi = 5, Of = 6e4, Mf = 10, Uf = 10, Ff = 2, Ui = 3e5, xr = "SCRAPE_TIMEOUT", Bf = 3e3, jf = 5, zf = /* @__PURE__ */ new Set([
  "PLATFORM_DISABLED",
  "PLATFORM_POLICY_UNAVAILABLE",
  "REFRESH_QUEUE_UNAVAILABLE",
  "USER_PAUSED"
]), xt = {
  kRatio: 0.5,
  spareAccounts: 1,
  shiftSizeFactor: 1,
  restFactor: 1,
  hourlyFactor: 1,
  scrapesPerDay: null,
  scrapesPerHour: null,
  burstSize: null,
  refillRatePerMin: null,
  maxPerTask: null,
  minIntervalMs: null,
  orgDailyBudget: null,
  consecutiveFailureThreshold: null,
  cooldownMinutes: null,
  shiftSize: null,
  shiftRestMinutes: null
};
function qf(a, e) {
  return {
    ...a,
    scrapesPerDay: e.scrapesPerDay ?? a.scrapesPerDay,
    scrapesPerHour: e.scrapesPerHour ?? a.scrapesPerHour,
    burstSize: e.burstSize ?? a.burstSize,
    refillRatePerMin: e.refillRatePerMin ?? a.refillRatePerMin,
    maxPerTask: e.maxPerTask ?? a.maxPerTask,
    minIntervalMs: e.minIntervalMs ?? a.minIntervalMs,
    orgDailyBudget: e.orgDailyBudget ?? a.orgDailyBudget,
    consecutiveFailureThreshold: e.consecutiveFailureThreshold ?? a.consecutiveFailureThreshold,
    cooldownMinutes: e.cooldownMinutes ?? a.cooldownMinutes,
    shiftSize: e.shiftSize ?? a.shiftSize,
    shiftRestMinutes: e.shiftRestMinutes ?? a.shiftRestMinutes
  };
}
function Fi(a) {
  return a.reduce((e, t) => e + Math.max(0, t.usedToday ?? 0), 0);
}
const Bn = class Bn {
  constructor(e) {
    w(this, "getMainWindow");
    w(this, "getPlugins");
    w(this, "windowManager");
    w(this, "captchaBroker");
    w(this, "api");
    w(this, "activeRuns", /* @__PURE__ */ new Map());
    w(this, "activeNotifications", /* @__PURE__ */ new Set());
    /**
     * PacePolicy 内存缓存（PRD §5.3 v2）：
     *  - key = policyId（'__builtin_balanced' 表示兜底）
     *  - 60s TTL；避免每个 run 都打 DB
     *  - 拉失败或策略已禁用时返回 BALANCED_FALLBACK，并在 run errorLog 记一行
     */
    w(this, "pacePolicyCache", /* @__PURE__ */ new Map());
    this.getMainWindow = e.getMainWindow, this.getPlugins = e.getPlugins, this.windowManager = new _t(), this.captchaBroker = new Cf(e.getMainWindow), this.api = Le.get();
  }
  /**
   * 把 task.pacePolicyId 解析成运行期 PacePresetConfig 数值。
   *
   *  - null/空 → BALANCED_FALLBACK + 记一行 errorLog 提示"任务未指定策略，兜底 BALANCED"
   *  - 拉 DB 失败或策略 enabled=false → BALANCED_FALLBACK
   *  - 缓存 60s，避免每次 run 都打 DB
   */
  async resolvePacePolicy(e, t) {
    if (!e)
      return t.errorLog.push("[pace-policy] task 未指定策略，已兜底 BALANCED"), xt;
    const n = this.pacePolicyCache.get(e);
    if (n && Date.now() - n.fetchedAt < Bn.PACE_POLICY_TTL_MS)
      return n.config;
    try {
      const s = await this.api.getPacePolicy(e);
      if (!s || !s.enabled)
        return t.errorLog.push(
          `[pace-policy] 策略 ${e} ${s ? "已禁用" : "不存在"}，兜底 BALANCED`
        ), xt;
      const i = {
        kRatio: s.kRatio,
        spareAccounts: s.spareAccounts,
        shiftSizeFactor: s.shiftSizeFactor,
        restFactor: s.restFactor,
        hourlyFactor: s.hourlyFactor,
        scrapesPerDay: s.scrapesPerDay ?? null,
        scrapesPerHour: s.scrapesPerHour ?? null,
        burstSize: s.burstSize ?? null,
        refillRatePerMin: s.refillRatePerMin ?? null,
        maxPerTask: s.maxPerTask ?? null,
        minIntervalMs: s.minIntervalMs ?? null,
        orgDailyBudget: s.orgDailyBudget ?? null,
        consecutiveFailureThreshold: s.consecutiveFailureThreshold ?? null,
        cooldownMinutes: s.cooldownMinutes ?? null,
        shiftSize: s.shiftSize ?? null,
        shiftRestMinutes: s.shiftRestMinutes ?? null
      };
      return this.pacePolicyCache.set(e, { config: i, fetchedAt: Date.now() }), i;
    } catch (s) {
      return ne.warn(`[pace-policy] 加载策略 ${e} 失败，兜底 BALANCED:`, s), t.errorLog.push(
        `[pace-policy] 加载策略失败（${s instanceof Error ? s.message : String(s)}），兜底 BALANCED`
      ), xt;
    }
  }
  /** 当前是否有 run 正在执行 */
  hasActiveRun() {
    return this.activeRuns.size > 0;
  }
  /** 当前活跃 run 概览（用于 IPC status 查询） */
  listActiveRuns() {
    return Array.from(this.activeRuns.values()).map((e) => ({
      taskId: e.taskId,
      runId: e.runId,
      startedAt: e.startedAt,
      current: e.current,
      total: e.total
    }));
  }
  /** 同 org 当前正在跑的 task 数（用于 scheduler 并发限制） */
  countRunsByOrg(e, t) {
    let n = 0;
    for (const s of this.activeRuns.values())
      t(s.taskId) === e && n++;
    return n;
  }
  /** 同 org 下是否已有任一目标 platform 正在运行 */
  hasActiveRunForAnyPlatform(e, t) {
    const n = new Set(t);
    for (const s of this.activeRuns.values())
      if (s.organizationId === e && s.platforms.some((i) => n.has(i)))
        return !0;
    return !1;
  }
  /** 当前全局正在跑的 run 数 */
  countAllRuns() {
    return this.activeRuns.size;
  }
  /**
   * 暂停一个正在运行的 run。
   * 仅设置 cancelled 标志；窗口关闭、状态回写在主循环内做。
   */
  cancelRun(e) {
    for (const t of this.activeRuns.values())
      if (t.runId === e)
        return this.requestStop(t, "USER_PAUSED"), ne.info(`[run=${e}] 已请求暂停`), !0;
    return !1;
  }
  /** 暂停某个 task 下所有活跃 runs */
  cancelTask(e) {
    let t = 0;
    for (const n of this.activeRuns.values())
      n.taskId === e && (this.requestStop(n, "USER_PAUSED"), t++);
    return t;
  }
  /**
   * 执行一次任务（创建 run、拉目标、按账号串行采集、写回结果）。
   *
   * 失败的常见原因（不再 throw，写到 errorLog 里 + 把 run 标记 FAILED）：
   * - 该任务没有 ACTIVE 账号
   * - 没有命中目标 blogger
   * - 后端拒绝
   *
   * @returns runId（即使失败也返回，便于调用方查询）
   */
  async runTask(e, t = !1) {
    if (!this.api.isAuthenticated())
      return ne.warn(`[task=${e.id}] 未登录，跳过执行`), null;
    ne.info(
      `[task=${e.id}] 开始执行: name=${e.name}, platforms=${e.platforms.join(",")}`
    );
    let n = [], s, i = [], o = 0, r = 0, c = 0, u = 0, l = [], p = 0;
    try {
      let y = null;
      try {
        y = await this.api.findLastPausedRun(e.id);
      } catch (b) {
        ne.warn(`[task=${e.id}] 续跑探测失败，按全量拉取:`, b);
      }
      if (y) {
        const b = y.pendingBloggerIds ?? [];
        ne.info(
          `[task=${e.id}] 检测到上一次 PAUSED run=${y.id}，in-place 续跑 ${b.length} 条`
        );
        try {
          await this.api.resumeRun(y.id);
        } catch (S) {
          return ne.error(`[task=${e.id}] resumeRun 失败:`, S), null;
        }
        b.length > 0 && (n = (await this.api.listBloggersByIds(b)).filter((C) => !!C.url).map((C) => ({
          id: C.id,
          platform: C.platform,
          url: C.url,
          platformBloggerId: C.platformBloggerId
        }))), s = y.id, i = y.processedBloggerIds ?? [], o = y.successCount, r = y.failedCount, u = y.captchaCount, p = y.targetCount, l = y.errorLog ? y.errorLog.split(`
`) : [], c = Zf(
          y.failedCount,
          y.pauseReason,
          l
        );
      } else
        s = (await this.api.createRun(e.id, { targetCount: 0 })).id;
    } catch (y) {
      if (!t && Xf(y))
        try {
          const b = await this.api.recoverInterruptedRuns();
          if (b.updated > 0)
            return ne.warn(
              `[task=${e.id}] 创建 run 遇到残留 RUNNING 锁，已恢复 ${b.updated} 个 run 后重试`
            ), this.runTask(e, !0);
        } catch (b) {
          ne.warn(`[task=${e.id}] 尝试恢复残留 RUNNING run 失败:`, b);
        }
      return ne.error(`[task=${e.id}] 拉目标/创建 run 失败:`, y), null;
    }
    const d = /* @__PURE__ */ new Set();
    for (const y of i) d.add(y);
    const h = o + r, m = {
      taskId: e.id,
      organizationId: e.organizationId,
      platforms: e.platforms,
      runId: s,
      startedAt: Date.now(),
      cancelled: !1,
      total: Math.max(p, h),
      current: h,
      successCount: o,
      failedCount: r,
      terminalDataErrorCount: c,
      captchaCount: u,
      accountUsage: /* @__PURE__ */ new Map(),
      errorLog: l,
      currentAccountId: null,
      currentAccountIds: /* @__PURE__ */ new Set(),
      windows: [],
      pendingUsage: [],
      pendingSyncedBloggerIds: [],
      activePoolSnapshot: [],
      pauseReason: null,
      syncedAtFlushFailed: !1,
      accountingFlushFailed: !1,
      fingerprintCache: /* @__PURE__ */ new Map(),
      fields: e.fieldsJson && e.fieldsJson.length > 0 ? e.fieldsJson : null,
      targetTotalByPlatform: /* @__PURE__ */ new Map(),
      totalFromBackend: p > 0,
      targetIdsAll: d,
      processedIds: new Set(i),
      lastProgressFlushAt: 0,
      progressFlushInFlight: !1,
      progressFlushPromise: null
    };
    n = this.appendDiscoveredTargets(m, n), this.activeRuns.set(s, m), this.notifyRunStatus({ taskId: e.id, runId: s, status: "RUNNING" });
    const f = e.maxRunDurationMinutes ?? 360, g = Math.max(1, f) * 6e4, v = setTimeout(() => {
      m.cancelled || (ne.warn(`[run=${s}] 任务超时 (${f} 分钟)，暂停等待续跑`), m.cancelled = !0, m.pauseReason = m.pauseReason ?? "RUN_TIMEOUT", m.errorLog.push(`[timeout] 任务超时 (${f} 分钟)，已暂停等待续跑`), this.cancelCaptchasForState(m));
    }, g);
    try {
      await this.executeRun(e, m, n);
    } catch (y) {
      ne.error(`[run=${s}] 执行异常:`, y), m.errorLog.push(`[fatal] ${y instanceof Error ? y.message : String(y)}`);
    } finally {
      clearTimeout(v);
      for (const _ of m.windows)
        this.windowManager.closeWindow(_);
      if (m.pendingUsage.length > 0 && await this.flushUsage(m), m.pendingSyncedBloggerIds.length > 0 && await this.flushSyncedBloggers(m), m.progressFlushPromise)
        try {
          await m.progressFlushPromise;
        } catch {
        }
      const y = Array.from(m.targetIdsAll).some(
        (_) => !m.processedIds.has(_)
      ), b = !!m.pauseReason && (m.targetIdsAll.size === 0 || y || zf.has(m.pauseReason)), C = m.cancelled && m.pauseReason !== "RUN_TIMEOUT" && m.pauseReason !== "USER_PAUSED" ? "CANCELLED" : m.syncedAtFlushFailed || m.accountingFlushFailed ? "FAILED" : b ? "PAUSED" : m.failedCount > 0 && m.failedCount === m.terminalDataErrorCount && m.current >= m.total ? "PARTIAL" : m.successCount === 0 && m.failedCount > 0 ? "FAILED" : m.failedCount > 0 && m.successCount > 0 ? "PARTIAL" : "SUCCESS";
      try {
        const _ = Array.from(m.processedIds);
        let k = null;
        if (C === "PAUSED") {
          k = [];
          for (const P of m.targetIdsAll)
            m.processedIds.has(P) || k.push(P);
          k.length === 0 && (k = null);
        }
        await this.api.updateRun(s, {
          status: C,
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          targetCount: m.total,
          successCount: m.successCount,
          failedCount: m.failedCount,
          captchaCount: m.captchaCount,
          accountUsageJson: this.buildAccountUsageJson(m),
          errorLog: m.errorLog.length > 0 ? m.errorLog.join(`
`).slice(0, 4e3) : null,
          pauseReason: m.pauseReason,
          pendingBloggerIds: k,
          processedBloggerIds: _.length > 0 ? _ : null
        });
      } catch (_) {
        ne.error(`[run=${s}] 回写 run 失败:`, _);
      }
      this.notifyRunStatus({
        taskId: e.id,
        runId: s,
        status: C,
        message: m.pauseReason ?? void 0
      }), C === "SUCCESS" && this.showRunSuccessNotification(e, m), this.activeRuns.delete(s);
      for (const _ of m.accountUsage.keys())
        We.reset(_);
      ne.info(
        `[run=${s}] 结束: status=${C}, success=${m.successCount}, failed=${m.failedCount}` + (m.pauseReason ? `, pauseReason=${m.pauseReason}` : "")
      );
    }
    return s;
  }
  // ===========================================================================
  // 内部：单 run 主流程（P5.5 重构）
  // ===========================================================================
  async executeRun(e, t, n) {
    const s = this.getPlugins(), i = /* @__PURE__ */ new Map();
    for (const r of n) {
      const c = i.get(r.platform) ?? [];
      c.push(r), i.set(r.platform, c);
    }
    const o = e.platforms.map(
      (r) => [r, i.get(r) ?? []]
    );
    await ji(
      o,
      Math.min(Ff, o.length),
      async ([r, c]) => {
        t.cancelled || await this.executePlatform(e, t, r, c, s);
      }
    );
  }
  /** 单平台的 run 主流程 */
  async executePlatform(e, t, n, s, i) {
    const o = this.findPluginForPlatform(i, n);
    if (!o) {
      t.errorLog.push(`[${n}] 未注册对应插件，跳过 ${s.length} 条`), t.failedCount += s.length, t.current += s.length, this.notifyProgress(t);
      return;
    }
    const r = await this.resolvePacePolicy(e.pacePolicyId ?? null, t);
    let c = null;
    try {
      c = await this.api.getPlatformPolicy(n);
    } catch (m) {
      t.pauseReason = t.pauseReason ?? "PLATFORM_POLICY_UNAVAILABLE", t.errorLog.push(
        `[${n}] 平台策略读取失败，已暂停该平台：${m instanceof Error ? m.message : String(m)}`
      ), this.notifyProgress(t);
      return;
    }
    if (!c) {
      t.pauseReason = t.pauseReason ?? "PLATFORM_POLICY_UNAVAILABLE", t.errorLog.push(`[${n}] 平台策略不存在，已暂停该平台`), this.notifyProgress(t);
      return;
    }
    if (c.acquisitionMode === "DISABLED") {
      t.pauseReason = t.pauseReason ?? "PLATFORM_DISABLED", t.errorLog.push(
        `[${n}] acquisitionMode=DISABLED，暂停 ${s.length} 条`
      ), this.notifyProgress(t);
      return;
    }
    const u = qf(c, r);
    let l = [];
    const p = { usedToday: 0 };
    try {
      const m = await this.api.listAccounts({ platform: n });
      p.usedToday = Fi(m), l = m.filter((f) => f.status === "ACTIVE");
    } catch (m) {
      t.errorLog.push(
        `[${n}] 拉账号失败: ${m instanceof Error ? m.message : String(m)}`
      );
    }
    let d = s.slice(), h = 0;
    for (; !t.cancelled; ) {
      if (t.syncedAtFlushFailed || t.accountingFlushFailed)
        return;
      if (d.length === 0) {
        if (t.pendingSyncedBloggerIds.length > 0 && !await this.flushSyncedBloggers(t) || (d = await this.loadNextQueueBatch(e, t, n), d.length === 0))
          return;
        this.notifyProgress(t);
      }
      if (p.usedToday >= u.orgDailyBudget) {
        t.pauseReason = t.pauseReason ?? "ORG_DAILY_BUDGET_EXHAUSTED", t.errorLog.push(
          `[${n}] 企业日预算已达上限 ${u.orgDailyBudget}，暂停剩余 ${Math.max(0, t.total - t.current)} 条`
        ), this.notifyProgress(t);
        return;
      }
      const m = this.filterAvailableAccounts(l, u);
      if (m.length === 0) {
        if (h >= Mi) {
          t.pauseReason = t.pauseReason ?? "ALL_ACCOUNTS_UNAVAILABLE", t.errorLog.push(
            `[${n}] 全部账号不可用或处于班次休息，已重试 ${h} 轮，暂停剩余 ${Math.max(0, t.total - t.current)} 条`
          ), this.notifyProgress(t);
          return;
        }
        h++, t.pauseReason = "ALL_ACCOUNTS_UNAVAILABLE", ne.warn(
          `[run=${t.runId}] [${n}] 全部账号不可用，PAUSED 重试 ${h}/${Mi}，60s 后再尝试`
        ), await this.delay(Of);
        try {
          const T = await this.api.listAccounts({ platform: n });
          p.usedToday = Math.max(
            p.usedToday,
            Fi(T)
          ), l = T.filter((L) => L.status === "ACTIVE");
        } catch (T) {
          t.errorLog.push(
            `[${n}] PAUSED 重试时拉账号失败: ${T instanceof Error ? T.message : String(T)}`
          );
        }
        continue;
      }
      const f = m.filter(
        (T) => Bi(T, u, r) > 0
      ), g = f.map(
        (T) => Bi(T, u, r)
      );
      if (f.length === 0 || g.length === 0) {
        t.pauseReason = t.pauseReason ?? "BUDGET_EXHAUSTED_DAY", t.errorLog.push(
          `[${n}] 所有账号额度或班次预算耗尽，暂停剩余 ${Math.max(0, t.total - t.current)} 条`
        ), this.notifyProgress(t);
        return;
      }
      const v = Gf(
        d.length,
        f.length,
        g,
        r
      ), y = Jf(f, v), b = /* @__PURE__ */ new Map();
      for (const T of y)
        b.set(T.id, {
          account: T,
          used: 0,
          effectiveIntervalMs: Math.max(
            6e4 / Math.max(u.refillRatePerMin, 1),
            u.minIntervalMs
          ),
          lastScrapeAt: null,
          removed: !1,
          currentShiftCount: Math.max(0, T.currentShiftCount ?? 0)
        });
      t.activePoolSnapshot.push(
        ...y.map((T) => ({
          id: T.id,
          displayName: T.displayName,
          weight: T.weight,
          currentShiftCount: T.currentShiftCount ?? 0,
          lastShiftEndedAt: T.lastShiftEndedAt ?? null
        }))
      );
      const S = Hf(y, d), C = [], _ = [];
      let k = !1;
      const P = S.filter((T) => T.targets.length > 0);
      if (await ji(P, v, async (T) => {
        if (t.cancelled || k) {
          _.push(...T.targets);
          return;
        }
        const L = b.get(T.account.id);
        if (!L) {
          _.push(...T.targets);
          return;
        }
        const z = await this.processBucket(
          o,
          L,
          T.targets,
          t,
          u,
          r,
          p
        );
        C.push(...z.consumed), _.push(...z.leftover), z.stopPlatform && (k = !0);
      }), k) {
        d = _, this.notifyProgress(t);
        return;
      }
      if (d = _, C.length === 0 && d.length > 0) {
        t.errorLog.push(
          `[${n}] 单轮 0 进度，放弃剩余 ${Math.max(0, t.total - t.current)} 条`
        ), t.pauseReason = t.pauseReason ?? "NO_SAFE_PROGRESS", this.notifyProgress(t);
        return;
      }
    }
  }
  /**
   * 处理活跃池中单账号的一桶目标。
   *
   * @returns consumed: 实际成功/失败计数的目标；leftover: 因为限速/风控被退回的目标
   */
  async processBucket(e, t, n, s, i, o, r) {
    var C;
    const c = t.account, u = [], l = [], p = Wf(i, o), d = Vf(i, o);
    if (t.currentShiftCount >= p)
      return await this.startShiftRest(s, c, d) ? (t.currentShiftCount = 0, t.removed = !0, l.push(...n), { consumed: u, leftover: l }) : { consumed: u, leftover: n, stopPlatform: !0 };
    const h = await Oi.acquire(c.id), m = `scheduler-${s.runId}-${c.id}`, f = c.partition || e.sessionPartition || `persist:scraper-${c.id}`, g = await this.resolveFingerprintProfile(s, c);
    let v;
    try {
      v = this.windowManager.createWindow(m, {
        url: e.baseUrl,
        show: !1,
        partition: f,
        fingerprintProfile: g
      }), s.windows.push(m), await new Promise((_) => {
        v.webContents.once("did-finish-load", () => _());
      });
    } catch (_) {
      return ne.error(`[account=${c.id}] 创建窗口失败:`, _), s.errorLog.push(
        `[account=${c.id}] 创建窗口失败: ${_ instanceof Error ? _.message : String(_)}`
      ), h(), { consumed: [], leftover: n };
    }
    const y = this.ensureUsage(s, c.id);
    s.currentAccountId = c.id, s.currentAccountIds.add(c.id);
    const b = Ni.ensure(
      c.id,
      i.burstSize,
      i.refillRatePerMin
    );
    let S = 0;
    try {
      for (let _ = 0; _ < n.length; _++) {
        if (s.cancelled) {
          l.push(...n.slice(_));
          break;
        }
        if (t.removed) {
          l.push(...n.slice(_));
          break;
        }
        const k = n[_];
        if (c.cooldownUntil && new Date(c.cooldownUntil).getTime() > Date.now()) {
          l.push(...n.slice(_));
          break;
        }
        if (c.usedToday + t.used >= i.scrapesPerDay) {
          s.errorLog.push(
            `[account=${c.displayName}] usedToday 达上限 ${i.scrapesPerDay}，切换账号`
          ), l.push(...n.slice(_));
          break;
        }
        if (r.usedToday >= i.orgDailyBudget) {
          s.errorLog.push(
            `[account=${c.displayName}] 企业日预算达上限 ${i.orgDailyBudget}，暂停平台`
          ), l.push(...n.slice(_));
          break;
        }
        if (!b.tryAcquire()) {
          l.push(...n.slice(_));
          break;
        }
        if (t.lastScrapeAt !== null) {
          const O = Date.now() - t.lastScrapeAt;
          if (O < t.effectiveIntervalMs && (await this.delay(t.effectiveIntervalMs - O), s.cancelled)) {
            l.push(...n.slice(_));
            break;
          }
        }
        if (u.push(k), t.lastScrapeAt = Date.now(), t.used++, r.usedToday++, t.currentShiftCount++, s.current++, y.handled++, !k.url) {
          if (s.failedCount++, s.terminalDataErrorCount++, S = 0, s.errorLog.push(
            `[data-skip][${c.displayName}] ${k.id}: errorCode=INVALID_TARGET_URL，缺少主页链接，已标记为本轮已处理`
          ), !await this.markTerminalBloggerPlatformStatus(
            s,
            k.id,
            "INVALID_TARGET_URL",
            "缺少主页链接"
          ))
            return t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
          if (!await this.queueProcessedBloggerForSync(s, k.id))
            return s.pauseReason = s.pauseReason ?? "SYNCED_AT_WRITE_FAILED", t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
          this.notifyProgress(s);
          continue;
        }
        const P = Date.now();
        let T = !1, L = !1, z = !1, G = !1;
        try {
          const O = ((C = e.normalizeTaskType) == null ? void 0 : C.call(e, e.defaultTaskType)) ?? e.defaultTaskType, le = e.scrapeItem(k.url, O, {
            window: v,
            session: v.webContents.session,
            requestHeaders: {},
            accountId: c.id,
            taskId: s.taskId,
            runId: s.runId,
            platform: c.platform,
            // 透传任务级"按需采集"字段白名单（null/空 = 全部字段）；
            // 插件按需跳过对应接口请求 — 未实现时忽略即可，不影响兼容
            fields: s.fields,
            requestCaptcha: async (A) => {
              L = !0, s.captchaCount++, y.captcha++, We.recordCaptcha(c.id), s.errorLog.push(`[account=${c.displayName}] 触发验证码 @ ${k.url}`), this.notifyProgress(s);
              const R = await this.captchaBroker.handleCaptcha({
                accountId: c.id,
                accountDisplayName: c.displayName,
                platform: c.platform,
                taskId: s.taskId,
                runId: s.runId,
                window: A.window,
                captchaUrlPatterns: A.urlPatterns,
                captchaSelectors: A.captchaSelectors,
                successCookieNames: A.successCookieNames,
                timeoutMs: A.timeoutMs
              });
              if (!R) {
                z = !0, t.removed = !0;
                try {
                  await this.api.markAccountRiskWithReason(
                    c.id,
                    "captcha-unresolved",
                    i.cooldownMinutes
                  );
                } catch ($) {
                  ne.error(`[account=${c.id}] 标记 RISK 失败:`, $);
                }
              }
              return { resolved: R, timedOut: !R };
            }
          });
          let de = null;
          const H = new Promise((A, R) => {
            de = setTimeout(
              () => R(new Error(xr)),
              Ui
            );
          });
          let N;
          try {
            N = await Promise.race([le, H]);
          } finally {
            de !== null && clearTimeout(de);
          }
          T = ah(v);
          const q = !L && N.status === "error" ? sh(e.riskCodes, N.errorMessage) : null, M = !L && N.status === "error" && (N.errorCode === "RISK_CONTROL" || N.errorCode === "CAPTCHA_UNRESOLVED");
          if ((T || M || q) && !L) {
            s.captchaCount++, y.captcha++, We.recordCaptcha(c.id);
            const A = M ? `（${Cn(N)}）` : q ? `（${q.reason}）` : "";
            if (s.errorLog.push(
              `[account=${c.displayName}] 触发验证码${A} @ ${k.url}`
            ), s.failedCount++, y.failed++, !await this.captchaBroker.handleCaptcha({
              accountId: c.id,
              accountDisplayName: c.displayName,
              platform: c.platform,
              taskId: s.taskId,
              runId: s.runId,
              window: v,
              timeoutMs: q == null ? void 0 : q.timeoutMs
            })) {
              s.pauseReason = s.pauseReason ?? "CAPTCHA_TIMEOUT";
              try {
                await this.api.markAccountRiskWithReason(
                  c.id,
                  (q == null ? void 0 : q.reason) ?? "captcha-unresolved",
                  i.cooldownMinutes
                );
              } catch ($) {
                ne.error(`[account=${c.id}] 标记 RISK 失败:`, $);
              }
              return this.notifyProgress(s), l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
            }
            s.current--, y.handled--, s.failedCount--, y.failed--, u.pop(), t.used--, r.usedToday = Math.max(0, r.usedToday - 1), l.push(k), S = 0, this.notifyProgress(s);
            continue;
          }
          if (N.status === "success") {
            try {
              await this.api.upsertBlogger(eh(k, N.data ?? {}));
            } catch (R) {
              return s.current--, y.handled--, u.pop(), t.used--, r.usedToday = Math.max(0, r.usedToday - 1), t.currentShiftCount = Math.max(0, t.currentShiftCount - 1), s.pauseReason = s.pauseReason ?? "BLOGGER_UPSERT_FAILED", s.errorLog.push(
                `[sync] 写回达人 ${k.url} 采集数据失败，已暂停：${R instanceof Error ? R.message : String(R)}`
              ), l.push(k, ...n.slice(_ + 1)), this.notifyProgress(s), { consumed: u, leftover: l, stopPlatform: !0 };
            }
            if (s.successCount++, y.success++, s.processedIds.add(k.id), G = !0, S = 0, We.recordSuccess(c.id, Date.now() - P), !await this.queueProcessedBloggerForSync(s, k.id))
              return s.pauseReason = s.pauseReason ?? "SYNCED_AT_WRITE_FAILED", t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
          } else {
            if (N.errorCode === "AUTH_EXPIRED") {
              s.current--, y.handled--, u.pop(), t.used--, r.usedToday = Math.max(0, r.usedToday - 1), t.currentShiftCount = Math.max(0, t.currentShiftCount - 1), t.removed = !0, l.push(k, ...n.slice(_ + 1));
              const R = Cn(N);
              s.errorLog.push(
                `[account=${c.displayName}] 登录态失效，已切换账号并保留当前达人待处理。${R}`
              );
              try {
                await this.api.markAccountRiskWithReason(
                  c.id,
                  "auth-expired",
                  i.cooldownMinutes
                );
              } catch ($) {
                ne.error(`[account=${c.id}] 标记 AUTH_EXPIRED/RISK 失败:`, $);
              }
              return this.notifyProgress(s), { consumed: u, leftover: l };
            }
            const A = Yf(N.errorCode);
            if (A) {
              if (s.failedCount++, s.terminalDataErrorCount++, S = 0, s.errorLog.push(
                `[data-skip][${c.displayName}] ${k.url}: ${A}，已标记为本轮已处理。${Cn(N)}`
              ), !await this.markTerminalBloggerPlatformStatus(
                s,
                k.id,
                N.errorCode,
                A
              ))
                return t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
              if (!await this.queueProcessedBloggerForSync(s, k.id))
                return s.pauseReason = s.pauseReason ?? "SYNCED_AT_WRITE_FAILED", t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
            } else
              s.failedCount++, y.failed++, S++, We.recordFailure(c.id), s.errorLog.push(
                `[account=${c.displayName}] ${k.url}: ${Cn(N)}`
              );
          }
          if (z)
            return s.pauseReason = s.pauseReason ?? "CAPTCHA_TIMEOUT", this.notifyProgress(s), l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
        } catch (O) {
          s.failedCount++, y.failed++, S++, Kf(O) ? (We.recordTimeout(c.id), s.errorLog.push(
            `[account=${c.displayName}] ${k.url}: TIMEOUT (>${Ui}ms)`
          )) : (We.recordFailure(c.id), s.errorLog.push(
            `[account=${c.displayName}] ${k.url}: ${O instanceof Error ? O.message : String(O)}`
          ));
        }
        if (s.pendingUsage.push({ accountId: c.id, count: 1 }), s.pendingUsage.length >= Mf && !await this.flushUsage(s))
          return t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
        if (this.notifyProgress(s), t.currentShiftCount >= p) {
          if (!await this.flushUsage(s))
            return t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
          if (!await this.startShiftRest(s, c, d))
            return t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
          t.currentShiftCount = 0, t.removed = !0, s.errorLog.push(
            `[account=${c.displayName}] 达到班次上限 ${p} 条，休息 ${Math.round(
              d / 6e4
            )} 分钟`
          ), l.push(...n.slice(_ + 1));
          break;
        }
        if (S >= i.consecutiveFailureThreshold)
          return ne.warn(`[account=${c.id}] 连续失败 ${S} 次，提前换账号`), s.errorLog.push(
            `[account=${c.displayName}] 连续失败 ${S} 次，暂停平台，避免继续扩散风险`
          ), s.pauseReason = s.pauseReason ?? "ACCOUNT_CONSECUTIVE_FAILURES", t.removed = !0, l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
        if (G || S > 0) {
          const O = We.shouldThrottle(c.id);
          if (O.throttle)
            return b.drain(), t.effectiveIntervalMs *= 2, t.removed = !0, s.errorLog.push(
              `[account=${c.displayName}] 触发风控信号 ${O.signal}: ${O.reason}，暂停平台，避免继续扩散风险`
            ), s.pauseReason = s.pauseReason ?? "ACCOUNT_RISK_SIGNAL", l.push(...n.slice(_ + 1)), { consumed: u, leftover: l, stopPlatform: !0 };
        }
      }
    } finally {
      s.currentAccountIds.delete(c.id), s.currentAccountId = s.currentAccountIds.values().next().value ?? null, c.usedToday += t.used, c.usedThisHour += t.used, c.currentShiftCount = t.currentShiftCount, h();
    }
    return { consumed: u, leftover: l };
  }
  // ===========================================================================
  // 辅助
  // ===========================================================================
  async loadNextQueueBatch(e, t, n) {
    try {
      const s = await this.api.listRefreshQueueForPlatform(
        n,
        e.scope,
        e.filterJson
      );
      s.totalCount !== null && (t.targetTotalByPlatform.set(n, s.totalCount), this.applyBackendTargetTotal(t));
      const i = s.list, o = i.map((c) => ({
        id: c.id,
        platform: c.platform,
        url: c.url,
        platformBloggerId: c.platformBloggerId
      })), r = this.appendDiscoveredTargets(t, o);
      return i.length > 0 && r.length === 0 && t.errorLog.push(
        `[${n}] 刷新队列当前批次均已在本次执行中处理，判定该平台本轮队列已耗尽`
      ), r;
    } catch (s) {
      return t.pauseReason = t.pauseReason ?? "REFRESH_QUEUE_UNAVAILABLE", t.errorLog.push(
        `[${n}] 拉取刷新队列失败，已暂停：${s instanceof Error ? s.message : String(s)}`
      ), [];
    }
  }
  appendDiscoveredTargets(e, t) {
    const n = [];
    for (const s of t)
      e.targetIdsAll.has(s.id) || (e.targetIdsAll.add(s.id), e.totalFromBackend || e.total++, n.push(s));
    return n;
  }
  applyBackendTargetTotal(e) {
    const t = Array.from(e.targetTotalByPlatform.values()).reduce(
      (n, s) => n + s,
      0
    );
    t <= 0 || (e.total = Math.max(t, e.current), e.totalFromBackend = !0);
  }
  /** 过滤可用账号（ACTIVE、cooldown/班次休息已过期、未达日/班次上限） */
  filterAvailableAccounts(e, t) {
    const n = Date.now();
    return e.filter(
      (s) => s.status === "ACTIVE" && (!s.cooldownUntil || new Date(s.cooldownUntil).getTime() <= n) && (!s.shiftRestUntil || new Date(s.shiftRestUntil).getTime() <= n) && ((t == null ? void 0 : t.scrapesPerDay) == null || (s.usedToday ?? 0) < t.scrapesPerDay) && ((t == null ? void 0 : t.shiftSize) == null || (s.currentShiftCount ?? 0) < t.shiftSize)
    );
  }
  findPluginForPlatform(e, t) {
    return Array.from(e.values()).find(
      (s) => s.platforms.some((i) => i === t)
    ) ?? null;
  }
  /**
   * 解析账号的指纹 profile。
   *
   * 顺序：
   *   1. listAccounts 返回的 account.fingerprintProfile（理论上 list 不下发，
   *      但若后端将来扩 payload 此路径自动兼容）
   *   2. run state 缓存（一个 run 内只 GET 一次）
   *   3. 调 API `GET /api/scraper-accounts/:id/decrypted-cookie` 拿
   *   4. 都没有 → 返回 null，createWindow 走"不注入指纹"分支
   */
  async resolveFingerprintProfile(e, t) {
    if (t.fingerprintProfile)
      return t.fingerprintProfile;
    if (e.fingerprintCache.has(t.id))
      return e.fingerprintCache.get(t.id) ?? null;
    let n = null;
    try {
      const s = await this.api.getAccountWithProfile(t.id);
      n = (s == null ? void 0 : s.fingerprintProfile) ?? null;
    } catch (s) {
      ne.warn(`[account=${t.id}] 拉取指纹 profile 失败:`, s);
    }
    return e.fingerprintCache.set(t.id, n), n;
  }
  ensureUsage(e, t) {
    let n = e.accountUsage.get(t);
    return n || (n = { handled: 0, success: 0, failed: 0, captcha: 0 }, e.accountUsage.set(t, n)), n;
  }
  cancelCaptchasForState(e) {
    const t = e.currentAccountIds.size > 0 ? Array.from(e.currentAccountIds) : e.currentAccountId ? [e.currentAccountId] : [];
    for (const n of t)
      this.captchaBroker.cancel(n);
  }
  showRunSuccessNotification(e, t) {
    if (!Et.isSupported())
      return;
    const n = new Et({
      title: "采集任务已完成",
      body: `「${e.name}」已全部完成：成功 ${t.successCount} 条，失败 ${t.failedCount} 条。点击查看任务记录。`,
      silent: !1
    });
    this.activeNotifications.add(n);
    const s = () => {
      this.activeNotifications.delete(n);
    };
    n.once("close", s), n.once("failed", s), n.once("click", () => {
      const i = this.getMainWindow();
      i && !i.isDestroyed() && (i.isMinimized() && i.restore(), i.isVisible() || i.show(), i.focus(), i.webContents.send(Fe.navigation.openRoute, {
        route: `/blogger-db/tasks?tab=history&taskId=${encodeURIComponent(e.id)}`
      })), s();
    }), n.show();
  }
  requestStop(e, t) {
    if (!e.cancelled) {
      const n = t === "USER_PAUSED" ? "暂停" : "终止";
      e.errorLog.push(`[user] 用户${n}本次执行 (${(/* @__PURE__ */ new Date()).toISOString()})`);
    }
    e.cancelled = !0, e.pauseReason = e.pauseReason ?? t, this.cancelCaptchasForState(e);
  }
  async flushUsage(e) {
    const t = e.pendingUsage.splice(0);
    if (t.length === 0) return !0;
    try {
      return await this.api.incrementUsageBatch(t), !0;
    } catch (n) {
      return e.pendingUsage.unshift(...t), e.accountingFlushFailed = !0, e.pauseReason = e.pauseReason ?? "ACCOUNT_USAGE_WRITE_FAILED", e.errorLog.push(
        `[usage] 回写账号配额/班次计数失败 ${t.length} 条：${n instanceof Error ? n.message : String(n)}`
      ), ne.warn(`[run=${e.runId}] 配额 batch flush 失败:`, n), !1;
    }
  }
  async queueProcessedBloggerForSync(e, t) {
    return e.pendingSyncedBloggerIds.push(t), e.pendingSyncedBloggerIds.length < Uf ? !0 : this.flushSyncedBloggers(e);
  }
  async markTerminalBloggerPlatformStatus(e, t, n, s) {
    const i = Qf(n);
    if (!i) return !0;
    try {
      return await this.api.markBloggersPlatformStatus([t], i, s), !0;
    } catch (o) {
      return e.errorLog.push(
        `[sync] 回写达人平台状态失败 ${t}：${o instanceof Error ? o.message : String(o)}`
      ), e.syncedAtFlushFailed = !0, e.pauseReason = e.pauseReason ?? "PLATFORM_STATUS_WRITE_FAILED", !1;
    }
  }
  async startShiftRest(e, t, n) {
    const s = /* @__PURE__ */ new Date(), i = new Date(s.getTime() + n);
    try {
      return await this.api.updateAccountShiftState(t.id, {
        currentShiftCount: 0,
        lastShiftEndedAt: s.toISOString(),
        shiftRestUntil: i.toISOString()
      }), t.currentShiftCount = 0, t.lastShiftEndedAt = s.toISOString(), t.shiftRestUntil = i.toISOString(), !0;
    } catch (o) {
      return e.accountingFlushFailed = !0, e.pauseReason = e.pauseReason ?? "SHIFT_STATE_WRITE_FAILED", e.errorLog.push(
        `[shift] 回写账号 ${t.displayName} 班次休息失败：${o instanceof Error ? o.message : String(o)}`
      ), ne.warn(`[run=${e.runId}] 班次状态回写失败:`, o), !1;
    }
  }
  async flushSyncedBloggers(e) {
    const t = e.pendingSyncedBloggerIds.splice(0);
    if (t.length === 0) return !0;
    try {
      await this.api.markBloggersSynced(t);
      for (const n of t) e.processedIds.add(n);
      return !0;
    } catch (n) {
      return e.errorLog.push(
        `[sync] 回写 lastSyncedAt 失败 ${t.length} 条：${n instanceof Error ? n.message : String(n)}`
      ), e.pendingSyncedBloggerIds.unshift(...t), e.syncedAtFlushFailed = !0, e.pauseReason = e.pauseReason ?? "SYNCED_AT_WRITE_FAILED", !1;
    }
  }
  buildAccountUsageJson(e) {
    const t = {};
    for (const [n, s] of e.accountUsage)
      t[n] = s;
    return e.activePoolSnapshot.length > 0 && (t.__activePool = e.activePoolSnapshot), e.pauseReason && (t.__pauseReason = e.pauseReason), t;
  }
  notifyProgress(e) {
    const t = e.errorLog.length > 0 ? e.errorLog.slice(-5) : void 0, n = {
      taskId: e.taskId,
      runId: e.runId,
      current: e.current,
      total: e.total,
      successCount: e.successCount,
      failedCount: e.failedCount,
      captchaCount: e.captchaCount,
      currentAccountId: e.currentAccountId,
      recentErrors: t
    }, s = this.getMainWindow();
    s && !s.isDestroyed() && s.webContents.send(Ne.progress, n), this.flushProgressToDb(e);
  }
  /**
   * 把 run 的进度节流地 fire-and-forget 写一次 DB。
   *
   * 成功计数和 processedBloggerIds 必须一起 checkpoint：
   * 桌面端崩溃/重启后，续跑和导出都依赖 processedBloggerIds 恢复现场。
   */
  flushProgressToDb(e) {
    if (e.cancelled || e.progressFlushInFlight) return;
    const t = Date.now();
    if (t - e.lastProgressFlushAt < Bf) return;
    e.lastProgressFlushAt = t, e.progressFlushInFlight = !0;
    const n = Array.from(e.processedIds), s = {
      targetCount: e.total,
      successCount: e.successCount,
      failedCount: e.failedCount,
      captchaCount: e.captchaCount,
      processedBloggerIds: n.length > 0 ? n : null
    };
    e.progressFlushPromise = this.api.updateRun(e.runId, s).catch((i) => {
      ne.warn(`[run=${e.runId}] 进度回写 DB 失败（忽略，不影响 run）:`, i);
    }).finally(() => {
      e.progressFlushInFlight = !1, e.progressFlushPromise = null;
    });
  }
  notifyRunStatus(e) {
    const t = this.getMainWindow();
    t && !t.isDestroyed() && t.webContents.send(Ne.runStatus, e);
  }
  delay(e) {
    return new Promise((t) => setTimeout(t, e));
  }
  /** 销毁所有资源 */
  dispose() {
    for (const e of this.activeRuns.values())
      e.cancelled = !0;
    this.captchaBroker.cancelAll(), this.windowManager.closeAll(), this.activeRuns.clear(), Ni.clear(), We.clear(), Oi.clear();
  }
};
w(Bn, "PACE_POLICY_TTL_MS", 6e4);
let Va = Bn;
function Hf(a, e) {
  const t = a.filter((s) => s.status === "ACTIVE");
  if (t.length === 0 || e.length === 0) return [];
  const n = t.map((s) => ({ account: s, targets: [] }));
  for (let s = 0; s < e.length; s++)
    n[s % n.length].targets.push(e[s]);
  return n;
}
function Wf(a, e = xt) {
  return Math.max(1, Math.floor((a.shiftSize ?? 25) * e.shiftSizeFactor));
}
function Vf(a, e = xt) {
  return Math.max(0, Math.round((a.shiftRestMinutes ?? 15) * e.restFactor * 6e4));
}
function Gf(a, e, t, n = xt) {
  if (a <= 0 || e <= 0 || t.filter((o) => o > 0).length === 0) return 0;
  const i = Math.max(1, Math.ceil(e * n.kRatio));
  return Math.min(e, jf, i);
}
function Jf(a, e) {
  return e <= 0 || a.length === 0 ? [] : a.map((t) => ({ account: t, tieBreaker: Math.random() })).sort((t, n) => {
    const s = t.account.lastShiftEndedAt ? new Date(t.account.lastShiftEndedAt).getTime() : Number.NEGATIVE_INFINITY, i = n.account.lastShiftEndedAt ? new Date(n.account.lastShiftEndedAt).getTime() : Number.NEGATIVE_INFINITY;
    return s !== i ? s - i : t.account.weight !== n.account.weight ? n.account.weight - t.account.weight : t.tieBreaker - n.tieBreaker;
  }).slice(0, e).map((t) => t.account);
}
function Bi(a, e, t = xt) {
  const n = Math.max(0, e.scrapesPerDay - a.usedToday), s = a.maxPerTaskOverride ?? e.maxPerTask;
  return Math.min(n, s);
}
async function ji(a, e, t) {
  if (a.length === 0) return;
  const n = Math.max(1, Math.min(e, a.length));
  let s = 0;
  const i = Array.from({ length: n }, async () => {
    for (; s < a.length; ) {
      const o = a[s++];
      await t(o);
    }
  });
  await Promise.all(i);
}
function Kf(a) {
  if (!a) return !1;
  if (a instanceof Error) {
    if (a.message === xr) return !0;
    const e = a.message.toLowerCase();
    if (e.includes("timeout") || e.includes("timed out") || e.includes("aborted"))
      return !0;
    const t = a.code;
    if (t === "ETIMEDOUT" || t === "ESOCKETTIMEDOUT") return !0;
  }
  return !1;
}
function Xf(a) {
  const e = a instanceof Error ? a.message : String(a);
  return e.includes("已有一个采集任务在运行") || e.includes("platform lock");
}
function Yf(a) {
  return a === "INVALID_TARGET_URL" ? "链接无效或无法识别达人 ID" : a === "TARGET_NOT_FOUND" ? "目标达人不存在或未被平台收录" : null;
}
function Qf(a) {
  return a === "INVALID_TARGET_URL" ? "INVALID_URL" : a === "TARGET_NOT_FOUND" ? "NOT_FOUND" : null;
}
function Zf(a, e, t) {
  return a <= 0 || e !== "ACCOUNT_CONSECUTIVE_FAILURES" ? 0 : t.filter(
    (s) => s.includes("未在星图找到该博主") || s.includes("[data-skip]")
  ).length >= a ? a : 0;
}
function eh(a, e) {
  const t = me(e.nickname) ?? me(e.昵称) ?? a.platformBloggerId, n = a.platform === "PGY" ? me(e.pgyUrl) : null;
  return {
    platform: a.platform,
    platformBloggerId: a.platformBloggerId,
    nickname: t,
    avatar: me(e.avatar) ?? me(e.头像),
    url: n ?? me(e.url) ?? me(e.主页链接) ?? a.url,
    gender: me(e.gender) ?? me(e.性别),
    location: me(e.location) ?? me(e.地区),
    category: me(e.category) ?? me(e.博主分类),
    fansCount: zi(e.fansCount ?? e.粉丝数),
    interactRate: zi(e.interactRate),
    priceJson: th(e.priceJson),
    contactWechat: me(e.contactWechat),
    contactPhone: me(e.contactPhone),
    contactEmail: me(e.contactEmail),
    tags: me(e.tags) ?? me(e.featureTags) ?? me(e.personalTags),
    remark: me(e.remark),
    source: "SCRAPE",
    rawData: e
  };
}
function me(a) {
  if (typeof a == "string") {
    const e = a.trim();
    return e.length > 0 ? e : null;
  }
  return typeof a == "number" && Number.isFinite(a) ? String(a) : null;
}
function zi(a) {
  if (typeof a == "number" && Number.isFinite(a)) return a;
  if (typeof a == "string") {
    const e = a.replace(/[,，%]/g, "").trim();
    if (e.length === 0) return null;
    const t = Number(e);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
function th(a) {
  return !a || typeof a != "object" || Array.isArray(a) ? null : a;
}
function Cn(a) {
  const e = [`errorCode=${a.errorCode ?? "UNKNOWN_ERROR"}`], t = nh(a.errorDetails);
  return t && e.push(t), e.push(`message=${a.errorMessage ?? "unknown"}`), e.join(", ");
}
function nh(a) {
  if (!a) return null;
  const e = Object.entries(a).filter(([, t]) => t != null && t !== "").map(([t, n]) => `${t}=${String(n)}`);
  return e.length > 0 ? e.join(", ") : null;
}
function ah(a) {
  if (a.isDestroyed()) return !1;
  const e = a.webContents.getURL();
  return e.includes("captcha") || e.includes("security-verification") || e.includes("verify");
}
function sh(a, e) {
  if (!a || a.length === 0) return null;
  const t = e ?? "";
  if (!t) return null;
  for (const n of a)
    if (n.pattern instanceof RegExp) {
      if (n.pattern.test(t)) return n;
    } else if (t.includes(n.pattern))
      return n;
  return null;
}
const J = Y("Scheduler"), ih = 6e4, qi = 5, Hi = 25;
function oh(a, e) {
  if (a === "MANUAL") return null;
  if (e && Da.validate(e)) return e;
  switch (a) {
    case "DAILY":
      return "0 3 * * *";
    case "WEEKLY":
      return "0 3 * * 0";
    case "MONTHLY":
      return "0 3 1 * *";
    default:
      return null;
  }
}
class rh {
  constructor(e) {
    w(this, "registry", /* @__PURE__ */ new Map());
    w(this, "syncTimer", null);
    w(this, "dispatcher");
    w(this, "getMainWindow");
    w(this, "syncing", !1);
    w(this, "startupRecoveryDone", !1);
    this.dispatcher = e.dispatcher, this.getMainWindow = e.getMainWindow;
  }
  /** 启动定时同步 */
  start() {
    this.syncTimer || (J.info("Scheduler 启动"), this.syncFromBackend().catch((e) => {
      J.warn("首次 syncFromBackend 失败:", e);
    }), this.syncTimer = setInterval(() => {
      this.syncFromBackend().catch((e) => {
        J.warn("定时 syncFromBackend 失败:", e);
      });
    }, ih));
  }
  /** 停止所有调度 */
  stop() {
    J.info("Scheduler 停止"), this.syncTimer && (clearInterval(this.syncTimer), this.syncTimer = null);
    for (const e of this.registry.values())
      try {
        const t = e.cronTask.stop();
        t instanceof Promise && t.catch((n) => J.warn(`停止 cron task=${e.task.id} 失败:`, n));
      } catch (t) {
        J.warn(`停止 cron task=${e.task.id} 失败:`, t);
      }
    this.registry.clear();
  }
  /** 强制刷新一次（IPC 调用） */
  async forceSync() {
    await this.syncFromBackend();
  }
  /**
   * 桌面端启动恢复：主进程重启后，后端可能残留 RUNNING run 和平台锁。
   * 只在当前进程拿到登录态后执行一次；如果本进程已经有 active run，说明不是冷启动恢复，跳过。
   */
  async recoverInterruptedRunsOnce() {
    if (this.startupRecoveryDone) return;
    const e = Le.get();
    if (!(!e.isAuthenticated() || !e.isEnterpriseScoped())) {
      if (this.dispatcher.countAllRuns() > 0) {
        J.info("检测到本进程已有 active run，跳过启动恢复");
        return;
      }
      this.startupRecoveryDone = !0;
      try {
        const t = await e.recoverInterruptedRuns();
        t.updated > 0 && J.warn(
          `[recovery] 已把 ${t.updated} 个残留 RUNNING run 改为 PAUSED: ${t.runIds.join(",")}`
        );
      } catch (t) {
        J.warn("[recovery] 恢复残留 RUNNING run 失败:", t);
      }
    }
  }
  /** 当前已注册任务（用于 IPC status） */
  getStatus() {
    return {
      registeredTasks: Array.from(this.registry.values()).map((e) => ({
        taskId: e.task.id,
        name: e.task.name,
        cronExpression: e.cronExpression,
        scheduleType: e.task.scheduleType
      })),
      activeRuns: this.dispatcher.listActiveRuns()
    };
  }
  /** 手动触发一次（前端"立即执行"） */
  async runNow(e) {
    const t = Le.get();
    if (!t.isAuthenticated())
      throw new Error("未登录，无法手动触发");
    const s = (await t.listTasks()).find((i) => i.id === e);
    if (!s)
      throw new Error("任务不存在或无权访问");
    if (!this.canStartRun(s))
      throw new Error("已达并发上限，请稍后再试");
    return this.dispatcher.runTask(s).then((i) => {
      i || J.warn(`手动触发 task=${e} 未创建有效 run`);
    }).catch((i) => {
      J.error(`手动触发 task=${e} 后台执行失败:`, i);
    }), null;
  }
  /**
   * 检查是否可以启动新的 run（P5.5 PRD §6 任务并发限制）。
   *
   * - per-org-platform=1：调度器按当前 activeRuns 拦截，避免手动/cron 同时触发同平台任务
   * - per-org=5：检查同 org 当前 RUNNING 数
   * - global=25：检查全部 RUNNING 数
   *
   * 触发限制时不立即执行，返回 false，scheduler 把任务排队到下一轮 cron 重试。
   */
  canStartRun(e) {
    const t = e.organizationId;
    return this.dispatcher.countAllRuns() >= Hi ? (J.warn(
      `[concurrency] 已达全局上限 ${Hi}，task org=${t} 排队`
    ), !1) : this.dispatcher.hasActiveRunForAnyPlatform(t, e.platforms) ? (J.warn(
      `[concurrency] org=${t} platform=${e.platforms.join(",")} 已有任务运行，排队`
    ), !1) : this.dispatcher.countRunsByOrg(t, (i) => {
      const o = this.registry.get(i);
      return (o == null ? void 0 : o.task.organizationId) ?? null;
    }) >= qi ? (J.warn(`[concurrency] org=${t} 已达 ${qi}，排队`), !1) : !0;
  }
  // ===========================================================================
  // 同步逻辑
  // ===========================================================================
  async syncFromBackend() {
    if (!this.syncing) {
      this.syncing = !0;
      try {
        const e = Le.get();
        if (!e.isAuthenticated()) {
          this.registry.size > 0 && (J.info("未登录，卸载所有已注册任务"), this.unregisterAll());
          return;
        }
        if (!e.isEnterpriseScoped()) {
          this.registry.size > 0 && (J.info("账号未加入企业，卸载所有已注册任务"), this.unregisterAll());
          return;
        }
        let t;
        try {
          t = await e.listTasks(!0);
        } catch (s) {
          if (!e.isEnterpriseScoped())
            return;
          J.warn("拉取任务失败:", s);
          return;
        }
        const n = /* @__PURE__ */ new Map();
        for (const s of t)
          s.enabled && s.scheduleType !== "MANUAL" && n.set(s.id, s);
        for (const [s] of this.registry)
          n.has(s) || this.unregister(s);
        for (const [s, i] of n) {
          const o = this.registry.get(s), r = oh(i.scheduleType, i.cronExpression);
          r && (o ? (o.cronExpression !== r || o.task.name !== i.name || o.task.scheduleType !== i.scheduleType || JSON.stringify(o.task.platforms) !== JSON.stringify(i.platforms)) && (this.unregister(s), this.register(i, r)) : this.register(i, r));
        }
        this.runDueRetryTasks(t), this.notifyScheduleChanged();
      } finally {
        this.syncing = !1;
      }
    }
  }
  register(e, t) {
    if (!Da.validate(t)) {
      J.warn(`[task=${e.id}] cron 表达式无效: "${t}"，跳过`);
      return;
    }
    const n = Da.schedule(
      t,
      () => {
        if (J.info(`[cron] 触发任务 task=${e.id} name=${e.name}`), !this.canStartRun(e)) {
          J.warn(`[cron] task=${e.id} 因并发上限延迟，等待下一轮 cron 重试`);
          return;
        }
        this.dispatcher.runTask(e).catch((s) => {
          J.error(`[cron] task=${e.id} 执行失败:`, s);
        });
      },
      { name: `scraping-task-${e.id}`, noOverlap: !0 }
    );
    this.registry.set(e.id, { task: e, cronTask: n, cronExpression: t }), J.info(`[task=${e.id}] 已注册: cron="${t}", name=${e.name}`);
  }
  runDueRetryTasks(e) {
    const t = Date.now();
    for (const n of e) {
      if (!n.enabled || !n.nextRunAt) continue;
      const s = new Date(n.nextRunAt).getTime();
      if (!(!Number.isFinite(s) || s > t)) {
        if (!this.canStartRun(n)) {
          J.warn(`[retry] task=${n.id} 已到重试时间，但并发上限未释放，等待下一次同步`);
          continue;
        }
        J.info(`[retry] 触发到期重试 task=${n.id} nextRunAt=${n.nextRunAt}`), this.dispatcher.runTask(n).catch((i) => {
          J.error(`[retry] task=${n.id} 执行失败:`, i);
        });
      }
    }
  }
  unregister(e) {
    const t = this.registry.get(e);
    if (t) {
      try {
        const n = t.cronTask.stop();
        n instanceof Promise && n.catch((s) => J.warn(`停止 cron task=${e} 失败:`, s));
      } catch (n) {
        J.warn(`停止 cron task=${e} 失败:`, n);
      }
      this.registry.delete(e), J.info(`[task=${e}] 已卸载`);
    }
  }
  /**
   * 卸载所有 cron 任务。
   *
   * 用于：
   *   - 内部 sync 时发现未登录（auth 状态变化）
   *   - 主进程 API 拿到 401 后立即卸载，避免每 60s 重试一次 → 死循环 401
   */
  unregisterAll() {
    for (const e of Array.from(this.registry.keys()))
      this.unregister(e);
  }
  notifyScheduleChanged() {
    const e = this.getMainWindow();
    e && !e.isDestroyed() && e.webContents.send(Ne.scheduleChanged, this.getStatus());
  }
}
const pt = Y("SchedulerModule");
let dt = null;
const vr = "scraping-scheduler:set-auth";
function ch(a) {
  if (dt) {
    pt.warn("已初始化，跳过重复 init");
    return;
  }
  const e = new Va({
    getMainWindow: a.getMainWindow,
    getPlugins: a.getPlugins
  }), t = new rh({
    dispatcher: e,
    getMainWindow: a.getMainWindow
  });
  dt = { dispatcher: e, scheduler: t }, Le.get().setAuthExpiredHandler(() => {
    pt.warn("主进程 API 拿到 401，卸载所有 cron 任务 + 通知渲染进程");
    try {
      t.unregisterAll();
    } catch (s) {
      pt.warn("卸载 cron 失败:", s);
    }
    const n = a.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(Ne.authExpired);
  }), uh(dt), pt.info("采集调度器云端同步已关闭");
}
function lh() {
  dt && (pt.info("销毁采集调度器"), Le.get().setAuthExpiredHandler(null), dt.scheduler.stop(), dt.dispatcher.dispose(), ph(), dt = null);
}
function uh(a) {
  F.handle(
    vr,
    async (e, t) => (Le.get().setAuth(t.baseUrl, t.token), { ok: !0, disabled: !0 })
  ), F.handle(
    Ne.runNow,
    async (e, t) => {
      try {
        return { ok: !0, runId: await a.scheduler.runNow(t.taskId) };
      } catch (n) {
        return pt.error("runNow 失败:", n), { ok: !1, error: n instanceof Error ? n.message : String(n) };
      }
    }
  ), F.handle(
    Ne.cancelRunning,
    (e, t) => {
      if (t.runId)
        return { ok: a.dispatcher.cancelRun(t.runId) };
      if (t.taskId) {
        const n = a.dispatcher.cancelTask(t.taskId);
        return { ok: n > 0, count: n };
      }
      return { ok: !1, error: "需要 runId 或 taskId" };
    }
  ), F.handle(Ne.status, () => ({ registeredTasks: [], activeRuns: [], disabled: !0 }));
}
function ph() {
  F.removeHandler(vr), F.removeHandler(Ne.runNow), F.removeHandler(Ne.cancelRunning), F.removeHandler(Ne.status);
}
const dh = Ka(import.meta.url), yr = Ja(dh), Ee = Y("Main"), Xt = !ye.isPackaged;
Ee.info(`应用启动 — 模式: ${Xt ? "开发" : "生产"}, isPackaged: ${ye.isPackaged}`);
let Z = null;
function logRendererDiagnostic(...a) {
  try {
    const e = Oe(ye.getPath("userData"), "magiorix-renderer-diagnostic.log"), t = a.map((n) => typeof n == "string" ? n : JSON.stringify(n)).join(" ");
    Kt.appendFileSync(e, `[${pgyBeijingTimestamp()}] ${t}
`);
  } catch {
  }
}
function Ga(a) {
  const e = co();
  if (Z = new Dt({
    width: e.width,
    height: e.height,
    minWidth: tn,
    minHeight: nn,
    resizable: !0,
    minimizable: !0,
    maximizable: !0,
    fullscreenable: !1,
    movable: !0,
    show: !1,
    // 先不显示，等加载完成后再显示
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: Oe(yr, "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !0
    }
  }), Hr(Z), Xt) {
    const t = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:4000";
    Z.loadURL(t), process.env.ELECTRON_OPEN_DEVTOOLS === "true" && Z.webContents.openDevTools();
  } else {
    const t = Oe(a, "index.html");
    Ee.info("加载前端资源:", t), Z.loadFile(t).catch((n) => {
      Ee.error("加载前端资源失败:", n), Xr(`加载前端资源失败：${pgyAssetErrorMessage(n)}`);
    });
  }
  return Z.once("ready-to-show", () => {
    Rd(Z), Xt || Ae.setupWindowFocusListener(Z), Xt || cr(), setTimeout(() => {
      Z && !Z.isDestroyed() && !Z.isVisible() && !Z.isMinimized() && (Ee.warn("主窗口 10 秒内未显示，强制显示（渲染进程可能未调用 setLoginState）"), Z.show(), Rn());
    }, 1e4);
  }), Z.once("show", () => {
    Rn();
  }), Z.webContents.on(
    "did-fail-load",
    (t, n, s, i) => {
      Ee.error(`页面加载失败: ${n} ${s} URL: ${i}`), Xr(`加载前端资源失败：${n} ${s} ${i || ""}`);
    }
  ), Z.webContents.on("render-process-gone", (t, n) => {
    Ee.error("渲染进程崩溃:", n.reason);
  }), Z.webContents.on("console-message", (t, n, s, i, o) => {
    logRendererDiagnostic("console", n, s, i, o);
  }), Z.webContents.on("did-finish-load", () => {
    if (!Z || Z.isDestroyed()) return;
    Z.webContents.executeJavaScript(`
      (() => ({
        href: location.href,
        hash: location.hash,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500),
        rootHtmlLength: (document.getElementById("root")?.innerHTML || "").length,
        rootText: (document.getElementById("root")?.innerText || "").slice(0, 500),
        localStorageKeys: Object.keys(localStorage)
      }))()
    `, !0).then((t) => logRendererDiagnostic("page-state", t)).catch((t) => logRendererDiagnostic("page-state-error", t instanceof Error ? t.stack : String(t)));
  }), Z.on("closed", () => {
    Z = null;
  }), Z;
}
async function mh() {
  try {
    const a = Ae.getLocalVersion(), e = await Ae.getRemoteVersion();
    if (!a || a !== e.version) {
      Ee.info(`发现新版本 ${e.version}，后台下载中...`);
      const t = await Ae.downloadAssets(e, () => {
      });
      await Ae.applyAssets(t, e.version), Ee.info("后台资源更新完成，下次启动生效");
    } else
      Ee.info("前端资源已是最新版本");
  } catch (a) {
    Ee.warn("后台资源检查失败（不影响当前使用）:", a);
  }
}
async function Wi() {
  jt("正在检查版本..."), zt(10);
  try {
    const a = await Ae.getRemoteVersion();
    Ee.info("远程版本:", a.version), jt(`正在下载 ${a.version}...`), zt(30);
    const e = await Ae.downloadAssets(a, (t) => {
      zt(30 + t * 0.5), jt(`正在下载... ${Math.round(t)}%`);
    });
    jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("正在校验资源完整性..."), zt(95), pgyVerifyAssets(Ae.getCurrentAssetsPath()), jt("正在加载前端资源..."), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());
  } catch (a) {
    Ee.error("资源获取失败:", a), Xr(a instanceof Error ? a.message : "资源下载失败");
  }
}
async function Vi() {
  if (Ee.debug("startApp 执行"), Xt) {
    Ga(Oe(yr, "../dist"));
    return;
  }
  ee || await Jr(), Kr(), Qr(() => {
    Vi();
  }), jt("正在检查本地资源..."), zt(10);
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html"));
  Ee.info(`资源检查 — assetsPath: ${a}, hasLocalAssets: ${e}`);
  if (e)
    try {
      jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a), mh();
    } catch (t) {
      const n = pgyAssetErrorMessage(t);
      Ee.error("本地资源校验失败:", t), Xr(n.includes("资源被修改或损坏") ? n : `资源被修改或损坏：${n}`);
    }
  else
    Ee.info("无本地资源，显示启动页下载"), jt("未找到本地资源，准备下载..."), zt(20), await Wi();
}
function fh() {
  Wr(() => Z), Mr(), Ae.registerHandlers(), kd(), vf(() => Z), ch({
    getMainWindow: () => Z,
    getPlugins: () => bf()
  });
}
process.on("unhandledRejection", (a) => {
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
});
ye.on("window-all-closed", () => {
  Ee.info("所有窗口已关闭");
  process.platform !== "darwin" && ye.quit();
});
ye.on("before-quit", () => {
  Ee.info("应用准备退出");
  Rn(), lh(), yf();
});
