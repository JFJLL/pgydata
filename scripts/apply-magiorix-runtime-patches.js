const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const mainPath = path.join(projectRoot, "app-source", "dist-electron", "index.js");
const preloadPath = path.join(projectRoot, "app-source", "dist-electron", "preload.mjs");

function replaceOnce(source, from, to, label) {
  const fromCrLf = from.replace(/\n/g, "\r\n");
  const toCrLf = to.replace(/\n/g, "\r\n");
  if (!source.includes(from)) {
    if (source.includes(fromCrLf)) return source.replace(fromCrLf, toCrLf);
    if (source.includes(to)) return source;
    if (source.includes(toCrLf)) return source;
    throw new Error(`Missing patch target: ${label}`);
  }
  return source.replace(from, to);
}

function replaceAllIfExists(source, from, to) {
  if (!source.includes(from)) return source;
  return source.split(from).join(to);
}

function insertAfterOnce(source, marker, insert, already, label) {
  if (source.includes(already)) return source;
  if (!source.includes(marker)) throw new Error(`Missing patch marker: ${label}`);
  return source.replace(marker, `${marker}\n${insert}`);
}

let main = fs.readFileSync(mainPath, "utf8");
let preload = fs.readFileSync(preloadPath, "utf8");

const legacyHost = `https://${"api"}.red-magic.cn`;
main = main.split(legacyHost).join("https://magiorix.red-magic.cn");

preload = replaceOnce(
  preload,
  "onStatusChanged:e=>{r.ipcRenderer.on(s.auth.statusChanged,(n,a)=>{e(a)})}",
  "onStatusChanged:e=>{const n=(a,t)=>e(t);return r.ipcRenderer.on(s.auth.statusChanged,n),()=>r.ipcRenderer.removeListener(s.auth.statusChanged,n)}",
  "scraper auth status listener cleanup",
);

if (!main.includes("采集任务启动 plugin=")) {
  main = replaceOnce(
    main,
    'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);',
    'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);\n    ue.info(`[task=${t}] 采集任务启动 plugin=${n} taskType=${s} accountSource=${c} total=${i.length} file=${o}`);',
    "scraper task start logging",
  );
  main = replaceOnce(
    main,
    `const p = \`scrape-\${t}\`, d = this.scrapeWindowManager.createWindow(p, {
      url: u.baseUrl,
      show: !1,
      partition: u.sessionPartition
    });`,
    `const p = \`scrape-\${t}\`, d = this.scrapeWindowManager.createWindow(p, {
      url: u.baseUrl,
      show: !1,
      partition: u.sessionPartition
    });
    ue.info(\`[task=\${t}] 隐藏采集窗口已创建 plugin=\${n} baseUrl=\${u.baseUrl} partition=\${u.sessionPartition ?? "(默认)"}\`);`,
    "scraper hidden window logging",
  );
  main = replaceOnce(
    main,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: Math.max(0, Math.round(m / l.total * 100))
      });
      try {`,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: Math.max(0, Math.round(m / l.total * 100))
      });
      ue.info(\`[task=\${t}] 开始采集第 \${m + 1}/\${i.length} 条 plugin=\${n} taskType=\${s} url=\${String(f).slice(0, 180)}\`);
      try {`,
    "scraper item start logging",
  );
  main = replaceOnce(
    main,
    `          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });
      } catch (v) {`,
    `          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
      } catch (v) {
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);`,
    "scraper item result logging",
  );
  main = replaceOnce(
    main,
    `    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;
    l.cancelled ? this.sendToRenderer(W.task.complete, {`,
    `    this.scrapeWindowManager.closeWindow(p);
    const h = Date.now() - l.startTime;
    ue.info(\`[task=\${t}] 采集任务结束 plugin=\${n} taskType=\${s} cancelled=\${l.cancelled} success=\${l.successCount} error=\${l.errorCount} durationMs=\${h}\`);
    l.cancelled ? this.sendToRenderer(W.task.complete, {`,
    "scraper task complete logging",
  );
  main = replaceOnce(
    main,
    't && (t.cancelled = !0, t.paused && t.pauseResolver && t.pauseResolver(), ue.info(`任务已取消: ${e}`));',
    't && (t.cancelled = !0, t.paused && t.pauseResolver && t.pauseResolver(), ue.info(`任务已取消: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`));',
    "scraper cancel logging",
  );
  main = replaceOnce(
    main,
    't && !t.paused && !t.cancelled && (t.paused = !0, ue.info(`任务已暂停: ${e}`), this.sendToRenderer(W.task.paused, {',
    't && !t.paused && !t.cancelled && (t.paused = !0, ue.info(`任务已暂停: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {',
    "scraper pause logging",
  );
  main = replaceOnce(
    main,
    't && t.paused && (t.paused = !1, t.pauseResolver && (t.pauseResolver(), t.pauseResolver = void 0), ue.info(`任务已继续: ${e}`), this.sendToRenderer(W.task.paused, {',
    't && t.paused && (t.paused = !1, t.pauseResolver && (t.pauseResolver(), t.pauseResolver = void 0), ue.info(`任务已继续: ${e}, plugin=${t.pluginId}, taskType=${t.taskType}, current=${t.current}/${t.total}`), this.sendToRenderer(W.task.paused, {',
    "scraper resume logging",
  );
}

