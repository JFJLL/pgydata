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

test("pgy-kol page source is syntactically valid JavaScript", () => {
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(pageSource);
  }, "embedded pgy-kol page source must parse as valid JavaScript");
});

test("Phase 5 page source carries the required copy", () => {
  for (const needle of [
    "找博主",
    "magiorix-pgy-kol-enabled",
    "按笔记关键词找博主，试试搜",
    "按博主昵称/小红书号找博主",
    "合作目标",
    "匹配度",
    "数据表现",
    "平台推荐",
    "常规剔除",
    "已选条件",
    "一键清空",
    "展开",
    "收起",
    "自定义列",
    "可添加列",
    "官网当前未返回",
    "增加预算并继续",
    "增加页数并继续",
    "采集未完整/需要处理",
    "功能未开启",
    "magiorix-pgy-kol-columns",
    "magiorix-pgy-kol-filters",
    "已恢复上次筛选",
    "请选择您的合作品牌",
    "合作品牌智能推荐",
    "二十大人群",
    "行业特色画像",
    "预估消费行为",
    "内容题材",
    "粉丝画像",
    "笔记类目",
    "精选博主",
    "热门活动",
    "剔除低活博主",
    "剔除掉粉博主",
    "剔除已合作博主",
    "剔除已邀约博主",
    "选择展示指标",
    "开始采集",
    "任务历史",
    "当前 Payload 预览",
    "结果可能超过 5000",
    "未知字段",
    "没有匹配的博主",
    "蒲公英登录已失效，请重新授权",
    "登录已失效",
  ]) {
    assert.ok(pageSource.includes(needle), "page source must contain: " + needle);
  }
});

test("searchType/keyword contract", () => {
  // 搜索模式切换：搜笔记 searchType=1、搜昵称 searchType=0。
  assert.match(pageSource, /searchType===1/);
  assert.match(pageSource, /searchType===0/);
  assert.ok(pageSource.includes('update({searchType:1})'), "搜笔记 mode must set searchType 1");
  assert.ok(pageSource.includes('update({searchType:0})'), "搜昵称 mode must set searchType 0");
  // 关键词字段与两处精确 placeholder。
  assert.ok(pageSource.includes("keyword"), "keyword field must exist");
  assert.ok(pageSource.includes("value:filter.keyword"));
  assert.ok(pageSource.includes("update({keyword:e.target.value})"));
  assert.ok(
    pageSource.includes('placeholder:filter.searchType===1?"按笔记关键词找博主，试试搜":"按博主昵称/小红书号找博主"'),
    "placeholder must switch by searchType",
  );
  // 搜索按钮调用 searchFirstPage(filterState)，filterState 含 searchType/keyword。
  assert.match(pageSource, /bridge\.searchFirstPage\(pgyKolToFilterState\(filter\)\)/);
  assert.ok(pageSource.includes("if(f.searchType===0||f.searchType===1)out.searchType=f.searchType"));
  assert.ok(pageSource.includes("if(f.keyword)out.keyword=f.keyword"));
});

test("five compact matrix sections exist", () => {
  for (const title of ["合作目标", "匹配度", "数据表现", "平台推荐", "常规剔除"]) {
    assert.ok(
      pageSource.includes("PgyKolMatrixSection,{title:\"" + title + "\""),
      "matrix section must exist: " + title,
    );
  }
  // 紧凑行高约 36px；页面居中 maxWidth 1180。
  assert.ok(pageSource.includes("minHeight:36"), "matrix rows must be compact (~36px)");
  assert.ok(pageSource.includes("maxWidth:1180,margin:\"0 auto\""), "page must be centered at 1180");
});

