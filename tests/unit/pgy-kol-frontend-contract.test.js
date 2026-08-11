const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");
const mainBundlePath = path.join(projectRoot, "assets", "1.2.0", "assets", "index-B09sHfUO.js");
const patchScriptPath = path.join(projectRoot, "scripts", "apply-magiorix-frontend-patches.js");
const pageSourcePath = path.join(projectRoot, "scripts", "pgy-kol-phase52-page-source.js");
const preloadPath = path.join(projectRoot, "app-source", "dist-electron", "preload.mjs");
const acceptanceDriverPath = path.join(projectRoot, "artifacts", "verification", "pgy-phase52-acceptance", "driver.js");

const script = fs.readFileSync(patchScriptPath, "utf8");
const pageSource = fs.readFileSync(pageSourcePath, "utf8");
const bundle = fs.readFileSync(mainBundlePath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const acceptanceDriver = fs.readFileSync(acceptanceDriverPath, "utf8");

const legacyFrontendBrandPattern = /(?:\bzs\.|@zsdesktop|PYGdata|Emagic(?:DataCrawler| Data Crawler)?|易美(?:传播|数据抓取)?)/i;

function jsx(type, props) {
  return { type, props: props || {} };
}

function pageRuntime(extra) {
  const runtime = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    o: { jsx, jsxs: jsx },
    m: {
      useState(initial) {
        let value = typeof initial === "function" ? initial() : initial;
        return [value, (next) => { value = typeof next === "function" ? next(value) : next; }];
      },
      useEffect() {},
      useCallback(fn) { return fn; },
      useRef(initial) { return { current: initial }; },
    },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    },
    document: { documentElement: { classList: { add() {}, remove() {} } } },
    NodeFilter: { SHOW_TEXT: 4 },
  };
  const componentNames = new Set();
  const declaredNames = new Set();
  for (const match of pageSource.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) declaredNames.add(match[1]);
  for (const match of pageSource.matchAll(/o\.jsx?s?\(([A-Za-z_$][\w$]*)/g)) componentNames.add(match[1]);
  for (const name of componentNames) if (!declaredNames.has(name) && !(name in runtime)) runtime[name] = name;
  Object.assign(runtime, extra || {});
  vm.createContext(runtime);
  vm.runInContext(pageSource, runtime, { filename: pageSourcePath });
  return runtime;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function vnodeChildren(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node;
  if (typeof node !== "object") return [];
  return [node.props && node.props.children];
}

function findVnodes(root, predicate) {
  const found = [];
  const seen = new Set();
  function walk(node) {
    if (node == null || typeof node === "boolean") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (predicate(node)) found.push(node);
    vnodeChildren(node).forEach(walk);
  }
  walk(root);
  return found;
}

function createCoordinator(bridge, options) {
  const runtime = pageRuntime();
  assert.equal(typeof runtime.pgyKolCreateSearchCoordinator, "function", "page must expose its executable draft/applied coordinator");
  return runtime.pgyKolCreateSearchCoordinator(Object.assign({ bridge }, options || {}));
}

function successResult() {
  return { ok: true, data: { kols: [{ userId: "fixture-user" }] } };
}

function statefulRenderer(runtime, component, props, refElement) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let pendingEffects = [];
  function changed(a, b) {
    if (!a || !b || a.length !== b.length) return true;
    return a.some((value, index) => !Object.is(value, b[index]));
  }
  runtime.m = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || changed(deps, previous.deps)) pendingEffects.push({ index, fn, deps });
    },
    useCallback(fn) { cursor += 1; return fn; },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  function mountRefs(tree) {
    findVnodes(tree, (node) => {
      const ref = node.props && node.props.ref;
      if (typeof ref === "function") ref(refElement);
      else if (ref && typeof ref === "object") ref.current = refElement;
      return false;
    });
  }
  function render() {
    cursor = 0;
    pendingEffects = [];
    const tree = component(props || {});
    mountRefs(tree);
    for (const next of pendingEffects) {
      const previous = effects[next.index];
      if (previous && typeof previous.cleanup === "function") previous.cleanup();
      effects[next.index] = { deps: next.deps, cleanup: next.fn() };
    }
    return tree;
  }
  return { render };
}

function searchPageHarness(searchFirstPage, options) {
  options = options || {};
  const bridge = {
    getSchemaFields() { return Promise.resolve({ ok: true, data: [] }); },
    getConfig() { return Promise.resolve({ ok: true, data: { nodes: [], options: [] } }); },
    getColumns() { return Promise.resolve({ ok: true, data: [{ id: "nickname", responsePath: "nickname", defaultDisplay: true }] }); },
    previewPayload() { return Promise.resolve({ ok: true, data: {} }); },
    batchList() { return Promise.resolve({ ok: true, data: [] }); },
    onBatchEvent() { return () => {}; },
    searchFirstPage,
  };
  const runtime = pageRuntime({
    document: {
      documentElement: { classList: { add() {}, remove() {} } },
      createTreeWalker() { return { nextNode() { return null; } }; },
      body: {},
    },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      bridge: { pgyKol: bridge },
      localStorage: {
        getItem(key) {
          if (key === "magiorix-pgy-kol-enabled") return "1";
          if (key === "magiorix-pgy-kol-filters" && options.savedFilters) return JSON.stringify(options.savedFilters);
          return null;
        },
        setItem() {},
        removeItem() {},
      },
      setTimeout() { return 1; },
      clearTimeout() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const renderer = statefulRenderer(runtime, runtime.PgyKolSearchPage, {}, { scrollIntoView() {} });
  return { bridge, runtime, renderer };
}

function editRepresentativePageDraft(runtime, renderer) {
  let tree = renderer.render();
  const keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  const marketing = findVnodes(tree, (node) => node.type === runtime.PgyKolInlineOptions && node.props && Array.isArray(node.props.options) && node.props.options.some((option) => option.value === "种草"))[0];
  const genderTrigger = findVnodes(tree, (node) => node.type === runtime.PgyKolTrigger && node.props && node.props.label === "性别")[0];
  const excludeLowActive = findVnodes(tree, (node) => node.type === runtime.PgyKolCheck && node.props && node.props.label === "剔除低活博主")[0];
  assert.ok(keywordInput && marketing && genderTrigger && excludeLowActive, "representative page draft controls must render");
  keywordInput.props.onChange({ target: { value: "  页面完整条件  " } });
  marketing.props.onToggle({ value: "种草", label: "种草" });
  excludeLowActive.props.onToggle();
  genderTrigger.props.onOpen({ currentTarget: {} });
  tree = renderer.render();
  const genderPopover = findVnodes(tree, (node) => node.type === runtime.PgyKolOptionPop && node.props && node.props.title === "性别")[0];
  assert.ok(genderPopover, "gender popover must render from the real page handler");
  genderPopover.props.onToggle({ value: "女", label: "女" });
  return renderer.render();
}

// Phase 5.2：页面源码单一权威来源为 scripts/pgy-kol-phase52-page-source.js，
// 由 apply-magiorix-frontend-patches.js 直接 readFileSync 注入 bundle。
test("pgy-kol page source is syntactically valid JavaScript", () => {
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(pageSource);
  }, "embedded pgy-kol page source must parse as valid JavaScript");
});

test("draft edits, including a popover confirm, never call searchFirstPage", () => {
  let searches = 0;
  const coordinator = createCoordinator({
    searchFirstPage() { searches += 1; return Promise.resolve(successResult()); },
  });
  const tenPatches = [
    { marketTarget: "种草" },
    { contentTag: ["美妆"] },
    { gender: "女" },
    { location: { value: "310000", label: "上海" } },
    { audience20: [{ value: "a20", label: "人群" }] },
    { fansNumberLower: "10000" },
    { fansNumberUpper: "50000" },
    { noteType: 1 },
    { inStar: true },
    { excludeLowActive: true },
  ];
  tenPatches.forEach((patch) => coordinator.editDraft(patch));
  assert.equal(searches, 0, "ten independent draft edits must not search");
  coordinator.editDraft({ audience20: [{ value: "a20-confirmed", label: "弹层确定" }] });
  assert.equal(searches, 0, "a popover's internal confirm only applies its local selection to draft");
  assert.equal(coordinator.getState().isDirty, true);
});

test("global apply searches exactly once and blocks double-click / consecutive Enter while loading", async () => {
  const pending = deferred();
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { calls.push(JSON.parse(JSON.stringify(filterState))); return pending.promise; },
  });
  coordinator.editDraft({ keyword: "  测试昵称  ", searchType: 0, gender: "女" });
  const click = coordinator.applyAndSearch();
  const doubleClick = coordinator.applyAndSearch();
  const enter = coordinator.applyAndSearch();
  assert.strictEqual(doubleClick, click, "same-key double click must reuse the exact in-flight Promise");
  assert.strictEqual(enter, click, "same-key Enter must reuse the exact in-flight Promise");
  assert.equal(calls.length, 1, "all global submit entrances must share the same in-flight guard");
  assert.equal(calls[0].keyword, "测试昵称", "the applied snapshot must be normalized before the request");
  pending.resolve(successResult());
  await Promise.all([click, doubleClick, enter]);
  assert.equal(coordinator.getState().status, "loaded");
  assert.equal(coordinator.getState().isDirty, false);
});

test("same request key in flight applies the latest complete submitted draft", async () => {
  const pending = deferred();
  const searchCalls = [];
  const batchCalls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) {
      searchCalls.push(JSON.parse(JSON.stringify(filterState)));
      return pending.promise;
    },
    batchStart(payload) {
      batchCalls.push(JSON.parse(JSON.stringify(payload)));
      return Promise.resolve({ ok: true, data: { taskId: "fixture" } });
    },
  });
  coordinator.editDraft({ featureTags: [{ value: "X", label: "X" }], contentSceneLabel: [] });
  const first = coordinator.applyAndSearch();
  coordinator.editDraft({ featureTags: [], contentSceneLabel: [{ value: "X", label: "X" }] });
  const latest = coordinator.applyAndSearch();

  assert.strictEqual(latest, first, "equivalent request keys must reuse the exact in-flight Promise");
  assert.equal(searchCalls.length, 1);
  assert.deepEqual(searchCalls[0].featureTags, ["X"]);
  pending.resolve(successResult());
  await latest;

  const state = coordinator.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(state.appliedFilter.featureTags)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(state.appliedFilter.contentSceneLabel)), [{ value: "X", label: "X" }]);
  assert.equal(state.isDirty, false, "latest full draft must be the frozen applied UI snapshot");
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 1);
  assert.deepEqual(batchCalls[0].filterState, searchCalls[0], "batch still uses the one frozen request snapshot");
});

test("formal submit reads the complete current draft and builds one normalized filterState", async () => {
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { calls.push(JSON.parse(JSON.stringify(filterState))); return Promise.resolve(successResult()); },
  });
  const personalTag = { value: "宝妈", label: "宝妈" };
  const featureTag = { value: "医生", label: "医生" };
  const location = { value: "310000", label: "上海", path: "中国 上海" };
  const audience20 = { value: "a20", label: "人群", fullPath: "人群 人群A" };
  const automotive = { value: "auto", label: "汽车", children: [{ value: "leaf", label: "叶子" }] };
  const consume = { value: "consume", label: "高消费", path: "消费 高消费" };
  const theme = { value: "theme", label: "教程", fullPath: "内容 教程" };
  const scene = { value: "开箱测评", label: "开箱测评" };
  const noteCategory = { value: "note", label: "美妆", fullPath: "美妆 彩妆" };
  const range = (value) => ({ value, label: value.join("-") });

  coordinator.editDraft({
    searchType: 0,
    keyword: "  完整条件  ",
    marketTarget: "种草",
    audienceGroup: "unproven-crowd",
    brands: ["brand-gate-only"],
    personalTags: [personalTag],
    featureTags: [featureTag],
    gender: "女",
    location,
    audience20: [audience20],
    automotive: [automotive],
    consumeBehavior: [consume],
    signed: "已签约",
    contentSceneLabel: [scene],
    contentTheme: [theme],
    fansNumberLower: "10000",
    fansNumberUpper: "50000",
    fansAge: "18-24",
    fansGender: "女",
    fansLocation: location,
    fansMaritalStatus: "已婚",
    fansConsumptionLevel: "高",
    fansChildAgeInfo: [{ value: "0-3", label: "0-3岁" }],
    fansDevicePrice: [{ value: "5000+", label: "5000元以上" }],
    fansDeviceBrand: [{ value: "Apple", label: "Apple" }],
    accumCommonImpMedinNum30d: range([1000, 5000]),
    readMidNor30: range([500, 1000]),
    interMidNor30: range([100, 500]),
    thousandLikePercent30: range([0.1, 0.2]),
    noteType: 1,
    notePriceLower: "100",
    notePriceUpper: "500",
    videoPriceLower: "200",
    videoPriceUpper: "800",
    coopCredit: range([0.8, 1]),
    progressOrderCnt: { label: "0～3", value: [0, 3] },
    tradeType: "母婴",
    tradeReportBrandIdSet: ["recent-brand"],
    coopImpMedin: range([1000, 5000]),
    coopReadMid: range([500, 1000]),
    coopInterMid: range([100, 500]),
    coopOverflowMid: range([10, 50]),
    estimatePicReadCost: range([1, 2]),
    estimateVideoReadCost: range([2, 3]),
    estimatePicEngageCost: range([3, 4]),
    estimateVideoEngageCost: range([4, 5]),
    estimatePictureCpm: range([5, 6]),
    estimateVideoCpm: range([6, 7]),
    overflowCost: range([7, 8]),
    liveCount30d: [{ value: "1-3", label: "1-3场" }],
    avgLiveViewer: [{ value: "1000-5000", label: "1000-5000" }],
    avgLiveGmv: [{ value: "1w-5w", label: "1万-5万" }],
    noteCategory: [noteCategory],
    inStar: true,
    newHighQuality: true,
    isHighQualityFlag: true,
    hasBuyerCoopAuthFlag: true,
    filterIntention: true,
    firstIndustry: "美妆",
    secondIndustry: "彩妆",
    activityCodes: ["activity-1"],
    excludeLowActive: true,
    fansNumUp: true,
    excludedTradeReportBrand: true,
    excludedTradeInviteReportBrand: true,
    contentTag: ["全部", "美妆"],
  });
  await coordinator.applyAndSearch();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    searchType: 0,
    keyword: "完整条件",
    marketTarget: "种草",
    personalTags: ["宝妈"],
    featureTags: ["医生", "开箱测评"],
    gender: "女",
    location: [location],
    signed: "已签约",
    top20CrowdsLabel: [audience20],
    industrySpecificCrowdsMotorDom: [automotive],
    kolInfoConsumBehaviorLabel: [consume],
    contentThemeLabel: [theme],
    fansNumberLower: 10000,
    fansNumberUpper: 50000,
    fansAge: "18-24",
    fansGender: "女",
    fansLocation: location,
    fansMaritalStatus: "已婚",
    fansConsumptionLevel: "高",
    fansChildAgeInfo: [{ value: "0-3", label: "0-3岁" }],
    fansDevicePrice: [{ value: "5000+", label: "5000元以上" }],
    fansDeviceBrand: [{ value: "Apple", label: "Apple" }],
    accumCommonImpMedinNum30d: [1000, 5000],
    readMidNor30: [500, 1000],
    interMidNor30: [100, 500],
    thousandLikePercent30: [0.1, 0.2],
    noteType: 1,
    notePriceLower: 100,
    notePriceUpper: 500,
    videoPriceLower: 200,
    videoPriceUpper: 800,
    progressOrderCnt: [0, 3],
    tradeType: "母婴",
    tradeReportBrandIdSet: ["recent-brand"],
    activityCodes: ["activity-1"],
    excludeLowActive: true,
    fansNumUp: 1,
    excludedTradeReportBrand: true,
    excludedTradeInviteReportBrand: true,
    contentTag: ["美妆"],
    inviteReply48hNumRatio: [0.8, 1],
    accumCoopImpMedinNum30d: [1000, 5000],
    readMidCoop30: [500, 1000],
    interMidCoop30: [100, 500],
    mCpuv30d: [10, 50],
    estimatePicReadPrice: [1, 2],
    estimateVideoReadPrice: [2, 3],
    estimatePictureEngageCost: [3, 4],
    estimateVideoEngageCost: [4, 5],
    estimatePictureCpm: [5, 6],
    estimateVideoCpm: [6, 7],
    estimateCpuv30d: [7, 8],
    "filterList.kliveCnt30d": ["1-3"],
    "filterList.avgLiveViewerNum": ["1000-5000"],
    "filterList.avgAgmv90d": ["1w-5w"],
    contentSceneLabel: [noteCategory],
    inStar: 1,
    newHighQuality: 1,
    filterIntention: true,
    "flagList.isHighQuality": true,
    "flagList.hasBuyerCoopAuth": true,
    firstIndustry: "美妆",
    secondIndustry: "彩妆",
  }, "the formal request must contain every proven draft condition after one normalization path");
  assert.equal(Object.hasOwn(calls[0], "audienceGroup"), false, "the schema-marked unproven field must remain excluded from formal search");
  assert.equal(Object.hasOwn(calls[0], "brands"), false, "brand selection is a local gate, not a search filter field");
});

