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
const assetVersionFile = path.join(assetsRoot, "version.json");
const sourceAssetVersion = fs.existsSync(assetVersionFile)
  ? String(JSON.parse(fs.readFileSync(assetVersionFile, "utf8")).version || "").trim()
  : "";
if (sourceAssetVersion && !/^\d+\.\d+\.\d+$/.test(sourceAssetVersion)) {
  throw new Error(`Invalid source asset version in ${assetVersionFile}: ${sourceAssetVersion}`);
}
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
const rechargeRecordsBundle = path.join(assetsDir, "index-DHMLmlYD.js");
const consumeRecordsBundle = path.join(assetsDir, "index-CgHBiVER.js");
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
  'function y5(){const e=Te(),t=r1(),{login:r}=ze(),[a,n]=m.useState(()=>localStorage.getItem("magiorix.login.phone")??""),[l,s]=m.useState(""),[i,d]=m.useState(""),[c,u]=m.useState(!1),[f,b]=m.useState(""),[C,h]=m.useState(!1),g=m.useCallback(async y=>{y.preventDefault();if(c)return;b("");const v=a.trim();if(!/^1[3-9]\\d{9}$/.test(v)){b("请输入正确的手机号格式");return}if(l.length<8||l.length>64){b("密码长度必须在 8 到 64 个字符之间");return}if(l!==i){b("两次输入的密码不一致");return}u(!0);try{const R=await pgyRegister({phone:v,password:l});if(!R?.token||!R?.userInfo)throw new Error("注册响应无效，请重试");Zt.getState().setToken(R.token),Se.getState().setUserInfo(R.userInfo);const M=await Ht();Se.getState().setPermissions(M?.permissions||[]),Se.getState().setMenus(M?.menus||[]),Ee.system.auth.setLoginState(!0),localStorage.setItem("magiorix.login.phone",v),pgyAuthNavigate(e,t,vr)}catch(S){b(S.message||"注册失败，请稍后重试")}finally{u(!1)}},[r,t,e,c,a,l,i]);return o.jsxs(x,{component:"form",onSubmit:g,noValidate:!0,className:"password-login",children:[o.jsx(_1,{open:!!f,autoHideDuration:3e3,onClose:()=>b(""),anchorOrigin:{vertical:"top",horizontal:"center"},children:o.jsx(oe,{severity:"error",children:f})}),o.jsxs(x,{className:"password-login__fields",children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:y=>n(y.target.value),autoComplete:"tel",autoFocus:!0,disabled:c,placeholder:"请输入手机号",className:"password-login__input",size:"small"}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:l,onChange:y=>s(y.target.value),autoComplete:"new-password",disabled:c,placeholder:"设置密码（8-64 位）",size:"small",className:"password-login__input"}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:i,onChange:y=>d(y.target.value),autoComplete:"new-password",disabled:c,placeholder:"确认密码",size:"small",className:"password-login__input"})]}),o.jsx($,{fullWidth:!0,size:"large",type:"submit",variant:"contained",disabled:c,className:"password-login__submit",startIcon:c?o.jsx(de,{size:20,color:"inherit"}):void 0,children:c?"注册中...":"注册"})]})}',  'function b5({open:e,onClose:t}){const[a,n]=m.useState(""),[l,s]=m.useState(""),[i,d]=m.useState(""),[c,u]=m.useState(!1),[f,b]=m.useState(0),[C,h]=m.useState(!1),[g,v]=m.useState(""),[j,S]=m.useState("");m.useEffect(()=>{if(f<=0)return;const E=window.setInterval(()=>b(q=>q<=1?0:q-1),1e3);return()=>window.clearInterval(E)},[f]);const A=()=>{u(!1),b(0),v(""),S(""),t()},D=async()=>{if(c||f>0)return;const E=a.trim();if(!/^1[3-9]\\d{9}$/.test(E)){v("请输入正确的手机号格式");return}u(!0),v(""),S("");try{await pgySendSms({phone:E,purpose:"reset_password"}),b(60),S("验证码已发送，请查收短信")}catch(q){v(q.message||"验证码发送失败，请稍后重试")}finally{u(!1)}},O=async E=>{E.preventDefault();if(C)return;const q=a.trim(),T=l.trim();if(!/^1[3-9]\\d{9}$/.test(q)){v("请输入正确的手机号格式");return}if(!/^\\d{4}$/.test(T)){v("请输入 4 位验证码");return}if(i.length<8||i.length>64){v("新密码长度必须在 8 到 64 个字符之间");return}h(!0),v("");try{await pgyResetPassword({phone:q,code:T,newPassword:i}),S("密码已重置，请返回登录"),setTimeout(A,600)}catch(R){v(R.message||"密码重置失败，请稍后重试")}finally{h(!1)}};return o.jsxs(ue,{open:e,onClose:A,PaperProps:{sx:{width:380}},children:[o.jsxs(be,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:["找回密码",o.jsx(te,{onClick:A,size:"small",children:o.jsx(B,{icon:"solar:close-circle-bold",width:22})})]}),o.jsxs(x,{component:"form",onSubmit:O,sx:{px:3,pb:3,display:"flex",flexDirection:"column",gap:1.5},children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:E=>n(E.target.value),disabled:C||c,placeholder:"请输入手机号",autoComplete:"tel",size:"small"}),o.jsxs(x,{sx:{display:"flex",gap:1},children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:l,onChange:E=>s(E.target.value),disabled:C,placeholder:"4 位验证码",autoComplete:"one-time-code",size:"small",slotProps:{htmlInput:{maxLength:4,inputMode:"numeric"}}}),o.jsx($,{type:"button",variant:"outlined",onClick:D,disabled:C||c||f>0,size:"small",children:c?"发送中...":f>0?f+"s":"获取验证码"})]}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:i,onChange:E=>d(E.target.value),disabled:C,placeholder:"新密码（8-64 位）",autoComplete:"new-password",size:"small"}),g&&o.jsx(oe,{severity:"error",children:g}),j&&o.jsx(w,{variant:"body2",color:"success.main",children:j}),o.jsx($,{fullWidth:!0,type:"submit",variant:"contained",disabled:C,children:C?"提交中...":"重置密码"})]})]})}',
  'function wr(e){for(const t of e){if(t.children&&t.children.length>0){const r=wr(t.children);if(r)return r}if(t.path)return t.path}return""}',
  'function x5(){const e=Te(),t=r1(),{login:r}=ze(),[a,n]=m.useState(()=>localStorage.getItem("zs.login.phone")??""),[l,s]=m.useState(""),[i,d]=m.useState(!1),[c,u]=m.useState(!1),[f,b]=m.useState(""),[C,h]=m.useState(!1),g=m.useCallback(async y=>{y.preventDefault();if(c)return;b("");const v=a.trim();if(!/^1[3-9]\\d{9}$/.test(v)){b("请输入正确的手机号格式");return}if(!l){b("请输入密码");return}u(!0);try{await r({loginType:"password",phone:v,password:l}),localStorage.setItem("zs.login.phone",v),pgyAuthNavigate(e,t,wr)}catch(S){b(S.message||"登录失败，请检查登录信息")}finally{u(!1)}},[r,t,e,c,a,l]);return o.jsxs(x,{component:"form",onSubmit:g,noValidate:!0,className:"password-login",children:[o.jsx(_1,{open:!!f,autoHideDuration:3e3,onClose:()=>b(""),anchorOrigin:{vertical:"top",horizontal:"center"},children:o.jsx(oe,{severity:"error",children:f})}),o.jsxs(x,{className:"password-login__fields",children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:y=>n(y.target.value),autoComplete:"tel",autoFocus:!0,disabled:c,placeholder:"请输入手机号",className:"password-login__input",size:"small"}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:i?"text":"password",value:l,onChange:y=>s(y.target.value),autoComplete:"current-password",disabled:c,placeholder:"请输入密码",size:"small",slotProps:{input:{endAdornment:o.jsx(y1,{position:"end",children:o.jsx(te,{onClick:()=>d(y=>!y),edge:"end",disabled:c,size:"small",children:i?o.jsx(B,{icon:"solar:eye-closed-bold-duotone",width:18,height:18}):o.jsx(B,{icon:"solar:eye-bold-duotone",width:18,height:18})})})}}}),o.jsx(lo,{component:"button",type:"button",variant:"caption",color:"primary",onClick:()=>h(!0),sx:{alignSelf:"flex-end",mt:.2,position:"relative",top:"-10px"},children:"忘记密码？"})]}),o.jsx($,{fullWidth:!0,size:"large",type:"submit",variant:"contained",disabled:c,startIcon:c?o.jsx(de,{size:20,color:"inherit"}):void 0,children:c?"登录中...":"登录"}),o.jsx(b5,{open:C,onClose:()=>h(!1)})]})}',
].join("\n").replaceAll('"zs.login.phone"', '"magiorix.login.phone"');
replaceRange(
  mainBundle,
  "function y5(){",
  "function kr(e){",
  pgyAuthFlow,
  "replace client registration and password recovery flow",
);
replaceOnce(
  mainBundle,
  'o.jsxs(x,{className:"sign-in__left",children:[o.jsx(w,{variant:"h6",className:"sign-in__section-title",children:"扫码登录"}),o.jsx(C5,{})]}),o.jsx(x,{className:"sign-in__divider"}),',
  "",
  "remove the wechat qr panel from the sign-in page",
);
replaceOnce(
  mainBundle,
  'if(typeof window>"u")return"sms";const r=window.localStorage.getItem(Z0);return r==="sms"||r==="password"?r:"sms"',
  'if(typeof window>"u")return"password";const r=window.localStorage.getItem(Z0);return r==="sms"||r==="password"?r:"password"',
  "sign-in defaults to the password login tab",
);
replaceOnce(mainBundle, 'children:"手机号注册"', 'children:"注册"', "sign-in register tab label");
replaceOnce(mainBundle, 'children:"密码登录"', 'children:"登录"', "sign-in login tab label");
replaceOnce(
  path.join(assetsDir, "index-kuUVLowI.css"),
  ".sign-in__card{width:764px;height:486px;",
  ".sign-in__card{width:420px;height:auto;",
  "sign-in card width without the qr panel",
);
replaceOnce(
  path.join(assetsDir, "index-kuUVLowI.css"),
  ".sign-in__right{flex:1;display:flex;flex-direction:column;padding:0 20px 0 40px}",
  ".sign-in__right{width:100%;display:flex;flex-direction:column;align-items:center;padding:0}",
  "sign-in right column fills the narrowed card",
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
if (!fs.readFileSync(urlValidatorBundle, "utf8").includes('"dailyNotePicturePerformanceChart"')) {
  replaceOnce(
    urlValidatorBundle,
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart","bloggerOverviewChart"])',
    'new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart","dailyNotePerformanceChart","dailyNotePicturePerformanceChart","dailyNoteVideoPerformanceChart","bloggerOverviewChart"])',
    "include typed daily note charts in duration estimate",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('field:"fansGenderAgeChart"')) {
  replaceOnce(
    mainBundle,
    '{field:"fansGenderChart",headerName:"粉丝性别分布图",width:320},{field:"fansGrowthTrendChart"',
    '{field:"fansGenderChart",headerName:"粉丝性别分布图",width:320},{field:"fansGenderAgeChart",headerName:"性别分布+年龄分布",width:320},{field:"fansGrowthTrendChart"',
    "add combined gender-age export column",
  );
}

if (!fs.readFileSync(mainBundle, "utf8").includes('key:"fansGenderAgeChart"')) {
  replaceOnce(
    mainBundle,
    '{group:"粉丝图表",label:"粉丝性别分布图",key:"fansGenderChart"},{group:"粉丝图表",label:"粉丝增长趋势图"',
    '{group:"粉丝图表",label:"粉丝性别分布图",key:"fansGenderChart"},{group:"粉丝图表",label:"性别分布+年龄分布",key:"fansGenderAgeChart"},{group:"粉丝图表",label:"粉丝增长趋势图"',
    "add combined gender-age export field",
  );
  replaceOnce(
    mainBundle,
    '{key:"fansGenderChart",label:"粉丝性别分布图"},{key:"fansGrowthTrendChart"',
    '{key:"fansGenderChart",label:"粉丝性别分布图"},{key:"fansGenderAgeChart",label:"性别分布+年龄分布"},{key:"fansGrowthTrendChart"',
    "add combined gender-age field selector",
  );
}

if (!fs.readFileSync(urlValidatorBundle, "utf8").includes('"fansGenderAgeChart"')) {
  replaceOnce(
    urlValidatorBundle,
    '"fansGenderChart","fansGrowthTrendChart"',
    '"fansGenderChart","fansGenderAgeChart","fansGrowthTrendChart"',
    "include combined gender-age chart in duration estimate",
  );
}

for (const [from, to] of [
  [',{field:"recentNoteInteractionFluctuationChart",headerName:"近期笔记波动图（互动量）",width:320}', ""],
  [',{group:"日常30天",label:"近期笔记波动图（互动量）",key:"recentNoteInteractionFluctuationChart"}', ""],
  [',{key:"recentNoteInteractionFluctuationChart",label:"近期笔记波动图（互动量）"}', ""],
  [',"recentNoteInteractionFluctuationChart"', ""],
]) {
  replaceAllIfExists(mainBundle, from, to);
  replaceAllIfExists(urlValidatorBundle, from, to);
}

if (!fs.readFileSync(mainBundle, "utf8").includes('field:"recentNoteInteractionMedian"')) {
  replaceOnce(
    mainBundle,
    '{field:"impMedianBusiness90",headerName:"曝光中位数(合作90天)",width:180}',
    '{field:"impMedianBusiness90",headerName:"曝光中位数(合作90天)",width:180},{field:"recentNoteInteractionMedian",headerName:"近期笔记波动中位数",width:190}',
    "add recent note interaction median grid column after business-90",
  );
}
if (!fs.readFileSync(mainBundle, "utf8").includes('{group:"近期笔记波动",label:"中位数",key:"recentNoteInteractionMedian"}')) {
  replaceOnce(
    mainBundle,
    '{group:"合作90天",label:"曝光中位数",key:"impMedianBusiness90"}',
    '{group:"合作90天",label:"曝光中位数",key:"impMedianBusiness90"},{group:"近期笔记波动",label:"中位数",key:"recentNoteInteractionMedian"}',
    "add recent note interaction median export header after business-90",
  );
}
if (!fs.readFileSync(mainBundle, "utf8").includes('groupKey:"recent-note-fluctuation"')) {
  replaceOnce(
    mainBundle,
    '{key:"impMedianBusiness90",label:"曝光中位数"}]},{groupKey:"fans-core"',
    '{key:"impMedianBusiness90",label:"曝光中位数"}]},{groupKey:"recent-note-fluctuation",groupLabel:"近期笔记波动",description:"近期笔记互动量波动中位数",fields:[{key:"recentNoteInteractionMedian",label:"中位数",defaultSelected:!0}]},{groupKey:"fans-core"',
    "add recent note interaction median selector group after business-90",
  );
}

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

replaceOnce(
  mainBundle,
  'function Q0(){const e=se(),t=r1(),r=Te(),a=no(e.breakpoints.down("lg"))',
  'function Q0(){const e=se(),t=r1(),r=Te(),a=no(e.breakpoints.down("md"))',
  "keep the main sidebar visible on ordinary desktop widths",
);
replaceOnce(
  mainBundle,
  'display:{xs:"block",lg:"none"}',
  'display:{xs:"block",md:"none"}',
  "align the temporary sidebar drawer with the desktop breakpoint",
);
replaceAllIfExists(
  mainBundle,
  'children:t.filter(r=>r.id!=="points").map(r=>o.jsx(cr,{item:r,level:0},r.id))',
  'children:t.map(r=>o.jsx(cr,{item:r,level:0},r.id))',
);
replaceOnce(
  mainBundle,
  'children:[t.map(n=>o.jsx(Cs,{item:n,isActive:n.id===r,onSelect:a},n.id))',
  'children:[t.filter(n=>n.id!=="points").map(n=>o.jsx(Cs,{item:n,isActive:n.id===r,onSelect:a},n.id))',
  "hide points center from the primary left rail while retaining its routes and secondary menu",
);
replaceOnce(
  mainBundle,
  'children:s.map(h=>o.jsx(cr,{item:h,level:0},h.id))',
  'children:s.filter(h=>h.id!=="points").map(h=>o.jsx(cr,{item:h,level:0},h.id))',
  "hide points center from the temporary navigation drawer",
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
  if (sourceAssetVersion && sourceAssetVersion !== assetVersion) {
    replaceAllIfExists(filePath, sourceAssetVersion, assetVersion);
  }
  replaceAllIfExists(filePath, "薯苗", "积分");
  replaceAllIfExists(filePath, "树苗", "积分");
  if (filePath !== pointsRechargeBundle) {
    replaceAllIfExists(filePath, "shell.openExternal", "shell.openSafeExternal");
  }
}

const pointsRechargeSource = String.raw`import{j as e,r}from"./mui-vendor-COdRvU8K.js";import{I as g,k as Y,M as Q,V as ne}from"./index-B09sHfUO.js";
async function queryOrder(orderNo){const raw=localStorage.getItem("auth-storage");let token="";try{const parsed=raw?JSON.parse(raw):null;token=parsed?.state?.token||""}catch{}const response=await fetch("https://magiorix.red-magic.cn/api/shumiao/order/"+encodeURIComponent(orderNo)+"/query",{method:"POST",headers:{"Content-Type":"application/json",...(token?{satoken:token}:{})}});const payload=await response.json().catch(()=>({}));if(!response.ok||payload.code!==200)throw new Error(payload.message||"订单查询失败");return payload.data}
function PackageCard({pkg,selected,onSelect}){const amount=Number(pkg.amountCents||0)/100;return e.jsxs("button",{type:"button",onClick:onSelect,style:{position:"relative",flex:"0 0 210px",minHeight:132,padding:"18px 16px",textAlign:"left",borderRadius:14,border:selected?"2px solid #3366ff":"1px solid #e2e8f0",background:selected?"#f3f6ff":"#fff",cursor:"pointer",boxShadow:selected?"0 8px 20px rgba(51,102,255,.15)":"0 2px 8px rgba(15,23,42,.06)"},children:[pkg.giftCount>0&&e.jsx("span",{style:{position:"absolute",top:-10,right:10,padding:"3px 8px",borderRadius:999,background:"#ff8a00",color:"#fff",fontSize:12,fontWeight:700},children:"赠"+pkg.giftCount}),e.jsxs("div",{style:{fontSize:24,fontWeight:800,color:"#3366ff"},children:[amount.toFixed(0),e.jsx("span",{style:{fontSize:13,fontWeight:500,marginLeft:4,color:"#64748b"},children:"元"})]}),e.jsxs("div",{style:{marginTop:10,fontSize:15,fontWeight:700,color:"#0f172a"},children:["基础 ",Number(pkg.baseCount||0).toLocaleString()," 积分"]}),e.jsxs("div",{style:{marginTop:5,fontSize:13,color:"#64748b"},children:["到账 ",Number(pkg.totalCount||0).toLocaleString()," 积分"]})]})}
function PointsRecharge(){const{balance,fetchBalance,packages,packagesLoading,fetchPackages}=Y();const[selected,setSelected]=r.useState(null);const[creating,setCreating]=r.useState(false);const[order,setOrder]=r.useState(null);const[error,setError]=r.useState("");const[notice,setNotice]=r.useState("");r.useEffect(()=>{fetchBalance();fetchPackages()},[fetchBalance,fetchPackages]);r.useEffect(()=>{if(packages.length&&!selected)setSelected(packages[0])},[packages,selected]);r.useEffect(()=>{if(!order?.orderNo)return;let stopped=false;let queryAt=0;const startedAt=Date.now();const tick=async()=>{try{let current=await Q(order.orderNo);if(current.status===0&&Date.now()-startedAt>=15000&&Date.now()-queryAt>=15000){queryAt=Date.now();current=await queryOrder(order.orderNo)}if(stopped)return;setOrder(current);if(current.status===1){stopped=true;setNotice("支付成功，积分已到账");fetchBalance();window.bridge?.system?.shell?.closePayment?.()}else if(String(current.lastQueryStatus||"").startsWith("MANUAL_REVIEW:")){setNotice("订单已进入人工复核，请联系客服");stopped=true}else if(current.status===2){setNotice("订单已关闭，请重新创建充值订单")}}catch(error){if(!stopped)setError(error instanceof Error?error.message:"订单状态暂未确认，请稍后刷新")}};tick();const timer=setInterval(tick,3000);return()=>{stopped=true;clearInterval(timer)}},[order?.orderNo,fetchBalance]);const createOrder=async()=>{if(!selected||creating)return;setError("");setNotice("");setCreating(true);try{const created=await ne(selected.id);setOrder(created);setNotice("支付页面已打开，请在支付宝完成支付；客户端会自动确认结果");if(created?.payUrl)window.bridge?.system?.shell?.openExternal(created.payUrl);else throw new Error("支付地址缺失，请稍后重试")}catch(error){setError((error instanceof Error?error.message:"创建订单失败")+"。请稍后重试或刷新页面")}finally{setCreating(false)}};return e.jsxs("div",{style:{padding:24,maxWidth:1120,margin:"0 auto"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:20},children:[e.jsx("h2",{style:{margin:0,fontSize:24},children:"积分充值"}),e.jsxs("div",{style:{padding:"10px 16px",borderRadius:12,background:"#f3f6ff",color:"#334155"},children:["当前余额 ",e.jsxs("strong",{style:{fontSize:20,color:"#3366ff"},children:[Number(balance||0).toLocaleString()," 积分"]})]})]}),e.jsx("div",{style:{marginBottom:18,color:"#64748b"},children:"选择套餐后点击“立即充值”，支付完成后积分会自动到账。"}),packagesLoading?e.jsx("div",{style:{padding:40,textAlign:"center"},children:"正在加载套餐..."}):e.jsx("div",{style:{display:"flex",flexWrap:"nowrap",gap:14,overflowX:"auto",padding:"12px 4px 18px"},children:packages.map(pkg=>e.jsx(PackageCard,{key:pkg.id,pkg,selected:selected?.id===pkg.id,onSelect:()=>setSelected(pkg)}))}),error&&e.jsx("div",{role:"alert",style:{margin:"8px 0 14px",padding:"10px 12px",borderRadius:8,background:"#fff1f2",color:"#be123c"},children:error}),notice&&e.jsx("div",{role:"status",style:{margin:"8px 0 14px",padding:"10px 12px",borderRadius:8,background:"#eff6ff",color:"#1d4ed8"},children:notice}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginTop:12},children:[e.jsx("button",{type:"button",disabled:!selected||creating,onClick:createOrder,style:{minWidth:210,padding:"12px 24px",border:0,borderRadius:10,background:!selected||creating?"#94a3b8":"#3366ff",color:"#fff",fontSize:16,fontWeight:700,cursor:!selected||creating?"not-allowed":"pointer"},children:creating?"创建订单中...":"立即充值"}),selected&&e.jsxs("div",{style:{fontSize:13,color:"#64748b"},children:["到账 ",Number(selected.totalCount||0).toLocaleString()," 积分"]})]})]})}
export{PointsRecharge as default};`;
const verifiedPointsRechargeSource = pointsRechargeSource.replace(
  'const createOrder=async()=>{if(!selected||creating)return;setError("");setNotice("");setCreating(true);try{const created=await ne(selected.id);setOrder(created);setNotice("支付页面已打开，请在支付宝完成支付；客户端会自动确认结果");if(created?.payUrl)window.bridge?.system?.shell?.openExternal(created.payUrl);else throw new Error("支付地址缺失，请稍后重试")}catch(error){setError((error instanceof Error?error.message:"创建订单失败")+"。请稍后重试或刷新页面")}finally{setCreating(false)}}',
  'const createOrder=async()=>{if(!selected||creating)return;setError("");setNotice("");setCreating(true);try{const created=await ne(selected.id);if(!created?.payUrl)throw new Error("支付地址缺失，请稍后重试");const opened=await window.bridge?.system?.shell?.openExternal(created.payUrl);if(opened!==true)throw new Error("无法打开支付页面，请稍后重试");setOrder(created);setNotice("支付宝支付窗口已打开，完成支付后客户端会自动确认结果")}catch(error){setError((error instanceof Error?error.message:"创建订单失败")+"。请稍后重试或刷新页面")}finally{setCreating(false)}}',
);
if (verifiedPointsRechargeSource === pointsRechargeSource) {
  throw new Error("Missing recharge payment open confirmation patch target");
}
const autoClosingPointsRechargeSource = verifiedPointsRechargeSource.replace(
  'const tick=async()=>{try{',
  'const tick=async()=>{if(stopped)return;try{',
);
if (autoClosingPointsRechargeSource === verifiedPointsRechargeSource) {
  throw new Error("Missing recharge payment polling stop guard target");
}
fs.writeFileSync(pointsRechargeBundle, autoClosingPointsRechargeSource);

replaceOnce(
  rechargeRecordsBundle,
  "t.amountYuan.toFixed(2)",
  "(Number.isFinite(Number(t.amountYuan))?Number(t.amountYuan):Number(t.amountCents||0)/100||Number(t.amount||0)).toFixed(2)",
  "recharge records amount compatibility",
);

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
// pgy-kol「找博主」phase-2+5.2：原生筛选与采集功能。
// 页面源码单一权威来源：scripts/pgy-kol-phase52-page-source.js（Phase 5.2
// 官网高保真矩阵复刻：紧凑触发器 + Popover、搜笔记/搜昵称、搜索历史、
// 地域三级级联、树形弹层、范围选择、已选条件、一键清空/收起筛选等）。
// 注入块必须以 pgyKolDevEnabled 开头（bundle 内容守卫锚点）。
// 菜单/路由注入说明（保持 Phase 1 不变）：
// 1. li 路由表追加 "../pages/pgy-kol-search/index.tsx" 懒加载键（与 dashboard
//    同一 G 加载器，默认导出 PgyKolSearchPage）。
// 2. 菜单 store 末尾追加 {name:"找博主",path:"/pgy-kol-search",...}。路由生成 ci/ii 与
//    菜单合并均带幂等守卫。
// 菜单默认显示，卸载或清理本机数据后仍可直接进入。
const pgyKolSearchPageSource = fs.readFileSync(
  path.join(projectRoot, "scripts", "pgy-kol-phase52-page-source.js"),
  "utf8",
);
const pgyKolStoreFrom = "setMenus:t=>e({menus:t})";
const pgyKolStoreTo = "setMenus:t=>e({menus:pgyKolWithLocalMenu(t)})";
const pgyKolRouteFrom = '"../pages/dashboard/index.tsx":()=>G(()=>Promise.resolve().then(()=>W5),void 0,import.meta.url),';
const pgyKolRouteTo = pgyKolRouteFrom + '"../pages/pgy-kol-search/index.tsx":()=>G(()=>Promise.resolve().then(()=>({default:PgyKolSearchPage})),void 0,import.meta.url),';
const pgyKolRouteMarker = '"../pages/pgy-kol-search/index.tsx":()=>G(';

// ===========================================================================
// Phase 5.1 转换记录：pairs/helpers 现为空（转换已冻结进 git 历史）；
// base 模板已是 Phase 5.2 最终形态，pairs 保留空数组以维持分层机制与记录完整。
// 单一权威来源：payloadProven 只由后端 Schema 维护，前端通过 schema-fields IPC
// 读取（pgyKolSchemaUnproven 写入 window.__pgyKolUnproven）。
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
  // helpers 为空时不得追加换行，否则注入分隔符产生双换行，内容守卫哈希永不匹配。
  if (pgyKolPhase51Patch.helpers) {
    source = `${source}\n${pgyKolPhase51Patch.helpers}`;
  }
  return source;
})();

