const fs = require('fs');
const path = require('path');

const roots = [
  path.resolve('analysis/zs-desktop-1.0.4/original-assets/assets'),
  path.resolve('assets/1.1.1/assets'),
  path.resolve('analysis/zs-desktop-1.0.4/extracted-interesting/dist-electron'),
];

const fileExt = /\.(js|mjs|cjs|html|json|css|yml|yaml)$/i;
const ignoreName = /(?:mui-vendor|react-vendor|xlsx-|react-apexcharts|zh-cn|shape-square|\.map$)/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (fileExt.test(entry.name) && !ignoreName.test(entry.name)) out.push(p);
  }
  return out;
}

const urlHits = new Map();
const apiHits = new Map();
const keywordHits = new Map();
const keywords = [
  '登录',
  '充值',
  '余额',
  '套餐',
  '薯苗',
  '会员',
  '订单',
  '支付',
  '扣费',
  'login',
  'auth',
  'recharge',
  'balance',
  'payment',
  'order',
  'plan',
  'wallet',
  'credit',
  'quota',
  'shumiao',
];

function add(map, key, file) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(path.relative(process.cwd(), file));
}

for (const file of roots.flatMap((root) => walk(root))) {
  const s = fs.readFileSync(file, 'utf8');

  for (const m of s.matchAll(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]+/g)) {
    const url = m[0]
      .replace(/[),.;]+$/, '')
      .replace(/\\u0026/g, '&')
      .slice(0, 260);
    add(urlHits, url, file);
  }

  for (const m of s.matchAll(/(?:url\s*:\s*|\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(|request\([^,]+,\s*)["'`]((?:\/api\/|api\/)[^"'`]+)["'`]/g)) {
    add(apiHits, m[1].slice(0, 260), file);
  }

  for (const m of s.matchAll(/["'`]((?:\/api\/|api\/)[A-Za-z0-9_./?&={}:$%-]+)["'`]/g)) {
    add(apiHits, m[1].slice(0, 260), file);
  }

  for (const m of s.matchAll(/`((?:\/api\/|api\/)[^`]+)`/g)) {
    add(apiHits, m[1].slice(0, 260), file);
  }

  for (const keyword of keywords) {
    if (s.includes(keyword)) add(keywordHits, keyword, file);
  }
}

function printMap(title, map) {
  console.log(`\n## ${title} (${map.size})`);
  for (const [key, files] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${key}`);
    console.log(`  ${[...files].slice(0, 5).join(', ')}`);
  }
}

printMap('External URLs', urlHits);
printMap('API Paths', apiHits);
printMap('Keyword Files', keywordHits);
