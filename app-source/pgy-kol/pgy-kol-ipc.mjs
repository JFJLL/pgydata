/**
 * 蒲公英“找博主”底座最小只读 IPC。
 *
 * 第一阶段只提供只读能力：状态查询、Schema 状态查询、第一页搜索。
 * 不提供任何写入本地、导出、任务管理的通道；不在正式 UI 中展示。
 */

import { PgySessionRequest } from "./pgy-session-request.mjs";

export const PGY_KOL_IPC_CHANNELS = Object.freeze({
  status: "pgy-kol:status",
  schemaStatus: "pgy-kol:schema-status",
  searchFirstPage: "pgy-kol:search-first-page",
});

/**
 * 注册最小只读 IPC 处理器。
 *
 * @param {{ ipcMain: object, service: object }} deps
 *   ipcMain: Electron ipcMain（测试可注入记录型替身）
 *   service: createPgyKolService 返回的服务
 * @returns {() => void} 注销函数（便于测试与未来卸载）
 */
export function registerPgyKolIpc({ ipcMain, service }) {
  if (!ipcMain || !service) {
    throw new Error("[pgy-kol-ipc] ipcMain 与 service 必填");
  }
  ipcMain.handle(PGY_KOL_IPC_CHANNELS.status, () => {
    try {
      return { ok: true, data: service.status() };
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) };
    }
  });

  ipcMain.handle(PGY_KOL_IPC_CHANNELS.schemaStatus, async () => {
    try {
      return { ok: true, data: await service.schemaStatus() };
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) };
    }
  });

  ipcMain.handle(PGY_KOL_IPC_CHANNELS.searchFirstPage, async (_event, filterState) => {
    try {
      const data = await service.searchFirstPage({
        filterState: normalizeFilterState(filterState),
      });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) };
    }
  });

  return () => {
    for (const channel of Object.values(PGY_KOL_IPC_CHANNELS)) {
      if (typeof ipcMain.removeHandler === "function") {
        ipcMain.removeHandler(channel);
      }
    }
  };
}

function normalizeFilterState(value) {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("filterState 必须是普通对象");
  }
  return value;
}

function toErrorPayload(err) {
  const kind = err && typeof err === "object" && typeof err.kind === "string" ? err.kind : "unknown";
  const message = PgySessionRequest.redactText(String((err && err.message) || err || "未知错误")).slice(0, 500);
  const pgyCode =
    err && typeof err === "object" && typeof err.pgyCode === "number" ? err.pgyCode : null;
  return { code: kind, message, ...(pgyCode === null ? {} : { pgyCode }) };
}