// 共享采集字段选择器位于独立 chunk（assets/<version>/assets/index-IS4kgrUy.js 的 E
// 导出）。页面源码用占位符标记 chunk 文件名，这里解析真实文件名替换进注入源码，
// 使「找博主」与蒲公英博主采集真正共用同一个 ExportFieldSelector；占位符绝不能
// 残留到 bundle 里（否则运行时动态 import 拿不到真实模块）。
const pgyKolFieldSelectorChunkName = "./" + path.basename(exportFieldSelectorBundle);
const pgyKolSearchPageSourceInjected = pgyKolSearchPageSource51
  .split("__PGY_KOL_EXPORT_FIELD_SELECTOR__")
  .join(pgyKolFieldSelectorChunkName);
if (pgyKolSearchPageSourceInjected.indexOf("__PGY_KOL_EXPORT_FIELD_SELECTOR__") >= 0) {
  throw new Error("pgy-kol page source placeholder substitution failed: __PGY_KOL_EXPORT_FIELD_SELECTOR__");
}

// Phase 4 内容级幂等守卫：以源码 SHA-1 对比 bundle 内已注入块，内容漂移时
// 必然重建（修复“标记存在但函数体已更新导致产物陈旧”的问题）；内容一致时
// 跳过（保持幂等）。全新 bundle 没有旧块时直接注入（Phase 1 路径）。
const normalizeSource = (source) => String(source).replace(/\r\n/g, "\n");
const sourceSha1 = crypto
  .createHash("sha1")
  .update(normalizeSource(pgyKolSearchPageSourceInjected))
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
    "V1=new Map;" + pgyKolSearchPageSourceInjected.replace(/\n/g, "\r\n") + "\r\nfunction si(e){",
    "inject or refresh pgy-kol Phase 4 search page component after the lazy route table",
  );
}
if (!fs.readFileSync(mainBundle, "utf8").includes(pgyKolRouteMarker)) {
  replaceOnce(mainBundle, pgyKolRouteFrom, pgyKolRouteTo, "register pgy-kol search lazy route");
}
if (!fs.readFileSync(mainBundle, "utf8").includes(pgyKolStoreTo)) {
  replaceOnce(mainBundle, pgyKolStoreFrom, pgyKolStoreTo, "merge dev-gated local pgy-kol menu into user menus");
}

