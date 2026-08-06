// 蒲公英“找博主”列注册表测试（Phase 4 工作包 B）。
// 覆盖：34 项全覆盖与冻结、14 项 confirmed 元数据、10 项默认展示+导出、
// 20 项未确认隔离、fixture 证据链、导出表头顺序与拒绝语义。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PGY_KOL_COLUMN_REGISTRY,
  getPgyKolColumn,
  listPgyKolConfirmedColumns,
  getPgyKolDefaultColumns,
  getPgyKolExportHeaders,
} from "../../app-source/pgy-kol/pgy-kol-column-registry.mjs";
import { KNOWN_KOL_FIELDS } from "../../app-source/pgy-kol/pgy-kol-search-client.mjs";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pgy-kol/search-first-page-capped.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const fixtureKols = fixture.data.kols;
const fixtureFields = Object.keys(fixtureKols[0]);

// 契约锁定的 14 项 confirmed：id/label/group/type/evidence。
const CONFIRMED_14 = [
  ["userId", "博主UID", "博主信息", "string", "export-schema"],
  ["nickname", "昵称", "博主信息", "string", "ui-card"],
  ["redId", "小红书号", "博主信息", "string", "export-schema"],
  ["currentLevel", "健康等级", "博主信息", "string", "export-schema"],
  ["fansNum", "粉丝数", "博主信息", "number", "ui-card"],
  ["fansCount", "粉丝数（官方导出口径）", "博主信息", "number", "export-schema"],
  ["location", "地域", "博主信息", "string", "ui-card"],
  ["gender", "性别", "博主信息", "string", "ui-card"],
  ["readMidNor30", "近30天阅读中位数", "表现数据", "number", "ui-card"],
  ["interMidNor30", "近30天互动中位数", "表现数据", "number", "ui-card"],
  ["picturePrice", "图文报价", "报价", "string", "ui-card"],
  ["videoPrice", "视频报价", "报价", "string", "ui-card"],
  ["fansActiveIn28dLv", "活跃粉丝等级", "粉丝画像", "string", "ui-card"],
  ["avatar", "头像", "博主信息", "url", "known-list"],
];

const DEFAULT_DISPLAY_EXPORT_10 = [
  "userId",
  "nickname",
  "fansNum",
  "location",
  "gender",
  "readMidNor30",
  "interMidNor30",
  "picturePrice",
  "videoPrice",
  "fansActiveIn28dLv",
];

test("注册表覆盖全部 KNOWN_KOL_FIELDS、id 唯一、整体与单项冻结", () => {
  assert.equal(PGY_KOL_COLUMN_REGISTRY.length, KNOWN_KOL_FIELDS.length);
  assert.deepEqual(
    [...PGY_KOL_COLUMN_REGISTRY.map((column) => column.id)].sort(),
    [...KNOWN_KOL_FIELDS].sort(),
  );
  const ids = PGY_KOL_COLUMN_REGISTRY.map((column) => column.id);
  assert.equal(new Set(ids).size, ids.length, "注册表 id 不得重复");
  assert.ok(Object.isFrozen(PGY_KOL_COLUMN_REGISTRY));
  assert.throws(() => {
    PGY_KOL_COLUMN_REGISTRY.length = 0;
  }, TypeError);
  for (const column of PGY_KOL_COLUMN_REGISTRY) {
    assert.ok(Object.isFrozen(column), `列 ${column.id} 必须冻结`);
    assert.equal(typeof column.label, "string");
    assert.ok(column.label.length > 0);
    assert.equal(typeof column.group, "string");
    assert.ok(["string", "number", "array", "url"].includes(column.type));
    assert.equal(typeof column.confirmed, "boolean");
    assert.equal(typeof column.defaultDisplay, "boolean");
    assert.equal(typeof column.defaultExport, "boolean");
    assert.equal(typeof column.nullable, "boolean");
    assert.equal(typeof column.evidence, "string");
    assert.equal(typeof column.note, "string");
  }
});

