 "use strict";
 const { contextBridge, ipcRenderer } = require("electron");
 
 contextBridge.exposeInMainWorld("splashBridge", {
   onStatus: (callback) => {
     const listener = (event, msg) => callback(msg);
     ipcRenderer.on("splash:status", listener);
     return () => ipcRenderer.removeListener("splash:status", listener);
   },
   onProgress: (callback) => {
     const listener = (event, progress) => callback(progress);
     ipcRenderer.on("splash:progress", listener);
     return () => ipcRenderer.removeListener("splash:progress", listener);
   },
   onError: (callback) => {
     const listener = (event, msg) => callback(msg);
     ipcRenderer.on("splash:error", listener);
     return () => ipcRenderer.removeListener("splash:error", listener);
   },
   onComplete: (callback) => {
     const listener = (event) => callback();
     ipcRenderer.on("splash:complete", listener);
     return () => ipcRenderer.removeListener("splash:complete", listener);
   },
   retry: () => {
     ipcRenderer.send("splash:retry");
   },
   ready: () => {
     ipcRenderer.send("splash:ready");
   },
 });
