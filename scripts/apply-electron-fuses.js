 const path = require("path");
 const fs = require("fs");
 const { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options } = require("@electron/fuses");
 
 async function applyElectronFuses(exePath) {
   const resolved = path.resolve(exePath);
   if (!fs.existsSync(resolved)) {
     throw new Error(`Target executable not found: ${resolved}`);
   }
   
   await flipFuses(resolved, {
     version: FuseVersion.V1,
     [FuseV1Options.RunAsNode]: false,
     [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
     [FuseV1Options.EnableNodeCliInspectArguments]: false,
     [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
     [FuseV1Options.OnlyLoadAppFromAsar]: true,
   });
   
   const wire = await getCurrentFuseWire(resolved);
   return {
     target: resolved,
     wire,
     fuses: {
       RunAsNode: false,
       EnableNodeOptionsEnvironmentVariable: false,
       EnableNodeCliInspectArguments: false,
       EnableEmbeddedAsarIntegrityValidation: true,
       OnlyLoadAppFromAsar: true,
     },
   };
 }
 
 if (require.main === module) {
   const [, , exeArg] = process.argv;
   if (!exeArg) {
     console.error("Usage: node scripts/apply-electron-fuses.js <path-to-magiorix.exe>");
     process.exit(1);
   }
   applyElectronFuses(exeArg)
     .then((res) => {
       console.log("Fuses applied successfully to:", res.target);
       console.log("Wire:", JSON.stringify(res.wire));
     })
     .catch((err) => {
       console.error("Failed to apply fuses:", err);
       process.exit(1);
     });
 }
 
 module.exports = {
   applyElectronFuses,
 };
