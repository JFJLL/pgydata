// 蒲公英“找博主”展示指标列注册表测试（Phase 5 工作包）。
// 覆盖：50 项（42 官网列 + 8 独立列）、id 唯一与冻结、14 个元数据字段类型、
// fixed 3 项不可导出、quote 互斥组 3 项、real-v2-field 证据链（真实 /v2 字段清单）、
// unavailable 2 项（overflowCost/coopCredit）、默认展示 8 项、默认导出 10 项、
// 导出表头顺序保持与 unknown/fixed/null/computed/unavailable 拒绝语义、
// 展示列辅助函数与共用 formatter 口径。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PGY_KOL_COLUMN_REGISTRY,
  getPgyKolColumn,
  listPgyKolDisplayableColumns,
  listPgyKolConfirmedColumns,
  getPgyKolDefaultColumns,
  getPgyKolDefaultDisplayColumns,
  getPgyKolDefaultExportColumns,
  getPgyKolExportHeaders,
  formatPgyKolColumnValue,
} from "../../app-source/pgy-kol/pgy-kol-column-registry.mjs";
import { KNOWN_KOL_FIELDS } from "../../app-source/pgy-kol/pgy-kol-search-client.mjs";

const realV2Evidence = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../artifacts/verification/pgy-kol-phase5-real-v2-fields.json",
    ),
    "utf8",
  ),
);
const quarantined = new Set(realV2Evidence.result.quarantinedFieldNamesOnly);

// 42 项官网列，顺序 = display-metrics-dom.json 的 n 顺序（权威 DOM 证据）。
const OFFICIAL_42_IDS = [
  "kolInfo", "recentNotes", "actions",
  "price", "picturePrice", "videoPrice",
  "fansNum", "fansRiseNum", "fansActiveIn28dLv", "interactionRate30",
  "kliveCnt30d", "avgLiveViewerNum", "avgAgmv90d",
  "accumCommonImpMedinNum30d", "readMidNor30", "interMidNor30", "thousandLikePercent30", "hundredLikePercent30",
  "accumPicCommonImpMedinNum30d", "pictureClickMidNum", "pictureInterMidNum", "pictureThousandLikePercent30", "pictureHundredLikePercent30",
  "accumVideoCommonImpMedinNum30d", "videoClickMidNum", "videoInterMidNum", "videoThousandLikePercent30", "videoHundredLikePercent30", "videoFinishRate",
  "accumCoopImpMedinNum30d", "readMidCoop30", "interMidCoop30", "overflowNum", "overflowCost",
  "estimatePictureCpm", "pictureReadCost", "pictureCpcPerPrice",
  "estimateVideoCpm", "videoReadCost", "videoCpcPerPrice",
  "coopCredit", "inviteReply48hNumRatio",
];

const INDEPENDENT_8_IDS = [
  "userId", "nickname", "redId", "location", "gender", "avatar", "currentLevel", "fansCount",
];

const REQUIRED_FIELDS = [
  "id", "label", "group", "responsePath", "type", "formatter", "unit", "nullable",
  "defaultDisplay", "defaultExport", "fixed", "mutuallyExclusiveGroup", "evidence", "note",
];

const TYPES = new Set(["string", "number", "percent", "money", "url", "array"]);
const FORMATTERS = new Set(["plain", "number", "percent", "money", "url", "tags", "price-range"]);
const EVIDENCES = new Set([
  "real-v2-field", "candidate", "unavailable", "dom-evidence",
  "export-schema", "ui-card", "known-list",
]);

const DEFAULT_DISPLAY_8 = [
  "kolInfo", "recentNotes", "actions", "price", "fansNum", "readMidNor30", "interMidNor30", "fansActiveIn28dLv",
];

const DEFAULT_EXPORT_10 = [
  "userId", "nickname", "fansNum", "location", "gender", "readMidNor30", "interMidNor30",
  "picturePrice", "videoPrice", "fansActiveIn28dLv",
];

