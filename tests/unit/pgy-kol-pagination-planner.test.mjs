import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PgyPaginationPlanner } from "../../app-source/pgy-kol/pgy-pagination-planner.mjs";

const loadFixture = async (name) =>
  JSON.parse(await readFile(new URL(`../fixtures/pgy-kol/${name}.json`, import.meta.url), "utf8"));

function fakeSchema() {
  const registry = {
    fansNumberLower: { exclusive: true },
    fansNumberUpper: { exclusive: true },
    industrySpecificCrowdsMotorDom: { exclusive: false, reason: "multi-value" },
    top20CrowdsLabel: { exclusive: false, reason: "multi-value" },
    contentThemeLabel: { exclusive: false, reason: "multi-value" },
    kolInfoConsumBehaviorLabel: { exclusive: false, reason: "multi-value" },
    notePriceLower: { exclusive: false, reason: "lossy" },
    videoPriceUpper: { exclusive: false, reason: "lossy" },
    gender: { exclusive: "unproven" },
  };
  return { getField: (payloadField) => registry[payloadField] };
}

const spanLength = (range) => range[1] - range[0] + 1;

test("splitIntegerRange [1000,5000]：无重叠、无空隙、边界唯一归属、长度守恒", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });

  const result = planner.splitIntegerRange({ lower: 1000, upper: 5000 });

  assert.equal(result.canSplit, true);
  assert.deepEqual(result.subRanges, [
    [1000, 3000],
    [3001, 5000],
  ]);
  const [first, second] = result.subRanges;
  assert.ok(first[0] <= first[1] && second[0] <= second[1], "两个子区间都必须非空");
  assert.ok(first[1] < second[0], "无重叠");
  assert.equal(second[0], first[1] + 1, "无空隙（3000 与 3001 相邻）");
  assert.equal(first[0], 1000, "下边界只属于第一个子区间");
  assert.equal(second[1], 5000, "上边界只属于第二个子区间");
  assert.equal(
    spanLength(first) + spanLength(second),
    5000 - 1000 + 1,
    "两区间长度和必须等于覆盖跨度 4001",
  );
  assert.ok(first[1] < 5000, "mid < upper，两个子区间都非空");
});

test("splitIntegerRange：lower===upper / lower>upper → range-too-small；非整数 throw", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });

  assert.deepEqual(planner.splitIntegerRange({ lower: 100, upper: 100 }), {
    canSplit: false,
    subRanges: [],
    reason: "range-too-small",
  });
  assert.deepEqual(planner.splitIntegerRange({ lower: 200, upper: 100 }), {
    canSplit: false,
    subRanges: [],
    reason: "range-too-small",
  });
  assert.throws(() => planner.splitIntegerRange({ lower: 100.5, upper: 200 }), TypeError);
  assert.throws(() => planner.splitIntegerRange({ lower: "100", upper: 200 }), TypeError);
  assert.throws(() => planner.splitIntegerRange({ lower: Number.NaN, upper: 200 }), TypeError);
  assert.throws(() => planner.splitIntegerRange({ lower: undefined, upper: 200 }), TypeError);
});

test("planSplit：完整区间确定性拆分；单边 unbounded；无边 no-safe-dimension", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const full = { fansNumberLower: 1000, fansNumberUpper: 5000 };

  const first = planner.planSplit({ filterState: full });
  const second = planner.planSplit({ filterState: full });
  assert.deepEqual(first, second, "同输入必须同输出（确定性）");
  assert.equal(first.canSplit, true);
  assert.equal(first.dimension, "fansNumber");
  assert.deepEqual(first.subRanges, [
    [1000, 3000],
    [3001, 5000],
  ]);

  assert.deepEqual(planner.planSplit({ filterState: { fansNumberLower: 1000 } }), {
    canSplit: false,
    dimension: null,
    subRanges: [],
    reason: "unbounded-range",
  });
  assert.deepEqual(planner.planSplit({ filterState: { fansNumberUpper: 5000 } }), {
    canSplit: false,
    dimension: null,
    subRanges: [],
    reason: "unbounded-range",
  });

  const none = planner.planSplit({ filterState: {} });
  assert.equal(none.canSplit, false);
  assert.equal(none.dimension, null);
  assert.equal(none.reason, "no-safe-dimension");
  assert.match(none.note, /Phase 1/, "no-safe-dimension 必须附带 Phase 1 说明");

  assert.deepEqual(planner.planSplit({ filterState: { fansNumberLower: 5000, fansNumberUpper: 5000 } }), {
    canSplit: false,
    dimension: "fansNumber",
    subRanges: [],
    reason: "range-too-small",
  });
});

test("planSplit：字符串数字可归一化拆分；非数字字符串优雅拒绝 invalid-range", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const coerced = planner.planSplit({ filterState: { fansNumberLower: "1000", fansNumberUpper: "5000" } });
  assert.equal(coerced.canSplit, true);
  assert.deepEqual(coerced.subRanges, [[1000, 3000], [3001, 5000]]);
  const invalid = planner.planSplit({ filterState: { fansNumberLower: "abc", fansNumberUpper: "5000" } });
  assert.equal(invalid.canSplit, false);
  assert.equal(invalid.reason, "invalid-range");
  for (const bad of ["0x10", "1e3", true]) {
    const result = planner.planSplit({ filterState: { fansNumberLower: bad, fansNumberUpper: "5000" } });
    assert.equal(result.canSplit, false, JSON.stringify(bad));
    assert.equal(result.reason, "invalid-range", JSON.stringify(bad));
  }
});

