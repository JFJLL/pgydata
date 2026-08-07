const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const packageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "app-source", "package.json"), "utf8"));
const assetVersion = String(packageConfig.assetsVersion || "").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(assetVersion)) {
  throw new Error(`Invalid assetsVersion in app-source/package.json: ${assetVersion || "(empty)"}`);
}
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

function replaceRange(filePath, startMarker, endMarker, replacement, label) {
  let source = fs.readFileSync(filePath, "utf8");
  const replacementPrefix = replacement.slice(0, replacement.indexOf("\n"));
  const start = replacementPrefix && source.includes(replacementPrefix)
    ? source.indexOf(replacementPrefix)
    : source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing frontend patch target: ${label}`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing frontend patch end target: ${label}`);
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  fs.writeFileSync(filePath, source);
  return true;
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
    return true;
  }
  return false;
}

const mainBundle = path.join(assetsDir, "index-B09sHfUO.js");
const pointsRechargeBundle = path.join(assetsDir, "index-C0Ke2Ul0.js");
const dateTimePickerBundle = path.join(assetsDir, "index-CB4FiGU9.js");
const exportTemplateBundle = path.join(assetsDir, "index-CiEqCfGB.js");
const exportFieldSelectorBundle = path.join(assetsDir, "index-IS4kgrUy.js");
const pgyTaskPanelBundle = path.join(assetsDir, "PgyTaskPanel-B4ZGEmDG.js");
const starmapTaskPanelBundle = path.join(assetsDir, "index-Ct9D5phI.js");
const douyinTaskPanelBundle = path.join(assetsDir, "index-D1aMO0QN.js");
const urlValidatorBundle = path.join(assetsDir, "url-validator-00wRYD83.js");
const contactLinkBundle = path.join(assetsDir, "ContactLink-WXibGCB4.js");
const loginMethodStorageKey = "magiorix.login.method";
const feishuQrSource = path.join(projectRoot, "assets", "1.1.13", "assets", "feishu-group-qr.png");
const feishuQrAssetName = "feishu-group-qr.png";

replaceAllIfExists(mainBundle, ["zs", "login", "method"].join("."), loginMethodStorageKey);
replaceAllIfExists(mainBundle, "/api/statistics/admin-dashboard", "/api/statistics/dashboard");
replaceOnce(
  dateTimePickerBundle,
  'const zs=he("MuiPickersToolbarText",["root"])',
  'const zsx=he("MuiPickersToolbarText",["root"])',
  "remove the generic zs. minified variable residue",
);
replaceAllIfExists(dateTimePickerBundle, ["zs", "root"].join("."), ["zsx", "root"].join("."));

replaceOnce(
  mainBundle,
  'Yl=e=>W.post("/api/auth/login",e),Jl=e=>W.post("/api/auth/sms/login",e),rr=async()=>{throw new Error("短信功能已停用")},',
  'Yl=e=>W.post("/api/auth/login",e),Jl=e=>W.post("/api/auth/sms/login",e),pgySendSms=e=>W.post("/api/auth/sms/send",e),pgyRegister=e=>W.post("/api/auth/register",e),pgyResetPassword=e=>W.post("/api/auth/password/reset",e),rr=async()=>{throw new Error("短信功能已停用")},',
  "auth registration and reset API clients",
);

const pgyAuthFlow = [
  'function pgyAuthNavigate(n,t,r){var a,l,s=(l=(a=t.state)==null?void 0:a.from)==null?void 0:l.pathname;if(s&&s!=="/sign-in"){n(s,{replace:!0});return}const e=Se.getState().menus;n((r?r(e):vr(e))||"/",{replace:!0})}',
  'function y5(){const e=Te(),t=r1(),{login:r}=ze(),[a,n]=m.useState(()=>localStorage.getItem("zs.login.phone")??""),[l,s]=m.useState(""),[i,d]=m.useState(""),[c,u]=m.useState(""),[f,b]=m.useState(!1),[C,h]=m.useState(0),[g,v]=m.useState(!1),[j,S]=m.useState(""),[A,E]=m.useState("");m.useEffect(()=>{if(C<=0)return;const R=window.setInterval(()=>h(q=>q<=1?0:q-1),1e3);return()=>window.clearInterval(R)},[C]);const D=m.useCallback(async()=>{if(f||C>0)return;const R=a.trim();if(!/^1[3-9]\\d{9}$/.test(R)){S("请输入正确的手机号格式");return}b(!0),S(""),E("");try{await pgySendSms({phone:R,purpose:"register"}),h(60),E("验证码已发送，请查收短信")}catch(q){S(q.message||"验证码发送失败，请稍后重试")}finally{b(!1)}},[a,f,C]),O=m.useCallback(async R=>{R.preventDefault();if(g)return;const q=a.trim(),T=i.trim();if(!/^1[3-9]\\d{9}$/.test(q)){S("请输入正确的手机号格式");return}if(!/^\\d{4}$/.test(T)){S("请输入 4 位验证码");return}if(c.length<8||c.length>64){S("密码长度必须在 8 到 64 个字符之间");return}v(!0),S("");try{await pgyRegister({phone:q,code:T,password:c}),await r({loginType:"password",phone:q,password:c}),localStorage.setItem("zs.login.phone",q),pgyAuthNavigate(e,t,vr)}catch(R){S(R.message||"注册失败，请稍后重试")}finally{v(!1)}},[a,i,c,g,r,e,t]);return o.jsxs(x,{component:"form",onSubmit:O,noValidate:!0,className:"sms-login",children:[o.jsx(_1,{open:!!j,autoHideDuration:3e3,onClose:()=>S(""),anchorOrigin:{vertical:"top",horizontal:"center"},children:o.jsx(oe,{severity:"error",children:j})}),o.jsxs(x,{className:"sms-login__fields",children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:R=>n(R.target.value),autoComplete:"tel",autoFocus:!0,disabled:g||f,placeholder:"请输入手机号",className:"sms-login__input",size:"small"}),o.jsxs(x,{sx:{display:"flex",gap:1},children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:i,onChange:R=>d(R.target.value),autoComplete:"one-time-code",disabled:g,placeholder:"4 位验证码",className:"sms-login__input",size:"small",slotProps:{htmlInput:{maxLength:4,inputMode:"numeric"}}}),o.jsx($,{type:"button",variant:"outlined",onClick:D,disabled:g||f||C>0,size:"small",children:f?"发送中...":C>0?C+"s":"获取验证码"})]}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:c,onChange:R=>u(R.target.value),autoComplete:"new-password",disabled:g,placeholder:"设置密码（8-64 位）",size:"small",className:"sms-login__input"}),o.jsx(w,{variant:"body2",color:"text.secondary",children:A||"验证码有效期 5 分钟，发送失败可稍后重试"})]}),o.jsx($,{fullWidth:!0,size:"large",type:"submit",variant:"contained",disabled:g,className:"sms-login__submit",startIcon:g?o.jsx(de,{size:20,color:"inherit"}):void 0,children:g?"注册中...":"注册"})]})}',
  'function b5({open:e,onClose:t}){const[a,n]=m.useState(""),[l,s]=m.useState(""),[i,d]=m.useState(""),[c,u]=m.useState(!1),[f,b]=m.useState(0),[C,h]=m.useState(!1),[g,v]=m.useState(""),[j,S]=m.useState("");m.useEffect(()=>{if(f<=0)return;const E=window.setInterval(()=>b(q=>q<=1?0:q-1),1e3);return()=>window.clearInterval(E)},[f]);const A=()=>{u(!1),b(0),v(""),S(""),t()},D=async()=>{if(c||f>0)return;const E=a.trim();if(!/^1[3-9]\\d{9}$/.test(E)){v("请输入正确的手机号格式");return}u(!0),v(""),S("");try{await pgySendSms({phone:E,purpose:"reset_password"}),b(60),S("验证码已发送，请查收短信")}catch(q){v(q.message||"验证码发送失败，请稍后重试")}finally{u(!1)}},O=async E=>{E.preventDefault();if(C)return;const q=a.trim(),T=l.trim();if(!/^1[3-9]\\d{9}$/.test(q)){v("请输入正确的手机号格式");return}if(!/^\\d{4}$/.test(T)){v("请输入 4 位验证码");return}if(i.length<8||i.length>64){v("新密码长度必须在 8 到 64 个字符之间");return}h(!0),v("");try{await pgyResetPassword({phone:q,code:T,newPassword:i}),S("密码已重置，请返回登录"),setTimeout(A,600)}catch(R){v(R.message||"密码重置失败，请稍后重试")}finally{h(!1)}};return o.jsxs(ue,{open:e,onClose:A,PaperProps:{sx:{width:380}},children:[o.jsxs(be,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:["找回密码",o.jsx(te,{onClick:A,size:"small",children:o.jsx(B,{icon:"solar:close-circle-bold",width:22})})]}),o.jsxs(x,{component:"form",onSubmit:O,sx:{px:3,pb:3,display:"flex",flexDirection:"column",gap:1.5},children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:E=>n(E.target.value),disabled:C||c,placeholder:"请输入手机号",autoComplete:"tel",size:"small"}),o.jsxs(x,{sx:{display:"flex",gap:1},children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:l,onChange:E=>s(E.target.value),disabled:C,placeholder:"4 位验证码",autoComplete:"one-time-code",size:"small",slotProps:{htmlInput:{maxLength:4,inputMode:"numeric"}}}),o.jsx($,{type:"button",variant:"outlined",onClick:D,disabled:C||c||f>0,size:"small",children:c?"发送中...":f>0?f+"s":"获取验证码"})]}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:i,onChange:E=>d(E.target.value),disabled:C,placeholder:"新密码（8-64 位）",autoComplete:"new-password",size:"small"}),g&&o.jsx(oe,{severity:"error",children:g}),j&&o.jsx(w,{variant:"body2",color:"success.main",children:j}),o.jsx($,{fullWidth:!0,type:"submit",variant:"contained",disabled:C,children:C?"提交中...":"重置密码"})]})]})}',
  'function wr(e){for(const t of e){if(t.children&&t.children.length>0){const r=wr(t.children);if(r)return r}if(t.path)return t.path}return""}',
  'function x5(){const e=Te(),t=r1(),{login:r}=ze(),[a,n]=m.useState(()=>localStorage.getItem("zs.login.phone")??""),[l,s]=m.useState(""),[i,d]=m.useState(!1),[c,u]=m.useState(!1),[f,b]=m.useState(""),[C,h]=m.useState(!1),g=m.useCallback(async y=>{y.preventDefault();if(c)return;b("");const v=a.trim();if(!/^1[3-9]\\d{9}$/.test(v)){b("请输入正确的手机号格式");return}if(!l){b("请输入密码");return}u(!0);try{await r({loginType:"password",phone:v,password:l}),localStorage.setItem("zs.login.phone",v),pgyAuthNavigate(e,t,wr)}catch(S){b(S.message||"登录失败，请检查登录信息")}finally{u(!1)}},[r,t,e,c,a,l]);return o.jsxs(x,{component:"form",onSubmit:g,noValidate:!0,className:"password-login",children:[o.jsx(_1,{open:!!f,autoHideDuration:3e3,onClose:()=>b(""),anchorOrigin:{vertical:"top",horizontal:"center"},children:o.jsx(oe,{severity:"error",children:f})}),o.jsxs(x,{className:"password-login__fields",children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:y=>n(y.target.value),autoComplete:"tel",autoFocus:!0,disabled:c,placeholder:"请输入手机号",className:"password-login__input",size:"small"}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:i?"text":"password",value:l,onChange:y=>s(y.target.value),autoComplete:"current-password",disabled:c,placeholder:"请输入密码",size:"small",slotProps:{input:{endAdornment:o.jsx(y1,{position:"end",children:o.jsx(te,{onClick:()=>d(y=>!y),edge:"end",disabled:c,size:"small",children:i?o.jsx(B,{icon:"solar:eye-closed-bold-duotone",width:18,height:18}):o.jsx(B,{icon:"solar:eye-bold-duotone",width:18,height:18})})})}}}),o.jsx(lo,{component:"button",type:"button",variant:"caption",color:"primary",onClick:()=>h(!0),sx:{alignSelf:"flex-end",mt:.2,position:"relative",top:"-10px"},children:"忘记密码？"})]}),o.jsx($,{fullWidth:!0,size:"large",type:"submit",variant:"contained",disabled:c,startIcon:c?o.jsx(de,{size:20,color:"inherit"}):void 0,children:c?"登录中...":"登录"}),o.jsx(b5,{open:C,onClose:()=>h(!1)})]})}',
].join("\n")
  .replaceAll('"zs.login.phone"', '"magiorix.login.phone"')
  .replace(
    'await pgyRegister({phone:q,code:T,password:c}),await r({loginType:"password",phone:q,password:c}),localStorage.setItem("magiorix.login.phone",q),pgyAuthNavigate(e,t,vr)',
    'const R=await pgyRegister({phone:q,code:T,password:c});if(!R?.token||!R?.userInfo)throw new Error("注册响应无效，请重试");Zt.getState().setToken(R.token),Se.getState().setUserInfo(R.userInfo);const M=await Ht();Se.getState().setPermissions(M?.permissions||[]),Se.getState().setMenus(M?.menus||[]),Ee.system.auth.setLoginState(!0),localStorage.setItem("magiorix.login.phone",q),pgyAuthNavigate(e,t,vr)',
  );

replaceRange(
  mainBundle,
  "function y5(){",
  "function kr(e){",
  pgyAuthFlow,
  "replace client registration and password recovery flow",
);
replaceAllIfExists(pgyTaskPanelBundle, "积分余额不足", "树苗余额不足");
replaceAllIfExists(mainBundle, "刷新积分余额失败", "刷新树苗余额失败");
if (!fs.existsSync(feishuQrSource)) {
  throw new Error(`Missing tracked Feishu QR source: ${feishuQrSource}`);
}
fs.copyFileSync(feishuQrSource, path.join(assetsDir, feishuQrAssetName));
const directPlatform = `xhs-${"direct"}`;
const directRoute = `../pages/database/xhs/${"xhs"}-blogger/index.tsx`;
const directChunk = `index-${"BxFWMnhZ"}.js`;
const directTemplate = `xhs_${"direct"}_blogger_template-CGkXo9G3.xlsx`;
const directTabLabel = `小红书${"直采"}`;