test("successful request keys deduplicate, failed keys can retry, and nickname history waits for success", async () => {
  let mode = "success";
  let calls = 0;
  const history = [];
  const coordinator = createCoordinator({
    searchFirstPage() {
      calls += 1;
      return Promise.resolve(mode === "success" ? successResult() : { ok: false, error: { code: "risk-control", message: "fixture" } });
    },
  }, { onHistory(keyword) { history.push(keyword); } });
  coordinator.editDraft({ searchType: 0, keyword: "昵称A" });
  await coordinator.applyAndSearch();
  await coordinator.applyAndSearch();
  assert.equal(calls, 1, "the same successful request key must not search again");
  assert.deepEqual(history, ["昵称A"], "successful nickname search is written once");

  coordinator.editDraft({ keyword: "昵称B" });
  mode = "error";
  await coordinator.applyAndSearch();
  await coordinator.applyAndSearch();
  assert.equal(calls, 3, "the same failed request key must remain retryable");
  assert.deepEqual(history, ["昵称A"], "failed nickname searches must not enter success history");
});

test("restored filters do not auto-search and empty keyword plus a real filter can be applied", async () => {
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { calls.push(JSON.parse(JSON.stringify(filterState))); return Promise.resolve(successResult()); },
  });
  coordinator.restore({ searchType: 1, keyword: "restored", gender: "女" });
  assert.equal(calls.length, 0, "restoring persisted draft must not search");
  assert.equal(coordinator.getState().appliedFilter, null, "restored state is draft-only");
  coordinator.editDraft({ keyword: "", gender: "男" });
  await coordinator.applyAndSearch();
  assert.equal(calls.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0], "keyword"), false, "empty keyword must be omitted from the formal request");
  assert.equal(calls[0].gender, "男");
});

test("the mounted page restores persisted draft without querying or creating an applied snapshot", () => {
  const calls = [];
  const harness = searchPageHarness((filterState) => {
    calls.push(filterState);
    return Promise.resolve(successResult());
  }, {
    savedFilters: {
      searchType: 0,
      keyword: "重启草稿",
      filter: { searchType: 0, keyword: "重启草稿", gender: "女", contentTag: ["美妆"] },
      selectedColumns: ["kolInfo", "recentNotes", "actions", "nickname"],
    },
  });
  harness.renderer.render();
  const tree = harness.renderer.render();
  const keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  assert.equal(calls.length, 0, "mounting a restored page must not call searchFirstPage");
  assert.equal(keywordInput.props.value, "重启草稿", "persisted keyword must restore into visible draft");
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "已恢复筛选，请点击确定后查询").length > 0);
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "请点击确定筛选后查询").length > 0, "restored draft must remain unapplied");
});

test("batch start requires a clean applied snapshot and never consumes dirty draft", async () => {
  const searchCalls = [];
  const batchCalls = [];
  const bridge = {
    searchFirstPage(filterState) { searchCalls.push(JSON.parse(JSON.stringify(filterState))); return Promise.resolve(successResult()); },
    batchStart(payload) { batchCalls.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve({ ok: true, data: { taskId: "fixture-task" } }); },
  };
  const coordinator = createCoordinator(bridge);
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 0, "batch must be blocked before any applied query exists");

  coordinator.editDraft({ keyword: "", gender: "女", contentTag: ["美妆"] });
  await coordinator.applyAndSearch();
  assert.equal(searchCalls.length, 1);
  coordinator.editDraft({ gender: "男" });
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 0, "batch must be blocked while draft differs from applied");

  coordinator.editDraft({ gender: "女" });
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 1);
  assert.deepEqual(batchCalls[0].filterState, searchCalls[0], "batch must use the frozen applied request snapshot");
  assert.deepEqual(batchCalls[0].columns, ["nickname"]);
});

test("late responses cannot overwrite a newer applied request", async () => {
  const first = deferred();
  const second = deferred();
  const queue = [first, second];
  const coordinator = createCoordinator({ searchFirstPage() { return queue.shift().promise; } });
  coordinator.editDraft({ keyword: "first" });
  const firstRequest = coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "second" });
  const secondRequest = coordinator.applyAndSearch();
  second.resolve({ ok: true, data: { kols: [{ userId: "second-result" }] } });
  await secondRequest;
  first.resolve({ ok: true, data: { kols: [{ userId: "stale-result" }] } });
  await firstRequest;
  const state = coordinator.getState();
  assert.equal(state.appliedFilter.keyword, "second");
  assert.equal(state.result.kols[0].userId, "second-result");
});

test("A-B-A reuses A by key and only the latest explicit intent may apply", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) {
      calls.push(filterState.keyword);
      return filterState.keyword === "A" ? first.promise : second.promise;
    },
  });
  coordinator.editDraft({ keyword: "A" });
  const requestA = coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "B" });
  const requestB = coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "A" });
  const reusedA = coordinator.applyAndSearch();

  assert.strictEqual(reusedA, requestA, "A must reuse its still-running keyed Promise after B starts");
  assert.deepEqual(calls, ["A", "B"], "A-B-A must issue only two remote searches");
  second.resolve({ ok: true, data: { kols: [{ userId: "B-result" }] } });
  assert.equal((await requestB).stale, true, "B is stale after the user's final explicit A submit");
  assert.equal(coordinator.getState().appliedFilter, null, "stale B must not become applied while A is pending");
  first.resolve({ ok: true, data: { kols: [{ userId: "A-result" }] } });
  await requestA;
  assert.equal(coordinator.getState().appliedFilter.keyword, "A");
  assert.equal(coordinator.getState().result.kols[0].userId, "A-result");
});

test("reusing pending A after B already failed clears the obsolete B error", async () => {
  const pendingA = deferred();
  const pendingB = deferred();
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { return filterState.keyword === "A" ? pendingA.promise : pendingB.promise; },
  });
  coordinator.editDraft({ keyword: "A" });
  const requestA = coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "B" });
  const requestB = coordinator.applyAndSearch();
  pendingB.resolve({ ok: false, error: { code: "risk-control", message: "B failed" } });
  await requestB;
  assert.equal(coordinator.getState().status, "error");
  assert.equal(coordinator.getState().error.code, "risk-control");

  coordinator.editDraft({ keyword: "A" });
  const reusedA = coordinator.applyAndSearch();
  assert.strictEqual(reusedA, requestA);
  assert.equal(coordinator.getState().status, "loading", "latest explicit A intent must be visibly pending");
  assert.equal(coordinator.getState().error, null, "obsolete B error must be cleared immediately");
  pendingA.resolve({ ok: true, data: { kols: [{ userId: "A-result" }] } });
  await reusedA;
  assert.equal(coordinator.getState().appliedFilter.keyword, "A");
});

test("successful A re-confirmed during pending B invalidates B without another request", async () => {
  const pendingB = deferred();
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) {
      calls.push(filterState.keyword);
      if (filterState.keyword === "A") return Promise.resolve({ ok: true, data: { kols: [{ userId: "A-result" }] } });
      return pendingB.promise;
    },
  });
  coordinator.editDraft({ keyword: "A" });
  await coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "B" });
  const requestB = coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "A" });
  const repeatA = await coordinator.applyAndSearch();

  assert.equal(repeatA.skipped, true);
  assert.deepEqual(calls, ["A", "B"], "successful A must deduplicate even while B is pending");
  pendingB.resolve({ ok: true, data: { kols: [{ userId: "late-B" }] } });
  assert.equal((await requestB).stale, true);
  const state = coordinator.getState();
  assert.equal(state.appliedFilter.keyword, "A");
  assert.equal(state.result.kols[0].userId, "A-result");
});

test("failed B preserves applied A and only the frozen A snapshot can start batch", async () => {
  const searchCalls = [];
  const batchCalls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) {
      searchCalls.push(JSON.parse(JSON.stringify(filterState)));
      return Promise.resolve(filterState.keyword === "A"
        ? { ok: true, data: { kols: [{ userId: "A-result" }] } }
        : { ok: false, error: { code: "risk-control", message: "fixture B failed" } });
    },
    batchStart(payload) { batchCalls.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve({ ok: true, data: { taskId: "fixture" } }); },
  });
  coordinator.editDraft({ keyword: "A", gender: "女" });
  await coordinator.applyAndSearch();
  coordinator.editDraft({ keyword: "B", gender: "男" });
  await coordinator.applyAndSearch();

  let state = coordinator.getState();
  assert.equal(state.status, "error");
  assert.equal(state.appliedFilter.keyword, "A", "failed B must not replace applied A");
  assert.equal(state.result.kols[0].userId, "A-result", "failed B must keep A results visible");
  assert.equal(state.isDirty, true);
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 0, "dirty failed B must block batch");

  coordinator.editDraft({ keyword: "A", gender: "女" });
  await coordinator.startBatch(["nickname"]);
  assert.equal(batchCalls.length, 1);
  assert.deepEqual(batchCalls[0].filterState, searchCalls[0], "batch must use the private frozen A request snapshot");
  assert.equal(searchCalls.length, 2, "returning draft to A for batch must not query again");
  state = coordinator.getState();
  assert.equal(state.appliedFilter.keyword, "A");
});

test("top search, Enter, and the global confirm are wired to one guarded apply action", async () => {
  const pending = deferred();
  let searches = 0;
  const bridge = {
    getSchemaFields() { return Promise.resolve({ ok: true, data: [] }); },
    getConfig() { return Promise.resolve({ ok: true, data: { nodes: [], options: [] } }); },
    getColumns() { return Promise.resolve({ ok: true, data: [{ id: "nickname", responsePath: "nickname", defaultDisplay: true }] }); },
    previewPayload() { return Promise.resolve({ ok: true, data: {} }); },
    batchList() { return Promise.resolve({ ok: true, data: [] }); },
    onBatchEvent() { return () => {}; },
    searchFirstPage() { searches += 1; return pending.promise; },
  };
  const runtime = pageRuntime({
    document: {
      documentElement: { classList: { add() {}, remove() {} } },
      createTreeWalker() { return { nextNode() { return null; } }; },
      body: {},
    },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      bridge: { pgyKol: bridge },
      localStorage: { getItem(key) { return key === "magiorix-pgy-kol-enabled" ? "1" : null; }, setItem() {}, removeItem() {} },
      setTimeout() { return 1; },
      clearTimeout() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const renderer = statefulRenderer(runtime, runtime.PgyKolSearchPage, {}, { scrollIntoView() {} });
  let tree = renderer.render();
  await new Promise(setImmediate);
  tree = renderer.render();
  const globalConfirm = findVnodes(tree, (node) => node.props && node.props.children === "确定筛选")[0];
  const topSearch = findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0];
  const keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  const batchStart = findVnodes(tree, (node) => node.props && node.props.children === "开始采集")[0];
  assert.ok(globalConfirm && topSearch && keywordInput && batchStart, "all three formal-query entrances and batch start must render");
  batchStart.props.onClick();
  tree = renderer.render();
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "请先确定筛选并查询").length > 0, "dirty batch attempt must show its blocking error");
  globalConfirm.props.onClick();
  topSearch.props.onClick();
  keywordInput.props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.equal(searches, 1, "three rapid entrances must still produce one bridge request");
  pending.resolve(successResult());
  await new Promise(setImmediate);
  tree = renderer.render();
  assert.equal(findVnodes(tree, (node) => node.props && node.props.children === "请先确定筛选并查询").length, 0, "successful explicit query must clear the stale batch-blocking error");
  const draftCheck = findVnodes(tree, (node) => node.type === runtime.PgyKolCheck && node.props && typeof node.props.onToggle === "function")[0];
  assert.ok(draftCheck, "a visible filter editor must remain available after results load");
  draftCheck.props.onToggle();
  tree = renderer.render();
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "筛选条件已修改，当前结果仍基于上一次确定的条件。").length > 0, "dirty draft must visibly mark retained results as stale");
});

