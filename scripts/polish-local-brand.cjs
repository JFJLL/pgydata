const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function replaceAllInFile(relativePath, replacements) {
  const file = path.join(root, relativePath);
  let text = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, text, "utf8");
    console.log(`patched ${relativePath}`);
  } else {
    console.log(`unchanged ${relativePath}`);
  }
}

const splashReplacements = [
  ["易美数据抓取 Desktop", "易美数据抓取 Desktop"],
  ['<div class="app-name">易美数据抓取</div>', '<div class="app-name">易美数据抓取</div>'],
];

replaceAllInFile("app-source/dist-electron/static/splash.html", splashReplacements);
replaceAllInFile("app-source/electron-main/static/splash.html", splashReplacements);

replaceAllInFile("assets/1.1.1/assets/ContactLink-WXibGCB4.js", [
  ["联系我们", "微信交流群"],
  ["微信扫码加入交流群，咨询企业版定制方案", "微信扫码加入交流群，获取最新动态和技术支持"],
]);

replaceAllInFile("assets/1.1.1/assets/index-kY9tCwGX.js", [
  [
    '"通过蒲公英平台自动采集博主主页数据，仅模拟人工浏览操作。请合理控制采集频率、遵守蒲公英平台规则，避免短时间大批量调用导致账号异常或被风控。如有较大批量采集需求，请",t.jsx(i,{children:"联系我们为您定制企业方案"}),"。"',
    '"本地采集博主主页数据，任务在当前电脑中运行。请合理控制采集频率，遵守目标平台规则，避免短时间大批量操作导致账号异常。"',
  ],
]);

replaceAllInFile("assets/1.1.1/assets/index-CNtqW3CV.js", [
  [
    '"通过蒲公英平台自动采集笔记详情数据，仅模拟人工浏览操作。请合理控制采集频率、遵守蒲公英平台规则，避免短时间大批量调用导致账号异常或被风控。如有较大批量采集需求，请",t.jsx(i,{children:"联系我们为您定制企业方案"}),"。"',
    '"本地采集笔记详情数据，任务在当前电脑中运行。请合理控制采集频率，遵守目标平台规则，避免短时间大批量操作导致账号异常。"',
  ],
]);

replaceAllInFile("assets/1.1.1/assets/PgyTaskPanel-B4ZGEmDG.js", [
  ["授权登录", "浏览器授权"],
  ["授权中...", "授权中..."],
  ["请先点击右上角「浏览器授权」按钮完成蒲公英平台授权", "请先点击右上角「浏览器授权」按钮完成本地浏览器授权"],
  ["企业账号池当前没有可用的蒲公英账号。请先到「企业达人库 → 授权账号」添加账号。", "当前没有可用的采集账号。请先完成本地浏览器授权。"],
  ["企业账号池", "账号池"],
  ["个人授权", "本机授权"],
]);

replaceAllInFile("assets/1.1.1/assets/index-B09sHfUO.js", [
  [
    'onClick:()=>{const n="https://www.zishutonggao.com/";fs()?Ee.system.shell.openExternal(n):window.open(n,"_blank")}',
    "onClick:()=>{}",
  ],
  ['const f=async()=>{u(),await a(),t("/sign-in")}', "const f=async()=>{u()}"],
  ['const b=()=>{u(),t("/profile")}', "const b=()=>{u()}"],
  ["退出登录", "本地模式"],
  ["基础信息", "本地信息"],
  ["安全设置", "本地设置"],
  ["账号管理", "账号信息"],
]);

const assetDir = path.join(root, "assets/1.1.1/assets");
const globalAssetReplacements = [
  ["易美数据抓取", "易美数据抓取"],
  ["武汉高真科技", "易美传播 Emagic"],
  ["易美数据抓取", "易美数据抓取"],
  ["登录已过期，请重新登录", "本地模式不可访问服务器接口"],
  ["联系我们为您定制企业方案", "微信交流群"],
  ["咨询企业版定制方案", "获取最新动态和技术支持"],
  ["薯苗余额不足", "本地模式无需余额"],
  ["请先充值薯苗后再进行采集任务。", "本地模式无需充值，请直接开始采集任务。"],
  ["去充值", "确定"],
  ["充值记录", "本地记录"],
  ["https://www.zishutonggao.com/", "about:blank"],
  ["https://docs.zishutonggao.com/import", "about:blank"],
  ["https://docs.zishutonggao.com", "about:blank"],
];

for (const entry of fs.readdirSync(assetDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) {
    continue;
  }
  replaceAllInFile(path.join("assets/1.1.1/assets", entry.name), globalAssetReplacements);
}
