const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const mainBundlePath = path.join(projectRoot, "assets", "1.2.0", "assets", "index-B09sHfUO.js");
const patchScriptPath = path.join(projectRoot, "scripts", "apply-magiorix-frontend-patches.js");
const preloadPath = path.join(projectRoot, "app-source", "dist-electron", "preload.mjs");

const script = fs.readFileSync(patchScriptPath, "utf8");
const bundle = fs.readFileSync(mainBundlePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");

const legacyFrontendBrandPattern = /(?:\bzs\.|@zsdesktop|PYGdata|Emagic(?:DataCrawler| Data Crawler)?|易美(?:传播|数据抓取)?)/i;

function extractEmbeddedPageSource() {
  const anchor = "const pgyKolSearchPageSource = `";
  const start = script.indexOf(anchor);
  assert.ok(start >= 0, "patch script must embed the pgy-kol page source in a template literal");
  const bodyStart = start + anchor.length;
  const bodyEnd = script.indexOf("`;", bodyStart);
  assert.ok(bodyEnd > bodyStart, "pgy-kol page source template literal must be closed");
  return script.slice(bodyStart, bodyEnd);
}

const pageSource = extractEmbeddedPageSource();

test("pgy-kol page source is embedded and carries the required MVP copy", () => {
  for (const needle of [
    "找博主",
    "magiorix-pgy-kol-enabled",
    "结果可能超过 5000",
    "完整性未证明",
    "行业特色画像",
    "二十大人群",
    "预估消费行为",
    "内容题材",
    "粉丝数",
    "地域",
    "性别",
    "登录已失效",
    "蒲公英登录已失效，请重新授权",
    "功能未开启",
    "当前 Payload 预览",
    "选中父节点时展开叶子 ID",
  ]) {
    assert.ok(pageSource.includes(needle), `page source must contain: ${needle}`);
  }

  // 树选择契约：uniqueKey 区分同名节点、fullPath 完整展示、父节点展开叶子。
  assert.match(pageSource, /uniqueKey/);
  assert.match(pageSource, /fullPath/);
  assert.match(pageSource, /pgyKolFlattenLeaves/);

  // 官网实证契约（2026-08-05 phase2-online-compare）：location 发送单元素数组；
  // contentTheme 发送节点数组交由 serializer 转空格路径（不得发送节点 ID）。
  assert.match(pageSource, /out\.location=\[f\.location\]/, "location must be wrapped in an array");
  assert.match(pageSource, /out\.contentThemeLabel=f\.contentTheme/, "contentTheme must pass nodes, not IDs");
  assert.doesNotMatch(pageSource, /contentTheme\.map\(function\(n\)\{return n\.rawVersion/, "dead rawVersion branch must be removed");
  assert.match(
    pageSource,
    /Number\.isFinite\(lo\)&&Number\.isInteger\(lo\)&&lo>0/,
    "fansNumberLower must reject non-positive values",
  );
  assert.match(
    pageSource,
    /Number\.isFinite\(hi\)&&Number\.isInteger\(hi\)&&hi>0/,
    "fansNumberUpper must reject non-positive values",
  );
  assert.match(
    pageSource,
    /PgyKolTree,\{nodes:themeCfg\.nodes/,
    "contentTheme must render as a tree so leaf nodes are selectable",
  );

  // 过滤字段契约（与 FIELD_REGISTRY payloadField 一致）。
  for (const field of [
    "gender",
    "location",
    "fansNumberLower",
    "fansNumberUpper",
    "industrySpecificCrowdsMotorDom",
    "top20CrowdsLabel",
    "contentThemeLabel",
    "kolInfoConsumBehaviorLabel",
  ]) {
    assert.ok(pageSource.includes(field), `page source must map filter field: ${field}`);
  }

  // 展示列白名单字段（KNOWN_KOL_FIELDS 中的非必填列）。
  for (const field of ["readMidNor30", "interMidNor30", "picturePrice", "videoPrice", "fansActiveIn28dLv"]) {
    assert.ok(pageSource.includes(field), `page source must display whitelist field: ${field}`);
  }

  // 状态机与隔离提示。
  assert.match(pageSource, /auth-expired/);
  assert.match(pageSource, /quarantinedFields/);
  assert.match(pageSource, /capSignal/);
  assert.match(pageSource, /没有匹配的博主/);
});

test("page source is syntactically valid JavaScript", () => {
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(pageSource);
  }, "embedded pgy-kol page source must parse as valid JavaScript");
});

test("page source must not carry legacy brand residue or banned names", () => {
  assert.doesNotMatch(pageSource, legacyFrontendBrandPattern, "pgy-kol page source must stay brand-free");
  for (const banned of ["树苗", "薯苗", "zs.login", "zs."]) {
    assert.ok(!pageSource.includes(banned), `page source must not contain: ${banned}`);
  }
});

test("patch script wires route, menu merge, and dev switch with idempotent guards", () => {
  // 路由注入：li 表内追加懒加载键（dashboard 内联模块模式）。
  assert.ok(
    script.includes(
      '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>({default:PgyKolSearchPage})),void 0,import.meta.url),',
    ),
    "route entry must be appended after the dashboard entry and expose default export",
  );
  assert.ok(
    !script.includes(
      '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>PgyKolSearchPage),void 0,import.meta.url)',
    ),
    "route loader must not pass a bare component (React.lazy requires {default: ...})",
  );
  assert.ok(script.includes('const pgyKolRouteMarker = \'"../pages/pgy-kol-search/index.tsx":()=>G(\';'), "route guard marker must be defined");

  // 菜单注入：setMenus setter 合并本地菜单项。
  assert.ok(script.includes("setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})"), "store setter must merge the local menu");
  assert.ok(
    script.includes('{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"solar:magnifer-bold-duotone"}'),
    "local menu item must carry name/path/component/icon",
  );
  // 路由生成器 si(e) 会把菜单 component 规范化为 "../pages/<t>/index.tsx" 再查 li 表：
  // 菜单项 component 必须不带 "../" 前缀（"../pages/..." 会被拼成 "../pages/../pages/..." 而查不到）。
  assert.ok(
    !script.includes('{name:"找博主",path:"/pgy-kol-search",component:"../pages/pgy-kol-search/index.tsx"'),
    "menu component must not carry a leading ../ (route generator normalization)",
  );

  // 开发开关。
  assert.ok(script.includes('localStorage.getItem("magiorix-pgy-kol-enabled")==="1"'), "dev switch must gate the page");

  // 幂等守卫：三个注入点都带 exists 检查，重复运行不重复注入。
  // Phase 4 起组件守卫使用内容级 SHA-1 对比：源码漂移时必然重建 bundle，
  // 防止“标记存在但函数体已更新导致产物陈旧”（fresh reviewer C1/C2 根因）。
  assert.ok(script.includes('const crypto = require("crypto")'), "patch script must require crypto for the content guard");
  assert.ok(script.includes("normalizeSource(pgyKolSearchPageSource)"), "content guard must hash the embedded page source");
  assert.ok(script.includes("existingSha1 !== sourceSha1"), "content guard must compare existing block hash with source hash");
  assert.ok(
    script.includes('normalizeSource(existingBlock).replace(/\\n$/, "")'),
    "content guard must strip the trailing separator newline before hashing (idempotent skip)",
  );
  assert.ok(
    script.includes('bundleBefore.indexOf("V1=new Map;function pgyKolDevEnabled")'),
    "patch script must remove the pre-Phase-4 page source before upgrading",
  );
  assert.ok(
    script.includes('bundleBefore.indexOf("function si(e){", oldStart)'),
    "upgrade path must locate the end of the old injected source block",
  );
  assert.ok(script.includes("!fs.readFileSync(mainBundle, \"utf8\").includes(pgyKolRouteMarker)"), "route injection must be guarded");
  assert.ok(script.includes("!fs.readFileSync(mainBundle, \"utf8\").includes(pgyKolStoreTo)"), "store injection must be guarded");

  // 产物漂移防线（fresh reviewer M2）：已发布 bundle 必须与补丁脚本内嵌源码一致。
  // 四状态「继续」条件与 interrupted 文案都必须真实存在于 bundle 中。
  assert.match(
    bundle,
    /\(t\.status==="paused"\|\|t\.status==="auth-expired"\|\|t\.status==="interrupted"\|\|t\.status==="failed"\)&&o\.jsx\(\$,\{size:"small",variant:"outlined",onClick:p\.onResume,children:"继续"\}\)/,
    "published bundle must contain the four-state resume condition",
  );
  assert.ok(bundle.includes('s==="interrupted"'), "published bundle must carry the interrupted status copy");
  assert.doesNotMatch(
    bundle,
    /\(t\.status==="paused"\|\|t\.status==="auth-expired"\)&&o\.jsx\(\$,\{size:"small",variant:"outlined",onClick:p\.onResume,children:"继续"\}\)/,
    "published bundle must not carry the stale two-state resume condition",
  );

  // 页面必须通过 preload bridge 调用 Core 的 IPC（getConfig/previewPayload/searchFirstPage）。
  assert.ok(script.includes("bridge.getConfig("), "page must load filter config via bridge.pgyKol.getConfig");
  assert.ok(script.includes("bridge.previewPayload("), "page must preview payload via bridge.pgyKol.previewPayload");
  assert.ok(script.includes("bridge.searchFirstPage("), "page must search via bridge.pgyKol.searchFirstPage");
});

test("every new replaceOnce from-anchor exists in the committed main bundle (or is already applied)", () => {
  // 组件注入锚点：li 路由表声明链结束、si 路由解析函数之前（唯一出现，且位于
  // 语句边界，插入函数声明不会破坏 const 声明链语法）。
  assert.ok(
    bundle.includes("V1=new Map;function si(e){") || bundle.includes("function PgyKolSearchPage"),
    "component injection anchor must exist in main bundle (original or already-applied form)",
  );
  assert.ok(script.includes('"V1=new Map;function si(e){"'), "script must reference the component injection anchor verbatim");

  // 路由注入锚点：dashboard 内联路由行（唯一出现，且注入后仍保留）。
  const dashboardRouteFrom = '"../pages/dashboard/index.tsx":()=>G(()=>Promise.resolve().then(()=>W5),void 0,import.meta.url),';
  assert.ok(script.includes(dashboardRouteFrom), "script must define the dashboard route from-anchor verbatim");
  assert.ok(bundle.includes(dashboardRouteFrom), "dashboard route from-anchor must exist in main bundle");

  // 菜单注入锚点：setMenus setter 行。补丁脚本执行后会被替换为合并版本，
  // 因此两种状态都视为锚点有效（replaceOnce 幂等条件：from 存在或 to 已存在）。
  const storeFrom = "setMenus:t=>e({menus:t})";
  const storeTo = "setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})";
  assert.ok(script.includes(storeFrom), "script must define the store from-anchor verbatim");
  assert.ok(bundle.includes(storeFrom) || bundle.includes(storeTo), "store anchor must exist in main bundle (original or already-applied)");
});

test("preload bridge exposes the pgy-kol methods the page depends on", () => {
  assert.match(preload, /pgyKol:\{getStatus:/);
  assert.match(preload, /getSchemaStatus:/);
  assert.match(preload, /searchFirstPage:e=>r\.ipcRenderer\.invoke\("pgy-kol:search-first-page",e\)/);
  assert.match(preload, /getConfig:e=>r\.ipcRenderer\.invoke\("pgy-kol:config",e\)/);
  assert.match(preload, /previewPayload:e=>r\.ipcRenderer\.invoke\("pgy-kol:payload-preview",e\)/);
});

test("twenty crowds section renders a leaf-only tree with fullPath chips", () => {
  // 二十大人群改用 PgyKolTree 且 leafOnly:true（只允许选叶子，父节点只负责展开）。
  assert.match(
    pageSource,
    /PgyKolTree,\{leafOnly:true,nodes:audCfg\.nodes/,
    "audience20 must render as a leaf-only PgyKolTree",
  );
  // PgyKolChips 不再接收 audCfg.nodes。
  assert.doesNotMatch(
    pageSource,
    /PgyKolChips,\{options:audCfg\.nodes/,
    "audience20 must no longer render as PgyKolChips",
  );
  // leafOnly:true 全页面只出现一次，其它控件不会误传。
  assert.equal((pageSource.match(/leafOnly:true/g) || []).length, 1, "leafOnly:true must appear exactly once");

  // 展示完整路径：n.fullPath 优先。
  assert.match(
    pageSource,
    /PgyKolTree,\{leafOnly:true,nodes:audCfg\.nodes[\s\S]{0,300}?display:function\(n\)\{return n\.fullPath\|\|n\.label\|\|String\(n\.value\)\}/,
    "audience20 tree must display fullPath",
  );

  // 已选叶子 chips：label=fullPath，onDelete 走 toggleArr("audience20", n)。
  assert.match(
    pageSource,
    /filter\.audience20\.map\(function\(n\)\{return o\.jsx\(f1,\{key:pgyKolNodeKey\(n\),size:"small",label:n\.fullPath\|\|n\.label,onDelete:function\(\)\{toggleArr\("audience20",n\)\}\}\)\}\)/,
    "selected audience20 leaves must render as chips with fullPath label and onDelete toggle",
  );
  assert.match(pageSource, /已选 "\+filter\.audience20\.length\+" 项"/, "audience20 must keep the selected-count hint");
});

test("PgyKolTreeNode honors leafOnly and PgyKolTree forwards it to every level", () => {
  // leafOnly 默认 falsy：不传时行为与现状一致（父节点仍可勾选）。
  assert.match(pageSource, /leafOnly=p\.leafOnly\|\|false/, "PgyKolTreeNode must default leafOnly to falsy");
  // 父节点守卫：leafOnly 且有 children 时只渲染展开箭头 + 完整路径文本，不渲染复选框。
  assert.match(pageSource, /parentOnly=leafOnly&&has/, "leafOnly parent guard must exist");
  assert.match(
    pageSource,
    /parentOnly\?o\.jsx\(w,\{variant:"body2",sx:\{wordBreak:"break-all"\},children:display\(node\)\}\):/,
    "leafOnly parent row must render path text without checkbox",
  );
  // 叶子分支仍渲染复选框并响应 onToggle。
  assert.match(pageSource, /onClick:function\(\)\{onToggle\(node\)\}/, "leaf rows must keep onToggle");
  // PgyKolTree 把 leafOnly 透传给根节点，PgyKolTreeNode 递归透传给每一层子节点。
  assert.match(
    pageSource,
    /PgyKolTreeNode,\{key:pgyKolNodeKey\(n\),node:n,level:0,selected:p\.selected,onToggle:p\.onToggle,display:p\.display,leafOnly:p\.leafOnly\}\)/,
    "PgyKolTree must forward leafOnly to root nodes",
  );
  assert.match(
    pageSource,
    /PgyKolTreeNode,\{key:pgyKolNodeKey\(c\),node:c,level:level\+1,selected:selected,onToggle:onToggle,display:display,leafOnly:leafOnly\}\)/,
    "PgyKolTreeNode must forward leafOnly to children",
  );
  // 回归：行 onClick 必须在 sx 之外（真实运行时 MUI sx 处理器会把 sx 内的函数值当作
  // 样式函数用 theme 调用 → 渲染期触发 setFilter → React #185 死循环，曾导致页面挂载即卡死）。
  assert.match(
    pageSource,
    /sx:\{display:"flex",alignItems:"center",gap:\.75,flex:1,cursor:"pointer",py:\.5\},onClick:function\(\)\{onToggle\(node\)\}/,
    "row onClick must live outside the sx object",
  );
  assert.doesNotMatch(
    pageSource,
    /sx:\{[^{}]*onClick:function\(\)\{onToggle\(node\)\}/,
    "no handler may be embedded inside an sx object",
  );
});

test("the other six filter controls keep their existing renderers", () => {
  // 性别仍是 PgyKolChips。
  assert.match(pageSource, /PgyKolChips,\{options:genderOptions/, "gender must stay PgyKolChips");
  // 博主地域 / 行业特色画像 / 内容题材 / 预估消费行为仍是 PgyKolTree 且不带 leafOnly。
  assert.match(pageSource, /PgyKolTree,\{nodes:areasCfg\.nodes/, "location must stay PgyKolTree without leafOnly");
  assert.match(pageSource, /PgyKolTree,\{nodes:autoCfg\.nodes/, "industrySpecificCrowdsMotorDom must stay PgyKolTree without leafOnly");
  assert.match(pageSource, /PgyKolTree,\{nodes:themeCfg\.nodes/, "contentTheme must stay PgyKolTree without leafOnly");
  assert.match(pageSource, /PgyKolTree,\{nodes:consumeCfg\.nodes/, "consumeBehavior must stay PgyKolTree without leafOnly");
  // 粉丝数上下限输入框保持不变。
  assert.match(pageSource, /type:"number",label:"粉丝数下限"/, "fansNumberLower input must stay");
  assert.match(pageSource, /type:"number",label:"粉丝数上限"/, "fansNumberUpper input must stay");
});

test("Phase 4：任务面板对 paused/auth-expired/interrupted/failed 都提供「继续」入口", () => {
  // fresh reviewer H1：崩溃恢复（interrupted）与失败（failed）任务必须能从 UI 继续，
  // 与后端 RESUMABLE_TASK_STATUSES 对齐。
  assert.match(
    pageSource,
    /\(t\.status==="paused"\|\|t\.status==="auth-expired"\|\|t\.status==="interrupted"\|\|t\.status==="failed"\)&&o\.jsx\(\$,\{size:"small",variant:"outlined",onClick:p\.onResume,children:"继续"\}\)/,
    "继续 button must cover paused/auth-expired/interrupted/failed",
  );
  assert.doesNotMatch(
    pageSource,
    /\(t\.status==="paused"\|\|t\.status==="auth-expired"\)&&o\.jsx\(\$,\{size:"small",variant:"outlined",onClick:p\.onResume,children:"继续"\}\)/,
    "继续 button must no longer be limited to paused/auth-expired",
  );
});

// ===========================================================================
// Phase 4：批量采集前端 UI 增量（列选择 / 开始采集 / 进度面板 / 任务历史 /
// 事件订阅 / 预览边界）。本组断言只读页面源码（pgyKolSearchPageSource）与补丁
// 脚本文本；preload 新方法由主代理接线，本文件不断言 preload 内容。
// ===========================================================================

test("phase-4 page source ships the batch UI copy and status texts", () => {
  for (const needle of [
    "开始采集",
    "暂停",
    "继续",
    "取消",
    "导出",
    "完整性无法证明",
    "已持久化",
    "预览 ",
    "原始条数",
    "唯一博主数",
    "重复数",
    "缺UID异常数",
    "任务进度",
    "任务历史",
    "请至少选择一个导出字段",
  ]) {
    assert.ok(pageSource.includes(needle), `page source must contain: ${needle}`);
  }
  // 状态六态中文文案（running/paused/auth-expired/risk-control/cancelled/failed/completed）。
  for (const [status, text] of [
    ["running", "采集中"],
    ["paused", "已暂停"],
    ["auth-expired", "登录已失效"],
    ["risk-control", "触发风控"],
    ["cancelled", "已取消"],
    ["failed", "采集失败"],
    ["completed", "已完成"],
  ]) {
    assert.ok(pageSource.includes(`if(s==="${status}")return "${text}"`), `status text for ${status} must exist`);
  }
});

test("phase-4 page source maps completeness and error copy", () => {
  assert.ok(pageSource.includes('if(t.completeness==="complete")return "完整性已证明"'));
  assert.ok(
    pageSource.includes(
      'if(t.completeness==="cannot-prove")return "完整性无法证明（原因："+(t.summary&&t.summary.stopReason||t.warning||"无法证明")+"）"',
    ),
  );
  assert.ok(pageSource.includes('if(e.code==="auth-expired")return "蒲公英登录已失效，请重新授权"'));
  assert.ok(pageSource.includes('if(e.code==="risk-control")return "触发风控，采集已停止"'));
  assert.ok(
    pageSource.includes(
      'if(e.code==="failed"||e.kind==="failed")return "采集失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误")',
    ),
  );
});

test("phase-4 page source calls the batch bridge methods with the right payloads", () => {
  for (const method of [
    "getColumns",
    "batchStart",
    "batchGet",
    "batchList",
    "batchPause",
    "batchResume",
    "batchCancel",
    "batchExport",
    "onBatchEvent",
  ]) {
    assert.match(pageSource, new RegExp(`bridge\\.${method}\\(`), `page source must call bridge.${method}`);
  }
  assert.match(
    pageSource,
    /batchStart\(\{filterState:pgyKolToFilterState\(filter\),columns:selectedColumns\}\)/,
    "batchStart must submit filterState and the selected columns",
  );
  assert.match(pageSource, /batchGet\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchPause\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchResume\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchCancel\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchExport\(\{taskId:tid\}\)/);
  // 默认勾选契约：defaultDisplay=true 的列默认选中。
  assert.match(
    pageSource,
    /res\.data\.filter\(function\(c\)\{return c\.defaultDisplay===true\}\)\.map\(function\(c\)\{return c\.id\}\)/,
    "columns with defaultDisplay=true must be pre-selected",
  );
  // 采集进行中禁用重复开始。
  assert.match(pageSource, /disabled:batchBusy\|\|batchRunning/, "start button must be disabled while busy or running");
});

test("phase-4 page source subscribes to batch events and disposes on unmount", () => {
  assert.match(pageSource, /bridge\.onBatchEvent\(function\(ev\)\{/);
  assert.match(pageSource, /if\(currentTaskId\)loadTask\(currentTaskId\)/, "batch events must refresh the current task detail");
  assert.match(
    pageSource,
    /return function\(\)\{if\(dispose&&typeof dispose==="function"\)dispose\(\)\}/,
    "onBatchEvent subscription must return a dispose cleanup",
  );
  assert.match(pageSource, /\[currentTaskId\]/, "event effect must re-subscribe when the current task changes");
});

test("phase-4 preview boundary keeps a limited DOM and shows persisted counts", () => {
  assert.match(
    pageSource,
    /预览 "\+\(result\.kols\?result\.kols\.length:0\)\+" 条 \/ 已持久化 "\+pgyKolCount\(currentTask,"raw"\)\+" 条（完整数据以导出为准）"/,
    "preview caption must state preview count vs persisted count",
  );
  // 禁止把任务全量行渲染进 DOM：页面源码不得遍历任务行数据渲染表格。
  assert.doesNotMatch(pageSource, /\.rows\.map\(function|task\.leaves\.map\(function/);
  assert.match(pageSource, /result\.kols\.map\(function\(k\)/, "preview must keep rendering only the first-page result cards");
});

test("no phase-4 handler may be embedded inside an MUI sx object", () => {
  // 历史教训（React #185，见 artifacts/verification/phase2-electron-compare/
  // final-ui-verification.json）：sx 内的函数值会被 MUI 当作样式函数以 theme 调用，
  // 渲染期触发 setState → 无限循环，页面挂载即卡死。所有 handler 必须作为组件
  // props 位于 sx 之外。
  const onClickRe = /onClick:function/g;
  let m;
  while ((m = onClickRe.exec(pageSource)) !== null) {
    const before = pageSource.slice(0, m.index);
    const sxAt = before.lastIndexOf("sx:{");
    if (sxAt < 0) continue;
    let depth = 1;
    let i = sxAt + 4;
    let inside = true;
    while (i < m.index) {
      const ch = pageSource[i];
      if (ch === '"') {
        i += 1;
        while (i < m.index && pageSource[i] !== '"') {
          if (pageSource[i] === "\\") i += 1;
          i += 1;
        }
        i += 1;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          inside = false;
          break;
        }
      }
      i += 1;
    }
    assert.ok(!inside, `onClick handler at offset ${m.index} must not live inside an sx object`);
  }

  // 更强扫描：任何扁平 sx:{...} 对象体不得包含 onClick: 键。
  const sxRe = /sx:\{/g;
  while ((m = sxRe.exec(pageSource)) !== null) {
    const bodyEnd = pageSource.indexOf("}", m.index + 4);
    assert.ok(bodyEnd >= 0, `sx object at offset ${m.index} must close`);
    const body = pageSource.slice(m.index + 4, bodyEnd);
    assert.ok(!body.includes("onClick:"), `sx object at offset ${m.index} must not contain a click handler`);
  }
});
