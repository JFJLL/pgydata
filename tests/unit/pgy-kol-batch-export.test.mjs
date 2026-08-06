// 蒲公英“找博主”批量导出 Payload 测试（Phase 4 工作包 B）。
// 用 tests/helpers/collection-xlsx-writer.mjs 写真实 .xlsx 并解压/读回断言：
// 全量导出（500 行）、中文两行表头、列顺序=用户选择、控制字符清洗、
// 敏感键永不导出、任务重启后仍可导出、列选择快照不漂移。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";
import { buildPgyKolBatchExportPayload } from "../../app-source/pgy-kol/pgy-kol-batch-export.mjs";
import { writeCollectionWorkbook } from "../helpers/collection-xlsx-writer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireApp = createRequire(pathToFileURL(path.join(root, "app-source", "package.json")));
const XLSX = requireApp("xlsx-js-style");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pgy-kol-batch-export-"));
test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function makeLeaf(overrides = {}) {
  return {
    leafId: "L0",
    depth: 0,
    parentId: null,
    range: null,
    filterState: {},
    status: "pending",
    pagesCompleted: [],
    nextPageNum: 1,
    total: null,
    capSignal: null,
    rawCount: 0,
    uniqueCount: 0,
    dupCount: 0,
    missingUidCount: 0,
    failure: null,
    ...overrides,
  };
}

async function seedFullTask(store, taskId, { columns, pageSize = 20, pages, rowFactory } = {}) {
  await store.createTask({ taskId, filterState: {}, columns, pageSize, budgets: {} });
  await store.addLeaf(taskId, makeLeaf());
  for (let page = 1; page <= pages; page += 1) {
    const rows = [];
    for (let indexInPage = 0; indexInPage < pageSize; indexInPage += 1) {
      const index = (page - 1) * pageSize + indexInPage;
      rows.push(rowFactory ? rowFactory(index) : {});
    }
    await store.appendPageRows(taskId, { leafId: "L0", pageNum: page, rows });
    await store.commitPage(taskId, {
      leafId: "L0",
      pageNum: page,
      summary: { rawCount: rows.length, uniqueCount: rows.length, dupCount: 0, missingUidCount: 0 },
    });
  }
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

async function writeWorkbook(name, payload) {
  const filePath = path.join(tempRoot, name);
  await writeCollectionWorkbook(filePath, payload);
  return filePath;
}

test("全量 500 行导出：真实 xlsx、中文两行表头、列顺序=用户选择", async (t) => {
  const storeDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pgy-kol-batch-export-store-"));
  t.after(() => fs.rmSync(storeDir, { recursive: true, force: true }));
  const store = new PgyKolTaskStore({ baseDir: storeDir });
  await store.initialize();
  const taskId = "pgykol-export-big";
  const columns = ["nickname", "userId", "fansNum", "picturePrice", "videoPrice", "location", "gender"];
  await seedFullTask(store, taskId, {
    columns,
    pages: 25,
    rowFactory: (index) => ({
      uid: `u${index}`,
      fields: {
        userId: `u${index}`,
        nickname: `博主${index}`,
        fansNum: 1000 + index,
        picturePrice: `${800 + index}元`,
        videoPrice: `${1500 + index}元`,
        location: "上海",
        gender: "女",
      },
    }),
  });

  const task = await store.getTask(taskId);
  const rows = await store.getRows(taskId);
  assert.equal(rows.length, 500);
  const payload = buildPgyKolBatchExportPayload(task, rows);
  assert.equal(payload.taskId, taskId);
  assert.equal(payload.fileName, `${taskId}.xlsx`);
  assert.equal(payload.mode, "two-row");
  assert.deepEqual(payload.headers.map((header) => header.key), columns);
  assert.deepEqual(payload.headers.map((header) => header.label), [
    "昵称", "博主UID", "粉丝数", "图文报价", "视频报价", "地域", "性别",
  ]);
  assert.equal(payload.data.length, 500);

  const filePath = await writeWorkbook("big-500.xlsx", payload);
  const matrix = readSheetMatrix(filePath);
  assert.equal(matrix.length, 2 + 500);
  const row2 = matrix[1].map((value, col) => (value == null ? matrix[0][col] : value));
  assert.deepEqual(row2.slice(0, columns.length), payload.headers.map((header) => header.label));
  assert.equal(matrix[2][0], "博主0");
  assert.equal(matrix[2][1], "u0");
  assert.equal(matrix[501][0], "博主499");
  assert.equal(matrix[501][1], "u499");
});

test("控制字符在导出前清洗，未选列绝不进入 data", async () => {
  const task = { taskId: "pgykol-export-ctl", fileName: "ctl.xlsx", columns: ["nickname", "fansNum"] };
  const rows = [
    { leafId: "L0", pageNum: 1, uid: "u1", fields: { nickname: "甲\u0000乙\u000b丙", userId: "u1", fansNum: 100, videoPrice: 999 } },
    { leafId: "L0", pageNum: 1, uid: "u2", fields: { nickname: "丁", userId: "u2", fansNum: 200 } },
  ];
  const payload = buildPgyKolBatchExportPayload(task, rows);
  assert.equal(payload.data[0].nickname, "甲乙丙");
  assert.deepEqual(Object.keys(payload.data[0]), ["nickname", "fansNum"]);
  assert.ok(!("videoPrice" in payload.data[0]));
  assert.ok(!("userId" in payload.data[0]));

  const filePath = await writeWorkbook("ctl.xlsx", payload);
  const cells = collectStringCells(filePath);
  assert.ok(cells.includes("甲乙丙"));
  for (const value of cells) {
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), `控制字符泄漏: ${JSON.stringify(value)}`);
  }
});