if (!fs.readFileSync(mainBundle, "utf8").includes('field:"dailyNotePerformanceChart"')) {
  replaceOnce(
    mainBundle,
    '{field:"fansGrowthTrendChart",headerName:"粉丝增长趋势图",width:320}],Bs=',
    '{field:"fansGrowthTrendChart",headerName:"粉丝增长趋势图",width:320},{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图",width:320}],Bs=',
    "append daily note chart after fan chart columns",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('key:"dailyNotePerformanceChart"')) {
  replaceOnce(
    mainBundle,
    '{group:"粉丝图表",label:"粉丝增长趋势图",key:"fansGrowthTrendChart"}],fr=',
    '{group:"粉丝图表",label:"粉丝增长趋势图",key:"fansGrowthTrendChart"},{group:"日常30天",label:"日常笔记表现图",key:"dailyNotePerformanceChart"}],fr=',
    "add daily note chart to blogger export fields",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('{key:"dailyNotePerformanceChart"')) {
  replaceOnce(
    mainBundle,
    '{key:"shareMedian",label:"中位分享量"}]},{groupKey:"daily-90"',
    '{key:"shareMedian",label:"中位分享量"},{key:"dailyNotePerformanceChart",label:"日常笔记表现图"}]},{groupKey:"daily-90"',
    "add optional daily note chart selector",
  );
}

if (!fs.readFileSync(urlValidatorBundle, "utf8").includes('"dailyNotePerformanceChart"')) {
  replaceOnce(
    urlValidatorBundle,
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart"])',
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart"])',
    "include daily note chart in duration estimate",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('field:"bloggerOverviewChart"')) {
  replaceOnce(
    mainBundle,
    '{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图",width:320}],Bs=',
    '{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图",width:320},{field:"bloggerOverviewChart",headerName:"博主数据概览图",width:320}],Bs=',
    "append blogger overview chart after daily note chart column",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('{group:"日常30天",label:"博主数据概览图",key:"bloggerOverviewChart"}')) {
  replaceOnce(
    mainBundle,
    '{group:"日常30天",label:"日常笔记表现图",key:"dailyNotePerformanceChart"}],fr=',
    '{group:"日常30天",label:"日常笔记表现图",key:"dailyNotePerformanceChart"},{group:"日常30天",label:"博主数据概览图",key:"bloggerOverviewChart"}],fr=',
    "append blogger overview chart after daily note export field",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('{key:"bloggerOverviewChart",label:"博主数据概览图"}')) {
  replaceOnce(
    mainBundle,
    '{key:"dailyNotePerformanceChart",label:"日常笔记表现图"}]},{groupKey:"daily-90"',
    '{key:"dailyNotePerformanceChart",label:"日常笔记表现图"},{key:"bloggerOverviewChart",label:"博主数据概览图"}]},{groupKey:"daily-90"',
    "append optional blogger overview chart selector",
  );
}

if (!fs.readFileSync(urlValidatorBundle, "utf8").includes('"bloggerOverviewChart"')) {
  replaceOnce(
    urlValidatorBundle,
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart"])',
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart","bloggerOverviewChart"])',
    "include blogger overview chart in duration estimate",
  );
}

replaceOnce(
    mainBundle,
    '{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图",width:320},{field:"bloggerOverviewChart",headerName:"博主数据概览图",width:320}',
    '{field:"dailyNotePerformanceChart",headerName:"日常笔记表现图（图文+视频）",width:320},{field:"dailyNotePicturePerformanceChart",headerName:"日常笔记表现图（图文）",width:320},{field:"dailyNoteVideoPerformanceChart",headerName:"日常笔记表现图（视频）",width:320},{field:"bloggerOverviewChart",headerName:"博主数据概览图",width:320}',
    "add typed daily note chart columns",
);
replaceOnce(
    mainBundle,
    '{group:"日常30天",label:"日常笔记表现图",key:"dailyNotePerformanceChart"},{group:"日常30天",label:"博主数据概览图",key:"bloggerOverviewChart"}',
    '{group:"日常30天",label:"日常笔记表现图（图文+视频）",key:"dailyNotePerformanceChart"},{group:"日常30天",label:"日常笔记表现图（图文）",key:"dailyNotePicturePerformanceChart"},{group:"日常30天",label:"日常笔记表现图（视频）",key:"dailyNoteVideoPerformanceChart"},{group:"日常30天",label:"博主数据概览图",key:"bloggerOverviewChart"}',
    "add typed daily note export fields",
);
replaceOnce(
    mainBundle,
    '{key:"dailyNotePerformanceChart",label:"日常笔记表现图"},{key:"bloggerOverviewChart",label:"博主数据概览图"}',
    '{key:"dailyNotePerformanceChart",label:"日常笔记表现图（图文+视频）"},{key:"dailyNotePicturePerformanceChart",label:"日常笔记表现图（图文）"},{key:"dailyNoteVideoPerformanceChart",label:"日常笔记表现图（视频）"},{key:"bloggerOverviewChart",label:"博主数据概览图"}',
    "add typed daily note field selectors",
);
replaceOnce(
    urlValidatorBundle,
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart","bloggerOverviewChart"])',
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart","dailyNotePicturePerformanceChart","dailyNoteVideoPerformanceChart","bloggerOverviewChart"])',
    "include typed daily note charts in duration estimate",
);

replaceOnce(
    mainBundle,
    'platform:"pgy",groups:[{groupKey:"basic",groupLabel:"本地信息",required:!0,description:"博主身份与核心账号信息，必选导出",fields:[{key:"nickname",label:"昵称"}',
    'platform:"pgy",groups:[{groupKey:"basic",groupLabel:"本地信息",description:"昵称必选，其余本地信息可按需导出",fields:[{key:"nickname",label:"昵称",required:!0}',
    "make only pgy blogger nickname required",
);
replaceOnce(
    exportFieldSelectorBundle,
    'children:g.label}),x=l?void 0:()=>u(g.key)',
    'children:g.required?g.label+"（必选）":g.label}),x=l?void 0:()=>u(g.key)',
    "label required fields",
);
replaceOnce(
    exportFieldSelectorBundle,
    'const p=n.has(g.key),l=s,i=e.jsx(C,',
    'const p=n.has(g.key),l=s||!!g.required,i=e.jsx(C,',
    "disable required fields",
);
replaceOnce(
    exportFieldSelectorBundle,
    'function ge(t){const r=new Set;for(const n of t.groups)if(n.required)for(const a of n.fields)r.add(a.key);return r}',
    'function ge(t){const r=new Set;for(const n of t.groups)for(const a of n.fields)(n.required||a.required)&&r.add(a.key);return r}',
    "collect field-level required keys",
);
replaceOnce(
    exportFieldSelectorBundle,
    '(n.required||a.defaultSelected)&&r.add(a.key)',
    '(n.required||a.required||a.defaultSelected)&&r.add(a.key)',
    "select required fields by default",
);

replaceOnce(
  mainBundle,
  `,"${directRoute}":()=>G(()=>import("./${directChunk}"),__vite__mapDeps([30,1,23,24,20,8]),import.meta.url)`,
  "",
  "remove xhs homepage route",
);

replaceAllIfExists(
  mainBundle,
  ',"../pages/shumiao/commission/index.tsx":()=>G(()=>import("./index-BbMk54ol.js"),__vite__mapDeps([34,1,11,35,8]),import.meta.url)',
  "",
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

replaceAnyOnce(
  pgyTaskPanelBundle,
  [
    'const Y=o.useCallback((s,c,u)=>{const M=Xe(),_={kind:"plugin",id:M,pluginId:d,taskType:a,status:"running",fileName:s.name,urls:c,results:[],errorCount:0,current:0,total:c.length,percent:0,createdAt:Date.now(),duration:0,fields:u,accountSource:l};m(_),D.task.start({taskId:M,pluginId:d,taskType:a,urls:c,fileName:s.name,fields:u,accountSource:l,pacePolicyId:I&&x||null})},[a,m,l,I,x])',
    'const Y=o.useCallback(async(s,c,u)=>{if(l!=="enterprise"){const M=Number.isFinite(Number(b))?Number(b):0,_=await C(c.length);if(!_){setManualError(`树苗余额不足：当前 ${M}，本次需要 ${c.length}，还差 ${Math.max(0,c.length-M)}。请先充值后再开始采集。`);return}}const M=Xe(),_={kind:"plugin",id:M,pluginId:d,taskType:a,status:"running",fileName:s.name,urls:c,results:[],errorCount:0,current:0,total:c.length,percent:0,createdAt:Date.now(),duration:0,fields:u,accountSource:l};m(_),D.task.start({taskId:M,pluginId:d,taskType:a,urls:c,fileName:s.name,fields:u,accountSource:l,pacePolicyId:I&&x||null})},[a,m,l,I,x,b,C])',
  ],
  'const Y=o.useCallback(async(s,c,u)=>{if(l!=="enterprise"){const _=await C(c.length),M=Number.isFinite(Number($e.getState().balance))?Number($e.getState().balance):0;if(!_){setManualError(`树苗余额不足：当前 ${M}，本次需要 ${c.length}，还差 ${Math.max(0,c.length-M)}。请先充值后再开始采集。`);return}}const M=Xe(),_={kind:"plugin",id:M,pluginId:d,taskType:a,status:"running",fileName:s.name,urls:c,results:[],errorCount:0,current:0,total:c.length,percent:0,createdAt:Date.now(),duration:0,fields:u,accountSource:l};m(_),D.task.start({taskId:M,pluginId:d,taskType:a,urls:c,fileName:s.name,fields:u,accountSource:l,pacePolicyId:I&&x||null})},[a,m,l,I,x,C])',
  "task panel blocks start when shumiao balance is insufficient",
);

replaceOnce(
  pgyTaskPanelBundle,
  'e.jsx(J,{icon:u?e.jsx(g,{icon:"solar:check-circle-bold",width:16}):c?e.jsx(g,{icon:"solar:pause-bold",width:16}):e.jsx(g,{icon:"svg-spinners:pulse-3",width:16}),label:u?"已完成":c?"已暂停":"采集中",color:u?"success":c?"warning":"primary",size:"small",sx:{position:"absolute",top:12,right:12,fontWeight:600}})',
  'e.jsxs(j,{direction:"row",spacing:.75,alignItems:"center",sx:{position:"absolute",top:12,right:12},children:[e.jsx(J,{icon:u?e.jsx(g,{icon:"solar:check-circle-bold",width:16}):c?e.jsx(g,{icon:"solar:pause-bold",width:16}):e.jsx(g,{icon:"svg-spinners:pulse-3",width:16}),label:u?"已完成":c?"已暂停":"采集中",color:u?"success":c?"warning":"primary",size:"small",sx:{fontWeight:600}}),u&&e.jsx(y,{variant:"text",color:"inherit",size:"small",onClick:()=>removeTask(n.id),sx:{minWidth:28,width:28,height:28,p:0,borderRadius:"50%",color:"text.secondary"},children:e.jsx(g,{icon:"solar:close-circle-bold",width:18})})]})',
  "task panel completed close button",
);

replaceOnce(
  pgyTaskPanelBundle,
  'X=o.useCallback(async()=>{n&&await S.triggerExport({pluginId:d,taskType:a,fileName:n.fileName,results:n.results})},[n,a,S])',
  'X=o.useCallback(async()=>{n&&await S.triggerExport({taskId:n.id,pluginId:d,taskType:a,fileName:n.fileName,results:n.results})},[n,a,S])',
  "pgy export passes task id",
);

replaceOnce(
  starmapTaskPanelBundle,
  'X=a.useCallback(async()=>{t&&await S.triggerExport({pluginId:d,taskType:t.taskType,fileName:t.fileName,results:t.results})},[t,S])',
  'X=a.useCallback(async()=>{t&&await S.triggerExport({taskId:t.id,pluginId:d,taskType:t.taskType,fileName:t.fileName,results:t.results})},[t,S])',
  "starmap export passes task id",
);

replaceOnce(
  douyinTaskPanelBundle,
  'H=i.useCallback(async()=>{n&&await I.triggerExport({pluginId:l,taskType:n.taskType,fileName:n.fileName,results:n.results})},[n,I])',
  'H=i.useCallback(async()=>{n&&await I.triggerExport({taskId:n.id,pluginId:l,taskType:n.taskType,fileName:n.fileName,results:n.results})},[n,I])',
  "douyin export passes task id",
);

replaceAllIfExists(pgyTaskPanelBundle, '!1&&!1&&N>0&&', '!1&&N>0&&');
replaceAllIfExists(starmapTaskPanelBundle, '!1&&!1&&M>0&&', '!1&&M>0&&');
replaceAllIfExists(douyinTaskPanelBundle, '!1&&!1&&F>0&&', '!1&&F>0&&');

replaceOnce(
  pgyTaskPanelBundle,
  'children:"继续"}),N>0&&e.jsx(y,{variant:"outlined",color:"success",size:"small",onClick:X,startIcon:e.jsx(g,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  'children:"继续"}),!1&&N>0&&e.jsx(y,{variant:"outlined",color:"success",size:"small",onClick:X,startIcon:e.jsx(g,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  "pgy paused task hides partial export",
);
replaceAllIfExists(pgyTaskPanelBundle, '!1&&!1&&N>0&&', '!1&&N>0&&');

replaceOnce(
  starmapTaskPanelBundle,
  'children:"继续"}),M>0&&e.jsx(w,{variant:"outlined",color:"success",size:"small",onClick:X,startIcon:e.jsx(p,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  'children:"继续"}),!1&&M>0&&e.jsx(w,{variant:"outlined",color:"success",size:"small",onClick:X,startIcon:e.jsx(p,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  "starmap paused task hides partial export",
);
replaceAllIfExists(starmapTaskPanelBundle, '!1&&!1&&M>0&&', '!1&&M>0&&');

replaceOnce(
  douyinTaskPanelBundle,
  'children:"继续"}),F>0&&e.jsx(b,{variant:"outlined",color:"success",size:"small",onClick:H,startIcon:e.jsx(f,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  'children:"继续"}),!1&&F>0&&e.jsx(b,{variant:"outlined",color:"success",size:"small",onClick:H,startIcon:e.jsx(f,{icon:"solar:download-bold",width:16}),sx:{borderRadius:2,textTransform:"none",fontWeight:600},children:"下载已采集"})',
  "douyin paused task hides partial export",
);
replaceAllIfExists(douyinTaskPanelBundle, '!1&&!1&&F>0&&', '!1&&F>0&&');

replaceOnce(
  mainBundle,
  'checkBalance:async r=>{if(Se.getState().organization)return!0;const{balance:a}=t();if(a>=r)return!0;try{const n=await _l(r);return e({balance:Number.isFinite(Number(n==null?void 0:n.balance))?Number(n.balance):0}),!!(n!=null&&n.sufficient)}catch(n){return console.error("检查余额失败:",n),!1}}',
  'checkBalance:async r=>{if(Se.getState().organization)return!0;try{const a=await _l(r);return e({balance:Number.isFinite(Number(a==null?void 0:a.balance))?Number(a.balance):0}),!!(a!=null&&a.sufficient)}catch(a){return console.error("检查余额失败:",a),!1}}',
  "shumiao balance check always verifies server before starting collection",
);

replaceOnce(
  mainBundle,
  'await we.export.toExcel({mode:"two-row",headers:n,data:t,fileName:r});return',
  'await we.export.toExcel({taskId:e.taskId,mode:"two-row",headers:n,data:t,fileName:r});return',
  "pgy default export passes task id",
);

replaceOnce(
  mainBundle,
  'await we.export.toExcel({mode:"single-row",data:a,fileName:r})',
  'await we.export.toExcel({taskId:e.taskId,mode:"single-row",data:a,fileName:r})',
  "single row export passes task id",
);

replaceOnce(
  mainBundle,
  'await we.export.toExcel({mode:"two-row",headers:n.slice(),data:r,fileName:mr(e)})',
  'await we.export.toExcel({taskId:e.taskId,mode:"two-row",headers:n.slice(),data:r,fileName:mr(e)})',
  "template export passes task id",
);

replaceOnce(
  mainBundle,
  'const b=we.task.onItemResult(A=>{a(A.taskId,{status:A.status,data:A.data,errorMessage:A.errorMessage})}),',
  'const b=we.task.onItemResult(A=>{a(A.taskId,{status:A.status,data:A.data,errorMessage:A.errorMessage}),A.status==="success"&&Number.isFinite(Number(A.balanceAfter))&&Z2.getState().setBalance(A.balanceAfter)}),',
  "item success updates shumiao balance display",
);

replaceOnce(
  mainBundle,
  'const l=n.results.filter(s=>s.status==="success").length;if(l>0){const s=n.pluginId==="pgy"?"pgy_scrape":"starmap_scrape";Tl({count:l,consumeType:s,refType:"scraper_task",refId:r,remark:`${n.fileName} 采集成功 ${l} 条`}).then(i=>{Z2.getState().setBalance((i==null?void 0:i.balanceAfter)??(i==null?void 0:i.balance))}).catch(i=>{console.error("薯苗扣费失败:",i)})}',
  'Z2.getState().fetchBalance().catch(s=>{console.error("刷新树苗余额失败:",s)})',
  "plugin task completion refreshes shumiao balance without duplicate charge",
);

replaceOnce(
  mainBundle,
  'g=we.task.onError(A=>{l(A.taskId,A.message)})',
  'g=we.task.onError(A=>{l(A.taskId,A.message),t({message:A.message||"采集任务启动失败",severity:A.errorCategory==="balance"?"warning":"error"})})',
  "plugin task error shows user-facing toast",
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
replaceAllIfExists(mainBundle, '"1.1.1"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, '"1.1.2"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, '"1.1.3"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, '"1.1.4"', `"${assetVersion}"`);
replaceAllIfExists(mainBundle, '"1.1.5"', `"${assetVersion}"`);
const bundledVersionMatch = fs.readFileSync(mainBundle, "utf8").match(/children:\["magiorix ","(\d+\.\d+\.\d+)"/);
if (bundledVersionMatch && bundledVersionMatch[1] !== assetVersion) {
  replaceAllIfExists(mainBundle, `"${bundledVersionMatch[1]}"`, `"${assetVersion}"`);
}
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
  replaceAllIfExists(filePath, "薯苗", "积分");
  replaceAllIfExists(filePath, "树苗", "积分");
  if (filePath !== pointsRechargeBundle) {
    replaceAllIfExists(filePath, "shell.openExternal", "shell.openSafeExternal");
  }
}

const pointsRechargeSource = String.raw`import{j as e,r}from"./mui-vendor-COdRvU8K.js";import{I as g,k as Y,M as Q,V as ne}from"./index-B09sHfUO.js";
async function queryOrder(orderNo){const raw=localStorage.getItem("auth-storage");let token="";try{const parsed=raw?JSON.parse(raw):null;token=parsed?.state?.token||""}catch{}const response=await fetch("https://magiorix.red-magic.cn/api/shumiao/order/"+encodeURIComponent(orderNo)+"/query",{method:"POST",headers:{"Content-Type":"application/json",...(token?{satoken:token}:{})}});const payload=await response.json().catch(()=>({}));if(!response.ok||payload.code!==200)throw new Error(payload.message||"订单查询失败");return payload.data}
function PackageCard({pkg,selected,onSelect}){const amount=Number(pkg.amountCents||0)/100;return e.jsxs("button",{type:"button",onClick:onSelect,style:{position:"relative",flex:"0 0 210px",minHeight:132,padding:"18px 16px",textAlign:"left",borderRadius:14,border:selected?"2px solid #3366ff":"1px solid #e2e8f0",background:selected?"#f3f6ff":"#fff",cursor:"pointer",boxShadow:selected?"0 8px 20px rgba(51,102,255,.15)":"0 2px 8px rgba(15,23,42,.06)"},children:[pkg.giftCount>0&&e.jsx("span",{style:{position:"absolute",top:-10,right:10,padding:"3px 8px",borderRadius:999,background:"#ff8a00",color:"#fff",fontSize:12,fontWeight:700},children:"赠"+pkg.giftCount}),e.jsxs("div",{style:{fontSize:24,fontWeight:800,color:"#3366ff"},children:[amount.toFixed(0),e.jsx("span",{style:{fontSize:13,fontWeight:500,marginLeft:4,color:"#64748b"},children:"元"})]}),e.jsxs("div",{style:{marginTop:10,fontSize:15,fontWeight:700,color:"#0f172a"},children:["基础 ",Number(pkg.baseCount||0).toLocaleString()," 积分"]}),e.jsxs("div",{style:{marginTop:5,fontSize:13,color:"#64748b"},children:["到账 ",Number(pkg.totalCount||0).toLocaleString()," 积分"]})]})}
function PointsRecharge(){const{balance,fetchBalance,packages,packagesLoading,fetchPackages}=Y();const[selected,setSelected]=r.useState(null);const[creating,setCreating]=r.useState(false);const[order,setOrder]=r.useState(null);const[error,setError]=r.useState("");const[notice,setNotice]=r.useState("");r.useEffect(()=>{fetchBalance();fetchPackages()},[fetchBalance,fetchPackages]);r.useEffect(()=>{if(packages.length&&!selected)setSelected(packages[0])},[packages,selected]);r.useEffect(()=>{if(!order?.orderNo)return;let stopped=false;let queryAt=0;const startedAt=Date.now();const tick=async()=>{try{let current=await Q(order.orderNo);if(current.status===0&&Date.now()-startedAt>=15000&&Date.now()-queryAt>=15000){queryAt=Date.now();current=await queryOrder(order.orderNo)}if(stopped)return;setOrder(current);if(current.status===1){setNotice("支付成功，积分已到账");fetchBalance()}else if(String(current.lastQueryStatus||"").startsWith("MANUAL_REVIEW:")){setNotice("订单已进入人工复核，请联系客服");stopped=true}else if(current.status===2){setNotice("订单已关闭，请重新创建充值订单")}}catch(error){if(!stopped)setError(error instanceof Error?error.message:"订单状态暂未确认，请稍后刷新")}};tick();const timer=setInterval(tick,3000);return()=>{stopped=true;clearInterval(timer)}},[order?.orderNo,fetchBalance]);const createOrder=async()=>{if(!selected||creating)return;setError("");setNotice("");setCreating(true);try{const created=await ne(selected.id);setOrder(created);setNotice("支付页面已打开，请在支付宝完成支付；客户端会自动确认结果");if(created?.payUrl)window.bridge?.system?.shell?.openExternal(created.payUrl);else throw new Error("支付地址缺失，请稍后重试")}catch(error){setError((error instanceof Error?error.message:"创建订单失败")+"。请稍后重试或刷新页面")}finally{setCreating(false)}};return e.jsxs("div",{style:{padding:24,maxWidth:1120,margin:"0 auto"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:20},children:[e.jsx("h2",{style:{margin:0,fontSize:24},children:"积分充值"}),e.jsxs("div",{style:{padding:"10px 16px",borderRadius:12,background:"#f3f6ff",color:"#334155"},children:["当前余额 ",e.jsxs("strong",{style:{fontSize:20,color:"#3366ff"},children:[Number(balance||0).toLocaleString()," 积分"]})]})]}),e.jsx("div",{style:{marginBottom:18,color:"#64748b"},children:"选择套餐后点击“立即充值”，支付完成后积分会自动到账。"}),packagesLoading?e.jsx("div",{style:{padding:40,textAlign:"center"},children:"正在加载套餐..."}):e.jsx("div",{style:{display:"flex",flexWrap:"nowrap",gap:14,overflowX:"auto",padding:"12px 4px 18px"},children:packages.map(pkg=>e.jsx(PackageCard,{key:pkg.id,pkg,selected:selected?.id===pkg.id,onSelect:()=>setSelected(pkg)}))}),error&&e.jsx("div",{role:"alert",style:{margin:"8px 0 14px",padding:"10px 12px",borderRadius:8,background:"#fff1f2",color:"#be123c"},children:error}),notice&&e.jsx("div",{role:"status",style:{margin:"8px 0 14px",padding:"10px 12px",borderRadius:8,background:"#eff6ff",color:"#1d4ed8"},children:notice}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginTop:12},children:[e.jsx("button",{type:"button",disabled:!selected||creating,onClick:createOrder,style:{minWidth:210,padding:"12px 24px",border:0,borderRadius:10,background:!selected||creating?"#94a3b8":"#3366ff",color:"#fff",fontSize:16,fontWeight:700,cursor:!selected||creating?"not-allowed":"pointer"},children:creating?"创建订单中...":"立即充值"}),selected&&e.jsxs("div",{style:{fontSize:13,color:"#64748b"},children:["到账 ",Number(selected.totalCount||0).toLocaleString()," 积分"]})]})]})}
export{PointsRecharge as default};`;
fs.writeFileSync(pointsRechargeBundle, pointsRechargeSource);

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

// ===========================================================================
// pgy-kol「找博主」phase-2：原生筛选 MVP（开发开关默认关闭）
//
// 三个注入点，全部幂等（带 exists 守卫 + replaceOnce 自带 to 已存在检查）：
// 1. 在 li 懒加载路由表声明链结束后（V1=new Map; 与 function si( 之间）注入
//    页面组件与工具函数（mainBundle 作用域内联，使用 bundle 已有的 o.jsx / m /
//    w / B / N / x / xe / We / $ / ae / f1 / oe / de / Q1 / te 等引用；函数
//    声明提升，setMenus setter 与路由闭包均可引用）。
// 2. li 路由表追加 "../pages/pgy-kol-search/index.tsx" 懒加载键（与 dashboard
//    内联模块模式一致）。
// 3. Se（user-storage）setMenus setter 合并本地菜单项：开发开关开启时在菜单
//    末尾追加 {name:"找博主",path:"/pgy-kol-search",...}。路由生成 ci/ii 与
//    侧边栏 Q0（vs/Cs/cr）都消费 Se().menus，因此一个 setter 注入点同时覆盖
//    路由与菜单渲染。
// 开关：localStorage.getItem("magiorix-pgy-kol-enabled")==="1"；关闭时菜单不
// 追加、路由不可达（直接访问落在 not-found 重定向），页面组件自身也兜底渲染
// "功能未开启"。
// ===========================================================================
const pgyKolSearchPageSource = `function pgyKolDevEnabled(){try{return window.localStorage.getItem("magiorix-pgy-kol-enabled")==="1"}catch(e){return!1}}
function pgyKolWithLocalMenu(e){if(!pgyKolDevEnabled()||!Array.isArray(e))return e;for(var i=0;i<e.length;i++){if(e[i]&&e[i].path==="/pgy-kol-search")return e}return e.concat([{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"mdi:account-search"}])}
function pgyKolNodeKey(n){if(n&&n.uniqueKey)return n.uniqueKey;var v=n&&n.value!==undefined?String(n.value):"",p=n&&n.fullPath?n.fullPath:n&&n.label||"";return v+":"+p}
function pgyKolFlattenLeaves(n,out){out=out||[];if(!n)return out;if(n.children&&n.children.length>0){for(var i=0;i<n.children.length;i++)pgyKolFlattenLeaves(n.children[i],out);return out}out.push(n.value||n.label||n);return out}
function pgyKolOptValue(n){return typeof n==="string"?n:(n&&n.value!==undefined?n.value:n&&n.id)||String(n)}
function pgyKolOptLabel(n){return typeof n==="string"?n:(n&&n.label)||(n&&n.fullPath)||(n&&n.value!==undefined?String(n.value):String(n))}
function pgyKolReadJson(key){try{var raw=window.localStorage.getItem(key);if(!raw)return null;return JSON.parse(raw)}catch(e){return null}}
function pgyKolWriteJson(key,val){try{window.localStorage.setItem(key,JSON.stringify(val));return true}catch(e){return false}}
function pgyKolClearJson(key){try{window.localStorage.removeItem(key)}catch(e){}}
function pgyKolDefaultFilter(){return {searchType:1,keyword:"",marketTarget:null,audienceGroup:null,brands:[],contentTag:[],personalTags:[],featureTags:[],gender:null,location:null,audience20:[],automotive:[],consumeBehavior:[],signed:null,contentSceneLabel:[],contentTheme:[],fansNumberLower:"",fansNumberUpper:"",fansAge:null,fansGender:null,fansLocation:null,fansMaritalStatus:null,fansConsumptionLevel:null,fansChildAgeInfo:[],fansDevicePrice:[],fansDeviceBrand:[],industryTag:[],accumCommonImpMedinNum30d:null,readMidNor30:null,interMidNor30:null,thousandLikePercent30:null,noteType:null,notePriceLower:"",notePriceUpper:"",videoPriceLower:"",videoPriceUpper:"",coopCredit:null,progressOrderCnt:"",firstIndustry:null,secondIndustry:null,tradeReportBrandIdSet:[],propagationScale:null,estimateCpuv30dLower:"",estimateCpuv30dUpper:"",estimateReadCost:"",estimateInteractCost:"",overflowCost:"",liveCount30d:"",avgLiveViewer:"",avgLiveGmv:"",inStar:false,newHighQuality:false,risingStar:false,noteLiveBoth:false,filterIntention:false,isIndustryRecommend:false,activityCodes:[],excludeLowActive:false,fansNumUp:false,excludedTradeReportBrand:false,excludedTradeInviteReportBrand:false}}
function pgyKolToFilterState(f){var out={};if(f.searchType===0||f.searchType===1)out.searchType=f.searchType;if(f.keyword)out.keyword=f.keyword;if(f.marketTarget)out.marketTarget=f.marketTarget;if(f.gender)out.gender=f.gender;if(f.location)out.location=[f.location];if(f.signed)out.signed=f.signed;if(f.audience20&&f.audience20.length)out.top20CrowdsLabel=f.audience20;if(f.automotive&&f.automotive.length)out.industrySpecificCrowdsMotorDom=f.automotive;if(f.consumeBehavior&&f.consumeBehavior.length)out.kolInfoConsumBehaviorLabel=f.consumeBehavior;if(f.contentTheme&&f.contentTheme.length)out.contentThemeLabel=f.contentTheme;if(f.fansNumberLower!==""){var lo=Number(f.fansNumberLower);if(Number.isFinite(lo)&&Number.isInteger(lo)&&lo>0)out.fansNumberLower=lo}if(f.fansNumberUpper!==""){var hi=Number(f.fansNumberUpper);if(Number.isFinite(hi)&&Number.isInteger(hi)&&hi>0)out.fansNumberUpper=hi}if(f.fansAge)out.fansAge=f.fansAge;if(f.fansGender)out.fansGender=f.fansGender;if(f.fansLocation)out.fansLocation=f.fansLocation;if(f.fansMaritalStatus)out.fansMaritalStatus=f.fansMaritalStatus;if(f.fansConsumptionLevel)out.fansConsumptionLevel=f.fansConsumptionLevel;if(f.fansChildAgeInfo&&f.fansChildAgeInfo.length)out.fansChildAgeInfo=f.fansChildAgeInfo;if(f.fansDevicePrice&&f.fansDevicePrice.length)out.fansDevicePrice=f.fansDevicePrice;if(f.fansDeviceBrand&&f.fansDeviceBrand.length)out.fansDeviceBrand=f.fansDeviceBrand;if(f.accumCommonImpMedinNum30d)out.accumCommonImpMedinNum30d=f.accumCommonImpMedinNum30d;if(f.readMidNor30)out.readMidNor30=f.readMidNor30;if(f.interMidNor30)out.interMidNor30=f.interMidNor30;if(f.thousandLikePercent30)out.thousandLikePercent30=f.thousandLikePercent30;if(f.noteType)out.noteType=f.noteType;if(f.notePriceLower!==""){var npl=Number(f.notePriceLower);if(Number.isFinite(npl)&&npl>=0)out.notePriceLower=npl}if(f.notePriceUpper!==""){var npu=Number(f.notePriceUpper);if(Number.isFinite(npu)&&npu>=0)out.notePriceUpper=npu}if(f.videoPriceLower!==""){var vpl=Number(f.videoPriceLower);if(Number.isFinite(vpl)&&vpl>=0)out.videoPriceLower=vpl}if(f.videoPriceUpper!==""){var vpu=Number(f.videoPriceUpper);if(Number.isFinite(vpu)&&vpu>=0)out.videoPriceUpper=vpu}if(f.progressOrderCnt!==""){var poc=Number(f.progressOrderCnt);if(Number.isFinite(poc)&&poc>=0)out.progressOrderCnt=poc}if(f.tradeReportBrandIdSet&&f.tradeReportBrandIdSet.length)out.tradeReportBrandIdSet=f.tradeReportBrandIdSet;if(f.activityCodes&&f.activityCodes.length)out.activityCodes=f.activityCodes;if(f.excludeLowActive)out.excludeLowActive=true;if(f.fansNumUp)out.fansNumUp=true;if(f.excludedTradeReportBrand)out.excludedTradeReportBrand=true;if(f.excludedTradeInviteReportBrand)out.excludedTradeInviteReportBrand=true;/* Phase5 预留键（取值语义未实证，未实证前不发送，UI 选择保留在 filterState，摘要中标注【待实证】）：contentTag、industryTag、personalTags、featureTags、coopCredit、propagationScale、estimateReadCost、estimateInteractCost、overflowCost、liveCount30d、avgLiveViewer、avgLiveGmv、audienceGroup、firstIndustry、secondIndustry、estimateCpuv30dLower、estimateCpuv30dUpper、inStar、newHighQuality、filterIntention、isIndustryRecommend */return out}function pgyKolUnprovenSet(){return {audienceGroup:1,firstIndustry:1,secondIndustry:1,contentTag:1,coopCredit:1,propagationScale:1,estimateReadCost:1,estimateInteractCost:1,overflowCost:1,liveCount30d:1,avgLiveViewer:1,avgLiveGmv:1,noteCategory:1,industryTag:1,inStar:1,newHighQuality:1,filterIntention:1,isIndustryRecommend:1,personalTags:1,featureTags:1,estimateCpuv30dLower:1,estimateCpuv30dUpper:1}}
function pgyKolExportColumnIds(list,selected){var byId={};for(var i=0;i<list.length;i++){byId[list[i].id]=list[i]}var out=[];for(var j=0;j<selected.length;j++){var c=byId[selected[j]];if(c&&c.responsePath&&typeof c.responsePath==="string"&&c.responsePath.indexOf("computed:")!==0&&c.evidence!=="unavailable"){out.push(selected[j])}}return out}
function PgyKolTreeNode(p){var node=p.node,level=p.level||0,selected=p.selected||[],onToggle=p.onToggle,leafOnly=p.leafOnly||false,display=p.display||function(n){return n.fullPath||n.label||String(n.value)},has=node.children&&node.children.length>0,openState=m.useState(false),open=openState[0],setOpen=openState[1],key=pgyKolNodeKey(node),isSel=selected.indexOf(key)>-1,parentOnly=leafOnly&&has;return o.jsxs(x,{sx:{pl:level*1.5},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",minHeight:30,gap:.25},children:[has?o.jsx(te,{size:"small",sx:{p:.25},onClick:function(e){e.stopPropagation(),setOpen(!open)},children:o.jsx(B,{icon:open?"solar:alt-arrow-up-bold-duotone":"solar:alt-arrow-down-bold-duotone",width:14,height:14})}):o.jsx(x,{sx:{width:24}}),parentOnly?o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)}):o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:.75,flex:1,cursor:"pointer",py:.5},onClick:function(){onToggle(node)},children:[o.jsx(x,{sx:{width:16,height:16,borderRadius:2,border:"1px solid",borderColor:isSel?"primary.main":"divider",bgcolor:isSel?"primary.main":"transparent",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0},children:isSel?"✓":null}),o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)})]})]}),open&&has&&node.children.map(function(c){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(c),node:c,level:level+1,selected:selected,onToggle:onToggle,display:display,leafOnly:leafOnly})})]})}
function PgyKolTree(p){return o.jsx(x,{sx:{display:"flex",flexDirection:"column"},children:p.nodes.map(function(n){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(n),node:n,level:0,selected:p.selected,onToggle:p.onToggle,display:p.display,leafOnly:p.leafOnly})})})}
function PgyKolChips(p){var keyOf=p.keyOf||pgyKolNodeKey;return o.jsx(x,{sx:{display:"flex",flexWrap:"wrap",gap:1},children:p.options.map(function(n){var key=keyOf(n),sel=p.selected.indexOf(key)>-1;return o.jsx(f1,{key:key,size:"small",label:p.display?p.display(n):n.label||n.fullPath||String(n.value),color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){p.onToggle(n)}})})})}function pgyKolStaticOptions(values){var out=[];for(var i=0;i<values.length;i++)out.push({value:values[i],label:values[i]});return out}
var pgyKolCategoryCommon=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场"];
var pgyKolCategoryFull=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场","情感","摄影","游戏","科技数码","出行旅游","音乐","搞笑","健康养生","汽车","婚嫁","商业财经","素材","其他"];
var pgyKolMarketOptions=pgyKolStaticOptions(["曝光","种草","转化"]);
var pgyKolGenderOptions=pgyKolStaticOptions(["不限","男","女"]);
var pgyKolSignedOptions=pgyKolStaticOptions(["不限","个人博主","机构博主"]);
var pgyKolNoteTypeOptions=pgyKolStaticOptions(["不限","图文笔记为主","视频笔记为主"]);
var pgyKolFansAgeOptions=pgyKolStaticOptions(["18岁以下","18-24","25-34","35-44","45岁以上"]);
var pgyKolFansGenderOptions=pgyKolStaticOptions(["不限","男","女"]);
var pgyKolMaritalOptions=pgyKolStaticOptions(["不限","未婚","已婚","恋爱中"]);
var pgyKolConsumptionOptions=pgyKolStaticOptions(["不限","低","中","高","极高"]);
var pgyKolChildAgeOptions=pgyKolStaticOptions(["备孕","孕期","0-6个月","6-12个月","1-3岁","3-6岁","6岁以上"]);
var pgyKolDevicePriceOptions=pgyKolStaticOptions(["2000元以下","2000-4000元","4000-6000元","6000元以上"]);
var pgyKolDeviceBrandOptions=pgyKolStaticOptions(["苹果","华为","小米","OPPO","vivo","荣耀","三星","其他"]);
var pgyKolRangeOptions=pgyKolStaticOptions(["1万以下","1万-5万","5万-20万","20万以上"]);
var pgyKolFamilyOptions=pgyKolStaticOptions(["宝妈","宝爸","奶爸","辣妈","新手妈妈","全职妈妈","职场妈妈","二胎妈妈","夫妻档"]); /* Phase5 候选：家庭身份 */
var pgyKolCareerOptions=pgyKolStaticOptions(["医生","教师","律师","程序员","设计师","健身教练","厨师","公务员","创业者","自由职业","学生"]); /* Phase5 候选：职业身份 */
var pgyKolFeatureOptions=pgyKolStaticOptions(["海外生活","少数民族","多语言","高学历","公益","军旅","运动员","素人"]); /* Phase5 候选：特色背景 */
var pgyKolSceneOptions=pgyKolStaticOptions(["开箱测评","好物分享","Vlog","知识科普","剧情演绎","美食探店","穿搭教程","美妆教程","亲子记录","旅行攻略","健身教程","家居改造"]);
var pgyKolCreditOptions=pgyKolStaticOptions(["高","中","低"]); /* Phase5 预留键 coopCredit */
var pgyKolPropagationOptions=pgyKolStaticOptions(["小","中","大","超大"]); /* Phase5 预留键 propagationScale */
var pgyKolFirstIndustryOptions=pgyKolStaticOptions(["美妆","护肤","食品饮料","母婴","时尚服饰","数码3C","汽车","家居家装","游戏","医疗健康","其他"]); /* Phase5 待实证 */
var pgyKolSecondIndustryOptions=pgyKolStaticOptions(["新品推广","常规种草","促销节点","品牌活动","形象代言"]); /* Phase5 待实证 */
var pgyKolAudienceFallback=pgyKolStaticOptions(["母婴人群","美妆人群","时尚人群","美食人群","数码人群","游戏人群","汽车人群","家居人群"]); /* Phase5 候选 */
var pgyKolFansPresets=[{label:"1万以下",lower:"",upper:"10000"},{label:"1万-5万",lower:"10000",upper:"50000"},{label:"5万-10万",lower:"50000",upper:"100000"},{label:"10万-50万",lower:"100000",upper:"500000"},{label:"50万-100万",lower:"500000",upper:"1000000"},{label:"100万以上",lower:"1000000",upper:""}];
var pgyKolFeaturedOptions=[{key:"inStar",value:"明星",label:"明星"},{key:"newHighQuality",value:"优质博主",label:"优质博主"},{key:"risingStar",value:"新锐博主",label:"新锐博主"},{key:"noteLiveBoth",value:"笔记+直播均可合作",label:"笔记+直播均可合作"},{key:"filterIntention",value:"意向行业匹配",label:"意向行业匹配"},{key:"isIndustryRecommend",value:"行业推荐博主",label:"行业推荐博主"}];
function pgyKolFeaturedLabel(key){for(var i=0;i<pgyKolFeaturedOptions.length;i++){if(pgyKolFeaturedOptions[i].key===key)return pgyKolFeaturedOptions[i].label}return key}
var pgyKolNoteCategoryIndustries=pgyKolStaticOptions(["汽车","游戏","母婴","美妆"]);
var pgyKolNoteCategoryTree={"汽车":{nodes:[{label:"汽车保养"},{label:"汽车评测"},{label:"新能源汽车"},{label:"驾考驾照"},{label:"二手车"},{label:"汽车用品"},{label:"自驾游"}]},"游戏":{nodes:[{label:"手游"},{label:"端游"},{label:"主机游戏"},{label:"电竞"},{label:"游戏攻略"},{label:"游戏周边"}]},"母婴":{nodes:[{label:"孕期"},{label:"育儿"},{label:"母婴好物"},{label:"辅食"},{label:"早教"},{label:"亲子出行"}]},"美妆":{nodes:[{label:"护肤"},{label:"彩妆"},{label:"香水"},{label:"美甲"},{label:"美发"},{label:"医美"}]}}; /* Phase5 预留：行业类目标签待实证，UI 选择带入 filterState.industryTag */
function pgyKolPresetActive(p,f){return f.fansNumberLower===p.lower&&f.fansNumberUpper===p.upper}function PgyKolMatrixSection(p){return o.jsxs(x,{sx:{display:"flex",gap:1.5,mb:1,border:"1px solid",borderColor:"divider",borderRadius:1,p:1},children:[o.jsx(w,{variant:"subtitle2",fontWeight:600,sx:{width:96,flexShrink:0,pt:.5},children:p.title}),o.jsx(x,{sx:{flexGrow:1,minWidth:0},children:p.children})]})}
function PgyKolMatrixRow(p){return o.jsxs(x,{sx:{display:"flex",alignItems:"center",minHeight:36,gap:1},children:[p.label?o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:110,flexShrink:0,textAlign:"right"},children:p.label}):null,o.jsxs(x,{sx:{flexGrow:1,minWidth:0,display:"flex",alignItems:"center",flexWrap:"wrap",gap:.75},children:p.children})]})}
function PgyKolField(p){return o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:.5},children:[o.jsx(w,{variant:"caption",color:"text.secondary",sx:{flexShrink:0},children:p.label}),p.children]})}
function PgyKolToggle(p){return o.jsx(f1,{size:"small",label:p.label,color:p.on?"warning":"default",variant:p.on?"filled":"outlined",disabled:p.disabled,onClick:function(){if(!p.disabled)p.onToggle()}})}
function PgyKolDropdown(p){var os=m.useState(false),open=os[0],setOpen=os[1],label=p.label||"",options=p.options||[],selected=p.selected||[],keyOf=p.keyOf||function(n){return pgyKolOptValue(n)},disabled=p.disabled;return o.jsxs(x,{sx:{position:"relative",display:"inline-block"},children:[o.jsx($,{size:"small",variant:selected.length>0?"contained":"outlined",color:selected.length>0?"primary":"inherit",disabled:disabled,onClick:function(){setOpen(!open)},startIcon:o.jsx(B,{icon:"mdi:chevron-down",width:16,height:16}),children:label+(selected.length>0?"（"+selected.length+"）":"")}),open&&!disabled&&o.jsx(x,{sx:{position:"absolute",top:"100%",left:0,zIndex:1300,mt:.5,minWidth:240,maxWidth:360,maxHeight:280,overflowY:"auto",p:1,bgcolor:"background.paper",border:"1px solid",borderColor:"divider",borderRadius:1,boxShadow:3},children:o.jsxs(x,{children:[o.jsx(PgyKolChips,{options:options,keyOf:keyOf,selected:selected,display:pgyKolOptLabel,onToggle:function(n){p.onToggle(n)}}),o.jsx($,{size:"small",sx:{mt:1},onClick:function(){setOpen(false)},children:"收起"})]})})]})}
function PgyKolTreePopup(p){var os=m.useState(false),open=os[0],setOpen=os[1],cfg=p.cfg,count=p.count||0,disabled=p.disabled,title=p.label||"";return o.jsxs(x,{children:[o.jsx($,{size:"small",variant:count>0?"contained":"outlined",color:count>0?"primary":"inherit",disabled:disabled,onClick:function(){setOpen(true)},children:title+(count>0?"（"+count+"）":"")}),o.jsxs(ue,{open:open,onClose:function(){setOpen(false)},maxWidth:"sm",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:title}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:function(){setOpen(false)},children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:cfg&&cfg.error?o.jsx(oe,{severity:"error",children:"加载失败（错误码 "+(cfg.error.code||"unknown")+"）："+(cfg.error.message||"未知错误")}):cfg?o.jsxs(x,{children:[o.jsx(PgyKolTree,{nodes:cfg.nodes||[],selected:p.selectedKeys,onToggle:function(n){p.onToggle(n);if(p.closeOnSelect)setOpen(false)},display:function(n){return n.fullPath||n.label||String(n.value)}}),p.hint&&o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:1},children:p.hint})]}):o.jsx(de,{size:24})})]})]})}
function PgyKolBrandPopup(p){var kw=m.useState(""),keyword=kw[0],setKeyword=kw[1],ops=m.useState([]),options=ops[0],setOptions=ops[1],ld=m.useState(false),loading=ld[0],setLoading=ld[1],bpe=m.useState(null),brandError=bpe[0],setBrandError=bpe[1],dr=m.useState([]),draft=dr[0],setDraft=dr[1],tr=m.useRef(null);function fetchBrands(kw0){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.getConfig)return;setLoading(true);bridge.getConfig({provider:"brandSearch",keyword:kw0||""}).then(function(res){setLoading(false);if(res&&res.ok){var data=res.data||{},list=data.options||data.nodes||(Array.isArray(res.data)?res.data:[]);setOptions(list);setBrandError(null)}else{setBrandError(res&&res.error||{code:"unknown",message:"品牌搜索失败"})}}).catch(function(e){setLoading(false);setBrandError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})}m.useEffect(function(){if(!p.open)return;setDraft(Array.isArray(p.current)?p.current.slice():[]);setKeyword("");setOptions([]);setBrandError(null);fetchBrands("")},[p.open]);var onKeyword=function(e){var v=e.target.value;setKeyword(v);if(tr.current)window.clearTimeout(tr.current);tr.current=window.setTimeout(function(){fetchBrands(v)},300)},toggleBrand=function(n){var v=pgyKolOptValue(n);setDraft(function(prev){var i=prev.indexOf(v);return i>=0?prev.slice(0,i).concat(prev.slice(i+1)):prev.concat([v])})};return o.jsxs(ue,{open:p.open,onClose:p.onClose,maxWidth:"sm",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:p.mode==="recent"?"近期合作品牌":"合作品牌智能推荐"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:p.onClose,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:[o.jsx(ae,{size:"small",fullWidth:true,placeholder:"搜索品牌关键词",value:keyword,onChange:onKeyword,sx:{mb:1}}),brandError&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"品牌搜索失败（错误码 "+(brandError.code||"unknown")+"）："+(brandError.message||"未知错误")}),loading&&o.jsx(Q1,{sx:{mb:1}}),options.length>0?o.jsxs(x,{sx:{display:"flex",flexWrap:"wrap",gap:.5,maxHeight:260,overflowY:"auto"},children:[options.map(function(n){var v=pgyKolOptValue(n),sel=draft.indexOf(v)>=0;return o.jsx(f1,{key:String(v),size:"small",label:pgyKolOptLabel(n),color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){toggleBrand(n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+draft.length+" 个品牌"})]}):!loading&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"输入关键词搜索品牌"})]}),o.jsxs(_e,{children:[o.jsx($,{onClick:p.onClose,children:"取消"}),draft.length===0&&o.jsx(w,{variant:"caption",color:"text.secondary",children:"请选择您的合作品牌"}),o.jsx($,{variant:"contained",disabled:draft.length===0,onClick:function(){p.onApply(draft.slice());p.onClose()},children:"确定"})]})]})}
function PgyKolNoteCategoryPopup(p){var industries=pgyKolNoteCategoryIndustries,tree=pgyKolNoteCategoryTree[p.industry]||{nodes:[]};return o.jsxs(ue,{open:p.open,onClose:p.onClose,maxWidth:"md",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"笔记类目"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:p.onClose,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:[o.jsxs(x,{sx:{display:"flex",gap:2},children:[o.jsxs(x,{sx:{width:120,flexShrink:0},children:[industries.map(function(ind){return o.jsx($,{key:ind.value,size:"small",variant:p.industry===ind.value?"contained":"outlined",fullWidth:true,sx:{mb:.5,justifyContent:"flex-start"},onClick:function(){p.onSelectIndustry(ind.value)},children:ind.label})})]}),o.jsx(x,{sx:{flexGrow:1,minWidth:0},children:o.jsx(PgyKolTree,{nodes:tree.nodes,selected:p.selected.map(function(n){return pgyKolNodeKey(n)}),onToggle:p.onToggle,display:function(n){return n.fullPath||n.label||String(n.value)}})})]}),p.selected.length>0&&o.jsxs(x,{sx:{mt:1,display:"flex",flexWrap:"wrap",gap:.5},children:[p.selected.map(function(n){return o.jsx(f1,{key:pgyKolNodeKey(n),size:"small",label:n.fullPath||n.label,onDelete:function(){p.onToggle(n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+p.selected.length+" 项"})]})]}),o.jsxs(_e,{children:[o.jsx($,{onClick:p.onClose,children:"取消"}),o.jsx($,{variant:"contained",onClick:function(){p.onClose()},children:"确定"})]})]})}
function pgyKolFixedColumnIds(){return ["kolInfo","recentNotes","actions"]}
function pgyKolDefaultColumnIds(list){return list.filter(function(c){return c.defaultDisplay===true}).map(function(c){return c.id})}
function pgyKolResolveColumns(list,stored){var fixed=pgyKolFixedColumnIds(),ids=[];function valid(v){return Array.isArray(v)&&v.length>0&&v.every(function(id){return typeof id==="string"&&list.some(function(c){return c.id===id})})}if(valid(stored)){ids=stored.slice()}else{ids=pgyKolDefaultColumnIds(list)}if(ids.length===0){ids=list.slice(0,8).map(function(c){return c.id})}for(var i=0;i<fixed.length;i++){if(ids.indexOf(fixed[i])<0)ids=[fixed[i]].concat(ids)}return ids}
function pgyKolColumnGroups(){return ["固定列","博主报价","账号数据","直播数据","日常笔记数据","合作笔记数据","其他指标"]}
function pgyKolColumnGroupOf(c){return c&&c.group||"其他指标"}
function pgyKolThousand(v){var s=String(Math.round(Number(v))),out="",cnt=0;for(var i=s.length-1;i>=0;i--){out=s[i]+out;cnt++;if(cnt%3===0&&i>0)out=","+out}return out}
function pgyKolFormatCell(v,fmt){if(v===undefined||v===null||v==="")return "-";if(fmt==="number")return pgyKolThousand(v);if(fmt==="percent"){var n=Number(v);return Number.isFinite(n)?(Math.abs(n)<=1?n*100:n).toFixed(1)+"%":String(v)}if(fmt==="money")return String(v)+"元";return String(v)}
function pgyKolCellValue(k,col){if(!col||col.evidence==="unavailable")return {unavailable:true};if(col.id==="price"){var pic=k&&k.picturePrice,vid=k&&k.videoPrice,ps=[];if(pic!==undefined&&pic!==null&&pic!=="")ps.push(String(pic)+"元");if(vid!==undefined&&vid!==null&&vid!=="")ps.push(String(vid)+"元");return {value:ps.length?ps.join(" / "):undefined}}var path=col.responsePath||col.id;if(!path||String(path).indexOf("computed:")===0)return {value:undefined};var parts=String(path).split("."),cur=k;for(var i=0;i<parts.length;i++){if(cur===undefined||cur===null)return {value:undefined};cur=cur[parts[i]]}return {value:cur}}function PgyKolColumnDialog(p){var groups=pgyKolColumnGroups(),fixedIds=pgyKolFixedColumnIds(),list=p.columns||[],ds=m.useState(null),draft=ds[0],setDraft=ds[1],ss=m.useState(""),search=ss[0],setSearch=ss[1],effective=draft||p.selected||[],filtered=list.filter(function(c){return search===""||(c.label||"").indexOf(search)>=0});var fixedLabel=function(id){if(id==="kolInfo")return "博主信息";if(id==="recentNotes")return "近期笔记";if(id==="actions")return "操作";return id},colOf=function(id){for(var i=0;i<list.length;i++){if(list[i].id===id)return list[i]}return null},toggleDraft=function(id){if(fixedIds.indexOf(id)>=0)return;setDraft(function(prev){var cur=(prev||p.selected||[]).slice(),i=cur.indexOf(id);if(i>=0)return cur.slice(0,i).concat(cur.slice(i+1));if(id==="price"||id==="picturePrice"||id==="videoPrice"){cur=cur.filter(function(c){return c!=="price"&&c!=="picturePrice"&&c!=="videoPrice"})}return cur.concat([id])})},clearDraft=function(){setDraft(fixedIds.slice())},moveDraft=function(id,dir){setDraft(function(prev){var cur=(prev||p.selected||[]).slice(),i=cur.indexOf(id);if(i<0)return cur;var j=i+dir;if(j<0||j>=cur.length)return cur;var tmp=cur[i];cur[i]=cur[j];cur[j]=tmp;return cur})},apply=function(){p.onApply(effective.slice());setDraft(null);setSearch("");p.onClose()},cancel=function(){setDraft(null);setSearch("");p.onClose()};return o.jsxs(ue,{open:p.open,onClose:cancel,maxWidth:"md",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"自定义列"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:cancel,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:[p.error&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"字段加载失败（错误码 "+(p.error.code||"unknown")+"）："+(p.error.message||"未知错误")}),o.jsx(ae,{size:"small",fullWidth:true,placeholder:"按名称过滤列",value:search,onChange:function(e){setSearch(e.target.value)},sx:{mb:1}}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mb:1},children:"已选 "+effective.length+" 列；固定列不可删除；可添加列按分组勾选（报价三列互斥，顺序用上移/下移调整）"}),/* 官网为拖拽排序，这里用按钮等价实现（简单可靠） */groups.map(function(g){var cols;if(g==="固定列"){cols=fixedIds.map(function(id){var c=colOf(id);return {id:id,label:c&&c.label||fixedLabel(id),group:"固定列",fixed:true}})}else{cols=filtered.filter(function(c){return pgyKolColumnGroupOf(c)===g})}if(cols.length===0)return null;return o.jsxs(x,{key:g,sx:{mb:1},children:[o.jsx(w,{variant:"subtitle2",sx:{mb:.25},children:g}),cols.map(function(c){var sel=effective.indexOf(c.id)>=0,idx=effective.indexOf(c.id),first=idx===0,last=idx===effective.length-1;return o.jsxs(x,{key:c.id,sx:{display:"flex",alignItems:"center",gap:.5,minHeight:34,px:.5,borderRadius:.5},children:[o.jsx(f1,{size:"small",label:c.label||c.id,color:sel?"primary":"default",variant:sel?"filled":"outlined",disabled:!!c.fixed,onClick:function(){toggleDraft(c.id)}}),sel&&!c.fixed&&o.jsxs(x,{sx:{display:"flex",gap:.25},children:[o.jsx($,{size:"small",disabled:first,onClick:function(){moveDraft(c.id,-1)},children:"上移"}),o.jsx($,{size:"small",disabled:last,onClick:function(){moveDraft(c.id,1)},children:"下移"})]}),sel&&o.jsx(w,{variant:"caption",color:"text.secondary",children:"第 "+(idx+1)+" 列"})]})})]})})]}),o.jsxs(_e,{children:[o.jsx($,{variant:"outlined",onClick:clearDraft,children:"清空"}),o.jsx($,{onClick:cancel,children:"取消"}),o.jsx($,{variant:"contained",onClick:apply,children:"确定"})]})]})}
function pgyKolInfoCell(k){var avatar=k&&(k.avatar||k.avatarUrl)||"";return o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,minWidth:240},children:[avatar?o.jsx(x,{component:"img",src:avatar,sx:{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}}):o.jsx(x,{sx:{width:36,height:36,borderRadius:"50%",bgcolor:"action.hover",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0},children:"👤"}),o.jsxs(x,{sx:{minWidth:0},children:[o.jsx(w,{variant:"body2",fontWeight:600,noWrap:true,children:k&&k.nickname||"-"}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",fontFamily:"monospace",wordBreak:"break-all"},children:k&&k.userId||"-"}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block"},children:((k&&k.location)||"-")+" · "+((k&&k.gender)||"-")})]})]})}
function PgyKolResultTable(p){var result=p.result,kols=result.kols||[],list=p.list||[],columns=p.columns||[],fixedIds=pgyKolFixedColumnIds(),colOf=function(id){for(var i=0;i<list.length;i++){if(list[i].id===id)return list[i]}return null},cell=function(k,id){if(id==="kolInfo")return pgyKolInfoCell(k);if(id==="recentNotes"){var rn=k&&k.recentNotes;if(Array.isArray(rn))return o.jsx(w,{variant:"body2",children:rn.length+" 篇"});return o.jsx(w,{variant:"body2",children:rn!=null&&rn!==""?String(rn):"-"})}if(id==="actions")return o.jsx(w,{variant:"body2",children:"-"});var c=colOf(id);if(!c)return o.jsx(w,{variant:"body2",children:"-"});if(c.unavailable===true)return o.jsx(w,{variant:"body2",color:"text.secondary",children:"官网当前未返回"});var v=pgyKolCellValue(k,c);if(v.unavailable)return o.jsx(w,{variant:"body2",color:"text.secondary",children:"官网当前未返回"});if(v.value===undefined||v.value===null||v.value==="")return o.jsx(w,{variant:"body2",color:"text.secondary",children:"-"});if(c.formatter==="url")return o.jsx(w,{variant:"body2",component:"a",href:String(v.value),target:"_blank",rel:"noreferrer",sx:{color:"primary.main",wordBreak:"break-all"},children:String(v.value)});return o.jsx(w,{variant:"body2",children:pgyKolFormatCell(v.value,c.formatter)})};return o.jsx(x,{sx:{overflow:"auto",maxHeight:520,border:"1px solid",borderColor:"divider",borderRadius:1},children:o.jsx(x,{component:"table",sx:{borderCollapse:"collapse",minWidth:1080,width:"100%"},children:[o.jsx(x,{component:"thead",children:o.jsx(x,{component:"tr",children:columns.map(function(id,hi){var h=id==="kolInfo"?"博主信息":id==="recentNotes"?"近期笔记":id==="actions"?"操作":(colOf(id)&&colOf(id).label)||id;return o.jsx(x,{component:"th",key:hi,sx:{p:1,borderBottom:"1px solid",borderColor:"divider",textAlign:"left",whiteSpace:"nowrap",fontWeight:600,fontSize:12,bgcolor:"action.hover"},children:h})})})}),o.jsx(x,{component:"tbody",children:kols.map(function(k,ki){return o.jsx(x,{component:"tr",key:k&&k.userId||"row-"+ki,children:columns.map(function(id,ci){return o.jsx(x,{component:"td",key:ci,sx:{p:1,borderBottom:"1px solid",borderColor:"divider",verticalAlign:"middle",whiteSpace:"nowrap"},children:cell(k,id)})})})})})]})})}function pgyKolStatusText(s){if(s==="running")return "采集中";if(s==="paused")return "已暂停";if(s==="auth-expired")return "登录已失效";if(s==="risk-control")return "触发风控";if(s==="cancelled")return "已取消";if(s==="failed")return "采集失败";if(s==="incomplete")return "采集未完整";if(s==="completed")return "已完成";return s||"未知状态"}
function pgyKolCompletenessText(t){if(!t)return "";if(t.completeness==="complete")return "完整性已证明";if(t.completeness==="cannot-prove")return "完整性无法证明（原因："+(t.summary&&t.summary.stopReason||t.warning||"无法证明")+"）";return "完整性未证明"}
function pgyKolResumePlan(t){if(!t)return null;var reason=t.summary&&t.summary.stopReason,cur=t.budgets||{},used=Number.isFinite(t.budgetUsed)?t.budgetUsed:0;if(t.status==="incomplete"){if(reason==="budget-exhausted"){var curB=Number.isInteger(cur.queryBudget)?cur.queryBudget:400,min=Math.max(curB,used)+1;if(min>1000)return {kind:"blocked",reasonText:"已消费请求数已达预算上限（1000），无法继续增加预算"};return {kind:"budget",label:"查询预算",current:curB,used:used,min:min,max:1000,reasonText:"查询预算已耗尽，请输入更大的总预算后从原检查点继续"}}if(reason==="max-pages-reached"){var curM=Number.isInteger(cur.maxPagesPerLeaf)?cur.maxPagesPerLeaf:250;if(curM>=250)return {kind:"blocked",reasonText:"已到官方安全页数上限（250 页），无法继续同一查询"};return {kind:"maxPages",label:"单叶子最大页数",current:curM,used:used,min:curM+1,max:250,reasonText:"已达单叶子最大页数，请输入更大的页数预算后从原检查点继续"}}if(reason==="repeat-page")return {kind:"blocked",reasonText:"检测到连续重复页，分页可能复读，继续无法证明完整"};if(reason==="capped-unprovable")return {kind:"blocked",reasonText:"无安全切分维度，继续会重复抓取且无法证明完整"};if(reason==="checkpoint-desync")return {kind:"blocked",reasonText:"检查点与行数据不一致，禁止继续"};return {kind:"blocked",reasonText:"该任务无法安全继续，可导出已有数据"}}if(t.status==="completed"&&t.completeness!=="complete")return {kind:"blocked",reasonText:"该任务已完成但完整性未证明（旧版任务），无法继续，可导出已有数据"};return null}
function pgyKolBatchErrorMessage(e){if(!e)return "";if(e.code==="auth-expired")return "蒲公英登录已失效，请重新授权";if(e.code==="risk-control")return "触发风控，采集已停止";if(e.code==="failed"||e.kind==="failed")return "采集失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误");return "任务操作失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误")}
function pgyKolCount(t,k){return t&&t.counts&&t.counts[k]!=null?t.counts[k]:0}
function pgyKolPagesDone(t){if(!t||!Array.isArray(t.leaves))return 0;var n=0;for(var i=0;i<t.leaves.length;i++){var l=t.leaves[i];if(l&&Array.isArray(l.pagesCompleted))n+=l.pagesCompleted.length}return n}
function pgyKolAnyCapped(t){if(!t)return false;if(t.capSignal&&t.capSignal.capped)return true;if(Array.isArray(t.leaves)){for(var i=0;i<t.leaves.length;i++){if(t.leaves[i]&&t.leaves[i].capSignal&&t.leaves[i].capSignal.capped)return true}}return false}
function PgyKolBatchPanel(p){var bv=m.useState(""),budgetInput=bv[0],setBudgetInput=bv[1];var t=p.task;if(!t)return null;var counts=t.counts||{},statusText=pgyKolStatusText(t.status),completenessText=pgyKolCompletenessText(t),pages=pgyKolPagesDone(t),capped=pgyKolAnyCapped(t),subCount=t.summary&&t.summary.subqueryCount!=null?t.summary.subqueryCount:0,resumePlan=pgyKolResumePlan(t),resumeEligible=resumePlan&&(resumePlan.kind==="budget"||resumePlan.kind==="maxPages"),parsedInput=budgetInput.trim()===""?NaN:Number(budgetInput),inputValid=resumeEligible&&Number.isInteger(parsedInput)&&parsedInput>=resumePlan.min&&parsedInput<=resumePlan.max,legacyUnproven=t.status==="completed"&&t.completeness!=="complete",incompleteShown=t.status==="incomplete"||legacyUnproven;return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"任务进度"}),o.jsx(f1,{size:"small",color:t.status==="completed"&&t.completeness==="complete"?"success":incompleteShown?"warning":t.status==="failed"||t.status==="risk-control"?"error":t.status==="running"?"info":"default",label:incompleteShown?"采集未完整/需要处理":statusText}),capped&&o.jsx(f1,{size:"small",color:"warning",label:"结果可能超过 5000"})]}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mb:1,fontFamily:"monospace",wordBreak:"break-all"},children:"任务 ID："+t.taskId}),incompleteShown&&o.jsx(oe,{severity:"warning",sx:{mb:1},children:"采集未完整/需要处理："+(resumePlan&&resumePlan.reasonText||completenessText)}),!incompleteShown&&o.jsx(oe,{severity:completenessText.indexOf("无法证明")>=0?"warning":"success",sx:{mb:1},children:completenessText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(f1,{size:"small",variant:"outlined",label:"原始条数 "+(counts.raw!=null?counts.raw:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"唯一博主数 "+(counts.unique!=null?counts.unique:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"重复数 "+(counts.dup!=null?counts.dup:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"缺UID异常数 "+(counts.missingUid!=null?counts.missingUid:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"已抓页数 "+pages}),o.jsx(f1,{size:"small",variant:"outlined",label:"子查询数 "+subCount})]}),resumeEligible&&o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(w,{variant:"body2",color:"text.secondary",children:"当前"+resumePlan.label+"："+resumePlan.current+"；已消费请求数："+resumePlan.used+"；允许新值："+resumePlan.min+"～"+resumePlan.max}),o.jsx(ae,{size:"small",type:"number",value:budgetInput,onChange:function(e){setBudgetInput(e.target.value)},placeholder:"请输入新"+resumePlan.label,sx:{maxWidth:180}}),o.jsx($,{size:"small",variant:"contained",disabled:!inputValid,onClick:function(){var nb={};if(resumePlan.kind==="budget"){nb.queryBudget=parsedInput}else{nb.maxPagesPerLeaf=parsedInput}p.onResumeWithBudgets(nb)},children:resumePlan.kind==="maxPages"?"增加页数并继续":"增加预算并继续"})]}),resumePlan&&resumePlan.kind==="blocked"&&o.jsx(w,{variant:"body2",color:"text.secondary",sx:{display:"block",mb:1},children:resumePlan.reasonText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap"},children:[t.status==="running"&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onPause,children:"暂停"}),(t.status==="paused"||t.status==="auth-expired"||t.status==="interrupted"||t.status==="failed")&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onResume,children:"继续"}),(t.status==="cancelled"||t.status==="failed"||t.status==="completed"||t.status==="incomplete")?null:o.jsx($,{size:"small",variant:"outlined",color:"error",onClick:p.onCancel,children:"取消"}),o.jsx($,{size:"small",variant:"outlined",onClick:p.onExport,children:"导出"})]})]})]})}
function PgyKolTaskHistory(p){return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,sx:{mb:1},children:"任务历史"}),p.error&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"任务历史加载失败（错误码 "+(p.error.code||"unknown")+"）："+(p.error.message||"未知错误")}),!p.error&&(!p.tasks||p.tasks.length===0)&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"暂无采集任务"}),p.tasks&&p.tasks.map(function(t){var c=t.counts||{};return o.jsxs(x,{key:t.taskId,sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"body2",sx:{fontFamily:"monospace",wordBreak:"break-all"},children:t.taskId}),o.jsx(f1,{size:"small",variant:"outlined",color:t.status==="completed"&&t.completeness==="complete"?"success":t.status==="incomplete"?"warning":"default",label:t.status==="incomplete"?"采集未完整":pgyKolStatusText(t.status)}),o.jsx(f1,{size:"small",variant:"outlined",label:t.completeness==="complete"?"完整性已证明":"完整性未证明"}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"原始 "+(c.raw!=null?c.raw:0)+" / 唯一 "+(c.unique!=null?c.unique:0)+" / 重复 "+(c.dup!=null?c.dup:0)+" / 缺UID "+(c.missingUid!=null?c.missingUid:0)}),o.jsx(w,{variant:"caption",color:"text.secondary",children:t.updatedAt||""}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onSelect(t.taskId)},children:"查看"}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onExport(t.taskId)},children:"导出"})]})})]})]})}function PgyKolSearchPage(){var st=m.useState("idle"),status=st[0],setStatus=st[1],er=m.useState(null),error=er[0],setError=er[1],cf=m.useState({}),configs=cf[0],setConfigs=cf[1],fs0=m.useState(pgyKolDefaultFilter()),filter=fs0[0],setFilter=fs0[1],pv=m.useState(""),preview=pv[0],setPreview=pv[1],rs=m.useState(null),result=rs[0],setResult=rs[1],cl=m.useState(null),columnList=cl[0],setColumnList=cl[1],ce2=m.useState(null),columnError=ce2[0],setColumnError=ce2[1],sc2=m.useState([]),selectedColumns=sc2[0],setSelectedColumns=sc2[1],colOpen=m.useState(false),columnOpen=colOpen[0],setColumnOpen=colOpen[1],catOpen=m.useState(false),categoryOpen=catOpen[0],setCategoryOpen=catOpen[1],catInd=m.useState("汽车"),catIndustry=catInd[0],setCatIndustry=catInd[1],brandPopup=m.useState(null),brandPopupMode=brandPopup[0],setBrandPopupMode=brandPopup[1],showAllCat=m.useState(false),showAllCategory=showAllCat[0],setShowAllCategory=showAllCat[1],restored=m.useState(false),restoredNotice=restored[0],setRestoredNotice=restored[1],au20=m.useState(false),aud20Open=au20[0],setAud20Open=au20[1],tid2=m.useState(null),currentTaskId=tid2[0],setCurrentTaskId=tid2[1],ct2=m.useState(null),currentTask=ct2[0],setCurrentTask=ct2[1],tl2=m.useState([]),taskList=tl2[0],setTaskList=tl2[1],tle=m.useState(null),taskListError=tle[0],setTaskListError=tle[1],tl3=m.useState(false),taskLoading=tl3[0],setTaskLoading=tl3[1],bzy=m.useState(false),batchBusy=bzy[0],setBatchBusy=bzy[1],ber=m.useState(null),batchError=ber[0],setBatchError=ber[1],bnt=m.useState(null),batchNotice=bnt[0],setBatchNotice=bnt[1];m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge)return;var tasks=[["areas",{provider:"areas"}],["automotive",{provider:"kolTagsV2",section:"automotiveIndustryTag"}],["audience20",{provider:"kolTagsV2",section:"audience20"}],["contentTheme",{provider:"kolTagsV2",section:"contentTheme"}],["consumeBehavior",{provider:"consumeBehavior"}],["audienceGroup",{provider:"audienceGroup"}],["activities",{provider:"activities"}]];tasks.forEach(function(t){bridge.getConfig(t[1]).then(function(res){setConfigs(function(prev){var next=Object.assign({},prev);if(res&&res.ok){next[t[0]]={source:res.data&&res.data.source||"live",warning:res.data&&res.data.warning,nodes:res.data&&res.data.nodes||[],options:res.data&&res.data.options||[]}}else{next[t[0]]={error:res&&res.error?res.error:{code:"unknown",message:"配置加载失败"}}}return next})}).catch(function(e){setConfigs(function(prev){var next=Object.assign({},prev);next[t[0]]={error:{code:e&&e.code||"unknown",message:e&&e.message||String(e)}};return next})})})},[]);m.useEffect(function(){var saved=pgyKolReadJson("magiorix-pgy-kol-filters");if(saved&&typeof saved==="object"&&saved.filter&&typeof saved.filter==="object"){var next=Object.assign({},pgyKolDefaultFilter(),saved.filter);if(saved.searchType===0||saved.searchType===1)next.searchType=saved.searchType;if(typeof saved.keyword==="string")next.keyword=saved.keyword;setFilter(next);setRestoredNotice(true)}},[]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.getColumns)return;bridge.getColumns().then(function(res){if(res&&res.ok&&Array.isArray(res.data)){setColumnList(res.data);var saved=pgyKolReadJson("magiorix-pgy-kol-filters"),stored=Array.isArray(saved&&saved.selectedColumns)?saved.selectedColumns:null;if(!stored){var cols=pgyKolReadJson("magiorix-pgy-kol-columns");if(Array.isArray(cols))stored=cols}setSelectedColumns(pgyKolResolveColumns(res.data,stored));setColumnError(null)}else{setColumnError(res&&res.error||{code:"unknown",message:"字段列表加载失败"})}}).catch(function(e){setColumnError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},[]);m.useEffect(function(){refreshTaskList()},[]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.onBatchEvent)return;var dispose=bridge.onBatchEvent(function(ev){if(currentTaskId)loadTask(currentTaskId);refreshTaskList()});return function(){if(dispose&&typeof dispose==="function")dispose()}},[currentTaskId]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge){setPreview("");return}var timer=window.setTimeout(function(){bridge.previewPayload(pgyKolToFilterState(filter)).then(function(res){if(res&&res.ok){setPreview(typeof res.data==="string"?res.data:JSON.stringify(res.data,null,2))}else{setPreview("预览不可用："+((res&&res.error&&res.error.message)||"未知错误"))}}).catch(function(e){setPreview("预览不可用："+((e&&e.message)||String(e)))})},300);return function(){window.clearTimeout(timer)}},[filter]);m.useEffect(function(){var timer=window.setTimeout(function(){pgyKolWriteJson("magiorix-pgy-kol-filters",{searchType:filter.searchType,keyword:filter.keyword,filter:filter,selectedColumns:selectedColumns})},400);return function(){window.clearTimeout(timer)}},[filter,selectedColumns]);var update=m.useCallback(function(patch){setFilter(function(prev){return Object.assign({},prev,patch)})},[]),toggleArr=m.useCallback(function(key,node){setFilter(function(prev){var cur=prev[key]||[],found=-1;for(var i=0;i<cur.length;i++){if(pgyKolNodeKey(cur[i])===pgyKolNodeKey(node)){found=i;break}}var next=found>=0?cur.slice(0,found).concat(cur.slice(found+1)):cur.concat([node]),patch={};patch[key]=next;return Object.assign({},prev,patch)})},[]),toggleSingle=m.useCallback(function(key,value){setFilter(function(prev){var patch={};patch[key]=prev[key]===value?null:value;return Object.assign({},prev,patch)})},[]),toggleWithNone=m.useCallback(function(key,value){setFilter(function(prev){var patch={};patch[key]=value==="不限"?null:(prev[key]===value?null:value);return Object.assign({},prev,patch)})},[]),toggleBool=m.useCallback(function(key){setFilter(function(prev){var patch={};patch[key]=!prev[key];return Object.assign({},prev,patch)})},[]),toggleCategory=m.useCallback(function(value){setFilter(function(prev){var cur=prev.contentTag||[],next;if(value==="全部"){next=cur.indexOf("全部")>=0?[]:["全部"]}else{next=cur.slice();var i=next.indexOf("全部");if(i>=0)next=next.slice(0,i).concat(next.slice(i+1));var j=next.indexOf(value);if(j>=0)next=next.slice(0,j).concat(next.slice(j+1));else next.push(value)}var patch={};patch.contentTag=next;return Object.assign({},prev,patch)})},[]);var runSearch=m.useCallback(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge)return;setStatus("loading");setError(null);bridge.searchFirstPage(pgyKolToFilterState(filter)).then(function(res){if(res&&res.ok){setResult(res.data);setStatus(res.data&&res.data.kols&&res.data.kols.length>0?"loaded":"empty")}else{var e=res&&res.error||{code:"unknown",message:"查询失败"};setError(e);setStatus(e.code==="auth-expired"?"auth-expired":"error")}}).catch(function(e){setError({code:e&&e.code||"unknown",message:e&&e.message||String(e)});setStatus("error")})},[filter]);var loadTask=function(tid){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchGet||!tid)return;setTaskLoading(true);bridge.batchGet({taskId:tid}).then(function(res){setTaskLoading(false);if(res&&res.ok){setCurrentTask(res.data);setBatchError(null)}else{setBatchError(res&&res.error||{code:"unknown",message:"任务详情加载失败"})}}).catch(function(e){setTaskLoading(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},refreshTaskList=function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchList)return;bridge.batchList().then(function(res){if(res&&res.ok&&Array.isArray(res.data)){setTaskList(res.data);setTaskListError(null)}else{setTaskListError(res&&res.error||{code:"unknown",message:"任务历史加载失败"})}}).catch(function(e){setTaskListError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},startBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchStart||batchBusy)return;var exportColumns=pgyKolExportColumnIds(columnList,selectedColumns);if(exportColumns.length===0){setBatchError({code:"invalid-input",message:"请至少选择一个可导出的展示字段"});return}setBatchBusy(true);setBatchError(null);bridge.batchStart({filterState:pgyKolToFilterState(filter),columns:exportColumns}).then(function(res){setBatchBusy(false);if(res&&res.ok){var tid=res.data&&res.data.taskId;if(tid){setCurrentTaskId(tid);loadTask(tid)}refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"采集启动失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},pauseBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchPause({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},resumeBatch=function(budgets){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchResume(budgets?{taskId:tid,budgets:budgets}:{taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},cancelBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchCancel({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},exportTask=function(tid){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchExport||!tid)return;setBatchBusy(true);setBatchError(null);setBatchNotice(null);bridge.batchExport({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){setBatchNotice("导出已提交："+tid+"（完整数据以导出文件为准）")}else{setBatchError(res&&res.error||{code:"unknown",message:"导出失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},selectTask=function(tid){setCurrentTaskId(tid);loadTask(tid)},applyBrands=function(ids){if(brandPopupMode==="recent"){update({tradeReportBrandIdSet:ids})}else{update({brands:ids})}},clearAll=function(){setFilter(pgyKolDefaultFilter());pgyKolClearJson("magiorix-pgy-kol-filters");setRestoredNotice(false);setShowAllCategory(false)},openNoteCategory=function(ind){setCatIndustry(ind);setCategoryOpen(true)},areasToggle=function(node){var key=pgyKolNodeKey(node);update({location:filter.location&&pgyKolNodeKey(filter.location)===key?null:node})},fansLocToggle=function(node){var key=pgyKolNodeKey(node);update({fansLocation:filter.fansLocation&&pgyKolNodeKey(filter.fansLocation)===key?null:node})},toggleActivity=function(n){var v=pgyKolOptValue(n);setFilter(function(prev){var cur=prev.activityCodes||[],i=cur.indexOf(v),next=i>=0?cur.slice(0,i).concat(cur.slice(i+1)):cur.concat([v]),patch={};patch.activityCodes=next;return Object.assign({},prev,patch)})},togglePreset=function(n){if(pgyKolPresetActive(n,filter)){update({fansNumberLower:"",fansNumberUpper:""})}else{update({fansNumberLower:n.lower,fansNumberUpper:n.upper})}};if(!pgyKolDevEnabled())return o.jsx(x,{sx:{p:4},children:o.jsx(oe,{severity:"warning",children:"功能未开启"})});var bridgeOk=!!(window.bridge&&window.bridge.pgyKol),areasCfg=configs.areas||null,autoCfg=configs.automotive||null,audCfg=configs.audience20||null,themeCfg=configs.contentTheme||null,consumeCfg=configs.consumeBehavior||null,audGroupCfg=configs.audienceGroup||null,actCfg=configs.activities||null,areasSel=filter.location?[pgyKolNodeKey(filter.location)]:[],fansLocSel=filter.fansLocation?[pgyKolNodeKey(filter.fansLocation)]:[],autoLeaves=[],batchRunning=currentTask&&currentTask.status==="running",hasBrands=filter.brands&&filter.brands.length>0,catOptions=showAllCategory?pgyKolCategoryFull:pgyKolCategoryCommon;filter.automotive.forEach(function(n){pgyKolFlattenLeaves(n,autoLeaves)});var summary=[],unprovenKeys=pgyKolUnprovenSet(),hasUnprovenSel=Object.keys(filter).some(function(k){var v=filter[k];if(!unprovenKeys[k]||v===undefined||v===null||v==="")return false;return !Array.isArray(v)||v.length>0});function sumAdd(key,label,onDelete){summary.push({key:key,label:label,onDelete:onDelete})}if(filter.searchType===0)sumAdd("searchType","搜昵称",function(){update({searchType:1})});if(filter.keyword)sumAdd("keyword","关键词："+filter.keyword,function(){update({keyword:""})});if(filter.marketTarget)sumAdd("marketTarget","营销目标："+filter.marketTarget,function(){update({marketTarget:null})});if(filter.audienceGroup)sumAdd("audienceGroup","人群目标："+filter.audienceGroup,function(){update({audienceGroup:null})});if(filter.brands&&filter.brands.length)sumAdd("brands","合作品牌 "+filter.brands.length+" 个",function(){update({brands:[]})});if(filter.contentTag&&filter.contentTag.length)sumAdd("contentTag","类目："+filter.contentTag.join("、"),function(){update({contentTag:[]})});if(filter.personalTags&&filter.personalTags.length)sumAdd("personalTags","家庭身份 "+filter.personalTags.length+" 项",function(){update({personalTags:[]})});if(filter.featureTags&&filter.featureTags.length)sumAdd("featureTags","职业/特色 "+filter.featureTags.length+" 项",function(){update({featureTags:[]})});if(filter.gender)sumAdd("gender","性别："+filter.gender,function(){update({gender:null})});if(filter.location)sumAdd("location","地域："+pgyKolOptLabel(filter.location),function(){update({location:null})});if(filter.audience20&&filter.audience20.length)sumAdd("audience20","二十大人群 "+filter.audience20.length+" 项",function(){update({audience20:[]})});if(filter.automotive&&filter.automotive.length)sumAdd("automotive","行业特色画像 "+filter.automotive.length+" 项",function(){update({automotive:[]})});if(filter.consumeBehavior&&filter.consumeBehavior.length)sumAdd("consumeBehavior","消费行为 "+filter.consumeBehavior.length+" 项",function(){update({consumeBehavior:[]})});if(filter.signed)sumAdd("signed","签约："+filter.signed,function(){update({signed:null})});if(filter.contentSceneLabel&&filter.contentSceneLabel.length)sumAdd("contentSceneLabel","擅长内容 "+filter.contentSceneLabel.length+" 项",function(){update({contentSceneLabel:[]})});if(filter.contentTheme&&filter.contentTheme.length)sumAdd("contentTheme","内容题材 "+filter.contentTheme.length+" 项",function(){update({contentTheme:[]})});if(filter.fansNumberLower!==""||filter.fansNumberUpper!=="")sumAdd("fansNum","粉丝量："+(filter.fansNumberLower||"0")+"～"+(filter.fansNumberUpper||"不限"),function(){update({fansNumberLower:"",fansNumberUpper:""})});if(filter.fansAge)sumAdd("fansAge","粉丝年龄："+filter.fansAge,function(){update({fansAge:null})});if(filter.fansGender)sumAdd("fansGender","粉丝性别："+filter.fansGender,function(){update({fansGender:null})});if(filter.fansLocation)sumAdd("fansLocation","粉丝地域："+pgyKolOptLabel(filter.fansLocation),function(){update({fansLocation:null})});if(filter.fansMaritalStatus)sumAdd("fansMaritalStatus","婚恋状态："+filter.fansMaritalStatus,function(){update({fansMaritalStatus:null})});if(filter.fansConsumptionLevel)sumAdd("fansConsumptionLevel","消费水平："+filter.fansConsumptionLevel,function(){update({fansConsumptionLevel:null})});if(filter.fansChildAgeInfo&&filter.fansChildAgeInfo.length)sumAdd("fansChildAgeInfo","母婴阶段 "+filter.fansChildAgeInfo.length+" 项",function(){update({fansChildAgeInfo:[]})});if(filter.fansDevicePrice&&filter.fansDevicePrice.length)sumAdd("fansDevicePrice","手机价格 "+filter.fansDevicePrice.length+" 项",function(){update({fansDevicePrice:[]})});if(filter.fansDeviceBrand&&filter.fansDeviceBrand.length)sumAdd("fansDeviceBrand","手机品牌 "+filter.fansDeviceBrand.length+" 项",function(){update({fansDeviceBrand:[]})});if(filter.industryTag&&filter.industryTag.length)sumAdd("industryTag","笔记类目 "+filter.industryTag.length+" 项",function(){update({industryTag:[]})});if(filter.accumCommonImpMedinNum30d)sumAdd("impMed","曝光中位数："+filter.accumCommonImpMedinNum30d,function(){update({accumCommonImpMedinNum30d:null})});if(filter.readMidNor30)sumAdd("readMid","阅读中位数："+filter.readMidNor30,function(){update({readMidNor30:null})});if(filter.interMidNor30)sumAdd("interMid","互动中位数："+filter.interMidNor30,function(){update({interMidNor30:null})});if(filter.thousandLikePercent30)sumAdd("thousand","千赞笔记比例："+filter.thousandLikePercent30,function(){update({thousandLikePercent30:null})});if(filter.noteType)sumAdd("noteType","笔记类型："+filter.noteType,function(){update({noteType:null})});if(filter.notePriceLower!==""||filter.notePriceUpper!=="")sumAdd("notePrice","图文报价："+(filter.notePriceLower||"0")+"～"+(filter.notePriceUpper||"不限"),function(){update({notePriceLower:"",notePriceUpper:""})});if(filter.videoPriceLower!==""||filter.videoPriceUpper!=="")sumAdd("videoPrice","视频报价："+(filter.videoPriceLower||"0")+"～"+(filter.videoPriceUpper||"不限"),function(){update({videoPriceLower:"",videoPriceUpper:""})});if(filter.coopCredit)sumAdd("coopCredit","合作信用度："+filter.coopCredit,function(){update({coopCredit:null})});if(filter.progressOrderCnt!=="")sumAdd("progressOrderCnt","合作订单数 ≥"+filter.progressOrderCnt,function(){update({progressOrderCnt:""})});if(filter.firstIndustry)sumAdd("firstIndustry","合作行业："+filter.firstIndustry+(filter.secondIndustry?"/"+filter.secondIndustry:""),function(){update({firstIndustry:null,secondIndustry:null})});if(filter.tradeReportBrandIdSet&&filter.tradeReportBrandIdSet.length)sumAdd("tradeBrand","近期合作品牌 "+filter.tradeReportBrandIdSet.length+" 个",function(){update({tradeReportBrandIdSet:[]})});if(filter.propagationScale)sumAdd("propagationScale","传播规模："+filter.propagationScale,function(){update({propagationScale:null})});if(filter.estimateCpuv30dLower!==""||filter.estimateCpuv30dUpper!=="")sumAdd("cpuv","预估CPM："+(filter.estimateCpuv30dLower||"0")+"～"+(filter.estimateCpuv30dUpper||"不限"),function(){update({estimateCpuv30dLower:"",estimateCpuv30dUpper:""})});if(filter.estimateReadCost!=="")sumAdd("estRead","阅读单价 ≥"+filter.estimateReadCost,function(){update({estimateReadCost:""})});if(filter.estimateInteractCost!=="")sumAdd("estInteract","互动单价 ≥"+filter.estimateInteractCost,function(){update({estimateInteractCost:""})});if(filter.overflowCost!=="")sumAdd("overflow","外溢进店单价 ≥"+filter.overflowCost,function(){update({overflowCost:""})});if(filter.liveCount30d!=="")sumAdd("liveCount","直播场次 ≥"+filter.liveCount30d,function(){update({liveCount30d:""})});if(filter.avgLiveViewer!=="")sumAdd("avgViewer","场均观播 ≥"+filter.avgLiveViewer,function(){update({avgLiveViewer:""})});if(filter.avgLiveGmv!=="")sumAdd("avgGmv","场均销售额 ≥"+filter.avgLiveGmv,function(){update({avgLiveGmv:""})});["inStar","newHighQuality","risingStar","noteLiveBoth","filterIntention","isIndustryRecommend"].forEach(function(k){if(filter[k]===true)sumAdd(k,pgyKolFeaturedLabel(k),function(){var patch={};patch[k]=false;setFilter(function(prev){return Object.assign({},prev,patch)})})});if(filter.activityCodes&&filter.activityCodes.length)sumAdd("activityCodes","热门活动 "+filter.activityCodes.length+" 项",function(){update({activityCodes:[]})});if(filter.excludeLowActive)sumAdd("excludeLowActive","剔除低活博主",function(){update({excludeLowActive:false})});if(filter.fansNumUp)sumAdd("fansNumUp","剔除掉粉博主",function(){update({fansNumUp:false})});if(filter.excludedTradeReportBrand)sumAdd("excludedTradeReportBrand","剔除已合作博主",function(){update({excludedTradeReportBrand:false})});if(filter.excludedTradeInviteReportBrand)sumAdd("excludedTradeInviteReportBrand","剔除已邀约博主",function(){update({excludedTradeInviteReportBrand:false})});return o.jsx(x,{sx:{p:3,maxWidth:1180,margin:"0 auto"},children:o.jsxs(x,{children:[o.jsxs(x,{sx:{mb:2},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1.5,mb:.5},children:[o.jsx(x,{sx:{width:28,height:28,borderRadius:1,background:"linear-gradient(135deg,#FF6C40,#FF3030)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"},children:o.jsx(B,{icon:"mdi:account-search",width:18,height:18})}),o.jsx(w,{variant:"h4",fontWeight:"bold",children:"找博主"})]}),o.jsx(w,{variant:"body2",color:"text.secondary",children:"蒲公英博主原生筛选。开发开关开启后显示菜单与路由，关闭时页面不可达。"})]}),!bridgeOk&&o.jsx(oe,{severity:"error",sx:{mb:1.5},children:"当前环境不支持蒲公英找博主（bridge 缺失）"}),restoredNotice&&o.jsx(oe,{severity:"info",sx:{mb:1.5},onClose:function(){setRestoredNotice(false)},children:"已恢复上次筛选（可用「一键清空」清除持久化）"}),o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1.5,flexWrap:"wrap",mb:1},children:[o.jsxs(x,{sx:{display:"inline-flex",alignItems:"center",gap:.25,p:.25,border:"1px solid",borderColor:"divider",borderRadius:999,bgcolor:"action.hover"},children:[o.jsx($,{size:"small",variant:filter.searchType===1?"contained":"text",sx:{borderRadius:999},onClick:function(){update({searchType:1})},children:"搜笔记"}),o.jsx($,{size:"small",variant:filter.searchType===0?"contained":"text",sx:{borderRadius:999},onClick:function(){update({searchType:0})},children:"搜昵称"})]}),o.jsx(ae,{size:"small",value:filter.keyword,placeholder:filter.searchType===1?"按笔记关键词找博主，试试搜":"按博主昵称/小红书号找博主",onChange:function(e){update({keyword:e.target.value})},onKeyDown:function(e){if(e.key==="Enter")runSearch()},sx:{minWidth:320,maxWidth:520,flexGrow:1}}),o.jsx($,{variant:"contained",size:"medium",disabled:status==="loading",onClick:runSearch,startIcon:status==="loading"?o.jsx(de,{size:18,color:"inherit"}):o.jsx(B,{icon:"mdi:account-search",width:18,height:18}),children:status==="loading"?"搜索中...":"搜索"}),o.jsxs(x,{children:[o.jsx($,{size:"small",variant:hasBrands?"contained":"outlined",color:hasBrands?"primary":"inherit",onClick:function(){setBrandPopupMode("recommend")},children:"合作品牌智能推荐"+(hasBrands?"（"+filter.brands.length+"）":"")}),!hasBrands&&o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:.25},children:"请选择您的合作品牌"})]})]}),o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1},children:[o.jsx(w,{variant:"subtitle2",sx:{flexShrink:0},children:"已选条件"}),o.jsx(x,{sx:{flexGrow:1,display:"flex",alignItems:"center",gap:.5,overflowX:"auto",py:.25},children:summary.length===0?o.jsx(w,{variant:"body2",color:"text.secondary",children:"暂无筛选条件"}):summary.map(function(s){return o.jsx(f1,{key:s.key,size:"small",variant:"outlined",label:(pgyKolUnprovenSet()[s.key]?"【待实证】":"")+s.label,onDelete:s.onDelete})})}),o.jsx($,{size:"small",variant:"outlined",color:"error",onClick:clearAll,children:"一键清空"})]}),hasUnprovenSel&&o.jsx(oe,{severity:"info",sx:{mb:1},children:"部分筛选（博主类目/精选博主/人群目标/合作行业等）取值语义尚未经官网最小流量实证，暂不参与查询与采集；实证后将自动启用。"}),o.jsx(PgyKolMatrixSection,{title:"合作目标",children:o.jsxs(x,{children:[o.jsx(PgyKolMatrixRow,{label:"营销目标",children:o.jsx(PgyKolChips,{options:pgyKolMarketOptions,keyOf:function(n){return n.value},selected:filter.marketTarget?[filter.marketTarget]:[],onToggle:function(n){update({marketTarget:filter.marketTarget===n.value?null:n.value})}})}),o.jsx(PgyKolMatrixRow,{label:"人群目标",children:[o.jsx(PgyKolDropdown,{label:"选择人群",options:audGroupCfg&&audGroupCfg.options&&audGroupCfg.options.length?audGroupCfg.options:audGroupCfg&&audGroupCfg.nodes&&audGroupCfg.nodes.length?audGroupCfg.nodes:pgyKolAudienceFallback,selected:filter.audienceGroup?[filter.audienceGroup]:[],onToggle:function(n){toggleSingle("audienceGroup",pgyKolOptValue(n))},disabled:!hasBrands}),!hasBrands&&o.jsx(w,{variant:"caption",color:"text.secondary",children:"未选择合作品牌时不可用"})]})]})}),o.jsx(PgyKolMatrixSection,{title:"匹配度",children:o.jsxs(x,{children:[o.jsx(PgyKolMatrixRow,{label:"博主类目",children:[o.jsx(PgyKolChips,{options:catOptions.map(function(v){return {value:v,label:v}}),keyOf:function(n){return n.value},selected:filter.contentTag.slice(),onToggle:function(n){toggleCategory(n.value)},display:function(n){return n.label}}),o.jsx($,{size:"small",variant:"text",onClick:function(){setShowAllCategory(!showAllCategory)},children:showAllCategory?"收起":"展开"})]}),o.jsx(PgyKolMatrixRow,{label:"博主人设",children:[o.jsx(PgyKolDropdown,{label:"家庭身份",options:pgyKolFamilyOptions,selected:filter.personalTags.slice(),onToggle:function(n){toggleArr("personalTags",n)}}),o.jsx(PgyKolDropdown,{label:"职业身份",options:pgyKolCareerOptions,selected:filter.featureTags.slice(),onToggle:function(n){toggleArr("featureTags",n)}}),o.jsx(PgyKolDropdown,{label:"特色背景",options:pgyKolFeatureOptions,selected:filter.featureTags.slice(),onToggle:function(n){toggleArr("featureTags",n)}})]}),o.jsx(PgyKolMatrixRow,{label:"博主信息",children:[o.jsx(PgyKolChips,{options:pgyKolGenderOptions,keyOf:function(n){return n.value},selected:filter.gender?[filter.gender]:[],onToggle:function(n){toggleWithNone("gender",n.value)}}),o.jsx(PgyKolTreePopup,{label:"地域",cfg:areasCfg,selectedKeys:areasSel,onToggle:function(n){areasToggle(n)},closeOnSelect:true,count:filter.location?1:0}),o.jsxs(x,{children:[o.jsx($,{size:"small",variant:filter.audience20.length>0?"contained":"outlined",color:filter.audience20.length>0?"primary":"inherit",onClick:function(){setAud20Open(true)},children:"二十大人群"+(filter.audience20.length>0?"（"+filter.audience20.length+"）":"")}),o.jsxs(ue,{open:aud20Open,onClose:function(){setAud20Open(false)},maxWidth:"sm",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"二十大人群"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:function(){setAud20Open(false)},children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:audCfg&&!audCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{leafOnly:true,nodes:audCfg.nodes||[],selected:filter.audience20.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("audience20",n)},display:function(n){return n.fullPath||n.label||String(n.value)}}),filter.audience20.length>0&&o.jsxs(x,{sx:{mt:1,display:"flex",flexWrap:"wrap",gap:.5},children:[filter.audience20.map(function(n){return o.jsx(f1,{key:pgyKolNodeKey(n),size:"small",label:n.fullPath||n.label,onDelete:function(){toggleArr("audience20",n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+filter.audience20.length+" 项"})]})]}):audCfg&&audCfg.error?o.jsx(oe,{severity:"error",children:"加载失败（错误码 "+(audCfg.error.code||"unknown")+"）："+(audCfg.error.message||"未知错误")}):o.jsx(de,{size:24})})]})]}),o.jsx(PgyKolTreePopup,{label:"行业特色画像",cfg:autoCfg,selectedKeys:filter.automotive.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("automotive",n)},count:filter.automotive.length,hint:filter.automotive.length>0?"选中父节点时展开叶子 ID："+autoLeaves.join("、"):null}),o.jsx(PgyKolTreePopup,{label:"预估消费行为",cfg:consumeCfg,selectedKeys:filter.consumeBehavior.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("consumeBehavior",n)},count:filter.consumeBehavior.length}),o.jsx(PgyKolChips,{options:pgyKolSignedOptions,keyOf:function(n){return n.value},selected:filter.signed?[filter.signed]:[],onToggle:function(n){toggleWithNone("signed",n.value)}}),o.jsx(PgyKolChips,{options:pgyKolSceneOptions,keyOf:function(n){return n.value},selected:filter.contentSceneLabel.slice(),onToggle:function(n){toggleArr("contentSceneLabel",n)}}),o.jsx(PgyKolTreePopup,{label:"内容题材",cfg:themeCfg,selectedKeys:filter.contentTheme.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("contentTheme",n)},count:filter.contentTheme.length})]}),o.jsx(PgyKolMatrixRow,{label:"粉丝画像",children:[o.jsx(PgyKolChips,{options:pgyKolFansPresets,keyOf:function(n){return n.label},selected:pgyKolFansPresets.filter(function(p){return pgyKolPresetActive(p,filter)}).map(function(p){return p.label}),onToggle:togglePreset}),o.jsx(ae,{size:"small",type:"number",label:"粉丝数下限",value:filter.fansNumberLower,onChange:function(e){update({fansNumberLower:e.target.value})},sx:{maxWidth:140}}),o.jsx(ae,{size:"small",type:"number",label:"粉丝数上限",value:filter.fansNumberUpper,onChange:function(e){update({fansNumberUpper:e.target.value})},sx:{maxWidth:140}}),o.jsx(PgyKolChips,{options:pgyKolFansAgeOptions,keyOf:function(n){return n.value},selected:filter.fansAge?[filter.fansAge]:[],onToggle:function(n){toggleSingle("fansAge",n.value)}}),o.jsx(PgyKolChips,{options:pgyKolFansGenderOptions,keyOf:function(n){return n.value},selected:filter.fansGender?[filter.fansGender]:[],onToggle:function(n){toggleWithNone("fansGender",n.value)}}),o.jsx(PgyKolTreePopup,{label:"粉丝地域",cfg:areasCfg,selectedKeys:fansLocSel,onToggle:function(n){fansLocToggle(n)},closeOnSelect:true,count:filter.fansLocation?1:0}),o.jsx(PgyKolChips,{options:pgyKolMaritalOptions,keyOf:function(n){return n.value},selected:filter.fansMaritalStatus?[filter.fansMaritalStatus]:[],onToggle:function(n){toggleWithNone("fansMaritalStatus",n.value)}}),o.jsx(PgyKolChips,{options:pgyKolConsumptionOptions,keyOf:function(n){return n.value},selected:filter.fansConsumptionLevel?[filter.fansConsumptionLevel]:[],onToggle:function(n){toggleWithNone("fansConsumptionLevel",n.value)}}),o.jsx(PgyKolChips,{options:pgyKolChildAgeOptions,keyOf:function(n){return n.value},selected:filter.fansChildAgeInfo.slice(),onToggle:function(n){toggleArr("fansChildAgeInfo",n)}}),o.jsx(PgyKolChips,{options:pgyKolDevicePriceOptions,keyOf:function(n){return n.value},selected:filter.fansDevicePrice.slice(),onToggle:function(n){toggleArr("fansDevicePrice",n)}}),o.jsx(PgyKolChips,{options:pgyKolDeviceBrandOptions,keyOf:function(n){return n.value},selected:filter.fansDeviceBrand.slice(),onToggle:function(n){toggleArr("fansDeviceBrand",n)}})]}),o.jsx(PgyKolMatrixRow,{label:"笔记类目",children:[pgyKolNoteCategoryIndustries.map(function(ind){return o.jsx($,{key:ind.value,size:"small",variant:filter.industryTag.length>0?"contained":"outlined",color:filter.industryTag.length>0?"primary":"inherit",onClick:function(){openNoteCategory(ind.value)},children:ind.value})}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"已选 "+filter.industryTag.length+" 项"})]})]})}),o.jsx(PgyKolMatrixSection,{title:"数据表现",children:o.jsxs(x,{children:[o.jsx(PgyKolMatrixRow,{label:"日常笔记",children:[o.jsx(PgyKolField,{label:"曝光中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.accumCommonImpMedinNum30d?[filter.accumCommonImpMedinNum30d]:[],onToggle:function(n){toggleSingle("accumCommonImpMedinNum30d",n.value)}})}),o.jsx(PgyKolField,{label:"阅读中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.readMidNor30?[filter.readMidNor30]:[],onToggle:function(n){toggleSingle("readMidNor30",n.value)}})}),o.jsx(PgyKolField,{label:"互动中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.interMidNor30?[filter.interMidNor30]:[],onToggle:function(n){toggleSingle("interMidNor30",n.value)}})}),o.jsx(PgyKolField,{label:"千赞笔记比例",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.thousandLikePercent30?[filter.thousandLikePercent30]:[],onToggle:function(n){toggleSingle("thousandLikePercent30",n.value)}})}),o.jsx(PgyKolField,{label:"笔记类型",children:o.jsx(PgyKolChips,{options:pgyKolNoteTypeOptions,keyOf:function(n){return n.value},selected:filter.noteType?[filter.noteType]:[],onToggle:function(n){toggleWithNone("noteType",n.value)}})})]}),o.jsx(PgyKolMatrixRow,{label:"合作笔记",children:[o.jsx(PgyKolField,{label:"图文报价",children:[o.jsx(ae,{size:"small",type:"number",placeholder:"下限",value:filter.notePriceLower,onChange:function(e){update({notePriceLower:e.target.value})},sx:{maxWidth:110}}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"～"}),o.jsx(ae,{size:"small",type:"number",placeholder:"上限",value:filter.notePriceUpper,onChange:function(e){update({notePriceUpper:e.target.value})},sx:{maxWidth:110}})]}),o.jsx(PgyKolField,{label:"视频报价",children:[o.jsx(ae,{size:"small",type:"number",placeholder:"下限",value:filter.videoPriceLower,onChange:function(e){update({videoPriceLower:e.target.value})},sx:{maxWidth:110}}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"～"}),o.jsx(ae,{size:"small",type:"number",placeholder:"上限",value:filter.videoPriceUpper,onChange:function(e){update({videoPriceUpper:e.target.value})},sx:{maxWidth:110}})]}),o.jsx(PgyKolField,{label:"合作信用度",children:o.jsx(PgyKolChips,{options:pgyKolCreditOptions,keyOf:function(n){return n.value},selected:filter.coopCredit?[filter.coopCredit]:[],onToggle:function(n){toggleSingle("coopCredit",n.value)}})}),o.jsx(PgyKolField,{label:"合作订单数",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 订单数",value:filter.progressOrderCnt,onChange:function(e){update({progressOrderCnt:e.target.value})},sx:{maxWidth:120}})}),o.jsx(PgyKolField,{label:"近期合作行业",children:[o.jsx(PgyKolDropdown,{label:"一级行业",options:pgyKolFirstIndustryOptions,selected:filter.firstIndustry?[filter.firstIndustry]:[],onToggle:function(n){var v=pgyKolOptValue(n);update({firstIndustry:filter.firstIndustry===v?null:v,secondIndustry:null})}}),o.jsx(PgyKolDropdown,{label:"二级行业",options:pgyKolSecondIndustryOptions,selected:filter.secondIndustry?[filter.secondIndustry]:[],onToggle:function(n){toggleSingle("secondIndustry",pgyKolOptValue(n))}})]}),o.jsx(PgyKolField,{label:"近期合作品牌",children:o.jsx($,{size:"small",variant:filter.tradeReportBrandIdSet.length>0?"contained":"outlined",color:filter.tradeReportBrandIdSet.length>0?"primary":"inherit",onClick:function(){setBrandPopupMode("recent")},children:"选择品牌"+(filter.tradeReportBrandIdSet.length>0?"（"+filter.tradeReportBrandIdSet.length+"）":"")})}),o.jsx(PgyKolField,{label:"传播规模",children:o.jsx(PgyKolChips,{options:pgyKolPropagationOptions,keyOf:function(n){return n.value},selected:filter.propagationScale?[filter.propagationScale]:[],onToggle:function(n){toggleSingle("propagationScale",n.value)}})}),o.jsx(PgyKolField,{label:"预估CPM",children:[o.jsx(ae,{size:"small",type:"number",placeholder:"下限",value:filter.estimateCpuv30dLower,onChange:function(e){update({estimateCpuv30dLower:e.target.value})},sx:{maxWidth:110}}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"～"}),o.jsx(ae,{size:"small",type:"number",placeholder:"上限",value:filter.estimateCpuv30dUpper,onChange:function(e){update({estimateCpuv30dUpper:e.target.value})},sx:{maxWidth:110}})]}),o.jsx(PgyKolField,{label:"阅读单价",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 元",value:filter.estimateReadCost,onChange:function(e){update({estimateReadCost:e.target.value})},sx:{maxWidth:110}})}),o.jsx(PgyKolField,{label:"互动单价",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 元",value:filter.estimateInteractCost,onChange:function(e){update({estimateInteractCost:e.target.value})},sx:{maxWidth:110}})}),o.jsx(PgyKolField,{label:"外溢进店单价",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 元",value:filter.overflowCost,onChange:function(e){update({overflowCost:e.target.value})},sx:{maxWidth:110}})})]}),o.jsx(PgyKolMatrixRow,{label:"直播数据",children:[o.jsx(PgyKolField,{label:"近30天直播场次",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 场",value:filter.liveCount30d,onChange:function(e){update({liveCount30d:e.target.value})},sx:{maxWidth:120}})}),o.jsx(PgyKolField,{label:"场均观播人数",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 人",value:filter.avgLiveViewer,onChange:function(e){update({avgLiveViewer:e.target.value})},sx:{maxWidth:120}})}),o.jsx(PgyKolField,{label:"场均销售额",children:o.jsx(ae,{size:"small",type:"number",placeholder:"≥ 元",value:filter.avgLiveGmv,onChange:function(e){update({avgLiveGmv:e.target.value})},sx:{maxWidth:120}})})]})]})}),o.jsx(PgyKolMatrixSection,{title:"平台推荐",children:o.jsxs(x,{children:[o.jsx(PgyKolMatrixRow,{label:"精选博主",children:o.jsx(PgyKolChips,{options:pgyKolFeaturedOptions,keyOf:function(n){return n.value},selected:pgyKolFeaturedOptions.filter(function(n){return filter[n.key]===true}).map(function(n){return n.value}),onToggle:function(n){toggleBool(n.key)}})}),o.jsx(PgyKolMatrixRow,{label:"热门活动",children:[actCfg&&actCfg.error&&o.jsx(oe,{severity:"warning",sx:{py:.25,my:0},children:"热门活动加载失败，不影响其它筛选："+(actCfg.error.message||"未知错误")}),o.jsx(PgyKolChips,{options:actCfg&&actCfg.nodes&&actCfg.nodes.length?actCfg.nodes:actCfg&&actCfg.options&&actCfg.options.length?actCfg.options:[],keyOf:function(n){return pgyKolOptValue(n)},selected:filter.activityCodes.slice(),onToggle:toggleActivity})]})]})}),o.jsx(PgyKolMatrixSection,{title:"常规剔除",children:o.jsx(PgyKolMatrixRow,{label:null,children:[o.jsx(PgyKolToggle,{label:"剔除低活博主",on:filter.excludeLowActive,onToggle:function(){toggleBool("excludeLowActive")}}),o.jsx(PgyKolToggle,{label:"剔除掉粉博主",on:filter.fansNumUp,onToggle:function(){toggleBool("fansNumUp")}}),o.jsx(PgyKolToggle,{label:"剔除已合作博主",on:filter.excludedTradeReportBrand,disabled:!hasBrands,onToggle:function(){toggleBool("excludedTradeReportBrand")}}),o.jsx(PgyKolToggle,{label:"剔除已邀约博主",on:filter.excludedTradeInviteReportBrand,disabled:!hasBrands,onToggle:function(){toggleBool("excludedTradeInviteReportBrand")}})]})}),o.jsxs(xe,{variant:"outlined",sx:{mb:1.5},children:[o.jsxs(We,{children:[o.jsx(w,{variant:"subtitle2",fontWeight:600,sx:{mb:.5},children:"当前 Payload 预览"}),o.jsx(x,{component:"pre",sx:{maxHeight:160,overflow:"auto",p:1,bgcolor:"background.paper",borderRadius:1,fontSize:11,fontFamily:"monospace",whiteSpace:"pre-wrap",wordBreak:"break-all"},children:preview||"（未配置筛选条件）"})]})]}),o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1.5,mb:1,flexWrap:"wrap"},children:[o.jsx($,{variant:"contained",color:"secondary",size:"medium",onClick:startBatch,disabled:batchBusy||batchRunning,startIcon:batchBusy?o.jsx(de,{size:18,color:"inherit"}):null,children:batchBusy?"启动中...":"开始采集"}),o.jsx($,{variant:"outlined",size:"medium",onClick:function(){setColumnOpen(true)},children:"选择展示指标"}),status==="empty"&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"没有匹配的博主"})]}),batchError&&o.jsx(oe,{severity:"error",sx:{mt:1},children:pgyKolBatchErrorMessage(batchError)}),batchNotice&&o.jsx(oe,{severity:"success",sx:{mt:1},children:batchNotice}),status==="loading"&&o.jsx(Q1,{sx:{mt:1}}),status==="auth-expired"&&o.jsx(oe,{severity:"error",sx:{mt:1},children:"蒲公英登录已失效，请重新授权"}),status==="error"&&error&&o.jsx(oe,{severity:"error",sx:{mt:1},children:"查询失败（错误码 "+(error.code||"unknown")+"）："+(error.message||"未知错误")}),result&&o.jsxs(x,{sx:{mt:2},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"h6",children:"共 "+(result.total!=null?result.total:"?")+" 位博主"}),o.jsx(f1,{size:"small",label:"当前展示 "+(result.kols?result.kols.length:0)+" 条"}),o.jsx(f1,{size:"small",variant:"outlined",label:"预览 "+(result.kols?result.kols.length:0)+" 条 / 已持久化 "+pgyKolCount(currentTask,"raw")+" 条（完整数据以导出为准）"}),result.capSignal&&result.capSignal.capped&&o.jsx(f1,{size:"small",color:"warning",label:"结果可能超过 5000"}),result.quarantinedFields&&result.quarantinedFields.length>0&&o.jsx(f1,{size:"small",variant:"outlined",label:"未知字段 "+result.quarantinedFields.length+" 个已隔离"})]}),result.capSignal&&result.capSignal.capped&&o.jsx(oe,{severity:"warning",sx:{mb:1},children:"结果可能超过 5000，完整性未证明"}),o.jsx(PgyKolResultTable,{result:result,columns:selectedColumns,list:columnList})]}),o.jsx(PgyKolBatchPanel,{task:currentTask,onPause:pauseBatch,onResume:resumeBatch,onResumeWithBudgets:function(budgets){resumeBatch(budgets)},onCancel:cancelBatch,onExport:function(){exportTask(currentTaskId)}}),taskLoading&&o.jsx(Q1,{sx:{mt:1}}),o.jsx(PgyKolTaskHistory,{tasks:taskList,error:taskListError,onSelect:selectTask,onExport:exportTask}),o.jsx(PgyKolColumnDialog,{open:columnOpen,onClose:function(){setColumnOpen(false)},columns:columnList,error:columnError,selected:selectedColumns,onApply:function(ids){setSelectedColumns(ids);pgyKolWriteJson("magiorix-pgy-kol-columns",ids)}}),o.jsx(PgyKolBrandPopup,{open:brandPopupMode!=null,onClose:function(){setBrandPopupMode(null)},mode:brandPopupMode,current:brandPopupMode==="recent"?filter.tradeReportBrandIdSet:filter.brands,onApply:applyBrands}),o.jsx(PgyKolNoteCategoryPopup,{open:categoryOpen,onClose:function(){setCategoryOpen(false)},industry:catIndustry,onSelectIndustry:setCatIndustry,selected:filter.industryTag,onToggle:function(n){toggleArr("industryTag",n)}})]})})}`;
const pgyKolStoreFrom = "setMenus:t=>e({menus:t})";
const pgyKolStoreTo = "setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})";
const pgyKolRouteFrom = '"../pages/dashboard/index.tsx":()=>G(()=>Promise.resolve().then(()=>W5),void 0,import.meta.url),';
const pgyKolRouteTo = pgyKolRouteFrom + '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>({default:PgyKolSearchPage})),void 0,import.meta.url),';
const pgyKolRouteMarker = '"../pages/pgy-kol-search/index.tsx":()=>G(';

// ===========================================================================
// Phase 5.1：在 Phase 5 注入块之上应用官网实证转换（from/to pairs + helpers）。
// 单一权威来源：payloadProven 只由后端 Schema 维护，前端通过 schema-fields IPC
// 读取；本转换删除前端手写 unproven 副本并启用 2026-08-07 实证字段。
// pairs 由 scripts/build-pgy-kol-phase51-pairs.js 生成（含精确旧串，防漂移）。
// ===========================================================================
const pgyKolPhase51Patch = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "scripts", "pgy-kol-phase51-pairs.json"), "utf8"),
);
const pgyKolSearchPageSource51 = (() => {
  let source = pgyKolSearchPageSource;
  for (const item of pgyKolPhase51Patch.pairs) {
    if (!source.includes(item.from)) {
      throw new Error(`Missing pgy-kol Phase 5.1 patch target: ${item.label}`);
    }
    if (source.indexOf(item.from) !== source.lastIndexOf(item.from)) {
      throw new Error(`Ambiguous pgy-kol Phase 5.1 patch target (multiple matches): ${item.label}`);
    }
    source = source.replace(item.from, item.to);
  }
  // 追加 helpers（覆盖旧的 PgyKolUnprovenSet / PgyKolNoteCategoryPopup 实现）。
  source = `${source}\n${pgyKolPhase51Patch.helpers}`;
  return source;
})();

const pgyKolPhase4Marker = "function PgyKolBatchPanel";
// Phase 4 内容级幂等守卫：以源码 SHA-1 对比 bundle 内已注入块，内容漂移时
// 必然重建（修复“标记存在但函数体已更新导致产物陈旧”的问题）；内容一致时
// 跳过（保持幂等）。全新 bundle 没有旧块时直接注入（Phase 1 路径）。
const normalizeSource = (source) => String(source).replace(/\r\n/g, "\n");
const sourceSha1 = crypto
  .createHash("sha1")
  .update(normalizeSource(pgyKolSearchPageSource51))
  .digest("hex");
const bundleBefore = fs.readFileSync(mainBundle, "utf8");
const oldStart = bundleBefore.indexOf("V1=new Map;function pgyKolDevEnabled");
const oldEnd = oldStart >= 0 ? bundleBefore.indexOf("function si(e){", oldStart) : -1;
const existingBlock =
  oldStart >= 0 && oldEnd > oldStart
    ? bundleBefore.slice(oldStart + "V1=new Map;".length, oldEnd)
    : null;
const existingSha1 =
  existingBlock === null
    ? null
    // 注入块末尾带一个分隔换行（"\r\nfunction si(e){" 前），哈希前剔除，
    // 使“内容一致时跳过”的幂等比较真正成立（fresh reviewer M1）。
    : crypto
        .createHash("sha1")
        .update(normalizeSource(existingBlock).replace(/\n$/, ""))
        .digest("hex");
if (existingSha1 !== sourceSha1) {
  if (existingBlock !== null) {
    replaceOnce(
      mainBundle,
      bundleBefore.slice(oldStart, oldEnd),
      "V1=new Map;",
      "remove stale pgy-kol page source before refresh",
    );
  }
  replaceOnce(
    mainBundle,
    "V1=new Map;function si(e){",
    "V1=new Map;" + pgyKolSearchPageSource51.replace(/\n/g, "\r\n") + "\r\nfunction si(e){",
    "inject or refresh pgy-kol Phase 4 search page component after the lazy route table",
  );
}
if (!fs.readFileSync(mainBundle, "utf8").includes(pgyKolRouteMarker)) {
  replaceOnce(mainBundle, pgyKolRouteFrom, pgyKolRouteTo, "register pgy-kol search lazy route");
}
if (!fs.readFileSync(mainBundle, "utf8").includes(pgyKolStoreTo)) {
  replaceOnce(mainBundle, pgyKolStoreFrom, pgyKolStoreTo, "merge dev-gated local pgy-kol menu into user menus");
}

// 统一 mainBundle 行尾为 CRLF（Windows 构建产物惯例），避免混合 EOL 导致
// integrity-manifest 哈希在 fresh checkout（autocrlf）下不可复现；幂等：重复运行结果一致。
const normalizedMainBundle = fs
  .readFileSync(mainBundle, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\n/g, "\r\n");
fs.writeFileSync(mainBundle, normalizedMainBundle);

console.log("Applied magiorix frontend patches.");
