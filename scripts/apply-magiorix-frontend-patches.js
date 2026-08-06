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
function pgyKolWithLocalMenu(e){if(!pgyKolDevEnabled()||!Array.isArray(e))return e;for(var i=0;i<e.length;i++){if(e[i]&&e[i].path==="/pgy-kol-search")return e}return e.concat([{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"solar:magnifer-bold-duotone"}])}
function pgyKolNodeKey(n){if(n&&n.uniqueKey)return n.uniqueKey;var v=n&&n.value!==undefined?String(n.value):"",p=n&&n.fullPath?n.fullPath:n&&n.label||"";return v+":"+p}
function pgyKolFlattenLeaves(n,out){out=out||[];if(!n)return out;if(n.children&&n.children.length>0){for(var i=0;i<n.children.length;i++)pgyKolFlattenLeaves(n.children[i],out);return out}out.push(n.value||n.label||n);return out}
function pgyKolToFilterState(f){var out={};if(f.gender)out.gender=f.gender;if(f.location)out.location=[f.location];if(f.fansNumberLower!==""){var lo=Number(f.fansNumberLower);if(Number.isFinite(lo)&&Number.isInteger(lo)&&lo>0)out.fansNumberLower=lo}if(f.fansNumberUpper!==""){var hi=Number(f.fansNumberUpper);if(Number.isFinite(hi)&&Number.isInteger(hi)&&hi>0)out.fansNumberUpper=hi}if(f.automotive&&f.automotive.length)out.industrySpecificCrowdsMotorDom=f.automotive;if(f.audience20&&f.audience20.length)out.top20CrowdsLabel=f.audience20;if(f.contentTheme&&f.contentTheme.length)out.contentThemeLabel=f.contentTheme;if(f.consumeBehavior&&f.consumeBehavior.length)out.kolInfoConsumBehaviorLabel=f.consumeBehavior;return out}
function PgyKolTreeNode(p){var node=p.node,level=p.level||0,selected=p.selected||[],onToggle=p.onToggle,leafOnly=p.leafOnly||false,display=p.display||function(n){return n.fullPath||n.label||String(n.value)},has=node.children&&node.children.length>0,openState=m.useState(level===0),open=openState[0],setOpen=openState[1],key=pgyKolNodeKey(node),isSel=selected.indexOf(key)>-1,parentOnly=leafOnly&&has;return o.jsxs(x,{sx:{pl:level*1.5},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",minHeight:30,gap:.25},children:[has?o.jsx(te,{size:"small",sx:{p:.25},onClick:function(e){e.stopPropagation(),setOpen(!open)},children:o.jsx(B,{icon:open?"solar:alt-arrow-up-bold-duotone":"solar:alt-arrow-down-bold-duotone",width:14,height:14})}):o.jsx(x,{sx:{width:24}}),parentOnly?o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)}):o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:.75,flex:1,cursor:"pointer",py:.5},onClick:function(){onToggle(node)},children:[o.jsx(x,{sx:{width:16,height:16,borderRadius:2,border:"1px solid",borderColor:isSel?"primary.main":"divider",bgcolor:isSel?"primary.main":"transparent",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0},children:isSel?"✓":null}),o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)})]})]}),open&&has&&node.children.map(function(c){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(c),node:c,level:level+1,selected:selected,onToggle:onToggle,display:display,leafOnly:leafOnly})})]})}
function PgyKolTree(p){return o.jsx(x,{sx:{display:"flex",flexDirection:"column"},children:p.nodes.map(function(n){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(n),node:n,level:0,selected:p.selected,onToggle:p.onToggle,display:p.display,leafOnly:p.leafOnly})})})}
function PgyKolChips(p){var keyOf=p.keyOf||pgyKolNodeKey;return o.jsx(x,{sx:{display:"flex",flexWrap:"wrap",gap:1},children:p.options.map(function(n){var key=keyOf(n),sel=p.selected.indexOf(key)>-1;return o.jsx(f1,{key:key,size:"small",label:p.display?p.display(n):n.label||n.fullPath||String(n.value),color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){p.onToggle(n)}})})})}
function PgyKolSection(p){return o.jsxs(xe,{variant:"outlined",sx:{mb:2},children:[o.jsxs(We,{children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:p.title}),p.badge?o.jsx(f1,{size:"small",variant:"outlined",label:p.badge,color:p.badge==="live"?"success":"warning"}):null]}),p.warning?o.jsx(oe,{severity:"warning",sx:{mb:1},children:p.warning}):null,p.error?o.jsx(oe,{severity:"error",sx:{mb:1},children:p.error}):null,p.children]})]})}
function PgyKolCard(p){var k=p.kol||{},rows=[["昵称",k.nickname],["ID",k.userId],["粉丝数",k.fansNum],["地域",k.location],["性别",k.gender],["近30天阅读中位数",k.readMidNor30],["近30天互动中位数",k.interMidNor30],["图文报价",k.picturePrice],["视频报价",k.videoPrice],["活跃粉丝等级",k.fansActiveIn28dLv]];return o.jsxs(xe,{variant:"outlined",sx:{height:"100%",p:1.5},children:[o.jsx(w,{variant:"subtitle2",noWrap:true,children:k.nickname||"-"}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",fontFamily:"monospace",wordBreak:"break-all"},children:k.userId||"-"}),rows.slice(2).filter(function(r){return r[1]!==undefined&&r[1]!==null&&r[1]!==""}).map(function(r){return o.jsxs(x,{key:r[0],sx:{display:"flex",justifyContent:"space-between",gap:1,mt:.5},children:[o.jsx(w,{variant:"caption",color:"text.secondary",children:r[0]}),o.jsx(w,{variant:"caption",sx:{textAlign:"right"},children:String(r[1])})]})})]})}
function pgyKolStatusText(s){if(s==="running")return "采集中";if(s==="paused")return "已暂停";if(s==="auth-expired")return "登录已失效";if(s==="risk-control")return "触发风控";if(s==="cancelled")return "已取消";if(s==="failed")return "采集失败";if(s==="incomplete")return "采集未完整";if(s==="completed")return "已完成";return s||"未知状态"}
function pgyKolCompletenessText(t){if(!t)return "";if(t.completeness==="complete")return "完整性已证明";if(t.completeness==="cannot-prove")return "完整性无法证明（原因："+(t.summary&&t.summary.stopReason||t.warning||"无法证明")+"）";return "完整性未证明"}
function pgyKolResumePlan(t){if(!t)return null;var reason=t.summary&&t.summary.stopReason,cur=t.budgets||{},used=Number.isFinite(t.budgetUsed)?t.budgetUsed:0;if(t.status==="incomplete"){if(reason==="budget-exhausted"){var curB=Number.isInteger(cur.queryBudget)?cur.queryBudget:400,min=Math.max(curB,used)+1;if(min>1000)return {kind:"blocked",reasonText:"已消费请求数已达预算上限（1000），无法继续增加预算"};return {kind:"budget",label:"查询预算",current:curB,used:used,min:min,max:1000,reasonText:"查询预算已耗尽，请输入更大的总预算后从原检查点继续"}}if(reason==="max-pages-reached"){var curM=Number.isInteger(cur.maxPagesPerLeaf)?cur.maxPagesPerLeaf:250;if(curM>=250)return {kind:"blocked",reasonText:"已到官方安全页数上限（250 页），无法继续同一查询"};return {kind:"maxPages",label:"单叶子最大页数",current:curM,used:used,min:curM+1,max:250,reasonText:"已达单叶子最大页数，请输入更大的页数预算后从原检查点继续"}}if(reason==="repeat-page")return {kind:"blocked",reasonText:"检测到连续重复页，分页可能复读，继续无法证明完整"};if(reason==="capped-unprovable")return {kind:"blocked",reasonText:"无安全切分维度，继续会重复抓取且无法证明完整"};if(reason==="checkpoint-desync")return {kind:"blocked",reasonText:"检查点与行数据不一致，禁止继续"};return {kind:"blocked",reasonText:"该任务无法安全继续，可导出已有数据"}}if(t.status==="completed"&&t.completeness!=="complete")return {kind:"blocked",reasonText:"该任务已完成但完整性未证明（旧版任务），无法继续，可导出已有数据"};return null}
function pgyKolBatchErrorMessage(e){if(!e)return "";if(e.code==="auth-expired")return "蒲公英登录已失效，请重新授权";if(e.code==="risk-control")return "触发风控，采集已停止";if(e.code==="failed"||e.kind==="failed")return "采集失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误");return "任务操作失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误")}
function pgyKolCount(t,k){return t&&t.counts&&t.counts[k]!=null?t.counts[k]:0}
function pgyKolPagesDone(t){if(!t||!Array.isArray(t.leaves))return 0;var n=0;for(var i=0;i<t.leaves.length;i++){var l=t.leaves[i];if(l&&Array.isArray(l.pagesCompleted))n+=l.pagesCompleted.length}return n}
function pgyKolAnyCapped(t){if(!t)return false;if(t.capSignal&&t.capSignal.capped)return true;if(Array.isArray(t.leaves)){for(var i=0;i<t.leaves.length;i++){if(t.leaves[i]&&t.leaves[i].capSignal&&t.leaves[i].capSignal.capped)return true}}return false}
function PgyKolColumnPicker(p){if(p.error)return o.jsx(oe,{severity:"error",children:"字段加载失败（错误码 "+(p.error.code||"unknown")+"）："+(p.error.message||"未知错误")});if(!p.columns||p.columns.length===0)return o.jsx(w,{variant:"body2",color:"text.secondary",children:"字段列表加载中..."});return o.jsxs(x,{children:[o.jsxs(x,{sx:{display:"flex",flexWrap:"wrap",gap:.5},children:p.columns.map(function(c){var sel=p.selected.indexOf(c.id)>-1;return o.jsx(f1,{key:c.id,size:"small",label:c.label,color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){p.onToggle(c.id)}})})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:1},children:"已选 "+p.selected.length+" 个字段，随任务提交用于采集与导出"})]})}
function PgyKolBatchPanel(p){var bv=m.useState(""),budgetInput=bv[0],setBudgetInput=bv[1];var t=p.task;if(!t)return null;var counts=t.counts||{},statusText=pgyKolStatusText(t.status),completenessText=pgyKolCompletenessText(t),pages=pgyKolPagesDone(t),capped=pgyKolAnyCapped(t),subCount=t.summary&&t.summary.subqueryCount!=null?t.summary.subqueryCount:0,resumePlan=pgyKolResumePlan(t),resumeEligible=resumePlan&&(resumePlan.kind==="budget"||resumePlan.kind==="maxPages"),parsedInput=budgetInput.trim()===""?NaN:Number(budgetInput),inputValid=resumeEligible&&Number.isInteger(parsedInput)&&parsedInput>=resumePlan.min&&parsedInput<=resumePlan.max,legacyUnproven=t.status==="completed"&&t.completeness!=="complete",incompleteShown=t.status==="incomplete"||legacyUnproven;return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"任务进度"}),o.jsx(f1,{size:"small",color:t.status==="completed"&&t.completeness==="complete"?"success":incompleteShown?"warning":t.status==="failed"||t.status==="risk-control"?"error":t.status==="running"?"info":"default",label:incompleteShown?"采集未完整/需要处理":statusText}),capped&&o.jsx(f1,{size:"small",color:"warning",label:"结果可能超过 5000"})]}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mb:1,fontFamily:"monospace",wordBreak:"break-all"},children:"任务 ID："+t.taskId}),incompleteShown&&o.jsx(oe,{severity:"warning",sx:{mb:1},children:"采集未完整/需要处理："+(resumePlan&&resumePlan.reasonText||completenessText)}),!incompleteShown&&o.jsx(oe,{severity:completenessText.indexOf("无法证明")>=0?"warning":"success",sx:{mb:1},children:completenessText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(f1,{size:"small",variant:"outlined",label:"原始条数 "+(counts.raw!=null?counts.raw:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"唯一博主数 "+(counts.unique!=null?counts.unique:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"重复数 "+(counts.dup!=null?counts.dup:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"缺UID异常数 "+(counts.missingUid!=null?counts.missingUid:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"已抓页数 "+pages}),o.jsx(f1,{size:"small",variant:"outlined",label:"子查询数 "+subCount})]}),resumeEligible&&o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(w,{variant:"body2",color:"text.secondary",children:"当前"+resumePlan.label+"："+resumePlan.current+"；已消费请求数："+resumePlan.used+"；允许新值："+resumePlan.min+"～"+resumePlan.max}),o.jsx(ae,{size:"small",type:"number",value:budgetInput,onChange:function(e){setBudgetInput(e.target.value)},placeholder:"请输入新"+resumePlan.label,sx:{maxWidth:180}}),o.jsx($,{size:"small",variant:"contained",disabled:!inputValid,onClick:function(){var nb={};if(resumePlan.kind==="budget"){nb.queryBudget=parsedInput}else{nb.maxPagesPerLeaf=parsedInput}p.onResumeWithBudgets(nb)},children:resumePlan.kind==="maxPages"?"增加页数并继续":"增加预算并继续"})]}),resumePlan&&resumePlan.kind==="blocked"&&o.jsx(w,{variant:"body2",color:"text.secondary",sx:{display:"block",mb:1},children:resumePlan.reasonText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap"},children:[t.status==="running"&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onPause,children:"暂停"}),(t.status==="paused"||t.status==="auth-expired"||t.status==="interrupted"||t.status==="failed")&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onResume,children:"继续"}),(t.status==="cancelled"||t.status==="failed"||t.status==="completed"||t.status==="incomplete")?null:o.jsx($,{size:"small",variant:"outlined",color:"error",onClick:p.onCancel,children:"取消"}),o.jsx($,{size:"small",variant:"outlined",onClick:p.onExport,children:"导出"})]})]})]})}
function PgyKolTaskHistory(p){return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,sx:{mb:1},children:"任务历史"}),p.error&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"任务历史加载失败（错误码 "+(p.error.code||"unknown")+"）："+(p.error.message||"未知错误")}),!p.error&&(!p.tasks||p.tasks.length===0)&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"暂无采集任务"}),p.tasks&&p.tasks.map(function(t){var c=t.counts||{};return o.jsxs(x,{key:t.taskId,sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"body2",sx:{fontFamily:"monospace",wordBreak:"break-all"},children:t.taskId}),o.jsx(f1,{size:"small",variant:"outlined",color:t.status==="completed"&&t.completeness==="complete"?"success":t.status==="incomplete"?"warning":"default",label:t.status==="incomplete"?"采集未完整":pgyKolStatusText(t.status)}),o.jsx(f1,{size:"small",variant:"outlined",label:t.completeness==="complete"?"完整性已证明":"完整性未证明"}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"原始 "+(c.raw!=null?c.raw:0)+" / 唯一 "+(c.unique!=null?c.unique:0)+" / 重复 "+(c.dup!=null?c.dup:0)+" / 缺UID "+(c.missingUid!=null?c.missingUid:0)}),o.jsx(w,{variant:"caption",color:"text.secondary",children:t.updatedAt||""}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onSelect(t.taskId)},children:"查看"}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onExport(t.taskId)},children:"导出"})]})})]})]})}
function PgyKolSearchPage(){var st=m.useState("idle"),status=st[0],setStatus=st[1],er=m.useState(null),error=er[0],setError=er[1],cf=m.useState({}),configs=cf[0],setConfigs=cf[1],fs0=m.useState({gender:null,location:null,fansNumberLower:"",fansNumberUpper:"",automotive:[],audience20:[],contentTheme:[],consumeBehavior:[]}),filter=fs0[0],setFilter=fs0[1],pv=m.useState(""),preview=pv[0],setPreview=pv[1],rs=m.useState(null),result=rs[0],setResult=rs[1],cl=m.useState(null),columnList=cl[0],setColumnList=cl[1],ce2=m.useState(null),columnError=ce2[0],setColumnError=ce2[1],sc2=m.useState([]),selectedColumns=sc2[0],setSelectedColumns=sc2[1],tid2=m.useState(null),currentTaskId=tid2[0],setCurrentTaskId=tid2[1],ct2=m.useState(null),currentTask=ct2[0],setCurrentTask=ct2[1],tl2=m.useState([]),taskList=tl2[0],setTaskList=tl2[1],tle=m.useState(null),taskListError=tle[0],setTaskListError=tle[1],tl3=m.useState(false),taskLoading=tl3[0],setTaskLoading=tl3[1],bzy=m.useState(false),batchBusy=bzy[0],setBatchBusy=bzy[1],ber=m.useState(null),batchError=ber[0],setBatchError=ber[1],bnt=m.useState(null),batchNotice=bnt[0],setBatchNotice=bnt[1];m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge)return;var tasks=[["areas",{provider:"areas"}],["automotive",{provider:"kolTagsV2",section:"automotiveIndustryTag"}],["audience20",{provider:"kolTagsV2",section:"audience20"}],["contentTheme",{provider:"kolTagsV2",section:"contentTheme"}],["consumeBehavior",{provider:"consumeBehavior"}]];tasks.forEach(function(t){bridge.getConfig(t[1]).then(function(res){setConfigs(function(prev){var next=Object.assign({},prev);if(res&&res.ok){next[t[0]]={source:res.data&&res.data.source||"live",warning:res.data&&res.data.warning,nodes:res.data&&res.data.nodes||[]}}else{next[t[0]]={error:res&&res.error?res.error:{code:"unknown",message:"配置加载失败"}}}return next})}).catch(function(e){setConfigs(function(prev){var next=Object.assign({},prev);next[t[0]]={error:{code:e&&e.code||"unknown",message:e&&e.message||String(e)}};return next})})})},[]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.getColumns)return;bridge.getColumns().then(function(res){if(res&&res.ok&&Array.isArray(res.data)){setColumnList(res.data);setSelectedColumns(res.data.filter(function(c){return c.defaultDisplay===true}).map(function(c){return c.id}));setColumnError(null)}else{setColumnError(res&&res.error||{code:"unknown",message:"字段列表加载失败"})}}).catch(function(e){setColumnError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},[]);m.useEffect(function(){refreshTaskList()},[]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.onBatchEvent)return;var dispose=bridge.onBatchEvent(function(ev){if(currentTaskId)loadTask(currentTaskId);refreshTaskList()});return function(){if(dispose&&typeof dispose==="function")dispose()}},[currentTaskId]);var update=m.useCallback(function(patch){setFilter(function(prev){return Object.assign({},prev,patch)})},[]),toggleArr=m.useCallback(function(key,node){setFilter(function(prev){var cur=prev[key]||[],found=-1;for(var i=0;i<cur.length;i++){if(pgyKolNodeKey(cur[i])===pgyKolNodeKey(node)){found=i;break}}var next=found>=0?cur.slice(0,found).concat(cur.slice(found+1)):cur.concat([node]),patch={};patch[key]=next;return Object.assign({},prev,patch)})},[]);m.useEffect(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge){setPreview("");return}var timer=window.setTimeout(function(){bridge.previewPayload(pgyKolToFilterState(filter)).then(function(res){if(res&&res.ok){setPreview(typeof res.data==="string"?res.data:JSON.stringify(res.data,null,2))}else{setPreview("预览不可用："+((res&&res.error&&res.error.message)||"未知错误"))}}).catch(function(e){setPreview("预览不可用："+((e&&e.message)||String(e)))})},300);return function(){window.clearTimeout(timer)}},[filter]);var runSearch=m.useCallback(function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge)return;setStatus("loading");setError(null);bridge.searchFirstPage(pgyKolToFilterState(filter)).then(function(res){if(res&&res.ok){setResult(res.data);setStatus(res.data&&res.data.kols&&res.data.kols.length>0?"loaded":"empty")}else{var e=res&&res.error||{code:"unknown",message:"查询失败"};setError(e);setStatus(e.code==="auth-expired"?"auth-expired":"error")}}).catch(function(e){setError({code:e&&e.code||"unknown",message:e&&e.message||String(e)});setStatus("error")})},[filter]);var toggleColumn=function(id){setSelectedColumns(function(prev){var i=prev.indexOf(id);return i>=0?prev.slice(0,i).concat(prev.slice(i+1)):prev.concat([id])})},loadTask=function(tid){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchGet||!tid)return;setTaskLoading(true);bridge.batchGet({taskId:tid}).then(function(res){setTaskLoading(false);if(res&&res.ok){setCurrentTask(res.data);setBatchError(null)}else{setBatchError(res&&res.error||{code:"unknown",message:"任务详情加载失败"})}}).catch(function(e){setTaskLoading(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},refreshTaskList=function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchList)return;bridge.batchList().then(function(res){if(res&&res.ok&&Array.isArray(res.data)){setTaskList(res.data);setTaskListError(null)}else{setTaskListError(res&&res.error||{code:"unknown",message:"任务历史加载失败"})}}).catch(function(e){setTaskListError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},startBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchStart||batchBusy)return;if(!selectedColumns||selectedColumns.length===0){setBatchError({code:"invalid-input",message:"请至少选择一个导出字段"});return}setBatchBusy(true);setBatchError(null);bridge.batchStart({filterState:pgyKolToFilterState(filter),columns:selectedColumns}).then(function(res){setBatchBusy(false);if(res&&res.ok){var tid=res.data&&res.data.taskId;if(tid){setCurrentTaskId(tid);loadTask(tid)}refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"采集启动失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},pauseBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchPause({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},resumeBatch=function(budgets){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchResume(budgets?{taskId:tid,budgets:budgets}:{taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},cancelBatch=function(){var bridge=window.bridge&&window.bridge.pgyKol,tid=currentTaskId;if(!bridge||!tid)return;setBatchBusy(true);setBatchError(null);bridge.batchCancel({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){loadTask(tid);refreshTaskList()}else{setBatchError(res&&res.error||{code:"unknown",message:"任务操作失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},exportTask=function(tid){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.batchExport||!tid)return;setBatchBusy(true);setBatchError(null);setBatchNotice(null);bridge.batchExport({taskId:tid}).then(function(res){setBatchBusy(false);if(res&&res.ok){setBatchNotice("导出已提交："+tid+"（完整数据以导出文件为准）")}else{setBatchError(res&&res.error||{code:"unknown",message:"导出失败"})}}).catch(function(e){setBatchBusy(false);setBatchError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})},selectTask=function(tid){setCurrentTaskId(tid);loadTask(tid)};if(!pgyKolDevEnabled())return o.jsx(x,{sx:{p:4},children:o.jsx(oe,{severity:"warning",children:"功能未开启"})});var bridgeOk=!!(window.bridge&&window.bridge.pgyKol),areasCfg=configs.areas||null,autoCfg=configs.automotive||null,audCfg=configs.audience20||null,themeCfg=configs.contentTheme||null,consumeCfg=configs.consumeBehavior||null,areasSel=filter.location?[pgyKolNodeKey(filter.location)]:[],autoLeaves=[],batchRunning=currentTask&&currentTask.status==="running";filter.automotive.forEach(function(n){pgyKolFlattenLeaves(n,autoLeaves)});var areasToggle=function(node){var key=pgyKolNodeKey(node);update({location:filter.location&&pgyKolNodeKey(filter.location)===key?null:node})},genderOptions=[{value:"男",label:"男"},{value:"女",label:"女"}];return o.jsx(x,{sx:{p:3,maxWidth:1180,margin:"0 auto"},children:o.jsxs(x,{children:[o.jsxs(x,{sx:{mb:2},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:.5},children:[o.jsx(B,{icon:"solar:magnifer-bold-duotone",width:28,height:28}),o.jsx(w,{variant:"h4",fontWeight:"bold",children:"找博主"})]}),o.jsx(w,{variant:"body2",color:"text.secondary",children:"蒲公英博主原生筛选（MVP）。开发开关开启后显示菜单与路由，关闭时页面不可达。"})]}),!bridgeOk&&o.jsx(oe,{severity:"error",sx:{mb:2},children:"当前环境不支持蒲公英找博主（bridge 缺失）"}),o.jsx(PgyKolSection,{title:"性别",badge:null,warning:null,error:null,children:o.jsx(PgyKolChips,{options:genderOptions,keyOf:function(n){return n.value},selected:filter.gender?[filter.gender]:[],onToggle:function(n){update({gender:filter.gender===n.value?null:n.value})}})}),o.jsx(PgyKolSection,{title:"博主地域",badge:areasCfg&&areasCfg.source,warning:areasCfg&&areasCfg.warning,error:areasCfg&&areasCfg.error?("加载失败（错误码 "+(areasCfg.error.code||"unknown")+"）："+(areasCfg.error.message||"未知错误")):null,children:areasCfg&&!areasCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{nodes:areasCfg.nodes||[],selected:areasSel,onToggle:areasToggle,display:function(n){return n.fullPath||n.label||String(n.value)}}),filter.location&&o.jsx(f1,{size:"small",sx:{mt:1},onDelete:function(){update({location:null})},label:filter.location.fullPath||filter.location.label||String(filter.location.value)})]}):o.jsx(de,{size:24})}),o.jsx(PgyKolSection,{title:"粉丝数上下限",badge:null,warning:null,error:null,children:o.jsxs(x,{sx:{display:"flex",gap:1.5,flexWrap:"wrap"},children:[o.jsx(ae,{size:"small",type:"number",label:"粉丝数下限",value:filter.fansNumberLower,onChange:function(e){update({fansNumberLower:e.target.value})},sx:{maxWidth:200}}),o.jsx(ae,{size:"small",type:"number",label:"粉丝数上限",value:filter.fansNumberUpper,onChange:function(e){update({fansNumberUpper:e.target.value})},sx:{maxWidth:200}})]})}),o.jsx(PgyKolSection,{title:"二十大人群",badge:audCfg&&audCfg.source,warning:audCfg&&audCfg.warning,error:audCfg&&audCfg.error?("加载失败（错误码 "+(audCfg.error.code||"unknown")+"）："+(audCfg.error.message||"未知错误")):null,children:audCfg&&!audCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{leafOnly:true,nodes:audCfg.nodes||[],selected:filter.audience20.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("audience20",n)},display:function(n){return n.fullPath||n.label||String(n.value)}}),filter.audience20.length>0&&o.jsxs(x,{sx:{mt:1,display:"flex",flexWrap:"wrap",gap:.5},children:[filter.audience20.map(function(n){return o.jsx(f1,{key:pgyKolNodeKey(n),size:"small",label:n.fullPath||n.label,onDelete:function(){toggleArr("audience20",n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+filter.audience20.length+" 项"})]})]}):o.jsx(de,{size:24})}),o.jsx(PgyKolSection,{title:"行业特色画像",badge:autoCfg&&autoCfg.source,warning:autoCfg&&autoCfg.warning,error:autoCfg&&autoCfg.error?("加载失败（错误码 "+(autoCfg.error.code||"unknown")+"）："+(autoCfg.error.message||"未知错误")):null,children:autoCfg&&!autoCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{nodes:autoCfg.nodes||[],selected:filter.automotive.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("automotive",n)},display:function(n){return n.fullPath||n.label||String(n.value)}}),filter.automotive.length>0&&o.jsxs(x,{sx:{mt:1,display:"flex",flexWrap:"wrap",gap:.5},children:[filter.automotive.map(function(n){return o.jsx(f1,{key:pgyKolNodeKey(n),size:"small",label:n.fullPath||n.label,onDelete:function(){toggleArr("automotive",n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"选中父节点时展开叶子 ID："+autoLeaves.join("、")})]})]}):o.jsx(de,{size:24})}),o.jsx(PgyKolSection,{title:"内容题材",badge:themeCfg&&themeCfg.source,warning:themeCfg&&themeCfg.warning,error:themeCfg&&themeCfg.error?("加载失败（错误码 "+(themeCfg.error.code||"unknown")+"）："+(themeCfg.error.message||"未知错误")):null,children:themeCfg&&!themeCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{nodes:themeCfg.nodes||[],selected:filter.contentTheme.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("contentTheme",n)},display:function(n){return n.fullPath||n.label||String(n.value)}}),filter.contentTheme.length>0&&o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:1},children:"已选 "+filter.contentTheme.length+" 项"})]}):o.jsx(de,{size:24})}),o.jsx(PgyKolSection,{title:"预估消费行为",badge:consumeCfg&&consumeCfg.source,warning:consumeCfg&&consumeCfg.warning,error:consumeCfg&&consumeCfg.error?("加载失败（错误码 "+(consumeCfg.error.code||"unknown")+"）："+(consumeCfg.error.message||"未知错误")):null,children:consumeCfg&&!consumeCfg.error?o.jsxs(x,{children:[o.jsx(PgyKolTree,{nodes:consumeCfg.nodes||[],selected:filter.consumeBehavior.map(function(n){return pgyKolNodeKey(n)}),onToggle:function(n){toggleArr("consumeBehavior",n)},display:function(n){return n.path||n.label||n.fullPath||String(n.value)}}),filter.consumeBehavior.length>0&&o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:1},children:"已选 "+filter.consumeBehavior.length+" 项"})]}):o.jsx(de,{size:24})}),o.jsx(PgyKolSection,{title:"导出/展示字段",badge:null,warning:null,error:null,children:o.jsx(PgyKolColumnPicker,{columns:columnList,error:columnError,selected:selectedColumns,onToggle:toggleColumn})}),o.jsxs(xe,{variant:"outlined",sx:{mb:2},children:[o.jsxs(We,{children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,sx:{mb:1},children:"当前 Payload 预览"}),o.jsx(x,{component:"pre",sx:{maxHeight:280,overflow:"auto",p:1.5,bgcolor:"background.paper",borderRadius:1,fontSize:12,fontFamily:"monospace",whiteSpace:"pre-wrap",wordBreak:"break-all"},children:preview||"（未配置筛选条件）"})]})]}),o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1.5},children:[o.jsx($,{variant:"contained",size:"large",onClick:runSearch,disabled:status==="loading",startIcon:status==="loading"?o.jsx(de,{size:18,color:"inherit"}):o.jsx(B,{icon:"solar:magnifer-bold-duotone",width:18,height:18}),children:status==="loading"?"查询中...":"查询"}),o.jsx($,{variant:"contained",color:"secondary",size:"large",onClick:startBatch,disabled:batchBusy||batchRunning,startIcon:batchBusy?o.jsx(de,{size:18,color:"inherit"}):null,children:batchBusy?"启动中...":"开始采集"}),status==="empty"&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"没有匹配的博主"})]}),batchError&&o.jsx(oe,{severity:"error",sx:{mt:2},children:pgyKolBatchErrorMessage(batchError)}),batchNotice&&o.jsx(oe,{severity:"success",sx:{mt:2},children:batchNotice}),status==="loading"&&o.jsx(Q1,{sx:{mt:2}}),status==="auth-expired"&&o.jsx(oe,{severity:"error",sx:{mt:2},children:"蒲公英登录已失效，请重新授权"}),status==="error"&&error&&o.jsx(oe,{severity:"error",sx:{mt:2},children:"查询失败（错误码 "+(error.code||"unknown")+"）："+(error.message||"未知错误")}),result&&o.jsxs(x,{sx:{mt:3},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"h6",children:"共 "+(result.total!=null?result.total:"?")+" 位博主"}),o.jsx(f1,{size:"small",label:"当前展示 "+(result.kols?result.kols.length:0)+" 条"}),o.jsx(f1,{size:"small",variant:"outlined",label:"预览 "+(result.kols?result.kols.length:0)+" 条 / 已持久化 "+pgyKolCount(currentTask,"raw")+" 条（完整数据以导出为准）"}),result.capSignal&&result.capSignal.capped&&o.jsx(f1,{size:"small",color:"warning",label:"结果可能超过 5000"}),result.quarantinedFields&&result.quarantinedFields.length>0&&o.jsx(f1,{size:"small",variant:"outlined",label:"未知字段 "+result.quarantinedFields.length+" 个已隔离"})]}),result.capSignal&&result.capSignal.capped&&o.jsx(oe,{severity:"warning",sx:{mb:2},children:"结果可能超过 5000，完整性未证明"}),o.jsxs(N,{container:true,spacing:1.5,children:result.kols&&result.kols.map(function(k){return o.jsx(N,{item:true,xs:12,sm:6,md:4,key:k.userId||JSON.stringify(k)},o.jsx(PgyKolCard,{kol:k}))})})]}),o.jsx(PgyKolBatchPanel,{task:currentTask,onPause:pauseBatch,onResume:resumeBatch,onResumeWithBudgets:function(budgets){resumeBatch(budgets)},onCancel:cancelBatch,onExport:function(){exportTask(currentTaskId)}}),taskLoading&&o.jsx(Q1,{sx:{mt:1}}),o.jsx(PgyKolTaskHistory,{tasks:taskList,error:taskListError,onSelect:selectTask,onExport:exportTask})]})})}`;
const pgyKolStoreFrom = "setMenus:t=>e({menus:t})";
const pgyKolStoreTo = "setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})";
const pgyKolRouteFrom = '"../pages/dashboard/index.tsx":()=>G(()=>Promise.resolve().then(()=>W5),void 0,import.meta.url),';
const pgyKolRouteTo = pgyKolRouteFrom + '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>({default:PgyKolSearchPage})),void 0,import.meta.url),';
const pgyKolRouteMarker = '"../pages/pgy-kol-search/index.tsx":()=>G(';

const pgyKolPhase4Marker = "function PgyKolBatchPanel";
// Phase 4 内容级幂等守卫：以源码 SHA-1 对比 bundle 内已注入块，内容漂移时
// 必然重建（修复“标记存在但函数体已更新导致产物陈旧”的问题）；内容一致时
// 跳过（保持幂等）。全新 bundle 没有旧块时直接注入（Phase 1 路径）。
const normalizeSource = (source) => String(source).replace(/\r\n/g, "\n");
const sourceSha1 = crypto
  .createHash("sha1")
  .update(normalizeSource(pgyKolSearchPageSource))
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
    "V1=new Map;" + pgyKolSearchPageSource.replace(/\n/g, "\r\n") + "\r\nfunction si(e){",
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
