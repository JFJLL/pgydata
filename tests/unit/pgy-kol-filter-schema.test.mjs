import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCHEMA_VERSION,
  PROVIDER_ENDPOINTS,
  KOL_TAGS_V2_SECTIONS,
  FIELD_REGISTRY,
  PgySchemaError,
  createJsonLkgStore,
  PgyFilterSchema,
} from "../../app-source/pgy-kol/pgy-filter-schema.mjs";

const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/pgy-kol", import.meta.url));

async function loadFixture(name) {
  return JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, name), "utf8"));
}

function makeRequest(responder) {
  return {
    async requestJson(options) {
      return responder(options);
    },
  };
}

function makeSchema(request = makeRequest(() => ({ code: 0, data: {} }))) {
  return new PgyFilterSchema({ request });
}

function collectNodes(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectNodes(node.children, out);
    }
  }
  return out;
}

async function tmpDir(t, prefix = "pgy-lkg-") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test("SCHEMA_VERSION / PROVIDER_ENDPOINTS / KOL_TAGS_V2_SECTIONS 契约", () => {
  assert.equal(SCHEMA_VERSION, "pgy-filter-schema/1.0.0");
  assert.equal(PROVIDER_ENDPOINTS.kolTagsV2, "/api/solar/kol/get_select_kol_tags_config_v2");
  assert.equal(PROVIDER_ENDPOINTS.areas, "/api/solar/area/get_areas?type=2");
  assert.equal(PROVIDER_ENDPOINTS.contentTagTree, "/api/solar/cooperator/content/tag_tree");
  assert.equal(
    PROVIDER_ENDPOINTS.industryTags,
    "https://edith.xiaohongshu.com/api/pgy/kol/get_industry_tag",
  );
  assert.equal(PROVIDER_ENDPOINTS.consumeBehavior, "/api/pgy/kol/consume_behavior");
  assert.equal(PROVIDER_ENDPOINTS.brandSearch, "/api/solar/brand/search_brand");
  assert.equal(PROVIDER_ENDPOINTS.activities, "/api/solar/cooperator/get_all_activities");
  assert.ok(Object.isFrozen(PROVIDER_ENDPOINTS));
  assert.deepEqual(KOL_TAGS_V2_SECTIONS, {
    automotiveIndustryTag: "industrySpecificCrowdsMotorDom",
    audience20: "top20CrowdsLabel",
    contentTheme: "contentThemeLabel",
  });
});

test("normalizeOptionTree 保留同 label 不同 value/path 的节点，uniqueKey 唯一", () => {
  const schema = makeSchema();
  const nodes = schema.normalizeOptionTree({
    rawNodes: [
      { value: 2002, label: "场景", children: [{ value: 3004, label: "美妆-日常妆" }] },
      { value: 2003, label: "场景", children: [{ value: 3005, label: "家居-收纳" }] },
      { value: 3001, label: "场景" },
    ],
    payloadField: "industrySpecificCrowdsMotorDom",
    provider: "kolTagsV2",
  });

  assert.equal(nodes.length, 3);
  assert.deepEqual(
    nodes.map((n) => n.label),
    ["场景", "场景", "场景"],
  );
  assert.deepEqual(
    nodes.map((n) => n.value),
    ["2002", "2003", "3001"],
  );
  const keys = nodes.map((n) => n.uniqueKey);
  assert.deepEqual(keys, [
    "industrySpecificCrowdsMotorDom:2002:场景",
    "industrySpecificCrowdsMotorDom:2003:场景",
    "industrySpecificCrowdsMotorDom:3001:场景",
  ]);
  assert.equal(new Set(keys).size, 3);

  // 子节点 fullPath / uniqueKey 携带父路径
  assert.equal(nodes[0].children[0].fullPath, "场景 > 美妆-日常妆");
  assert.equal(nodes[0].children[0].uniqueKey, "industrySpecificCrowdsMotorDom:3004:场景 > 美妆-日常妆");
  assert.equal(nodes[1].children[0].fullPath, "场景 > 家居-收纳");
});

test("normalizeOptionTree 从 fixture 保留两个不同路径的“场景”与示例叶子", async () => {
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const schema = makeSchema();
  const nodes = schema.normalizeOptionTree({
    rawNodes: cfg.data.automotiveIndustryTag,
    payloadField: "industrySpecificCrowdsMotorDom",
    provider: "kolTagsV2",
  });
  const all = collectNodes(nodes);
  const scenes = all.filter((n) => n.label === "场景");
  assert.ok(scenes.length >= 2, `应至少有两个“场景”，实际 ${scenes.length}`);
  assert.equal(new Set(scenes.map((n) => n.uniqueKey)).size, scenes.length);
  assert.deepEqual(
    scenes.map((n) => n.fullPath),
    ["日化家清 > 纸品 > 场景", "美妆个护 > 场景", "家居生活 > 场景"],
  );

  const leaf = all.find((n) => n.value === "19188199");
  assert.ok(leaf);
  assert.equal(leaf.label, "纸品-留子跨国囤货党");
  assert.equal(leaf.fullPath, "日化家清 > 纸品 > 场景 > 纸品-留子跨国囤货党");
  assert.equal(leaf.uniqueKey, "industrySpecificCrowdsMotorDom:19188199:日化家清 > 纸品 > 场景 > 纸品-留子跨国囤货党");
  assert.equal(leaf.disabled, false);
  assert.equal(leaf.provider, "kolTagsV2");
  assert.equal(leaf.payloadField, "industrySpecificCrowdsMotorDom");
  assert.equal(leaf.rawVersion.value, 19188199);
});

