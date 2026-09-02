import crypto from "node:crypto";
import JSZip from "jszip";
import { scanForSensitiveData, redactObject, redactText } from "./diagnostic-redactor.mjs";

const MAX_PACKAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_ZIP_PREFIXES = [
  "manifest.json",
  "system.json",
  "app.json",
  "logs/",
  "errors/",
  "tasks/",
  "network/",
  "update/",
];

function isAllowedZipPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  if (filePath.includes("..") || filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:/.test(filePath)) {
    return false;
  }
  return ALLOWED_ZIP_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

export async function buildDiagnosticPackage(payload = {}) {
  const zip = new JSZip();
  const collectorsStatus = {};

  const clientReportId = payload.clientReportId || crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  // Helper to safely add files (Layer 1: Pre-package plaintext scan)
  const addFile = (zipPath, content) => {
    if (!isAllowedZipPath(zipPath)) {
      throw new Error(`Forbidden zip file path: ${zipPath}`);
    }
    const textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    
    const scan = scanForSensitiveData(textContent);
    if (!scan.clean) {
      throw new Error(`Sensitive data leak detected in pre-package scan for ${zipPath}: ${scan.findings.join(", ")}`);
    }

    zip.file(zipPath, textContent);
  };

  // 1. System Info
  try {
    if (payload.system) {
      addFile("system.json", redactObject(payload.system));
      collectorsStatus.system = "success";
    } else {
      collectorsStatus.system = "unavailable";
    }
  } catch (err) {
    collectorsStatus.system = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 2. App Info
  try {
    if (payload.app) {
      addFile("app.json", redactObject(payload.app));
      collectorsStatus.app = "success";
    } else {
      collectorsStatus.app = "unavailable";
    }
  } catch (err) {
    collectorsStatus.app = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 3. Main Logs
  try {
    if (Array.isArray(payload.logs) && payload.logs.length > 0) {
      for (const logItem of payload.logs) {
        if (logItem.alias && typeof logItem.content === "string") {
          addFile(`logs/${logItem.alias}`, logItem.content);
        }
      }
      collectorsStatus.logs = "success";
    } else {
      collectorsStatus.logs = "unavailable";
    }
  } catch (err) {
    collectorsStatus.logs = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 4. Errors
  try {
    if (Array.isArray(payload.errors)) {
      const jsonl = payload.errors.map((e) => JSON.stringify(redactObject(e))).join("\n");
      addFile("errors/recent-errors.jsonl", jsonl);
      collectorsStatus.errors = "success";
    } else {
      collectorsStatus.errors = "unavailable";
    }
  } catch (err) {
    collectorsStatus.errors = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 5. Tasks & Task Trace
  try {
    if (payload.tasks) {
      if (Array.isArray(payload.tasks.recentTasks)) {
        addFile("tasks/tasks.json", payload.tasks.recentTasks.slice(0, 5));
      }
      if (Array.isArray(payload.tasks.taskTrace) && payload.tasks.taskTrace.length > 0) {
        const taskId = payload.tasks.targetTaskId || "target-task";
        const safeId = String(taskId).replace(/[^A-Za-z0-9_-]/g, "_");
        const traceJsonl = payload.tasks.taskTrace.map((t) => JSON.stringify(redactObject(t))).join("\n");
        addFile(`tasks/${safeId}-trace.jsonl`, traceJsonl);
      }
      collectorsStatus.tasks = "success";
    } else {
      collectorsStatus.tasks = "unavailable";
    }
  } catch (err) {
    collectorsStatus.tasks = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 6. Network Diagnostic
  try {
    if (payload.network) {
      addFile("network/summary.json", redactObject(payload.network));
      collectorsStatus.network = "success";
    } else {
      collectorsStatus.network = "unavailable";
    }
  } catch (err) {
    collectorsStatus.network = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 7. Update Status
  try {
    if (payload.update) {
      addFile("update/status.json", redactObject(payload.update));
      collectorsStatus.update = "success";
    } else {
      collectorsStatus.update = "unavailable";
    }
  } catch (err) {
    collectorsStatus.update = "failed";
    if (err.message.includes("Sensitive data leak")) throw err;
  }

  // 8. Build manifest.json
  const manifest = {
    schemaVersion: 1,
    clientReportId,
    generatedAt,
    installId: payload.app?.installId || null,
    sessionId: payload.app?.sessionId || null,
    appVersion: payload.app?.appVersion || "1.4.5",
    assetsVersion: payload.app?.assetsVersion || "1.4.5",
    platform: process.platform,
    arch: process.arch,
    issueOccurredAt: payload.issueOccurredAt || null,
    relatedTaskId: payload.relatedTaskId || null,
    userNote: payload.userNote ? redactText(String(payload.userNote).slice(0, 1000)) : null,
    collectors: collectorsStatus,
  };

  addFile("manifest.json", manifest);

  // Generate ZIP Buffer
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  if (zipBuffer.length > MAX_PACKAGE_SIZE_BYTES) {
    throw new Error(`Diagnostic package exceeds max size: ${zipBuffer.length} bytes (max ${MAX_PACKAGE_SIZE_BYTES} bytes)`);
  }

  // Layer 2: Post-package uncompressed entry scan to guarantee complete safety
  const reloadedZip = await JSZip.loadAsync(zipBuffer);
  for (const [relativePath, fileEntry] of Object.entries(reloadedZip.files)) {
    if (fileEntry.dir) continue;
    const unzippedText = await fileEntry.async("string");
    const postScan = scanForSensitiveData(unzippedText);
    if (!postScan.clean) {
      throw new Error(`Sensitive data leak detected in post-package entry scan for ${relativePath}: ${postScan.findings.join(", ")}`);
    }
  }

  const sha256 = crypto.createHash("sha256").update(zipBuffer).digest("hex");

  // Generate structured summary for server database and admin panel view
  const summary = {
    manifest,
    system: payload.system ? {
      osType: payload.system.osType,
      osRelease: payload.system.osRelease,
      osVersion: payload.system.osVersion,
      cpuModel: payload.system.cpuModel,
      cpuCount: payload.system.cpuCount,
      totalMemoryBytes: payload.system.totalMemoryBytes,
      freeMemoryBytes: payload.system.freeMemoryBytes,
      locale: payload.system.locale,
      timezone: payload.system.timezone,
      userDataWritable: payload.system.userDataWritable,
      logsWritable: payload.system.logsWritable,
    } : null,
    app: payload.app ? {
      appVersion: payload.app.appVersion,
      assetsVersion: payload.app.assetsVersion,
      electronVersion: payload.app.electronVersion,
      chromiumVersion: payload.app.chromiumVersion,
      nodeVersion: payload.app.nodeVersion,
      isPackaged: payload.app.isPackaged,
    } : null,
    recentTasks: Array.isArray(payload.tasks?.recentTasks) ? payload.tasks.recentTasks.slice(0, 5) : [],
    taskTrace: Array.isArray(payload.tasks?.taskTrace) ? payload.tasks.taskTrace.slice(-50) : [],
    topErrors: Array.isArray(payload.errors) ? payload.errors.slice(-10) : [],
    networkSummary: payload.network ? {
      requests: payload.network.requests,
      failures: payload.network.failures,
      timeouts: payload.network.timeouts,
      averageDurationMs: payload.network.averageDurationMs,
    } : null,
  };

  return {
    clientReportId,
    zipBuffer,
    fileSizeBytes: zipBuffer.length,
    sha256,
    manifest,
    summary,
  };
}