if (!main.includes("日额度已满或本班次已满")) {
  main = replaceOnce(
    main,
    `      const l = this.mergeEnterprisePolicy(c, u), p = Date.now(), d = r.filter((v) => {
        const y = v.cooldownUntil ? new Date(v.cooldownUntil).getTime() : 0, b = v.shiftRestUntil ? new Date(v.shiftRestUntil).getTime() : 0, S = l.shiftSize - (v.currentShiftCount ?? 0);
        return y <= p && b <= p && S > 0;
      });
      if (d.length === 0)
        throw new Error(
          \`企业账号池暂无可用账号（共 \${r.length} 个，全部在班次休息、冷却或本班次已满）\`
        );`,
    `      const l = this.mergeEnterprisePolicy(c, u), p = Date.now(), d = r.filter((v) => {
        const y = v.cooldownUntil ? new Date(v.cooldownUntil).getTime() : 0, b = v.shiftRestUntil ? new Date(v.shiftRestUntil).getTime() : 0, S = l.shiftSize - (v.currentShiftCount ?? 0), x = l.scrapesPerDay == null ? Number.POSITIVE_INFINITY : l.scrapesPerDay - (v.usedToday ?? 0);
        return y <= p && b <= p && S > 0 && x > 0;
      });
      if (d.length === 0)
        throw new Error(
          \`企业账号池暂无可用账号（共 \${r.length} 个，全部在班次休息、冷却、日额度已满或本班次已满）\`
        );`,
    "enterprise account pool daily budget availability",
  );
}

if (!main.includes("scrapesPerDay: s, shiftSize: o, shiftRestMinutes: c")) {
  main = replaceOnce(
    main,
    `  mergeEnterprisePolicy(e, t) {
    const n = Math.max(
      (t == null ? void 0 : t.minIntervalMs) ?? e.minIntervalMs,
      _i
    ), s = (t == null ? void 0 : t.shiftSize) ?? e.shiftSize, i = Math.max(1, Math.floor(s * ((t == null ? void 0 : t.shiftSizeFactor) ?? 1))), o = (t == null ? void 0 : t.shiftRestMinutes) ?? e.shiftRestMinutes, r = Math.max(0, o * ((t == null ? void 0 : t.restFactor) ?? 1));
    return { minIntervalMs: n, shiftSize: i, shiftRestMinutes: r };
  }`,
    `  mergeEnterprisePolicy(e, t) {
    const n = Math.max(
      (t == null ? void 0 : t.minIntervalMs) ?? e.minIntervalMs,
      _i
    ), s = (t == null ? void 0 : t.scrapesPerDay) ?? e.scrapesPerDay, i = (t == null ? void 0 : t.shiftSize) ?? e.shiftSize, o = Math.max(1, Math.floor(i * ((t == null ? void 0 : t.shiftSizeFactor) ?? 1))), r = (t == null ? void 0 : t.shiftRestMinutes) ?? e.shiftRestMinutes, c = Math.max(0, r * ((t == null ? void 0 : t.restFactor) ?? 1));
    return { minIntervalMs: n, scrapesPerDay: s, shiftSize: o, shiftRestMinutes: c };
  }`,
    "enterprise policy merges daily budget",
  );
}

if (!main.includes("this.filterAvailableAccounts(l, u)")) {
  main = replaceOnce(
    main,
    `      const m = this.filterAvailableAccounts(l);
      if (m.length === 0) {`,
    `      const m = this.filterAvailableAccounts(l, u);
      if (m.length === 0) {`,
    "dispatcher passes active policy to account availability filter",
  );
}