replaceAllIfExists(
  consumeRecordsBundle,
  'Math.abs(a.consumeCount).toLocaleString()',
  'Math.abs(Number(a.consumeCount??a.count??0)).toLocaleString()',
);
replaceAllIfExists(
  consumeRecordsBundle,
  'Math.abs(Number(a.consumeCount??a.count||0)).toLocaleString()',
  'Math.abs(Number(a.consumeCount??a.count??0)).toLocaleString()',
);
{
  const source = fs.readFileSync(consumeRecordsBundle, "utf8");
  const headingStartMarker = 'return e.jsxs(l,{sx:{p:3},children:[e.jsxs(l,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between",mb:3},children:[';
  const filterStartMarker = ',e.jsxs(S,{size:"small",sx:{minWidth:150},children:';
  const headingStart = source.indexOf(headingStartMarker);
  const contentStart = headingStart < 0 ? -1 : headingStart + headingStartMarker.length;
  const contentEnd = contentStart < 0 ? -1 : source.indexOf(filterStartMarker, contentStart);
  if (headingStart < 0 || contentEnd < 0) {
    throw new Error("Missing frontend patch target: normalize the consume records heading icon");
  }
  const heading = 'e.jsxs(l,{sx:{display:"flex",alignItems:"center",gap:1},children:[e.jsx(u,{icon:"solar:bill-list-bold-duotone",width:26,height:26,style:{color:"#ff2442"}}),e.jsx(t,{variant:"h5",sx:{fontWeight:600},children:"消耗记录"})]})';
  fs.writeFileSync(consumeRecordsBundle, source.slice(0, contentStart) + heading + source.slice(contentEnd));
}
replaceAllIfExists(
  consumeRecordsBundle,
  'a.balanceBefore.toLocaleString()',
  'Number(a.balanceBefore??(Number(a.balanceAfter??0)+Number(a.consumeCount??a.count??0))).toLocaleString()',
);
replaceAllIfExists(
  consumeRecordsBundle,
  'Number(a.balanceBefore??(Number(a.balanceAfter||0)+Number(a.consumeCount??a.count||0))).toLocaleString()',
  'Number(a.balanceBefore??(Number(a.balanceAfter??0)+Number(a.consumeCount??a.count??0))).toLocaleString()',
);
replaceAllIfExists(
  consumeRecordsBundle,
  'a.balanceAfter.toLocaleString()',
  'Number(a.balanceAfter??0).toLocaleString()',
);
replaceAllIfExists(
  consumeRecordsBundle,
  'Number(a.balanceAfter||0).toLocaleString()',
  'Number(a.balanceAfter??0).toLocaleString()',
);

