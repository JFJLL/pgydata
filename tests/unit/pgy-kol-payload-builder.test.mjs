import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIELD_REGISTRY,
  PgyFilterSchema,
  PgySchemaError,
} from "../../app-source/pgy-kol/pgy-filter-schema.mjs";
import {
  BASE_PAYLOAD,
  DEFAULT_PAGE_SIZE,
  PgyPayloadError,
  PgyPayloadBuilder,
} from "../../app-source/pgy-kol/pgy-payload-builder.mjs";

const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/pgy-kol", import.meta.url));

async function loadFixture(name) {
  return JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, name), "utf8"));
}

function makeSchema() {
  const request = {
    async requestJson() {
      return { code: 0, data: {} };
    },
  };
  return new PgyFilterSchema({ request });
}

function makeBuilder({ schema, trackIdFactory } = {}) {
  return new PgyPayloadBuilder({ schema: schema ?? makeSchema(), trackIdFactory });
}

test("空 filterState → 基础 payload，无 brandUserId", () => {
  const builder = makeBuilder();
  const out = builder.build({}, { trackId: "track-1" });
  assert.deepEqual(out, {
    ...BASE_PAYLOAD,
    pageNum: 1,
    pageSize: 20,
    trackId: "track-1",
  });
  assert.ok(!("brandUserId" in out));
  assert.equal(Object.isFrozen(BASE_PAYLOAD), true);
  assert.equal(DEFAULT_PAGE_SIZE, 20);
});

test("trackId 默认由工厂生成；显式传入优先；pageNum/pageSize 透传", () => {
  let calls = 0;
  const builder = makeBuilder({ trackIdFactory: () => `tid-${++calls}` });
  assert.equal(builder.build({}).trackId, "tid-1");
  assert.equal(builder.build({}).trackId, "tid-2");
  assert.equal(builder.build({}, { trackId: "fixed" }).trackId, "fixed");

  const out = builder.build({}, { pageNum: 3, pageSize: 50, trackId: "p3" });
  assert.equal(out.pageNum, 3);
  assert.equal(out.pageSize, 50);
});

test("空字符串 trackId 视为未提供，由工厂生成非空值", () => {
  const builder = makeBuilder({ trackIdFactory: () => "factory-id-001" });
  const payload = builder.build({}, { trackId: "" });
  assert.equal(payload.trackId, "factory-id-001");
});