if (!main.includes("未达日/班次上限")) {
  main = replaceOnce(
    main,
    `  /** 过滤可用账号（ACTIVE、cooldown/班次休息已过期） */
  filterAvailableAccounts(e) {
    const t = Date.now();
    return e.filter(
      (n) => n.status === "ACTIVE" && (!n.cooldownUntil || new Date(n.cooldownUntil).getTime() <= t) && (!n.shiftRestUntil || new Date(n.shiftRestUntil).getTime() <= t)
    );
  }`,
    `  /** 过滤可用账号（ACTIVE、cooldown/班次休息已过期、未达日/班次上限） */
  filterAvailableAccounts(e, t) {
    const n = Date.now();
    return e.filter(
      (s) => s.status === "ACTIVE" && (!s.cooldownUntil || new Date(s.cooldownUntil).getTime() <= n) && (!s.shiftRestUntil || new Date(s.shiftRestUntil).getTime() <= n) && ((t == null ? void 0 : t.scrapesPerDay) == null || (s.usedToday ?? 0) < t.scrapesPerDay) && ((t == null ? void 0 : t.shiftSize) == null || (s.currentShiftCount ?? 0) < t.shiftSize)
    );
  }`,
    "dispatcher account availability respects daily and shift caps",
  );
}

if (!main.includes('message: "没有可采集的链接"')) {
  main = replaceOnce(
    main,
    `    if (!u) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: \`未知插件: \${n}\`
      });
      return;
    }
    const existingTask = Array.from(this.runningTasks.values()).find((m) => m.pluginId === n && !m.cancelled);`,
    `    if (!u) {
      this.sendToRenderer(W.task.error, {
        taskId: t,
        message: \`未知插件: \${n}\`
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
    const existingTask = Array.from(this.runningTasks.values()).find((m) => m.pluginId === n && !m.cancelled);`,
    "personal task empty url precheck",
  );
}

if (!main.includes("pace: this.getPersonalTaskPace(e)")) {
  main = replaceOnce(
    main,
    `      paused: !1,
      accountSource: c
    };
    if (this.runningTasks.set(t, l), c === "enterprise") {`,
    `      paused: !1,
      accountSource: c,
      pace: this.getPersonalTaskPace(e)
    };
    if (this.runningTasks.set(t, l), c !== "enterprise") {
      try {
        const m = await this.withTimeout(
          u.checkAuth(),
          Wd,
          \`授权检测超时: \${n}\`
        );
        if (!m.authorized) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: \`\${u.name} 授权不可用，请重新授权后再开始采集\`,
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
    if (c === "enterprise") {`,
    "personal task auth precheck and pace config",
  );
}

if (!main.includes("errorCategoryLabel: b.label")) {
  main = replaceOnce(
    main,
    `        y.status === "success" ? l.successCount++ : l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: y.status,
          data: y.data,
          errorMessage: y.errorMessage,
          errorCode: y.errorCode,
          errorDetails: y.errorDetails
        });`,
    `        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
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
        });`,
    "personal task result failure category",
  );
}

if (!main.includes('errorCategoryLabel: y.label')) {
  main = replaceOnce(
    main,
    `      } catch (v) {
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
        l.errorCount++, this.sendToRenderer(W.task.itemResult, {
          taskId: t,
          index: m,
          status: "error",
          data: null,
          errorMessage: v instanceof Error ? v.message : String(v),
          errorCode: "UNKNOWN_ERROR"
        });
      }`,
    `      } catch (v) {
        const y = this.classifyFailure("UNKNOWN_ERROR", v instanceof Error ? v.message : String(v));
        ue.error(\`[task=\${t}] 采集第 \${m + 1}/\${i.length} 条异常 plugin=\${n} url=\${String(f).slice(0, 180)}\`, v);
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
      }`,
    "personal task exception failure category",
  );
}