test("top search, Enter, and bottom confirm independently submit byte-equivalent complete page drafts", async () => {
  const payloads = [];
  for (const entrance of ["top", "enter", "bottom"]) {
    const calls = [];
    const harness = searchPageHarness((filterState) => {
      calls.push(JSON.parse(JSON.stringify(filterState)));
      return Promise.resolve(successResult());
    });
    const tree = editRepresentativePageDraft(harness.runtime, harness.renderer);
    const topSearch = findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0];
    const bottomConfirm = findVnodes(tree, (node) => node.props && node.props.children === "确定筛选")[0];
    const keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
    assert.ok(topSearch && bottomConfirm && keywordInput);
    if (entrance === "top") topSearch.props.onClick();
    if (entrance === "enter") keywordInput.props.onKeyDown({ key: "Enter", preventDefault() {} });
    if (entrance === "bottom") bottomConfirm.props.onClick();
    await new Promise(setImmediate);
    assert.equal(calls.length, 1, entrance + " must make one formal request");
    payloads.push(calls[0]);
  }
  const expected = { searchType: 1, keyword: "页面完整条件", marketTarget: "种草", gender: "女", excludeLowActive: true };
  assert.deepEqual(payloads[0], expected, "top search must include the keyword and every edited page filter");
  assert.deepEqual(payloads[1], payloads[0], "Enter must use the exact same normalized payload as top search");
  assert.deepEqual(payloads[2], payloads[0], "bottom confirm must use the exact same normalized payload as top search");
});

test("career and feature popover confirms preserve each other's featureTags in both orders", async () => {
  for (const order of [
    [{ trigger: "职业身份", title: "职业身份", key: "医生:医生" }, { trigger: "特色背景", title: "特色背景", key: "留学背景:留学背景" }],
    [{ trigger: "特色背景", title: "特色背景", key: "留学背景:留学背景" }, { trigger: "职业身份", title: "职业身份", key: "医生:医生" }],
  ]) {
    const calls = [];
    const harness = searchPageHarness((filterState) => {
      calls.push(JSON.parse(JSON.stringify(filterState)));
      return Promise.resolve(successResult());
    });
    for (const selection of order) {
      let tree = harness.renderer.render();
      const trigger = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === selection.trigger)[0];
    assert.ok(trigger, selection.trigger + " trigger must render");
    trigger.props.onOpen({ currentTarget: {} });
    tree = harness.renderer.render();
    const popover = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTreePop && node.props && node.props.title === selection.title)[0];
    assert.ok(popover, selection.title + " popover must render");
    popover.props.onApply([selection.key]);
    popover.props.onClose();
    }
    const tree = harness.renderer.render();
    findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0].props.onClick();
    await new Promise(setImmediate);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].featureTags, ["医生", "留学背景"], "each popover must replace only its own option group");
  }
});

test("one-click exclude cannot submit brand-gated exclusions without a cooperation brand", async () => {
  const calls = [];
  const harness = searchPageHarness((filterState) => {
    calls.push(JSON.parse(JSON.stringify(filterState)));
    return Promise.resolve(successResult());
  });
  let tree = harness.renderer.render();
  const oneClick = findVnodes(tree, (node) => node.props && node.props.children === "一键剔除" && typeof node.props.onClick === "function")[0];
  assert.ok(oneClick, "one-click exclude must render");
  oneClick.props.onClick();
  tree = harness.renderer.render();
  findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0].props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].excludeLowActive, true);
  assert.equal(calls[0].fansNumUp, 1);
  assert.equal(Object.hasOwn(calls[0], "excludedTradeReportBrand"), false, "brand-gated cooperation exclusion must stay absent");
  assert.equal(Object.hasOwn(calls[0], "excludedTradeInviteReportBrand"), false, "brand-gated invitation exclusion must stay absent");
});

test("the real page can submit changed B while A is loading and leaves race control to the coordinator", async () => {
  const pendingA = deferred();
  const pendingB = deferred();
  const calls = [];
  const harness = searchPageHarness((filterState) => {
    calls.push(JSON.parse(JSON.stringify(filterState)));
    return filterState.keyword === "A" ? pendingA.promise : pendingB.promise;
  });
  let tree = harness.renderer.render();
  let keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  keywordInput.props.onChange({ target: { value: "A" } });
  tree = harness.renderer.render();
  findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0].props.onClick();

  tree = harness.renderer.render();
  keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  keywordInput.props.onChange({ target: { value: "B" } });
  tree = harness.renderer.render();
  const bottomDuringLoading = findVnodes(tree, (node) => node.props && node.props.sx && node.props.sx.minWidth === 112 && typeof node.props.onClick === "function")[0];
  assert.ok(bottomDuringLoading, "bottom submit must remain mounted while A is loading");
  assert.notEqual(bottomDuringLoading.props.disabled, true, "a changed B must remain explicitly submittable during A");
  bottomDuringLoading.props.onClick();
  assert.deepEqual(calls.map((call) => call.keyword), ["A", "B"], "the page must forward changed B instead of blocking it at loading state");

  pendingB.resolve({ ok: true, data: { kols: [{ userId: "B-result" }] } });
  await new Promise(setImmediate);
  pendingA.resolve({ ok: true, data: { kols: [{ userId: "late-A" }] } });
  await new Promise(setImmediate);
  tree = harness.renderer.render();
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "当前筛选已确定").length > 0, "B must remain the applied page state after late A");
});

test("ten rendered filter edits and a real popover confirm remain draft-only", () => {
  let searches = 0;
  const bridge = {
    getSchemaFields() { return Promise.resolve({ ok: true, data: [] }); },
    getConfig() { return Promise.resolve({ ok: true, data: { nodes: [], options: [] } }); },
    getColumns() { return Promise.resolve({ ok: true, data: [] }); },
    previewPayload() { return Promise.resolve({ ok: true, data: {} }); },
    batchList() { return Promise.resolve({ ok: true, data: [] }); },
    onBatchEvent() { return () => {}; },
    searchFirstPage() { searches += 1; return Promise.resolve(successResult()); },
  };
  const runtime = pageRuntime({
    document: {
      documentElement: { classList: { add() {}, remove() {} } },
      createTreeWalker() { return { nextNode() { return null; } }; },
      body: {},
    },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      bridge: { pgyKol: bridge },
      localStorage: { getItem(key) { return key === "magiorix-pgy-kol-enabled" ? "1" : null; }, setItem() {}, removeItem() {} },
      setTimeout() { return 1; },
      clearTimeout() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const renderer = statefulRenderer(runtime, runtime.PgyKolSearchPage, {}, { scrollIntoView() {} });
  let tree = renderer.render();
  const keywordInput = findVnodes(tree, (node) => node.props && typeof node.props.placeholder === "string" && node.props.placeholder.indexOf("找博主") >= 0)[0];
  assert.ok(keywordInput);
  keywordInput.props.onChange({ target: { value: "只改草稿" } });
  const checks = findVnodes(tree, (node) => node.type === runtime.PgyKolCheck && node.props && typeof node.props.onToggle === "function");
  assert.ok(checks.length >= 10, "fixture page must expose ten independent visible checkbox filters");
  checks.slice(0, 10).forEach((node) => node.props.onToggle());
  assert.equal(searches, 0, "ten actual page filter handlers must not query");

  const familyTrigger = findVnodes(tree, (node) => node.type === runtime.PgyKolTrigger && node.props && node.props.label === "家庭身份")[0];
  assert.ok(familyTrigger);
  familyTrigger.props.onOpen({ currentTarget: { getBoundingClientRect() { return { left: 100, top: 100, right: 160, bottom: 128 }; } } });
  tree = renderer.render();
  const optionPopover = findVnodes(tree, (node) => node.type === runtime.PgyKolTreePop && node.props && node.props.title === "家庭身份")[0];
  assert.ok(optionPopover, "opening the trigger must render its real tree popover");
  const popRenderer = statefulRenderer(runtime, runtime.PgyKolTreePop, optionPopover.props, { scrollIntoView() {} });
  let popTree = popRenderer.render();
  const treeVnode = findVnodes(popTree, (node) => node.type === runtime.PgyKolTree)[0];
  assert.ok(treeVnode, "tree popover must render its tree");
  const treeTree = runtime.PgyKolTree(treeVnode.props);
  const groupNode = findVnodes([treeTree], (node) => node.type === runtime.PgyKolTreeNode && node.props && node.props.node && node.props.node.children && node.props.node.children.length)[0];
  assert.ok(groupNode, "family tree must render its official group nodes");
  const groupRenderer = statefulRenderer(runtime, runtime.PgyKolTreeNode, groupNode.props, { scrollIntoView() {} });
  let groupTree = groupRenderer.render();
  const expander = findVnodes(groupTree, (node) => typeof node.props.onClick === "function" && [].concat(node.props.children || []).some((child) => child && child.props && child.props.icon))[0];
  assert.ok(expander, "group node must render an expander");
  expander.props.onClick({ stopPropagation() {} });
  groupTree = groupRenderer.render();
  const leaf = findVnodes(groupTree, (node) => node.type === runtime.PgyKolTreeNode && node.props && node.props.node && !(node.props.node.children && node.props.node.children.length))[0];
  assert.ok(leaf, "expanded group must render official leaf nodes");
  assert.equal(leaf.props.node.label, "妈妈", "first official family leaf must be 妈妈");
  // 真实 apply（确认按钮同一闭包）只更新草稿，不触发搜索。
  optionPopover.props.onApply(["妈妈:妈妈"]);
  assert.equal(searches, 0, "the actual popover's internal confirm must only update draft");
});

test("official data-performance popover primitives match the live 228/408/420px structures", () => {
  const runtime = pageRuntime();
  assert.equal(typeof runtime.PgyKolOfficialRangePop, "function");
  assert.equal(typeof runtime.PgyKolOfficialGroupPop, "function");
  assert.equal(typeof runtime.PgyKolOfficialMultiPop, "function");
  assert.equal(typeof runtime.PgyKolOfficialBrandPop, "function");
  assert.equal(typeof runtime.PgyKolOfficialSimpleMenu, "function");

  const anchor = { getBoundingClientRect() { return { left: 100, right: 180, top: 100, bottom: 128 }; } };
  const range = runtime.PgyKolOfficialRangePop({
    open: true,
    anchor,
    options: runtime.pgyKolRangeDefs.imp50w,
    value: null,
    minPlaceholder: "0",
    maxPlaceholder: "9,999,999",
    onApply() {},
    onClose() {},
  });
  assert.equal(range.type, runtime.PgyKolPop);
  assert.equal(range.props.width, 228);
  assert.equal(range.props.preferredHeight, 292, "official range height must include options, custom bounds and footer so viewport placement does not clip it");
  const customNode = findVnodes(range, (node) => node.type === runtime.PgyKolOfficialCustomRange)[0];
  const custom = runtime.PgyKolOfficialCustomRange(customNode.props);
  assert.deepEqual(
    findVnodes(custom, (node) => node.props && typeof node.props.placeholder === "string").map((node) => node.props.placeholder),
    ["0", "9,999,999"],
  );
  for (const input of findVnodes(custom, (node) => node.props && typeof node.props.placeholder === "string")) {
    assert.equal(input.props.sx.flexShrink, 0, "official bound inputs must not shrink and truncate their placeholders");
    assert.equal(input.props.sx["& input"].fontSize, 12);
  }
  const listNode = findVnodes(range, (node) => node.type === runtime.PgyKolOfficialRangeList)[0];
  const list = runtime.PgyKolOfficialRangeList(listNode.props);
  const footerNode = findVnodes(range, (node) => node.type === runtime.PgyKolOfficialFooter)[0];
  const footer = runtime.PgyKolOfficialFooter(footerNode.props);
  for (const text of ["不限", "5万以上", "1万～5万", "重置", "确定"]) {
    assert.ok(findVnodes([list, footer], (node) => node.props && node.props.children === text).length > 0, "range popover must render " + text);
  }
  assert.equal(findVnodes(range, (node) => node.type === runtime.PgyKolPopHeader).length, 0, "official compact popovers have no invented title bar");

  const groups = runtime.PgyKolOfficialGroupPop({
    open: true,
    anchor,
    groups: [
      { key: "pic", label: "图文笔记", options: runtime.pgyKolRangeDefs.quote, value: null },
      { key: "video", label: "视频笔记", options: runtime.pgyKolRangeDefs.quote, value: null },
    ],
    onApply() {},
    onClose() {},
  });
  assert.equal(groups.type, runtime.PgyKolPop);
  assert.equal(groups.props.width, 408);
  assert.equal(findVnodes(groups, (node) => node.props && node.props.placeholder === "请选择").length, 2);
  assert.ok(findVnodes(groups, (node) => node.props && node.props.children === "图文笔记").length > 0);
  assert.ok(findVnodes(groups, (node) => node.props && node.props.children === "视频笔记").length > 0);

  const upwardNested = runtime.PgyKolOfficialNestedRange({ openUp: true, options: runtime.pgyKolRangeDefs.quote, value: null, onSelect() {} });
  assert.equal(upwardNested.props.sx.top, "auto");
  assert.equal(upwardNested.props.sx.bottom, 64, "nested range menu must flip above its select near the viewport bottom");

  const multi = runtime.PgyKolOfficialMultiPop({
    open: true,
    anchor,
    options: runtime.pgyKolRangeDefs.liveGmv,
    selectedKeys: [],
    onApply() {},
    onClose() {},
  });
  assert.equal(multi.type, runtime.PgyKolPop);
  assert.equal(multi.props.width, 228);
  assert.equal(findVnodes(multi, (node) => node.type === runtime.PgyKolCheck).length, 8, "live GMV must keep all eight official checkbox options");

  const brand = runtime.PgyKolOfficialBrandPop({ open: true, anchor, current: [], excluded: false, onApply() {}, onClose() {} });
  assert.equal(brand.type, runtime.PgyKolPop);
  assert.equal(brand.props.width, 420);
  assert.ok(findVnodes(brand, (node) => node.props && node.props.children === "请至少选择3个品牌").length > 0);
  assert.ok(findVnodes(brand, (node) => node.props && node.props.placeholder === "请输入品牌名称").length > 0);
  assert.ok(findVnodes(brand, (node) => node.type === runtime.PgyKolCheck && node.props.label === "剔除上述品牌已合作博主").length > 0);
});

test("all eighteen live data-performance entries use their official popover family without searching", () => {
  let searches = 0;
  const harness = searchPageHarness(() => { searches += 1; return Promise.resolve(successResult()); });
  const families = {
    PgyKolOfficialRangePop: ["曝光中位数", "阅读中位数", "互动中位数", "千赞笔记比例", "合作订单数", "外溢进店单价"],
    PgyKolOfficialSimpleMenu: ["笔记类型", "近期合作行业"],
    PgyKolOfficialGroupPop: ["合作报价", "合作信用度", "传播规模", "预估CPM", "预估阅读单价", "预估互动单价"],
    PgyKolOfficialBrandPop: ["近期合作品牌"],
    PgyKolOfficialMultiPop: ["近30天直播场次", "场均观播人数", "场均销售额"],
  };
  for (const [family, labels] of Object.entries(families)) {
    for (const label of labels) {
      let tree = harness.renderer.render();
      const trigger = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === label)[0];
      assert.ok(trigger, label + " trigger must render");
      trigger.props.onOpen({ currentTarget: { getBoundingClientRect() { return { left: 100, right: 180, top: 100, bottom: 128 }; } } });
      tree = harness.renderer.render();
      assert.ok(findVnodes(tree, (node) => node.type === harness.runtime[family]).length > 0, label + " must use " + family);
      const opened = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === label)[0];
      assert.equal(opened.props.arrowUp, true, label + " must show the official upward arrow while open");
      const popover = findVnodes(tree, (node) => node.type === harness.runtime[family])[0];
      popover.props.onClose();
    }
  }
  const tree = harness.renderer.render();
  assert.equal(findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === "合作表现").length, 0, "合作表现 is a grey subgroup label, not an invented filter trigger");
  assert.equal(searches, 0, "opening and closing every official data-performance popover must remain draft-only");
});

