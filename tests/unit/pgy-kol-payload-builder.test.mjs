import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIELD_REGISTRY, PgyFilterSchema } from "../../app-source/pgy-kol/pgy-filter-schema.mjs";
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

test("地域字段 path-trim；行业特色画像展开叶子（含 19188199）；消费行为 path||label；top20 官网变换；题材直传", async () => {
  const builder = makeBuilder();
  const areas = await loadFixture("areas-tree.json");
  const cfg = await loadFixture("kol-tags-v2-config.json");
  const consume = await loadFixture("consumer-behavior-tree.json");
  const top20 = await loadFixture("top20-options.json");
  const themes = await loadFixture("content-theme-list.json");

  const guangdong = areas.data.children[0];
  const zhejiang = areas.data.children[1];

  const locationOut = builder.build({ location: guangdong }, { trackId: "t" });
  assert.equal(locationOut.location, "中国 > 广东省");

  const fansLocationOut = builder.build({ fansLocation: [guangdong, zhejiang] }, { trackId: "t" });
  assert.deepEqual(fansLocationOut.fansLocation, ["中国 > 广东省", "中国 > 浙江省"]);

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

  const consumeOut = builder.build(
    { kolInfoConsumBehaviorLabel: [consume.data[1], consume.data[2]] },
    { trackId: "t" },
  );
  assert.deepEqual(consumeOut.kolInfoConsumBehaviorLabel, [
    "美妆个护 > 护肤 > 洁面",
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

  const themeOut = builder.build(
    { contentThemeLabel: themes.data.map((n) => n.value) },
    { trackId: "t" },
  );
  assert.deepEqual(themeOut.contentThemeLabel, [501, 502, 503]);
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
  assert.ok(!("gender" in out));
  assert.ok(!("signed" in out));
  assert.ok(!("location" in out));
  assert.ok(!("personalTags" in out));
  assert.equal(out.marketTarget, "有效值");
});

test("纯空白字符串视为未提供，不写入 payload", () => {
  const builder = makeBuilder();
  const out = builder.build(
    { location: "   ", fansNumberLower: "  ", marketTarget: "有效值" },
    { trackId: "t" },
  );
  assert.ok(!("location" in out), "纯空白 location 不得写入");
  assert.ok(!("fansNumberLower" in out), "纯空白 fansNumberLower 不得写入");
  assert.equal(out.marketTarget, "有效值");
});

test("未知字段 → PgyPayloadError kind=unknown-field", () => {
  const builder = makeBuilder();
  assert.throws(
    () => builder.build({ bogusField: 1 }, { trackId: "t" }),
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
  const state = {
    location: areas.data.children[0],
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