if (!main.includes("checkShumiaoBalanceForTask(e)")) {
  main = replaceOnce(
    main,
    `  async getPacePolicy(e) {
    return (await this.request(
      "GET",
      \`/api/pace-policies/\${encodeURIComponent(e)}\`
    )).data ?? null;
  }
  async checkShumiaoBalanceForTask(e) {
    const t = Array.isArray(e.urls) ? e.urls.length : 0;
    if (t <= 0)
      throw new Error("没有可计费的采集链接");
    if (!this.isAuthenticated())
      throw new Error("未登录，无法判定积分余额");
    const n = await this.request("GET", \`/api/shumiao/check-balance?count=\${encodeURIComponent(String(t))}\`), s = Number(n.data?.balance ?? 0), i = Number(n.data?.required ?? t), o = Number(n.data?.shortage ?? Math.max(0, i - s));
    if (!n.data?.sufficient)
      throw new Error(\`树苗余额不足：当前 \${s}，本次需要 \${i}，还差 \${o}\`);
    return s;
  }
  async consumeShumiaoForItem(e, t) {
    if (!this.isAuthenticated())
      throw new Error("未登录，无法扣减积分");
    const n = Array.isArray(e.urls) ? e.urls[t] : null, s = {
      inputType: e.inputType || (String(e.fileName || "").includes("手动输入") ? "manual" : "xlsx"),
      pluginId: e.pluginId,
      taskType: e.taskType,
      fileName: e.fileName,
      totalRows: e.totalRows ?? (Array.isArray(e.urls) ? e.urls.length : 0),
      validCount: Array.isArray(e.urls) ? e.urls.length : 0,
      itemIndex: t + 1,
      url: n
    }, i = await this.request("POST", "/api/shumiao/consume", {
      count: 1,
      remark: \`采集成功扣减 1 树苗\`,
      detail: s
    });
    return Number(i.data?.balance ?? 0);
  }
  /**
   * 批量扣减账号配额（usedToday / usedThisHour）。
`,
    "scheduler api checks shumiao before task and consumes per success item",
  );
}

if (!main.includes("consumeShumiaoForItem(e, m)")) {
  const balanceCheckBlock = `      this.runningTasks.set(t, l);
      try {
        const m = await Le.get().checkShumiaoBalanceForTask(e);
        ue.info(\`[task=\${t}] 积分余额校验通过 count=\${i.length} balance=\${m}\`);
      } catch (m) {
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "balance",
          errorCategoryLabel: "积分不足"
        });
        return;
      }
    }
    if (c === "enterprise") {`;
  if (main.includes("consumeShumiaoForTask(e)")) {
    main = replaceOnce(
      main,
      `      this.runningTasks.set(t, l);
      try {
        const m = await Le.get().consumeShumiaoForTask(e);
        ue.info(\`[task=\${t}] 积分扣减完成 count=\${i.length} balance=\${m}\`);
      } catch (m) {
        this.runningTasks.delete(t), ue.warn(\`[task=\${t}] 积分判定失败，任务未启动:\`, m), this.sendToRenderer(W.task.error, {
          taskId: t,
          message: m instanceof Error ? m.message : String(m),
          errorCategory: "balance",
          errorCategoryLabel: "积分不足"
        });
        return;
      }
    }
    if (c === "enterprise") {`,
      balanceCheckBlock,
      "replace legacy whole-task shumiao consume with balance check",
    );
  } else {
    main = replaceOnce(
      main,
      `      this.runningTasks.set(t, l);
    }
    if (c === "enterprise") {`,
      balanceCheckBlock,
      "personal task checks shumiao balance before scraping window",
    );
  }

  main = replaceOnce(
    main,
    `        const b = this.classifyFailure(y.errorCode, y.errorMessage, y.errorDetails);
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
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
`,
    `        let S = !1, C = null;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            C = x;
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
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
          balanceAfter: C,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });
        ue.info(\`[task=\${t}] 完成采集第 \${m + 1}/\${i.length} 条 plugin=\${n} status=\${y.status} errorCode=\${y.errorCode ?? "NONE"} success=\${l.successCount} error=\${l.errorCount}\`);
        if (S) {
          this.sendToRenderer(W.task.error, {
            taskId: t,
            message: y.errorMessage || "积分扣减失败，采集已停止",
            errorCategory: "balance",
            errorCategoryLabel: "积分不足"
          });
          break;
        }
`,
    "personal task consumes one shumiao before emitting success result",
  );
}

if (!main.includes("balanceAfter: C")) {
  main = replaceOnce(
    main,
    `        let S = !1;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
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
        });`,
    `        let S = !1, C = null;
        if (y.status === "success")
          try {
            const x = await Le.get().consumeShumiaoForItem(e, m);
            C = x;
            ue.info(\`[task=\${t}] 单条积分扣减完成 index=\${m + 1} balance=\${x}\`);
          } catch (x) {
            S = !0, y.status = "error", y.data = null, y.errorMessage = x instanceof Error ? x.message : String(x), y.errorCode = "SHUMIAO_CONSUME_FAILED";
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
          balanceAfter: C,
          errorCategory: b.code,
          errorCategoryLabel: b.label
        });`,
    "personal task result returns shumiao balance after item consume",
  );
}

