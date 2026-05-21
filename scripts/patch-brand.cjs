const fs = require("fs");
const path = require("path");

const root = "D:/download/pic-vec/pgydata";
const targets = [
  path.join(root, "assets/1.1.1"),
  path.join(root, "app-source/dist-electron/index.js"),
  path.join(root, "app-source/package.json"),
  path.join(root, "patched-output/README.txt"),
];

const textExt = new Set([".js", ".html", ".json", ".txt"]);
const replacements = [
  ["易美数据抓取", "易美数据抓取"],
  ["关于 易美数据抓取", "关于 易美数据抓取"],
  ["武汉高真科技", "易美传播 Emagic"],
  ["易美数据抓取 Desktop", "易美数据抓取"],
  ["易美数据抓取", "易美数据抓取"],
  ["易美数据抓取", "易美数据抓取"],
];

function listFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target)) {
    const p = path.join(target, entry);
    const s = fs.statSync(p);
    if (s.isDirectory()) out.push(...listFiles(p));
    else if (textExt.has(path.extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of targets.flatMap(listFiles)) {
  let s = fs.readFileSync(file, "utf8");
  const old = s;
  for (const [from, to] of replacements) s = s.split(from).join(to);
  if (file.endsWith("app-source/dist-electron/index.js")) {
    s = s.replace('const lo = "https://api.zishutonggao.com";', 'const lo = "http://127.0.0.1:9";');
  }
  if (file.endsWith("app-source/package.json")) {
    s = s.replace('"name": "@zs/desktop"', '"name": "pygdata-desktop"');
    s = s.replace('"author": "易美数据抓取"', '"author": "易美传播 Emagic"');
    s = s.replace('"description": "Desktop client for system and data management"', '"description": "Local PGY data collection desktop client"');
  }
  if (s !== old) {
    fs.writeFileSync(file, s);
    changed++;
    console.log("branded", file);
  }
}
console.log(`changed ${changed} files`);
