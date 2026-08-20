const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } = require("@hpke/core");
const { canonicalJson } = require("../lib/manifest-crypto");
const { StrategyBundleService } = require("../lib/strategy-bundle-service");

function suite() {
  return new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
}

test("strategy bundle is HPKE encrypted, signed and bound to exactly one authorization", async () => {
  const hpke = suite();
  const deviceKeys = await hpke.kem.generateKeyPair();
  const publicRaw = Buffer.from(await hpke.kem.serializePublicKey(deviceKeys.publicKey)).toString("base64");
  const signing = crypto.generateKeyPairSync("ed25519");
  const auth = {
    id: "auth-1", user_id: 7, device_id: "device-row-1", device_key_id: "device-key-1",
    encryption_public_key: publicRaw, device_status: "ACTIVE", status: "AUTHORIZED",
    ticket_jti: "ticket-1", task_digest: "a".repeat(64), task_type: "pgy-kol",
    authorized_items: 12, points_per_item: 1, ticket_key_id: "ticket-key-1",
    ticket_expires_at: "2030-01-01T00:00:00.000Z",
  };
  const audit = [];
  const service = new StrategyBundleService({
    db: { get: async () => auth, run: async (...args) => { audit.push(args); return { changes: 1 }; } },
    policyPrivateKey: signing.privateKey.export({ type: "pkcs8", format: "pem" }),
    policyKeyId: "policy-key-1",
    clock: () => "2026-08-20T00:00:00.000Z",
    ttlSeconds: 300,
    minimumClientVersion: "1.4.2",
    minimumCoreVersion: "1.4.2",
  });
  const result = await service.createBundle({
    userId: 7, authorizationId: "auth-1", ticketJti: "ticket-1", deviceKeyId: "device-key-1",
    taskDigest: "a".repeat(64), taskType: "pgy-kol", clientVersion: "1.4.2", coreVersion: "1.4.2",
    coreProtocolVersion: 1, releaseManifestKeyId: "release-key-1", ticketKeyId: "ticket-key-1",
    policyKeyId: "policy-key-1", policyVersion: "2026-08-20",
  });
  const signedPayload = { ...result };
  delete signedPayload.bundleSignature;
  delete signedPayload.keyId;
  assert.equal(crypto.verify(null, Buffer.from(canonicalJson(signedPayload), "utf8"), signing.publicKey, Buffer.from(result.bundleSignature, "base64")), true);
  const binding = { ...signedPayload };
  delete binding.encapsulatedKey;
  delete binding.encryptedBundle;
  const context = Buffer.from(canonicalJson(binding), "utf8");
  const recipient = await hpke.createRecipientContext({ recipientKey: deviceKeys.privateKey, enc: Buffer.from(result.encapsulatedKey, "base64"), info: context });
  const plaintext = await recipient.open(Buffer.from(result.encryptedBundle, "base64"), context);
  const policy = JSON.parse(Buffer.from(plaintext).toString("utf8"));
  assert.equal(policy.maxItems, 12);
  assert.equal(policy.taskType, "pgy-kol");
  await assert.rejects(() => recipient.open(Buffer.from(result.encryptedBundle, "base64"), Buffer.from("tampered", "utf8")));
  assert.equal(audit.length, 1);
  assert.equal(JSON.stringify(audit[0]).includes("encryptedBundle"), false);
});
