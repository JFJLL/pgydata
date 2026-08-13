import test from "node:test";
import assert from "node:assert/strict";

import {
  PGY_KOL_IPC_MAX_DEPTH,
  PGY_KOL_IPC_MAX_ARRAY_LENGTH,
  PGY_KOL_IPC_MAX_STRING_LENGTH,
  PGY_KOL_IPC_MAX_FILTER_FIELDS,
  PGY_KOL_BUDGET_LIMITS,
  PGY_KOL_RESUME_BUDGET_KEYS,
  PGY_KOL_CONFIG_PROVIDERS,
  PGY_KOL_CONFIG_SECTIONS,
  validateConfigRequest,
  validateFilterState,
  validateBatchResumeRequest,
} from "../../app-source/pgy-kol/pgy-ipc-guard.mjs";

test("导出常量：边界值与白名单精确匹配", () => {
  assert.equal(PGY_KOL_IPC_MAX_DEPTH, 8);
  assert.equal(PGY_KOL_IPC_MAX_ARRAY_LENGTH, 200);
  assert.equal(PGY_KOL_IPC_MAX_STRING_LENGTH, 512);
  assert.equal(PGY_KOL_IPC_MAX_FILTER_FIELDS, 64);
  assert.deepEqual(PGY_KOL_CONFIG_PROVIDERS, [
    "kolTagsV2",
    "consumeBehavior",
    "areas",
    "activities",
    "brandSearch",
    "contentTagTree",
    "specialIndustryData",
  ]);
  assert.deepEqual(PGY_KOL_BUDGET_LIMITS, { maxLeaves: 64, maxDepth: 10, maxPagesPerLeaf: 250, queryBudget: 1000 });
  assert.deepEqual(PGY_KOL_RESUME_BUDGET_KEYS, ["queryBudget", "maxPagesPerLeaf"]);
  assert.deepEqual(PGY_KOL_CONFIG_SECTIONS, [
    "automotiveIndustryTag",
    "audience20",
    "contentTheme",
    "industryTags",
  ]);
});

test("validateConfigRequest：非对象/provider 非法/超长 → invalid-input", () => {
  for (const bad of [null, undefined, "x", 42, [], ["kolTagsV2"]]) {
    const result = validateConfigRequest(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.error.code, "invalid-input", JSON.stringify(bad));
  }
  assert.equal(validateConfigRequest({}).error.code, "invalid-input");
  assert.equal(validateConfigRequest({ provider: "" }).error.code, "invalid-input");
  assert.equal(validateConfigRequest({ provider: 123 }).error.code, "invalid-input");
  assert.equal(validateConfigRequest({ provider: "x".repeat(65) }).error.code, "invalid-input");
  assert.equal(
    validateConfigRequest({ provider: "kolTagsV2", section: "x".repeat(65) }).error.code,
    "invalid-input",
    "section 超长必须 invalid-input",
  );
  assert.equal(
    validateConfigRequest({ provider: "consumeBehavior", section: "" }).error.code,
    "invalid-input",
    "空字符串 section 按非法输入拒绝",
  );
});

test("validateConfigRequest：未知 provider → unknown-provider", () => {
  for (const provider of ["bogus", "kolTagsV3", "KOLTAGSV2"]) {
    const result = validateConfigRequest({ provider });
    assert.equal(result.ok, false, provider);
    assert.equal(result.error.code, "unknown-provider", provider);
  }
});

test("validateConfigRequest：kolTagsV2 section 必填且限白名单", () => {
  assert.equal(validateConfigRequest({ provider: "kolTagsV2" }).error.code, "unknown-section");
  assert.equal(validateConfigRequest({ provider: "kolTagsV2", section: null }).error.code, "unknown-section");
  for (const section of ["bogus", "personalTags", "consumerBehavior"]) {
    const result = validateConfigRequest({ provider: "kolTagsV2", section });
    assert.equal(result.ok, false, section);
    assert.equal(result.error.code, "unknown-section", section);
  }
  for (const section of PGY_KOL_CONFIG_SECTIONS) {
    const result = validateConfigRequest({ provider: "kolTagsV2", section });
    assert.deepEqual(result, { ok: true, provider: "kolTagsV2", section });
  }
});

test("validateConfigRequest：consumeBehavior/areas 必须省略 section", () => {
  for (const provider of ["consumeBehavior", "areas", "activities", "contentTagTree"]) {
    const ok = validateConfigRequest({ provider });
    assert.deepEqual(ok, { ok: true, provider });
    const bad = validateConfigRequest({ provider, section: "anything" });
    assert.equal(bad.ok, false, provider);
    assert.equal(bad.error.code, "unknown-section", provider);
  }
});