test("注册表 50 项 = 42 官网列 + 8 独立列；id 唯一；整体与单项冻结；每项 14 个元数据字段", () => {
  assert.equal(PGY_KOL_COLUMN_REGISTRY.length, 50, "注册表总项数 = 42 官网列 + 8 博主信息独立列 = 50");
  assert.deepEqual(
    PGY_KOL_COLUMN_REGISTRY.slice(0, 42).map((column) => column.id),
    OFFICIAL_42_IDS,
    "前 42 项必须按官网弹窗顺序（display-metrics-dom.json n 顺序）排列",
  );
  assert.deepEqual(
    PGY_KOL_COLUMN_REGISTRY.slice(42).map((column) => column.id),
    INDEPENDENT_8_IDS,
    "后 8 项为博主信息独立列",
  );
  const ids = PGY_KOL_COLUMN_REGISTRY.map((column) => column.id);
  assert.equal(new Set(ids).size, ids.length, "注册表 id 不得重复");
  assert.ok(Object.isFrozen(PGY_KOL_COLUMN_REGISTRY));
  assert.throws(() => {
    PGY_KOL_COLUMN_REGISTRY.length = 0;
  }, TypeError);

  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    assert.ok(Object.isFrozen(column), `列 ${column.id} 必须冻结`);
    assert.deepEqual(Object.keys(column), REQUIRED_FIELDS, `列 ${column.id} 必须恰好登记 14 个元数据字段`);
    assert.equal(typeof column.id, "string");
    assert.ok(column.id.length > 0);
    assert.equal(typeof column.label, "string");
    assert.ok(column.label.length > 0);
    assert.equal(typeof column.group, "string");
    assert.ok(column.group.length > 0);
    assert.ok(
      column.responsePath === null || typeof column.responsePath === "string",
      `列 ${column.id} responsePath 必须为 string 或 null`,
    );
    assert.ok(TYPES.has(column.type), `列 ${column.id} type=${column.type} 非法`);
    assert.ok(FORMATTERS.has(column.formatter), `列 ${column.id} formatter=${column.formatter} 非法`);
    assert.ok(["", "%", "元"].includes(column.unit), `列 ${column.id} unit=${column.unit} 非法`);
    assert.equal(typeof column.nullable, "boolean");
    assert.equal(typeof column.defaultDisplay, "boolean");
    assert.equal(typeof column.defaultExport, "boolean");
    assert.equal(typeof column.fixed, "boolean");
    assert.ok(
      column.mutuallyExclusiveGroup === null || typeof column.mutuallyExclusiveGroup === "string",
      `列 ${column.id} mutuallyExclusiveGroup 必须为 string 或 null`,
    );
    assert.ok(EVIDENCES.has(column.evidence), `列 ${column.id} evidence=${column.evidence} 非法`);
    assert.equal(typeof column.note, "string");
    // unit 与 type 一致性：percent ↔ "%"，money ↔ "元"。
    if (column.type === "percent") assert.equal(column.unit, "%", `列 ${column.id} percent 必须用 %`);
    if (column.type === "money") assert.equal(column.unit, "元", `列 ${column.id} money 必须用 元`);
  }
});

test("fixed 3 项（kolInfo/recentNotes/actions）不可删除、不可导出；其余列 fixed=false", () => {
  const fixed = PGY_KOL_COLUMN_REGISTRY.filter((column) => column.fixed);
  assert.deepEqual(fixed.map((column) => column.id), ["kolInfo", "recentNotes", "actions"]);
  for (const column of fixed) {
    assert.equal(column.responsePath, null);
    assert.equal(column.evidence, "dom-evidence");
    assert.equal(column.defaultExport, false);
    assert.throws(() => getPgyKolExportHeaders([column.id]), /不可导出/);
  }
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    if (column.fixed) assert.equal(column.defaultDisplay, true, `固定列 ${column.id} 必须默认展示`);
  }
});

test("quote 互斥组恰好 3 项（price/picturePrice/videoPrice），三选一；computed 列不可导出", () => {
  const quote = PGY_KOL_COLUMN_REGISTRY.filter((column) => column.mutuallyExclusiveGroup === "quote");
  assert.deepEqual(quote.map((column) => column.id).sort(), ["picturePrice", "price", "videoPrice"]);
  for (const column of quote) {
    assert.equal(column.group, "博主报价");
    assert.equal(column.unit, "元");
  }
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    if (column.mutuallyExclusiveGroup !== "quote") {
      assert.equal(column.mutuallyExclusiveGroup, null, `列 ${column.id} 不得属于其它互斥组`);
    }
  }
  const price = getPgyKolColumn("price");
  assert.equal(price.responsePath, "computed:picturePrice+videoPrice");
  assert.equal(price.evidence, "dom-evidence");
  assert.throws(() => getPgyKolExportHeaders(["price"]), /不可导出/);
  // 互斥组内的真实字段可导出。
  assert.deepEqual(
    getPgyKolExportHeaders(["picturePrice", "videoPrice"]).map((header) => header.key),
    ["picturePrice", "videoPrice"],
  );
});

