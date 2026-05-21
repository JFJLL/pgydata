const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "assets", "1.1.1", "assets", "index-B09sHfUO.js");

function replaceExact(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Missing expected snippet: ${label}`);
  }
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing start marker for ${label}: ${startMarker}`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`Missing end marker for ${label}: ${endMarker}`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let code = fs.readFileSync(bundlePath, "utf8");

code = replaceExact(
  code,
  'rr=(e,t="login")=>W.post("/api/auth/sms/send",{phone:e,type:t})',
  'rr=async()=>{throw new Error("短信功能已停用")}',
  "disable sms send helper"
);

code = replaceExact(
  code,
  'Ql=(e,t)=>W.post("/api/auth/change-phone",{newPhone:e,smsCode:t})',
  'Ql=(e,t)=>W.post("/api/auth/change-phone",{newPhone:e,password:t})',
  "remove smsCode from change-phone helper"
);

code = replaceExact(
  code,
  'S.loginType==="sms"?E=await Jl({phone:S.phone,smsCode:S.smsCode}):E=await Yl(S)',
  'S.loginType==="sms"?E=await Jl({phone:S.phone,password:S.password}):E=await Yl(S)',
  "sms login request body"
);

code = replaceExact(
  code,
  'children:"验证码登录"',
  'children:"手机号注册"',
  "sign-in tab label"
);

const phoneRegisterComponent =
  'function y5(){const e=Te(),t=r1(),{login:r}=ze(),[a,n]=m.useState(()=>localStorage.getItem("zs.login.phone")??""),[l,s]=m.useState(""),[c,u]=m.useState(!1),[f,b]=m.useState(""),p=m.useCallback(async v=>{var E,D;if(v==null||v.preventDefault(),c)return;b("");const j=a.trim(),S=l.trim();if(!j){b("请输入手机号");return}if(!/^1[3-9]\\d{9}$/.test(j)){b("请输入正确的手机号格式");return}if(!S){b("请输入密码");return}const A={loginType:"sms",phone:j,password:S};u(!0);try{await r(A),localStorage.setItem("zs.login.phone",j);const H=(D=(E=t.state)==null?void 0:E.from)==null?void 0:D.pathname;if(H&&H!=="/sign-in")e(H,{replace:!0});else{const R=Se.getState().menus,q=vr(R)||"/";e(q,{replace:!0})}}catch(H){b(H.message||"注册/登录失败，请检查手机号或密码")}finally{u(!1)}},[r,t,e,c,a,l]),y=m.useCallback(v=>{v.key==="Enter"&&p()},[p]);return o.jsxs(x,{component:"form",onSubmit:p,noValidate:!0,className:"sms-login",children:[o.jsx(_1,{open:!!f,autoHideDuration:2e3,onClose:()=>b(""),anchorOrigin:{vertical:"top",horizontal:"center"},children:o.jsx(oe,{severity:"error",children:f})}),o.jsxs(x,{className:"sms-login__fields",children:[o.jsx(ae,{fullWidth:!0,variant:"outlined",value:a,onChange:v=>n(v.target.value),onKeyDown:y,autoComplete:"tel",autoFocus:!0,disabled:c,placeholder:"请输入手机号",className:"sms-login__input",size:"small"}),o.jsx(ae,{fullWidth:!0,variant:"outlined",type:"password",value:l,onChange:v=>s(v.target.value),onKeyDown:y,autoComplete:"new-password",disabled:c,placeholder:"请输入密码",size:"small",className:"sms-login__input"})]}),o.jsx($,{fullWidth:!0,size:"large",type:"submit",variant:"contained",disabled:c,className:"sms-login__submit",startIcon:c?o.jsx(de,{size:20,color:"inherit"}):void 0,children:c?"处理中...":"注册/登录"})]})}';

code = replaceBetween(
  code,
  "function y5()",
  "function b5(",
  phoneRegisterComponent,
  "phone register component"
);

const forgotPasswordDialog =
  'function b5({open:e,onClose:t}){return o.jsxs(ue,{open:e,onClose:t,PaperProps:{sx:{width:360}},children:[o.jsxs(be,{sx:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:["找回密码",o.jsx(te,{onClick:t,size:"small",children:o.jsx(B,{icon:"solar:close-circle-bold",width:22})})]}),o.jsx(pe,{sx:{pt:"6px"},children:o.jsx(w,{variant:"body2",color:"text.secondary",children:"当前版本暂不支持在线找回密码，请联系管理员重置密码。"})}),o.jsx(_e,{sx:{px:3,pb:2},children:o.jsx($,{variant:"contained",onClick:t,children:"知道了"})})]})}';

code = replaceBetween(
  code,
  "function b5(",
  "function wr(",
  forgotPasswordDialog,
  "forgot password dialog"
);

const phoneSettingsDialog =
  'function ei({open:e,onClose:t}){return o.jsxs(ue,{open:e,onClose:t,maxWidth:"xs",fullWidth:!0,children:[o.jsx(be,{sx:{pb:1},children:"手机号设置"}),o.jsx(pe,{children:o.jsx(w,{variant:"body2",color:"text.secondary",children:"当前版本暂不支持客户端修改手机号，请联系管理员处理。"})}),o.jsx(_e,{sx:{px:3,pb:2},children:o.jsx($,{variant:"contained",onClick:t,disableElevation:!0,children:"知道了"})})]})}';

code = replaceBetween(
  code,
  "function ei(",
  "function ti(",
  phoneSettingsDialog,
  "phone settings dialog"
);

fs.writeFileSync(bundlePath, code);
console.log(`Patched ${bundlePath}`);
