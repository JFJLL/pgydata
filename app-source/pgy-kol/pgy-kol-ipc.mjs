/**
 * 蒲公英“找博主”底座最小只读 IPC。
 *
 * 第一阶段提供只读能力：状态查询、Schema 状态查询、第一页搜索。
 * 第二阶段新增面向 UI 的只读能力：config（动态配置节点）、payload-preview（纯 JSON 预览）。
 * 全部通道只读，不提供任何写入本地、导出、任务管理的通道。
 */

import { PgySessionRequest } from "./pgy-session-request.mjs";
import { validateConfigRequest, validateFilterState } from "./pgy-ipc-guard.mjs";

export const PGY_KOL_IPC_CHANNELS = Object.freeze({
  status: "pgy-kol:status",
  schemaStatus: "pgy-kol:schema-status",
  searchFirstPage: "pgy-kol:search-first-page",
  config: "pgy-kol:config",
  payloadPreview: "pgy-kol:payload-preview",
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
    // 与 payload-preview 一致：入口强制深度/数组/字符串/键数边界。
    try {
      const check = validateFilterState(filterState);
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      const data = await service.searchFirstPage({
        filterState: check.value,
      });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) };
    }
  });

  ipcMain.handle(PGY_KOL_IPC_CHANNELS.config, async (_event, input) => {
    try {
      const check = validateConfigRequest(input);
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      const data = await service.loadConfig({
        provider: check.provider,
        ...(check.section === undefined ? {} : { section: check.section }),
      });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) };
    }
  });

  ipcMain.handle(PGY_KOL_IPC_CHANNELS.payloadPreview, async (_event, input) => {
    // 与 searchFirstPage 一致：入参即裸 filterState（页面经 preload 直接透传）。
    try {
      const check = validateFilterState(input);
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      const data = await service.previewPayload({ filterState: check.value });
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

function toErrorPayload(err) {
  const kind = err && typeof err === "object" && typeof err.kind === "string" ? err.kind : "unknown";
  const message = PgySessionRequest.redactText(String((err && err.message) || err || "未知错误")).slice(0, 500);
  const pgyCode =
    err && typeof err === "object" && typeof err.pgyCode === "number" ? err.pgyCode : null;
  return { code: kind, message, ...(pgyCode === null ? {} : { pgyCode }) };
}
