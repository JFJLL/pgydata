const fs = require("fs");
const path = require("path");

const root = "D:/download/pic-vec/pgydata/assets/1.1.1";
const main = path.join(root, "assets/index-B09sHfUO.js");
let s = fs.readFileSync(main, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`missing ${label}`);
  s = s.replace(oldText, newText);
  console.log("patched", label);
}

const localDefs = 'LOCAL_MENUS=[{id:"local-pgy-blogger",name:"博主主页采集",path:"/database/xhs/pgy-blogger",component:"database/xhs/pgy-blogger/index.tsx",icon:"solar:user-id-bold-duotone"},{id:"local-pgy-blog",name:"笔记详情采集",path:"/database/xhs/pgy-blog",component:"database/xhs/pgy-blog/index.tsx",icon:"solar:document-text-bold-duotone"}],LOCAL_USER={id:"local-user",username:"local",nickname:"易美数据抓取",avatar:""}';

replaceOnce('}],X2=Ce()(o1(e=>({mode:"light"', `}],${localDefs},X2=Ce()(o1(e=>({mode:"light"`, "local constants");
replaceOnce(
  'Se=Ce()(o1(e=>({userInfo:null,permissions:[],menus:[],organization:null,setUserInfo:t=>e({userInfo:t}),setPermissions:t=>e({permissions:t}),setMenus:t=>e({menus:t}),setOrganization:t=>e({organization:t}),clearUser:()=>e({userInfo:null,permissions:[],menus:[],organization:null})}),{name:"user-storage"}))',
  'Se=Ce()(o1(e=>({userInfo:LOCAL_USER,permissions:["*"],menus:LOCAL_MENUS,organization:null,setUserInfo:t=>e({userInfo:t||LOCAL_USER}),setPermissions:t=>e({permissions:t&&t.length?t:["*"]}),setMenus:t=>e({menus:t&&t.length?t:LOCAL_MENUS}),setOrganization:t=>e({organization:null}),clearUser:()=>e({userInfo:LOCAL_USER,permissions:["*"],menus:LOCAL_MENUS,organization:null})}),{name:"pgydata-user-storage"}))',
  "user store"
);
replaceOnce(
  'Zt=Ce()(o1(e=>({token:null,isAuthenticated:!1,setToken:t=>e({token:t,isAuthenticated:!0}),clearToken:()=>e({token:null,isAuthenticated:!1})}),{name:"auth-storage"}))',
  'Zt=Ce()(o1(e=>({token:"local-internal",isAuthenticated:!0,setToken:t=>e({token:t||"local-internal",isAuthenticated:!0}),clearToken:()=>e({token:"local-internal",isAuthenticated:!0})}),{name:"pgydata-auth-storage"}))',
  "auth store"
);
replaceOnce('{name:"tabs-storage"}', '{name:"pgydata-tabs-storage"}', "tabs storage");
replaceOnce(
  'let xt=!1;function Ml(){xt||(xt=!0,Zt.getState().clearToken(),Se.getState().clearUser(),Q2.auth.setLoginState(!1),window.location.hash="#/sign-in",setTimeout(()=>{xt=!1},3e3))}',
  'let xt=!1;function Ml(){Zt.getState().setToken("local-internal"),Se.getState().setUserInfo(LOCAL_USER),Se.getState().setPermissions(["*"]),Se.getState().setMenus(LOCAL_MENUS),Q2.auth.setLoginState(!0)}',
  "auth expiry handler"
);
replaceOnce(
  'if(t===401)throw Ml(),new i1(401,"登录已过期，请重新登录");',
  'if(t===401)throw Ml(),new i1(401,"本地模式不可访问服务器接口");',
  "401 message"
);
replaceOnce(
  'const Ke=J.create({baseURL:"https://api.zishutonggao.com",timeout:2e4,headers:{"Content-Type":"application/json"}});',
  'const Ke=J.create({baseURL:"http://127.0.0.1:9",timeout:2e3,headers:{"Content-Type":"application/json"}});',
  "axios base url"
);
replaceOnce('ee.BASE="https://api.zishutonggao.com";', 'ee.BASE="http://127.0.0.1:9";', "openapi base url");
replaceOnce(
  's2=[{index:!0,element:o.jsx(Mr,{})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]',
  's2=[{index:!0,element:o.jsx(K1,{to:"/database/xhs/pgy-blogger",replace:!0})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]',
  "default route"
);