test("official note type, cooperation-order range, and recent industry serialize with the live payload shapes", async () => {
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { calls.push(JSON.parse(JSON.stringify(filterState))); return Promise.resolve(successResult()); },
  });
  coordinator.editDraft({
    noteType: 1,
    progressOrderCnt: { label: "0～12", value: [0, 12] },
    tradeType: "母婴",
    coopImpMedin: { label: "1万～5万", value: [10000, 50000] },
  });
  await coordinator.applyAndSearch();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].noteType, 1);
  assert.deepEqual(calls[0].progressOrderCnt, [0, 12]);
  assert.equal(calls[0].tradeType, "母婴");
  assert.deepEqual(calls[0].accumCoopImpMedinNum30d, [10000, 50000]);
});

test("official data-performance internal confirmations update only page draft", () => {
  let searches = 0;
  const harness = searchPageHarness(() => { searches += 1; return Promise.resolve(successResult()); });
  const anchor = { getBoundingClientRect() { return { left: 100, right: 180, top: 100, bottom: 128 }; } };
  function open(label, family) {
    let tree = harness.renderer.render();
    const trigger = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === label)[0];
    trigger.props.onOpen({ currentTarget: anchor });
    tree = harness.renderer.render();
    const popover = findVnodes(tree, (node) => node.type === harness.runtime[family])[0];
    assert.ok(popover, label + " popover must render");
    return popover;
  }
  let popover = open("曝光中位数", "PgyKolOfficialRangePop");
  popover.props.onApply({ label: "1万～5万", value: [10000, 50000] });
  popover.props.onClose();

  popover = open("笔记类型", "PgyKolOfficialSimpleMenu");
  popover.props.onSelect(1);
  popover.props.onClose();

  popover = open("传播规模", "PgyKolOfficialGroupPop");
  popover.props.onApply({ imp: { label: "1万～5万", value: [10000, 50000] }, read: null, inter: null, overflow: null });
  popover.props.onClose();

  popover = open("近期合作品牌", "PgyKolOfficialBrandPop");
  popover.props.onApply(["brand-a", "brand-b", "brand-c"], true);
  popover.props.onClose();

  popover = open("近30天直播场次", "PgyKolOfficialMultiPop");
  popover.props.onApply([harness.runtime.pgyKolNodeKey(harness.runtime.pgyKolRangeDefs.liveCount[1])]);
  popover.props.onClose();

  assert.equal(searches, 0, "every official internal confirm must remain draft-only");
});

test("wide route hides the complete 200px secondary navigation container and restores it on cleanup", () => {
  function element(name, parent) {
    const el = {
      name,
      parentElement: parent || null,
      children: [],
      style: {},
      attrs: {},
      contains(other) {
        for (let cur = other; cur; cur = cur.parentElement) if (cur === this) return true;
        return false;
      },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; },
    };
    if (parent) parent.children.push(el);
    return el;
  }
  const body = element("body");
  const secondary = element("secondary-200px", body);
  secondary.style.width = "200px";
  const innerMenu = element("inner-menu", secondary);
  const blogger = element("blogger-link", innerMenu);
  const note = element("note-link", innerMenu);
  const textNodes = [
    { nodeValue: "蒲公英博主采集", parentElement: blogger },
    { nodeValue: "蒲公英笔记采集", parentElement: note },
  ];
  let textIndex = 0;
  const classes = new Set();
  const document = {
    body,
    documentElement: { classList: { add(v) { classes.add(v); }, remove(v) { classes.delete(v); } } },
    createTreeWalker() { return { nextNode() { return textNodes[textIndex++] || null; } }; },
  };
  const effects = [];
  const runtime = pageRuntime({
    document,
    NodeFilter: { SHOW_TEXT: 4 },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      bridge: null,
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      setTimeout(fn) { textIndex = 0; fn(); return 1; },
      clearTimeout() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  runtime.m = {
    useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; },
    useEffect(fn) { effects.push(fn); },
    useCallback(fn) { return fn; },
    useRef(initial) { return { current: initial }; },
  };
  runtime.PgyKolSearchPage();
  assert.ok(effects.length > 0);
  const cleanup = effects[0]();
  assert.equal(secondary.style.display, "none", "the width-owning secondary container, not its inner menu, must collapse");
  assert.equal(innerMenu.style.display || "", "", "the inner menu is not the layout-width owner");
  assert.equal(secondary.attrs["data-magiorix-pgy-kol-secondary-nav"], "hidden");
  cleanup();
  assert.equal(secondary.style.display, "", "leaving the route must restore the secondary container");
  assert.equal(classes.has("magiorix-pgy-kol-wide"), false);
});

test("region popover constrains itself to 1280x631 and keeps a fixed footer over a scrollable middle", () => {
  const runtime = pageRuntime({
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    },
  });
  const anchor = { getBoundingClientRect() { return { left: 320, right: 400, top: 357, bottom: 385, width: 80, height: 28 }; } };
  const cascade = runtime.PgyKolCascadePop({
    open: true,
    anchor,
    title: "地域",
    cfg: { nodes: [{ label: "中国", children: [{ label: "上海", value: "310000", children: [{ label: "上海市", children: [{ label: "黄浦区" }] }] }] }] },
    onSelect() {},
    onClear() {},
    onClose() {},
  });
  assert.equal(cascade.type, runtime.PgyKolPop);
  const popTree = runtime.PgyKolPop(cascade.props);
  const shell = Array.isArray(popTree.props.children) ? popTree.props.children[1] : null;
  assert.ok(shell && shell.props && shell.props.sx, "popover shell must render");
  const sx = shell.props.sx;
  if (sx.bottom === "auto") {
    assert.ok(Number(sx.top) + Number(sx.maxHeight) <= 631, "below placement max-height must fit the viewport");
  } else {
    assert.ok(Number(sx.bottom) >= 8, "above placement must retain the viewport margin");
  }
  const scrollBodies = findVnodes(cascade, (node) => node.props && node.props.sx && node.props.sx.overflowY === "auto");
  assert.ok(scrollBodies.length >= 1, "the middle region list must own vertical scrolling");
  const footers = findVnodes(cascade, (node) => {
    const children = node.props && node.props.children;
    if (!Array.isArray(children)) return false;
    const labels = findVnodes(children, (child) => child.props && (child.props.children === "清空" || child.props.children === "确定"));
    return labels.length === 2;
  });
  assert.ok(footers.some((node) => node.props.sx && (node.props.sx.flexShrink === 0 || node.props.sx.position === "sticky")), "region 清空/确定 footer must not scroll out of view");
});

test("the first three table headers and cells are truly sticky with cumulative left offsets", () => {
  const runtime = pageRuntime();
  const columns = ["kolInfo", "recentNotes", "actions", "fans"];
  const tree = runtime.PgyKolResultTable({
    result: { kols: [{ userId: "fixture", nickname: "Fixture", recentNotes: [] }] },
    list: [{ id: "fans", label: "粉丝", responsePath: "fans", formatter: "number" }],
    columns,
  });
  const headers = findVnodes(tree, (node) => node.props && node.props.component === "th");
  const cells = findVnodes(tree, (node) => node.props && node.props.component === "td");
  assert.ok(headers.length >= 4 && cells.length >= 4);
  for (const group of [headers.slice(0, 3), cells.slice(0, 3)]) {
    group.forEach((node) => {
      assert.equal(node.props.sx.position, "sticky");
      assert.equal(typeof node.props.sx.left, "number");
      assert.ok(node.props.sx.zIndex >= 2);
      assert.ok(node.props.sx.bgcolor, "sticky cells need an opaque background");
    });
    assert.ok(group[0].props.sx.left < group[1].props.sx.left && group[1].props.sx.left < group[2].props.sx.left, "left offsets must be cumulative and strictly increasing");
  }
  assert.notEqual(headers[3].props.sx.position, "sticky", "metric columns must continue to scroll horizontally");
  assert.notEqual(cells[3].props.sx.position, "sticky", "metric cells must continue to scroll horizontally");
});

