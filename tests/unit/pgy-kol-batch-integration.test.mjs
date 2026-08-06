// 蒲公英“找博主”Phase 4 集成测试（主代理维护）。
//
// 组合真实模块（task-store + batch-runner + column-registry + batch-export），
// 覆盖契约单测之外的跨包行为：
// - 分片跨叶子重复 UID 的全局去重
// - 异常退出（叶子失败）后新 runner 实例幂等恢复，不重复写行
// - 真实 xlsx 全量导出（远超任何预览上限）、重启后导出、控制字符清洗
// - 任务目录敏感键扫描（cookie/token/x-s/x-t 永不落盘）

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PgyKolTaskStore } from "../../app-source/pgy-kol/pgy-kol-task-store.mjs";
import { createPgyKolBatchRunner } from "../../app-source/pgy-kol/pgy-kol-batch-runner.mjs";
import { PgyPaginationPlanner } from "../../app-source/pgy-kol/pgy-pagination-planner.mjs";
import { buildPgyKolBatchExportPayload } from "../../app-source/pgy-kol/pgy-kol-batch-export.mjs";
import { writeCollectionWorkbook } from "../helpers/collection-xlsx-writer.mjs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireApp = createRequire(pathToFileURL(path.join(root, "app-source", "package.json")));
const XLSX = requireApp("xlsx-js-style");

const planner = new PgyPaginationPlanner({ schema: { getField: () => ({ exclusive: true }) } });