if (!main.includes("batchResting: !0")) {
  main = replaceOnce(
    main,
    `      this.sendToRenderer(W.task.progress, {
        taskId: t,
        current: l.current,
        total: l.total,
        percent: g
      }), m < i.length - 1 && !l.cancelled && await this.delay(_i);
    }`,
    `      this.sendToRenderer(W.task.progress, {
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
    }`,
    "personal task batch pacing",
  );
}

if (!main.includes("classifyFailure(e, t =")) {
  main = replaceOnce(
    main,
    `  sendToRenderer(e, t) {
    const n = this.getMainWindow();
    n && !n.isDestroyed() && n.webContents.send(e, t);
  }
  delay(e) {`,
    `  sendToRenderer(e, t) {
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
    const s = String(e || "").toUpperCase(), i = \`\${s} \${String(t || "")} \${JSON.stringify(n || {})}\`.toLowerCase();
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
  delay(e) {`,
    "personal task pacing helpers",
  );
}

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
`const pgyUserDataDir = Oe(ye.getPath("appData"), "magiorix-desktop");
try {
  ye.setName("magiorix"), ye.setPath("userData", pgyUserDataDir);
} catch {
}`,
  "const pgyUserDataDir =",
  "userData override",
);

main = insertAfterOnce(
  main,
  `function mn(a, e, t) {
  return \`[\${pgyBeijingTimestamp()}] [\${a.toUpperCase()}] [\${e}] \${t}\`;
}`,
  `function pgyBeijingIsoDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function pgyBeijingTimestamp() {
  const a = new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString();
  return \`\${a.slice(0, 10)} \${a.slice(11, 19)} +08:00\`;
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
return Oe(a, \`magiorix-main-\${pgyBeijingIsoDate()}.log\`);
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

main = insertAfterOnce(
  main,
  'async function ff(a) {',
  `  const pausedTask = typeof (a == null ? void 0 : a.taskId) == "string" ? ge == null ? void 0 : ge.runningTasks.get(a.taskId) : null;
  if (pausedTask != null && pausedTask.paused)
    throw new Error("任务已暂停，请继续采集或等待任务完成后再下载结果");`,
  "pausedTask",
  "block export while plugin task is paused",
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

main = replaceOnce(
  main,
  `}), uh(dt), t.start(), pt.info("采集调度器已初始化");`,
  `}), uh(dt), pt.info("采集调度器云端同步已关闭");`,
  "disable scheduler cloud sync startup",
);

if (!main.includes("跳过桌面更新检查")) {
  main = replaceOnce(
    main,
    `    const a = ye.getVersion(), e = Sd();
    Ie.info(\`检查更新 — 当前版本: \${a}, 平台: \${e}\`);
    const n = (await ce.get(\`\${_d}/api/desktop-versions/check\`, {
      params: {
        currentVersion: a,
        platform: e
      }
    })).data;`,
    `    const a = ye.getVersion(), e = Sd();
    Ie.info(\`检查更新 — 当前版本: \${a}, 平台: \${e}\`);
    if (e !== "windows") {
      Ie.info(\`跳过桌面更新检查：\${e} 当前未参与 Windows 更新通道\`);
      ve.webContents.send(qe.updateNotAvailable);
      return;
    }
    const n = (await ce.get(\`\${_d}/api/desktop-versions/check\`, {
      params: {
        currentVersion: a,
        platform: e
      }
    })).data;`,
    "skip non-windows desktop update checks",
  );
}