test("flattenLeafValues 对示例叶子返回字符串数组，父节点展开全部叶子", async () => {
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const schema = makeSchema();
  const nodes = schema.normalizeOptionTree({
    rawNodes: cfg.data.automotiveIndustryTag,
    payloadField: "industrySpecificCrowdsMotorDom",
    provider: "kolTagsV2",
  });
  const all = collectNodes(nodes);
  const leaf = all.find((n) => n.value === "19188199");
  assert.deepEqual(schema.flattenLeafValues(leaf), ["19188199"]);

  // 父节点（纸品）展开全部叶子
  const paper = nodes[0].children[0];
  assert.equal(paper.label, "纸品");
  const leaves = schema.flattenLeafValues(paper);
  assert.deepEqual(leaves, ["19188199", "3003"]);
});

test("flattenLeafValues：falsy value 按 value||label||原值 回退", async () => {
  const schema = makeSchema();
  assert.deepEqual(schema.flattenLeafValues({ value: "", label: "空值标签" }), ["空值标签"]);
  assert.deepEqual(schema.flattenLeafValues({ value: 0, label: "零值标签" }), ["零值标签"]);
  assert.deepEqual(
    schema.flattenLeafValues({ value: 19188199, label: "纸品-留子跨国囤货党" }),
    [19188199],
  );
});

test("serialize flatten-leaf-values 从 fixture 父节点展开并包含 19188199", async () => {
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const schema = makeSchema();

  // 规范化节点：value 为字符串
  const nodes = schema.normalizeOptionTree({
    rawNodes: cfg.data.automotiveIndustryTag,
    payloadField: "industrySpecificCrowdsMotorDom",
    provider: "kolTagsV2",
  });
  const scene = nodes[0].children[0].children[0];
  assert.equal(scene.label, "场景");
  assert.deepEqual(schema.serialize({ payloadField: "industrySpecificCrowdsMotorDom", value: [scene] }), [
    "19188199",
  ]);

  // 原始 fixture 节点：value 为数字
  const rawScene = cfg.data.automotiveIndustryTag[0].children[0].children[0];
  const rawOut = schema.serialize({ payloadField: "industrySpecificCrowdsMotorDom", value: [rawScene] });
  assert.deepEqual(rawOut, [19188199]);
});

test("serialize path-or-label 优先级 path > label > 原节点", async () => {
  const schema = makeSchema();
  const tree = await loadFixture("consumer-behavior-tree.json");
  // 线上真实形状：data.consumeBehaviorTag 数组（2026-08-05 真实响应实证）；
  // 线上节点无独立 path，path 由规范化按 fullPath 派生空格路径。
  const nodes = schema.deriveSpacePaths(
    schema.normalizeOptionTree({
      rawNodes: tree.data.consumeBehaviorTag,
      payloadField: "kolInfoConsumBehaviorLabel",
      provider: "consumeBehavior",
    }),
  );
  // 真实树：美妆个护 > 护肤 > 洁面；选择叶子 洁面，path = 空格连接全路径。
  const onlyPath = nodes[2].children[0].children[0];
  const onlyLabel = nodes[3];
  assert.deepEqual(
    schema.serialize({
      payloadField: "kolInfoConsumBehaviorLabel",
      value: [onlyPath, onlyLabel],
    }),
    ["美妆个护 护肤 洁面", "只有标签的消费行为"],
  );

  const fallback = { value: "fallback-node" };
  assert.deepEqual(
    schema.serialize({
      payloadField: "kolInfoConsumBehaviorLabel",
      value: [{ path: "A > B", label: "标签B" }, { label: "只有标签" }, fallback],
    }),
    ["A > B", "只有标签", fallback],
  );
});

test("serialize path-trim 去掉首尾空格", async () => {
  const schema = makeSchema();
  const areas = await loadFixture("areas-tree.json");
  // 线上真实形状：data.list 数组（2026-08-05 真实响应实证），节点无独立 path，
  // path 由规范化按 fullPath 派生空格路径。
  const nodes = schema.deriveSpacePaths(
    schema.normalizeOptionTree({
      rawNodes: areas.data.list,
      payloadField: "location",
      provider: "areas",
      valueKey: "name",
      labelKey: "name",
    }),
  );
  const guangdong = nodes[0].children[0];
  const zhejiang = nodes[0].children[1];

  assert.equal(schema.serialize({ payloadField: "location", value: guangdong }), "中国 广东");
  assert.deepEqual(
    schema.serialize({ payloadField: "fansLocation", value: [guangdong, zhejiang] }),
    ["中国 广东", "中国 浙江"],
  );
});

test("serialize path-trim：纯字符串输入直接 trim", async () => {
  const schema = makeSchema();
  assert.equal(schema.serialize({ payloadField: "location", value: " 广东 " }), "广东");
});