test("a paused history task loads, scrolls its detail into view, and exposes continue/cancel/export", async () => {
  const paused = {
    taskId: "fixture-paused-task",
    status: "paused",
    completeness: "cannot-prove",
    counts: { raw: 12, unique: 10, dup: 2, missingUid: 0 },
    leaves: [],
  };
  let batchGetCalls = 0;
  let scrollCalls = 0;
  const detailElement = { scrollIntoView(options) { scrollCalls += 1; assert.equal(options.block, "start"); } };
  const bridge = {
    getSchemaFields() { return Promise.resolve({ ok: true, data: [] }); },
    getConfig() { return Promise.resolve({ ok: true, data: { nodes: [], options: [] } }); },
    getColumns() { return Promise.resolve({ ok: true, data: [{ id: "nickname", responsePath: "nickname", defaultDisplay: true }] }); },
    previewPayload() { return Promise.resolve({ ok: true, data: {} }); },
    batchList() { return Promise.resolve({ ok: true, data: [paused] }); },
    batchGet(payload) { batchGetCalls += 1; assert.equal(payload.taskId, paused.taskId); return Promise.resolve({ ok: true, data: paused }); },
    onBatchEvent() { return () => {}; },
  };
  const runtime = pageRuntime({
    document: {
      documentElement: { classList: { add() {}, remove() {} } },
      querySelector() { return detailElement; },
      createTreeWalker() { return { nextNode() { return null; } }; },
      body: {},
    },
    window: {
      innerWidth: 1280,
      innerHeight: 631,
      bridge: { pgyKol: bridge },
      localStorage: { getItem(key) { return key === "magiorix-pgy-kol-enabled" ? "1" : null; }, setItem() {}, removeItem() {} },
      setTimeout() { return 1; },
      clearTimeout() {},
      requestAnimationFrame(fn) { fn(); return 1; },
      cancelAnimationFrame() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const rootRenderer = statefulRenderer(runtime, runtime.PgyKolSearchPage, {}, detailElement);
  rootRenderer.render();
  await new Promise(setImmediate);
  let tree = rootRenderer.render();
  const history = findVnodes(tree, (node) => node.type === runtime.PgyKolTaskHistory)[0];
  assert.ok(history, "task history must render after batchList resolves");
  assert.equal(history.props.tasks.some((task) => task.taskId === paused.taskId), true);
  history.props.onSelect(paused.taskId);
  await new Promise(setImmediate);
  tree = rootRenderer.render();
  assert.equal(batchGetCalls, 1, "selecting a paused history row must load its details once");
  const panel = findVnodes(tree, (node) => node.type === runtime.PgyKolBatchPanel)[0];
  assert.ok(panel && panel.props.task && panel.props.task.status === "paused", "paused task detail must be selected");
  assert.ok(scrollCalls >= 1, "selected paused detail must scroll into the viewport");

  const panelRenderer = statefulRenderer(runtime, runtime.PgyKolBatchPanel, panel.props, detailElement);
  const panelTree = panelRenderer.render();
  const actionLabels = findVnodes(panelTree, (node) => node.props && ["继续", "取消", "导出"].includes(node.props.children)).map((node) => node.props.children);
  assert.deepEqual(new Set(actionLabels), new Set(["继续", "取消", "导出"]));
});

test("page source file is injection-safe", () => {
  // bundle 内容守卫要求注入块以 pgyKolDevEnabled 开头（锚点）。
  assert.ok(pageSource.startsWith("function pgyKolDevEnabled"), "page source must start with pgyKolDevEnabled");
  // 注入为普通脚本：禁止反引号、模板插值、import/export。
  assert.ok(!pageSource.includes("`"), "page source must not contain backticks");
  assert.ok(!pageSource.includes("${"), "page source must not contain template interpolation");
  assert.ok(!pageSource.includes("\nimport ") && !pageSource.includes("\nexport "), "page source must stay a plain script");
  // 补丁脚本通过 readFileSync 读取页面源码。
  assert.ok(script.includes('const pgyKolSearchPageSource = fs.readFileSync('), "patch script must read the page source file");
  assert.ok(script.includes('"scripts", "pgy-kol-phase52-page-source.js"'), "patch script must reference the phase52 page source file");
});

test("Phase 5.2 Electron acceptance uses geometric visibility and truthful screenshot metadata", () => {
  assert.doesNotThrow(() => new Function(acceptanceDriver), "acceptance driver must parse as JavaScript");
  const visibilitySource = acceptanceDriver.slice(acceptanceDriver.indexOf("async function visibleKeys"), acceptanceDriver.indexOf("async function matrixHorizontalScrollEvidence"));
  assert.doesNotMatch(visibilitySource, /bodyText\(/, "visibility must not be inferred from document.body.innerText");
  for (const needle of ["getBoundingClientRect", "getComputedStyle", "elementFromPoint", "viewportIntersects", "unobscured >= 3", "visible geometry check failed"]) {
    assert.ok(visibilitySource.includes(needle), "geometric visibility check must include: " + needle);
  }
  assert.ok(acceptanceDriver.includes("matrix horizontal scroll invariant failed"), "driver must reject horizontal scrolling inside filter sections");
  assert.ok(acceptanceDriver.includes("popover anchor invariant failed"), "driver must reject detached small popovers");
  for (const needle of ["window.devicePixelRatio", "readUInt32BE(16)", "readUInt32BE(20)", "screenshot viewport/DPR mismatch", "duplicate screenshot hash across scenes", "keyNodeRects", "magiorix-ops-assistant", "[data-close]", "placeholder geometry check failed", "dialog:官网展示指标（41）", "empty-result scenario did not reach a real empty state", "shot-columns-extension", "Magiorix 扩展字段", "inspect-batch-readonly", "fallbackDeterministicTests", "shot-batch-existing-paused", "no existing paused task", "只改变当前页面详情选择"]) {
    assert.ok(acceptanceDriver.includes(needle), "acceptance evidence must retain: " + needle);
  }
});

test("page source top-level identifiers are unique and module-strict parseable", async () => {
  // 注入块位于 ES module bundle 内：顶层 function/var 重复声明会直接
  // SyntaxError 使整个 bundle 无法加载（2026-08-09 真实复现：pgyKolFeaturedLabel
  // 被抽取两次导致应用白屏）。此处按顶层声明做唯一性校验。
  const topLevel = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const names = new Map();
  const fnRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const varRe = /^var\s+([A-Za-z_$][\w$]*)\s*=/gm;
  for (const re of [fnRe, varRe]) {
    let m;
    while ((m = re.exec(topLevel)) !== null) {
      names.set(m[1], (names.get(m[1]) || 0) + 1);
    }
  }
  const dupes = [...names.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(dupes, [], "top-level identifiers must be declared exactly once");
  // 模块作用域（strict）下页面源码必须可解析：顶层仅声明、无副作用，
  // 动态 import 一个临时 .mjs 副本即可验证（SyntaxError 会在此抛出）。
  const os = require("node:os");
  const fsp = require("node:fs/promises");
  const tmp = path.join(os.tmpdir(), "pgy52-esm-check-" + process.pid + "-" + Date.now() + ".mjs");
  await fsp.writeFile(tmp, pageSource + "\n", "utf8");
  try {
    await import("file:///" + tmp.replace(/\\/g, "/"));
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
});

test("Phase 5.2 page source carries the required copy", () => {
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
    "收起筛选",
    "展开筛选",
    "搜索历史",
    "清空历史",
    "magiorix-pgy-kol-nick-history",
    "自定义列",
    "官网展示指标",
    "官网当前未返回",
    "增加预算并继续",
    "增加页数并继续",
    "采集未完整/需要处理",
    "功能未开启",
    "magiorix-pgy-kol-columns",
    "magiorix-pgy-kol-filters",
    "已恢复筛选，请点击确定后查询",
    "确定筛选",
    "筛选条件已修改，当前结果仍基于上一次确定的条件。",
    "这是待确认条件的本地 Payload 预览，不会请求蒲公英接口。",
    "请选择您的合作品牌",
    "合作品牌智能推荐",
    "按博主粉丝推荐",
    "未选择合作品牌时不可用",
    "博主类目",
    "博主人设",
    "家庭身份",
    "职业身份",
    "特色背景",
    "博主画像",
    "性别",
    "地域",
    "二十大人群",
    "行业特色画像",
    "预估消费行为",
    "签约情况",
    "擅长内容",
    "内容题材",
    "粉丝画像",
    "粉丝量",
    "粉丝年龄",
    "粉丝性别",
    "粉丝地域",
    "婚恋状态",
    "消费水平",
    "母婴阶段",
    "手机价格",
    "手机品牌",
    "笔记类目",
    "日常笔记",
    "曝光中位数",
    "阅读中位数",
    "互动中位数",
    "千赞笔记比例",
    "笔记类型",
    "合作笔记",
    "合作表现",
    "合作报价",
    "合作信用度",
    "合作订单数",
    "近期合作行业",
    "近期合作品牌",
    "传播规模",
    "预估CPM",
    "预估阅读单价",
    "预估互动单价",
    "外溢进店单价",
    "直播数据",
    "近30天直播场次",
    "场均观播人数",
    "场均销售额",
    "精选博主",
    "优质博主",
    "新锐博主",
    "笔记+直播均可合作",
    "意向行业匹配",
    "行业推荐博主",
    "热门活动",
    "种收联动",
    "一键剔除",
    "剔除低活博主",
    "剔除掉粉博主",
    "剔除已合作博主",
    "剔除已邀约博主",
    "待实证",
    "人群目标（按博主粉丝推荐）依赖合作品牌：当前账号未绑定品牌，官网禁用该筛选；无法实证前不参与查询与采集。",
    "选择展示指标",
    "开始采集",
    "任务历史",
    "Payload 预览",
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
  assert.ok(pageSource.includes("update({ searchType: 1 })"), "搜笔记 mode must set searchType 1");
  assert.ok(pageSource.includes("update({ searchType: 0 })"), "搜昵称 mode must set searchType 0");
  // 关键词字段与两处精确 placeholder。
  assert.ok(pageSource.includes("value: filter.keyword"));
  assert.ok(pageSource.includes("update({ keyword: e.target.value })"));
  assert.ok(
    pageSource.includes('placeholder: filter.searchType === 1 ? "按笔记关键词找博主，试试搜" : "按博主昵称/小红书号找博主"'),
    "placeholder must switch by searchType",
  );
  // 正式查询前 trim；空关键词允许筛选查询，但必须从请求中省略。
  const runtime = pageRuntime();
  const normalized = runtime.pgyKolNormalizeFilter({ searchType: 0, keyword: "  nickname  " });
  assert.equal(normalized.keyword, "nickname");
  const withKeyword = JSON.parse(JSON.stringify(runtime.pgyKolToFilterState(normalized)));
  assert.deepEqual(withKeyword, { searchType: 0, keyword: "nickname" });
  const withoutKeyword = JSON.parse(JSON.stringify(runtime.pgyKolToFilterState(runtime.pgyKolNormalizeFilter({ searchType: 1, keyword: "   ", gender: "女" }))));
  assert.deepEqual(withoutKeyword, { searchType: 1, gender: "女" });
});

test("five compact matrix sections exist", () => {
  for (const title of ["合作目标", "匹配度", "数据表现", "平台推荐", "常规剔除"]) {
    assert.ok(pageSource.includes('title: "' + title + '"'), "matrix section must exist: " + title);
  }
  assert.equal((pageSource.match(/PgyKolMatrixSection, \{/g) || []).length, 5, "exactly five matrix sections");
  // 紧凑触发器：高 28px、字号 14px、默认文字 rgba(0,0,0,.7)、选中浅红底。
  assert.ok(pageSource.includes("height: 28,"), "triggers must be 28px tall");
  assert.ok(pageSource.includes("fontSize: 14,"), "trigger font must be 14px");
  assert.ok(pageSource.includes('var textColor = dis || dim ? "rgba(0,0,0,.25)" : sel ? "#ff2442" : "rgba(0,0,0,.7)"'), "trigger colors must follow the official palette");
  assert.ok(pageSource.includes('bgcolor: sel ? "rgba(255,36,66,.08)" : "transparent"'), "selected triggers must use light red background");
  const triggerSource = pageSource.slice(pageSource.indexOf("function PgyKolTrigger"), pageSource.indexOf("function PgyKolPop"));
  assert.match(triggerSource, /border\s*:\s*0\b/, "ordinary filter triggers must be borderless text entries");
  assert.doesNotMatch(triggerSource, /borderColor|border\s*:\s*["']1px solid/, "ordinary filter triggers must not regress to bordered chips");
  // 找博主独占宽内容模式，避免重复二级导航将筛选矩阵挤回 825px。
  assert.ok(pageSource.includes('maxWidth: "none", margin: "0 auto"'), "pgy-kol route must use the wide content mode");
  assert.ok(pageSource.includes('bgcolor: "#f5f6f7"'), "page must use the light gray background");
  assert.ok(pageSource.includes('bgcolor: "#fff"'), "content area must be white");
  // 五个筛选分区必须自适应换行；不得再产生各自的 920px 横向滚动条。
  const matrixSource = pageSource.slice(pageSource.indexOf("function PgyKolMatrixSection"), pageSource.indexOf("function PgyKolMatrixRow"));
  assert.doesNotMatch(matrixSource, /overflowX\s*:\s*["']auto["']/i, "matrix section must not create a horizontal scroll container");
  assert.doesNotMatch(matrixSource, /minWidth\s*:\s*920\b/, "matrix section must not force 920px inner content");
  assert.match(matrixSource, /minWidth\s*:\s*0\b/, "matrix section must allow responsive content shrinking");
});

test("category expand/collapse keeps the common and full lists", () => {
  assert.ok(
    pageSource.includes('var pgyKolCategoryCommon=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场"]'),
    "common category list must exist",
  );
  assert.ok(
    pageSource.includes('var pgyKolCategoryFull=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场","情感","摄影","游戏","科技数码","出行旅游","音乐","搞笑","健康养生","汽车","婚嫁","商业财经","素材","其他"]'),
    "full category list must exist",
  );
  assert.ok(pageSource.includes('children: showAllCategory ? "收起" : "展开"'), "expand/collapse toggle must exist as plain text");
  assert.ok(pageSource.includes("catOptions = showAllCategory ? pgyKolCategoryFull : pgyKolCategoryCommon"), "default must be collapsed to the common list");
  assert.ok(pageSource.includes("showAllCategory"), "expand state must be tracked");
});

test("complex filters are trigger + popover, not flat chips", () => {
  // 博主画像行：全部为紧凑触发器。
  for (const label of ["性别", "地域", "二十大人群", "行业特色画像", "预估消费行为", "签约情况", "擅长内容", "内容题材"]) {
    assert.ok(pageSource.includes('label: "' + label + '"'), "trigger must exist: " + label);
  }
  // 粉丝画像行。
  for (const label of ["粉丝量", "粉丝年龄", "粉丝性别", "粉丝地域", "婚恋状态", "消费水平", "母婴阶段", "手机价格", "手机品牌"]) {
    assert.ok(pageSource.includes('label: "' + label + '"'), "trigger must exist: " + label);
  }
  // 日常/合作/直播数据行。
  for (const label of ["曝光中位数", "阅读中位数", "互动中位数", "千赞笔记比例", "合作报价", "合作信用度", "合作订单数", "近期合作行业", "近期合作品牌", "传播规模", "预估CPM", "预估阅读单价", "预估互动单价", "外溢进店单价", "近30天直播场次", "场均观播人数", "场均销售额"]) {
    assert.ok(pageSource.includes('label: "' + label + '"'), "trigger must exist: " + label);
  }
  // 弹层必须通过 Popover 呈现（PgyKolPop 固定定位、贴近触发器、点击外部关闭）。
  assert.ok(pageSource.includes("function PgyKolPop(p)"), "anchored popover shell must exist");
  assert.ok(pageSource.includes("position: \"fixed\""), "popover must be fixed-positioned");
  assert.ok(pageSource.includes("zIndex: 1399"), "popover must have an outside-click overlay");
  assert.match(pageSource, /getBoundingClientRect/, "popover must anchor to the trigger rect");
});

test("gender popover keeps official options", () => {
  assert.ok(pageSource.includes('title: "性别"'), "gender popover must exist");
  assert.ok(pageSource.includes("options: pgyKolGenderOptions"), "gender options must stay official");
  assert.ok(pageSource.includes("toggleWithNone(\"gender\", n.value)"), "gender 不限 must clear");
  assert.ok(pageSource.includes("closeOnSelect: true"), "gender must close on select");
});

test("region and fans region use the official province/city cascade under 中国", () => {
  const cascadeCount = (pageSource.match(/PgyKolCascadePop/g) || []).length;
  assert.ok(cascadeCount >= 3, "cascade popover must be defined and feed both location and fans location popovers");
  assert.ok(
    pageSource.includes('var pgyKolCountryOptions=pgyKolStaticOptions(["全部","中国","美国","日本","澳大利亚","英国","加拿大","韩国","法国","德国","新加坡","其他"])'),
    "country list must keep the official 12 options at the root level",
  );
  assert.ok(pageSource.includes('title: "地域"'), "location popover must be wired");
  assert.ok(pageSource.includes('title: "粉丝地域"'), "fans location popover must be wired");
  assert.ok(pageSource.includes('cfg: areasCfg'), "location popover must use the areas config (中国→省→市→区)");
  assert.ok(pageSource.includes('onSelect: applyLocation'), "location select must apply the cascade node");
  assert.ok(pageSource.includes('onSelect: applyFansLocation'), "fans location select must apply the cascade node");
  assert.ok(pageSource.includes('onClear: clearLocation'), "location clear must reset the draft");
  assert.ok(pageSource.includes('onClear: clearFansLocation'), "fans location clear must reset the draft");
  assert.ok(pageSource.includes('areasCfg = configs.areas'), "areas config must be loaded for the cascade");
});

test("audience20 stays a leaf-only tree popover", () => {
  assert.equal((pageSource.match(/leafOnly: true/g) || []).length, 5, "leafOnly:true must appear on the five official grouped filters (family/career/feature/scene/audience20)");
  assert.ok(
    pageSource.includes('title: "二十大人群"'),
    "audience20 popover must exist",
  );
  assert.ok(pageSource.includes("onApply: function (keys) { update({ audience20:"), "audience20 apply must map keys back to nodes");
  assert.match(pageSource, /已选 " \+ draft\.length \+ " 项"/, "tree popover must show the selected count");
  assert.ok(pageSource.includes('children: "清空"') && pageSource.includes('children: "确定"'), "tree popover must offer 清空/确定");
});

test("official grouped filters carry the audited 2026-08-11 option sets", () => {
  const trees = {
    pgyKolFamilyTree: {
      "家庭角色": ["妈妈", "萌娃", "爸爸", "奶奶"],
      "出镜人关系": ["情侣", "夫妻", "家庭", "闺蜜", "兄弟"],
      "母婴阶段": ["备孕中", "孕期中", "0-6个月", "6-12个月", "1-3岁", "3-6岁", "6-12岁", "12岁以上"],
    },
    pgyKolCareerTree: {
      "传统行业": ["工程师", "销售", "HR"],
      "互联网": ["主播", "运营", "产品经理", "程序员"],
      "教育科研": ["学生"],
      "金融法律": ["金融从业者"],
      "企业创业": ["创业者", "品牌创始人", "公益人"],
      "时尚美妆": ["模特", "化妆师", "造型师", "服装设计师", "珠宝设计师", "发型设计师"],
      "食品饮料": ["甜点师", "厨师", "咖啡师", "调酒师"],
      "文化传媒": ["编辑", "记者", "翻译", "作家", "娱评人", "影评人", "乐评人"],
      "医疗健康": ["营养师", "医生", "康复师"],
      "艺术设计": ["摄影师", "插画师", "室内设计师", "画家", "平面设计师", "建筑设计师", "非遗传承人", "涂鸦艺术家", "数字艺术家"],
      "影视娱乐": ["主持人", "导演", "制片人", "编剧", "经纪人", "真人秀嘉宾", "虚拟偶像", "rapper"],
      "运动健身": ["教练", "运动员", "舞蹈老师"],
      "专业服务": ["空乘", "花艺师", "整理师", "民宿主", "育婴师"],
    },
    pgyKolFeatureTree: {
      "生活背景": ["留学背景", "海外华人", "铲屎官", "孕妈", "独居人群", "外国人", "混血儿"],
      "备考经验": ["考公过来人", "考研过来人", "法考过来人", "注会过来人"],
      "兴趣爱好": ["户外爱好者", "数码爱好者", "手账爱好者", "二次元人群", "汉服爱好者", "手办爱好者", "模型爱好者", "街舞爱好者", "骑行爱好者", "飞盘爱好者", "书法爱好者"],
    },
    pgyKolSceneTree: {
      "形式": ["vlog", "探店", "测评", "ootd", "合集", "plog", "开箱", "教程", "成分解析", "彩妆试色", "仿妆", "沉浸式"],
      "风格": ["韩系", "日系", "欧美风", "氛围感", "纯欲", "甜酷", "复古", "高级感", "校园风", "中性风"],
      "生活方式": ["职场生活", "自律生活", "露营徒步", "极简主义", "低脂低卡"],
      "肤质肤色": ["油皮", "干皮", "混合肌", "敏感肌", "痘痘肌", "瑕疵皮", "白皮", "黄皮"],
      "皮肤养护": ["保湿补水", "美白", "淡斑", "祛黄", "抗氧化", "抗老", "祛皱", "抗炎", "修复", "祛痘祛闭口", "隔离防晒", "控油", "眼部护理"],
    },
  };
  const runtime = pageRuntime();
  for (const [treeName, groups] of Object.entries(trees)) {
    const tree = runtime[treeName];
    assert.ok(tree && Array.isArray(tree.nodes), treeName + " must be a tree");
    const groupNames = tree.nodes.map((node) => node.label);
    assert.deepEqual(JSON.parse(JSON.stringify(groupNames)), Object.keys(groups), treeName + " group names must match the official audit");
    for (const node of tree.nodes) {
      const labels = node.children.map((child) => child.label);
      assert.deepEqual(JSON.parse(JSON.stringify(labels)), groups[node.label], treeName + " " + node.label + " leaves must match the official audit");
    }
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.pgyKolChildAgeOptions.map((option) => option.value))),
    ["备孕", "0-6月", "7-12月", "1-3岁", "4-6岁", "7-12岁", "孕早期", "孕晚期"],
    "child age options must match the official audit",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.pgyKolDeviceBrandOptions.map((option) => option.value))),
    ["苹果", "华为", "OPPO", "VIVO", "荣耀", "小米", "一加", "魅族", "中兴", "联想"],
    "device brand options must match the official audit",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.pgyKolCountryOptions.map((option) => option.value))),
    ["全部", "中国", "美国", "日本", "澳大利亚", "英国", "加拿大", "韩国", "法国", "德国", "新加坡", "其他"],
    "country options must match the official audit",
  );
});

test("note category popover renders the full official three-level trees", () => {
  const runtime = pageRuntime();
  const fallback = runtime.pgyKolNoteCatFallback();
  const byName = {};
  fallback.forEach((node) => { byName[node.label] = node; });
  assert.ok(byName["汽车"] && byName["汽车"].children.length === 8, "car tree must keep all 8 top groups");
  assert.ok(byName["游戏"] && byName["游戏"].children.length === 2, "game tree must keep 游戏品类/游戏类型");
  assert.ok(byName["母婴"] && byName["母婴"].children.length === 10, "baby tree must keep all 10 top groups");
  const car = byName["汽车"];
  const rational = car.children.find((node) => node.label === "理性决策");
  assert.ok(rational && rational.children.length === 4, "理性决策 must keep 选车攻略/新车测评/探店试驾/车主心得");
  const guide = rational.children.find((node) => node.label === "选车攻略");
  assert.deepEqual(
    JSON.parse(JSON.stringify(guide.children.map((leaf) => leaf.label))),
    ["政策", "购车顾虑", "配置", "能源类型优势对比", "攻略"],
    "选车攻略 third level must match the official audit",
  );
  const game = byName["游戏"];
  const types = game.children.find((node) => node.label === "游戏类型");
  assert.equal(types.children.length, 21, "game types must keep all 21 official categories");
  const action = types.children.find((node) => node.label === "动作格斗游戏");
  assert.deepEqual(JSON.parse(JSON.stringify(action.children.map((leaf) => leaf.label))), ["永劫无间"]);
  const baby = byName["母婴"];
  const wash = baby.children.find((node) => node.label === "婴童洗护");
  assert.equal(wash.children.length, 15, "婴童洗护 must keep all 15 official leaves");
  const food = baby.children.find((node) => node.label === "婴童辅食");
  assert.equal(food.children.length, 21, "婴童辅食 must keep all 21 official leaves");
});

test("career/feature popovers keep their selection after reopening and confirm without clearing", async () => {
  const calls = [];
  const harness = searchPageHarness((filterState) => {
    calls.push(JSON.parse(JSON.stringify(filterState)));
    return Promise.resolve(successResult());
  });
  let tree = harness.renderer.render();
  // 1) 打开职业身份，选中 医生/工程师 并确定。
  const careerTrigger = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === "职业身份")[0];
  assert.ok(careerTrigger);
  careerTrigger.props.onOpen({ currentTarget: {} });
  tree = harness.renderer.render();
  const careerPop = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTreePop && node.props && node.props.title === "职业身份")[0];
  assert.ok(careerPop);
  careerPop.props.onApply(["医生:医生", "工程师:工程师"]);
  careerPop.props.onClose();
  tree = harness.renderer.render();
  // 2) 触发器徽标计数必须反映叶子选中数（P2 回归：组级 key 导致恒 0）。
  const careerTrigger2 = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === "职业身份")[0];
  assert.equal(careerTrigger2.props.count, 2, "career trigger count must reflect selected leaves");
  // 3) 重新打开职业身份：selectedKeys 必须包含已选叶子（回显），确定后不得清空。
  careerTrigger2.props.onOpen({ currentTarget: {} });
  tree = harness.renderer.render();
  const careerPop2 = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTreePop && node.props && node.props.title === "职业身份")[0];
  assert.ok(careerPop2);
  assert.deepEqual(JSON.parse(JSON.stringify(careerPop2.props.selectedKeys)), ["工程师:工程师", "医生:医生"], "reopened career popover must echo the selected leaves in official group order");
  careerPop2.props.onApply(careerPop2.props.selectedKeys);
  careerPop2.props.onClose();
  tree = harness.renderer.render();
  // 4) 特色背景同样回显；提交后两组并存且顺序稳定。
  const featureTrigger = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === "特色背景")[0];
  featureTrigger.props.onOpen({ currentTarget: {} });
  tree = harness.renderer.render();
  const featurePop = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTreePop && node.props && node.props.title === "特色背景")[0];
  featurePop.props.onApply(["留学背景:留学背景"]);
  featurePop.props.onClose();
  tree = harness.renderer.render();
  const featureTrigger2 = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTrigger && node.props && node.props.label === "特色背景")[0];
  assert.equal(featureTrigger2.props.count, 1, "feature trigger count must reflect selected leaves");
  featureTrigger2.props.onOpen({ currentTarget: {} });
  tree = harness.renderer.render();
  const featurePop2 = findVnodes(tree, (node) => node.type === harness.runtime.PgyKolTreePop && node.props && node.props.title === "特色背景")[0];
  assert.deepEqual(JSON.parse(JSON.stringify(featurePop2.props.selectedKeys)), ["留学背景:留学背景"], "reopened feature popover must echo the selected leaves");
  featurePop2.props.onApply(featurePop2.props.selectedKeys);
  featurePop2.props.onClose();
  tree = harness.renderer.render();
  findVnodes(tree, (node) => node.props && node.props.children === "搜索")[0].props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].featureTags, ["工程师", "医生", "留学背景"], "reopen+confirm must never clear the group and must keep official group order");
});

