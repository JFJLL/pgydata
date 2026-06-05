const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const assetVersion = "1.1.2";
const assetsRoot = path.join(projectRoot, "assets", assetVersion);
const assetsDir = path.join(assetsRoot, "assets");
const legacyChineseName = ["易美", "数据抓取"].join("");
const legacyExeName = ["PYG", "data"].join("");
const legacyVersion = ["1.0", "4"].join(".");
const legacyPublisher = ["易美传播", "Emagic"].join(" ");
const serverBaseUrl = "https://magiorix.red-magic.cn";
const previousServerBaseUrl = ["https://xhs", "red-magic.cn"].join(".");

function replaceOnce(filePath, from, to, label) {
  let source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(from)) {
    if (source.includes(to)) return false;
    throw new Error(`Missing frontend patch target: ${label}`);
  }
  source = source.replace(from, to);
  fs.writeFileSync(filePath, source);
  return true;
}

function replaceAllIfExists(filePath, from, to) {
  let source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(from)) return false;
  source = source.split(from).join(to);
  fs.writeFileSync(filePath, source);
  return true;
}

function replaceAnyOnce(filePath, fromList, to, label) {
  let source = fs.readFileSync(filePath, "utf8");
  for (const from of fromList) {
    if (source.includes(from)) {
      source = source.replace(from, to);
      fs.writeFileSync(filePath, source);
      return true;
    }
  }
  if (source.includes(to)) return false;
  throw new Error(`Missing frontend patch target: ${label}`);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
    return true;
  }
  return false;
}

const mainBundle = path.join(assetsDir, "index-B09sHfUO.js");
const exportTemplateBundle = path.join(assetsDir, "index-CiEqCfGB.js");
const exportFieldSelectorBundle = path.join(assetsDir, "index-IS4kgrUy.js");
const pgyTaskPanelBundle = path.join(assetsDir, "PgyTaskPanel-B4ZGEmDG.js");
const starmapTaskPanelBundle = path.join(assetsDir, "index-Ct9D5phI.js");
const douyinTaskPanelBundle = path.join(assetsDir, "index-D1aMO0QN.js");
const urlValidatorBundle = path.join(assetsDir, "url-validator-00wRYD83.js");
const contactLinkBundle = path.join(assetsDir, "ContactLink-WXibGCB4.js");
const feishuQrSource = "D:\\download\\feishu_down\\飞书20260521-115131.png";
const feishuQrAssetName = "feishu-group-qr.png";
if (fs.existsSync(feishuQrSource)) {
  fs.copyFileSync(feishuQrSource, path.join(assetsDir, feishuQrAssetName));
}
const directPlatform = `xhs-${"direct"}`;
const directRoute = `../pages/database/xhs/${"xhs"}-blogger/index.tsx`;
const directChunk = `index-${"BxFWMnhZ"}.js`;
const directTemplate = `xhs_${"direct"}_blogger_template-CGkXo9G3.xlsx`;
const directTabLabel = `小红书${"直采"}`;

replaceOnce(
  mainBundle,
  `,"${directRoute}":()=>G(()=>import("./${directChunk}"),__vite__mapDeps([30,1,23,24,20,8]),import.meta.url)`,
  "",
  "remove xhs homepage route",
);

replaceOnce(
  mainBundle,
  `ct=["starmap","pgy","douyin","${directPlatform}"];`,
  'ct=["starmap","pgy-blogger","pgy-notebook","pgy","douyin"];',
  "remove direct export-template platform whitelist",
);

replaceOnce(
  mainBundle,
  'ct=["starmap","pgy","douyin"];',
  'ct=["starmap","pgy-blogger","pgy-notebook","pgy","douyin"];',
  "split pgy export-template platform whitelist",
);

replaceOnce(
  mainBundle,
  `"./${directChunk}"`,
  '"./index-BHKF2Can.js"',
  "remove xhs homepage chunk preload name",
);

replaceOnce(
  mainBundle,
  `"${directTemplate}"`,
  '"xhs_blogger_template-DEZvZD02.xlsx"',
  "remove direct template asset reference",
);

replaceOnce(
  mainBundle,
  `d5="${directPlatform}"`,
  'd5="removed-xhs-homepage"',
  "remove direct plugin id constant",
);

replaceOnce(
  mainBundle,
  `a5={platform:"${directPlatform}"`,
  'a5={platform:"removed-xhs-homepage"',
  "remove direct export schema id",
);

replaceOnce(
  mainBundle,
  `platform:"${directPlatform}",schema:a5`,
  'platform:"removed-xhs-homepage",schema:a5',
  "remove direct export schema resolver id",
);

replaceOnce(
  mainBundle,
  'function n5(e,t){return e===Js?{platform:"starmap",schema:Zs,headers:Qs}:e===Vt&&t==="blogger"?{platform:"pgy",schema:t5,headers:hr}:e===Vt&&t==="notebook"?{platform:"pgy",schema:r5,headers:fr}:e===Us?{platform:"douyin",schema:Ks,headers:Gs}:e===d5?{platform:"removed-xhs-homepage",schema:a5,headers:o5}:null}',
  'function n5(e,t){return e===Js?{platform:"starmap",schema:Zs,headers:Qs}:e===Vt&&t==="blogger"?{platform:"pgy-blogger",schema:t5,headers:hr}:e===Vt&&t==="notebook"?{platform:"pgy-notebook",schema:r5,headers:fr}:e===Us?{platform:"douyin",schema:Ks,headers:Gs}:e===d5?{platform:"removed-xhs-homepage",schema:a5,headers:o5}:null}',
  "split pgy collection template platform by task type",
);

replaceOnce(
  mainBundle,
  'a5 as a0,$i as a1',
  'r5 as a0,$i as a1',
  "export pgy notebook schema to template manager",
);

replaceOnce(
  mainBundle,
  'downloadName:"小红书主页链接模版.xlsx"',
  'downloadName:"已移除链接模版.xlsx"',
  "remove xhs homepage template label",
);

