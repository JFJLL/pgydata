const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");

function collectAllEntries(srcDir) {
  const filenames = [];
  const metadata = {};
  const activeRealDirectories = new Set();

  function walk(apparentDir) {
    const realDir = fs.realpathSync(apparentDir);
    if (activeRealDirectories.has(realDir)) {
      throw new Error("Refusing to follow a cyclic directory link: " + apparentDir);
    }
    activeRealDirectories.add(realDir);

    const entries = fs.readdirSync(apparentDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".git"))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      const apparentFullPath = path.join(apparentDir, entry.name);
      const stat = fs.statSync(apparentFullPath);
      filenames.push(apparentFullPath);
      if (stat.isDirectory()) {
        metadata[apparentFullPath] = { type: "directory", stat };
        walk(apparentFullPath);
      } else if (stat.isFile()) {
        metadata[apparentFullPath] = { type: "file", stat };
      }
    }

    activeRealDirectories.delete(realDir);
  }

  walk(srcDir);
  return { filenames, metadata };
}

function assertRequiredEntries(destAsar, requiredEntries) {
  for (const entryPath of requiredEntries) {
    const normalized = path.normalize(entryPath);
    try {
      const stat = asar.statFile(destAsar, normalized);
      if (!stat || typeof stat.size !== "number") {
        throw new Error("Required ASAR entry has invalid stat: " + entryPath);
      }
    } catch (err) {
      throw new Error("Required ASAR entry is missing: " + entryPath + " (" + err.message + ")");
    }
  }
}

const [, , rootDir, outFile, ...args] = process.argv;
if (!rootDir || !outFile) {
  console.error("Usage: node scripts/pack-asar.js <sourceDir> <outFile> [--require <entryPath>]");
  process.exit(2);
}

const requiredEntries = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== "--require" || !args[index + 1]) {
    console.error("Unexpected argument: " + args[index]);
    process.exit(2);
  }
  requiredEntries.push(args[index + 1]);
  index += 1;
}

async function run() {
  const source = path.resolve(rootDir);
  const target = path.resolve(outFile);
  const { filenames, metadata } = collectAllEntries(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await asar.createPackageFromFiles(source, target, filenames, metadata, {});
  assertRequiredEntries(target, requiredEntries);
  console.log("Successfully packed ASAR with @electron/asar:", target, "entries:", filenames.length);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
