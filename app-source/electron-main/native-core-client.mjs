import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

export const NATIVE_CORE_PROTOCOL_VERSION = 1;
export const NATIVE_CORE_VERSION = "1.4.2";
export const MAX_NATIVE_CORE_FRAME_BYTES = 1024 * 1024;

const ALLOWED_COMMANDS = new Set([
  "health", "device.ensure", "device.rotate", "ticket.verify", "task.digest",
  "task.plan", "receipt.begin", "receipt.append", "receipt.finalize", "strategy.decrypt", "shutdown",
]);

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function encodeUnsigned(value, chunks, structKeys = null) {
  if (value === null) { chunks.push(Buffer.from([0xc0])); return; }
  if (value === false) { chunks.push(Buffer.from([0xc2])); return; }
  if (value === true) { chunks.push(Buffer.from([0xc3])); return; }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    if (bytes.length <= 0xff) chunks.push(Buffer.from([0xc4, bytes.length]));
    else if (bytes.length <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xc5; b.writeUInt16BE(bytes.length, 1); chunks.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xc6; b.writeUInt32BE(bytes.length, 1); chunks.push(b); }
    chunks.push(bytes); return;
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length <= 31) chunks.push(Buffer.from([0xa0 | bytes.length]));
    else if (bytes.length <= 0xff) chunks.push(Buffer.from([0xd9, bytes.length]));
    else if (bytes.length <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xda; b.writeUInt16BE(bytes.length, 1); chunks.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xdb; b.writeUInt32BE(bytes.length, 1); chunks.push(b); }
    chunks.push(bytes); return;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    if (value >= 0 && value <= 0x7f) chunks.push(Buffer.from([value]));
    else if (value >= -32 && value < 0) chunks.push(Buffer.from([0x100 + value]));
    else if (value >= 0 && value <= 0xff) chunks.push(Buffer.from([0xcc, value]));
    else if (value >= 0 && value <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xcd; b.writeUInt16BE(value, 1); chunks.push(b); }
    else if (value >= 0 && value <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = 0xce; b.writeUInt32BE(value, 1); chunks.push(b); }
    else { const b = Buffer.alloc(9); b[0] = 0xcf; b.writeBigUInt64BE(BigInt(value), 1); chunks.push(b); }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length <= 15) chunks.push(Buffer.from([0x90 | value.length]));
    else { const b = Buffer.alloc(3); b[0] = 0xdc; b.writeUInt16BE(value.length, 1); chunks.push(b); }
    value.forEach((entry) => encodeUnsigned(entry, chunks)); return;
  }
  if (typeof value === "object") {
    const keys = structKeys || Object.keys(value).sort(compareUtf8);
    if (keys.length <= 15) chunks.push(Buffer.from([0x80 | keys.length]));
    else { const b = Buffer.alloc(3); b[0] = 0xde; b.writeUInt16BE(keys.length, 1); chunks.push(b); }
    for (const key of keys) { encodeUnsigned(key, chunks); encodeUnsigned(value[key], chunks); }
    return;
  }
  throw new TypeError("Native core payload contains unsupported MessagePack value");
}

export function encodeCanonicalMessagePack(value, structKeys = null) {
  const chunks = [];
  encodeUnsigned(value, chunks, structKeys);
  return Buffer.concat(chunks);
}

