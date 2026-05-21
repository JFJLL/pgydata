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
  let offset = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".git"))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    const files = {};

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files[entry.name] = { files: walk(fullPath) };
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        const item = {
          size: stat.size,
          offset: String(offset),
        };
        files[entry.name] = item;
        fileList.push({ path: fullPath, size: stat.size });
        offset += stat.size;
      }
    }

    return files;
  }

  return {
    header: { files: walk(rootDir) },
    fileList,
  };
}

async function pack(rootDir, outFile) {
  const source = path.resolve(rootDir);
  const target = path.resolve(outFile);
  const { header, fileList } = createHeader(source);
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

const [, , rootDir, outFile] = process.argv;
if (!rootDir || !outFile) {
  console.error("Usage: node scripts/pack-asar.js <sourceDir> <outFile>");
  process.exit(2);
}

pack(rootDir, outFile).catch((error) => {
  console.error(error);
  process.exit(1);
});