let tmpCounter = 0;
function tmpDir(label) {
  tmpCounter += 1;
  const dir = path.join(os.tmpdir(), `pgy-kol-batch-integration-${process.pid}-${tmpCounter}-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

function makeKols(start, count) {
  const kols = [];
  for (let i = 0; i < count; i += 1) {
    kols.push({ userId: `uid-${start + i}`, nickname: `博主${start + i}`, fansNum: 1000 + i });
  }
  return kols;
}

async function createTask(store, taskId, filterState, budgets = {}) {
  await store.createTask({
    taskId,
    filterState,
    columns: ["userId", "nickname", "fansNum"],
    pageSize: 20,
    budgets: { maxLeaves: 16, maxDepth: 6, maxPagesPerLeaf: 250, queryBudget: 400, ...budgets },
  });
}

function runnerFor(store, search, overrides = {}) {
  return createPgyKolBatchRunner({
    store,
    search,
    buildPayload: (filterState, { pageNum, pageSize }) => ({ ...filterState, pageNum, pageSize }),
    planSplit: (filterState) => planner.planSplit({ filterState }),
    analyzePageSequence: (options) => planner.analyzePageSequence(options),
    ...overrides,
  });
}

test("分片跨叶子重复 UID：全局去重只计一次唯一，重复数正确", async () => {
  const store = new PgyKolTaskStore({ baseDir: tmpDir("cross-leaf-dup") });
  await store.initialize();
  await createTask(store, "pgykol-xdup-1", { fansNumberLower: 10000, fansNumberUpper: 20000 });

  const runner = runnerFor(store, {
    searchPage: async ({ payload }) => {
      const lower = payload.fansNumberLower;
      const upper = payload.fansNumberUpper;
      if (lower === 10000 && upper === 20000) {
        // 根叶子触顶。
        return { total: 5000, kols: makeKols(1, 20), pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: true, reason: "total-window" } };
      }
      if (lower === 10000 && upper === 15000) {
        // 子叶子 A：与根叶子有 10 个重复 UID（uid-1..uid-10），新增 5 个。
        // total 按可收集唯一数（fresh reviewer C2）：5。
        return { total: 5, kols: [...makeKols(1, 10), ...makeKols(9000, 5)], pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: false, reason: null } };
      }
      // 子叶子 B：与子叶子 A 有 3 个重复 UID（uid-9001..9003），新增 12 个。
      // total 按可收集唯一数：12。
      return { total: 12, kols: [...makeKols(9001, 3), ...makeKols(8000, 12)], pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: false, reason: null } };
    },
  });
  await runner.start("pgykol-xdup-1");

  const task = await store.getTask("pgykol-xdup-1");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  // 根 20 + A 5 新增 + B 12 新增 = 37 唯一；raw = 20 + 15 + 15 = 50；dup = 10 + 3 = 13。
  assert.equal(task.counts.raw, 50);
  assert.equal(task.counts.unique, 37);
  assert.equal(task.counts.dup, 13);
  const rows = await store.getRows("pgykol-xdup-1");
  assert.equal(rows.length, 50);
});

test("异常退出（叶子失败）→ 新 runner 实例幂等恢复：已提交页不重抓、不重复写行", async () => {
  const baseDir = tmpDir("crash-resume");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await createTask(store, "pgykol-crash-1", {});

  let failNext = true;
  const searchImpl = async ({ payload }) => {
    if (payload.pageNum === 2 && failNext) {
      const error = new Error("boom");
      error.kind = "transport";
      throw error;
    }
    const kols = payload.pageNum === 1 ? makeKols(1, 20) : makeKols(21, 15);
    return { total: 35, kols, pageNum: payload.pageNum, pageSize: payload.pageSize, code: 0, capSignal: { capped: false, reason: null } };
  };

  const runner1 = runnerFor(store, { searchPage: searchImpl });
  await runner1.start("pgykol-crash-1");
  let task = await store.getTask("pgykol-crash-1");
  assert.equal(task.status, "failed");
  assert.equal(task.completeness, "cannot-prove");
  assert.equal(task.counts.raw, 20);

  // “重启”：同一目录新建 store 与 runner；失败条件消失。
  failNext = false;
  const freshStore = new PgyKolTaskStore({ baseDir });
  await freshStore.initialize();
  const runner2 = runnerFor(freshStore, { searchPage: searchImpl });
  await runner2.start("pgykol-crash-1");
  task = await freshStore.getTask("pgykol-crash-1");
  assert.equal(task.status, "completed");
  assert.equal(task.completeness, "complete");
  assert.equal(task.counts.raw, 35);
  const rows = await freshStore.getRows("pgykol-crash-1");
  assert.equal(rows.length, 35, "恢复后不得重复写入已提交页的行");
});

test("真实 xlsx：500 行全量导出、中文表头、控制字符清洗、重启后仍可导出", async () => {
  const baseDir = tmpDir("xlsx-full");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await createTask(store, "pgykol-xlsx-1", {});
  await store.addLeaf("pgykol-xlsx-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [], nextPageNum: 1, total: 500, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  // 500 行（25 页 × 20），含控制字符与缺 UID 行。
  for (let page = 1; page <= 25; page += 1) {
    const rows = Array.from({ length: 20 }, (_, index) => {
      const globalIndex = (page - 1) * 20 + index;
      const missingUid = globalIndex === 250;
      return {
        uid: missingUid ? null : `x-${globalIndex}`,
        fields: {
          // 缺 UID 行与真实响应一致：userId 字段缺失（搜索客户端只保留实际存在的键）。
          ...(missingUid ? {} : { userId: `x-${globalIndex}` }),
          nickname: `博主${globalIndex}\u0001\u001f`,
          fansNum: 1000 + globalIndex,
        },
      };
    });
    await store.appendPageRows("pgykol-xlsx-1", { leafId: "L0", pageNum: page, rows });
    await store.commitPage("pgykol-xlsx-1", {
      leafId: "L0",
      pageNum: page,
      summary: { rawCount: 20, uniqueCount: 19, dupCount: 0, missingUidCount: 1 },
    });
  }
  const task = await store.getTask("pgykol-xlsx-1");
  const rows = await store.getRows("pgykol-xlsx-1");
  assert.equal(rows.length, 500);

  const payload = buildPgyKolBatchExportPayload(task, rows);
  assert.deepEqual(payload.headers.map((header) => header.key), ["userId", "nickname", "fansNum"]);
  assert.deepEqual(payload.headers.map((header) => header.label), ["博主UID", "昵称", "粉丝数"]);
  assert.equal(payload.data.length, 500);

  const filePath = path.join(tmpDir("xlsx-out"), "full.xlsx");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await writeCollectionWorkbook(filePath, payload);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  assert.equal(matrix.length, 502, "两行表头 + 500 行数据");
  assert.equal(matrix[1][0], "博主UID");
  assert.equal(matrix[1][1], "昵称");
  assert.equal(matrix[1][2], "粉丝数");
  // 控制字符必须被清洗（\u0001 与 \u001f 不应出现在任何单元格）。
  for (let row = 2; row < matrix.length; row += 1) {
    const nickname = matrix[row][1];
    assert.ok(typeof nickname !== "string" || !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(nickname), "控制字符必须被清洗");
  }
  // 缺 UID 行仍然导出（数据不丢），只是不计入唯一数。
  assert.ok(matrix.some((cells) => cells[0] == null || cells[0] === "-" || cells[0] === ""), "缺 UID 行应保留在导出中");

  // 重启后导出：新 store 实例从持久化重建。
  const fresh = new PgyKolTaskStore({ baseDir });
  await fresh.initialize();
  const freshRows = await fresh.getRows("pgykol-xlsx-1");
  assert.equal(freshRows.length, 500);
  const freshTask = await fresh.getTask("pgykol-xlsx-1");
  const freshPayload = buildPgyKolBatchExportPayload(freshTask, freshRows);
  assert.equal(freshPayload.data.length, 500);
  assert.deepEqual(freshPayload.headers.map((header) => header.key), ["userId", "nickname", "fansNum"]);
});

test("任务目录敏感扫描：cookie/token/authorization/x-s/x-t 永不落盘", async () => {
  const baseDir = tmpDir("secret-scan");
  const store = new PgyKolTaskStore({ baseDir });
  await store.initialize();
  await store.createTask({ taskId: "pgykol-secret-1", filterState: {}, columns: ["userId"], pageSize: 20, budgets: {} });
  await store.addLeaf("pgykol-secret-1", {
    leafId: "L0", depth: 0, parentId: null, range: null, filterState: {}, status: "running",
    pagesCompleted: [], nextPageNum: 1, total: 1, capSignal: null,
    rawCount: 0, uniqueCount: 0, dupCount: 0, missingUidCount: 0, failure: null,
  });
  await store.appendPageRows("pgykol-secret-1", {
    leafId: "L0", pageNum: 1,
    rows: [
      {
        uid: "u1",
        fields: {
          userId: "u1",
          nickname: "安全博主",
          cookie: "session=topsecret",
          Authorization: "Bearer abc123",
          "X-s": "sigvalue",
          "X-t": "123456",
          token: "tok",
        },
      },
    ],
  });
  await store.commitPage("pgykol-secret-1", {
    leafId: "L0", pageNum: 1,
    summary: { rawCount: 1, uniqueCount: 1, dupCount: 0, missingUidCount: 0 },
  });

  const taskDir = path.join(baseDir, "pgykol-secret-1");
  for (const fileName of fs.readdirSync(taskDir)) {
    const text = fs.readFileSync(path.join(taskDir, fileName), "utf8");
    assert.ok(!/cookie|authorization|Bearer|topsecret|x-s|x-t|"token"/i.test(text), `${fileName} 不得包含敏感字段`);
    assert.ok(!text.includes("sigvalue"), `${fileName} 不得包含签名值`);
  }
});