test("note category leaf paths keep the industry prefix so cross-industry leaves cannot collide", () => {
  const runtime = pageRuntime();
  const fallback = runtime.pgyKolNoteCatFallback();
  const car = fallback.find((node) => node.label === "汽车");
  const rational = car.children.find((node) => node.label === "理性决策");
  const guide = rational.children.find((node) => node.label === "选车攻略");
  const leafPath = runtime.pgyKolCollectLeafPaths(guide, ["汽车", "理性决策"])[0];
  assert.equal(leafPath, "汽车 理性决策 选车攻略 政策", "note category leaf path must start with the industry prefix");
  // 弹层渲染必须用行业前缀作为树根前缀。
  assert.ok(
    pageSource.includes('prefix:[String(ind&&(ind.label||ind.value||""))].filter(Boolean)'),
    "note category tree must seed its prefix with the selected industry",
  );
});

test("export flow opens a column-selection dialog and forwards the chosen columns", async () => {
  const calls = [];
  const harness = searchPageHarness((filterState) => Promise.resolve(successResult()), {
    extraBridge: {
      batchExport(args) { calls.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ ok: true }); },
    },
  });
  // 直接调用 exportTask（任务面板"导出"按钮的同一回调），应打开导出弹窗而非直接导出。
  let tree = harness.renderer.render();
  // 从组件闭包外无法拿到 exportTask，改为通过渲染出的任务面板按钮触发；这里直接验证源码契约：
  assert.match(pageSource, /var exportTask = function \(tid\) \{[\s\S]*?setExportOpen\(true\)/, "exportTask must open the export dialog");
  assert.match(pageSource, /bridge\.batchExport\(\{ taskId: exportTaskId, columns: ids && ids\.length \? ids : undefined \}\)/, "doExport must forward the selected columns");
  assert.match(pageSource, /hideFixed: true/, "export dialog must hide fixed columns");
  assert.match(pageSource, /title: "选择导出字段"/, "export dialog title must be 选择导出字段");
  assert.match(pageSource, /var exportableColumns = columnList \? columnList\.filter/, "exportable columns must be derived from the registry");
});

test("note category popover anchors to the trigger and renders a popover instead of a modal dialog", () => {
  assert.ok(
    pageSource.includes("setNoteAnchor(e && e.currentTarget ? e.currentTarget : null)"),
    "opening the note category must record the trigger anchor",
  );
  assert.ok(pageSource.includes("anchor: noteAnchor"), "note category popup must receive the anchor");
  assert.ok(
    pageSource.includes("return o.jsx(PgyKolPop,{open:p.open,anchor:p.anchor"),
    "note category popup must render through PgyKolPop",
  );
  assert.ok(
    pageSource.includes("o.jsx(PgyKolPopHeader,{title:\"笔记类目\",onClose:p.onClose})"),
    "note category popup must use the popover header",
  );
  assert.ok(
    !pageSource.slice(pageSource.indexOf("function PgyKolNoteCategoryPopup"), pageSource.indexOf("function PgyKolNoteCatNode")).includes("maxWidth"),
    "note category popup must not use the modal dialog sizing",
  );
});