test("category expand/collapse keeps the common and full lists", () => {
  assert.ok(
    pageSource.includes('pgyKolCategoryCommon=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场"]'),
    "common category list must exist",
  );
  assert.ok(
    pageSource.includes('pgyKolCategoryFull=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场","情感","摄影","游戏","科技数码","出行旅游","音乐","搞笑","健康养生","汽车","婚嫁","商业财经","素材","其他"]'),
    "full category list must exist",
  );
  assert.ok(pageSource.includes("children:showAllCategory?\"收起\":\"展开\""), "expand/collapse toggle must exist");
  assert.ok(pageSource.includes("catOptions=showAllCategory?pgyKolCategoryFull:pgyKolCategoryCommon"));
});test("complex trees default collapsed and audience20 keeps leaf-only logic", () => {
  // 复杂树默认不展开：PgyKolTreeNode 初始 open 状态为 false。
  assert.match(pageSource, /openState=m\.useState\(false\)/, "tree nodes must default to collapsed");
  // leafOnly:true 全页面只出现一次（二十大人群）。
  assert.equal((pageSource.match(/leafOnly:true/g) || []).length, 1, "leafOnly:true must appear exactly once");
  // 二十大人群仍是叶子多选树，节点/展示/勾选契约保持。
  assert.ok(
    pageSource.includes(
      "PgyKolTree,{leafOnly:true,nodes:audCfg.nodes||[],selected:filter.audience20.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr(\"audience20\",n)},display:function(n){return n.fullPath||n.label||String(n.value)}}",
    ),
    "audience20 must render as a leaf-only PgyKolTree with fullPath display",
  );
  // 已选叶子 chips：label=fullPath，onDelete 走 toggleArr("audience20", n)。
  assert.match(
    pageSource,
    /filter\.audience20\.map\(function\(n\)\{return o\.jsx\(f1,\{key:pgyKolNodeKey\(n\),size:"small",label:n\.fullPath\|\|n\.label,onDelete:function\(\)\{toggleArr\("audience20",n\)\}\}\)\}\)/,
    "selected audience20 leaves must render as chips with fullPath label and onDelete toggle",
  );
  assert.match(pageSource, /已选 "\+filter\.audience20\.length\+" 项"/, "audience20 must keep the selected-count hint");
  assert.doesNotMatch(pageSource, /PgyKolChips,\{options:audCfg\.nodes/, "audience20 must no longer render as PgyKolChips");
});

test("PgyKolTreeNode honors leafOnly and PgyKolTree forwards it to every level", () => {
  assert.match(pageSource, /leafOnly=p\.leafOnly\|\|false/, "PgyKolTreeNode must default leafOnly to falsy");
  assert.match(pageSource, /parentOnly=leafOnly&&has/, "leafOnly parent guard must exist");
  assert.match(
    pageSource,
    /parentOnly\?o\.jsx\(w,\{variant:"body2",sx:\{wordBreak:"break-all"\},children:display\(node\)\}\):/,
    "leafOnly parent row must render path text without checkbox",
  );
  assert.match(pageSource, /onClick:function\(\)\{onToggle\(node\)\}/, "leaf rows must keep onToggle");
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
  assert.match(
    pageSource,
    /sx:\{display:"flex",alignItems:"center",gap:\.75,flex:1,cursor:"pointer",py:\.5\},onClick:function\(\)\{onToggle\(node\)\}/,
    "row onClick must live outside the sx object",
  );
});

test("the other filter controls keep their renderers and payload keys", () => {
  // 性别仍是 chips；粉丝数上下限输入框保持不变。
  assert.match(pageSource, /PgyKolChips,\{options:pgyKolGenderOptions/, "gender must stay PgyKolChips");
  assert.match(pageSource, /type:"number",label:"粉丝数下限"/, "fansNumberLower input must stay");
  assert.match(pageSource, /type:"number",label:"粉丝数上限"/, "fansNumberUpper input must stay");
  // 地域 / 行业特色画像 / 预估消费行为 / 内容题材仍是树（弹层内），不带 leafOnly。
  assert.match(pageSource, /PgyKolTreePopup,\{label:"地域"/, "location must stay a tree popup");
  assert.match(pageSource, /PgyKolTreePopup,\{label:"行业特色画像"/, "industrySpecificCrowdsMotorDom must stay a tree popup");
  assert.match(pageSource, /PgyKolTreePopup,\{label:"预估消费行为"/, "consumeBehavior must stay a tree popup");
  assert.match(pageSource, /PgyKolTreePopup,\{label:"内容题材"/, "contentTheme must stay a tree popup");
  assert.match(pageSource, /PgyKolTree,{nodes:cfg\.nodes\|\|\[\],selected:p\.selectedKeys/, "tree popup must render PgyKolTree");
  // 官网实证契约：location 单元素数组、contentTheme 传节点数组、粉丝数正整数校验。
  assert.match(pageSource, /out\.location=\[f\.location\]/, "location must be wrapped in an array");
  assert.match(pageSource, /out\.contentThemeLabel=f\.contentTheme/, "contentTheme must pass nodes, not IDs");
  assert.match(pageSource, /Number\.isFinite\(lo\)&&Number\.isInteger\(lo\)&&lo>0/, "fansNumberLower must reject non-positive values");
  assert.match(pageSource, /Number\.isFinite\(hi\)&&Number\.isInteger\(hi\)&&hi>0/, "fansNumberUpper must reject non-positive values");
});

test("column dialog contract: fixed columns, price mutual exclusion, search, order, persistence", () => {
  // 分组列表与固定列。
  assert.ok(
    pageSource.includes('pgyKolColumnGroups(){return ["固定列","博主报价","账号数据","直播数据","日常笔记数据","合作笔记数据","其他指标"]}'),
    "column groups must exist",
  );
  assert.ok(pageSource.includes('pgyKolFixedColumnIds(){return ["kolInfo","recentNotes","actions"]}'), "fixed column ids must exist");
  assert.ok(pageSource.includes('if(id==="kolInfo")return "博主信息"'), "fixed kolInfo label must exist");
  // 固定列 checked+disabled 不可删除。
  assert.match(pageSource, /disabled:!!c\.fixed/, "fixed columns must be disabled in the dialog");
  assert.ok(pageSource.includes('if(fixedIds.indexOf(id)>=0)return;'), "fixed columns must be unremovable");
  // 报价三列互斥（radio 语义）。
  assert.ok(
    pageSource.includes('c!=="price"&&c!=="picturePrice"&&c!=="videoPrice"'),
    "price/picturePrice/videoPrice must be mutually exclusive",
  );
  // 顶部搜索按 label 过滤。
  assert.ok(pageSource.includes('search===""||(c.label||"").indexOf(search)>=0'), "dialog search must filter by label");
  // 清空 = 取消所有非固定列；取消不应用；确定应用并持久化。
  assert.ok(pageSource.includes("clearDraft=function(){setDraft(fixedIds.slice())}"), "clear must reset to fixed columns only");
  assert.ok(pageSource.includes("setDraft(null);setSearch(\"\");p.onClose()"), "cancel must close without applying");
  assert.ok(pageSource.includes("p.onApply(effective.slice())"), "confirm must apply the draft");
  assert.ok(pageSource.includes('pgyKolWriteJson("magiorix-pgy-kol-columns",ids)'), "confirm must persist to localStorage");
  // 上移/下移按钮等价实现（官网为拖拽，见页面注释）。
  assert.match(pageSource, /children:"上移"/, "move-up button must exist");
  assert.match(pageSource, /children:"下移"/, "move-down button must exist");
  assert.ok(pageSource.includes("moveDraft(c.id,-1)") && pageSource.includes("moveDraft(c.id,1)"), "move buttons must call moveDraft");
  assert.ok(pageSource.includes("官网为拖拽排序，这里用按钮等价实现"), "drag-to-button equivalence comment must exist");
});

test("column persistence: defaultDisplay fallback and invalid storage fallback", () => {
  assert.match(
    pageSource,
    /list\.filter\(function\(c\)\{return c\.defaultDisplay===true\}\)\.map\(function\(c\)\{return c\.id\}\)/,
    "defaultDisplay=true columns must be pre-selected",
  );
  assert.ok(pageSource.includes("list.slice(0,8).map(function(c){return c.id})"), "fallback must cap at 8 columns");
  assert.ok(
    pageSource.includes('v.every(function(id){return typeof id==="string"&&list.some(function(c){return c.id===id})})'),
    "stored columns must be validated against the registry",
  );
  assert.ok(
    pageSource.includes('pgyKolReadJson("magiorix-pgy-kol-columns")'),
    "page must read the persisted columns key",
  );
});

test("result table renders whitelisted info column and registry-driven data columns", () => {
  // 固定「博主信息」列：头像/昵称/ID/地域/性别（whitelisted 字段）。
  assert.match(pageSource, /k&&\(k\.avatar\|\|k\.avatarUrl\)\|\|""/, "avatar must come from whitelisted fields");
  assert.ok(pageSource.includes("children:k&&k.nickname||\"-\""), "nickname must render with dash fallback");
  assert.ok(pageSource.includes("children:k&&k.userId||\"-\""), "userId must render with dash fallback");
  assert.ok(pageSource.includes("((k&&k.location)||\"-\")+\" · \"+((k&&k.gender)||\"-\")"), "location and gender must render");
  // 数据列按 selectedColumns 顺序动态生成，列值走 responsePath。
  assert.match(pageSource, /var result=p\.result,kols=result\.kols\|\|\[\]/, "table must read result.kols");
  assert.ok(pageSource.includes("col.responsePath||col.id"), "cell value must resolve via responsePath");
  assert.ok(pageSource.includes('String(path).split(".")'), "responsePath must support dotted paths");
  assert.ok(pageSource.includes("cur=cur[parts[i]]"), "dotted path traversal must exist");
  // formatter：number 千分位、percent 一位小数、money 加元、url 链接。
  assert.ok(pageSource.includes('if(fmt==="number")return pgyKolThousand(v)'), "number formatter must exist");
  assert.ok(pageSource.includes('(Math.abs(n)<=1?n*100:n).toFixed(1)+"%"'), "percent formatter must keep one decimal without double-scaling");
  assert.ok(pageSource.includes('String(v)+"元"'), "money formatter must append yuan without rounding/space");
  assert.ok(pageSource.includes('component:"a"') && pageSource.includes('target:"_blank"'), "url formatter must render a link");
  // null/undefined 显示「-」，unavailable 列显示「官网当前未返回」。
  assert.ok(pageSource.includes('v.value===undefined||v.value===null||v.value===""'), "null cells must be detected");
  assert.ok(pageSource.includes('col.evidence==="unavailable"'), "unavailable columns must be detected via evidence");
  assert.ok(pageSource.includes('children:"官网当前未返回"'), "unavailable cells must show official-missing copy");
  // 只渲染首页结果，禁止全量行数据进 DOM。
  assert.match(pageSource, /kols\.map\(function\(k,ki\)/, "table rows must map over first-page kols");
  assert.doesNotMatch(pageSource, /\.rows\.map\(function|task\.leaves\.map\(function/);
});

test("Phase 5：单元格格式化规则——percent 不重复乘 100、money 无空格、price 复合列计算、unavailable 走 evidence", () => {
  // 真实响应实证（2026-08-06 抓取）：fansActiveIn28dLv 返回 40.6（已是百分比），
  // 若无条件乘 100 会显示 4060.0%。规则：|v|<=1 视为比率乘 100，否则原值。
  assert.match(
    pageSource,
    /\(Math\.abs\(n\)<=1\?n\*100:n\)\.toFixed\(1\)\+"%"/,
    "percent formatter must not double-scale values above 1",
  );
  assert.doesNotMatch(
    pageSource,
    /fmt==="percent"\)\{var n=Number\(v\);return Number\.isFinite\(n\)\?\(n\*100\)\.toFixed\(1\)\+"%"/,
    "percent formatter must no longer multiply by 100 unconditionally",
  );
  // money 与导出口径一致：无空格（800元）。
  assert.match(pageSource, /fmt==="money"\)return String\(v\)\+"元"/);
  assert.doesNotMatch(pageSource, /fmt==="money"\)return pgyKolThousand\(v\)\+" 元"/);
  // price（全部报价）复合列：由 picturePrice/videoPrice 计算展示。
  assert.match(
    pageSource,
    /col\.id==="price"\)\{var pic=k&&k\.picturePrice,vid=k&&k\.videoPrice,ps=\[\]/,
    "price column must compute from picturePrice/videoPrice",
  );
  assert.match(pageSource, /ps\.join\(" \/ "\)/);
  // unavailable 列以 evidence 判定（注册表无 unavailable 布尔字段）。
  assert.match(pageSource, /col\.evidence==="unavailable"/);
  assert.doesNotMatch(pageSource, /col\.unavailable===true/);
});

test("Phase 5：未实证取值字段不发送（fresh reviewer M1/M2/M3 修复）", () => {
  // 人群目标/合作行业/预估CPM/精选博主取值语义未实证：不得进入 pgyKolToFilterState。
  for (const key of [
    "audienceGroup",
    "firstIndustry",
    "secondIndustry",
    "estimateCpuv30dLower",
    "estimateCpuv30dUpper",
    "inStar",
    "newHighQuality",
    "filterIntention",
    "isIndustryRecommend",
  ]) {
    assert.ok(
      !pageSource.includes(`out.${key}=`),
      `pgyKolToFilterState 不得发送未实证字段 ${key}`,
    );
  }
  // 待实证集合与用户提示必须存在（M3/M6 可见性）。
  assert.match(pageSource, /function pgyKolUnprovenSet\(\)\{return \{audienceGroup:1,firstIndustry:1/);
  assert.ok(
    pageSource.includes("取值语义尚未经官网最小流量实证，暂不参与查询与采集"),
    "未实证选择必须显示可见提示",
  );
  assert.ok(
    pageSource.includes('label:(pgyKolUnprovenSet()[s.key]?"【待实证】":"")+s.label'),
    "unproven summary chips must carry the 待实证 suffix",
  );
});

test("brand gating: audience group and exclude switches require a cooperation brand", () => {
  assert.ok(pageSource.includes("hasBrands=filter.brands&&filter.brands.length>0"), "hasBrands must be derived from brands");
  assert.equal((pageSource.match(/disabled:!hasBrands/g) || []).length, 3, "audienceGroup + two exclude switches must be gated");
  assert.ok(pageSource.includes('children:"请选择您的合作品牌"'), "no-brand hint must exist");
  assert.ok(pageSource.includes('provider:"brandSearch",keyword:kw0||""'), "brand popup must call brandSearch provider");
  assert.ok(pageSource.includes("out.activityCodes=f.activityCodes"), "activityCodes must be submitted");
});

test("restart restore and one-click clear persistence", () => {
  assert.ok(pageSource.includes('pgyKolReadJson("magiorix-pgy-kol-filters")'), "filters must be restored from localStorage");
  assert.ok(pageSource.includes("saved.selectedColumns"), "restore must carry selected columns");
  assert.ok(pageSource.includes("setRestoredNotice(true)"), "restore must show the restored notice");
  assert.ok(pageSource.includes('children:"已恢复上次筛选（可用「一键清空」清除持久化）"'), "restored notice copy must exist");
  assert.ok(pageSource.includes('pgyKolClearJson("magiorix-pgy-kol-filters")'), "one-click clear must purge persisted filters");
  assert.ok(pageSource.includes("setFilter(pgyKolDefaultFilter())"), "one-click clear must reset the filter");
  assert.ok(
    pageSource.includes('pgyKolWriteJson("magiorix-pgy-kol-filters",{searchType:filter.searchType,keyword:filter.keyword,filter:filter,selectedColumns:selectedColumns})'),
    "filter changes must persist searchType/keyword/filter/selectedColumns",
  );
});

test("icon beautification: menu, page header, and search button use mdi:account-search", () => {
  // 菜单项 icon。
  assert.ok(
    script.includes('{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"mdi:account-search"}'),
    "menu item must carry mdi:account-search",
  );
  assert.ok(!script.includes("solar:magnifer-bold-duotone"), "old solar magnifer icon must be gone");
  // 页面头部：渐变圆角方块 + 白色 mdi 图标。
  assert.ok(pageSource.includes("mdi:account-search"), "page header must use mdi:account-search");
  assert.ok(
    pageSource.includes('background:"linear-gradient(135deg,#FF6C40,#FF3030)"'),
    "page header must use the Magiorix orange-red gradient",
  );
  assert.ok(pageSource.includes('color:"#fff"'), "header icon must be white on the gradient tile");
  // 搜索按钮 startIcon。
  assert.ok(
    pageSource.includes('startIcon:status==="loading"?o.jsx(de,{size:18,color:"inherit"}):o.jsx(B,{icon:"mdi:account-search",width:18,height:18})'),
    "search button startIcon must use mdi:account-search",
  );
});test("Phase 5 page source ships the batch UI copy and status texts", () => {
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
    "暂无采集任务",
    "请至少选择一个可导出的展示字段",
    "查看",
  ]) {
    assert.ok(pageSource.includes(needle), "page source must contain: " + needle);
  }
  for (const [status, text] of [
    ["running", "采集中"],
    ["paused", "已暂停"],
    ["auth-expired", "登录已失效"],
    ["risk-control", "触发风控"],
    ["cancelled", "已取消"],
    ["failed", "采集失败"],
    ["incomplete", "采集未完整"],
    ["completed", "已完成"],
  ]) {
    assert.ok(pageSource.includes('if(s==="' + status + '")return "' + text + '"'), "status text for " + status + " must exist");
  }
});

test("Phase 5 page source maps completeness and error copy", () => {
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

test("Phase 5 page source calls the batch bridge methods with the right payloads", () => {
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
    assert.match(pageSource, new RegExp("bridge\\." + method + "\\("), "page source must call bridge." + method);
  }
  assert.match(
    pageSource,
    /batchStart\(\{filterState:pgyKolToFilterState\(filter\),columns:exportColumns\}\)/,
    "batchStart must submit filterState and only exportable selected columns in order",
  );
  assert.match(
    pageSource,
    /pgyKolExportColumnIds\(columnList,selectedColumns\)/,
    "startBatch must filter fixed/computed/unavailable columns out of the export column list",
  );
  assert.match(pageSource, /batchGet\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchPause\(\{taskId:tid\}\)/);
  assert.match(
    pageSource,
    /bridge\.batchResume\(budgets\?\{taskId:tid,budgets:budgets\}:\{taskId:tid\}\)/,
    "batchResume must forward budgets when provided",
  );
  assert.match(pageSource, /batchCancel\(\{taskId:tid\}\)/);
  assert.match(pageSource, /batchExport\(\{taskId:tid\}\)/);
  assert.match(pageSource, /disabled:batchBusy\|\|batchRunning/, "start button must be disabled while busy or running");
});

test("Phase 5 page source subscribes to batch events and disposes on unmount", () => {
  assert.match(pageSource, /bridge\.onBatchEvent\(function\(ev\)\{/);
  assert.match(pageSource, /if\(currentTaskId\)loadTask\(currentTaskId\)/, "batch events must refresh the current task detail");
  assert.match(
    pageSource,
    /return function\(\)\{if\(dispose&&typeof dispose==="function"\)dispose\(\)\}/,
    "onBatchEvent subscription must return a dispose cleanup",
  );
  assert.match(pageSource, /\[currentTaskId\]/, "event effect must re-subscribe when the current task changes");
});

test("Phase 5 preview boundary keeps a limited DOM and shows persisted counts", () => {
  assert.match(
    pageSource,
    /预览 "\+\(result\.kols\?result\.kols\.length:0\)\+" 条 \/ 已持久化 "\+pgyKolCount\(currentTask,"raw"\)\+" 条（完整数据以导出为准）"/,
    "preview caption must state preview count vs persisted count",
  );
  assert.match(pageSource, /result\.capSignal&&result\.capSignal\.capped/, "cap signal chips must be kept");
  assert.match(pageSource, /quarantinedFields/, "unknown-field isolation chips must be kept");
});

test("Phase 4.1：incomplete 显示“采集未完整/需要处理”，绿色仅留给完整证明", () => {
  assert.match(
    pageSource,
    /color:t\.status==="completed"&&t\.completeness==="complete"\?"success":incompleteShown\?"warning":/,
    "green badge must require completed AND complete",
  );
  assert.match(pageSource, /label:incompleteShown\?"采集未完整\/需要处理":statusText/);
  assert.match(
    pageSource,
    /采集未完整\/需要处理："\+\(resumePlan&&resumePlan\.reasonText\|\|completenessText\)/,
    "incomplete panel must show a concrete reason",
  );
  assert.match(pageSource, /legacyUnproven=t\.status==="completed"&&t\.completeness!=="complete"/);
  assert.match(
    pageSource,
    /if\(t\.status==="completed"&&t\.completeness!=="complete"\)return \{kind:"blocked"/,
    "legacy completed+cannot-prove tasks must not offer a blind continue",
  );
  assert.doesNotMatch(pageSource, /color:t\.status==="completed"\?"success"/, "badge must not be green for completed alone");
});

test("Phase 4.1：budget-exhausted 显示预算/已消费/允许范围与输入门控", () => {
  assert.match(
    pageSource,
    /"当前"\+resumePlan\.label\+"："\+resumePlan\.current\+"；已消费请求数："\+resumePlan\.used\+"；允许新值："\+resumePlan\.min\+"～"\+resumePlan\.max/,
    "budget resume hint must show current/consumed/allowed range",
  );
  assert.match(pageSource, /if\(reason==="budget-exhausted"\)\{var curB=Number\.isInteger\(cur\.queryBudget\)/);
  assert.match(pageSource, /min=Math\.max\(curB,used\)\+1/);
  assert.match(pageSource, /if\(min>1000\)return \{kind:"blocked"/);
  assert.match(pageSource, /children:resumePlan\.kind==="maxPages"\?"增加页数并继续":"增加预算并继续"/);
  assert.match(pageSource, /disabled:!inputValid/);
  assert.match(pageSource, /Number\.isInteger\(parsedInput\)&&parsedInput>=resumePlan\.min&&parsedInput<=resumePlan\.max/);
  assert.match(pageSource, /resumeEligible=resumePlan&&\(resumePlan\.kind==="budget"\|\|resumePlan\.kind==="maxPages"\)/);
  assert.match(pageSource, /resumePlan&&resumePlan\.kind==="blocked"&&o\.jsx\(w,\{variant:"body2"/);
  for (const reason of [
    "repeat-page",
    "capped-unprovable",
    "checkpoint-desync",
    "已到官方安全页数上限",
    "已消费请求数已达预算上限",
  ]) {
    assert.ok(pageSource.includes(reason), "page source must carry the blocked reason: " + reason);
  }
  assert.match(pageSource, /if\(reason==="max-pages-reached"\)\{var curM=Number\.isInteger\(cur\.maxPagesPerLeaf\)/);
  assert.match(pageSource, /curM>=250\)return \{kind:"blocked"/);
  assert.match(pageSource, /min:curM\+1,max:250/);
  assert.match(
    pageSource,
    /t\.status==="cancelled"\|\|t\.status==="failed"\|\|t\.status==="completed"\|\|t\.status==="incomplete"\)\?null:o\.jsx\(\$,\{size:"small",variant:"outlined",color:"error",onClick:p\.onCancel/,
    "cancel must be hidden for incomplete",
  );
  assert.match(
    pageSource,
    /\(t\.status==="paused"\|\|t\.status==="auth-expired"\|\|t\.status==="interrupted"\|\|t\.status==="failed"\)&&o\.jsx\(\$,\{size:"small",variant:"outlined",onClick:p\.onResume,children:"继续"\}\)/,
    "plain resume must stay for paused/auth-expired/interrupted/failed",
  );
});

test("Phase 4.1：任务历史对 incomplete 使用 warning 徽章", () => {
  assert.match(
    pageSource,
    /color:t\.status==="completed"&&t\.completeness==="complete"\?"success":t\.status==="incomplete"\?"warning":"default"/,
    "history badge must warn for incomplete",
  );
  assert.match(pageSource, /label:t\.status==="incomplete"\?"采集未完整":pgyKolStatusText\(t\.status\)/);
});

test("preload bridge exposes all pgy-kol methods the page depends on", () => {
  assert.match(preload, /pgyKol:\{getStatus:/);
  assert.match(preload, /getSchemaStatus:/);
  assert.match(preload, /searchFirstPage:e=>r\.ipcRenderer\.invoke\("pgy-kol:search-first-page",e\)/);
  assert.match(preload, /getConfig:e=>r\.ipcRenderer\.invoke\("pgy-kol:config",e\)/);
  assert.match(preload, /previewPayload:e=>r\.ipcRenderer\.invoke\("pgy-kol:payload-preview",e\)/);
  assert.match(preload, /batchStart:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-start",e\)/);
  assert.match(preload, /batchList:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:batch-list"\)/);
  assert.match(preload, /batchGet:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-get",e\)/);
  assert.match(preload, /batchPause:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-pause",e\)/);
  assert.match(preload, /batchResume:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-resume",e\)/);
  assert.match(preload, /batchCancel:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-cancel",e\)/);
  assert.match(preload, /batchExport:e=>r\.ipcRenderer\.invoke\("pgy-kol:batch-export",e\)/);
  assert.match(preload, /getColumns:\(\)=>r\.ipcRenderer\.invoke\("pgy-kol:columns"\)/);
  assert.match(preload, /onBatchEvent:e=>/);
});

test("patch script wires route, menu merge, and dev switch with idempotent guards", () => {
  assert.ok(
    script.includes(
      '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>({default:PgyKolSearchPage})),void 0,import.meta.url),',
    ),
    "route entry must expose default export",
  );
  assert.ok(
    !script.includes(
      '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>PgyKolSearchPage),void 0,import.meta.url)',
    ),
    "route loader must not pass a bare component",
  );
  assert.ok(script.includes('const pgyKolRouteMarker = \'"../pages/pgy-kol-search/index.tsx":()=>G(\';'), "route guard marker must be defined");
  assert.ok(script.includes("setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})"), "store setter must merge the local menu");
  assert.ok(
    !script.includes('{name:"找博主",path:"/pgy-kol-search",component:"../pages/pgy-kol-search/index.tsx"'),
    "menu component must not carry a leading ../",
  );
  assert.ok(script.includes('localStorage.getItem("magiorix-pgy-kol-enabled")==="1"'), "dev switch must gate the page");
  assert.ok(script.includes('const crypto = require("crypto")'), "patch script must require crypto for the content guard");
  assert.ok(script.includes("normalizeSource(pgyKolSearchPageSource)"), "content guard must hash the embedded page source");
  assert.ok(script.includes("existingSha1 !== sourceSha1"), "content guard must compare existing block hash with source hash");
  assert.ok(
    script.includes('normalizeSource(existingBlock).replace(/\\n$/, "")'),
    "content guard must strip the trailing separator newline before hashing",
  );
  assert.ok(
    script.includes('bundleBefore.indexOf("V1=new Map;function pgyKolDevEnabled")'),
    "patch script must locate the injected block start",
  );
  assert.ok(
    script.includes('bundleBefore.indexOf("function si(e){", oldStart)'),
    "upgrade path must locate the end of the old injected source block",
  );
  assert.ok(script.includes("!fs.readFileSync(mainBundle, \"utf8\").includes(pgyKolRouteMarker)"), "route injection must be guarded");
  assert.ok(script.includes("!fs.readFileSync(mainBundle, \"utf8\").includes(pgyKolStoreTo)"), "store injection must be guarded");
  assert.ok(script.includes('"V1=new Map;function si(e){"'), "script must reference the component injection anchor verbatim");
  const dashboardRouteFrom = '"../pages/dashboard/index.tsx":()=>G(()=>Promise.resolve().then(()=>W5),void 0,import.meta.url),';
  assert.ok(script.includes(dashboardRouteFrom), "script must define the dashboard route from-anchor verbatim");
  assert.ok(bundle.includes(dashboardRouteFrom), "dashboard route from-anchor must exist in main bundle");
  const storeFrom = "setMenus:t=>e({menus:t})";
  const storeTo = "setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})";
  assert.ok(script.includes(storeFrom), "script must define the store from-anchor verbatim");
  assert.ok(bundle.includes(storeFrom) || bundle.includes(storeTo), "store anchor must exist in main bundle");
  assert.ok(
    bundle.includes("V1=new Map;function si(e){") || bundle.includes("function PgyKolSearchPage"),
    "component injection anchor must exist in main bundle (original or already-applied form)",
  );
});

test("page must load config, preview payload, and search through the existing bridge", () => {
  assert.ok(script.includes("bridge.getConfig("), "page must load filter config via bridge.pgyKol.getConfig");
  assert.ok(script.includes("bridge.previewPayload("), "page must preview payload via bridge.pgyKol.previewPayload");
  assert.ok(script.includes("bridge.searchFirstPage("), "page must search via bridge.pgyKol.searchFirstPage");
  assert.ok(pageSource.includes('provider:"activities"'), "hot activities must load via getConfig activities provider");
});

test("page source must not carry legacy brand residue or banned names", () => {
  assert.doesNotMatch(pageSource, legacyFrontendBrandPattern, "pgy-kol page source must stay brand-free");
  for (const banned of ["树苗", "薯苗", "zs.login", "zs."]) {
    assert.ok(!pageSource.includes(banned), "page source must not contain: " + banned);
  }
  assert.ok(!script.includes("solar:magnifer-bold-duotone"), "old solar magnifer icon residue must be gone from the script");
});

test("no handler may be embedded inside an MUI sx object", () => {
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
    assert.ok(!inside, "onClick handler at offset " + m.index + " must not live inside an sx object");
  }
  const sxRe = /sx:\{/g;
  while ((m = sxRe.exec(pageSource)) !== null) {
    const bodyEnd = pageSource.indexOf("}", m.index + 4);
    assert.ok(bodyEnd >= 0, "sx object at offset " + m.index + " must close");
    const body = pageSource.slice(m.index + 4, bodyEnd);
    assert.ok(!body.includes("onClick:"), "sx object at offset " + m.index + " must not contain a click handler");
  }
});