replaceOnce(
  mainBundle,
  'catch(R){const q=R instanceof Error?R.message:"获取二维码失败";C(q),i("error")}',
  'catch(R){console.warn("[WechatLogin] qrcode endpoint unavailable:",R),c(""),f(""),g(0),y(0),C(""),i("empty")}',
  "wechat login qrcode empty placeholder",
);

replaceOnce(
  exportTemplateBundle,
  `const W=[{platform:"starmap",label:"星图",schema:re},{platform:"pgy",label:"蒲公英",schema:ie},{platform:"douyin",label:"抖音",schema:le},{platform:"${directPlatform}",label:"${directTabLabel}",schema:oe}];`,
  'const W=[{platform:"starmap",label:"星图",schema:re},{platform:"pgy-blogger",label:"蒲公英博主",schema:ie},{platform:"pgy-notebook",label:"蒲公英笔记",schema:oe},{platform:"douyin",label:"抖音",schema:le}];',
  "remove direct export-template tab",
);

replaceOnce(
  exportTemplateBundle,
  'const W=[{platform:"starmap",label:"星图",schema:re},{platform:"pgy",label:"蒲公英",schema:ie},{platform:"douyin",label:"抖音",schema:le}];',
  'const W=[{platform:"starmap",label:"星图",schema:re},{platform:"pgy-blogger",label:"蒲公英博主",schema:ie},{platform:"pgy-notebook",label:"蒲公英笔记",schema:oe},{platform:"douyin",label:"抖音",schema:le}];',
  "split pgy export-template tabs",
);

replaceOnce(
  exportFieldSelectorBundle,
  ',q=20,he=({templates:t,selectedId:r,onSelect:n,onSaveAs:a,loading:u})=>{',
  ',q=20,he=({templates:t,selectedId:r,onSelect:n,onSaveAs:a,onRename:be,onDelete:ke,loading:u})=>{',
  "template dropdown action props",
);

replaceOnce(
  exportFieldSelectorBundle,
  't.map(f=>e.jsx(L,{value:f.id,children:e.jsxs(v,{sx:{display:"flex",alignItems:"center",gap:.5},children:[f.isDefault&&e.jsx(W,{fontSize:"inherit",sx:{color:"warning.main"},"aria-label":"默认模板"}),e.jsx("span",{children:f.name})]})},f.id))',
  't.map(f=>e.jsx(L,{value:f.id,children:e.jsxs(v,{sx:{display:"flex",alignItems:"center",gap:.75,width:"100%"},children:[f.isDefault&&e.jsx(W,{fontSize:"inherit",sx:{color:"warning.main"},"aria-label":"默认模板"}),e.jsx("span",{style:{flex:1},children:f.name}),e.jsx(T,{size:"small",variant:"text",onMouseDown:m=>m.stopPropagation(),onClick:m=>{m.stopPropagation(),be&&be(f)},sx:{minWidth:28,px:.5},children:"编辑"}),e.jsx(T,{size:"small",color:"error",variant:"text",onMouseDown:m=>m.stopPropagation(),onClick:m=>{m.stopPropagation(),ke&&ke(f)},sx:{minWidth:28,px:.5},children:"删除"})]})},f.id))',
  "template dropdown edit delete buttons",
);

replaceOnce(
  exportFieldSelectorBundle,
  ',e.jsx(_,{title:"到“系统管理 / 导出模板”页面管理模板（重命名、设默认、删除）",children:e.jsx(C,{variant:"caption",color:"text.secondary",sx:{ml:"auto",fontStyle:"italic"},children:"管理模板"})})',
  "",
  "remove template external management hint",
);

replaceOnce(
  exportFieldSelectorBundle,
  'm=E(d=>d.createTemplate),o=je(a,r),',
  'm=E(d=>d.createTemplate),be=E(d=>d.updateTemplate),ke=E(d=>d.deleteTemplate),o=je(a,r),',
  "template store update delete selectors",
);

replaceOnce(
  exportFieldSelectorBundle,
  'catch(j){const y=P(j,"保存模板失败");w(y),i({severity:"error",text:y})}},[m,o,n,s,s==="configure"?t.onSaved:void 0]),A=s==="configure"&&!!t.initialTemplate',
  'catch(j){const y=P(j,"保存模板失败");w(y),i({severity:"error",text:y})}},[m,o,n,s,s==="configure"?t.onSaved:void 0]),ne=c.useCallback(async d=>{const j=window.prompt("修改模板名称",d.name);if(j===null)return;const y=j.trim();if(!y)return;try{const Pe=await be(d.id,{name:y});p(Pe.id),i({severity:"success",text:`模板「${Pe.name}」已更新`})}catch(Pe){i({severity:"error",text:P(Pe,"修改模板失败")})}},[be]),Ae=c.useCallback(async d=>{if(!window.confirm(`确认删除模板「${d.name}」？`))return;try{await ke(d.id),g===d.id&&(p(null),o.reset()),i({severity:"success",text:`模板「${d.name}」已删除`})}catch(j){i({severity:"error",text:P(j,"删除模板失败")})}},[ke,g,o]),A=s==="configure"&&!!t.initialTemplate',
  "template rename delete callbacks",
);

replaceOnce(
  exportFieldSelectorBundle,
  'e.jsx(he,{templates:h,selectedId:g,onSelect:V,onSaveAs:X,loading:S})',
  'e.jsx(he,{templates:h,selectedId:g,onSelect:V,onSaveAs:X,onRename:ne,onDelete:Ae,loading:S})',
  "template dropdown callback props",
);

removeIfExists(path.join(assetsDir, directChunk));
removeIfExists(path.join(assetsDir, directTemplate));

replaceOnce(
  mainBundle,
  'primaryColor:"#8E33FF"',
  'primaryColor:"#FF3030"',
  "default theme color",
);

replaceOnce(
  mainBundle,
  'width:56,py:1,borderRadius:1.5,cursor:"pointer",mb:.5,WebkitAppRegion:"no-drag"',
  'width:56,height:56,p:0,borderRadius:1.5,cursor:"pointer",mb:.5,WebkitAppRegion:"no-drag"',
  "square primary sidebar menu item",
);