test("validateConfigRequest：brandSearch 必须携带 1-64 字符 keyword", () => {
  const missing = validateConfigRequest({ provider: "brandSearch" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "invalid-keyword");
  assert.equal(validateConfigRequest({ provider: "brandSearch", keyword: "" }).error.code, "invalid-keyword");
  assert.equal(validateConfigRequest({ provider: "brandSearch", keyword: "   " }).error.code, "invalid-keyword");
  assert.equal(validateConfigRequest({ provider: "brandSearch", keyword: "x".repeat(65) }).error.code, "invalid-keyword");
  assert.equal(validateConfigRequest({ provider: "brandSearch", keyword: 42 }).error.code, "invalid-keyword");
  assert.equal(
    validateConfigRequest({ provider: "brandSearch", section: "x" }).error.code,
    "unknown-section",
    "brandSearch 不允许携带 section",
  );
  assert.deepEqual(
    validateConfigRequest({ provider: "brandSearch", keyword: "  美妆  " }),
    { ok: true, provider: "brandSearch", keyword: "美妆" },
  );
});

test("validateConfigRequest：brandSearch keyword 拒绝控制字符与路径/非法文件名字符（fresh reviewer H1）", () => {
  for (const bad of ["a\nb", "a\u0000b", "..\\..\\escape", "a/b", "a:b", "a*b", 'a"b', "a<b", "a>b", "a|b", "a?b"]) {
    const result = validateConfigRequest({ provider: "brandSearch", keyword: bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.error.code, "invalid-keyword", JSON.stringify(bad));
  }
  // 安全字符集内仍放行。
  assert.equal(validateConfigRequest({ provider: "brandSearch", keyword: "美妆 2026" }).ok, true);
});

test("validateFilterState：searchType/keyword/trackId 特殊键边界", () => {
  // searchType：0/1 通过，其它拒绝。
  for (const searchType of [0, 1]) {
    assert.deepEqual(validateFilterState({ searchType }), { ok: true, value: { searchType } });
  }
  for (const searchType of [2, -1, "1", null, true]) {
    const result = validateFilterState({ searchType });
    assert.equal(result.ok, false, JSON.stringify(searchType));
    assert.equal(result.error.code, "invalid-search-type", JSON.stringify(searchType));
  }
  // keyword：≤200 字符、无控制字符。
  assert.equal(validateFilterState({ keyword: "" }).ok, true);
  assert.equal(validateFilterState({ keyword: "  口红测评  " }).ok, true);
  assert.equal(validateFilterState({ keyword: "x".repeat(200) }).ok, true);
  assert.equal(validateFilterState({ keyword: "x".repeat(201) }).error.code, "invalid-keyword");
  assert.equal(validateFilterState({ keyword: "a\nb" }).error.code, "invalid-keyword");
  assert.equal(validateFilterState({ keyword: "a\u0000b" }).error.code, "invalid-keyword");
  assert.equal(validateFilterState({ keyword: 42 }).error.code, "invalid-keyword");
  // trackId：安全字符集内通过，非法形状拒绝。
  assert.equal(validateFilterState({ trackId: "track-20260806-abc" }).ok, true);
  assert.equal(validateFilterState({ trackId: null }).ok, true);
  assert.equal(validateFilterState({ trackId: "" }).ok, false);
  assert.equal(validateFilterState({ trackId: "../escape" }).error.code, "invalid-track-id");
  assert.equal(validateFilterState({ trackId: "x y" }).error.code, "invalid-track-id");
});

test("validateFilterState：非对象 → invalid-input", () => {
  for (const bad of [null, undefined, "x", 42, true, [1, 2]]) {
    const result = validateFilterState(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.error.code, "invalid-input", JSON.stringify(bad));
  }
});

test("validateFilterState：深度边界——8 层通过，9 层 too-deep", () => {
  const depth8 = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };
  assert.deepEqual(validateFilterState(depth8), { ok: true, value: depth8 });

  const depth9 = { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } };
  const result = validateFilterState(depth9);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "too-deep");
});

test("validateFilterState：数组长度边界——200 通过，201 array-too-long", () => {
  assert.equal(validateFilterState({ tags: Array(200).fill("x") }).ok, true);
  const result = validateFilterState({ tags: Array(201).fill("x") });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "array-too-long");

  // 嵌套数组同样受限
  const nested = validateFilterState({ outer: [{ inner: Array(201).fill(1) }] });
  assert.equal(nested.error.code, "array-too-long");
});

test("validateFilterState：字符串长度边界——512 通过，513 string-too-long", () => {
  assert.equal(validateFilterState({ a: "x".repeat(512) }).ok, true);
  const result = validateFilterState({ a: "x".repeat(513) });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "string-too-long");
});

test("validateFilterState：顶层键数边界——64 通过，65 too-many-fields", () => {
  const okState = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`k${i}`, 1]));
  assert.equal(validateFilterState(okState).ok, true);
  const badState = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, 1]));
  const result = validateFilterState(badState);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "too-many-fields");
});

test("validateFilterState：循环引用按 too-deep 拒绝（防死循环）", () => {
  const cyclic = { name: "node" };
  cyclic.self = cyclic;
  const result = validateFilterState(cyclic);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "too-deep");
});

