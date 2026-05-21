import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asarPath = path.resolve(repoRoot, 'analysis/zs-desktop-1.0.4/resources/app.asar');
const outputDir = path.resolve(repoRoot, 'analysis/zs-desktop-1.0.4/extracted-interesting');
const { listPackage, extractFile } = await import(
  pathToFileURL(path.resolve(repoRoot, 'analysis/asar-tool/node_modules/@electron/asar/lib/asar.js')).href
);

function pathToFileURL(filePath) {
  let resolved = path.resolve(filePath).replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = `/${resolved}`;
  return new URL(`file://${resolved}`);
}

const files = listPackage(asarPath).map((name) => name.replace(/^\\/, '').replace(/\\/g, '/'));

const interesting = files.filter((file) => {
  if (!file || file.startsWith('node_modules/')) return false;
  if (file === 'package.json') return true;
  if (
    (file.startsWith('dist-electron/') ||
      file.startsWith('dist/') ||
      file.startsWith('build/') ||
      file.startsWith('resources/')) &&
    /\.[^/]+$/.test(file)
  ) {
    return true;
  }
  if (/\.(js|mjs|cjs|json|html|css|map|yml|yaml|ts)$/.test(file)) return true;
  return false;
});

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const file of interesting) {
  const target = path.join(outputDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(target, extractFile(asarPath, file));
  } catch (error) {
    console.warn(`skip ${file}: ${error.message}`);
  }
}

console.log(`asar files: ${files.length}`);
console.log(`interesting extracted: ${interesting.length}`);
console.log(`output: ${outputDir}`);
console.log(interesting.slice(0, 80).join('\n'));
