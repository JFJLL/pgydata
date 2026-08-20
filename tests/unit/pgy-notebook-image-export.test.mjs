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
  PGY_IMAGE_EXPORT_FIELDS,
} from "../../app-source/electron-main/collection-export-headers.mjs";
import {
  writeCollectionWorkbook,
  expandNotebookImageHeaders,
  isPgyImageKey,
} from "../helpers/collection-xlsx-writer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireApp = createRequire(pathToFileURL(path.join(root, "app-source", "package.json")));
const XLSX = requireApp("xlsx-js-style");
const JSZip = requireApp("jszip");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pgy-notebook-export-test-"));
test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const REAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function writeTestPng(name) {
  const filePath = path.join(tempRoot, name);
  fs.writeFileSync(filePath, Buffer.from(REAL_PNG_BASE64, "base64"));
  return filePath;
}

function readSheetMatrix(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

async function inspectArchive(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const media = Object.keys(zip.files).filter((name) => name.startsWith("xl/media/"));
  const drawing = zip.file("xl/drawings/drawing1.xml");
  const drawingRels = zip.file("xl/drawings/_rels/drawing1.xml.rels");
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  return {
    media,
    hasDrawing: Boolean(drawing),
    hasDrawingRels: Boolean(drawingRels),
    sheetXml,
    drawingXml: drawing ? await drawing.async("string") : "",
  };
}

test("蒲公英笔记字段定义：包含封面图与笔记图字段", () => {
  const schema = resolveCollectionExportHeaders("pgy", "notebook");
  assert.ok(Array.isArray(schema), "notebook schema must exist");
  const coverHeader = schema.find((h) => h.key === "coverImage");
  assert.deepEqual(coverHeader, { group: "笔记内容", label: "封面图", key: "coverImage" });
  const noteImagesHeader = schema.find((h) => h.key === "noteImages");
  assert.deepEqual(noteImagesHeader, { group: "笔记内容", label: "笔记图", key: "noteImages" });
  assert.ok(PGY_IMAGE_EXPORT_FIELDS.includes("coverImage"));
  assert.ok(PGY_IMAGE_EXPORT_FIELDS.includes("noteImages"));
  assert.ok(isPgyImageKey("coverImage"));
  assert.ok(isPgyImageKey("noteImages"));
  assert.ok(isPgyImageKey("noteImage_1"));
  assert.ok(isPgyImageKey("noteImage_5"));
  const dynamic = expandNotebookImageHeaders(
    [{ group: "笔记内容", label: "笔记图", key: "noteImages" }],
    [{ noteImages: Array.from({ length: 31 }, (_, index) => "image-" + (index + 1) + ".png") }],
  );
  assert.equal(dynamic.headers.at(-1).key, "noteImage_31", "笔记图列不应被固定数量截断");
});

test("历史导出遗漏图片表头时，结果行图片必须自动补列并嵌入", async () => {
  const cover = writeTestPng("legacy_header_cover.png");
  const note = writeTestPng("legacy_header_note.png");
  const payload = {
    mode: "two-row",
    headers: [{ group: "博主信息", label: "博主昵称", key: "nickname" }],
    data: [{ nickname: "历史任务博主", coverImage: cover, noteImages: [note] }],
  };
  const expanded = expandNotebookImageHeaders(payload.headers, payload.data);
  assert.deepEqual(expanded.headers.map((header) => header.key), ["nickname", "coverImage", "noteImage_1"]);
  const filePath = path.join(tempRoot, "legacy_header_images.xlsx");
  await writeCollectionWorkbook(filePath, payload);
  const archive = await inspectArchive(filePath);
  assert.equal(archive.media.filter((m) => m !== "xl/media/").length, 2, "封面图和笔记图都必须嵌入");
  const matrix = readSheetMatrix(filePath);
  assert.deepEqual(matrix[1].slice(0, 3), ["博主昵称", "封面图", "笔记图"]);
  assert.ok(archive.hasDrawing, "遗漏表头场景也必须生成绘图对象");
});

test("笔记采集运行时：图片字段必须来自真实详情响应并使用登录浏览器会话下载", () => {
  const runtimeSource = fs.readFileSync(path.join(root, "app-source", "dist-electron", "index.js"), "utf8");
  assert.match(runtimeSource, /const imageUrls = \[\]/);
  assert.match(runtimeSource, /for \(const imageList of \[h\.imagesList, h\.imageList, h\.images\]\)/);
  assert.match(runtimeSource, /pgyFetchImageBuffer/);
  assert.match(runtimeSource, /credentials: "include"/);
  assert.match(runtimeSource, /coverImage: localCoverPath/);
  assert.match(runtimeSource, /noteImages: noteImgPaths/);
  assert.match(runtimeSource, /data: en\(f, r, \{ noteImages: \["noteImages"\] \}\)/);
  assert.match(runtimeSource, /pgy notebook direct export canonical payload/);
  assert.match(runtimeSource, /a = buildCollectionHistoryExportPayload\(pgyHistoryTask, pgyHistoryRows\)/);
});

test("蒲公英笔记图文与视频导出：封面图及多张笔记图独立占单元格，视频笔记无笔记图", async () => {
  const cover1 = writeTestPng("note1_cover.png");
  const note1_img1 = writeTestPng("note1_img1.png");
  const note1_img2 = writeTestPng("note1_img2.png");
  const note1_img3 = writeTestPng("note1_img3.png");
  const cover2 = writeTestPng("note2_video_cover.png");
  const cover3 = writeTestPng("note3_cover.png");
  const note3_img1 = writeTestPng("note3_img1.png");
  const note3_img2 = writeTestPng("note3_img2.png");

  const rows = [
    {
      nickname: "图文博主A",
      title: "图文笔记1",
      coverImage: cover1,
      noteImages: [note1_img1, note1_img2, note1_img3],
      likeNum: 100,
    },
    {
      nickname: "视频博主B",
      title: "视频笔记2",
      coverImage: cover2,
      noteImages: [],
      likeNum: 200,
    },
    {
      nickname: "图文博主C",
      title: "图文笔记3",
      coverImage: cover3,
      noteImages: [note3_img1, note3_img2],
      likeNum: 300,
    },
  ];

  const task = {
    taskId: "task-notebook-img-1",
    pluginId: "pgy",
    taskType: "notebook",
    fileName: "笔记多图导出测试.xlsx",
    fields: ["nickname", "title", "coverImage", "noteImages", "likeNum"],
  };

  const payload = buildCollectionHistoryExportPayload(task, rows);
  const filePath = path.join(tempRoot, "notebook_images.xlsx");
  await writeCollectionWorkbook(filePath, payload);
  const archive = await inspectArchive(filePath);
  const mediaFiles = archive.media.filter((m) => m !== "xl/media/");
  assert.equal(mediaFiles.length, 8, "media folder must contain exactly 8 embedded images");

  const matrix = readSheetMatrix(filePath);
  // 验证两行表头：
  // Row 0: 分组行
  // Row 1: 列名行
  assert.equal(matrix[0][0], "博主信息");
  assert.equal(matrix[0][1], "笔记内容");
  assert.equal(matrix[0][6], "数据指标");

  assert.equal(matrix[1][0], "博主昵称");
  assert.equal(matrix[1][1], "笔记标题");
  assert.equal(matrix[1][2], "封面图");
  assert.equal(matrix[1][3], "笔记图 1");
  assert.equal(matrix[1][4], "笔记图 2");
  assert.equal(matrix[1][5], "笔记图 3");
  assert.equal(matrix[1][6], "点赞数");

  // 验证行数据文本不包含本地路径：
  assert.equal(matrix[2][0], "图文博主A");
  assert.equal(matrix[2][1], "图文笔记1");
  assert.equal(matrix[2][2], ""); // 封面图单元格留白用于放图
  assert.equal(matrix[2][3], ""); // 笔记图1
  assert.equal(matrix[2][4], ""); // 笔记图2
  assert.equal(matrix[2][5], ""); // 笔记图3
  assert.equal(matrix[2][6], 100);

  // 视频笔记：封面图有图，笔记图1/2/3全部留空且不包含任何图
  assert.equal(matrix[3][0], "视频博主B");
  assert.equal(matrix[3][1], "视频笔记2");
  assert.equal(matrix[3][2], ""); // 视频封面图
  assert.equal(matrix[3][3], "-"); // 视频笔记图1为空
  assert.equal(matrix[3][4], "-"); // 视频笔记图2为空
  assert.equal(matrix[3][5], "-"); // 视频笔记图3为空
  assert.equal(matrix[3][6], 200);

  assert.ok(archive.hasDrawing, "drawing1.xml must exist");
  assert.ok(archive.hasDrawingRels, "drawing1.xml.rels must exist");
});

test("前端模板名称弹窗：确保聚焦策略与防重复渲染逻辑完备", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "app-source", "package.json"), "utf8"));
  const selectorBundlePath = path.join(root, "assets", pkg.assetsVersion, "assets", "index-IS4kgrUy.js");
  const selectorSource = fs.readFileSync(selectorBundlePath, "utf8");
  assert.match(selectorSource, /disableEnforceFocus:!0,disableRestoreFocus:!0/, "SaveAs dialog must have disableEnforceFocus and disableRestoreFocus");
  assert.match(selectorSource, /maxWidth:"md",fullWidth:!0,disableEnforceFocus:!0/, "Field selector modal must have disableEnforceFocus");
  assert.match(selectorSource, /bRef=c\.useRef\(!1\);c\.useEffect\(\(\)=>\{!bRef\.current&&t&&\(f\(n\),o\(!1\)\),bRef\.current=t\},\[t,n\]\)/, "SaveAs dialog must guard against re-render resets");
});
