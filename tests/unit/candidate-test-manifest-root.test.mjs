import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  signPayload,
  verifySignedEnvelope,
} from "../../app-source/electron-main/manifest-crypto.mjs";

test("candidate test release key is accepted only when explicit test mode is enabled", () => {
  const keyId = "magiorix-candidate-test-unit-key";
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const envelope = signPayload({ coreVersion: "1.4.2", coreSha256: "a".repeat(64) }, privateKeyPem, keyId);

  assert.equal(verifySignedEnvelope(envelope).valid, false);
  process.env.MAGIORIX_CANDIDATE_TEST_MODE = "1";
  process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_KEY_ID = keyId;
  process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_PUBLIC_KEY = publicKeyPem;
  try {
    const verified = verifySignedEnvelope(envelope);
    assert.equal(verified.valid, true);
  } finally {
    delete process.env.MAGIORIX_CANDIDATE_TEST_MODE;
    delete process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_KEY_ID;
    delete process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_PUBLIC_KEY;
  }
  assert.equal(verifySignedEnvelope(envelope).valid, false);
});
