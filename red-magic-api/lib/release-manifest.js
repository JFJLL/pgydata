const fs = require("fs");
const path = require("path");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function normalizeSha256(value) {
  return String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
}

function requireString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`Release manifest field is required: ${field}`);
  return normalized;
}

function validateUrl(value, field) {
  const normalized = requireString(value, field);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Release manifest URL is invalid: ${field}`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error(`Release manifest URL must use HTTP(S): ${field}`);
  }
  return parsed.toString();
}

function validateArtifact(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Release manifest object is required: ${field}`);
  }
  const version = requireString(value.version, `${field}.version`);
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Release manifest version is invalid: ${field}.version`);
  }
  const size = Number(value.size);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`Release manifest size is invalid: ${field}.size`);
  }
  const sha256 = normalizeSha256(value.sha256);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`Release manifest SHA256 is invalid: ${field}.sha256`);
  }
  const fileName = requireString(value.fileName, `${field}.fileName`);
  if (fileName === "." || fileName === ".." || /[\\/]/.test(fileName)) {
    throw new Error(`Release manifest fileName must be a base name: ${field}.fileName`);
  }
  return {
    version,
    fileName,
    downloadUrl: validateUrl(value.downloadUrl, `${field}.downloadUrl`),
    size,
    sha256,
  };
}

function validateReleaseManifest(value, source = "release manifest") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  if (Number(value.schemaVersion) !== 1) {
    throw new Error(`${source} uses unsupported schemaVersion: ${value.schemaVersion}`);
  }
  const releaseNotes = Array.isArray(value.releaseNotes)
    ? value.releaseNotes.map((item) => String(item).trim()).filter(Boolean)
    : [];
  return {
    schemaVersion: 1,
    channel: requireString(value.channel || "stable", "channel"),
    desktop: validateArtifact(value.desktop, "desktop"),
    assets: validateArtifact(value.assets, "assets"),
    releaseNotes,
    generatedAt: requireString(value.generatedAt, "generatedAt"),
  };
}

function loadReleaseManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`Release manifest cannot be parsed: ${resolvedPath} (${error.message})`);
  }
  return {
    path: resolvedPath,
    release: validateReleaseManifest(parsed, resolvedPath),
  };
}

module.exports = {
  normalizeSha256,
  validateReleaseManifest,
  loadReleaseManifest,
};
