// 采集助手历史任务导出回归测试：验证 history.exportTask 修复后的真实 xlsx 产物。
// 管线与主进程一致：buildCollectionHistoryExportPayload（修复核心）→ 真实 xlsx 写盘 → 解压校验。
// 注意：不允许 mock ff 或仅断言函数被调用；本文件全部断言基于真实生成的 .xlsx 内容。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  resolveCollectionExportHeaders,
  filterCollectionExportHeaders,
  buildCollectionHistoryExportPayload,
} from "../../app-source/electron-main/collection-export-headers.mjs";
import { writeCollectionWorkbook } from "../helpers/collection-xlsx-writer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireApp = createRequire(pathToFileURL(path.join(root, "app-source", "package.json")));
const XLSX = requireApp("xlsx-js-style");
const JSZip = requireApp("jszip");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pgy-history-export-"));
test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

// 1x1 红色像素的真实 PNG。
const REAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function writeRealPng(name) {
  const filePath = path.join(tempRoot, name);
  fs.writeFileSync(filePath, Buffer.from(REAL_PNG_BASE64, "base64"));
  return filePath;
}

async function exportToWorkbook(name, task, rows) {
  const payload = buildCollectionHistoryExportPayload(task, rows);
  const filePath = path.join(tempRoot, name);
  await writeCollectionWorkbook(filePath, payload);
  return { payload, filePath };
}

