const crypto = require("crypto");
const {
  Aes256Gcm,
  CipherSuite,
  DhkemX25519HkdfSha256,
  HkdfSha256,
} = require("@hpke/core");
const { canonicalJson, signPayload } = require("./manifest-crypto");

const DEFAULT_POLICY_KEY_ID = "magiorix-policy-2026-v1";
const POLICY_PROTOCOL = "magiorix-policy-hpke-v1";

function nowIso() { return new Date().toISOString(); }
function hashSha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function asBase64(value) { return Buffer.from(value).toString("base64"); }
function csvSet(value) { return new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean)); }

function assertVersion({ clientVersion, coreVersion, minimumClientVersion, minimumCoreVersion, revokedClientVersions, revokedCoreVersions }) {
  if (!clientVersion || !coreVersion) throw new Error("Client and core versions are required");
  if (minimumClientVersion && clientVersion < minimumClientVersion) throw new Error("Client version is no longer supported");
  if (minimumCoreVersion && coreVersion < minimumCoreVersion) throw new Error("Core version is no longer supported");
  if (revokedClientVersions.has(clientVersion) || revokedCoreVersions.has(coreVersion)) throw new Error("Client or core version is revoked");
}

class StrategyBundleService {
  constructor({
    db,
    policyPrivateKey = process.env.MAGIORIX_POLICY_SIGNING_PRIVATE_KEY || null,
    policyKeyId = process.env.MAGIORIX_POLICY_SIGNING_KEY_ID || DEFAULT_POLICY_KEY_ID,
    clock = nowIso,
    ttlSeconds = Number(process.env.MAGIORIX_POLICY_BUNDLE_TTL_SECONDS || 300),
    minimumClientVersion = process.env.MAGIORIX_MIN_SUPPORTED_CLIENT_VERSION || "1.4.2",
    minimumCoreVersion = process.env.MAGIORIX_MIN_SUPPORTED_CORE_VERSION || "1.4.2",
    revokedClientVersions = csvSet(process.env.MAGIORIX_REVOKED_CLIENT_VERSIONS),
    revokedCoreVersions = csvSet(process.env.MAGIORIX_REVOKED_CORE_VERSIONS),
    revokedTicketJti = csvSet(process.env.MAGIORIX_REVOKED_TICKET_JTI),
    revokedDeviceIds = csvSet(process.env.MAGIORIX_REVOKED_DEVICE_IDS),
    revokedPolicyVersions = csvSet(process.env.MAGIORIX_REVOKED_POLICY_VERSIONS),
    policyResolver = null,
  } = {}) {
    if (!db) throw new TypeError("db is required");
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 900) throw new TypeError("strategy bundle TTL must be between 60 and 900 seconds");
    this.db = db;
    this.policyPrivateKey = policyPrivateKey;
    this.policyKeyId = policyKeyId;
    this.clock = clock;
    this.ttlSeconds = ttlSeconds;
    this.minimumClientVersion = minimumClientVersion;
    this.minimumCoreVersion = minimumCoreVersion;
    this.revokedClientVersions = revokedClientVersions;
    this.revokedCoreVersions = revokedCoreVersions;
    this.revokedTicketJti = revokedTicketJti;
    this.revokedDeviceIds = revokedDeviceIds;
    this.revokedPolicyVersions = revokedPolicyVersions;
    this.policyResolver = policyResolver || ((auth, request) => ({
      policyVersion: request.policyVersion,
      taskType: auth.task_type,
      maxItems: auth.authorized_items,
      pointsPerItem: auth.points_per_item,
      capabilities: { export: true, resume: true },
    }));
    this.suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes256Gcm(),
    });
  }

  async createBundle({ userId, authorizationId, ticketJti, deviceKeyId, taskDigest, taskType, clientVersion, coreVersion, coreProtocolVersion, releaseManifestKeyId, ticketKeyId, policyKeyId, policyVersion }) {
    if (!this.policyPrivateKey) throw new Error("Policy signing key is unavailable");
    if (coreProtocolVersion !== 1) throw new Error("Unsupported core protocol version");
    if (!policyVersion || this.revokedPolicyVersions.has(policyVersion)) throw new Error("Policy version is revoked or missing");
    if (policyKeyId && policyKeyId !== this.policyKeyId) throw new Error("Unexpected policy key id");
    assertVersion({ clientVersion, coreVersion, minimumClientVersion: this.minimumClientVersion, minimumCoreVersion: this.minimumCoreVersion, revokedClientVersions: this.revokedClientVersions, revokedCoreVersions: this.revokedCoreVersions });

    const auth = await this.db.get(
      `SELECT a.*, d.device_key_id, d.encryption_public_key, d.key_backend, d.status AS device_status
       FROM task_authorizations a
       JOIN desktop_devices d ON d.id = a.device_id
       WHERE a.id = ? AND a.user_id = ?`,
      [authorizationId, userId],
    );
    if (!auth || !["AUTHORIZED", "STARTED"].includes(auth.status)) throw new Error("Authorization is not eligible for a strategy bundle");
    if (this.revokedTicketJti.has(ticketJti) || this.revokedDeviceIds.has(deviceKeyId)) throw new Error("Ticket or device is revoked");
    if (auth.ticket_jti !== ticketJti || auth.device_key_id !== deviceKeyId || auth.task_digest !== taskDigest || auth.task_type !== taskType) throw new Error("Strategy binding mismatch");
    if (auth.device_status !== "ACTIVE" || !auth.encryption_public_key) throw new Error("Active device encryption key is required");
    if (new Date(auth.ticket_expires_at).getTime() <= Date.now()) throw new Error("Authorization ticket has expired");

    const publicKeyBytes = Buffer.from(auth.encryption_public_key, "base64");
    if (publicKeyBytes.length !== 32) throw new Error("Device encryption public key is invalid");
    const issuedAt = this.clock();
    const expiresAt = new Date(new Date(issuedAt).getTime() + this.ttlSeconds * 1000).toISOString();
    const policy = this.policyResolver(auth, { policyVersion, taskType, clientVersion, coreVersion });
    const plaintext = Buffer.from(canonicalJson(policy), "utf8");
    const bundleDigest = hashSha256(plaintext);
    const binding = {
      protocol: POLICY_PROTOCOL,
      authorizationId, ticketJti, deviceKeyId, taskDigest, taskType,
      clientVersion, coreVersion, coreProtocolVersion, releaseManifestKeyId: releaseManifestKeyId || null,
      ticketKeyId: ticketKeyId || auth.ticket_key_id, policyKeyId: this.policyKeyId,
      policyVersion, issuedAt, expiresAt, bundleDigest,
    };
    const context = Buffer.from(canonicalJson(binding), "utf8");
    const recipientPublicKey = await this.suite.kem.importKey("raw", publicKeyBytes, true);
    const sender = await this.suite.createSenderContext({ recipientPublicKey, info: context });
    const ciphertext = await sender.seal(plaintext, context);
    const envelope = {
      ...binding,
      encapsulatedKey: asBase64(sender.enc),
      encryptedBundle: asBase64(ciphertext),
    };
    const signed = signPayload(envelope, this.policyPrivateKey, this.policyKeyId);
    await this.db.run(
      `INSERT INTO task_auth_audit_logs (
        user_id, device_id, authorization_id, action, task_type, task_digest,
        items_count, points_delta, status, error_code, ip_hash, created_at
      ) VALUES (?, ?, ?, 'STRATEGY_BUNDLE', ?, ?, 0, 0, 'ok', NULL, NULL, ?)`,
      [userId, deviceKeyId, authorizationId, taskType, taskDigest, issuedAt],
    );
    return { ...envelope, bundleSignature: Buffer.from(signed.signature, "hex").toString("base64"), keyId: signed.keyId };
  }
}

module.exports = { StrategyBundleService, DEFAULT_POLICY_KEY_ID, POLICY_PROTOCOL };
