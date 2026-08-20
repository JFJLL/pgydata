 const fs = require("fs");
 const path = require("path");
 const crypto = require("crypto");
 const { signPayload, DEFAULT_KEY_ID } = require("./manifest-crypto");
 
 function hashFileSha256(filePath) {
   const content = fs.readFileSync(filePath);
   return crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
 }
 
 function collectAssetFiles(assetsDir) {
   const results = [];
   function walk(dir) {
     const entries = fs.readdirSync(dir, { withFileTypes: true })
       .sort((a, b) => a.name.localeCompare(b.name, "en"));
     for (const entry of entries) {
       const fullPath = path.join(dir, entry.name);
       if (entry.isDirectory()) {
         walk(fullPath);
       } else if (entry.isFile()) {
         const ext = path.extname(entry.name).toLowerCase();
         const relativePath = path.relative(assetsDir, fullPath).replace(/\\/g, "/");
         if (relativePath !== "integrity-manifest.json" && [".html", ".js", ".css"].includes(ext)) {
           const stat = fs.statSync(fullPath);
           results.push({
             path: relativePath,
             size: stat.size,
             sha256: hashFileSha256(fullPath),
           });
         }
       }
     }
   }
   walk(assetsDir);
   results.sort((a, b) => a.path.localeCompare(b.path, "en"));
   return results;
 }
 
 function generateIntegrityManifest(assetsDir, version, privateKeyPem = null, keyId = DEFAULT_KEY_ID) {
   const files = collectAssetFiles(assetsDir);
   const payload = {
     version,
     algorithm: "sha256",
     files,
   };
   const privKey = privateKeyPem || process.env.MAGIORIX_RELEASE_SIGNING_PRIVATE_KEY || null;
   const kid = process.env.MAGIORIX_RELEASE_SIGNING_KEY_ID || keyId;
   const envelope = signPayload(payload, privKey, kid);
   const manifest = {
     schemaVersion: 2,
     version,
     keyId: envelope.keyId,
     signature: envelope.signature,
     signedPayload: envelope.signedPayload,
     files,
   };
   const manifestPath = path.join(assetsDir, "integrity-manifest.json");
   fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
   return { manifestPath, manifest };
 }
 
 if (require.main === module) {
   const [, , assetsDirArg, versionArg] = process.argv;
   if (!assetsDirArg || !versionArg) {
     console.error("Usage: node scripts/generate-integrity-manifest.js <assetsDir> <version>");
     process.exit(1);
   }
   const resolvedDir = path.resolve(assetsDirArg);
   const result = generateIntegrityManifest(resolvedDir, versionArg);
   console.log("Generated integrity manifest:", result.manifestPath, "keyId:", result.manifest.keyId);
 }
 
 module.exports = {
   generateIntegrityManifest,
   collectAssetFiles,
 };