test("Phase 5.2 popovers retain an anchor gap and recalculate on viewport movement", () => {
  const popSource = pageSource.slice(pageSource.indexOf("function PgyKolPop"), pageSource.indexOf("function PgyKolPopHeader"));
  assert.match(popSource, /getBoundingClientRect/, "popover position must derive from the live trigger rect");
  assert.match(popSource, /gap\s*=\s*[4-8]\b|\+\s*[4-8]\b/, "popover edge gap must stay within the official 4–8px target");
  assert.match(popSource, /scroll/, "popover must recompute its anchor position on scroll");
  assert.match(popSource, /resize/, "popover must recompute its anchor position on resize");
  assert.match(popSource, /position\s*:\s*["']fixed["']/, "popover must use viewport-relative positioning");
});

test("tree popovers keep their header/footer visible while only the tree body scrolls", () => {
  const treeSource = pageSource.slice(pageSource.indexOf("function PgyKolTreePop"), pageSource.indexOf("function PgyKolCascadePop"));
  assert.match(treeSource, /overflowY\s*:\s*["']auto["']/, "tree content must own vertical scrolling");
  assert.match(treeSource, /flexShrink\s*:\s*0|position\s*:\s*["']sticky["']/, "tree header/footer must not scroll away with content");
  assert.ok(treeSource.includes('children: "清空"') && treeSource.includes('children: "确定"'), "tree footer actions must remain present");
});

test("official 41 metrics and Magiorix extensions stay explicitly separated", () => {
  assert.match(pageSource, /41/, "the official metric count must remain explicit and auditable");
  assert.ok(pageSource.includes("Magiorix 扩展字段"), "non-official fields must have a separate visible group");
  assert.match(pageSource, /official|extension/i, "column metadata must distinguish official and extension fields");
});

test("payload preview is advanced information and initially collapsed", () => {
  assert.ok(pageSource.includes("高级信息"), "payload preview must be placed under the advanced-information label");
  assert.match(pageSource, /var adv = m\.useState\(false\), advancedOpen = adv\[0\], setAdvancedOpen = adv\[1\]/, "advanced information must default to collapsed");
  assert.match(pageSource, /advancedOpen \? o\.jsxs\(x, \{ children: \[[\s\S]{0,900}children: preview \|\|/, "payload body must render only after advanced information is opened");
  assert.ok(pageSource.includes("这是待确认条件的本地 Payload 预览，不会请求蒲公英接口。"), "preview must state its local non-network boundary");
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

test("payload contract: proven fields are sent, unproven audienceGroup is not", () => {
  const proven = [
    "out.inviteReply48hNumRatio=f.coopCredit.value",
    "out.accumCoopImpMedinNum30d=f.coopImpMedin.value",
    "out.readMidCoop30=f.coopReadMid.value",
    "out.interMidCoop30=f.coopInterMid.value",
    "out.mCpuv30d=f.coopOverflowMid.value",
    "out.estimatePicReadPrice=f.estimatePicReadCost.value",
    "out.estimateVideoReadPrice=f.estimateVideoReadCost.value",
    "out.estimatePictureEngageCost=f.estimatePicEngageCost.value",
    "out.estimateVideoEngageCost=f.estimateVideoEngageCost.value",
    "out.estimatePictureCpm=f.estimatePictureCpm.value",
    "out.estimateVideoCpm=f.estimateVideoCpm.value",
    "out.estimateCpuv30d=f.overflowCost.value",
    'out["filterList.kliveCnt30d"]=f.liveCount30d.map',
    'out["filterList.avgLiveViewerNum"]=f.avgLiveViewer.map',
    'out["filterList.avgAgmv90d"]=f.avgLiveGmv.map',
    "out.contentSceneLabel=f.noteCategory",
    "out.inStar=1",
    "out.newHighQuality=1",
    "out.filterIntention=true",
    'out["flagList.isHighQuality"]=true',
    'out["flagList.hasBuyerCoopAuth"]=true',
    "out.firstIndustry=f.firstIndustry",
    "out.secondIndustry=f.secondIndustry",
  ];
  for (const needle of proven) {
    assert.ok(pageSource.includes(needle), "pgyKolToFilterState must send the proven field: " + needle);
  }
  assert.ok(!pageSource.includes("out.audienceGroup="), "audienceGroup must not enter the payload");
  assert.ok(
    pageSource.includes("function pgyKolUnprovenSet(){return window.__pgyKolUnproven||{}}"),
    "unproven set must read the schema-driven window.__pgyKolUnproven",
  );
  assert.ok(
    pageSource.includes("function pgyKolSchemaUnproven(fields)"),
    "schema loader must populate the unproven set from IPC fields",
  );
  assert.ok(
    pageSource.includes('fd.payloadProven===false&&Array.isArray(fd.uiKeys)'),
    "unproven keys must come from payloadProven/uiKeys of the shared schema",
  );
  // 摘要 chips 的待实证后缀仍由 Schema 集合驱动。
  assert.ok(
    pageSource.includes('(pgyKolUnprovenSet()[s.key] ? "【待实证】" : "") + s.label'),
    "unproven summary chips must carry the 待实证 suffix from the schema set",
  );
  // 传播规模是官网 408px 四字段组合，并已由 Phase 5.1 实证映射到四个 payload 字段。
  assert.ok(!pageSource.includes('label: "传播规模", badge: "待实证"'), "proven spread control must not retain the stale unproven badge");
  assert.ok(pageSource.includes('label: "外溢进店中位数"'), "spread popover must retain all four official sub-fields");
  assert.ok(!pageSource.includes("「数据表现-传播规模」对应字段尚未在官方流量中实证"), "stale unproven copy must be removed");
});

test("brand gating: audience group and exclude switches require a cooperation brand", () => {
  assert.ok(pageSource.includes("hasBrands = filter.brands && filter.brands.length > 0"), "hasBrands must be derived from brands");
  assert.equal((pageSource.match(/disabled: !hasBrands/g) || []).length, 3, "audienceGroup + two exclude switches must be gated");
  assert.ok(pageSource.includes('children: "请选择您的合作品牌"'), "no-brand hint must exist");
  assert.ok(pageSource.includes('provider:"brandSearch"'), "brand popup must call brandSearch provider");
  assert.ok(pageSource.includes("out.activityCodes=f.activityCodes"), "activityCodes must be submitted");
});

test("nickname search history persists and clears", () => {
  assert.ok(pageSource.includes('window.localStorage.getItem("magiorix-pgy-kol-nick-history")'), "history must be read from localStorage");
  assert.ok(pageSource.includes('window.localStorage.setItem("magiorix-pgy-kol-nick-history"'), "history must be persisted");
  assert.ok(pageSource.includes('window.localStorage.removeItem("magiorix-pgy-kol-nick-history")'), "history must be clearable");
  assert.ok(pageSource.includes("function pgyKolNickHistoryAdd(kw)"), "history add helper must exist");
  assert.ok(pageSource.includes("onHistory: function (keyword) { setHistory(pgyKolNickHistoryAdd(keyword)); }"), "only the successful coordinator callback may record nickname history");
  assert.ok(pageSource.includes("function PgyKolHistoryPanel(p)"), "history panel must exist");
  assert.ok(pageSource.includes('children: "清空历史"'), "clear-history action must exist");
});

test("restart restore and one-click clear persistence", () => {
  assert.ok(pageSource.includes('pgyKolReadJson("magiorix-pgy-kol-filters")'), "filters must be restored from localStorage");
  assert.ok(pageSource.includes("saved.selectedColumns"), "restore must carry selected columns");
  assert.ok(pageSource.includes("setRestoredNotice(true)"), "restore must show the restored notice");
  assert.ok(pageSource.includes('children: "已恢复筛选，请点击确定后查询"'), "restored notice must explicitly require confirmation");
  assert.ok(pageSource.includes("searchCoordinator.restore(next)"), "restored state must enter draft without searching");
  assert.ok(pageSource.includes('pgyKolClearJson("magiorix-pgy-kol-filters")'), "one-click clear must purge persisted filters");
  assert.ok(pageSource.includes("setFilter(pgyKolDefaultFilter())"), "one-click clear must reset the filter");
  assert.ok(
    pageSource.includes('pgyKolWriteJson("magiorix-pgy-kol-filters", { searchType: filter.searchType, keyword: filter.keyword, filter: filter, selectedColumns: selectedColumns })'),
    "filter changes must persist searchType/keyword/filter/selectedColumns",
  );
});

test("icon beautification: menu, page header, and search button use the registered solar magnifier", () => {
  assert.ok(
    pageSource.includes('{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"solar:magnifer-bold-duotone"}'),
    "menu item must carry the registered solar magnifier icon",
  );
  assert.ok(!pageSource.includes('icon: "mdi:account-search"'), "unregistered mdi icon must be gone from the menu");
  assert.ok(pageSource.includes("solar:magnifer-bold-duotone"), "page header must use the solar magnifier");
  assert.ok(
    pageSource.includes('background: "linear-gradient(135deg,#FF6C40,#FF3030)"'),
    "page header must use the Magiorix orange-red gradient",
  );
  assert.ok(pageSource.includes('color: "#fff"'), "header icon must be white on the gradient tile");
  assert.ok(
    pageSource.includes('startIcon: status === "loading" ? o.jsx(de, { size: 18, color: "inherit" }) : o.jsx(B, { icon: "solar:magnifer-bold-duotone", width: 18, height: 18 })'),
    "search button startIcon must use the solar magnifier",
  );
});

test("column dialog contract: fixed columns, price mutual exclusion, search, order, persistence", () => {
  assert.ok(
    pageSource.includes('function pgyKolColumnGroups(){return ["固定列","博主报价","账号数据","直播数据","日常笔记数据","合作笔记数据","其他指标"]}'),
    "column groups must exist",
  );
  assert.ok(pageSource.includes('function pgyKolFixedColumnIds(){return ["kolInfo","recentNotes","actions"]}'), "fixed column ids must exist");
  assert.ok(pageSource.includes('if (id === "kolInfo") return "博主信息";'), "fixed kolInfo label must exist");
  // 官网两栏式：左侧仅计算官网 41 项，扩展字段单列展示；右侧为已添加项。
  assert.ok(pageSource.includes("pgyKolOfficialMetricColumns(list)"), "left pane must derive the official metric set from metadata");
  assert.ok(pageSource.includes("var officialCount = officialColumns.length"), "official metric count must be derived separately");
  assert.ok(pageSource.includes('children: "官网展示指标（" + officialCount + "）"'), "left pane must show the official metric count only");
  assert.ok(pageSource.includes('children: "Magiorix 扩展字段（" + extensionColumns.length + "）"'), "extensions must remain visible but outside the official count");
  assert.ok(pageSource.includes('placeholder: "请输入筛选条件"'), "dialog search must use the official placeholder");
  assert.ok(pageSource.includes('children: "已添加 " + effective.length + " 项"'), "right pane must show the added count");
  assert.ok(pageSource.includes('children: "以上为横向固定列"'), "fixed-column divider copy must exist");
  assert.ok(pageSource.includes('icon: "solar:lock-bold"'), "fixed columns must carry a lock icon");
  assert.ok(pageSource.includes('icon: "mdi:drag-vertical"'), "reorderable columns must carry a drag handle");
  assert.ok(pageSource.includes('if (fixedIds.indexOf(id) >= 0) return;'), "fixed columns must be unremovable");
  assert.ok(
    pageSource.includes('c !== "price" && c !== "picturePrice" && c !== "videoPrice"'),
    "price/picturePrice/videoPrice must be mutually exclusive",
  );
  assert.ok(pageSource.includes('search === "" || (c.label || "").indexOf(search) >= 0'), "dialog search must filter by label");
  assert.ok(pageSource.includes("setDraftState(hideFixed ? [] : fixedIds.slice())"), "clear must reset to fixed columns (or empty in export mode)");
  assert.ok(pageSource.includes('setDraftState(null);\n    setSearch("");\n    p.onClose();'), "cancel must close without applying");
  assert.ok(pageSource.includes("p.onApply(effective.slice())"), "confirm must apply the draft");
  assert.ok(pageSource.includes('pgyKolWriteJson("magiorix-pgy-kol-columns", ids)'), "confirm must persist to localStorage");
  assert.ok(pageSource.includes("moveDraft(id, -1)") && pageSource.includes("moveDraft(id, 1)"), "move buttons must call moveDraft");
});

test("column persistence: defaultDisplay fallback and invalid storage fallback", () => {
  const runtime = pageRuntime();
  const list = [
    { id: "nickname", defaultDisplay: true },
    { id: "fans", defaultDisplay: false },
  ];
  const fallback = Array.from(runtime.pgyKolResolveColumns(list, ["unknown-column"]));
  assert.deepEqual(fallback, ["kolInfo", "recentNotes", "actions", "nickname"], "invalid stored ids must fall back to defaultDisplay columns");
  const stored = Array.from(runtime.pgyKolResolveColumns(list, ["kolInfo", "recentNotes", "actions", "fans"]));
  assert.deepEqual(stored, ["kolInfo", "recentNotes", "actions", "fans"], "fixed ids plus valid registry ids must restore in order");
  assert.ok(
    pageSource.includes('pgyKolReadJson("magiorix-pgy-kol-columns")'),
    "page must read the persisted columns key",
  );
});

test("result table renders whitelisted info column and registry-driven data columns", () => {
  assert.match(pageSource, /k&&\(k\.avatar\|\|k\.avatarUrl\)\|\|""/, "avatar must come from whitelisted fields");
  assert.ok(pageSource.includes("children:k&&k.nickname||\"-\""), "nickname must render with dash fallback");
  assert.ok(pageSource.includes("children:k&&k.userId||\"-\""), "userId must render with dash fallback");
  assert.ok(pageSource.includes("((k&&k.location)||\"-\")+\" · \"+((k&&k.gender)||\"-\")"), "location and gender must render");
  assert.match(pageSource, /var result=p\.result,kols=result\.kols\|\|\[\]/, "table must read result.kols");
  assert.ok(pageSource.includes("col.responsePath||col.id"), "cell value must resolve via responsePath");
  assert.ok(pageSource.includes('String(path).split(".")'), "responsePath must support dotted paths");
  assert.ok(pageSource.includes("cur=cur[parts[i]]"), "dotted path traversal must exist");
  assert.ok(pageSource.includes('if(fmt==="number")return pgyKolThousand(v)'), "number formatter must exist");
  assert.ok(pageSource.includes('(Math.abs(n)<=1?n*100:n).toFixed(1)+"%"'), "percent formatter must keep one decimal without double-scaling");
  assert.ok(pageSource.includes('String(v)+"元"'), "money formatter must append yuan without rounding/space");
  assert.ok(pageSource.includes('component:"a"') && pageSource.includes('target:"_blank"'), "url formatter must render a link");
  assert.ok(pageSource.includes('v.value===undefined||v.value===null||v.value===""'), "null cells must be detected");
  assert.ok(pageSource.includes('col.evidence==="unavailable"'), "unavailable columns must be detected via evidence");
  assert.ok(pageSource.includes('children:"官网当前未返回"'), "unavailable cells must show official-missing copy");
  assert.match(pageSource, /kols\.map\(function\(k,ki\)/, "table rows must map over first-page kols");
  assert.doesNotMatch(pageSource, /\.rows\.map\(function|task\.leaves\.map\(function/);
});

test("Phase 5 page source ships the batch UI copy and status texts", () => {
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
  assert.match(pageSource, /api\.batchStart\(\{filterState:pgyKolClone\(appliedRequestSnapshot\),columns:pgyKolClone\(columns\|\|\[\]\)\}\)/, "coordinator must submit only its frozen applied snapshot");
  assert.match(
    pageSource,
    /searchCoordinator\.startBatch\(exportColumns\)/,
    "page batch start must delegate its ordered exportable columns to the applied-snapshot coordinator",
  );
  assert.match(
    pageSource,
    /pgyKolExportColumnIds\(columnList, selectedColumns\)/,
    "startBatch must filter fixed/computed/unavailable columns out of the export column list",
  );
  assert.match(pageSource, /batchGet\(\{ taskId: tid \}\)/);
  assert.match(pageSource, /batchPause\(\{ taskId: tid \}\)/);
  assert.match(
    pageSource,
    /bridge\.batchResume\(budgets \? \{ taskId: tid, budgets: budgets \} : \{ taskId: tid \}\)/,
    "batchResume must forward budgets when provided",
  );
  assert.match(pageSource, /batchCancel\(\{ taskId: tid \}\)/);
  assert.match(pageSource, /bridge\.batchExport\(\{ taskId: exportTaskId, columns: ids && ids\.length \? ids : undefined \}\)/, "export must forward the chosen columns");
  assert.match(pageSource, /setExportOpen\(true\)/, "export action must open the column-selection dialog");
  assert.match(pageSource, /title: "选择导出字段"/, "export dialog must carry the export column title");
  assert.match(pageSource, /hideFixed: true/, "export dialog must hide the fixed column pane");
  assert.match(pageSource, /disabled: batchBusy \|\| batchRunning/, "start button must be disabled while busy or running");
});

test("Phase 5 page source subscribes to batch events and disposes on unmount", () => {
  assert.match(pageSource, /bridge\.onBatchEvent\(function \(ev\) \{/);
  assert.match(pageSource, /if \(currentTaskId\) loadTask\(currentTaskId\)/, "batch events must refresh the current task detail");
  assert.match(
    pageSource,
    /return function \(\) \{ if \(dispose && typeof dispose === "function"\) dispose\(\); \};/,
    "onBatchEvent subscription must return a dispose cleanup",
  );
  assert.match(pageSource, /\[currentTaskId\]/, "event effect must re-subscribe when the current task changes");
});

test("Phase 5 preview boundary keeps a limited DOM and shows persisted counts", () => {
  assert.match(
    pageSource,
    /预览 " \+ \(result\.kols \? result\.kols\.length : 0\) \+ " 条 \/ 已持久化 " \+ pgyKolCount\(currentTask, "raw"\) \+ " 条（完整数据以导出为准）"/,
    "preview caption must state preview count vs persisted count",
  );
  assert.match(pageSource, /result\.capSignal && result\.capSignal\.capped/, "cap signal chips must be kept");
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
  assert.ok(
    script.includes("normalizeSource(pgyKolSearchPageSource51)"),
    "content guard must hash the final embedded page source",
  );
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

test("page must load config, schema fields, preview payload, and search through the existing bridge", () => {
  assert.ok(pageSource.includes("bridge.getConfig("), "page must load filter config via bridge.pgyKol.getConfig");
  assert.ok(pageSource.includes("bridge.previewPayload("), "page must preview payload via bridge.pgyKol.previewPayload");
  assert.ok(pageSource.includes("api.searchFirstPage(pgyKolClone(request))"), "the coordinator must make the single formal search call");
  assert.ok(pageSource.includes("return searchCoordinator.applyAndSearch()"), "the page must delegate all formal searches to the coordinator");
  assert.ok(pageSource.includes('provider: "activities"'), "hot activities must load via getConfig activities provider");
  assert.ok(pageSource.includes("bridge.getSchemaFields"), "page must load schema fields for the unproven set");
  assert.ok(pageSource.includes("pgyKolSchemaUnproven(res.data)"), "schema fields must populate the unproven set");
});

test("page source must not carry legacy brand residue or banned names", () => {
  assert.doesNotMatch(pageSource, legacyFrontendBrandPattern, "pgy-kol page source must stay brand-free");
  for (const banned of ["树苗", "薯苗", "zs.login", "zs."]) {
    assert.ok(!pageSource.includes(banned), "page source must not contain: " + banned);
  }
  assert.ok(!script.includes("solar:magnifer-bold-duotone"), "old solar magnifer icon residue must be gone from the script");
});

test("no handler may be embedded inside an MUI sx object", () => {
  const onClickRe = /onClick:\s*function/g;
  let m;
  while ((m = onClickRe.exec(pageSource)) !== null) {
    const before = pageSource.slice(0, m.index);
    const sxAt = before.lastIndexOf("sx: {");
    if (sxAt < 0) continue;
    let depth = 1;
    let i = sxAt + 5;
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
});

// ============ Phase 5.2 UI 对齐（2026-08-10 官网实测）：博主类目两级悬停 + 弹层定位 ============

test("blogger category row shows all official primary chips by default with hover popups", () => {
  const harness = searchPageHarness(() => Promise.resolve(successResult()));
  const runtime = harness.runtime;
  const tree = harness.renderer.render();
  const chips = findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryChips)[0];
  assert.ok(chips, "博主类目 row must use the official two-level chip component");
  const options = chips.props.options;
  const labels = options.map((node) => node.label);
  for (const label of ["全部", "美妆", "母婴", "职场", "其他"]) {
    assert.ok(labels.includes(label), "default row must include official primary chip " + label);
  }
  assert.equal(labels.length, 29, "all 29 official primary chips (including 全部) must be visible by default");
  const babyNode = options.find((node) => node.value === "母婴");
  assert.equal(babyNode.children.length, 13, "母婴 must carry all 13 official secondary categories");
  assert.equal(typeof chips.props.onToggleWhole, "function");
  assert.equal(typeof chips.props.onToggleLeaf, "function");
  assert.equal(typeof chips.props.onToggleAll, "function");
  assert.ok(findVnodes(tree, (node) => node.props && node.props.children === "收起" && typeof node.props.onClick === "function").length > 0, "expand/collapse must default to the expanded state");
});

test("blogger category tree merges official fallback children when the live tree is flat", () => {
  const runtime = pageRuntime();
  const flat = {
    nodes: [
      { value: "美妆", label: "美妆", children: [] },
      { value: "母婴", label: "母婴", children: [] },
    ],
  };
  const merged = runtime.pgyKolCategoryTreeNodes(flat);
  const baby = merged.find((node) => node.value === "母婴");
  assert.ok(baby, "母婴 must survive the merge");
  assert.equal(baby.children.length, 13, "flat live tree must be completed with the official fallback children");
  assert.equal(baby.children[0].value, "母婴日常");
  const live = runtime.pgyKolCategoryTreeNodes({
    nodes: [{ value: "母婴", label: "母婴", children: [{ value: "live-leaf", label: "live-leaf", children: [] }] }],
  });
  assert.equal(live[0].children.length, 1, "live children must win over the fallback");
  assert.equal(live[0].children[0].value, "live-leaf");
});

test("blogger category fallback covers 职场 and 汽车 secondaries (official 2026-08-11)", () => {
  const runtime = pageRuntime();
  const nodes = runtime.pgyKolCategoryTreeNodes({});
  const career = nodes.find((node) => node.value === "职场");
  const auto = nodes.find((node) => node.value === "汽车");
  assert.ok(career, "职场 must be in the fallback tree");
  assert.deepEqual(
    JSON.parse(JSON.stringify(career.children.map((node) => node.value))),
    ["职场干货", "职场行业", "职业考试", "职场其他"],
  );
  assert.ok(auto, "汽车 must be in the fallback tree");
  assert.deepEqual(
    JSON.parse(JSON.stringify(auto.children.map((node) => node.value))),
    ["用车攻略", "汽车评测", "汽车其他"],
  );
});

test("blogger category hover opens the official secondary panel; leaf clicks stay draft-only", () => {
  const runtime = pageRuntime();
  const anchor = { getBoundingClientRect() { return { left: 100, right: 180, top: 200, bottom: 228 }; } };
  const fallback = runtime.pgyKolCategoryTreeNodes({});
  const options = fallback.map((node) => ({ value: node.value, label: node.label, children: node.children }));
  options.unshift({ value: "全部", label: "全部", children: [] });
  const props = {
    options,
    selected: [],
    isActive(node) { return props.selected.indexOf(node.value) >= 0 || (node.children || []).some((c) => props.selected.indexOf(c.value) >= 0); },
    onToggleWhole() {},
    onToggleLeaf() {},
    onToggleAll() {},
  };
  const renderer = statefulRenderer(runtime, runtime.PgyKolCategoryChips, props, {});
  let tree = renderer.render();
  const chip = findVnodes(tree, (node) => node.type === runtime.PgyKolTrigger && node.props.label === "母婴")[0];
  assert.ok(chip, "母婴 primary chip must render");
  assert.equal(chip.props.selected, false);
  chip.props.onMouseEnter({ currentTarget: anchor });
  tree = renderer.render();
  const pop = findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryPop)[0];
  assert.ok(pop, "hovering the primary chip must open the official secondary panel");
  const inner = runtime.PgyKolCategoryPop(pop.props);
  assert.equal(inner.props.width, 280, "secondary panel keeps the official 280px width");
  assert.equal(inner.props.preferredHeight, 232);
  assert.equal(inner.props.maxHeight, 232);
  assert.equal(inner.props.noBackdrop, true, "category hover panel must not block clicks on the primary chip");
  const leafLabels = findVnodes(inner, (node) => node.type === runtime.PgyKolTrigger).map((node) => node.props.label);
  for (const label of ["母婴日常", "孕期穿搭", "宝宝写真", "母婴其他"]) {
    assert.ok(leafLabels.includes(label), "panel must list official secondary " + label);
  }
  assert.equal(leafLabels.length, 13, "母婴 must keep all 13 official secondaries");

  let leafClick = null;
  props.onToggleLeaf = (node, leaf) => { leafClick = { node: node.value, leaf: leaf.value }; };
  tree = renderer.render();
  const pop2 = findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryPop)[0];
  const leaf = findVnodes(runtime.PgyKolCategoryPop(pop2.props), (node) => node.type === runtime.PgyKolTrigger && node.props.label === "孕期穿搭")[0];
  leaf.props.onOpen();
  assert.deepEqual(leafClick, { node: "母婴", leaf: "孕期穿搭" }, "leaf click must toggle exactly that secondary");

  props.selected = ["孕期穿搭"];
  tree = renderer.render();
  const pop3 = findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryPop)[0];
  const chip3 = findVnodes(tree, (node) => node.type === runtime.PgyKolTrigger && node.props.label === "母婴" && typeof node.props.onMouseEnter === "function")[0];
  assert.equal(chip3.props.selected, true, "primary chip must show active when one secondary is selected");
  const pop3Inner = runtime.PgyKolCategoryPop(pop3.props);
  const selectedLeaf = findVnodes(pop3Inner, (node) => node.type === runtime.PgyKolTrigger && node.props.label === "孕期穿搭")[0];
  const unselectedLeaf = findVnodes(pop3Inner, (node) => node.type === runtime.PgyKolTrigger && node.props.label === "早教")[0];
  assert.equal(selectedLeaf.props.selected, true);
  assert.equal(unselectedLeaf.props.selected, false);

  props.selected = ["母婴"];
  tree = renderer.render();
  const pop4 = findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryPop)[0];
  const wholeSelected = findVnodes(runtime.PgyKolCategoryPop(pop4.props), (node) => node.type === runtime.PgyKolTrigger).every((node) => node.props.selected === true);
  assert.equal(wholeSelected, true, "whole category must show every secondary as selected in the panel");
});

test("blogger category whole-selection semantics match the official page", () => {
  let searches = 0;
  const harness = searchPageHarness(() => { searches += 1; return Promise.resolve(successResult()); });
  const runtime = harness.runtime;
  let tree = harness.renderer.render();
  function chipsNode() {
    return findVnodes(tree, (node) => node.type === runtime.PgyKolCategoryChips)[0];
  }
  function selectedValues() {
    return JSON.parse(JSON.stringify(chipsNode().props.selected));
  }
  const babyNode = chipsNode().props.options.find((node) => node.value === "母婴");
  const leafNode = babyNode.children.find((node) => node.value === "孕期穿搭");

  chipsNode().props.onToggleWhole(babyNode);
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), ["母婴"], "clicking the primary chip must select the whole category as the primary label");

  chipsNode().props.onToggleLeaf(babyNode, leafNode);
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), ["母婴"], "clicking a secondary while the category is whole must be a no-op (official behavior)");

  chipsNode().props.onToggleWhole(babyNode);
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), [], "clicking the whole-selected primary again must clear the category");

  chipsNode().props.onToggleLeaf(babyNode, leafNode);
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), ["孕期穿搭"], "a single secondary must store the secondary label");

  chipsNode().props.onToggleWhole(babyNode);
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), ["母婴"], "clicking the primary over a partial selection must upgrade to the whole category");

  chipsNode().props.onToggleAll();
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), ["全部"], "全部 must be the clear-all marker");
  chipsNode().props.onToggleAll();
  tree = harness.renderer.render();
  assert.deepEqual(selectedValues(), [], "clicking 全部 again must restore no category");
  assert.equal(searches, 0, "all category interactions must remain draft-only");
});

test("blogger category payload sends the primary for whole and the secondary for single (official)", async () => {
  const calls = [];
  const coordinator = createCoordinator({
    searchFirstPage(filterState) { calls.push(JSON.parse(JSON.stringify(filterState))); return Promise.resolve(successResult()); },
  });
  coordinator.editDraft({ contentTag: ["母婴"] });
  await coordinator.applyAndSearch();
  coordinator.editDraft({ contentTag: ["孕期穿搭"] });
  await coordinator.applyAndSearch();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].contentTag, ["母婴"], "whole category must send the primary label");
  assert.deepEqual(calls[1].contentTag, ["孕期穿搭"], "single secondary must send the secondary label");
});

