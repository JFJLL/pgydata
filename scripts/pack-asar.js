const fs = require("fs");
const path = require("path");

function align4(n) {
  return (4 - (n % 4)) % 4;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function pickleString(value) {
  const bytes = Buffer.from(value, "utf8");
  const payload = Buffer.concat([
    writeUInt32(bytes.length),
    bytes,
    Buffer.from([0]),
    Buffer.alloc(align4(4 + bytes.length + 1)),
  ]);
  return Buffer.concat([writeUInt32(payload.length), payload]);
}

function createHeader(rootDir) {
  const fileList = [];
  const activeDirectories = new Set();
  let offset = 0;

  function walk(dir) {
    const realDir = fs.realpathSync(dir);
    if (activeDirectories.has(realDir)) {
      throw new Error(`Refusing to follow a cyclic directory link: ${dir}`);
    }
    activeDirectories.add(realDir);
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".git"))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    const files = {};

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // fs.statSync follows directory links. This matters for worktrees where
      // node_modules is commonly linked to a shared dependency directory.
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files[entry.name] = { files: walk(fullPath) };
      } else if (stat.isFile()) {
        const item = {
          size: stat.size,
          offset: String(offset),
        };
        files[entry.name] = item;
        fileList.push({ path: fullPath, size: stat.size });
        offset += stat.size;
      }
    }

    activeDirectories.delete(realDir);
    return files;
  }

  return {
    header: { files: walk(rootDir) },
    fileList,
  };
}

function assertRequiredEntries(header, requiredEntries) {
  for (const entryPath of requiredEntries) {
    const parts = entryPath.replaceAll("\\", "/").split("/").filter(Boolean);
    let current = header.files;
    for (const part of parts) {
      if (!current || !Object.hasOwn(current, part)) {
        throw new Error(`Required ASAR entry is missing: ${entryPath}`);
      }
      const item = current[part];
      current = item.files;
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
    console.error(`Unexpected argument: ${args[index]}`);
    process.exit(2);
  }
  requiredEntries.push(args[index + 1]);
  index += 1;
}

async function run() {
  const source = path.resolve(rootDir);
  const target = path.resolve(outFile);
  const { header, fileList } = createHeader(source);
  assertRequiredEntries(header, requiredEntries);
  const headerPickle = pickleString(JSON.stringify(header));
  const sizePickle = Buffer.concat([writeUInt32(4), writeUInt32(headerPickle.length)]);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const out = fs.createWriteStream(target);
  out.write(sizePickle);
  out.write(headerPickle);

  for (const file of fileList) {
    await new Promise((resolve, reject) => {
      const input = fs.createReadStream(file.path);
      input.on("error", reject);
      input.on("end", resolve);
      input.pipe(out, { end: false });
    });
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
