const fs = require("fs");

const p = "D:/download/pic-vec/pgydata/assets/1.1.1/assets/PgyTaskPanel-B4ZGEmDG.js";
let s = fs.readFileSync(p, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`missing ${label}`);
  s = s.replace(oldText, newText);
  console.log("patched", label);
}

replaceOnce(
  '[$,H]=o.useState(null),n=o.useMemo',
  '[$,H]=o.useState(null),[manualText,setManualText]=o.useState(""),[manualError,setManualError]=o.useState(""),n=o.useMemo',
  "manual state"
);

replaceOnce(
  'if(F.length>0&&!await C(F.length)){E(F.length),R(!0);return}',
  "",
  "balance gate"
);

replaceOnce(
  'X=o.useCallback(async()=>{n&&await S.triggerExport({pluginId:d,taskType:a,fileName:n.fileName,results:n.results})},[n,a,S]),be=()=>',
  'X=o.useCallback(async()=>{n&&await S.triggerExport({pluginId:d,taskType:a,fileName:n.fileName,results:n.results})},[n,a,S]),manualStart=()=>{if(t||n){i==null||i();return}const s=manualText.split("\\n").map(u=>u.replaceAll("\\r","").trim()).filter(Boolean);if(s.length===0){setManualError("请先输入至少一条链接或 24 位 UID");return}const c=Ze(s,a),u=c.validUrls;u.length===0&&c.invalidUrls.length===0?setManualError("未识别到可采集链接"):(setManualError(""),W({file:{name:"手动输入.xlsx"},urls:u,totalRows:s.length,invalidUrls:c.invalidUrls,selectedFields:null}),u.length>0&&qe(d,a)?(H(qe(d,a)),G(!0)):O(!0))},be=()=>',
  "manual start"
);

replaceOnce(
  'children:"选择文件"})]})}),v&&e.jsx(en,{',
  'children:"选择文件"})]})}),e.jsxs(A,{sx:{mt:2,p:2,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"background.paper"},children:[e.jsx(p,{variant:"subtitle2",fontWeight:600,sx:{mb:1},children:"手动输入链接"}),e.jsx("textarea",{value:manualText,onChange:s=>{setManualText(s.target.value),manualError&&setManualError("")},disabled:t||!!n,placeholder:"每行一个小红书/蒲公英主页链接，或 24 位 UID",style:{width:"100%",minHeight:120,resize:"vertical",boxSizing:"border-box",border:"1px solid rgba(145,158,171,0.32)",borderRadius:8,padding:"10px 12px",fontFamily:"inherit",fontSize:14,lineHeight:1.6,outline:"none",background:t||n?"#F4F6F8":"#FFFFFF",color:"inherit"}}),manualError&&e.jsx(B,{severity:"warning",sx:{mt:1},children:manualError}),e.jsx(y,{variant:"contained",size:"small",disabled:t||!!n,onClick:manualStart,startIcon:e.jsx(g,{icon:"solar:play-bold",width:18}),sx:{mt:1.5,borderRadius:2,textTransform:"none",fontWeight:600},children:"开始采集"})]}),v&&e.jsx(en,{',
  "manual input UI"
);

const dialogStart = s.indexOf(',e.jsxs(Le,{open:z,onClose:V,children:[e.jsx(Te,{children:"薯苗余额不足"})');
const dialogEnd = s.indexOf("]})}function un", dialogStart);
if (dialogStart >= 0 && dialogEnd >= 0) {
  s = s.slice(0, dialogStart) + s.slice(dialogEnd);
  console.log("removed balance dialog");
}

s = s.replace('ge=()=>{R(!1),r("/shumiao/recharge")}', 'ge=()=>{R(!1)}');

fs.writeFileSync(p, s);
