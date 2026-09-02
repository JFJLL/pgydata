export function collectAppInfo(options = {}) {
  return {
    appVersion: options.appVersion || "1.4.5",
    assetsVersion: options.assetsVersion || "1.4.5",
    electronVersion: process.versions.electron || null,
    chromiumVersion: process.versions.chrome || null,
    nodeVersion: process.versions.node || null,
    platform: process.platform,
    arch: process.arch,
    isPackaged: options.isPackaged ?? true,
    installId: options.installId || null,
    sessionId: options.sessionId || null,
    currentFrontendAssetVersion: options.currentFrontendAssetVersion || options.assetsVersion || "1.4.5",
    frontendIntegrityStatus: options.frontendIntegrityStatus || "valid",
    currentUpdateState: options.currentUpdateState || "idle",
    generatedAt: new Date().toISOString(),
  };
}