const asStart = s.indexOf('function As(){const e=Te(),{balance:t,loading:r,fetchBalance:a}=Z2();');
const asEnd = s.indexOf('}function e0(){', asStart);
if (asStart < 0 || asEnd < 0) throw new Error("balance widget not found");
s = s.slice(0, asStart) + "function As(){return null" + s.slice(asEnd);
console.log("patched balance widget");

const z2Pattern = /Z2=Ce\(\)\(o1\(\(e,t\)=>\(\{balance:0[\s\S]*?\}\),\{name:"shumiao-storage",partialize:e=>\(\{balance:e\.balance\}\)\}\)\),ct=/;
if (!z2Pattern.test(s)) throw new Error("balance store not found");
s = s.replace(
  z2Pattern,
  'Z2=Ce()(o1((e,t)=>({balance:0,loading:!1,packages:[],packagesLoading:!1,fetchBalance:async()=>{e({balance:0,loading:!1})},setBalance:r=>{e({balance:0})},fetchPackages:async()=>{e({packages:[],packagesLoading:!1})},checkBalance:async r=>!0,clear:()=>{e({balance:0,packages:[]})}}),{name:"pgydata-local-balance-storage",partialize:e=>({balance:0})})),ct='
);
console.log("patched local balance store");

const providerStart = s.indexOf("const lr=m.createContext(void 0),ms=({children:e})=>{");
const providerEndMarker = "},ze=()=>{";
const providerEnd = s.indexOf(providerEndMarker, providerStart);
if (providerStart < 0 || providerEnd < 0) throw new Error("auth provider block not found");
const providerReplacement = 'const lr=m.createContext(void 0),ms=({children:e})=>{const[t,r]=m.useState(!1);m.useEffect(()=>{Se.getState().setUserInfo(LOCAL_USER),Se.getState().setPermissions(["*"]),Se.getState().setMenus(LOCAL_MENUS),Se.getState().setOrganization(null),Zt.getState().setToken("local-internal"),Ee.system.auth.setLoginState(!0)},[]);const a={user:LOCAL_USER,permissions:["*"],isAuthenticated:!0,isLoading:t,login:async()=>{},logout:async()=>{},refreshProfile:async()=>{},hasPermission:()=>!0};return o.jsx(lr.Provider,{value:a,children:e})},ze=()=>{';
s = s.slice(0, providerStart) + providerReplacement + s.slice(providerEnd + providerEndMarker.length);
console.log("patched auth provider");

fs.writeFileSync(main, s);

const textExt = new Set([".js", ".html", ".json", ".txt"]);
const replacements = [
  ["易美数据抓取", "易美数据抓取"],
  ["关于 易美数据抓取", "关于 易美数据抓取"],
  ["武汉高真科技", "易美传播 Emagic"],
  ["易美数据抓取 Desktop", "易美数据抓取"],
  ["易美数据抓取", "易美数据抓取"],
  ["易美数据抓取", "易美数据抓取"],
];

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p));
    else if (textExt.has(path.extname(p).toLowerCase())) out.push(p);
  }
  return out;
}
for (const file of listFiles(root)) {
  let content = fs.readFileSync(file, "utf8");
  const old = content;
  for (const [from, to] of replacements) content = content.split(from).join(to);
  if (content !== old) fs.writeFileSync(file, content);
}

const htmlPath = path.join(root, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(/<title>.*?<\/title>/, "<title>易美数据抓取</title>");
if (!html.includes("pgydata-local-reset")) {
  html = html.replace(
    "<title>易美数据抓取</title>",
    '<title>易美数据抓取</title>\n    <script id="pgydata-local-reset">try{localStorage.removeItem("auth-storage");localStorage.removeItem("user-storage");localStorage.removeItem("tabs-storage");localStorage.removeItem("menu-storage")}catch{}</script>'
  );
}
fs.writeFileSync(htmlPath, html);
console.log("renderer local patch complete");
