import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function collectSystemInfo(options = {}) {
  let electronApp = null;
  let electronScreen = null;
  try {
    const electron = await import("electron");
    electronApp = electron.app || electron.default?.app;
    electronScreen = electron.screen || electron.default?.screen;
  } catch {}

  const userDataPath = options.userDataPath || (electronApp?.getPath ? electronApp.getPath("userData") : "");
  const tempPath = electronApp?.getPath ? electronApp.getPath("temp") : os.tmpdir();
  const logsPath = userDataPath ? path.join(userDataPath, "logs") : "";

  // Check writability of key directories
  const checkWritable = async (dirPath) => {
    if (!dirPath) return false;
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const testFile = path.join(dirPath, `.mgr-write-test-${Date.now()}`);
      await fs.writeFile(testFile, "ok");
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  };

  const [userDataWritable, logsWritable, tempWritable] = await Promise.all([
    checkWritable(userDataPath),
    checkWritable(logsPath),
    checkWritable(tempPath),
  ]);

  // Try to safely get disk free space
  let diskFreeBytes = null;
  let diskTotalBytes = null;
  if (typeof fs.statfs === "function" && userDataPath) {
    try {
      const stats = await fs.statfs(userDataPath);
      if (stats && typeof stats.bfree === "bigint" && typeof stats.bsize === "bigint") {
        diskFreeBytes = Number(stats.bfree * stats.bsize);
        diskTotalBytes = Number(stats.blocks * stats.bsize);
      } else if (stats && typeof stats.bfree === "number" && typeof stats.bsize === "number") {
        diskFreeBytes = stats.bfree * stats.bsize;
        diskTotalBytes = stats.blocks * stats.bsize;
      }
    } catch {}
  }

  // Primary display info
  let primaryDisplay = null;
  try {
    if (electronScreen?.getPrimaryDisplay) {
      const disp = electronScreen.getPrimaryDisplay();
      if (disp) {
        primaryDisplay = {
          width: disp.size?.width,
          height: disp.size?.height,
          scaleFactor: disp.scaleFactor || 1,
        };
      }
    }
  } catch {}

  const cpus = os.cpus() || [];

  return {
    platform: process.platform,
    arch: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    osVersion: typeof os.version === "function" ? os.version() : null,
    cpuModel: cpus[0]?.model || null,
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    uptimeSeconds: Math.floor(os.uptime()),
    locale: electronApp?.getLocale ? electronApp.getLocale() : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    primaryDisplay,
    electronVersion: process.versions.electron || null,
    chromiumVersion: process.versions.chrome || null,
    nodeVersion: process.versions.node || null,
    userDataWritable,
    logsWritable,
    tempWritable,
    diskFreeBytes,
    diskTotalBytes,
    collectedAt: new Date().toISOString(),
  };
}
