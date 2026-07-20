const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  loadReleaseManifest,
  normalizeSha256,
  validateReleaseManifest,
} = require("../../red-magic-api/lib/release-manifest");

function validManifest() {
  return {
    schemaVersion: 1,
    channel: "stable",
    desktop: {
      version: "1.2.3",
      fileName: "magiorix-desktop-1.2.3-windows.exe",
      downloadUrl: "https://example.test/magiorix.exe",
      size: 100,
      sha256: "A".repeat(64),
    },
    assets: {
      version: "1.2.4",
      fileName: "assets.zip",
      downloadUrl: "https://example.test/assets.zip",
      size: 50,
      sha256: `sha256:${"b".repeat(64)}`,
    },
    releaseNotes: [" Fixed update flow ", ""],
    generatedAt: "2026-07-20T00:00:00.000Z",
  };
}

test("normalizes and validates release metadata", () => {
  const release = validateReleaseManifest(validManifest());
  assert.equal(release.desktop.sha256, "a".repeat(64));
  assert.equal(release.assets.sha256, "b".repeat(64));
  assert.deepEqual(release.releaseNotes, ["Fixed update flow"]);
  assert.equal(normalizeSha256(`SHA256:${"C".repeat(64)}`), "c".repeat(64));
});

test("rejects unsafe or incomplete release metadata", () => {
  const invalidSha = validManifest();
  invalidSha.desktop.sha256 = "abc";
  assert.throws(() => validateReleaseManifest(invalidSha), /desktop\.sha256/);

  const invalidUrl = validManifest();
  invalidUrl.assets.downloadUrl = "file:///tmp/assets.zip";
  assert.throws(() => validateReleaseManifest(invalidUrl), /HTTP\(S\)/);

  const invalidVersion = validManifest();
  invalidVersion.desktop.version = "latest";
  assert.throws(() => validateReleaseManifest(invalidVersion), /desktop\.version/);

  const prereleaseVersion = validManifest();
  prereleaseVersion.desktop.version = "1.2.4-beta.1";
  assert.throws(() => validateReleaseManifest(prereleaseVersion), /desktop\.version/);

  const unsafeFileName = validManifest();
  unsafeFileName.desktop.fileName = "../installer.exe";
  assert.throws(() => validateReleaseManifest(unsafeFileName), /base name/);
});

test("loads a manifest from disk and returns null when absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-manifest-"));
  try {
    const manifestPath = path.join(tempDir, "latest.json");
    assert.equal(loadReleaseManifest(manifestPath), null);
    fs.writeFileSync(manifestPath, JSON.stringify(validManifest()), "utf8");
    const loaded = loadReleaseManifest(manifestPath);
    assert.equal(loaded.path, path.resolve(manifestPath));
    assert.equal(loaded.release.desktop.version, "1.2.3");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