if (!main.includes("pgyDesktopUpdateActive")) {
  main = replaceOnce(
    main,
    "let ve = null, ot = null;",
    "let ve = null, ot = null, pgyDesktopUpdateActive = !1;",
    "desktop update coordination state",
  );
  main = replaceOnce(
    main,
    `  static async checkAndDownloadUpdate() {
    if (this.isDownloading) {`,
    `  static async checkAndDownloadUpdate() {
    if (pgyDesktopUpdateActive) {
      K.info("桌面安装包更新已就绪，跳过前端资源写入");
      return;
    }
    if (this.isDownloading) {`,
    "desktop update priority over assets",
  );
  main = replaceOnce(
    main,
    `    if (!s.hasUpdate) {
      Ie.info("当前已是最新版本"), ve.webContents.send(qe.updateNotAvailable);`,
    `    if (!s.hasUpdate) {
      pgyDesktopUpdateActive = !1, Ie.info("当前已是最新版本"), ve.webContents.send(qe.updateNotAvailable);`,
    "clear desktop update state",
  );
  main = replaceOnce(
    main,
    `    Ie.info("发现新版本:", s.version), ve.webContents.send(qe.updateAvailable, {`,
    `    pgyDesktopUpdateActive = !0, Ie.info("发现新版本:", s.version), ve.webContents.send(qe.updateAvailable, {`,
    "activate desktop update state",
  );
  main = replaceOnce(
    main,
    `  } catch (a) {
    Ie.error("检查更新失败:", a);`,
    `  } catch (a) {
    pgyDesktopUpdateActive = !1, Ie.error("检查更新失败:", a);`,
    "release desktop state after check failure",
  );
  main = replaceOnce(
    main,
    `    Rd(Z), Xt || Ae.setupWindowFocusListener(Z), Xt || cr(), setTimeout(() => {`,
    `    Rd(Z), Xt || cr().finally(() => Ae.setupWindowFocusListener(Z)), setTimeout(() => {`,
    "sequence desktop and asset update checks",
  );
}

if (!main.includes("pgyHasSingleInstanceLock")) {
  main = replaceOnce(
    main,
    `ye.whenReady().then(() => {`,
    `const pgyHasSingleInstanceLock = ye.requestSingleInstanceLock();
if (pgyHasSingleInstanceLock) {
  ye.on("second-instance", () => {
    Z && !Z.isDestroyed() && (Z.isMinimized() && Z.restore(), Z.show(), Z.focus());
  });
  ye.whenReady().then(() => {`,
    "single desktop instance start",
  );
  main = replaceOnce(
    main,
    `  });
});
ye.on("window-all-closed", () => {`,
    `  });
  });
} else {
  ye.quit();
}
ye.on("window-all-closed", () => {`,
    "single desktop instance end",
  );
}

main = replaceAllIfExists(
  main,
  'jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a), mh();',
  'jt("正在校验资源完整性..."), zt(45), pgyVerifyAssets(a), jt("正在加载前端资源..."), zt(90), Yr(), Ga(a);',
);

if (!main.includes('.partial-${process.pid}')) {
  main = replaceOnce(
    main,
    `  static async applyAssets(e, t) {
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
  }`,
    `  static async applyAssets(e, t) {
    const n = Oe($n, t), s = \`\${n}.partial-\${process.pid}\`;
    kt(s) && Kt.rmSync(s, { recursive: !0, force: !0 }), Sr(s, { recursive: !0 });
    try {
      await Er(Cr(e), kr({ path: s }));
      if (!kt(Oe(s, "index.html")))
        throw new Error("资源解压失败：缺少 index.html");
      if (!kt(Oe(s, "integrity-manifest.json")))
        throw new Error("资源解压失败：缺少 integrity-manifest.json");
      pgyVerifyAssets(s);
      let i = !1;
      if (kt(n))
        try {
          pgyVerifyAssets(n), i = !0;
        } catch {
          Kt.rmSync(n, { recursive: !0, force: !0 });
        }
      i ? Kt.rmSync(s, { recursive: !0, force: !0 }) : Kt.renameSync(s, n);
      const o = {
        version: t,
        appliedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, r = \`\${Xn}.tmp-\${process.pid}\`, pgyVersionPointerBackup = \`\${Xn}.previous-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(Xn) && Kt.renameSync(Xn, pgyVersionPointerBackup);
      try {
        Kt.renameSync(r, Xn), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(e) && Rr(e);
      } catch (i) {
        throw kt(r) && Rr(r), kt(pgyVersionPointerBackup) && Kt.renameSync(pgyVersionPointerBackup, Xn), i;
      }
    } catch (i) {
      throw kt(s) && Kt.rmSync(s, { recursive: !0, force: !0 }), i;
    }
  }`,
    "atomic asset apply",
  );
}