test("validateFilterState：合法复杂 filterState 原样返回", () => {
  const state = {
    gender: "女",
    location: [{ path: "中国 > 广东省", label: "广东省" }],
    industrySpecificCrowdsMotorDom: [{ value: "19188199", label: "纸品-留子跨国囤货党" }],
    fansNumberLower: 1000,
  };
  assert.deepEqual(validateFilterState(state), { ok: true, value: state });
});

test("validateFilterState：真实配置树节点（含 children 子树）的父级选择通过", () => {
  const treeNode = {
    provider: "kolTagsV2",
    payloadField: "industrySpecificCrowdsMotorDom",
    value: "日化",
    label: "日化家清",
    fullPath: "日化家清",
    path: "日化家清",
    children: [
      {
        provider: "kolTagsV2",
        payloadField: "industrySpecificCrowdsMotorDom",
        value: "纸品",
        label: "纸品",
        fullPath: "日化家清 > 纸品",
        path: "日化家清 纸品",
        children: [
          {
            provider: "kolTagsV2",
            payloadField: "industrySpecificCrowdsMotorDom",
            value: "场景",
            label: "场景",
            fullPath: "日化家清 > 纸品 > 场景",
            path: "日化家清 纸品 场景",
            children: [
              {
                provider: "kolTagsV2",
                payloadField: "industrySpecificCrowdsMotorDom",
                value: "19188199",
                label: "纸品-留子跨国囤货党",
                fullPath: "日化家清 > 纸品 > 场景 > 纸品-留子跨国囤货党",
                path: "日化家清 纸品 场景 纸品-留子跨国囤货党",
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
  const state = { industrySpecificCrowdsMotorDom: [treeNode] };
  assert.deepEqual(validateFilterState(state), { ok: true, value: state });
});

test("validateFilterState：节点总数超限 too-many-nodes", () => {
  // 每数组 ≤200、深度 ≤8，但节点总数 >5000：由节点预算拦截（防 DoS）。
  const list = Array.from({ length: 200 }, () => ({
    items: Array.from({ length: 26 }, () => ({ x: 1 })),
  }));
  const result = validateFilterState({ list });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "too-many-nodes");
});

test("validateFilterState：现实规模配置树（数千节点）通过（数组不计入对象预算）", () => {
  // 模拟地域树规模：约 3000 个对象节点，数组仅作容器。
  const tree = {};
  for (let i = 0; i < 30; i++) {
    tree[`branch${i}`] = Array.from({ length: 100 }, () => ({ label: `n${i}` }));
  }
  const result = validateFilterState(tree);
  assert.equal(result.ok, true);
});

test("validateFilterState：嵌套对象键数同样受限（每层 too-many-fields）", () => {
  const nested = {};
  for (let i = 0; i < 65; i++) {
    nested[`k${i}`] = 1;
  }
  const result = validateFilterState({ field: nested });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "too-many-fields");
});

test("validateBatchResumeRequest：taskId 边界与 budgets 形状/上限/未知键", () => {
  assert.equal(validateBatchResumeRequest(null).error.code, "invalid-input");
  assert.equal(validateBatchResumeRequest([]).error.code, "invalid-input");
  assert.equal(validateBatchResumeRequest({ taskId: "../escape" }).error.code, "invalid-task-id");
  // budgets 可省略（paused/interrupted/failed 不传）。
  assert.deepEqual(validateBatchResumeRequest({ taskId: "pgykol-ok-1" }), { ok: true, value: { taskId: "pgykol-ok-1" } });
  assert.deepEqual(validateBatchResumeRequest({ taskId: "pgykol-ok-1", budgets: null }), { ok: true, value: { taskId: "pgykol-ok-1" } });
  // 合法预算原样返回。
  assert.deepEqual(
    validateBatchResumeRequest({ taskId: "pgykol-ok-1", budgets: { queryBudget: 5, maxPagesPerLeaf: 250 } }),
    { ok: true, value: { taskId: "pgykol-ok-1", budgets: { queryBudget: 5, maxPagesPerLeaf: 250 } } },
  );
  // 非法：非对象 / 未知键 / 超上限 / 非整数 / 0 / 负数 / 超长字符串值。
  for (const budgets of [
    "x",
    5,
    ["queryBudget"],
    { bogus: 1 },
    { queryBudget: 1001 },
    { maxPagesPerLeaf: 251 },
    { queryBudget: 1.5 },
    { queryBudget: 0 },
    { queryBudget: -1 },
    { queryBudget: "5" },
  ]) {
    const result = validateBatchResumeRequest({ taskId: "pgykol-ok-1", budgets });
    assert.equal(result.ok, false, JSON.stringify(budgets));
    assert.equal(result.error.code, "invalid-budgets", JSON.stringify(budgets));
  }
  // 边界值通过（上限含端点）。
  assert.equal(validateBatchResumeRequest({ taskId: "pgykol-ok-1", budgets: { queryBudget: 1000, maxPagesPerLeaf: 250 } }).ok, true);
});
