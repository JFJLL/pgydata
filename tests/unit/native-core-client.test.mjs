import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { encodeCanonicalMessagePack, verifyNativeCoreFile } from "../../app-source/electron-main/native-core-client.mjs";

test("native core MessagePack encoder orders object keys by UTF-8 bytes", () => {
  const encoded = encodeCanonicalMessagePack({ b: 1, a: 2 });
  assert.deepEqual([...encoded], [0x82, 0xa1, 0x61, 0x02, 0xa1, 0x62, 0x01]);
});

test("native core file verification rejects hashes that do not match", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-core-client-"));
  try {
    const core = path.join(base, "magiorix-core.exe");
    fs.writeFileSync(core, "candidate core");
    const goodHash = crypto.createHash("sha256").update(fs.readFileSync(core)).digest("hex").toUpperCase();
    assert.equal(verifyNativeCoreFile({ corePath: core, installRoot: base, expectedSha256: goodHash }).sha256, goodHash);
    assert.throws(() => verifyNativeCoreFile({ corePath: core, installRoot: base, expectedSha256: "0".repeat(64) }), /SHA-256/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
