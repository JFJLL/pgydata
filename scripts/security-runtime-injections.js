const TRUSTED_RELEASE_PUBLIC_KEYS = {
  "magiorix-release-2026-v1": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMaMnU+xxOv30CKGTxMe6SPK9ay4eN6DgTh0l/xmLwko=\n-----END PUBLIC KEY-----\n",
};

function pgyCanonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(pgyCanonicalJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + pgyCanonicalJson(obj[k])).join(",") + "}";
}

function pgyVerifyManifestSignature(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const { keyId, signature, signedPayload } = manifest;
  if (!keyId || !signature || !signedPayload) return false;
  const pubKey = TRUSTED_RELEASE_PUBLIC_KEYS[keyId];
  if (!pubKey) return false;
  const canonical = pgyCanonicalJson(signedPayload);
  try {
    return no.verify(null, Buffer.from(canonical, "utf8"), pubKey, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function pgyValidateIpcSender(event, options = {}) {
  if (!event || !event.sender) {
    throw new Error("IPC access denied: missing event.sender");
  }
  const webContents = event.sender;
  if (typeof webContents.isDestroyed === "function" && webContents.isDestroyed()) {
    throw new Error("IPC access denied: sender webContents is destroyed");
  }
  const bw = Dt.fromWebContents(webContents);
  if (!bw || bw.isDestroyed()) {
    throw new Error("IPC access denied: window is destroyed or unavailable");
  }
  if (options.allowedWindow && bw !== options.allowedWindow) {
    throw new Error("IPC access denied: sender is not the authorized window");
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
    throw new Error("IPC access denied: missing frame URL");
  }
  if (!pgyIsMainWindowNavigationAllowed(frameUrl, Oe(Ae.getCurrentAssetsPath() || "", "index.html"))) {
    throw new Error("IPC access denied: unauthorized frame URL: " + frameUrl);
  }
  return true;
}

Pn.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  callback(false);
});

ye.on("browser-window-created", (event, window) => {
  if (ye.isPackaged || !Xt) {
    window.webContents.on("before-input-event", (inputEvent, input) => {
      if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
        inputEvent.preventDefault();
      }
    });
  }
});