test("serialize path-space：内容题材发送空格连接路径（官网实证契约）", async () => {
  const schema = makeSchema();
  const themes = await loadFixture("content-theme-list.json");
  // raw 节点自带空格 path
  assert.deepEqual(
    schema.serialize({
      payloadField: "contentThemeLabel",
      value: [themes.data[0].children[0], themes.data[1]],
    }),
    ["汽车特色 沉浸式开车", "美妆教程"],
  );
  // 规范化节点 fullPath 以 " > " 连接，统一转换为空格
  const nodes = schema.normalizeOptionTree({
    rawNodes: themes.data,
    payloadField: "contentThemeLabel",
    provider: "kolTagsV2",
  });
  assert.deepEqual(
    schema.serialize({ payloadField: "contentThemeLabel", value: [nodes[0].children[0]] }),
    ["汽车特色 沉浸式开车"],
  );
});

test("serialize top20-transform 锁定官网转换规则", async () => {
  const schema = makeSchema();
  const top20 = await loadFixture("top20-options.json");
  assert.deepEqual(schema.serialize({ payloadField: "top20CrowdsLabel", value: top20 }), [
    "18-24岁 18-24岁-女性",
    "25-29岁",
    "30-39岁 30-39岁-女性",
    "40-49岁",
    "50岁以上 50岁以上-女性",
  ]);
  assert.deepEqual(
    schema.serialize({ payloadField: "top20CrowdsLabel", value: ["18-24岁 女性"] }),
    ["18-24岁 18-24岁-女性"],
  );

  // 两层树叶子节点（真实形态）：fullPath 空格化后套官网变换。
  // 官网实证（G5）：选择 自在户外 > 挑战极限者 → ["自在户外 自在户外-挑战极限者"]。
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const nodes = schema.normalizeOptionTree({
    rawNodes: cfg.data.audience20,
    payloadField: "top20CrowdsLabel",
    provider: "kolTagsV2",
  });
  const leaf = nodes[0].children[0];
  assert.equal(leaf.fullPath, "自在户外 > 挑战极限者");
  assert.deepEqual(
    schema.serialize({ payloadField: "top20CrowdsLabel", value: [leaf] }),
    ["自在户外 自在户外-挑战极限者"],
  );
  // 多选叶子不丢失、顺序保持；顶层叶子（无 children）原样通过。
  assert.deepEqual(
    schema.serialize({
      payloadField: "top20CrowdsLabel",
      value: [nodes[0].children[0], nodes[1].children[0], nodes[2]],
    }),
    ["自在户外 自在户外-挑战极限者", "时尚穿搭 时尚穿搭-潮流先锋", "25-29岁"],
  );
  // 官网变换按空格分词：叶子 label 若已带父前缀（"自在户外-挑战极限者"），
  // 全路径为 "自在户外 自在户外-挑战极限者"，变换结果与之相同（两段形式）；
  // 真实 audience20 叶子为纯名（G5 实证推导），此断言锁定全路径两段形态本身。
  assert.deepEqual(
    schema.serialize({
      payloadField: "top20CrowdsLabel",
      value: [{ label: "挑战极限者", fullPath: "自在户外 挑战极限者", value: "10101" }],
    }),
    ["自在户外 自在户外-挑战极限者"],
  );
  // 父节点（含 children）不得作为最终 Payload 值。
  assert.throws(
    () => schema.serialize({ payloadField: "top20CrowdsLabel", value: [nodes[0]] }),
    (err) => err instanceof PgySchemaError && err.kind === "serializer",
  );
});

test("serialize 未注册字段抛 PgySchemaError kind=unknown-field", () => {
  const schema = makeSchema();
  assert.throws(
    () => schema.serialize({ payloadField: "notAField", value: 1 }),
    (err) => err instanceof PgySchemaError && err.kind === "unknown-field",
  );
});

test("validateConfigStructure：合法 fixture 通过，malformed/非对象/错误 code 失败", async () => {
  const schema = makeSchema();

  const okConfig = await loadFixture("kol-tags-v2-config.json");
  assert.deepEqual(schema.validateConfigStructure(okConfig, "kolTagsV2"), { ok: true, errors: [] });

  const malformed = await loadFixture("malformed-config.json");
  const bad = schema.validateConfigStructure(malformed, "kolTagsV2");
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
  assert.ok(bad.errors.some((e) => e.includes("automotiveIndustryTag")));

  assert.equal(schema.validateConfigStructure("not-an-object", "kolTagsV2").ok, false);
  assert.equal(schema.validateConfigStructure(null, "kolTagsV2").ok, false);
  assert.equal(schema.validateConfigStructure([], "kolTagsV2").ok, false);
  assert.equal(
    schema.validateConfigStructure({ code: 1, data: { automotiveIndustryTag: [] } }, "kolTagsV2").ok,
    false,
  );
  assert.equal(schema.validateConfigStructure({ code: 0 }, "kolTagsV2").ok, false);

  const consume = await loadFixture("consumer-behavior-tree.json");
  assert.deepEqual(schema.validateConfigStructure(consume, "consumeBehavior"), { ok: true, errors: [] });

  const areas = await loadFixture("areas-tree.json");
  assert.deepEqual(schema.validateConfigStructure(areas, "areas"), { ok: true, errors: [] });

  assert.equal(
    schema.validateConfigStructure({ code: 0, data: { automotiveIndustryTag: [null] } }, "kolTagsV2").ok,
    false,
  );
});

