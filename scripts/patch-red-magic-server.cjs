const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = "https://xhs.red-magic.cn";

const mainPath = path.join(root, "app-source", "dist-electron", "index.js");
const cleanMainPath = path.join(root, "app-source-clean", "dist-electron", "index.js");
const rendererPath = path.join(root, "assets", "1.1.1", "assets", "index-B09sHfUO.js");
const originalRendererPath = path.join(
  root,
  "analysis",
  "zs-desktop-1.0.4",
  "original-assets",
  "assets",
  "index-B09sHfUO.js"
);
const htmlPath = path.join(root, "assets", "1.1.1", "index.html");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, text) {
  fs.writeFileSync(file, text);
}

function between(text, start, end, label) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`missing start for ${label}`);
  }
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex < 0) {
    throw new Error(`missing end for ${label}`);
  }
  return text.slice(startIndex, endIndex);
}

function replaceBetween(text, start, end, replacement, label) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`missing current start for ${label}`);
  }
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex < 0) {
    throw new Error(`missing current end for ${label}`);
  }
  console.log(`patched ${label}`);
  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

function replaceAll(text, from, to, label) {
  const next = text.split(from).join(to);
  if (next !== text) {
    console.log(`patched ${label}`);
  }
  return next;
}

function patchMain() {
  let main = read(mainPath);
  const clean = read(cleanMainPath);

  main = replaceAll(main, 'const lo = "http://127.0.0.1:9";', `const lo = "${server}";`, "main local base URL");
  main = replaceAll(main, 'const lo = "https://api.zishutonggao.com";', `const lo = "${server}";`, "main old base URL");

  const updateCheck = between(clean, "async function cr() {", "async function Ad(", "desktop update check")
    .split("https://api.zishutonggao.com")
    .join(server);
  main = replaceBetween(main, "async function cr() {", "async function Ad(", updateCheck, "desktop update check");

  const assetsStartup = between(clean, "async function mh() {", "function fh()", "frontend assets startup")
    .split("https://api.zishutonggao.com")
    .join(server);
  main = replaceBetween(main, "async function mh() {", "function fh()", assetsStartup, "frontend assets startup");

  main = replaceAll(main, "https://api.zishutonggao.com", server, "main remaining old server");
  main = replaceAll(main, "http://127.0.0.1:9", server, "main remaining local server");
  write(mainPath, main);
}

function patchRenderer() {
  let renderer = read(rendererPath);
  const original = read(originalRendererPath);

  renderer = renderer.replace(
    /\],LOCAL_MENUS=\[.*?\],LOCAL_USER=\{.*?\},X2=/,
    "],X2="
  );

  const originalStores = between(
    original,
    "Se=Ce()(o1(e=>({",
    "));Ce()(o1(e=>({menuList",
    "auth stores"
  );
  renderer = replaceBetween(
    renderer,
    "Se=Ce()(o1(e=>({",
    "));Ce()(o1(e=>({menuList",
    originalStores,
    "auth stores"
  );

  renderer = replaceAll(renderer, '{name:"pgydata-tabs-storage"}', '{name:"tabs-storage"}', "tabs storage name");

  const originalApiClient = between(original, "let xt=!1;function Ml()", "const W={get:", "axios API client")
    .split("https://api.zishutonggao.com")
    .join(server);
  renderer = replaceBetween(renderer, "let xt=!1;function Ml()", "const W={get:", originalApiClient, "axios API client");

  const originalBalanceStore = between(
    original,
    "Z2=Ce()(o1((e,t)=>({balance:0",
    ',ct=["starmap"',
    "balance store"
  );
  renderer = replaceBetween(
    renderer,
    "Z2=Ce()(o1((e,t)=>({balance:0",
    ',ct=["starmap"',
    originalBalanceStore,
    "balance store"
  );

  const originalBalanceWidget = between(original, "function As(){", "}function e0(){", "balance widget");
  renderer = replaceBetween(renderer, "function As(){", "}function e0(){", originalBalanceWidget, "balance widget");

  const originalAuthProvider = between(
    original,
    "const lr=m.createContext(void 0),ms=({children:e})=>{",
    "},ze=()=>{",
    "auth provider"
  );
  renderer = replaceBetween(
    renderer,
    "const lr=m.createContext(void 0),ms=({children:e})=>{",
    "},ze=()=>{",
    originalAuthProvider,
    "auth provider"
  );

  const originalRoutes = between(original, "const $1={signIn:", ";function ci(e){", "routes");
  renderer = replaceBetween(renderer, "const $1={signIn:", ";function ci(e){", originalRoutes, "routes");

  renderer = replaceAll(renderer, "https://api.zishutonggao.com", server, "renderer old server");
  renderer = replaceAll(renderer, "http://127.0.0.1:9", server, "renderer local server");
  renderer = replaceAll(renderer, "file.zishutonggao.com", "xhs.red-magic.cn", "renderer old file server");

  write(rendererPath, renderer);
}

function patchHtml() {
  let html = read(htmlPath);
  const next = html.replace(/\n\s*<script id="pgydata-local-reset">[\s\S]*?<\/script>/, "");
  if (next !== html) {
    console.log("patched local storage reset");
  }
  write(htmlPath, next);
}

patchMain();
patchRenderer();
patchHtml();
console.log("red-magic server patch complete");
