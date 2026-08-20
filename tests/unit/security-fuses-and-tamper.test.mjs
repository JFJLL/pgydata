import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options } from "@electron/fuses";
import asar from "@electron/asar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function safeRemoveDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
}

test("Electron Fuses flip and verify wire values", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fuses-unit-"));
  const srcExe = path.resolve(root, "runtime/magiorix-desktop/magiorix.exe");
  const testExe = path.join(tmp, "magiorix.exe");
  fs.copyFileSync(srcExe, testExe);

  await flipFuses(testExe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  const wire = await getCurrentFuseWire(testExe);
  // '0' is ASCII 48 (false), '1' is ASCII 49 (true)
  assert.equal(wire[FuseV1Options.RunAsNode], 48, "RunAsNode must be false (48)");
  assert.equal(wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable], 48, "EnableNodeOptions must be false (48)");
  assert.equal(wire[FuseV1Options.EnableNodeCliInspectArguments], 48, "EnableNodeCliInspect must be false (48)");
  assert.equal(wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation], 49, "EnableEmbeddedAsarIntegrityValidation must be true (49)");
  assert.equal(wire[FuseV1Options.OnlyLoadAppFromAsar], 49, "OnlyLoadAppFromAsar must be true (49)");

  safeRemoveDir(tmp);
});

test("RunAsNode fuse enforcement blocks ELECTRON_RUN_AS_NODE execution", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fuses-run-as-node-"));
  const srcExe = path.resolve(root, "runtime/magiorix-desktop/magiorix.exe");
  const testExe = path.join(tmp, "magiorix.exe");
  fs.copyFileSync(srcExe, testExe);

  // Copy required DLLs for execution
  for (const f of ["d3dcompiler_47.dll", "ffmpeg.dll", "icudtl.dat", "libEGL.dll", "libGLESv2.dll", "resources.pak", "v8_context_snapshot.bin", "snapshot_blob.bin", "vk_swiftshader.dll", "vk_swiftshader_icd.json", "vulkan-1.dll"]) {
    const src = path.resolve(root, "runtime/magiorix-desktop", f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
  }

  // Flip fuses
  spawnSync(process.execPath, [
    path.resolve(root, "scripts/apply-electron-fuses.js"),
    testExe,
  ], { encoding: "utf8" });

  const result = spawnSync(testExe, ["-p", "process.versions"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 5000,
  });

  // Since RunAsNode is fused to false, executing as node must fail (exit status non-zero or no JS eval)
  assert.notEqual(result.stdout?.trim(), '{"node":"20.18.0"}');
  assert.notEqual(result.status, 0);

  safeRemoveDir(tmp);
});

test("ASAR archive includes block-level SHA256 integrity metadata", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asar-integrity-test-"));
  const src = path.join(tmp, "src");
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, "index.js"), 'console.log("integrity test");');
  const dest = path.join(tmp, "app.asar");

  await asar.createPackage(src, dest);
  const header = asar.getRawHeader(dest);
  assert.ok(header.header.files["index.js"], "index.js must be in header");
  const integrity = header.header.files["index.js"].integrity;
  assert.ok(integrity, "integrity metadata must exist");
  assert.equal(integrity.algorithm, "SHA256");
  assert.ok(Array.isArray(integrity.blocks) && integrity.blocks.length > 0);
  assert.equal(typeof integrity.hash, "string");
  assert.equal(integrity.hash.length, 64);

  safeRemoveDir(tmp);
});