replaceOnce(
  mainBundle,
  'o.jsx(B,{icon:l,width:22,height:22})',
  'o.jsx(B,{icon:l,width:26,height:26})',
  "primary sidebar menu icon size",
);

replaceOnce(
  mainBundle,
  '"wechat-group-qr-D1beIcAI.png"',
  `"${feishuQrAssetName}"`,
  "feishu group qr asset",
);

for (const filePath of [mainBundle, contactLinkBundle, ...fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js")).map((name) => path.join(assetsDir, name))]) {
  if (!fs.existsSync(filePath)) continue;
  replaceAllIfExists(filePath, "微信交流群", "飞书交流群");
  replaceAllIfExists(filePath, "微信群二维码", "飞书群二维码");
  replaceAllIfExists(filePath, "微信扫码加入交流群", "扫码加入飞书交流群");
}

replaceAllIfExists(
  mainBundle,
  'background:t||n?"#F4F6F8":"#FFFFFF",color:"inherit"',
  'background:t||n?"var(--mui-palette-action-disabledBackground)":"var(--mui-palette-background-paper)",color:"var(--mui-palette-text-primary)"',
);
replaceAllIfExists(
  pgyTaskPanelBundle,
  'background:t||n?"#F4F6F8":"#FFFFFF",color:"inherit"',
  'background:t||n?"var(--mui-palette-action-disabledBackground)":"var(--mui-palette-background-paper)",color:"var(--mui-palette-text-primary)"',
);

replaceAllIfExists(
  pgyTaskPanelBundle,
  'o.useEffect(()=>{D.auth.onStatusChanged(r=>{r.pluginId===d&&(t(d,r.status),r.status==="authorized"&&i(d))})},[t,i])',
  'o.useEffect(()=>D.auth.onStatusChanged(r=>{r.pluginId===d&&(t(d,r.status),r.status==="authorized"&&i(d))}),[t,i])',
);
replaceAllIfExists(
  starmapTaskPanelBundle,
  'a.useEffect(()=>{P.auth.onStatusChanged(r=>{r.pluginId===d&&(n(d,r.status),r.status==="authorized"&&i(d))})},[n,i])',
  'a.useEffect(()=>P.auth.onStatusChanged(r=>{r.pluginId===d&&(n(d,r.status),r.status==="authorized"&&i(d))}),[n,i])',
);
replaceAllIfExists(
  douyinTaskPanelBundle,
  'i.useEffect(()=>{C.auth.onStatusChanged(o=>{o.pluginId===l&&(t(l,o.status),o.status==="authorized"&&c(l))})},[t,c])',
  'i.useEffect(()=>C.auth.onStatusChanged(o=>{o.pluginId===l&&(t(l,o.status),o.status==="authorized"&&c(l))}),[t,c])',
);

replaceOnce(
  pgyTaskPanelBundle,
  '[manualText,setManualText]=o.useState(""),[manualError,setManualError]=o.useState(""),n=o.useMemo',
  '[manualText,setManualText]=o.useState(""),[manualError,setManualError]=o.useState(""),manualHint=a==="notebook"?"支持蒲公英笔记详情页 / 小红书笔记长链 / xhslink 分享短链 / 笔记 ID（24-hex）；App 分享文案会自动提取链接":"支持蒲公英博主详情页 / 小红书主页长链 / xhslink 分享短链 / 博主 ID（24-hex）；App 分享文案会自动提取链接",manualPlaceholder=a==="notebook"?"请粘贴蒲公英 / 小红书笔记链接或笔记 ID（24 位十六进制），一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/cooperator/note-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/explore/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp\\n64662332000000002702b866":"请粘贴蒲公英 / 小红书博主主页链接或博主 ID（24 位十六进制），一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/user/profile/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp\\n6374c3bb000000001f015237",n=o.useMemo',
  "pgy manual input placeholder copy",
);

replaceOnce(
  pgyTaskPanelBundle,
  'manualHint=a==="notebook"?"支持蒲公英笔记详情页 / 小红书笔记长链 / xhslink 分享短链；App 分享文案会自动提取链接":"支持蒲公英博主详情页 / 小红书主页长链 / xhslink 分享短链 / 博主 ID（24-hex）；App 分享文案会自动提取链接",manualPlaceholder=a==="notebook"?"请粘贴蒲公英 / 小红书笔记链接，一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/cooperator/note-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/explore/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp":"请粘贴蒲公英 / 小红书博主主页链接或博主 ID（24 位十六进制），一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/user/profile/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp\\n6374c3bb000000001f015237"',
  'manualHint=a==="notebook"?"支持蒲公英笔记详情页 / 小红书笔记长链 / xhslink 分享短链 / 笔记 ID（24-hex）；App 分享文案会自动提取链接":"支持蒲公英博主详情页 / 小红书主页长链 / xhslink 分享短链 / 博主 ID（24-hex）；App 分享文案会自动提取链接",manualPlaceholder=a==="notebook"?"请粘贴蒲公英 / 小红书笔记链接或笔记 ID（24 位十六进制），一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/cooperator/note-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/explore/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp\\n64662332000000002702b866":"请粘贴蒲公英 / 小红书博主主页链接或博主 ID（24 位十六进制），一行一个\\n例：\\nhttps://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/6374c3bb000000001f015237\\nhttps://www.xiaohongshu.com/user/profile/6374c3bb000000001f015237\\nhttps://xhslink.com/m/7jzcIMcuMSp\\n6374c3bb000000001f015237"',
  "pgy notebook manual input note id copy",
);

if (!fs.readFileSync(pgyTaskPanelBundle, "utf8").includes("释放以导入 xlsx")) {
  replaceOnce(
    pgyTaskPanelBundle,
    'children:"手动输入链接"}),e.jsx("textarea",{value:manualText',
    'children:"手动输入链接"}),e.jsx(p,{variant:"body2",color:"text.secondary",sx:{mb:1},children:manualHint}),e.jsx("textarea",{value:manualText',
    "pgy manual input support hint",
  );
}

replaceOnce(
  pgyTaskPanelBundle,
  'placeholder:"每行一个小红书/蒲公英主页链接，或 24 位 UID"',
  'placeholder:manualPlaceholder',
  "pgy manual input dynamic placeholder",
);

replaceOnce(
  pgyTaskPanelBundle,
  'Q=o.useCallback(async s=>{const c=new FileReader;c.onload=async u=>{var se;if(!((se=u.target)!=null&&se.result))return;const M=new Uint8Array(u.target.result),_=Qe(M,{type:"array"}),Se=_.Sheets[_.SheetNames[0]],Z=Ve.sheet_to_json(Se,{header:1}),Ie=Z.length,ee=Z.slice(1).map(w=>Array.isArray(w)?w[0]:w).filter(w=>typeof w=="string"&&w.trim().length>0).map(w=>w.trim());if(ee.length===0)return;const ne=Ze(ee,a),F=ne.validUrls;const ze={file:s,urls:F,totalRows:Ie,invalidUrls:ne.invalidUrls,selectedFields:null},te=F.length>0?qe(d,a):null;W(ze),te?(H(te),G(!0)):O(!0)},c.readAsArrayBuffer(s)},[C,a])',
  'Q=o.useCallback(async s=>{const c=new FileReader;c.onerror=()=>setManualError("xlsx 读取失败");c.onload=async u=>{var se;if(!((se=u.target)!=null&&se.result))return;try{const M=new Uint8Array(u.target.result),_=Qe(M,{type:"array"}),Se=_.Sheets[_.SheetNames[0]],Z=Ve.sheet_to_json(Se,{header:1}),ee=Z.slice(1).map(w=>Array.isArray(w)?w[0]:w).filter(w=>typeof w=="string"&&w.trim().length>0).map(w=>w.trim());if(ee.length===0){setManualError("xlsx 未读取到可导入内容");return}setManualText(w=>{const M=w.replace(/\\s+$/,""),_=ee.join("\\n");return M?`${M}\\n${_}`:_}),setManualError("")}catch(M){setManualError("xlsx 解析失败")}},c.readAsArrayBuffer(s)},[])',
  "pgy xlsx import fills manual input",
);

replaceOnce(
  pgyTaskPanelBundle,
  'sx:{border:"2px dashed",borderColor:t?"grey.300":K?"primary.dark":"divider"',
  'sx:{display:"none",border:"2px dashed",borderColor:t?"grey.300":K?"primary.dark":"divider"',
  "pgy hide separate xlsx upload area",
);

replaceOnce(
  pgyTaskPanelBundle,
  'e.jsxs(A,{sx:{mt:2,p:2,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"background.paper"},children:[e.jsx(p,{variant:"subtitle2",fontWeight:600,sx:{mb:1},children:"手动输入链接"}),e.jsx(p,{variant:"body2",color:"text.secondary",sx:{mb:1},children:manualHint}),e.jsx("textarea",{value:manualText,onChange:s=>{setManualText(s.target.value),manualError&&setManualError("")},disabled:t||!!n,placeholder:manualPlaceholder,style:{width:"100%",minHeight:120,resize:"vertical",boxSizing:"border-box",border:"1px solid rgba(145,158,171,0.32)",borderRadius:8,padding:"10px 12px",fontFamily:"inherit",fontSize:14,lineHeight:1.6,outline:"none",background:t||n?"var(--mui-palette-action-disabledBackground)":"var(--mui-palette-background-paper)",color:"var(--mui-palette-text-primary)"}}),manualError&&e.jsx(B,{severity:"warning",sx:{mt:1},children:manualError}),e.jsx(y,{variant:"contained",size:"small",disabled:t||!!n,onClick:manualStart,startIcon:e.jsx(g,{icon:"solar:play-bold",width:18}),sx:{mt:1.5,borderRadius:2,textTransform:"none",fontWeight:600},children:"开始采集"})]})',
  'e.jsxs(A,{onDrop:ke,onDragOver:we,onDragLeave:ye,sx:{mt:2,p:3,border:"2px solid",borderColor:K?"#8E33FF":"divider",borderRadius:3,bgcolor:K?"action.hover":"background.paper",position:"relative",transition:"all .2s ease",boxShadow:K?"0 0 0 2px rgba(142,51,255,.16)":"none"},children:[e.jsxs(j,{direction:"row",alignItems:"center",justifyContent:"space-between",spacing:1,sx:{mb:1.5},children:[e.jsx(p,{variant:"body2",color:"text.secondary",children:manualHint}),K&&e.jsx(J,{size:"small",color:"primary",label:"释放以导入 xlsx",sx:{fontWeight:700}})]}),e.jsxs(A,{sx:{position:"relative"},children:[e.jsx("textarea",{value:manualText,onChange:s=>{setManualText(s.target.value),manualError&&setManualError("")},disabled:t||!!n,placeholder:manualPlaceholder,style:{width:"100%",minHeight:300,resize:"vertical",boxSizing:"border-box",border:"2px solid #8E33FF",borderRadius:10,padding:"18px 20px",fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",fontSize:15,lineHeight:1.65,outline:"none",background:t||n?"var(--mui-palette-action-disabledBackground)":"linear-gradient(135deg, rgba(142,51,255,.06), rgba(51,102,255,.04))",color:"var(--mui-palette-text-primary)"}}),e.jsxs(p,{variant:"caption",sx:{position:"absolute",right:12,bottom:10,color:"text.secondary",bgcolor:"background.paper",px:.5,pointerEvents:"none"},children:[manualText.split("\\n").map(s=>s.trim()).filter(Boolean).length," / 1000"]})]}),manualError&&e.jsx(B,{severity:"warning",sx:{mt:1},children:manualError}),e.jsxs(j,{direction:"row",alignItems:"center",spacing:1.5,sx:{mt:1.5},children:[e.jsx(y,{variant:"outlined",size:"small",disabled:t||!!n,onClick:be,startIcon:e.jsx(g,{icon:"solar:file-bold-duotone",width:18}),sx:{borderRadius:2,textTransform:"none",fontWeight:700},children:"从 xlsx 导入"}),e.jsx(p,{variant:"caption",color:"text.secondary",children:"也可把 xlsx 文件直接拖到输入框中"}),e.jsx(A,{sx:{flexGrow:1}}),e.jsx(y,{variant:"contained",size:"medium",disabled:t||!!n||manualText.trim().length===0,onClick:manualStart,startIcon:e.jsx(g,{icon:"solar:play-bold",width:18}),sx:{borderRadius:2,textTransform:"none",fontWeight:700,px:3,boxShadow:"0 10px 24px rgba(142,51,255,.28)",background:"linear-gradient(135deg,#8E33FF,#3366FF)"},children:"开始采集"})]})]})',
  "pgy single input xlsx import layout",
);

replaceOnce(
  starmapTaskPanelBundle,
  '[manualText,setManualText]=a.useState(""),[manualError,setManualError]=a.useState(""),t=a.useMemo',
  '[manualText,setManualText]=a.useState(""),[manualError,setManualError]=a.useState(""),manualHint="支持抖音主页长链 / 星图达人主页 / v.douyin 短链 / 抖音 sec_uid；也可点「从 xlsx 导入」批量带入",manualPlaceholder="请粘贴抖音达人主页链接、星图达人主页链接、抖音 sec_uid 或 v.douyin 短链接，一行一个\\n例：\\nhttps://www.douyin.com/user/MS4wLjABAAAAv7iSuu...hqgLP4\\nhttps://www.xingtu.cn/ad/creator/author-homepage/MS4wLjABAAA...hqgLP4/1234567890123456789\\nhttps://v.douyin.com/iABCDEFG/\\nMS4wLjABAAAAv7iSuu...hqgLP4",t=a.useMemo',
  "starmap manual input placeholder copy",
);

replaceAllIfExists(
  starmapTaskPanelBundle,
  'children:"手动输入链接"}),e.jsx("textarea",{value:manualText',
  'children:"手动输入链接"}),e.jsx(g,{variant:"body2",color:"text.secondary",sx:{mb:1},children:manualHint}),e.jsx("textarea",{value:manualText',
);

replaceOnce(
  starmapTaskPanelBundle,
  'placeholder:"每行一个星图/抖音主页链接"',
  'placeholder:manualPlaceholder',
  "starmap manual input dynamic placeholder",
);

replaceOnce(
  starmapTaskPanelBundle,
  'V=a.useCallback(async s=>{const c=new FileReader;c.onload=async u=>{var se;if(!((se=u.target)!=null&&se.result))return;const N=new Uint8Array(u.target.result),B=Ye(N,{type:"array"}),Se=B.Sheets[B.SheetNames[0]],Z=Xe.sheet_to_json(Se,{header:1}),Ie=Z.length,ee=Z.slice(1).map(k=>Array.isArray(k)?k[0]:k).filter(k=>typeof k=="string"&&k.trim().length>0).map(k=>k.trim());if(ee.length===0)return;const te=et(ee),F=te.validUrls;if(F.length>0&&!await C(F.length)){T(F.length),D(!0);return}const Ae={file:s,urls:F,totalRows:Ie,invalidUrls:te.invalidUrls,selectedFields:null},ne=F.length>0?He(d,o):null;E(Ae),ne?($(ne),G(!0)):O(!0)},c.readAsArrayBuffer(s)},[C,o])',
  'V=a.useCallback(async s=>{const c=new FileReader;c.onerror=()=>setManualError("xlsx 读取失败");c.onload=async u=>{var se;if(!((se=u.target)!=null&&se.result))return;try{const N=new Uint8Array(u.target.result),B=Ye(N,{type:"array"}),Se=B.Sheets[B.SheetNames[0]],Z=Xe.sheet_to_json(Se,{header:1}),ee=Z.slice(1).map(k=>Array.isArray(k)?k[0]:k).filter(k=>typeof k=="string"&&k.trim().length>0).map(k=>k.trim());if(ee.length===0){setManualError("xlsx 未读取到可导入内容");return}setManualText(k=>{const N=k.replace(/\\s+$/,""),B=ee.join("\\n");return N?`${N}\\n${B}`:B}),setManualError("")}catch(N){setManualError("xlsx 解析失败")}},c.readAsArrayBuffer(s)},[])',
  "starmap xlsx import fills manual input",
);

replaceOnce(
  starmapTaskPanelBundle,
  'sx:{border:"2px dashed",borderColor:n?"grey.300":q?"primary.dark":"divider"',
  'sx:{display:"none",border:"2px dashed",borderColor:n?"grey.300":q?"primary.dark":"divider"',
  "starmap hide separate xlsx upload area",
);

replaceOnce(
  starmapTaskPanelBundle,
  'e.jsxs(z,{sx:{mt:2,p:2,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"background.paper"},children:[e.jsx(g,{variant:"subtitle2",fontWeight:600,sx:{mb:1},children:"手动输入链接"}),e.jsx(g,{variant:"body2",color:"text.secondary",sx:{mb:1},children:manualHint}),e.jsx("textarea",{value:manualText,onChange:s=>{setManualText(s.target.value),manualError&&setManualError("")},disabled:n||!!t,placeholder:manualPlaceholder,style:{width:"100%",minHeight:120,resize:"vertical",boxSizing:"border-box",border:"1px solid rgba(145,158,171,0.32)",borderRadius:8,padding:"10px 12px",fontFamily:"inherit",fontSize:14,lineHeight:1.6,outline:"none",background:n||t?"var(--mui-palette-action-disabledBackground)":"var(--mui-palette-background-paper)",color:"var(--mui-palette-text-primary)"}}),manualError&&e.jsx(_,{severity:"warning",sx:{mt:1},children:manualError}),e.jsx(w,{variant:"contained",size:"small",disabled:n||!!t,onClick:manualStart,startIcon:e.jsx(p,{icon:"solar:play-bold",width:18}),sx:{mt:1.5,borderRadius:2,textTransform:"none",fontWeight:600},children:"开始采集"})]})',
  'e.jsxs(z,{onDrop:ye,onDragOver:ke,onDragLeave:we,sx:{mt:2,p:3,border:"2px solid",borderColor:q?"#8E33FF":"divider",borderRadius:3,bgcolor:q?"action.hover":"background.paper",position:"relative",transition:"all .2s ease",boxShadow:q?"0 0 0 2px rgba(142,51,255,.16)":"none"},children:[e.jsxs(j,{direction:"row",alignItems:"center",justifyContent:"space-between",spacing:1,sx:{mb:1.5},children:[e.jsx(g,{variant:"body2",color:"text.secondary",children:manualHint}),q&&e.jsx(J,{size:"small",color:"primary",label:"释放以导入 xlsx",sx:{fontWeight:700}})]}),e.jsxs(z,{sx:{position:"relative"},children:[e.jsx("textarea",{value:manualText,onChange:s=>{setManualText(s.target.value),manualError&&setManualError("")},disabled:n||!!t,placeholder:manualPlaceholder,style:{width:"100%",minHeight:300,resize:"vertical",boxSizing:"border-box",border:"2px solid #8E33FF",borderRadius:10,padding:"18px 20px",fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",fontSize:15,lineHeight:1.65,outline:"none",background:n||t?"var(--mui-palette-action-disabledBackground)":"linear-gradient(135deg, rgba(142,51,255,.06), rgba(51,102,255,.04))",color:"var(--mui-palette-text-primary)"}}),e.jsxs(g,{variant:"caption",sx:{position:"absolute",right:12,bottom:10,color:"text.secondary",bgcolor:"background.paper",px:.5,pointerEvents:"none"},children:[manualText.split("\\n").map(s=>s.trim()).filter(Boolean).length," / 1000"]})]}),manualError&&e.jsx(_,{severity:"warning",sx:{mt:1},children:manualError}),e.jsxs(j,{direction:"row",alignItems:"center",spacing:1.5,sx:{mt:1.5},children:[e.jsx(w,{variant:"outlined",size:"small",disabled:n||!!t,onClick:be,startIcon:e.jsx(p,{icon:"solar:file-bold-duotone",width:18}),sx:{borderRadius:2,textTransform:"none",fontWeight:700},children:"从 xlsx 导入"}),e.jsx(g,{variant:"caption",color:"text.secondary",children:"也可把 xlsx 文件直接拖到输入框中"}),e.jsx(z,{sx:{flexGrow:1}}),e.jsx(w,{variant:"contained",size:"medium",disabled:n||!!t||manualText.trim().length===0,onClick:manualStart,startIcon:e.jsx(p,{icon:"solar:play-bold",width:18}),sx:{borderRadius:2,textTransform:"none",fontWeight:700,px:3,boxShadow:"0 10px 24px rgba(142,51,255,.28)",background:"linear-gradient(135deg,#8E33FF,#3366FF)"},children:"开始采集"})]})]})',
  "starmap single input xlsx import layout",
);

replaceAllIfExists(
  pgyTaskPanelBundle,
  'const{isEnterprise:l}=Je(),{isAuthorized:r,isChecking:h}=rn()',
  'const l=!1,{isAuthorized:r,isChecking:h}=rn()',
);

replaceAllIfExists(
  starmapTaskPanelBundle,
  'const{isEnterprise:l}=Je(),{isAuthorized:r,isChecking:h}=ot()',
  'const l=!1,{isAuthorized:r,isChecking:h}=ot()',
);

for (const taskPanelBundle of [pgyTaskPanelBundle, starmapTaskPanelBundle]) {
  replaceAllIfExists(taskPanelBundle, "企业账号池", "账号池");
  replaceAllIfExists(taskPanelBundle, "企业达人库 → 授权账号", "本机授权");
  replaceAllIfExists(taskPanelBundle, "isEnterprise", "isInternalModeDisabled");
  replaceAllIfExists(taskPanelBundle, 'I=l==="enterprise"', "I=!1");
  replaceAllIfExists(taskPanelBundle, 'l?"enterprise":"personal"', '"personal"');
  replaceAllIfExists(taskPanelBundle, 'm==="enterprise"', "!1");
  replaceAllIfExists(taskPanelBundle, 'l&&m==="enterprise"', "!1");
  replaceAllIfExists(taskPanelBundle, 'value:"enterprise"', 'value:"disabled"');
}

replaceOnce(
  urlValidatorBundle,
  'shortLink:/v\\.douyin\\.com/i,starmapBlogger:/xingtu\\.cn\\/ad\\/creator\\/author-homepage\\/[^/?#]+\\/\\d{8,30}/i};',
  'shortLink:/v\\.douyin\\.com/i,starmapBlogger:/xingtu\\.cn\\/ad\\/creator\\/author-homepage\\/[^/?#]+\\/\\d{8,30}/i,secUid:/^MS4wLjAB[A-Za-z0-9_-]{8,}$/i};',
  "douyin sec_uid validator pattern",
);

replaceOnce(
  urlValidatorBundle,
  'notebook:/xiaohongshu\\.com\\/(explore|discovery\\/item)\\/[a-f0-9]{24}/i',
  'notebook:/(xiaohongshu\\.com\\/(explore|discovery\\/item)\\/[a-f0-9]{24}|pgy\\.xiaohongshu\\.com\\/solar\\/cooperator\\/note-detail\\/[a-f0-9]{24}|^[a-f0-9]{24}$)/i',
  "xhs notebook note id validator",
);

replaceOnce(
  urlValidatorBundle,
  'function nt(e){return I.blogger.test(e)||I.shortLink.test(e)||I.starmapBlogger.test(e)}',
  'function nt(e){return I.blogger.test(e)||I.shortLink.test(e)||I.starmapBlogger.test(e)||I.secUid.test(e)}',
  "douyin sec_uid validator",
);

replaceOnce(
  pgyTaskPanelBundle,
  'm=le(s=>s.addTask),k=le(s=>s.tasks),{balance:b,checkBalance:C}=$e(),',
  'm=le(s=>s.addTask),k=le(s=>s.tasks),removeTask=le(s=>s.remove),{balance:b,checkBalance:C}=$e(),',
  "task panel remove task selector",
);

replaceOnce(
  pgyTaskPanelBundle,
  'e.jsx(J,{icon:u?e.jsx(g,{icon:"solar:check-circle-bold",width:16}):c?e.jsx(g,{icon:"solar:pause-bold",width:16}):e.jsx(g,{icon:"svg-spinners:pulse-3",width:16}),label:u?"已完成":c?"已暂停":"采集中",color:u?"success":c?"warning":"primary",size:"small",sx:{position:"absolute",top:12,right:12,fontWeight:600}})',
  'e.jsxs(j,{direction:"row",spacing:.75,alignItems:"center",sx:{position:"absolute",top:12,right:12},children:[e.jsx(J,{icon:u?e.jsx(g,{icon:"solar:check-circle-bold",width:16}):c?e.jsx(g,{icon:"solar:pause-bold",width:16}):e.jsx(g,{icon:"svg-spinners:pulse-3",width:16}),label:u?"已完成":c?"已暂停":"采集中",color:u?"success":c?"warning":"primary",size:"small",sx:{fontWeight:600}}),u&&e.jsx(y,{variant:"text",color:"inherit",size:"small",onClick:()=>removeTask(n.id),sx:{minWidth:28,width:28,height:28,p:0,borderRadius:"50%",color:"text.secondary"},children:e.jsx(g,{icon:"solar:close-circle-bold",width:18})})]})',
  "task panel completed close button",
);

replaceOnce(
  mainBundle,
  'const J5=[{key:"basic",label:"本地信息"},{key:"security",label:"本地设置"},{key:"bindings",label:"第三方账号"},{key:"account",label:"账号信息"}];',
  'const J5=[{key:"basic",label:"本地信息"},{key:"security",label:"本地设置"},{key:"account",label:"账户信息"}];',
  "hide third-party account tab",
);

replaceOnce(
  mainBundle,
  '[a,n]=m.useState("basic")',
  '[a,n]=m.useState(()=>{try{const S=localStorage.getItem("pgyProfileInitialTab");return localStorage.removeItem("pgyProfileInitialTab"),J5.some(E=>E.key===S)?S:"basic"}catch{return"basic"}})',
  "profile initial tab",
);

replaceOnce(
  mainBundle,
  ',a==="bindings"&&o.jsx(G5,{onToast:j}),a==="account"&&o.jsx(Z5,{onToast:j})',
  ',a==="account"&&o.jsx(Z5,{onToast:j})',
  "hide third-party account content",
);

replaceOnce(
  mainBundle,
  'b=()=>{u(),t("/profile")};',
  'b=(g="basic")=>{try{localStorage.setItem("pgyProfileInitialTab",g)}catch{}u(),t("/profile")};',
  "avatar menu profile tab router",
);

replaceOnce(
  mainBundle,
  'o.jsxs(O1,{onClick:b,children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:user-circle-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"本地信息"})]})',
  'o.jsxs(O1,{onClick:()=>b("basic"),children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:user-circle-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"本地信息"})]})',
  "avatar menu local info tab",
);

replaceOnce(
  mainBundle,
  'o.jsxs(O1,{onClick:b,children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:shield-keyhole-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"本地设置"})]})',
  'o.jsxs(O1,{onClick:()=>b("security"),children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:shield-keyhole-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"本地设置"})]})',
  "avatar menu local settings tab",
);

replaceOnce(
  mainBundle,
  'o.jsxs(O1,{onClick:b,children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:user-id-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"账号信息"})]})',
  'o.jsxs(O1,{onClick:()=>b("basic"),children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:user-id-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"账户信息"})]})',
  "avatar menu account info tab",
);

replaceOnce(
  mainBundle,
  'o.jsxs(O1,{onClick:f,children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:logout-2-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"本地模式"})]})',
  'o.jsxs(O1,{onClick:f,sx:{color:"error.main",fontWeight:700},children:[o.jsx(u1,{children:o.jsx(B,{icon:"solar:logout-2-bold-duotone",width:20,height:20})}),o.jsx(Ye,{children:"退出登录"})]})',
  "avatar menu logout label",
);

replaceAllIfExists(mainBundle, '"1.0.0"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, '"1.1.0"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, previousServerBaseUrl, serverBaseUrl);

replaceOnce(
  mainBundle,
  "function Rs(){const e=Ge(y=>y.togglePanel)",
  "function Rs(){return null;const e=Ge(y=>y.togglePanel)",
  "disable legacy task ball",
);

replaceAnyOnce(
  mainBundle,
  [
    'const{autoNotify:a,_isManualCheck:n}=t(),l=r.forceUpdate||!n&&a;e({checkStatus:"available",updateInfo:r,error:"",dialogOpen:l,_isManualCheck:!1})',
    'const{autoNotify:a,_isManualCheck:n}=t(),l=r.forceUpdate||n||!n&&a;e({checkStatus:"available",updateInfo:r,error:"",dialogOpen:l,_isManualCheck:!1})',
  ],
  'const{autoNotify:a,_isManualCheck:n}=t(),l=n||!n&&a;e({checkStatus:"available",updateInfo:{...r,forceUpdate:!1},error:"",dialogOpen:l,_isManualCheck:!1})',
  "desktop update treats forced updates as dismissible",
);

replaceOnce(
  mainBundle,
  'closeDialog:()=>{const{updateInfo:r}=t();r!=null&&r.forceUpdate||e({dialogOpen:!1})}',
  'closeDialog:()=>e({dialogOpen:!1})',
  "desktop update dialog can always close",
);

replaceOnce(
  mainBundle,
  'disableEscapeKeyDown:t==null?void 0:t.forceUpdate',
  'disableEscapeKeyDown:!1',
  "desktop update dialog escape can close",
);

replaceOnce(
  mainBundle,
  '(t==null?void 0:t.forceUpdate)&&o.jsx(oe,{severity:"warning",sx:{mb:2},children:"这是一个强制更新，您必须更新才能继续使用应用"})',
  '!1&&o.jsx(oe,{severity:"warning",sx:{mb:2},children:"这是一个强制更新，您必须更新才能继续使用应用"})',
  "hide forced update warning",
);

replaceOnce(
  mainBundle,
  '!(t!=null&&t.forceUpdate)&&!c&&!d&&o.jsx($,{onClick:b,children:"稍后提醒"})',
  '!c&&!d&&o.jsx($,{onClick:b,children:"稍后提醒"})',
  "always show later reminder for desktop update",
);

replaceOnce(
  mainBundle,
  'function js(){const[e,t]=m.useState(null),{checkStatus:r,downloadStatus:a,updateInfo:n,progress:l,error:s,autoNotify:i,setAutoNotify:d,startDownload:c,installUpdate:u,openDialog:f}=it();m.useEffect(()=>{var h;(h=window.bridge)==null||h.assets.getLocalVersion().then(g=>t(g))},[]);',
  'function js(){const[e,t]=m.useState(null),[h,g]=m.useState(""),[y,S]=m.useState(!1),{checkStatus:r,downloadStatus:a,updateInfo:n,progress:l,error:s,autoNotify:i,setAutoNotify:d,startDownload:c,installUpdate:u,openDialog:f,checkForUpdates:b}=it();m.useEffect(()=>{var P;(P=window.bridge)==null||P.assets.getLocalVersion().then(A=>t(A))},[]);m.useEffect(()=>{y&&r==="not-available"&&(g("已是最新"),S(!1));y&&r==="available"&&S(!1);y&&r==="error"&&(g("检查更新失败"),S(!1))},[r,y]);',
  "about page manual update toast state",
);

replaceOnce(
  mainBundle,
  'const b=()=>{a==="downloaded"?u():c()},C=()=>a==="downloading"?`下载中 ${(l==null?void 0:l.percent)??0}%`:"安装并重启";',
  'const P=()=>{S(!0),b()},A=()=>g(""),C=()=>{a==="downloaded"?u():c()},V=()=>a==="downloading"?`下载中 ${(l==null?void 0:l.percent)??0}%`:"安装并重启";',
  "about page manual update handlers",
);

replaceOnce(
  mainBundle,
  'children:C()}),o.jsx($,{variant:"outlined",size:"small",onClick:f,children:"查看更新日志"})',
  'children:V()}),o.jsx($,{variant:"outlined",size:"small",onClick:f,children:"查看更新日志"})',
  "about page update action label rename",
);

replaceOnce(
  mainBundle,
  'variant:"contained",size:"small",onClick:b,disabled:a==="downloading",startIcon:a==="downloading"?o.jsx(de,{size:16,color:"inherit"}):o.jsx(B,{icon:"solar:restart-bold",width:18,height:18}),children:V()',
  'variant:"contained",size:"small",onClick:C,disabled:a==="downloading",startIcon:a==="downloading"?o.jsx(de,{size:16,color:"inherit"}):o.jsx(B,{icon:"solar:restart-bold",width:18,height:18}),children:V()',
  "about page available update button starts download",
);

replaceOnce(
  mainBundle,
  'o.jsx(x,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between",mb:.5},children:o.jsx(Or,{control:o.jsx(zr,{checked:i,onChange:h=>d(h.target.checked),size:"small"}),label:o.jsx(w,{variant:"body2",children:"新版本发布时提醒我"})})})',
  'o.jsxs(x,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,mb:.5},children:[o.jsx(Or,{control:o.jsx(zr,{checked:i,onChange:H=>d(H.target.checked),size:"small"}),label:o.jsx(w,{variant:"body2",children:"新版本发布时提醒我"})}),o.jsx($,{variant:"outlined",size:"small",onClick:P,disabled:r==="checking",startIcon:r==="checking"?o.jsx(de,{size:16,color:"inherit"}):o.jsx(B,{icon:"solar:refresh-bold",width:16,height:16}),sx:{flexShrink:0,textTransform:"none"},children:r==="checking"?"检查中...":"检查更新"})]})',
  "about page manual check update button",
);

replaceOnce(
  mainBundle,
  'o.jsxs(w,{variant:"body2",color:"text.secondary",children:["Copyright © ",new Date().getFullYear()," magiorix. All rights reserved."]})]})]})}function Ms(){',
  'o.jsxs(w,{variant:"body2",color:"text.secondary",children:["Copyright © ",new Date().getFullYear()," magiorix. All rights reserved."]})]}),o.jsx(_1,{open:!!h,autoHideDuration:3e3,onClose:A,message:h})]})}function Ms(){',
  "about page latest-version snackbar",
);

replaceOnce(
  mainBundle,
  'const[r,a]=m.useState("appearance"),n=se(),{checkForUpdates:l,checkStatus:s}=it();return m.useEffect(()=>{e&&l()},[e,l]),o.jsxs(ue',
  'const[r,a]=m.useState("appearance"),n=se(),{checkStatus:s}=it();return o.jsxs(ue',
  "settings dialog no longer auto-checks updates",
);

for (const entry of fs.readdirSync(assetsDir)) {
  if (!/\.(js|css|html|svg)$/i.test(entry)) continue;
  const filePath = path.join(assetsDir, entry);
  replaceAllIfExists(filePath, legacyChineseName, "magiorix");
  replaceAllIfExists(filePath, "关于 magiorix", "关于 magiorix");
  replaceAllIfExists(filePath, legacyPublisher, "magiorix");
  replaceAllIfExists(filePath, legacyExeName, "magiorix");
  replaceAllIfExists(filePath, legacyVersion, assetVersion);
}

replaceAllIfExists(path.join(assetsRoot, "index.html"), legacyChineseName, "magiorix");

const assistantSource = path.join(__dirname, "magiorix-ops-assistant.js");
const assistantFileName = "magiorix-ops-assistant.js";
const assistantTarget = path.join(assetsRoot, assistantFileName);
fs.copyFileSync(assistantSource, assistantTarget);

const indexPath = path.join(assetsRoot, "index.html");
let indexHtml = fs.readFileSync(indexPath, "utf8");
if (!indexHtml.includes(assistantFileName)) {
  indexHtml = indexHtml.replace(
    "</body>",
    `    <script src="./${assistantFileName}"></script>\n  </body>`,
  );
  fs.writeFileSync(indexPath, indexHtml);
}

fs.writeFileSync(
  path.join(assetsRoot, "version.json"),
  `${JSON.stringify({ version: assetVersion }, null, 2)}\n`,
);

console.log("Applied magiorix frontend patches.");