test("official simple menu caps at the 261px official height with internal scroll and opens below", () => {
  const runtime = pageRuntime();
  const anchor = { getBoundingClientRect() { return { left: 100, right: 180, top: 200, bottom: 228 }; } };
  const menu = runtime.PgyKolOfficialSimpleMenu({
    open: true,
    anchor,
    options: runtime.pgyKolRecentIndustryOptions,
    value: "不限",
    onSelect() {},
    onClose() {},
  });
  assert.equal(menu.type, runtime.PgyKolPop);
  assert.equal(menu.props.width, 228, "official simple menu keeps the 228px width");
  assert.equal(menu.props.preferredHeight, 261, "official simple menu caps at 261px");
  assert.equal(menu.props.overflow, "auto", "official simple menu scrolls internally");
});

test("popover placement prefers below with clamped height and bottom-anchors flips (official)", () => {
  const runtime = pageRuntime();
  function popupSx(anchor, props) {
    const node = runtime.PgyKolPop(Object.assign({ open: true, anchor, onClose() {} }, props || {}));
    const box = findVnodes(node, (vnode) => vnode.props && vnode.props.sx && vnode.props.sx.position === "fixed" && vnode.props.sx.zIndex === 1400)[0];
    assert.ok(box, "popup container must render");
    return box.props.sx;
  }
  const mid = { getBoundingClientRect() { return { left: 100, right: 180, top: 200, bottom: 228 }; } };
  let sx = popupSx(mid, { width: 228, preferredHeight: 261, maxHeight: 261 });
  assert.equal(sx.top, 234, "plenty of room below: popup must anchor under the trigger");
  assert.equal(sx.bottom, "auto");
  assert.equal(sx.maxHeight, 631 - 6 - 8 < 261 ? 631 - 6 - 8 : 261, "height must be clamped to the space below");

  const low = { getBoundingClientRect() { return { left: 100, right: 180, top: 580, bottom: 608 }; } };
  sx = popupSx(low, { width: 228, preferredHeight: 261, maxHeight: 261 });
  assert.equal(sx.top, "auto", "near the viewport bottom the popup must flip above");
  assert.equal(sx.bottom, 631 - 580 + 6, "flipped popup must bottom-anchor to the trigger, never pin to the viewport top");

  const tight = { getBoundingClientRect() { return { left: 100, right: 180, top: 420, bottom: 448 }; } };
  sx = popupSx(tight, { width: 228, preferredHeight: 261, maxHeight: 261 });
  assert.equal(sx.top, 454, "some room below: popup must stay below the trigger");
  assert.equal(sx.bottom, "auto");
  assert.equal(sx.maxHeight, 631 - 448 - 6 - 8, "height must be clamped to the available space below");
});
