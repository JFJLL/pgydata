const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assetRoots = [
  path.join(root, "assets", "1.1.1", "assets"),
  path.join(root, "patched-output", "assets", "1.1.1", "assets"),
  path.join(process.env.APPDATA || "", "pygdata-desktop", "assets", "1.1.1", "assets"),
  path.join(process.env.APPDATA || "", "@zs", "desktop", "assets", "1.1.1", "assets"),
].filter(Boolean);

function patchFile(file, replacements) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to, label] of replacements) {
    if (text.includes(to)) continue;
    if (!text.includes(from)) {
      throw new Error(`Missing marker for ${label} in ${file}`);
    }
    text = text.replace(from, to);
    changed = true;
    console.log("patched", label, file);
  }
  if (changed) fs.writeFileSync(file, text, "utf8");
}

function patchOneOf(file, fromCandidates, to, label) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  if (text.includes(to)) return;
  for (const from of fromCandidates) {
    if (text.includes(from)) {
      text = text.replace(from, to);
      fs.writeFileSync(file, text, "utf8");
      console.log("patched", label, file);
      return;
    }
  }
  throw new Error(`Missing marker for ${label} in ${file}`);
}

const estimateFromOriginal =
  'const Q={pgy:{blogger:2.3,notebook:1.5},starmap:{blogger:23},douyin:{blogger:6}};function tt(e){';
const estimateFromConservative =
  'const Q={pgy:{blogger:2.3,notebook:1.5},starmap:{blogger:23},douyin:{blogger:6}},rt=new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart"]);function it(e,o,s){const d=Array.isArray(s)?s:[];if(e==="pgy"&&o==="blogger"){const r=d.filter(n=>rt.has(n)).length,l=d.length===0;return 8+r*7+(l?25:0)}return((Q[e]??{})[o])??2}function tt(e){';
const estimateTo =
  'const Q={pgy:{blogger:2.3,notebook:1.5},starmap:{blogger:23},douyin:{blogger:6}},rt=new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart"]);function it(e,o,s){const d=Array.isArray(s)?s:[],r=d.length===0?rt.size:d.filter(n=>rt.has(n)).length,l=d.length===0||d.includes("fansGrowthTrendChart");if(e==="pgy"&&o==="blogger")return 2.3+(r>0?.4:0)+(l?.1:0);return((Q[e]??{})[o])??2}function tt(e){';
const signatureFrom =
  'function lt({open:e,onClose:o,onConfirm:s,fileName:d,totalRows:r,validCount:n,invalidUrls:l=[],pluginId:h,taskType:g,extraFields:T}){var U;';
const signatureTo =
  'function lt({open:e,onClose:o,onConfirm:s,fileName:d,totalRows:r,validCount:n,invalidUrls:l=[],pluginId:h,taskType:g,extraFields:T,selectedFields:Ct}){var U;';
const rateFrom =
  'H=((U=Q[h])==null?void 0:U[g])??2,_=n*H,F=tt(_),D=l.length;';
const rateTo =
  'H=it(h,g,Ct),_=n*H,F=tt(_),D=l.length;';

const selectedFieldsFrom =
  'invalidUrls:v.invalidUrls,pluginId:d,taskType:a,extraFields:I?e.jsx(un,{value:x,onChange:f}):null})';
const selectedFieldsTo =
  'invalidUrls:v.invalidUrls,pluginId:d,taskType:a,selectedFields:v.selectedFields,extraFields:I?e.jsx(un,{value:x,onChange:f}):null})';

for (const dir of assetRoots) {
  const validatorFile = path.join(dir, "url-validator-00wRYD83.js");
  patchOneOf(validatorFile, [estimateFromConservative, estimateFromOriginal], estimateTo, "dynamic estimate helper");
  patchFile(validatorFile, [
    [signatureFrom, signatureTo, "confirm dialog selectedFields prop"],
    [rateFrom, rateTo, "dynamic estimate rate"],
  ]);
  patchFile(path.join(dir, "PgyTaskPanel-B4ZGEmDG.js"), [
    [selectedFieldsFrom, selectedFieldsTo, "pass selected fields to confirm dialog"],
  ]);
}