if (!main.includes("pgyVersionPointerBackup")) {
  main = replaceOnce(
    main,
    `      }, r = \`\${Xn}.tmp-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), Kt.renameSync(r, Xn), kt(e) && Rr(e);`,
    `      }, r = \`\${Xn}.tmp-\${process.pid}\`, pgyVersionPointerBackup = \`\${Xn}.previous-\${process.pid}\`;
      Zi(r, JSON.stringify(o, null, 2)), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(Xn) && Kt.renameSync(Xn, pgyVersionPointerBackup);
      try {
        Kt.renameSync(r, Xn), kt(pgyVersionPointerBackup) && Rr(pgyVersionPointerBackup), kt(e) && Rr(e);
      } catch (i) {
        throw kt(r) && Rr(r), kt(pgyVersionPointerBackup) && Kt.renameSync(pgyVersionPointerBackup, Xn), i;
      }`,
    "atomic asset version pointer",
  );
}

if (!main.includes('pgyAssetPartPath = `${i}.part-${process.pid}`')) {
  main = replaceOnce(
    main,
    'const i = Oe(ye.getPath("temp"), `assets-${e.version}.zip`);',
    'const i = Oe(ye.getPath("temp"), `assets-${e.version}.zip`), pgyAssetPartPath = `${i}.part-${process.pid}`;\n      kt(pgyAssetPartPath) && Rr(pgyAssetPartPath);',
    "asset partial download path",
  );
  main = replaceOnce(
    main,
    'const u = Ar(i);',
    'const u = Ar(pgyAssetPartPath);',
    "write asset partial download",
  );
  main = replaceOnce(
    main,
    `          }), o.pipe(u), u.on("finish", () => {
            u.close(), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
          }), u.on("error", (l) => {`,
    `          }), o.pipe(u), u.on("finish", () => {
            u.close(async (l) => {
              if (l) {
                s(l);
                return;
              }
              try {
                const pgyAssetExpectedChecksum = String(e.checksum || "").trim().toLowerCase().replace(/^sha256:/, "");
                if (!/^[a-f0-9]{64}$/.test(pgyAssetExpectedChecksum))
                  throw new Error("资源包校验值无效，请联系管理员");
                if ((await Cd(pgyAssetPartPath)).toLowerCase() !== pgyAssetExpectedChecksum)
                  throw new Error("资源包校验失败，请重新下载");
                kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
              } catch (pgyAssetDownloadError) {
                kt(pgyAssetPartPath) && Rr(pgyAssetPartPath), s(pgyAssetDownloadError);
              }
            });
          }), u.on("error", (l) => {`,
    "finalize asset partial download",
  );
}

if (!main.includes("pgyAssetExpectedChecksum")) {
  main = replaceOnce(
    main,
    `            u.close((l) => {
              if (l) {
                s(l);
                return;
              }
              kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
            });`,
    `            u.close(async (l) => {
              if (l) {
                s(l);
                return;
              }
              try {
                const pgyAssetExpectedChecksum = String(e.checksum || "").trim().toLowerCase().replace(/^sha256:/, "");
                if (!/^[a-f0-9]{64}$/.test(pgyAssetExpectedChecksum))
                  throw new Error("资源包校验值无效，请联系管理员");
                if ((await Cd(pgyAssetPartPath)).toLowerCase() !== pgyAssetExpectedChecksum)
                  throw new Error("资源包校验失败，请重新下载");
                kt(i) && Rr(i), Kt.renameSync(pgyAssetPartPath, i), K.info(\`下载完成，文件大小: \${c} bytes\`), n(i);
              } catch (pgyAssetDownloadError) {
                kt(pgyAssetPartPath) && Rr(pgyAssetPartPath), s(pgyAssetDownloadError);
              }
            });`,
    "asset archive checksum",
  );
}

main = replaceOnce(
  main,
  `      forceUpdate: s.forceUpdate,`,
  `      forceUpdate: false,`,
  "desktop update is never forced",
);

if (!main.includes('toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, "")')) {
  main = replaceOnce(
    main,
    `    }), s.data.pipe(r), await new Promise((u, l) => {
      r.on("finish", () => u()), r.on("error", l);
    }), Ie.info("下载完成"), Ie.info("校验文件完整性..."), await Cd(n) !== t)
      throw new Error("文件校验失败，请重新下载");`,
    `    }), s.data.pipe(r), await new Promise((u, l) => {
      r.on("finish", () => u()), r.on("error", l);
    }), Ie.info("下载完成"), Ie.info("校验文件完整性..."), (await Cd(n)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))
      throw new Error("文件校验失败，请重新下载");`,
    "case-insensitive installer checksum",
  );
}

if (!main.includes("setTimeout(() => Ed(), 1200)")) {
  main = replaceOnce(
    main,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n
    });
  } catch (n) {`,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n
    }), setTimeout(() => Ed(), 1200);
  } catch (n) {`,
    "auto install after update download",
  );
}