test("confirmed 14 项的 id/label/group/type/evidence 精确匹配契约", () => {
  const confirmed = listPgyKolConfirmedColumns();
  const confirmedIds = new Set(confirmed.map((column) => column.id));
  assert.deepEqual([...confirmedIds].sort(), CONFIRMED_14.map((entry) => entry[0]).sort());
  for (const [id, label, group, type, evidence] of CONFIRMED_14) {
    const column = getPgyKolColumn(id);
    assert.ok(column, `列 ${id} 必须存在`);
    assert.equal(column.confirmed, true);
    assert.equal(column.label, label, `列 ${id} label`);
    assert.equal(column.group, group, `列 ${id} group`);
    assert.equal(column.type, type, `列 ${id} type`);
    assert.equal(column.evidence, evidence, `列 ${id} evidence`);
  }
  for (const column of confirmed) {
    assert.ok(KNOWN_KOL_FIELDS.includes(column.id), `列 ${column.id} 必须在白名单内`);
  }
});

test("默认展示+默认导出 10 项；redId/currentLevel/fansCount/avatar 确认但默认不导出", () => {
  const defaults = getPgyKolDefaultColumns();
  assert.deepEqual(
    [...defaults.map((column) => column.id)].sort(),
    [...DEFAULT_DISPLAY_EXPORT_10].sort(),
  );
  for (const id of DEFAULT_DISPLAY_EXPORT_10) {
    const column = getPgyKolColumn(id);
    assert.equal(column.defaultDisplay, true, `${id} 默认展示`);
    assert.equal(column.defaultExport, true, `${id} 默认导出`);
  }
  for (const id of ["redId", "currentLevel", "fansCount", "avatar"]) {
    const column = getPgyKolColumn(id);
    assert.equal(column.confirmed, true);
    assert.equal(column.defaultDisplay, false, `${id} 不默认展示`);
    assert.equal(column.defaultExport, false, `${id} 不默认导出`);
  }
  for (const column of defaults) {
    assert.ok(column.defaultExport || column.defaultDisplay, "默认列必须至少默认展示或默认导出");
  }
});

test("全部 confirmed 字段在 search-first-page-capped.json 中存在（证据链）", () => {
  for (const column of listPgyKolConfirmedColumns()) {
    assert.ok(fixtureFields.includes(column.id), `fixture 缺少 confirmed 字段 ${column.id}`);
  }
  for (const id of KNOWN_KOL_FIELDS) {
    assert.ok(fixtureFields.includes(id), `fixture 缺少 KNOWN 字段 ${id}`);
  }
});

test("未确认 20 项保持隔离、可审计、不可导出", () => {
  const unconfirmed = PGY_KOL_COLUMN_REGISTRY.filter((column) => column.confirmed === false);
  assert.equal(unconfirmed.length, KNOWN_KOL_FIELDS.length - CONFIRMED_14.length);
  const confirmedIds = new Set(listPgyKolConfirmedColumns().map((column) => column.id));
  for (const column of unconfirmed) {
    assert.equal(column.note, "含义未证实，保持隔离");
    assert.equal(column.evidence, "");
    assert.equal(column.defaultDisplay, false);
    assert.equal(column.defaultExport, false);
    assert.ok(!confirmedIds.has(column.id), `未确认列 ${column.id} 不得出现在 confirmed 列表`);
  }
});

test("getPgyKolColumn / getPgyKolExportHeaders：顺序保持用户选择，未知或未确认拒绝", () => {
  assert.equal(getPgyKolColumn("not-a-real-field"), undefined);
  const userId = getPgyKolColumn("userId");
  assert.ok(userId);
  assert.equal(userId.confirmed, true);
  assert.equal(userId.defaultDisplay, true);
  assert.equal(userId.defaultExport, true);

  assert.deepEqual(getPgyKolExportHeaders(["nickname", "userId", "fansNum"]), [
    { group: "博主信息", label: "昵称", key: "nickname" },
    { group: "博主信息", label: "博主UID", key: "userId" },
    { group: "博主信息", label: "粉丝数", key: "fansNum" },
  ]);
  assert.deepEqual(getPgyKolExportHeaders([]), []);
  assert.throws(() => getPgyKolExportHeaders(["nickname", "not-a-real-field"]), /未知列|未知字段|unknown/i);
  assert.throws(() => getPgyKolExportHeaders(["contentTags"]), /未知列|未知字段|unknown/i, "未确认字段不可导出");
  assert.throws(() => getPgyKolExportHeaders(["nickname", "fansProvinceChart"]), /未知列|未知字段|unknown/i);
});