function decodeMessagePack(raw) {
  let offset = 0;
  const take = (size) => {
    if (offset + size > raw.length) throw new Error("Native core frame is truncated");
    const value = raw.subarray(offset, offset + size); offset += size; return value;
  };
  const read = () => {
    const code = take(1)[0];
    if (code <= 0x7f) return code;
    if (code >= 0xe0) return code - 0x100;
    if ((code & 0xe0) === 0xa0) return take(code & 0x1f).toString("utf8");
    if ((code & 0xf0) === 0x90) return Array.from({ length: code & 0x0f }, read);
    if ((code & 0xf0) === 0x80) {
      const value = {}; for (let i = 0; i < (code & 0x0f); i += 1) { const key = read(); if (typeof key !== "string" || Object.hasOwn(value, key)) throw new Error("Native core map is invalid"); value[key] = read(); } return value;
    }
    switch (code) {
      case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
      case 0xc4: return Buffer.from(take(take(1)[0]));
      case 0xc5: return Buffer.from(take(take(2).readUInt16BE(0)));
      case 0xc6: return Buffer.from(take(take(4).readUInt32BE(0)));
      case 0xcc: return take(1)[0]; case 0xcd: return take(2).readUInt16BE(0); case 0xce: return take(4).readUInt32BE(0);
      case 0xcf: return Number(take(8).readBigUInt64BE(0));
      case 0xd0: return take(1).readInt8(0); case 0xd1: return take(2).readInt16BE(0); case 0xd2: return take(4).readInt32BE(0);
      case 0xd9: return take(take(1)[0]).toString("utf8");
      case 0xda: return take(take(2).readUInt16BE(0)).toString("utf8");
      case 0xdb: return take(take(4).readUInt32BE(0)).toString("utf8");
      case 0xdc: return Array.from({ length: take(2).readUInt16BE(0) }, read);
      case 0xde: { const value = {}; const count = take(2).readUInt16BE(0); for (let i = 0; i < count; i += 1) { const key = read(); if (typeof key !== "string" || Object.hasOwn(value, key)) throw new Error("Native core map is invalid"); value[key] = read(); } return value; }
      default: throw new Error("Native core MessagePack type is not allowed");
    }
  };
  const value = read();
  if (offset !== raw.length) throw new Error("Native core frame has trailing data");
  return value;
}

function createFrame(payload) {
  if (!Buffer.isBuffer(payload) || payload.length === 0 || payload.length > MAX_NATIVE_CORE_FRAME_BYTES) throw new Error("Native core frame size is invalid");
  const frame = Buffer.allocUnsafe(4 + payload.length); frame.writeUInt32BE(payload.length, 0); payload.copy(frame, 4); return frame;
}

function hmac(secret, frame) {
  return crypto.createHmac("sha256", secret).update(frame).digest();
}

function timingSafeEqual(left, right) {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyNativeCoreFile({ corePath, installRoot, expectedSha256, allowUnsignedLocal = false, isPackaged = false }) {
  if (!path.isAbsolute(corePath) || !path.isAbsolute(installRoot)) throw new Error("Native core path must be absolute");
  const root = fs.realpathSync.native(installRoot);
  const actual = fs.realpathSync.native(corePath);
  const relative = path.relative(root, actual);
  if (relative.startsWith("..") || path.isAbsolute(relative) || fs.lstatSync(corePath).isSymbolicLink()) throw new Error("Native core is outside the installation directory");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(actual)).digest("hex").toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(String(expectedSha256 || "").toUpperCase()) || digest !== String(expectedSha256).toUpperCase()) throw new Error("Native core SHA-256 verification failed");
  if (isPackaged && !allowUnsignedLocal) {
    // Authenticode validation is performed by the fixed release build pipeline before startup.
    // The sidecar client cannot accept a caller-supplied verification command or executable path.
    return { path: actual, sha256: digest, authenticodeRequired: true };
  }
  return { path: actual, sha256: digest, authenticodeRequired: false };
}

export class NativeCoreClient {
  constructor({ corePath, installRoot, expectedSha256, allowUnsignedLocal = false, isPackaged = false, logger = console, timeoutMs = 8_000 } = {}) {
    this.options = { corePath, installRoot, expectedSha256, allowUnsignedLocal, isPackaged, logger, timeoutMs };
    this.child = null; this.secret = null; this.sequence = 1; this.pending = new Map(); this.stdout = Buffer.alloc(0);
  }

