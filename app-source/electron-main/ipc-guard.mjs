import path from "path";
import { fileURLToPath } from "url";

let electronModule = null;
try {
  electronModule = await import("electron");
} catch {
  // Unit test / Node environment without Electron native module
}

export function isAllowedRendererUrl(urlStr, allowedFilePath = null) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === "file:") {
      const filePath = fileURLToPath(parsed.href);
      const resolved = path.resolve(filePath);
      if (allowedFilePath) {
        const allowedResolved = path.resolve(allowedFilePath);
        return process.platform === "win32"
          ? resolved.toLowerCase() === allowedResolved.toLowerCase()
          : resolved === allowedResolved;
      }
      return true;
    }
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      const devParsed = new URL(devServerUrl);
      return parsed.origin === devParsed.origin;
    }
    return false;
  } catch {
    return false;
  }
}

export function validateIpcSender(event, options = {}) {
  if (!event || !event.sender) {
    throw new Error("IPC access denied: missing event sender");
  }
  const webContents = event.sender;
  if (typeof webContents.isDestroyed === "function" && webContents.isDestroyed()) {
    throw new Error("IPC access denied: sender webContents is destroyed");
  }
  const BrowserWindowClass = options.BrowserWindow || electronModule?.BrowserWindow;
  if (BrowserWindowClass && typeof BrowserWindowClass.fromWebContents === "function") {
    const bw = BrowserWindowClass.fromWebContents(webContents);
    if (!bw || bw.isDestroyed()) {
      throw new Error("IPC access denied: window is not available or destroyed");
    }
    if (options.allowedWindow && bw !== options.allowedWindow) {
      throw new Error("IPC access denied: sender window is not authorized");
    }
  }
  const frame = event.senderFrame;
  if (!frame) {
    throw new Error("IPC access denied: missing senderFrame");
  }
  if (frame.parent !== null && frame.parent !== undefined) {
    throw new Error("IPC access denied: sub-frame IPC invocation is prohibited");
  }
  const frameUrl = frame.url;
  if (!frameUrl || typeof frameUrl !== "string") {
    throw new Error("IPC access denied: missing sender frame URL");
  }
  if (!isAllowedRendererUrl(frameUrl, options.allowedFilePath)) {
    throw new Error(`IPC access denied: unauthorized frame URL ${frameUrl}`);
  }
  return true;
}