test("pageNum/pageSize 边界：null/undefined 用默认；0/负数/小数/NaN/字符串抛 invalid-state；pageSize 上限 100", () => {
  const builder = makeBuilder();

  assert.equal(builder.build({}, { pageNum: null, pageSize: null, trackId: "t" }).pageNum, 1);
  assert.equal(builder.build({}, { pageNum: null, pageSize: null, trackId: "t" }).pageSize, 20);
  assert.equal(builder.build({}, { pageNum: undefined, pageSize: undefined, trackId: "t" }).pageNum, 1);
  assert.equal(builder.build({}, { trackId: "t" }).pageSize, 20);

  for (const bad of [0, -1, 1.5, Number.NaN, "5"]) {
    assert.throws(
      () => builder.build({}, { pageNum: bad, trackId: "t" }),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
      `pageNum=${String(bad)} 必须抛 invalid-state`,
    );
    assert.throws(
      () => builder.build({}, { pageSize: bad, trackId: "t" }),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
      `pageSize=${String(bad)} 必须抛 invalid-state`,
    );
  }

  assert.throws(
    () => builder.build({}, { pageSize: 500, trackId: "t" }),
    (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
    "pageSize=500 必须因超上限抛 invalid-state",
  );
  assert.equal(builder.build({}, { pageSize: 100, trackId: "t" }).pageSize, 100);
  assert.equal(builder.build({}, { pageNum: 250, pageSize: 20, trackId: "t" }).pageNum, 250);
});

test("brandUserId：仅显式非空字符串才写入", () => {
  const builder = makeBuilder();
  const withBrand = builder.build({ brandUserId: "brand_1001" }, { trackId: "t" });
  assert.equal(withBrand.brandUserId, "brand_1001");

  assert.ok(!("brandUserId" in builder.build({}, { trackId: "t" })));
  assert.ok(!("brandUserId" in builder.build({ brandUserId: "" }, { trackId: "t" })));
  assert.ok(!("brandUserId" in builder.build({ brandUserId: 12345 }, { trackId: "t" })));
  assert.ok(!("brandUserId" in builder.build({ brandUserId: null }, { trackId: "t" })));
});

test("brandUserId：纯空白字符串与普通字段口径一致，不写入", () => {
  const builder = makeBuilder();
  const out = builder.build({ brandUserId: "   " }, { trackId: "t" });
  assert.ok(!("brandUserId" in out), "纯空白 brandUserId 不得写入");
});

test("brandUserId：写入前 trim 首尾空白，保留中间内容", () => {
  const builder = makeBuilder();
  const out = builder.build({ brandUserId: "  brand_1001  " }, { trackId: "t" });
  assert.equal(out.brandUserId, "brand_1001", "brandUserId 必须以 trim 后的值写入");
});

test("地域字段 path-trim；行业特色画像展开叶子（含 19188199）；消费行为 path||label；top20 官网变换；题材空格路径", async () => {
  const builder = makeBuilder();
  const areas = await loadFixture("areas-tree.json");
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const consume = await loadFixture("consumer-behavior-tree.json");
  const top20 = await loadFixture("top20-options.json");
  const themes = await loadFixture("content-theme-list.json");

  // 线上真实形状（2026-08-05 实证）：areas=data.list、consumeBehavior=data.consumeBehaviorTag，
  // 节点无独立 path；先规范化派生空格 path 再交给 builder。
  const schema0 = makeSchema();
  const areasNodes = schema0.deriveSpacePaths(
    schema0.normalizeOptionTree({
      rawNodes: areas.data.list,
      payloadField: "location",
      provider: "areas",
      valueKey: "name",
      labelKey: "name",
    }),
  );
  const guangdong = areasNodes[0].children[0];
  const zhejiang = areasNodes[0].children[1];

  const locationOut = builder.build({ location: guangdong }, { trackId: "t" });
  assert.equal(locationOut.location, "中国 广东");

  const fansLocationOut = builder.build({ fansLocation: [guangdong, zhejiang] }, { trackId: "t" });
  assert.deepEqual(fansLocationOut.fansLocation, ["中国 广东", "中国 浙江"]);

  const rawScene = cfg.data.automotiveIndustryTag[0].children[0].children[0];
  const crowdOut = builder.build({ industrySpecificCrowdsMotorDom: [rawScene] }, { trackId: "t" });
  assert.ok(crowdOut.industrySpecificCrowdsMotorDom.includes(19188199));

  // 规范化节点展开为字符串叶子
  const schema = makeSchema();
  const normalized = schema.normalizeOptionTree({
    rawNodes: cfg.data.automotiveIndustryTag,
    payloadField: "industrySpecificCrowdsMotorDom",
    provider: "kolTagsV2",
  });
  const scene = normalized[0].children[0].children[0];
  const normalizedOut = builder.build({ industrySpecificCrowdsMotorDom: [scene] }, { trackId: "t" });
  assert.deepEqual(normalizedOut.industrySpecificCrowdsMotorDom, ["19188199"]);

  const consumeNodes = schema0.deriveSpacePaths(
    schema0.normalizeOptionTree({
      rawNodes: consume.data.consumeBehaviorTag,
      payloadField: "kolInfoConsumBehaviorLabel",
      provider: "consumeBehavior",
    }),
  );
  // 真实树：美妆个护 > 护肤 > 洁面；选择叶子 洁面（path=空格连接全路径）。
  const consumeOut = builder.build(
    { kolInfoConsumBehaviorLabel: [consumeNodes[2].children[0].children[0], consumeNodes[3]] },
    { trackId: "t" },
  );
  assert.deepEqual(consumeOut.kolInfoConsumBehaviorLabel, [
    "美妆个护 护肤 洁面",
    "只有标签的消费行为",
  ]);

  const top20Out = builder.build({ top20CrowdsLabel: top20 }, { trackId: "t" });
  assert.deepEqual(top20Out.top20CrowdsLabel, [
    "18-24岁 18-24岁-女性",
    "25-29岁",
    "30-39岁 30-39岁-女性",
    "40-49岁",
    "50岁以上 50岁以上-女性",
  ]);

  // 两层树叶子节点（真实形态）：fullPath 空格化 + 官网变换（G5 实证）。
  const audNodes = makeSchema().normalizeOptionTree({
    rawNodes: cfg.data.audience20,
    payloadField: "top20CrowdsLabel",
    provider: "kolTagsV2",
  });
  const leafOut = builder.build(
    { top20CrowdsLabel: [audNodes[0].children[0]] },
    { trackId: "t" },
  );
  assert.deepEqual(leafOut.top20CrowdsLabel, ["自在户外 自在户外-挑战极限者"]);
  const multiLeafOut = builder.build(
    { top20CrowdsLabel: [audNodes[0].children[0], audNodes[1].children[0], audNodes[2]] },
    { trackId: "t" },
  );
  assert.deepEqual(multiLeafOut.top20CrowdsLabel, [
    "自在户外 自在户外-挑战极限者",
    "时尚穿搭 时尚穿搭-潮流先锋",
    "25-29岁",
  ]);
  // 父节点（含 children）不得作为最终 Payload 值，builder 必须显式失败。
  assert.throws(
    () => builder.build({ top20CrowdsLabel: [audNodes[0]] }, { trackId: "t" }),
    (err) => err instanceof PgySchemaError && err.kind === "serializer",
  );

  // 官网契约（真实会话实证）：contentThemeLabel 发送空格连接路径，如 ["汽车特色 沉浸式开车"]。
  const themeOut = builder.build(
    { contentThemeLabel: [themes.data[0].children[0], themes.data[1]] },
    { trackId: "t" },
  );
  assert.deepEqual(themeOut.contentThemeLabel, ["汽车特色 沉浸式开车", "美妆教程"]);

  // 规范化节点（fullPath 以 " > " 连接）同样转换为空格路径。
  const themeNodes = schema.normalizeOptionTree({
    rawNodes: themes.data,
    payloadField: "contentThemeLabel",
    provider: "kolTagsV2",
  });
  const themeNormalizedOut = builder.build(
    { contentThemeLabel: [themeNodes[0].children[0], themeNodes[1]] },
    { trackId: "t" },
  );
  assert.deepEqual(themeNormalizedOut.contentThemeLabel, ["汽车特色 沉浸式开车", "美妆教程"]);
});

test("范围字段：只传 lower 只写 lower；都传则都写", () => {
  const builder = makeBuilder();
  const lowerOnly = builder.build({ fansNumberLower: 1000 }, { trackId: "t" });
  assert.equal(lowerOnly.fansNumberLower, 1000);
  assert.ok(!("fansNumberUpper" in lowerOnly));

  const both = builder.build({ fansNumberLower: 1000, fansNumberUpper: 5000 }, { trackId: "t" });
  assert.equal(both.fansNumberLower, 1000);
  assert.equal(both.fansNumberUpper, 5000);

  const priceOut = builder.build(
    { notePriceLower: 99, videoPriceUpper: 9999 },
    { trackId: "t" },
  );
  assert.equal(priceOut.notePriceLower, 99);
  assert.equal(priceOut.videoPriceUpper, 9999);
  assert.ok(!("notePriceUpper" in priceOut));
  assert.ok(!("videoPriceLower" in priceOut));
});

test("空值跳过：null/undefined/空串/空数组不写入", () => {
  const builder = makeBuilder();
  const out = builder.build(
    {
      gender: null,
      signed: undefined,
      location: "",
      personalTags: [],
      marketTarget: "有效值",
    },
    { trackId: "t" },
  );
  // BASE_PAYLOAD 携带官网默认字段：filterState 的空值不覆盖默认值。
  assert.equal(out.gender, null);
  assert.equal(out.signed, -1);
  assert.equal(out.location, null);
  assert.deepEqual(out.personalTags, []);
  assert.equal(out.marketTarget, "有效值");
});

test("纯空白字符串视为未提供，不写入 payload", () => {
  const builder = makeBuilder();
  const out = builder.build(
    { location: "   ", fansNumberLower: "  ", marketTarget: "有效值" },
    { trackId: "t" },
  );
  assert.equal(out.location, null, "纯空白 location 不得写入（保持默认 null）");
  assert.ok(!("fansNumberLower" in out), "纯空白 fansNumberLower 不得写入（官网默认 payload 无此字段）");
  assert.equal(out.marketTarget, "有效值");
});

test("未知字段 → PgyPayloadError kind=unknown-field", () => {
  const builder = makeBuilder();
  assert.throws(
    () => builder.build({ bogusField: 1 }, { trackId: "t" }),
    (err) => err instanceof PgyPayloadError && err.kind === "unknown-field",
  );
});

test("未知字段空值（null）同样报 unknown-field，不允许空值绕过", () => {
  const builder = makeBuilder();
  assert.throws(
    () => builder.build({ bogus: null }, { trackId: "t" }),
    (err) => err instanceof PgyPayloadError && err.kind === "unknown-field",
  );
});

test("filterState 非普通对象 → PgyPayloadError kind=invalid-state", () => {
  const builder = makeBuilder();
  for (const bad of [null, undefined, "str", 42, [1, 2]]) {
    assert.throws(
      () => builder.build(bad),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
    );
  }
});

test("确定性：相同输入 + 相同 trackId → 深相等且键序稳定", async () => {
  const builder = makeBuilder();
  const areas = await loadFixture("areas-tree.json");
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const top20 = await loadFixture("top20-options.json");
  const schema0 = makeSchema();
  const areasNodes = schema0.deriveSpacePaths(
    schema0.normalizeOptionTree({
      rawNodes: areas.data.list,
      payloadField: "location",
      provider: "areas",
      valueKey: "name",
      labelKey: "name",
    }),
  );
  const state = {
    location: areasNodes[0].children[0],
    industrySpecificCrowdsMotorDom: [cfg.data.automotiveIndustryTag[0].children[0].children[0]],
    top20CrowdsLabel: top20,
    fansNumberLower: 1000,
    fansNumberUpper: 5000,
    brandUserId: "brand_1001",
  };
  const a = builder.build(state, { trackId: "same-track" });
  const b = builder.build(state, { trackId: "same-track" });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.ok(Object.keys(a).includes("brandUserId"));
});

test("registry defaultValue 存在且类型正确（抽查 5 个字段）", () => {
  const byName = new Map(FIELD_REGISTRY.map((field) => [field.payloadField, field]));
  const checks = [
    ["marketTarget", "null"],
    ["signed", "number"],
    ["fansAge", "number"],
    ["notePriceLower", "number"],
    ["personalTags", "array"],
  ];
  for (const [name, type] of checks) {
    const field = byName.get(name);
    assert.ok(field, `缺少字段 ${name}`);
    const value = field.defaultValue;
    if (type === "null") {
      assert.equal(value, null, name);
    } else if (type === "array") {
      assert.ok(Array.isArray(value), name);
    } else {
      assert.equal(typeof value, type, name);
    }
  }

  // 类型抽查补充：树多选默认空数组
  assert.deepEqual(byName.get("industrySpecificCrowdsMotorDom").defaultValue, []);
  assert.deepEqual(byName.get("kolInfoConsumBehaviorLabel").defaultValue, []);
  assert.equal(byName.get("fansNumberLower").defaultValue, null);
});