// ===== Auth 会话三处修复：请求风暴 / 超时踢登录 / 续期不同步 =====
// 1) 初始化 effect 依赖不再包含 userInfo 对象，避免「刷新资料 -> 新对象 -> 再刷新」的请求风暴；
//    初始化失败（如网络超时）只记录日志并保留登录态；确认 401 统一由拦截器 Ml() 退出。
replaceOnce(
  mainBundle,
  '}catch(E){console.error("Init auth failed:",E),n(),f(),Ee.system.auth.setLoginState(!1),typeof window<"u"&&(window.location.hash="#/sign-in")}else Ee.system.auth.setLoginState(!1);C(!1)})()},[t,l,y]);',
  '}catch(E){console.error("Init auth failed:",E)}else Ee.system.auth.setLoginState(!1);C(!1)})()},[t,y]);',
  "auth init effect: stop user-object refresh loop, keep session on network errors",
);
// 2) refreshProfile 失败（超时、断网等）只记录日志，不再清 token/用户；确认 401 由拦截器 Ml() 处理。
replaceOnce(
  mainBundle,
  '}catch(S){console.error("Failed to refresh profile:",S),n(),f()}},[t,i,d,c,u,n,f])',
  '}catch(S){console.error("Failed to refresh profile:",S)}},[t,i,d,c,u,n,f])',
  "refreshProfile: keep session on non-401 failures",
);
// 3) 服务端下发 x-new-token 时同步 Zustand 内存（setToken 触发持久化，
//    并通过 AuthProvider 的 [t] effect 把新 token 同步到 Electron 主进程调度器）。
replaceOnce(
  mainBundle,
  'if(a)try{const n=localStorage.getItem("auth-storage");if(n){const l=JSON.parse(n);l.state.token=a,localStorage.setItem("auth-storage",JSON.stringify(l))}}catch(n){console.error("Failed to update token:",n)}',
  'if(a){try{const n=localStorage.getItem("auth-storage");if(n){const l=JSON.parse(n);l.state.token=a,localStorage.setItem("auth-storage",JSON.stringify(l))}}catch(n){console.error("Failed to update token:",n)}Zt.getState().setToken(a)}',
  "x-new-token: sync rotated token into Zustand and main process",
);

// 统一 mainBundle 行尾为 CRLF（Windows 构建产物惯例），避免混合 EOL 导致
// integrity-manifest 哈希在 fresh checkout（autocrlf）下不可复现；幂等：重复运行结果一致。
const normalizedMainBundle = fs
  .readFileSync(mainBundle, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\n/g, "\r\n");
fs.writeFileSync(mainBundle, normalizedMainBundle);

console.log("Applied magiorix frontend patches.");