test("loadOptions：live 成功 → source=live + 规范化节点 + LKG 已保存", async (t) => {
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const calls = [];
  const request = makeRequest((options) => {
    calls.push(options);
    return cfg;
  });
  const baseDir = await tmpDir(t);
  const lkgStore = createJsonLkgStore({ baseDir });
  const schema = new PgyFilterSchema({ request, lkgStore });

  const result = await schema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" });
  assert.equal(result.source, "live");
  assert.equal(result.version, SCHEMA_VERSION);
  assert.equal(result.warning, undefined);
  assert.ok(Array.isArray(result.nodes));
  assert.equal(result.nodes[0].payloadField, "industrySpecificCrowdsMotorDom");
  assert.ok(collectNodes(result.nodes).some((n) => n.value === "19188199"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.ok(calls[0].url.endsWith(PROVIDER_ENDPOINTS.kolTagsV2));
  assert.ok(calls[0].url.startsWith("https://"));

  const snapshot = await lkgStore.load("kolTagsV2.automotiveIndustryTag");
  assert.ok(snapshot);
  assert.equal(snapshot.version, SCHEMA_VERSION);
  assert.equal(snapshot.provider, "kolTagsV2.automotiveIndustryTag");
  assert.ok(Array.isArray(snapshot.nodes));
});

test("loadOptions：consumeBehavior / areas live 成功并带正确 payloadField", async (t) => {
  const consume = await loadFixture("consumer-behavior-tree.json");
  const areas = await loadFixture("areas-tree.json");
  const baseDir = await tmpDir(t);
  const lkgStore = createJsonLkgStore({ baseDir });

  const consumeSchema = new PgyFilterSchema({ request: makeRequest(() => consume), lkgStore });
  const consumeResult = await consumeSchema.loadOptions({ provider: "consumeBehavior" });
  assert.equal(consumeResult.source, "live");
  assert.ok(consumeResult.nodes.length > 0);
  assert.equal(consumeResult.nodes[0].payloadField, "kolInfoConsumBehaviorLabel");

  const areasSchema = new PgyFilterSchema({ request: makeRequest(() => areas), lkgStore });
  const areasResult = await areasSchema.loadOptions({ provider: "areas" });
  assert.equal(areasResult.source, "live");
  assert.equal(areasResult.nodes[0].value, "中国");
  assert.equal(areasResult.nodes[0].fullPath, "中国");
  assert.equal(areasResult.nodes[0].children[0].fullPath, "中国 > 广东");
});

test("loadOptions：request 抛错 + LKG 快照 → source=lkg + warning", async (t) => {
  const baseDir = await tmpDir(t);
  const lkgStore = createJsonLkgStore({ baseDir });
  await lkgStore.save("kolTagsV2.automotiveIndustryTag", {
    version: SCHEMA_VERSION,
    provider: "kolTagsV2.automotiveIndustryTag",
    savedAt: "2026-08-04T00:00:00.000Z",
    nodes: [{ payloadField: "industrySpecificCrowdsMotorDom", value: "1001", label: "日化家清", fullPath: "日化家清", children: [], disabled: false, uniqueKey: "industrySpecificCrowdsMotorDom:1001:日化家清" }],
  });

  const failing = makeRequest(() => {
    throw new Error("network down");
  });
  const schema = new PgyFilterSchema({ request: failing, lkgStore });
  const result = await schema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" });
  assert.equal(result.source, "lkg");
  assert.equal(result.version, SCHEMA_VERSION);
  assert.equal(result.nodes.length, 1);
  assert.ok(typeof result.warning === "string" && result.warning.length > 0);
});

test("loadOptions：request 抛错且无 LKG → throw kind=provider", async (t) => {
  const baseDir = await tmpDir(t);
  const emptyStore = createJsonLkgStore({ baseDir });
  const failing = makeRequest(() => {
    throw new Error("network down");
  });
  const schema = new PgyFilterSchema({ request: failing, lkgStore: emptyStore });
  await assert.rejects(
    schema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" }),
    (err) => err instanceof PgySchemaError && err.kind === "provider",
  );
});

test("loadOptions：malformed 结构 + LKG 快照 → source=lkg；malformed 且无 LKG → unknown-structure", async (t) => {
  const malformed = await loadFixture("malformed-config.json");
  const malformedRequest = makeRequest(() => malformed);

  const withLkgDir = await tmpDir(t);
  const lkgStore = createJsonLkgStore({ baseDir: withLkgDir });
  await lkgStore.save("kolTagsV2.automotiveIndustryTag", {
    version: SCHEMA_VERSION,
    provider: "kolTagsV2.automotiveIndustryTag",
    savedAt: "2026-08-04T00:00:00.000Z",
    nodes: [{ payloadField: "industrySpecificCrowdsMotorDom", value: "1001", label: "日化家清", fullPath: "日化家清", children: [], disabled: false, uniqueKey: "industrySpecificCrowdsMotorDom:1001:日化家清" }],
  });
  const withLkg = new PgyFilterSchema({ request: malformedRequest, lkgStore });
  const lkgResult = await withLkg.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" });
  assert.equal(lkgResult.source, "lkg");
  assert.ok(lkgResult.warning);

  const noLkgDir = await tmpDir(t);
  const emptyStore = createJsonLkgStore({ baseDir: noLkgDir });
  const noLkg = new PgyFilterSchema({ request: malformedRequest, lkgStore: emptyStore });
  await assert.rejects(
    noLkg.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" }),
    (err) => err instanceof PgySchemaError && err.kind === "unknown-structure",
  );
});

test("loadOptions：手写合法 LKG fixture 文件可直接回退", async (t) => {
  const fixtureSnapshot = await loadFixture("lkg-snapshot-kolTagsV2.json");
  const baseDir = await tmpDir(t);
  await fs.writeFile(
    path.join(baseDir, "lkg-kolTagsV2.automotiveIndustryTag.json"),
    JSON.stringify(fixtureSnapshot, null, 2),
    "utf8",
  );
  const lkgStore = createJsonLkgStore({ baseDir });
  const failing = makeRequest(() => {
    throw new Error("network down");
  });
  const schema = new PgyFilterSchema({ request: failing, lkgStore });
  const result = await schema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" });
  assert.equal(result.source, "lkg");
  assert.deepEqual(result.nodes, fixtureSnapshot.nodes);
});

test("loadOptions：未知 provider → not-implemented；未知 section → 明确失败", async () => {
  const schema = makeSchema();
  await assert.rejects(
    schema.loadOptions({ provider: "brandSearch" }),
    (err) => err instanceof PgySchemaError && err.kind === "not-implemented",
  );
  await assert.rejects(
    schema.loadOptions({ provider: "kolTagsV2", section: "bogus" }),
    (err) => err instanceof PgySchemaError,
  );
});

test("createJsonLkgStore：save→load 往返、缺失/损坏返回 null、remove、目录自动创建", async (t) => {
  const baseDir = path.join(await tmpDir(t), "nested", "deeper");
  const store = createJsonLkgStore({ baseDir });

  const snapshot = {
    version: SCHEMA_VERSION,
    provider: "areas",
    savedAt: "2026-08-04T00:00:00.000Z",
    nodes: [{ value: "中国", label: "中国" }],
  };
  await store.save("areas", snapshot);
  assert.deepEqual(await store.load("areas"), snapshot);

  // 缺失文件
  assert.equal(await store.load("never-saved"), null);

  // 损坏文件
  await fs.writeFile(path.join(baseDir, "lkg-kolTagsV2.json"), "{ this is not json", "utf8");
  assert.equal(await store.load("kolTagsV2"), null);

  // 结构不符（版本/提供方/节点形状不对）
  await fs.writeFile(
    path.join(baseDir, "lkg-consumeBehavior.json"),
    JSON.stringify({ version: "wrong", provider: "consumeBehavior", nodes: [] }),
    "utf8",
  );
  assert.equal(await store.load("consumeBehavior"), null);

  await store.remove("areas");
  assert.equal(await store.load("areas"), null);
});

test("FIELD_REGISTRY：包含全部必需字段且语义正确", () => {
  const requiredFields = [
    "marketTarget",
    "audienceGroup",
    "personalTags",
    "gender",
    "location",
    "signed",
    "featureTags",
    "fansNumberLower",
    "fansNumberUpper",
    "fansAge",
    "fansGender",
    "fansLocation",
    "fansMaritalStatus",
    "fansConsumptionLevel",
    "fansChildAgeInfo",
    "fansDevicePrice",
    "fansDeviceBrand",
    "accumCommonImpMedinNum30d",
    "readMidNor30",
    "interMidNor30",
    "thousandLikePercent30",
    "noteType",
    "notePriceLower",
    "notePriceUpper",
    "videoPriceLower",
    "videoPriceUpper",
    "progressOrderCnt",
    "tradeReportBrandIdSet",
    "activityCodes",
    "flagList",
    "filterList",
    "contentSceneLabel",
    "industrySpecificCrowdsMotorDom",
    "top20CrowdsLabel",
    "contentThemeLabel",
    "kolInfoConsumBehaviorLabel",
  ];
  const byName = new Map(FIELD_REGISTRY.map((field) => [field.payloadField, field]));
  assert.equal(FIELD_REGISTRY.length, requiredFields.length);
  for (const name of requiredFields) {
    assert.ok(byName.has(name), `缺少字段 ${name}`);
    const field = byName.get(name);
    assert.ok(typeof field.label === "string" && field.label.length > 0, `${name}.label`);
    assert.ok(field.controlType, `${name}.controlType`);
    assert.ok(field.serializer, `${name}.serializer`);
    assert.ok(Object.hasOwn(field, "defaultValue"), `${name}.defaultValue`);
  }

  // 多值字段 exclusive === false
  const multiFields = [
    "audienceGroup",
    "personalTags",
    "featureTags",
    "fansChildAgeInfo",
    "fansDevicePrice",
    "fansDeviceBrand",
    "accumCommonImpMedinNum30d",
    "readMidNor30",
    "interMidNor30",
    "thousandLikePercent30",
    "progressOrderCnt",
    "tradeReportBrandIdSet",
    "activityCodes",
    "flagList",
    "filterList",
    "contentSceneLabel",
    "industrySpecificCrowdsMotorDom",
    "top20CrowdsLabel",
    "contentThemeLabel",
    "kolInfoConsumBehaviorLabel",
  ];
  for (const name of multiFields) {
    assert.equal(byName.get(name).multiSelect, "multi", name);
    assert.equal(byName.get(name).exclusive, false, name);
  }

  // 报价字段：lossy + exclusive false
  for (const name of ["notePriceLower", "notePriceUpper", "videoPriceLower", "videoPriceUpper"]) {
    const field = byName.get(name);
    assert.equal(field.controlType, "range", name);
    assert.equal(field.multiSelect, "single", name);
    assert.equal(field.exclusive, false, name);
    assert.equal(field.serializer, "passthrough", name);
    assert.equal(field.defaultValue, -1, name);
    assert.equal(field.reason, "lossy", name);
  }

  // 数值范围是已证明可切分的互斥维度
  assert.equal(byName.get("fansNumberLower").exclusive, true);
  assert.equal(byName.get("fansNumberUpper").exclusive, true);

  // 枚举尚未证明覆盖
  assert.equal(byName.get("gender").exclusive, "unproven");
  assert.equal(byName.get("marketTarget").exclusive, "unproven");
  assert.equal(byName.get("noteType").exclusive, "unproven");

  // 地域候选维度
  assert.equal(byName.get("location").exclusive, "candidate");
  assert.equal(byName.get("fansLocation").exclusive, "candidate");
  assert.deepEqual(byName.get("location").optionProvider, { provider: "areas" });
  assert.deepEqual(byName.get("fansLocation").optionProvider, { provider: "areas" });

  // optionProvider 指向
  assert.deepEqual(byName.get("industrySpecificCrowdsMotorDom").optionProvider, {
    provider: "kolTagsV2",
    section: "automotiveIndustryTag",
  });
  assert.deepEqual(byName.get("contentThemeLabel").optionProvider, {
    provider: "kolTagsV2",
    section: "contentTheme",
  });
  assert.deepEqual(byName.get("top20CrowdsLabel").optionProvider, {
    provider: "kolTagsV2",
    section: "audience20",
  });
  assert.deepEqual(byName.get("kolInfoConsumBehaviorLabel").optionProvider, {
    provider: "consumeBehavior",
  });

  // 默认值抽查
  assert.equal(byName.get("marketTarget").defaultValue, null);
  assert.equal(byName.get("signed").defaultValue, -1);
  assert.equal(byName.get("fansAge").defaultValue, 0);
  assert.deepEqual(byName.get("personalTags").defaultValue, []);
  assert.deepEqual(byName.get("industrySpecificCrowdsMotorDom").defaultValue, []);
});

test("PgyFilterSchema.getField 返回注册表项或 undefined", () => {
  const schema = makeSchema();
  assert.equal(schema.getField("gender").payloadField, "gender");
  assert.equal(schema.getField("nope"), undefined);
});

test("PgySchemaError 构造时兜底脱敏错误消息", () => {
  const err = new PgySchemaError("Cookie=super-secret-schema-1", { kind: "provider" });
  assert.ok(!err.message.includes("super-secret-schema-1"));
  assert.equal(err.kind, "provider");
});

test("地域 loadOptions：线上无 path 时按 fullPath 派生空格 path（官网契约 中国 广东 广州）", async () => {
  const fixture = await loadFixture("areas-tree.json");
  const schema = makeSchema(makeRequest(() => fixture));
  const { source, nodes } = await schema.loadOptions({ provider: "areas" });
  assert.equal(source, "live");
  const guangdong = collectNodes(nodes).find((node) => node.label === "广东");
  assert.ok(guangdong, "广东 节点必须存在");
  assert.equal(guangdong.path, "中国 广东", "线上无 path 时按 fullPath 派生空格 path");
  assert.equal(
    schema.serialize({ payloadField: "location", value: guangdong }),
    "中国 广东",
    "path-trim 必须对派生空格 path 生效",
  );
  const guangzhou = collectNodes(nodes).find((node) => node.label === "广州");
  assert.ok(guangzhou, "广州 节点必须存在");
  assert.equal(
    schema.serialize({ payloadField: "location", value: guangzhou }),
    "中国 广东 广州",
    "G3 官网契约：地域发送 中国 广东 广州",
  );
});

test("消费行为 loadOptions：线上无 path 时按 fullPath 派生空格 path（官网契约 G9）", async () => {
  const fixture = await loadFixture("consumer-behavior-tree.json");
  const schema = makeSchema(makeRequest(() => fixture));
  const { source, nodes } = await schema.loadOptions({ provider: "consumeBehavior" });
  assert.equal(source, "live");
  assert.equal(nodes[0].payloadField, "kolInfoConsumBehaviorLabel");
  const leaf = collectNodes(nodes).find((node) => node.label === "保时捷911");
  assert.ok(leaf, "保时捷911 叶子必须存在");
  assert.equal(
    schema.serialize({ payloadField: "kolInfoConsumBehaviorLabel", value: leaf }),
    "内容行为预估 汽车 预估车主作者 Porsche 保时捷911",
    "G9 官网契约：消费行为发送空格连接全路径",
  );
});

test("audience20 配置链路：loadOptions -> top20CrowdsLabel -> top20-transform（两层树叶子）", async () => {
  const fixture = await loadFixture("kol-tags-v2-config.json");
  const schema = makeSchema(makeRequest(() => fixture));
  const { source, nodes } = await schema.loadOptions({
    provider: "kolTagsV2",
    section: "audience20",
  });
  assert.equal(source, "live");
  assert.equal(nodes[0].payloadField, "top20CrowdsLabel");
  assert.ok(nodes[0].children.length > 0, "audience20 必须是两层树：父节点含叶子");
  assert.deepEqual(
    schema.serialize({ payloadField: "top20CrowdsLabel", value: [nodes[0].children[0]] }),
    ["自在户外 自在户外-挑战极限者"],
    "top20-transform 必须消费两层树叶子 fullPath 并应用官网变换",
  );
  assert.throws(
    () => schema.serialize({ payloadField: "top20CrowdsLabel", value: nodes }),
    (err) => err instanceof PgySchemaError && err.kind === "serializer",
    "父节点整体不得进入 Payload",
  );
});

test("audience20 真实形态两层树：140 节点/121 叶子可遍历、多选不丢失", async () => {
  const fixture = await loadFixture("audience20-tree.json");
  const schema = makeSchema(makeRequest(() => fixture));
  const { source, nodes } = await schema.loadOptions({
    provider: "kolTagsV2",
    section: "audience20",
  });
  assert.equal(source, "live");
  const all = collectNodes(nodes);
  assert.equal(all.length, 140, "audience20 共 140 节点");
  const leaves = all.filter((n) => !(Array.isArray(n.children) && n.children.length > 0));
  assert.equal(leaves.length, 121, "audience20 共 121 叶子");
  assert.ok(
    all.every(
      (n) =>
        !(Array.isArray(n.children) && n.children.length > 0) ||
        n.children.every((c) => !(Array.isArray(c.children) && c.children.length > 0)),
    ),
    "最大深度 2：父节点只含叶子，无孙节点",
  );

  const tiaozhan = all.find((n) => n.fullPath === "自在户外 > 挑战极限者");
  assert.ok(tiaozhan, "证据用例 自在户外 > 挑战极限者 必须存在");

  // 同时选择多个叶子：不丢失、顺序保持。
  const picked = [tiaozhan, leaves[10], leaves[50], leaves[120]];
  const out = schema.serialize({ payloadField: "top20CrowdsLabel", value: picked });
  assert.equal(out.length, 4);
  assert.equal(out[0], "自在户外 自在户外-挑战极限者");

  // 父节点不会错误进入 Payload。
  const zizai = all.find((n) => n.label === "自在户外");
  assert.ok(zizai);
  assert.throws(
    () => schema.serialize({ payloadField: "top20CrowdsLabel", value: [zizai] }),
    (err) => err instanceof PgySchemaError && err.kind === "serializer",
  );
});

test("audience20 live/LKG 两种来源序列化一致", async () => {
  const fixture = await loadFixture("audience20-tree.json");
  let saved = null;
  const lkgStore = {
    load: async () => saved,
    save: async (_key, snapshot) => {
      saved = snapshot;
    },
  };
  const liveSchema = new PgyFilterSchema({ request: makeRequest(() => fixture), lkgStore });
  const live = await liveSchema.loadOptions({ provider: "kolTagsV2", section: "audience20" });
  assert.equal(live.source, "live");
  assert.ok(saved, "live 加载必须写入 LKG 快照");

  const failingSchema = new PgyFilterSchema({
    request: makeRequest(() => {
      throw new Error("network down");
    }),
    lkgStore,
  });
  const lkg = await failingSchema.loadOptions({ provider: "kolTagsV2", section: "audience20" });
  assert.equal(lkg.source, "lkg");
  assert.deepEqual(lkg.nodes, live.nodes, "LKG 回退节点必须与 live 完全一致");

  const leafOf = (nodes) => nodes[0].children[0];
  const serializeLeaf = (schema, nodes) =>
    schema.serialize({ payloadField: "top20CrowdsLabel", value: [leafOf(nodes)] });
  assert.deepEqual(
    serializeLeaf(liveSchema, live.nodes),
    serializeLeaf(failingSchema, lkg.nodes),
    "live 与 LKG 来源的叶子序列化结果必须一致",
  );
});

test("LKG 快照保存失败只降级为不保存，线上结果仍返回", async () => {
  const fixture = await loadFixture("kol-tags-v2-config.json");
  const schema = new PgyFilterSchema({
    request: makeRequest(() => fixture),
    lkgStore: {
      load: async () => null,
      save: async () => {
        throw new Error("disk full");
      },
    },
  });
  const result = await schema.loadOptions({
    provider: "kolTagsV2",
    section: "contentTheme",
  });
  assert.equal(result.source, "live");
  assert.match(result.warning, /LKG 快照保存失败/);
  assert.ok(result.nodes.length > 0);
});

test("LKG 快照保存失败 warning 脱敏（不含本地路径/敏感值）", async () => {
  const fixture = await loadFixture("kol-tags-v2-config.json");
  const schema = new PgyFilterSchema({
    request: makeRequest(() => fixture),
    lkgStore: {
      load: async () => null,
      save: async () => {
        throw new Error("EACCES: permission denied, open 'C:\\Users\\someone\\AppData\\pgy-kol-schema\\lkg.json'");
      },
    },
  });
  const result = await schema.loadOptions({
    provider: "kolTagsV2",
    section: "contentTheme",
  });
  assert.equal(result.source, "live");
  assert.match(result.warning, /LKG 快照保存失败/);
  // 错误消息中的路径不是敏感键值，redactText 对普通文本原样保留；此处断言 warning 不含
  // 伪造的敏感键值形态（防止未来错误消息携带 Cookie/token 时泄漏）。
  assert.ok(!result.warning.includes("token="), "warning 不得包含 token 键值");
});

test("loadOptions：kolTagsV2 各 section 独立 LKG 快照，回退不串树", async (t) => {
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const baseDir = await tmpDir(t);
  const lkgStore = createJsonLkgStore({ baseDir });

  // 先 live 加载 automotive 与 audience20，各自保存独立快照。
  const liveSchema = new PgyFilterSchema({ request: makeRequest(() => cfg), lkgStore });
  const auto = await liveSchema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" });
  assert.equal(auto.source, "live");
  const aud = await liveSchema.loadOptions({ provider: "kolTagsV2", section: "audience20" });
  assert.equal(aud.source, "live");

  // contentTheme 从未加载：断网回退时不得拿到其它 section 的树。
  const failing = makeRequest(() => {
    throw new Error("network down");
  });
  const failingSchema = new PgyFilterSchema({ request: failing, lkgStore });
  await assert.rejects(
    failingSchema.loadOptions({ provider: "kolTagsV2", section: "contentTheme" }),
    (err) => err instanceof PgySchemaError && err.kind === "provider",
  );

  // automotive 断网回退必须返回 automotive 的树（payloadField 正确、含 19188199）。
  const autoFallback = await failingSchema.loadOptions({
    provider: "kolTagsV2",
    section: "automotiveIndustryTag",
  });
  assert.equal(autoFallback.source, "lkg");
  assert.equal(autoFallback.nodes[0].payloadField, "industrySpecificCrowdsMotorDom");
  assert.ok(collectNodes(autoFallback.nodes).some((n) => n.value === "19188199"));

  // audience20 断网回退必须返回 audience20 的树（payloadField top20CrowdsLabel）。
  const audFallback = await failingSchema.loadOptions({
    provider: "kolTagsV2",
    section: "audience20",
  });
  assert.equal(audFallback.source, "lkg");
  assert.equal(audFallback.nodes[0].payloadField, "top20CrowdsLabel");
});

test("normalizeOptionTree：value 为空时 uniqueKey 用同级序号消歧，不塌缩", () => {
  const schema = makeSchema();
  const nodes = schema.normalizeOptionTree({
    rawNodes: [{ value: "", label: "甲" }, { value: "", label: "乙" }, { label: "丙", value: "v1" }],
    payloadField: "demo",
    provider: "test",
  });
  assert.equal(nodes[0].value, "");
  assert.equal(nodes[1].value, "");
  assert.notEqual(nodes[0].uniqueKey, nodes[1].uniqueKey, "空 value 节点必须可区分");
  assert.equal(nodes[0].fullPath, "甲");
  assert.equal(nodes[1].fullPath, "乙");
  assert.match(nodes[0].uniqueKey, /^demo:<empty>#0:甲$/);
  assert.match(nodes[1].uniqueKey, /^demo:<empty>#1:乙$/);
  assert.equal(nodes[2].uniqueKey, "demo:v1:丙");
});

test("loadOptions：登录失效/风控错误不回退 last-known-good", async () => {
  const fixture = await loadFixture("kol-tags-v2-config.json");
  const lkgStore = {
    load: async () => ({
      version: SCHEMA_VERSION,
      provider: "kolTagsV2",
      savedAt: "2026-01-01T00:00:00.000Z",
      nodes: [],
    }),
    save: async () => {},
  };
  for (const kind of ["auth-expired", "risk-control"]) {
    const schema = new PgyFilterSchema({
      request: makeRequest(() => {
        const err = new Error("session gone");
        err.kind = kind;
        throw err;
      }),
      lkgStore,
    });
    await assert.rejects(
      schema.loadOptions({ provider: "kolTagsV2", section: "automotiveIndustryTag" }),
      (err) => err instanceof PgySchemaError && err.kind === "provider" && /不回退/.test(err.message),
    );
  }
  // 普通网络错误仍按原契约回退 LKG。
  const networkSchema = new PgyFilterSchema({
    request: makeRequest(() => {
      throw new Error("network down");
    }),
    lkgStore,
  });
  const fallback = await networkSchema.loadOptions({
    provider: "kolTagsV2",
    section: "automotiveIndustryTag",
  });
  assert.equal(fallback.source, "lkg");
});
