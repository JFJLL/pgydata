import { promises as fs } from "node:fs";
import path from "node:path";
import { DiagnosticTraceStore } from "./diagnostic-trace-store.mjs";
import { collectSystemInfo } from "./system-info-collector.mjs";
import { collectAppInfo } from "./app-info-collector.mjs";
import { collectTaskDiagnostics } from "./task-diagnostic-collector.mjs";
import { collectMainLogs } from "./main-log-collector.mjs";
import { NetworkDiagnosticCollector } from "./network-diagnostic-collector.mjs";
import { ErrorCollector } from "./error-collector.mjs";
import { buildDiagnosticPackage } from "./diagnostic-packager.mjs";
import { DiagnosticUploader } from "./diagnostic-uploader.mjs";

export class DiagnosticManager {
  constructor(options = {}) {
    this.userDataDir = options.userDataDir || path.join(process.cwd(), "userData");
    this.historyStore = options.historyStore || null;
    this.getApiClient = options.getApiClient || (() => null);
    this.appVersion = options.appVersion || "1.4.5";
    this.assetsVersion = options.assetsVersion || "1.4.5";

    const diagDir = path.join(this.userDataDir, "diagnostics");
    this.traceStore = new DiagnosticTraceStore({ baseDir: diagDir });
    this.networkCollector = new NetworkDiagnosticCollector();
    this.errorCollector = new ErrorCollector(this.traceStore);
    this.uploader = new DiagnosticUploader({ getApiClient: this.getApiClient });
    this.lastShutdownClean = false;
  }

  async init() {
    await this.traceStore.init();
    await this.setupElectronBindings();
  }

  async setupElectronBindings() {
    let electron = null;
    try {
      electron = await import("electron");
    } catch {
      return;
    }

    const app = electron.app || electron.default?.app;
    const ipcMain = electron.ipcMain || electron.default?.ipcMain;
    const dialog = electron.dialog || electron.default?.dialog;

    // Main process uncaught exceptions & rejections
    process.on("uncaughtException", (err) => {
      try {
        this.errorCollector.recordError("main_uncaught_exception", err);
      } catch {}
    });

    process.on("unhandledRejection", (reason) => {
      try {
        this.errorCollector.recordError("main_unhandled_rejection", reason);
      } catch {}
    });

    if (app) {
      app.on("render-process-gone", (event, webContents, details) => {
        try {
          this.errorCollector.recordError("render_process_gone", details);
        } catch {}
      });
      app.on("child-process-gone", (event, details) => {
        try {
          this.errorCollector.recordError("child_process_gone", details);
        } catch {}
      });
    }

    if (!ipcMain) return;

    // 1. Get recent tasks & status for UI dropdown
    ipcMain.handle("diagnostics:get-status", async () => {
      try {
        const tasksDiag = await collectTaskDiagnostics({
          historyStore: this.historyStore,
          limit: 10,
        });
        return {
          success: true,
          recentTasks: tasksDiag.recentTasks || [],
          installId: this.traceStore.installId,
          sessionId: this.traceStore.sessionId,
          appVersion: this.appVersion,
        };
      } catch (err) {
        return { success: false, error: err.message, recentTasks: [] };
      }
    });

    // 2. Create and upload diagnostic package
    ipcMain.handle("diagnostics:create-and-upload", async (event, params = {}) => {
      try {
        const packagerResult = await this.generatePackage(params);
        const uploadResult = await this.uploader.uploadPackage(packagerResult, params);
        return {
          success: true,
          reportId: uploadResult.reportId,
          fileSizeBytes: uploadResult.fileSizeBytes,
          sha256: uploadResult.sha256,
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || "上传失败",
        };
      }
    });

    // 3. Export package to local ZIP file (fallback / offline)
    ipcMain.handle("diagnostics:export-local", async (event, params = {}) => {
      try {
        const packagerResult = await this.generatePackage(params);
        const defaultFilename = `magiorix-diagnostic-${new Date().toISOString().slice(0, 10)}.zip`;
        
        if (dialog?.showSaveDialog) {
          const saveDialogRes = await dialog.showSaveDialog({
            title: "保存诊断包",
            defaultPath: defaultFilename,
            filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
          });
          if (!saveDialogRes.canceled && saveDialogRes.filePath) {
            await fs.writeFile(saveDialogRes.filePath, packagerResult.zipBuffer);
            return { success: true, savedPath: saveDialogRes.filePath };
          }
          return { success: false, cancelled: true };
        } else {
          const localPath = path.join(this.userDataDir, defaultFilename);
          await fs.writeFile(localPath, packagerResult.zipBuffer);
          return { success: true, savedPath: localPath };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // 4. Renderer error IPC event
    ipcMain.on("diagnostics:renderer-error", (event, errorInfo) => {
      try {
        this.errorCollector.recordError("renderer", errorInfo);
      } catch {}
    });
  }

  /**
   * Collects all diagnostic data and builds ZIP package
   */
  async generatePackage(options = {}) {
    const relatedTaskId = options.relatedTaskId || null;
    const issueOccurredAt = options.issueOccurredAt || null;
    const userNote = options.userNote || null;

    const [system, logs, tasks] = await Promise.all([
      collectSystemInfo({ userDataPath: this.userDataDir }).catch(() => null),
      collectMainLogs({ logsDir: path.join(this.userDataDir, "logs") }).catch(() => []),
      collectTaskDiagnostics({
        historyStore: this.historyStore,
        traceStore: this.traceStore,
        relatedTaskId,
        limit: 10,
      }).catch(() => null),
    ]);

    const appInfo = collectAppInfo({
      appVersion: this.appVersion,
      assetsVersion: this.assetsVersion,
      installId: this.traceStore.installId,
      sessionId: this.traceStore.sessionId,
    });

    const errors = this.errorCollector.getRecentErrors();
    const network = this.networkCollector.getSummary();

    const payload = {
      system,
      app: appInfo,
      logs,
      errors,
      tasks,
      network,
      update: { status: "idle" },
      relatedTaskId,
      issueOccurredAt,
      userNote,
    };

    return await buildDiagnosticPackage(payload);
  }

  recordTrace(event) {
    try {
      this.traceStore.record(event);
    } catch {}
  }
}
