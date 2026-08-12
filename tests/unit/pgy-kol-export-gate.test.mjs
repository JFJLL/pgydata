// 找博主“一次完整采集”导出完成门闸测试。
//
// 需求：search-batch 来源的详情任务只有 status=completed 且计数收口
// （successCount + failedCount === total，且无 pending charge）后才允许导出；
// preparing/running/paused/interrupted/auth_expired 一律拒绝（task-not-complete）。
// 其他采集类型（手动导入/xlsx 等）保持原有行为，不受影响。

import test from "node:test";
import assert from "node:assert/strict";

import {
  isCollectionTaskExportReady,
} from "../../app-source/electron-main/collection-history-store.mjs";

function searchBatchTask(overrides = {}) {
  return {
    taskId: "pgykol-detail-gate-1",
    pluginId: "pgy",
    taskType: "blogger",
    inputType: "search-batch",
    status: "running",
    total: 205,
    successCount: 1,
    failedCount: 0,
    pendingChargeCount: 0,
    ...overrides,
  };
}

test("running 详情任务（1/205）导出必须被拒绝", () => {
  // 回归：detail 进度 1/205 时导出只得到第一行的问题；完成门闸已生效，
  // running 必须返回 false（task-not-complete）。
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "running", successCount: 1 })),
    false,
    "running（1/205）必须拒绝导出",
  );
});

test("search-batch 导出状态矩阵：preparing/running/paused/interrupted/auth_expired 拒绝", () => {
  for (const status of ["running", "paused", "interrupted", "auth_expired"]) {
    assert.equal(
      isCollectionTaskExportReady(searchBatchTask({ status })),
      false,
      `search-batch ${status} 必须拒绝导出`,
    );
  }
  // preparing 形态：total=0、urls 未填充（发现阶段）。
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "running", total: 0, successCount: 0 })),
    false,
    "preparing（total=0）必须拒绝导出",
  );
  // 计数未收口：失败项未计入。
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "completed", successCount: 200, failedCount: 0 })),
    false,
    "completed 但 200+0≠205 必须拒绝",
  );
  // 存在 pending charge（扣费未确认）必须拒绝。
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "completed", successCount: 204, failedCount: 1, pendingChargeCount: 1 })),
    false,
    "pending charge 未清必须拒绝",
  );
});

test("search-batch 完成且计数收口才允许导出；total=0 永不导出", () => {
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "completed", successCount: 200, failedCount: 5 })),
    true,
    "completed 且 200+5=205、无 pending charge 必须允许",
  );
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "completed", successCount: 205, failedCount: 0 })),
    true,
    "全部成功同样允许",
  );
  assert.equal(
    isCollectionTaskExportReady(searchBatchTask({ status: "completed", total: 0, successCount: 0, failedCount: 0 })),
    false,
    "total=0（无博主）不允许导出",
  );
});

test("非 search-batch 类型不受完成门闸影响（保持原有行为）", () => {
  const manual = {
    taskId: "manual-1",
    pluginId: "pgy",
    taskType: "blogger",
    inputType: "manual",
    status: "running",
    total: 10,
    successCount: 3,
    failedCount: 0,
    pendingChargeCount: 0,
  };
  assert.equal(isCollectionTaskExportReady(manual), true, "手动输入类型 running 仍允许导出已采集内容");
  const xlsx = { ...manual, inputType: "xlsx", status: "paused" };
  assert.equal(isCollectionTaskExportReady(xlsx), true, "xlsx 类型 paused 仍允许导出已采集内容");
  // 无 inputType（legacy）视为非 search-batch。
  const legacy = { ...manual, inputType: "" };
  assert.equal(isCollectionTaskExportReady(legacy), true);
});