function readSheetMatrix(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function collectStringCells(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const values = [];
  for (const [addr, cell] of Object.entries(sheet)) {
    if (addr.startsWith("!")) continue;
    if (typeof cell?.v === "string") values.push(cell.v);
  }
  return values;
}

async function inspectArchive(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const media = Object.keys(zip.files).filter((name) => name.startsWith("xl/media/"));
  const drawing = zip.file("xl/drawings/drawing1.xml");
  const drawingRels = zip.file("xl/drawings/_rels/drawing1.xml.rels");
  const sheetRels = zip.file("xl/worksheets/_rels/sheet1.xml.rels");
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  return {
    media,
    hasDrawing: Boolean(drawing),
    hasDrawingRels: Boolean(drawingRels),
    sheetRelsXml: sheetRels ? await sheetRels.async("string") : "",
    sheetXml,
    drawingXml: drawing ? await drawing.async("string") : "",
  };
}

const BLOGGER_ROW = {
  nickname: "测试博主",
  url: "https://www.xiaohongshu.com/user/profile/abc",
  fansCount: 12345,
  picturePrice: 2000,
  videoPrice: 3000,
  interactionRate30: "5.2%",
};

const NOTEBOOK_ROW = {
  nickname: "测试博主",
  userId: "user-1",
  fansNum: 999,
  noteLink: "https://www.xiaohongshu.com/explore/n1",
  noteId: "n1",
  title: "标题一",
  content: "内容一",
  likeNum: 10,
};

test("蒲公英博主历史任务导出：中文两行表头、字段顺序与正常导出一致", async () => {
  const rows = [BLOGGER_ROW, { ...BLOGGER_ROW, nickname: "测试博主2", fansCount: 678 }];
  const task = { taskId: "hist-blogger-1", pluginId: "pgy", taskType: "blogger", fileName: "博主.xlsx", fields: [] };
  const { payload, filePath } = await exportToWorkbook("blogger.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  // 正常导出（前端 i5）的表头 = 规范 Schema 按行数据实际出现的 key 过滤，顺序保持 Schema 顺序。
  const schema = resolveCollectionExportHeaders("pgy", "blogger");
  const expected = filterCollectionExportHeaders(schema, [], rows);
  assert.deepEqual(payload.headers.map((h) => h.key), expected.map((h) => h.key));
  assert.deepEqual(
    payload.headers.map((h) => h.key),
    ["nickname", "url", "fansCount", "interactionRate30", "picturePrice", "videoPrice"]
      .sort((a, b) => schema.findIndex((h) => h.key === a) - schema.findIndex((h) => h.key === b)),
  );

  const matrix = readSheetMatrix(filePath);
  // 第一行分组、第二行中文列名（合并单元格处第二行为 null）。
  assert.equal(matrix[0][0], "本地信息");
  const labels = payload.headers.map((h) => h.label);
  const row2 = matrix[1].map((v, i) => (v == null ? matrix[0][i] : v));
  assert.deepEqual(row2.slice(0, labels.length), labels);
  assert.equal(matrix[2][0], "测试博主");
  assert.equal(matrix[3][0], "测试博主2");
});

test("蒲公英笔记历史任务导出：中文两行表头、字段顺序与正常导出一致", async () => {
  const rows = [NOTEBOOK_ROW];
  const task = { taskId: "hist-notebook-1", pluginId: "pgy", taskType: "notebook", fileName: "笔记.xlsx", fields: [] };
  const { payload, filePath } = await exportToWorkbook("notebook.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  const schema = resolveCollectionExportHeaders("pgy", "notebook");
  const expected = filterCollectionExportHeaders(schema, [], rows);
  assert.deepEqual(payload.headers, expected.map((h) => ({ ...h })));

  const matrix = readSheetMatrix(filePath);
  const row2 = matrix[1].map((v, i) => (v == null ? matrix[0][i] : v));
  assert.deepEqual(row2.slice(0, payload.headers.length), payload.headers.map((h) => h.label));
  assert.equal(matrix[0][0], "博主信息");
  assert.equal(matrix[2][3], "https://www.xiaohongshu.com/explore/n1");
});

test("task.fields 能排除未选字段", async () => {
  const rows = [BLOGGER_ROW];
  const task = {
    taskId: "hist-fields-1",
    pluginId: "pgy",
    taskType: "blogger",
    fileName: "选字段.xlsx",
    fields: ["nickname", "fansCount"],
  };
  const { payload, filePath } = await exportToWorkbook("fields.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  assert.deepEqual(payload.headers.map((h) => h.key), ["nickname", "fansCount"]);
  const matrix = readSheetMatrix(filePath);
  const row2 = matrix[1].map((v, i) => (v == null ? matrix[0][i] : v));
  assert.deepEqual(row2.slice(0, 2), ["昵称", "粉丝数"]);
  // 未选字段（报价等）不出现在表头。
  assert.ok(!matrix[0].includes("报价数据"));
  assert.ok(!row2.includes("图文报价"));
});

test("旧任务无 fields 仍可按实际行 key 导出", async () => {
  const rows = [{ nickname: "老任务博主", fansCount: 42 }];
  const task = { taskId: "hist-nofields-1", pluginId: "pgy", taskType: "blogger", fileName: "老任务.xlsx" };
  const { payload, filePath } = await exportToWorkbook("nofields.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  assert.deepEqual(payload.headers.map((h) => h.key), ["nickname", "fansCount"]);
  const matrix = readSheetMatrix(filePath);
  const row2 = matrix[1].map((v, i) => (v == null ? matrix[0][i] : v));
  assert.deepEqual(row2.slice(0, 2), ["昵称", "粉丝数"]);
});

test("带真实本地 PNG：xl/media 非空、drawing/relationship 存在、单元格不含本地图片路径", async () => {
  const pngPath = writeRealPng("chart-real.png");
  const rows = [{ ...BLOGGER_ROW, fansProvinceChart: pngPath }];
  const task = { taskId: "hist-image-1", pluginId: "pgy", taskType: "blogger", fileName: "含图.xlsx", fields: [] };
  const { payload, filePath } = await exportToWorkbook("image.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  assert.ok(payload.headers.some((h) => h.key === "fansProvinceChart"));

  const archive = await inspectArchive(filePath);
  assert.ok(archive.media.length > 0, "xl/media 应包含嵌入图片");
  assert.ok(archive.hasDrawing, "缺少 xl/drawings/drawing1.xml");
  assert.ok(archive.hasDrawingRels, "缺少 drawing relationship");
  assert.match(archive.sheetRelsXml, /drawing1\.xml/);
  assert.match(archive.sheetXml, /<drawing r:id=/);
  assert.match(archive.drawingXml, /a:blip r:embed=/);

  // 任何单元格都不允许出现本地图片路径。
  for (const value of collectStringCells(filePath)) {
    assert.ok(!value.includes(pngPath), `单元格泄漏本地图片路径: ${value}`);
    assert.ok(!/chart-real\.png/.test(value), `单元格泄漏图片文件名: ${value}`);
  }
});

test("图片文件不存在：导出成功、对应单元格为空", async () => {
  const missingPath = path.join(tempRoot, "missing-chart.png");
  const rows = [{ ...BLOGGER_ROW, fansProvinceChart: missingPath }];
  const task = { taskId: "hist-missing-1", pluginId: "pgy", taskType: "blogger", fileName: "缺图.xlsx", fields: [] };
  const { payload, filePath } = await exportToWorkbook("missing-image.xlsx", task, rows);

  assert.equal(payload.mode, "two-row");
  const col = payload.headers.findIndex((h) => h.key === "fansProvinceChart");
  assert.ok(col >= 0);
  const matrix = readSheetMatrix(filePath);
  const cell = matrix[2][col];
  assert.ok(cell === "" || cell == null, `图片缺失时单元格应为空，实际为: ${JSON.stringify(cell)}`);
  for (const value of collectStringCells(filePath)) {
    assert.ok(!value.includes("missing-chart.png"), `单元格泄漏缺失图片路径: ${value}`);
  }
});

test("未命中规范 Schema 的 legacy 任务保持单行兼容导出", async () => {
  const rows = [{ 字段A: "甲", 字段B: "乙" }];
  const task = {
    taskId: "legacy-v2-abc",
    pluginId: "",
    taskType: "",
    fileName: "legacy.xlsx",
    inputType: "legacy-localStorage",
  };
  const { payload, filePath } = await exportToWorkbook("legacy.xlsx", task, rows);

  assert.equal(payload.mode, undefined);
  assert.equal(payload.headers, undefined);
  const matrix = readSheetMatrix(filePath);
  // 单行表头 = 行对象的原始 key。
  assert.deepEqual(matrix[0], ["字段A", "字段B"]);
  assert.deepEqual(matrix[1], ["甲", "乙"]);
});

test("starmap 与 douyin 历史导出同样命中规范中文 Schema", async () => {
  const starmapRows = [{ 主页链接: "https://www.douyin.com/user/x", 昵称: "达人", 粉丝数: 100 }];
  const starmapPayload = buildCollectionHistoryExportPayload(
    { taskId: "hist-star-1", pluginId: "starmap", taskType: "blogger", fileName: "星图.xlsx", fields: [] },
    starmapRows,
  );
  assert.equal(starmapPayload.mode, "two-row");
  assert.deepEqual(starmapPayload.headers.map((h) => h.key), ["主页链接", "昵称", "粉丝数"]);

  const douyinPayload = buildCollectionHistoryExportPayload(
    { taskId: "hist-dy-1", pluginId: "douyin", taskType: "blogger", fileName: "抖音.xlsx", fields: [] },
    starmapRows,
  );
  assert.equal(douyinPayload.mode, "two-row");
  assert.deepEqual(douyinPayload.headers.map((h) => h.key), ["主页链接", "昵称", "粉丝数"]);
});

test("正常任务面板导出（two-row 直传）无回归", async () => {
  const pngPath = writeRealPng("chart-normal.png");
  const schema = resolveCollectionExportHeaders("pgy", "blogger");
  const rows = [{ ...BLOGGER_ROW, fansProvinceChart: pngPath }];
  const headers = filterCollectionExportHeaders(schema, [], rows);
  const filePath = path.join(tempRoot, "normal-panel.xlsx");
  // 正常导出链路：渲染端直接携带 mode/headers 调用导出（与 ff 入参一致）。
  await writeCollectionWorkbook(filePath, {
    taskId: "panel-1",
    fileName: "panel.xlsx",
    mode: "two-row",
    headers,
    data: rows,
  });
  const matrix = readSheetMatrix(filePath);
  const row2 = matrix[1].map((v, i) => (v == null ? matrix[0][i] : v));
  assert.deepEqual(row2.slice(0, headers.length), headers.map((h) => h.label));
  const archive = await inspectArchive(filePath);
  assert.ok(archive.media.length > 0);
  for (const value of collectStringCells(filePath)) {
    assert.ok(!value.includes("chart-normal.png"));
  }
});
