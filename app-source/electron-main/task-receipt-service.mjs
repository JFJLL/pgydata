import crypto from "crypto";
import fs from "fs";
import path from "path";
import { canonicalJson } from "./manifest-crypto.mjs";

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const PENDING_QUEUE_VERSION = 1;

function hashSha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function isReceiptSignature(value) {
  return typeof value === "string" && /^[a-f0-9]{128}$/i.test(value);
}

/**
 * Creates Ed25519-signed Receipt chains and persists final Receipts that could
 * not reach the cloud. The persisted queue deliberately contains counters and
 * cryptographic metadata only; it never accepts task inputs or collected data.
 */
export class TaskReceiptService {
  constructor({ deviceKeyManager, apiClient = null, queueFilePath = null } = {}) {
    if (!deviceKeyManager) throw new Error("deviceKeyManager is required");
    this.deviceKeyManager = deviceKeyManager;
    this.apiClient = apiClient;
    this.chains = new Map();
    this.queueFilePath = queueFilePath
      || (deviceKeyManager.baseDir ? path.join(deviceKeyManager.baseDir, "pending-task-receipts.json") : null);
    this.pendingFinalReceipts = this.#loadPendingFinalReceipts();
  }

  #loadPendingFinalReceipts() {
    if (!this.queueFilePath || !fs.existsSync(this.queueFilePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.queueFilePath, "utf8"));
      if (parsed?.version !== PENDING_QUEUE_VERSION || !Array.isArray(parsed.items)) return [];
      return parsed.items.filter((item) => item && item.receipt?.final === true && item.authorizationId);
    } catch {
      return [];
    }
  }

  #persistPendingFinalReceipts() {
    if (!this.queueFilePath) return;
    fs.mkdirSync(path.dirname(this.queueFilePath), { recursive: true });
    const payload = {
      version: PENDING_QUEUE_VERSION,
      items: this.pendingFinalReceipts,
    };
    fs.writeFileSync(this.queueFilePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }

  createChain(authorizationId, ticketJti) {
    if (!authorizationId || !ticketJti) throw new Error("authorizationId and ticketJti are required");
    const existing = this.chains.get(authorizationId);
    if (existing) return existing;
    const chain = {
      authorizationId,
      ticketJti,
      sequence: 0,
      lastHash: GENESIS_HASH,
      receipts: [],
      finalSubmitted: false,
    };
    this.chains.set(authorizationId, chain);
    return chain;
  }

  getChain(authorizationId) {
    return this.chains.get(authorizationId) || null;
  }

  generateReceipt(authorizationId, {
    processedCount,
    successCount,
    failedCount,
    taskState = "running",
    isFinal = false,
  } = {}) {
    const chain = this.getChain(authorizationId);
    if (!chain) throw new Error(`Receipt chain not initialized for authorization: ${authorizationId}`);
    if (chain.finalSubmitted) throw new Error("Final receipt has already been created");

    const processed = Number(processedCount);
    const success = Number(successCount);
    const failed = Number(failedCount);
    if (![processed, success, failed].every(Number.isInteger) || processed < 0 || success < 0 || failed < 0 || processed !== success + failed) {
      throw new Error("Receipt counters must be non-negative integers and processedCount must equal successCount + failedCount");
    }
    const previous = chain.receipts.at(-1);
    if (previous && processed < previous.processedCount) {
      throw new Error("Receipt processedCount cannot decrease");
    }

    const deviceKeyId = this.deviceKeyManager.getDeviceKeyId();
    const receiptBody = {
      authorizationId,
      ticketJti: chain.ticketJti,
      sequence: chain.sequence + 1,
      previousReceiptHash: chain.lastHash,
      processedCount: processed,
      successCount: success,
      failedCount: failed,
      timestamp: new Date().toISOString(),
      taskState: String(taskState || "running"),
      final: Boolean(isFinal),
      deviceKeyId,
    };
    const canonical = canonicalJson(receiptBody);
    const receiptHash = hashSha256(canonical);
    const deviceSignature = this.deviceKeyManager.sign(canonical);
    if (!isReceiptSignature(deviceSignature)) throw new Error("Device signature has invalid encoding");

    const fullReceipt = { ...receiptBody, receiptHash, deviceSignature };
    chain.sequence = fullReceipt.sequence;
    chain.lastHash = receiptHash;
    chain.receipts.push(fullReceipt);
    if (fullReceipt.final) chain.finalSubmitted = true;
    return fullReceipt;
  }

  enqueueFinalReceipt({ clientTaskId, authorizationId, receipt }) {
    if (!clientTaskId || !authorizationId || !receipt?.final) throw new Error("A final receipt and task identifiers are required");
    if (receipt.authorizationId !== authorizationId) throw new Error("Receipt authorizationId mismatch");
    if (!this.verifyChain([receipt], this.deviceKeyManager.getPublicKeyPem())) {
      throw new Error("Final receipt fails local integrity verification");
    }
    const existingIndex = this.pendingFinalReceipts.findIndex((item) => item.authorizationId === authorizationId);
    const item = { clientTaskId, authorizationId, receipt, queuedAt: new Date().toISOString() };
    if (existingIndex >= 0) this.pendingFinalReceipts[existingIndex] = item;
    else this.pendingFinalReceipts.push(item);
    this.pendingFinalReceipts.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    this.#persistPendingFinalReceipts();
    return { queued: true, pendingCount: this.pendingFinalReceipts.length };
  }

  async flushPendingFinalReceipts() {
    if (!this.apiClient || this.pendingFinalReceipts.length === 0) {
      return { flushedCount: 0, pendingCount: this.pendingFinalReceipts.length };
    }
    let flushedCount = 0;
    while (this.pendingFinalReceipts.length > 0) {
      const item = this.pendingFinalReceipts[0];
      try {
        await this.apiClient.post(
          `/api/desktop/task-authorizations/${encodeURIComponent(item.authorizationId)}/complete`,
          { finalReceipt: item.receipt },
          { headers: { "X-Magiorix-Client-Version": "1.4.2" } },
        );
      } catch {
        break;
      }
      this.pendingFinalReceipts.shift();
      flushedCount += 1;
      this.#persistPendingFinalReceipts();
    }
    return { flushedCount, pendingCount: this.pendingFinalReceipts.length };
  }

  verifyChain(receipts, devicePublicKeyPem) {
    if (!Array.isArray(receipts) || receipts.length === 0) return false;
    let expectedPreviousHash = GENESIS_HASH;
    let expectedSequence = 1;
    let lastProcessed = 0;
    for (const receipt of receipts) {
      if (!receipt || receipt.sequence !== expectedSequence || receipt.previousReceiptHash !== expectedPreviousHash) return false;
      if (!Number.isInteger(receipt.processedCount) || !Number.isInteger(receipt.successCount) || !Number.isInteger(receipt.failedCount)
        || receipt.processedCount < lastProcessed || receipt.processedCount !== receipt.successCount + receipt.failedCount) return false;
      const body = { ...receipt };
      delete body.receiptHash;
      delete body.deviceSignature;
      const canonical = canonicalJson(body);
      const computedHash = hashSha256(canonical);
      if (receipt.receiptHash !== computedHash || !isReceiptSignature(receipt.deviceSignature)) return false;
      if (devicePublicKeyPem && !crypto.verify(null, Buffer.from(canonical, "utf8"), devicePublicKeyPem, Buffer.from(receipt.deviceSignature, "hex"))) {
        return false;
      }
      expectedPreviousHash = receipt.receiptHash;
      expectedSequence += 1;
      lastProcessed = receipt.processedCount;
    }
    return true;
  }
}

export { GENESIS_HASH };
