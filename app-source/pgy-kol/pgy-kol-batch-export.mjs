// 蒲公英“找博主”批量导出 Payload 构建（Phase 5 工作包）。
//
// 职责：从持久化全量行（store.getRows 的产物 [{leafId,pageNum,uid,fields}]）构建
// 与前端正常导出一致的两行表头 Payload：
//   { taskId, fileName, mode:"two-row", headers:[{group,label,key}], data:[{列key:值}] }
// - headers 顺序 = task.columns（用户选择顺序）；未知/固定/无数据源/不可用列由列注册表抛错；
// - 任何行都未出现的已选列被过滤（与 filterCollectionExportHeaders 的 present 语义一致）；
// - data 每行只保留所选列键（顺序 = headers 顺序），值按列注册表 formatter 口径格式化
//   （number 保持数值 / percent 保留一位小数百分比 / money 加“元”/ plain·tags·url 原样），
//   再统一经 sanitizeExcelValue 清洗；未选列绝不进入 data；
// - 没有对应字段的行导出空值（null，工作簿渲染为 “-”）。

import { sanitizeExcelValue } from "../electron-main/collection-history-store.mjs";
import {
  getPgyKolExportHeaders,
  getPgyKolColumn,
  formatPgyKolColumnValue,
} from "./pgy-kol-column-registry.mjs";

function rowFieldsOf(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return {};
  const fields = row.fields;
  if (fields !== null && typeof fields === "object" && !Array.isArray(fields)) return fields;
  return row;
}

// userId 列以 store 归一化的 uid 为准：缺 UID 行（uid=null/空）导出为空白，
// 未显式携带 uid 的行回退到 fields.userId（与 store 的 uid 归一化口径一致）。
function exportUserId(row) {
  if (row !== null && typeof row === "object" && !Array.isArray(row) &&
      Object.prototype.hasOwnProperty.call(row, "uid")) {
    const uid = row.uid;
    if (typeof uid === "string") return uid.length > 0 ? sanitizeExcelValue(uid) : null;
    if (typeof uid === "number" && Number.isFinite(uid)) return String(uid);
    return null;
  }
  const fields = rowFieldsOf(row);
  return fields.userId === undefined ? null : sanitizeExcelValue(fields.userId);
}

function formatCellValue(column, value) {
  return sanitizeExcelValue(formatPgyKolColumnValue(column, value));
}

export function buildPgyKolBatchExportPayload(task, rows) {
  const taskId = task && task.taskId !== undefined ? String(task.taskId) : "";
  const fileName = (task && task.fileName) || `${taskId}.xlsx`;
  const sourceRows = Array.isArray(rows) ? rows : [];
  const allHeaders = getPgyKolExportHeaders(task && Array.isArray(task.columns) ? task.columns : []);

  const present = new Set();
  for (const row of sourceRows) {
    for (const key of Object.keys(rowFieldsOf(row))) present.add(key);
  }
  const headers = allHeaders.filter((header) => present.has(header.key));

  const data = sourceRows.map((row) => {
    const fields = rowFieldsOf(row);
    const out = {};
    for (const header of headers) {
      const column = getPgyKolColumn(header.key);
      out[header.key] = header.key === "userId"
        ? exportUserId(row)
        : formatCellValue(column, fields[header.key]);
    }
    return out;
  });

  return { taskId, fileName, mode: "two-row", headers, data };
}