test("敏感键永不导出：store 隔离 → payload → xlsx 全链路", async (t) => {
  const storeDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pgy-kol-batch-export-sec-"));
  t.after(() => fs.rmSync(storeDir, { recursive: true, force: true }));
  const store = new PgyKolTaskStore({ baseDir: storeDir });
  await store.initialize();
  const taskId = "pgykol-export-sec";
  await store.createTask({ taskId, filterState: {}, columns: ["userId", "nickname"], pageSize: 20, budgets: {} });
  await store.addLeaf(taskId, makeLeaf());
  await store.appendPageRows(taskId, {
    leafId: "L0",
    pageNum: 1,
    rows: [{
      uid: "u1",
      fields: {
        userId: "u1",
        nickname: "甲",
        cookie: "secret=1",
        Authorization: "Bearer x",
        "X-s": "sig",
        "X-t": "123",
      },
    }],
  });
  await store.commitPage(taskId, {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 },
  });
  const payload = buildPgyKolBatchExportPayload(await store.getTask(taskId), await store.getRows(taskId));
  assert.deepEqual(payload.headers.map((header) => header.key), ["userId", "nickname"]);
  const filePath = await writeWorkbook("sec.xlsx", payload);
  for (const value of collectStringCells(filePath)) {
    assert.ok(!value.includes("secret"));
    assert.ok(!value.includes("Bearer"));
    assert.ok(!value.includes("sig"));
    assert.ok(!value.includes("123"));
  }
});

test("任务重启（新 store 实例重建）后仍能导出，列选择快照不漂移", async (t) => {
  const storeDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pgy-kol-batch-export-restart-"));
  t.after(() => fs.rmSync(storeDir, { recursive: true, force: true }));
  const columns = ["nickname", "userId", "fansNum"];
  const store = new PgyKolTaskStore({ baseDir: storeDir });
  await store.initialize();
  const taskId = "pgykol-export-restart";
  await store.createTask({ taskId, filterState: {}, columns, pageSize: 20, budgets: {}, fileName: "重启导出.xlsx" });
  await store.addLeaf(taskId, makeLeaf());
  await store.appendPageRows(taskId, {
    leafId: "L0",
    pageNum: 1,
    rows: [
      { uid: "u1", fields: { nickname: "甲", userId: "u1", fansNum: 100 } },
      { uid: "u2", fields: { nickname: "乙", userId: "u2", fansNum: 200, location: "北京" } },
    ],
  });
  await store.commitPage(taskId, {
    leafId: "L0",
    pageNum: 1,
    summary: { rawCount: 2, uniqueCount: 2, dupCount: 0, missingUidCount: 0 },
  });
  const firstPayload = buildPgyKolBatchExportPayload(
    await store.getTask(taskId),
    await store.getRows(taskId),
  );

  const fresh = new PgyKolTaskStore({ baseDir: storeDir });
  await fresh.initialize();
  const task = await fresh.getTask(taskId);
  assert.deepEqual(task.columns, columns, "task.columns 快照不得漂移");
  const rows = await fresh.getRows(taskId);
  assert.equal(rows.length, 2);
  const secondPayload = buildPgyKolBatchExportPayload(task, rows);
  assert.equal(secondPayload.fileName, "重启导出.xlsx");
  assert.deepEqual(secondPayload.headers, firstPayload.headers);
  assert.deepEqual(secondPayload.data, firstPayload.data);
  assert.deepEqual(Object.keys(secondPayload.data[0]), columns);

  const filePath = await writeWorkbook("restart.xlsx", secondPayload);
  const matrix = readSheetMatrix(filePath);
  const row2 = matrix[1].map((value, col) => (value == null ? matrix[0][col] : value));
  assert.deepEqual(row2.slice(0, columns.length), ["昵称", "博主UID", "粉丝数"]);
  assert.equal(matrix[2][0], "甲");
  assert.equal(matrix[3][0], "乙");
  // 未选列（location）不得出现在表头或任何单元格。
  assert.ok(!row2.includes("地域"));
  assert.ok(!JSON.stringify(matrix).includes("北京"));
});

test("任何行都未出现的已选列被过滤（present 语义），空行不产生列", () => {
  const task = { taskId: "pgykol-export-present", columns: ["nickname", "fansNum", "gender"] };
  const rows = [
    { leafId: "L0", pageNum: 1, uid: "u1", fields: { nickname: "甲", fansNum: 1 } },
  ];
  const payload = buildPgyKolBatchExportPayload(task, rows);
  assert.deepEqual(payload.headers.map((header) => header.key), ["nickname", "fansNum"]);
  assert.deepEqual(Object.keys(payload.data[0]), ["nickname", "fansNum"]);

  const emptyPayload = buildPgyKolBatchExportPayload({ taskId: "pgykol-export-empty", columns: ["nickname"] }, []);
  assert.deepEqual(emptyPayload.headers, []);
  assert.deepEqual(emptyPayload.data, []);
  assert.equal(emptyPayload.fileName, "pgykol-export-empty.xlsx");
});
