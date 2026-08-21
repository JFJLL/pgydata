import crypto from "crypto";
import fs from "fs";
import path from "path";

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

const [corePath, outputPath, appVersion, coreVersion, protocolVersion, authenticodeSubject = "", authenticodeThumbprint = ""] = process.argv.slice(2);
if (!corePath || !outputPath || !appVersion || !coreVersion || !protocolVersion) {
  throw new Error("Usage: write-signed-core-manifest.mjs <core> <output> <appVersion> <coreVersion> <protocolVersion> [subject] [thumbprint]");
}
const privateKey = process.env.MAGIORIX_RELEASE_MANIFEST_PRIVATE_KEY;
const keyId = process.env.MAGIORIX_RELEASE_MANIFEST_KEY_ID || "magiorix-release-2026-v1";
if (!privateKey) throw new Error("MAGIORIX_RELEASE_MANIFEST_PRIVATE_KEY is required to sign the core manifest");
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(corePath)).digest("hex").toLowerCase();
const signedPayload = {
  appVersion,
  coreVersion,
  coreProtocolVersion: Number(protocolVersion),
  coreSha256: sha256,
  sha256,
  authenticodeSubject: authenticodeSubject || null,
  authenticodeThumbprint: authenticodeThumbprint || null,
};
const signature = crypto.sign(null, Buffer.from(canonicalJson(signedPayload), "utf8"), privateKey).toString("hex");
const metadata = {
  appVersion,
  coreVersion,
  coreProtocolVersion: Number(protocolVersion),
  coreSha256: sha256,
  signedCoreManifest: { keyId, signature, signedPayload },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(`Wrote signed core manifest: ${outputPath}`);
