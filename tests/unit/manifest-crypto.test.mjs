import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  canonicalJson,
  signPayload,
  verifySignedEnvelope,
  TRUSTED_PUBLIC_KEYS,
  DEFAULT_KEY_ID,
} from "../../scripts/manifest-crypto.js";

test("canonicalJson produces deterministic lexicographically-sorted JSON without whitespace", () => {
  const obj1 = { z: 1, a: 2, m: { y: "b", x: "a" }, list: [3, 2, 1] };
  const obj2 = { m: { x: "a", y: "b" }, list: [3, 2, 1], a: 2, z: 1 };
  assert.equal(canonicalJson(obj1), canonicalJson(obj2));
  assert.equal(canonicalJson(obj1), '{"a":2,"list":[3,2,1],"m":{"x":"a","y":"b"},"z":1}');
});

test("signPayload and verifySignedEnvelope work end-to-end with generated Ed25519 keypair", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

  const customKeys = { "test-key-01": pubKeyPem };
  const payload = { version: "1.4.2", files: [{ path: "index.html", size: 100, sha256: "abcd" }] };

  const envelope = signPayload(payload, privKeyPem, "test-key-01");
  assert.equal(envelope.keyId, "test-key-01");
  assert.ok(typeof envelope.signature === "string" && envelope.signature.length > 0);

  const verifyResult = verifySignedEnvelope(envelope, customKeys);
  assert.equal(verifyResult.valid, true);
  assert.equal(verifyResult.reason, null);
  assert.deepEqual(verifyResult.payload, payload);
});

test("verifySignedEnvelope rejects tampered payloads", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

  const customKeys = { "test-key-02": pubKeyPem };
  const payload = { version: "1.4.2", count: 10 };

  const envelope = signPayload(payload, privKeyPem, "test-key-02");
  // Tamper with payload
  envelope.signedPayload.count = 999;

  const verifyResult = verifySignedEnvelope(envelope, customKeys);
  assert.equal(verifyResult.valid, false);
  assert.match(verifyResult.reason, /Signature verification failed/);
});

test("verifySignedEnvelope rejects unsigned or unknown key envelopes", () => {
  const unsignedEnvelope = signPayload({ test: 1 }, null);
  assert.equal(unsignedEnvelope.keyId, "unsigned-local");
  assert.equal(unsignedEnvelope.signature, null);

  const verifyUnsigned = verifySignedEnvelope(unsignedEnvelope);
  assert.equal(verifyUnsigned.valid, false);
  assert.equal(verifyUnsigned.isUnsigned, true);

  const unknownKeyEnvelope = {
    keyId: "unknown-key-999",
    signature: "deadbeef",
    signedPayload: { foo: "bar" },
  };
  const verifyUnknown = verifySignedEnvelope(unknownKeyEnvelope);
  assert.equal(verifyUnknown.valid, false);
  assert.match(verifyUnknown.reason, /Unknown keyId/);
});

