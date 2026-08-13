const fs = require("fs");

function readHeader(archivePath) {
  const archive = fs.readFileSync(archivePath);
  if (archive.length < 16 || archive.readUInt32LE(0) !== 4) {
    throw new Error(`Invalid ASAR header: ${archivePath}`);
  }
  const pickleLength = archive.readUInt32LE(4);
  const payloadLength = archive.readUInt32LE(8);
  const jsonLength = archive.readUInt32LE(12);
  if (pickleLength !== payloadLength + 4 || 16 + jsonLength > archive.length) {
    throw new Error(`Invalid ASAR header lengths: ${archivePath}`);
  }
  return JSON.parse(archive.subarray(16, 16 + jsonLength).toString("utf8"));
}

function hasEntry(header, entryPath) {
  let current = header.files;
  for (const part of entryPath.replaceAll("\\", "/").split("/").filter(Boolean)) {
    if (!current || !Object.hasOwn(current, part)) return false;
    current = current[part].files;
  }
  return true;
}

const [, , archivePath, ...requiredEntries] = process.argv;
if (!archivePath || requiredEntries.length === 0) {
  console.error("Usage: node scripts/verify-asar-entries.js <app.asar> <entryPath> [...entryPath]");
  process.exit(2);
}

try {
  const header = readHeader(archivePath);
  for (const entryPath of requiredEntries) {
    if (!hasEntry(header, entryPath)) {
      throw new Error(`Required ASAR entry is missing: ${entryPath}`);
    }
  }
  console.log(`Verified ${requiredEntries.length} ASAR entries in ${archivePath}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
