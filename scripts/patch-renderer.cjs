const fs = require("fs");

const p = "D:/download/pic-vec/pgydata/assets/1.1.1/assets/index-B09sHfUO.js";
let s = fs.readFileSync(p, "utf8");

function mustReplace(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`missing ${label}`);
  s = s.replace(oldText, newText);
  console.log("patched", label);
}

const localDefs = 'LOCAL_MENUS=[{id:"local-pgy-blogger",name:"博主主页采集",path:"/database/xhs/pgy-blogger",component:"database/xhs/pgy-blogger/index.tsx",icon:"solar:user-id-bold-duotone"},{id:"local-pgy-blog",name:"笔记详情采集",path:"/database/xhs/pgy-blog",component:"database/xhs/pgy-blog/index.tsx",icon:"solar:document-text-bold-duotone"}],LOCAL_USER={id:"local-user",username:"local",nickname:"易美数据抓取",avatar:""}';

mustReplace(
  '}],X2=Ce()(o1(e=>({mode:"light"',
  `}],${localDefs},X2=Ce()(o1(e=>({mode:"light"`,
  "local constants"
);

mustReplace(
  'Se=Ce()(o1(e=>({userInfo:null,permissions:[],menus:[],organization:null,setUserInfo:t=>e({userInfo:t}),setPermissions:t=>e({permissions:t}),setMenus:t=>e({menus:t}),setOrganization:t=>e({organization:t}),clearUser:()=>e({userInfo:null,permissions:[],menus:[],organization:null})}),{name:"user-storage"}))',
  'Se=Ce()(o1(e=>({userInfo:LOCAL_USER,permissions:["*"],menus:LOCAL_MENUS,organization:null,setUserInfo:t=>e({userInfo:t||LOCAL_USER}),setPermissions:t=>e({permissions:t&&t.length?t:["*"]}),setMenus:t=>e({menus:t&&t.length?t:LOCAL_MENUS}),setOrganization:t=>e({organization:null}),clearUser:()=>e({userInfo:LOCAL_USER,permissions:["*"],menus:LOCAL_MENUS,organization:null})}),{name:"pgydata-user-storage"}))',
  "user store"
);

mustReplace(
  'Zt=Ce()(o1(e=>({token:null,isAuthenticated:!1,setToken:t=>e({token:t,isAuthenticated:!0}),clearToken:()=>e({token:null,isAuthenticated:!1})}),{name:"auth-storage"}))',
  'Zt=Ce()(o1(e=>({token:"local-internal",isAuthenticated:!0,setToken:t=>e({token:t||"local-internal",isAuthenticated:!0}),clearToken:()=>e({token:"local-internal",isAuthenticated:!0})}),{name:"pgydata-auth-storage"}))',
  "auth store"
);

mustReplace('{name:"tabs-storage"}', '{name:"pgydata-tabs-storage"}', "tabs storage name");

mustReplace(
  'let xt=!1;function Ml(){xt||(xt=!0,Zt.getState().clearToken(),Se.getState().clearUser(),Q2.auth.setLoginState(!1),window.location.hash="#/sign-in",setTimeout(()=>{xt=!1},3e3))}',
  'let xt=!1;function Ml(){Zt.getState().setToken("local-internal"),Se.getState().setUserInfo(LOCAL_USER),Se.getState().setPermissions(["*"]),Se.getState().setMenus(LOCAL_MENUS),Q2.auth.setLoginState(!0)}',
  "auth expiry handler"
);

mustReplace(
  'if(t===401)throw Ml(),new i1(401,"登录已过期，请重新登录");',
  'if(t===401)throw Ml(),new i1(401,"本地模式不可访问服务器接口");',
  "401 message"
);

mustReplace(
  'const Ke=J.create({baseURL:"https://api.zishutonggao.com",timeout:2e4,headers:{"Content-Type":"application/json"}});',
  'const Ke=J.create({baseURL:"http://127.0.0.1:9",timeout:2e3,headers:{"Content-Type":"application/json"}});',
  "axios base url"
);

mustReplace('ee.BASE="https://api.zishutonggao.com";', 'ee.BASE="http://127.0.0.1:9";', "openapi base url");

mustReplace(
  's2=[{index:!0,element:o.jsx(Mr,{})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]',
  's2=[{index:!0,element:o.jsx(K1,{to:"/database/xhs/pgy-blogger",replace:!0})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]',
  "default route"
);

const asStart = s.indexOf('function As(){const e=Te(),{balance:t,loading:r,fetchBalance:a}=Z2();');
const asEnd = s.indexOf('}function e0(){', asStart);
if (asStart < 0 || asEnd < 0) throw new Error("balance widget not found");
s = s.slice(0, asStart) + "function As(){return null" + s.slice(asEnd);
console.log("patched balance widget");

const providerPattern = /const lr=m\.createContext\(void 0\),_localMenus=\[\{id:"local-pgy-blogger"[\s\S]*?hasPermission:\(\)=>!0\};return o\.jsx\(lr\.Provider,\{value:a,children:e\}\)\},ze=\(\)=>\{/;
const providerReplacement = 'const lr=m.createContext(void 0),ms=({children:e})=>{const[t,r]=m.useState(!1);m.useEffect(()=>{Se.getState().setUserInfo(LOCAL_USER),Se.getState().setPermissions(["*"]),Se.getState().setMenus(LOCAL_MENUS),Se.getState().setOrganization(null),Zt.getState().setToken("local-internal"),Ee.system.auth.setLoginState(!0);try{const a=Ee.scrapingScheduler.setAuth({baseUrl:"",token:null});a&&typeof a.catch=="function"&&a.catch(()=>{})}catch{}},[]);const a={user:LOCAL_USER,permissions:["*"],isAuthenticated:!0,isLoading:t,login:async()=>{},logout:async()=>{},refreshProfile:async()=>{},hasPermission:()=>!0};return o.jsx(lr.Provider,{value:a,children:e})},ze=()=>{';
if (!providerPattern.test(s)) throw new Error("auth provider block not found");
s = s.replace(providerPattern, providerReplacement);
console.log("patched auth provider");

fs.writeFileSync(p, s);