test("planSplit：空串/纯空白边界视为未提供（与 builder 口径一致）", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const oneBlank = planner.planSplit({ filterState: { fansNumberLower: "", fansNumberUpper: "5000" } });
  assert.equal(oneBlank.canSplit, false);
  assert.equal(oneBlank.reason, "unbounded-range", "单边空白视为未提供，按单边区间处理");
  const bothBlank = planner.planSplit({ filterState: { fansNumberLower: "  ", fansNumberUpper: "  " } });
  assert.equal(bothBlank.canSplit, false);
  assert.equal(bothBlank.reason, "no-safe-dimension", "双边空白视为未提供，无安全维度");
});

test("validateSplitDimension：exclusive / multi-value / lossy / unproven / unknown", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });

  assert.deepEqual(planner.validateSplitDimension("fansNumberLower"), { allowed: true, reason: "exclusive" });
  assert.deepEqual(planner.validateSplitDimension("fansNumberUpper"), { allowed: true, reason: "exclusive" });
  for (const field of [
    "industrySpecificCrowdsMotorDom",
    "top20CrowdsLabel",
    "contentThemeLabel",
    "kolInfoConsumBehaviorLabel",
  ]) {
    assert.deepEqual(planner.validateSplitDimension(field), { allowed: false, reason: "multi-value" }, field);
  }
  assert.deepEqual(planner.validateSplitDimension("notePriceLower"), { allowed: false, reason: "lossy" });
  assert.deepEqual(planner.validateSplitDimension("videoPriceUpper"), { allowed: false, reason: "lossy" });
  assert.deepEqual(planner.validateSplitDimension("gender"), { allowed: false, reason: "unproven-coverage" });
  assert.deepEqual(planner.validateSplitDimension("doesNotExist"), { allowed: false, reason: "unknown-field" });
});

test("analyzePageSequence：重复 fixture 触发信号；健康序列不触发", async () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const repeatFixture = await loadFixture("page-sequence-repeat");
  const healthyFixture = await loadFixture("page-sequence-healthy");

  const repeat = planner.analyzePageSequence({ pages: repeatFixture.pages });
  assert.equal(repeat.repeatSignal, true);
  assert.deepEqual(repeat.repeatAtPages, [3, 4]);
  assert.match(repeat.note, /不以固定 200 条作为触顶规则/);

  const healthy = planner.analyzePageSequence({ pages: healthyFixture.pages });
  assert.equal(healthy.repeatSignal, false);
  assert.deepEqual(healthy.repeatAtPages, []);
});

test("analyzePageSequence：阈值可配置（threshold=3 时两页零不触发）", async () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const repeatFixture = await loadFixture("page-sequence-repeat");

  const result = planner.analyzePageSequence({
    pages: repeatFixture.pages,
    repeatThresholdPages: 3,
  });
  assert.equal(result.repeatSignal, false);
  assert.deepEqual(result.repeatAtPages, []);
});

test("buildCoverageReport：capped 叶子 → cannot-prove + warnings；全完整 → complete", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });

  const incomplete = planner.buildCoverageReport({
    leaves: [
      { uniqueUidCount: 3000, capped: true, splitDimension: "fansNumber", canSplitFurther: false },
      { uniqueUidCount: 2000, capped: false, splitDimension: "fansNumber", canSplitFurther: true },
    ],
    mergedDupCount: 120,
    failureCount: 3,
  });
  assert.equal(incomplete.uniqueUidCount, 5000);
  assert.equal(incomplete.subqueryCount, 2);
  assert.equal(incomplete.mergedDupCount, 120);
  assert.equal(incomplete.failureCount, 3);
  assert.equal(incomplete.cappedLeaves.length, 1);
  assert.equal(incomplete.cappedLeaves[0].uniqueUidCount, 3000);
  assert.equal(incomplete.splitDimension, "fansNumber");
  assert.equal(incomplete.completeness, "cannot-prove");
  assert.ok(incomplete.warnings.length >= 1, "存在 capped 叶子时 warnings 非空");
  assert.ok(
    incomplete.warnings.some((warning) => warning.includes("当前接口下无法证明完整")),
    "warnings 必须包含无法证明完整说明",
  );

  const complete = planner.buildCoverageReport({
    leaves: [
      { uniqueUidCount: 100, capped: false, canSplitFurther: false },
      { uniqueUidCount: 200, capped: false, canSplitFurther: false },
    ],
  });
  assert.equal(complete.completeness, "complete");
  assert.deepEqual(complete.warnings, []);
  assert.equal(complete.cappedLeaves.length, 0);
  assert.equal(complete.uniqueUidCount, 300);
  assert.equal(complete.subqueryCount, 2);

  const splittableCapped = planner.buildCoverageReport({
    leaves: [{ uniqueUidCount: 100, capped: true, canSplitFurther: true }],
  });
  assert.equal(
    splittableCapped.completeness,
    "cannot-prove",
    "存在 capped 叶子即无法证明完整，即使 canSplitFurther=true",
  );
  assert.ok(splittableCapped.warnings.length > 0);
});

test("buildCoverageReport：空叶子列表 → not-started", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const report = planner.buildCoverageReport({ leaves: [] });
  assert.equal(report.completeness, "not-started");
  assert.equal(report.subqueryCount, 0);
  assert.deepEqual(report.warnings, []);
});

test("buildCoverageReport：存在失败子查询时 completeness=cannot-prove 且带失败 warning", () => {
  const planner = new PgyPaginationPlanner({ schema: fakeSchema() });
  const report = planner.buildCoverageReport({
    leaves: [{ uniqueUidCount: 100, capped: false }],
    failureCount: 2,
  });
  assert.equal(report.completeness, "cannot-prove");
  assert.ok(report.warnings.some((w) => w.includes("失败子查询")));
  assert.equal(report.failureCount, 2);
});