test("real-v2-field 列的 responsePath 全部出现在真实 /v2 字段清单（quarantinedFieldNamesOnly）或 KNOWN_KOL_FIELDS 中", () => {
  const realFieldColumns = PGY_KOL_COLUMN_REGISTRY.filter((column) => column.evidence === "real-v2-field");
  assert.ok(realFieldColumns.length >= 28, `real-v2-field 列数量异常: ${realFieldColumns.length}`);
  const knownSet = new Set(KNOWN_KOL_FIELDS);
  for (const column of realFieldColumns) {
    assert.ok(typeof column.responsePath === "string", `real-v2-field 列 ${column.id} 必须有 responsePath`);
    assert.ok(
      quarantined.has(column.responsePath) || knownSet.has(column.responsePath),
      `列 ${column.id} responsePath=${column.responsePath} 不在真实 /v2 字段清单（quarantined ∪ KNOWN_KOL_FIELDS）中`,
    );
  }
  // candidate 列的 responsePath 同样必须是真实响应存在的字段（只是语义为推断）。
  for (const column of PGY_KOL_COLUMN_REGISTRY.filter((column) => column.evidence === "candidate")) {
    assert.ok(typeof column.responsePath === "string");
    assert.ok(
      quarantined.has(column.responsePath) || knownSet.has(column.responsePath),
      `candidate 列 ${column.id} 的 responsePath 必须为真实响应字段`,
    );
    assert.ok(column.note.length > 0, `candidate 列 ${column.id} 的 note 必须说明推断依据`);
    assert.equal(column.defaultExport, false, "candidate 列默认不导出（用户可加列导出）");
  }
});

test("unavailable 2 项（overflowCost/coopCredit）：responsePath=null、note=“官网当前未返回”、不可导出不可展示", () => {
  const unavailable = PGY_KOL_COLUMN_REGISTRY.filter((column) => column.evidence === "unavailable");
  assert.deepEqual(unavailable.map((column) => column.id).sort(), ["coopCredit", "overflowCost"]);
  for (const column of unavailable) {
    assert.equal(column.responsePath, null);
    assert.equal(column.note, "官网当前未返回");
    assert.equal(column.defaultDisplay, false);
    assert.equal(column.defaultExport, false);
    assert.throws(() => getPgyKolExportHeaders([column.id]), /不可导出/);
  }
});

test("默认展示 8 项精确匹配（与官网当前账号默认一致）", () => {
  const defaults = getPgyKolDefaultDisplayColumns();
  assert.deepEqual(defaults.map((column) => column.id), DEFAULT_DISPLAY_8);
  for (const column of defaults) {
    assert.equal(column.defaultDisplay, true, `${column.id} 必须 defaultDisplay=true`);
  }
  const displayIds = new Set(defaults.map((column) => column.id));
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    assert.equal(
      column.defaultDisplay,
      displayIds.has(column.id),
      `列 ${column.id} 的 defaultDisplay 与默认展示清单不一致`,
    );
  }
  // getPgyKolDefaultColumns 为默认展示列别名。
  assert.deepEqual(
    getPgyKolDefaultColumns().map((column) => column.id),
    getPgyKolDefaultDisplayColumns().map((column) => column.id),
  );
});

test("默认导出 10 项精确匹配（保持 Phase 4 口径）", () => {
  const defaults = getPgyKolDefaultExportColumns();
  assert.deepEqual(defaults.map((column) => column.id), DEFAULT_EXPORT_10);
  for (const column of defaults) {
    assert.equal(column.defaultExport, true, `${column.id} 必须 defaultExport=true`);
  }
  const exportIds = new Set(defaults.map((column) => column.id));
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    assert.equal(
      column.defaultExport,
      exportIds.has(column.id),
      `列 ${column.id} 的 defaultExport 与默认导出清单不一致`,
    );
  }
  // 8 项博主信息独立列默认不展示（避免与 kolInfo 复合列重复展示）。
  for (const id of INDEPENDENT_8_IDS) {
    assert.equal(getPgyKolColumn(id).defaultDisplay, false, `${id} 不默认展示`);
  }
  for (const id of ["userId", "nickname", "location", "gender"]) {
    assert.equal(getPgyKolColumn(id).defaultExport, true, `${id} 默认导出`);
  }
  for (const id of ["redId", "avatar", "currentLevel", "fansCount"]) {
    assert.equal(getPgyKolColumn(id).defaultExport, false, `${id} 不默认导出`);
  }
});

