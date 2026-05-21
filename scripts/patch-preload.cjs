const fs = require("fs");

const p = "D:/download/pic-vec/pgydata/app-source/dist-electron/preload.mjs";
let s = fs.readFileSync(p, "utf8");
const needle = '"use strict";const r=require("electron"),';
const hook = '"use strict";const r=require("electron");(()=>{const ser=e=>e instanceof Error?{message:e.message,stack:e.stack,name:e.name}:e&&typeof e=="object"?{message:e.message,stack:e.stack,name:e.name,value:String(e)}:{value:String(e)};const send=(type,args)=>{try{r.ipcRenderer.send("pygdata:renderer-log",{type,args:Array.from(args||[]).map(ser)})}catch{}};const oldError=console.error.bind(console);console.error=(...args)=>{send("console.error",args);return oldError(...args)};window.addEventListener("error",e=>send("window.error",[e.error||e.message,e.filename,e.lineno,e.colno]));window.addEventListener("unhandledrejection",e=>send("unhandledrejection",[e.reason]));})();const ';
if (!s.startsWith(needle)) throw new Error("preload prefix not found");
s = hook + s.slice(needle.length);
fs.writeFileSync(p, s);
console.log("patched preload");