  async start() {
    const verified = verifyNativeCoreFile(this.options);
    if (process.platform === "win32" && !this.options.allowUnsignedLocal) {
      const signature = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "(Get-AuthenticodeSignature -LiteralPath $args[0]).Status", verified.corePath],
        { encoding: "utf8", windowsHide: true },
      );
      if (signature.status !== 0 || signature.stdout.trim() !== "Valid") {
        throw new Error("Native core Authenticode verification failed");
      }
    }
    this.secret = crypto.randomBytes(32);
    this.child = spawn(verified.path, [], { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
    this.child.stderr.on("data", () => this.options.logger.warn?.("[native-core] sidecar emitted a redacted diagnostic"));
    this.child.stdout.on("data", (chunk) => this.#consume(Buffer.from(chunk)));
    this.child.once("exit", () => this.#rejectAll(new Error("Native core exited")));
    await this.#hello();
    const health = await this.request("health", {});
    if (health?.coreVersion !== NATIVE_CORE_VERSION || health?.protocolVersion !== NATIVE_CORE_PROTOCOL_VERSION) throw new Error("Native core version or protocol mismatch");
    return health;
  }

  async request(command, payload) {
    if (!ALLOWED_COMMANDS.has(command) || !this.child || !this.secret) throw new Error("Native core command is unavailable");
    const sequence = this.sequence++; const requestId = crypto.randomUUID();
    const unsigned = { protocol_version: NATIVE_CORE_PROTOCOL_VERSION, sequence, request_id: requestId, command, payload };
    const unsignedBytes = encodeCanonicalMessagePack(unsigned, ["protocol_version", "sequence", "request_id", "command", "payload"]);
    const secure = { ...unsigned, hmac: hmac(this.secret, unsignedBytes) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("Native core request timed out")); }, this.options.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer, sequence });
      this.child.stdin.write(createFrame(encodeCanonicalMessagePack(secure, ["protocol_version", "sequence", "request_id", "command", "payload", "hmac"])));
    });
  }

  async stop() {
    try { if (this.child) await this.request("shutdown", {}); } catch { /* process is terminated below */ }
    this.child?.kill(); this.child = null; this.secret?.fill(0); this.secret = null;
  }

  async #hello() {
    const hello = { protocol_version: NATIVE_CORE_PROTOCOL_VERSION, app_version: NATIVE_CORE_VERSION, session_secret_b64: this.secret.toString("base64") };
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Native core hello timed out")), this.options.timeoutMs);
      this.pending.set("__hello__", { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); }, timer, sequence: 0 });
      this.child.stdin.write(createFrame(encodeCanonicalMessagePack(hello, ["protocol_version", "app_version", "session_secret_b64"])));
    });
  }

  #consume(chunk) {
    this.stdout = Buffer.concat([this.stdout, chunk]);
    while (this.stdout.length >= 4) {
      const size = this.stdout.readUInt32BE(0); if (size === 0 || size > MAX_NATIVE_CORE_FRAME_BYTES) { this.#rejectAll(new Error("Native core emitted invalid frame length")); this.child?.kill(); return; }
      if (this.stdout.length < size + 4) return;
      const raw = this.stdout.subarray(4, size + 4); this.stdout = this.stdout.subarray(size + 4);
      try {
        const value = decodeMessagePack(raw);
        if (value?.code === "hello" && this.pending.has("__hello__")) { const pending = this.pending.get("__hello__"); this.pending.delete("__hello__"); pending.resolve(value.payload); continue; }
        this.#resolveSecure(value);
      } catch (error) { this.#rejectAll(error); this.child?.kill(); }
    }
  }

  #resolveSecure(frame) {
    const { hmac: signature, ...unsigned } = frame || {};
    if (!frame || frame.protocol_version !== NATIVE_CORE_PROTOCOL_VERSION || frame.command !== "response") throw new Error("Native core response is malformed");
    const bytes = encodeCanonicalMessagePack(unsigned, ["protocol_version", "sequence", "request_id", "command", "payload"]);
    if (!timingSafeEqual(Buffer.from(signature || []), hmac(this.secret, bytes))) throw new Error("Native core response HMAC verification failed");
    const pending = this.pending.get(frame.request_id); if (!pending || pending.sequence !== frame.sequence) throw new Error("Native core response was replayed or out of sequence");
    this.pending.delete(frame.request_id); clearTimeout(pending.timer);
    if (!frame.payload?.ok) pending.reject(new Error("Native core rejected request")); else pending.resolve(frame.payload.payload);
  }

  #rejectAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
}
