const fs = require('fs');
const path = require('path');

const warning = '勾选粉丝画像相关字段会显著增加采集时间，请根据实际需要酌情勾选。';

const files = [
  path.resolve('assets/1.1.1/assets/index-B09sHfUO.js'),
  path.resolve('patched-output/assets/1.1.1/assets/index-B09sHfUO.js'),
  path.resolve(process.env.APPDATA || '', 'pygdata-desktop/assets/1.1.1/assets/index-B09sHfUO.js'),
  path.resolve(process.env.APPDATA || '', '@zs/desktop/assets/1.1.1/assets/index-B09sHfUO.js'),
];

const replacements = [
  [
    'groupKey:"fans-gender",groupLabel:"粉丝画像",description:"观众画像男女占比"',
    `groupKey:"fans-gender",groupLabel:"粉丝画像",description:"观众画像男女占比。${warning}"`,
  ],
  [
    'groupKey:"fans-age",groupLabel:"粉丝画像-年龄分布",description:"粉丝年龄段细分占比"',
    `groupKey:"fans-age",groupLabel:"粉丝画像-年龄分布",description:"粉丝年龄段细分占比。${warning}"`,
  ],
  [
    'groupKey:"fans-age-summary",groupLabel:"粉丝画像-年龄分布汇总",description:"粉丝主力年龄段"',
    `groupKey:"fans-age-summary",groupLabel:"粉丝画像-年龄分布汇总",description:"粉丝主力年龄段。${warning}"`,
  ],
  [
    'groupKey:"fans-portrait-detail",groupLabel:"粉丝画像-细分",description:"地域 / 城市等级 / 兴趣 / 八大人群 / 设备等次级画像"',
    `groupKey:"fans-portrait-detail",groupLabel:"粉丝画像-细分",description:"地域 / 城市等级 / 兴趣 / 八大人群 / 设备等次级画像。${warning}"`,
  ],
];

let changedCount = 0;
let touchedCount = 0;

for (const file of [...new Set(files)]) {
  if (!file || !fs.existsSync(file)) {
    console.log(`skip missing: ${file}`);
    continue;
  }

  let source = fs.readFileSync(file, 'utf8');
  const original = source;

  for (const [from, to] of replacements) {
    if (source.includes(to)) {
      continue;
    }
    if (!source.includes(from)) {
      throw new Error(`Expected marker not found in ${file}: ${from}`);
    }
    source = source.replace(from, to);
  }

  if (source !== original) {
    fs.writeFileSync(file, source, 'utf8');
    changedCount += 1;
    console.log(`patched: ${file}`);
  } else {
    console.log(`already patched: ${file}`);
  }
  touchedCount += 1;
}

if (touchedCount === 0) {
  throw new Error('No frontend asset files were found to patch.');
}

console.log(`field warning patch complete, changed ${changedCount}/${touchedCount} files.`);