if (!main.includes("pgyInstallerPartPath")) {
  main = replaceOnce(
    main,
    `  try {
    Kt.existsSync(Sa) || Kt.mkdirSync(Sa, { recursive: !0 });
    const n = Xi.join(Sa, e);
    ot = n, Ie.info(\`下载更新: \${a}\`), Ie.debug(\`保存路径: \${n}\`);`,
    `  let pgyInstallerPartPath = null;
  try {
    Kt.existsSync(Sa) || Kt.mkdirSync(Sa, { recursive: !0 });
    const n = Xi.join(Sa, e);
    pgyInstallerPartPath = \`\${n}.part-\${process.pid}\`, Kt.existsSync(pgyInstallerPartPath) && Kt.rmSync(pgyInstallerPartPath, { force: !0 }), ot = n, Ie.info(\`下载更新: \${a}\`), Ie.debug(\`保存路径: \${n}\`);`,
    "installer partial download path",
  );
  main = replaceOnce(
    main,
    `    const r = Kt.createWriteStream(n);`,
    `    const r = Kt.createWriteStream(pgyInstallerPartPath);`,
    "write installer partial download",
  );
  main = replaceOnce(
    main,
    `(await Cd(n)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))`,
    `(await Cd(pgyInstallerPartPath)).toLowerCase() !== String(t || "").toLowerCase().replace(/^sha256:/, ""))`,
    "verify installer partial download",
  );
  main = replaceOnce(
    main,
    `    Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n`,
    `    Kt.existsSync(n) && Kt.rmSync(n, { force: !0 }), Kt.renameSync(pgyInstallerPartPath, n), Ie.info("校验通过"), ve.webContents.send(qe.updateDownloaded, {
      filePath: n`,
    "promote installer partial download",
  );
  main = replaceOnce(
    main,
    `  } catch (n) {
    Ie.error("下载更新失败:", n);`,
    `  } catch (n) {
    pgyInstallerPartPath && Kt.existsSync(pgyInstallerPartPath) && Kt.rmSync(pgyInstallerPartPath, { force: !0 }), Ie.error("下载更新失败:", n);`,
    "clean installer partial download",
  );
}

main = replaceOnce(
  main,
  `  Ie.info("安装更新:", ot);
  const a = process.platform;
  a === "win32" ? (Tr(ot, [], {
    detached: !0,
    stdio: "ignore"
  }).unref(), ye.quit()) : (a === "darwin" || a === "linux") && (Ji.openPath(ot), ve == null || ve.webContents.send(qe.manualInstall, {
    filePath: ot
  }));
}`,
  `  Ie.info("安装更新:", ot);
  const a = process.platform, e = Ja(ye.getPath("exe"));
  a === "win32" ? (Tr(ot, ["/S", \`/D=\${e}\`], {
    detached: !0,
    stdio: "ignore"
  }).unref(), ye.quit()) : (a === "darwin" || a === "linux") && (Ji.openPath(ot), ve == null || ve.webContents.send(qe.manualInstall, {
    filePath: ot
  }));
}`,
  "silent installer in current install dir",
);

main = replaceOnce(
  main,
  `async (e, t) => (Le.get().setAuth(t.baseUrl, t.token), await a.scheduler.recoverInterruptedRunsOnce(), await a.scheduler.forceSync().catch((n) => {
      pt.warn("setAuth 后立即同步失败:", n);
    }), { ok: !0 })`,
  `async (e, t) => (Le.get().setAuth(t.baseUrl, t.token), { ok: !0, disabled: !0 })`,
  "disable scheduler set-auth sync",
);

main = replaceOnce(
  main,
  `), F.handle(Ne.status, () => a.scheduler.getStatus());`,
  `), F.handle(Ne.status, () => ({ registeredTasks: [], activeRuns: [], disabled: !0 }));`,
  "disable scheduler status",
);

main = replaceAllIfExists(
  main,
  'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = e.accountSource ?? "personal", u = this.plugins.get(n);',
  'const { taskId: t, pluginId: n, taskType: s, urls: i, fileName: o } = e, r = e.fields && e.fields.length > 0 ? e.fields : null, c = "personal", u = this.plugins.get(n);',
);

fs.writeFileSync(mainPath, main);
fs.writeFileSync(preloadPath, preload);
console.log("Applied magiorix runtime patches.");
