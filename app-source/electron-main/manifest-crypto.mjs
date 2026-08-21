 import crypto from "crypto";
 
 export const TRUSTED_PUBLIC_KEYS = {
   "magiorix-release-2026-v1": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMaMnU+xxOv30CKGTxMe6SPK9ay4eN6DgTh0l/xmLwko=\n-----END PUBLIC KEY-----\n",
 };
 
 export const DEFAULT_KEY_ID = "magiorix-release-2026-v1";
 
 export function canonicalJson(obj) {
   if (obj === null || typeof obj !== "object") {
     return JSON.stringify(obj);
   }
   if (Array.isArray(obj)) {
     return "[" + obj.map(canonicalJson).join(",") + "]";
   }
   const keys = Object.keys(obj).sort();
   return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
 }
 
 export function signPayload(payload, privateKeyPem, keyId = DEFAULT_KEY_ID) {
   if (!privateKeyPem) {
     return {
       keyId: "unsigned-local",
       signature: null,
       signedPayload: payload,
     };
   }
   const canonical = canonicalJson(payload);
   const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKeyPem);
   return {
     keyId,
     signature: signature.toString("hex"),
     signedPayload: payload,
   };
 }
 
 function candidateTestPublicKeys() {
  if (process.env.MAGIORIX_CANDIDATE_TEST_MODE !== "1") return {};
  const keyId = String(process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_KEY_ID || "").trim();
  const publicKey = String(process.env.MAGIORIX_CANDIDATE_TEST_RELEASE_PUBLIC_KEY || "").trim();
  if (!keyId || !/^[A-Za-z0-9._-]{1,96}$/.test(keyId) || !publicKey.includes("BEGIN PUBLIC KEY")) {
    throw new Error("Candidate test release trust root is missing or invalid");
  }
  return { [keyId]: `${publicKey}\n` };
}
export function verifySignedEnvelope(envelope, customPublicKeys = null) {
   if (!envelope || typeof envelope !== "object") {
     return { valid: false, reason: "Envelope is not an object" };
   }
   const { keyId, signature, signedPayload } = envelope;
   if (!keyId || keyId === "unsigned-local" || !signature) {
     return { valid: false, reason: "Envelope is unsigned or unsigned-local", isUnsigned: true };
   }
   const publicKeys = customPublicKeys || { ...TRUSTED_PUBLIC_KEYS, ...candidateTestPublicKeys() };
   const pubKey = publicKeys[keyId];
   if (!pubKey) {
     return { valid: false, reason: `Unknown keyId: ${keyId}` };
   }
   const canonical = canonicalJson(signedPayload);
   try {
     const valid = crypto.verify(
       null,
       Buffer.from(canonical, "utf8"),
       pubKey,
       Buffer.from(signature, "hex"),
     );
     return { valid, reason: valid ? null : "Signature verification failed", payload: signedPayload };
   } catch (err) {
     return { valid: false, reason: `Verification error: ${err.message}` };
   }
 }