test("listPgyKolDisplayableColumns：44 项，响应字段存在且 evidence!=unavailable；confirmed 为等价别名", () => {
  const displayable = listPgyKolDisplayableColumns();
  assert.equal(displayable.length, 44, "36 官网数据列 + 8 独立列 = 44 项可展示");
  const displayableIds = new Set(displayable.map((column) => column.id));
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    const expectDisplayable =
      column.responsePath !== null &&
      typeof column.responsePath === "string" &&
      !column.responsePath.startsWith("computed:") &&
      column.evidence !== "unavailable";
    assert.equal(displayableIds.has(column.id), expectDisplayable, `列 ${column.id} 的可展示判定不一致`);
  }
  for (const column of displayable) {
    assert.ok(!column.fixed);
    assert.doesNotThrow(() => getPgyKolExportHeaders([column.id]), `列 ${column.id} 必须可导出`);
  }
  assert.deepEqual(
    listPgyKolConfirmedColumns().map((column) => column.id),
    displayable.map((column) => column.id),
    "confirmed 兼容别名必须与可展示列一致",
  );
});

test("getPgyKolExportHeaders：顺序保持用户选择，未知/fixed/null/computed/unavailable 一律拒绝", () => {
  assert.equal(getPgyKolColumn("not-a-real-field"), undefined);
  const userId = getPgyKolColumn("userId");
  assert.ok(userId);
  assert.equal(userId.defaultDisplay, false);
  assert.equal(userId.defaultExport, true);

  assert.deepEqual(getPgyKolExportHeaders(["nickname", "userId", "fansNum"]), [
    { group: "博主信息", label: "昵称", key: "nickname" },
    { group: "博主信息", label: "博主UID", key: "userId" },
    { group: "账号数据", label: "粉丝数", key: "fansNum" },
  ]);
  assert.deepEqual(getPgyKolExportHeaders([]), []);

  assert.throws(() => getPgyKolExportHeaders(["nickname", "not-a-real-field"]), /未知列|未知字段|unknown/i);
  assert.throws(() => getPgyKolExportHeaders(["kolInfo"]), /不可导出/, "fixed 列不可导出");
  assert.throws(() => getPgyKolExportHeaders(["recentNotes"]), /不可导出/, "fixed 列不可导出");
  assert.throws(() => getPgyKolExportHeaders(["actions"]), /不可导出/, "fixed 列不可导出");
  assert.throws(() => getPgyKolExportHeaders(["price"]), /不可导出/, "computed 列不可导出");
  assert.throws(() => getPgyKolExportHeaders(["overflowCost"]), /不可导出/, "responsePath=null 列不可导出");
  assert.throws(() => getPgyKolExportHeaders(["coopCredit"]), /不可导出/, "unavailable 列不可导出");
});

test("共用 formatter 口径：percent 保留一位小数百分比、money 加“元”、number/plain 原样、空值统一 null", () => {
  const percent = getPgyKolColumn("fansActiveIn28dLv");
  const money = getPgyKolColumn("picturePrice");
  const number = getPgyKolColumn("fansNum");
  const plain = getPgyKolColumn("nickname");

  assert.equal(formatPgyKolColumnValue(percent, 40.6), "40.6%");
  assert.equal(formatPgyKolColumnValue(percent, 40), "40.0%");
  assert.equal(formatPgyKolColumnValue(percent, 0.62), "62.0%", "比率形态必须乘 100（与前端表格一致）");
  assert.equal(formatPgyKolColumnValue(percent, 0.13), "13.0%");
  assert.equal(formatPgyKolColumnValue(percent, "40.6%"), "40.6%");
  assert.equal(formatPgyKolColumnValue(money, 800), "800元");
  assert.equal(formatPgyKolColumnValue(money, "800元"), "800元");
  assert.equal(formatPgyKolColumnValue(number, 1234), 1234);
  assert.equal(formatPgyKolColumnValue(plain, "甲"), "甲");
  assert.equal(formatPgyKolColumnValue(percent, null), null);
  assert.equal(formatPgyKolColumnValue(money, undefined), null);
  assert.equal(formatPgyKolColumnValue(money, ""), null);
});
