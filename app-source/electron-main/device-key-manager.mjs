import crypto from "crypto";
import fs from "fs";
import path from "path";

let electronSafeStorage = null;
try {
  const electron = await import("electron");
  electronSafeStorage = electron.safeStorage;
} catch {
  // Test/Node environment
}

export class DeviceKeyManager {
  constructor({ baseDir = null, keyFileName = "device-identity.json", requireProtectedStorage = false } = {}) {
    this.baseDir = baseDir;
    this.keyFilePath = baseDir ? path.join(baseDir, keyFileName) : null;
    this.requireProtectedStorage = requireProtectedStorage;
    this.deviceKeyId = null;
    this.publicKeyPem = null;
    this.privateKeyPem = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.requireProtectedStorage && (!electronSafeStorage || !electronSafeStorage.isEncryptionAvailable())) {
      throw new Error("Protected device-key storage is required but unavailable" );
    }

    if (this.keyFilePath && fs.existsSync(this.keyFilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.keyFilePath, "utf8"));
        let privPem = null;

        if (raw.encryptedPrivateKey && electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
          const decrypted = electronSafeStorage.decryptString(Buffer.from(raw.encryptedPrivateKey, "base64"));
          privPem = decrypted;
        } else if (raw.privateKeyPem) {
          if (this.requireProtectedStorage) {
            fs.rmSync(this.keyFilePath, { force: true });
            throw new Error("Revoked legacy plaintext device key; initialize a new protected identity" );
          }
          privPem = raw.privateKeyPem;
        }

        if (raw.deviceKeyId && raw.publicKeyPem && privPem) {
          this.deviceKeyId = raw.deviceKeyId;
          this.publicKeyPem = raw.publicKeyPem;
          this.privateKeyPem = privPem;
          this.initialized = true;
          return;
        }
      } catch (err) {
        // Corrupted file -> regenerate
      }
    }

    // Generate new Ed25519 keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pubPem = publicKey.export({ type: "spki", format: "pem" });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" });

    const keyHash = crypto.createHash("sha256").update(pubPem).digest("hex").slice(0, 16);
    this.deviceKeyId = `dev_${keyHash}`;
    this.publicKeyPem = pubPem;
    this.privateKeyPem = privPem;

    if (this.keyFilePath) {
      fs.mkdirSync(path.dirname(this.keyFilePath), { recursive: true });
      const record = {
        deviceKeyId: this.deviceKeyId,
        publicKeyPem: this.publicKeyPem,
        createdAt: new Date().toISOString(),
      };

      if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
        const encrypted = electronSafeStorage.encryptString(privPem);
        record.encryptedPrivateKey = encrypted.toString("base64");
      } else {
        if (this.requireProtectedStorage) {
          throw new Error("Protected device-key storage is required but unavailable");
        }
        record.privateKeyPem = privPem;
      }

      fs.writeFileSync(this.keyFilePath, JSON.stringify(record, null, 2) + "\n", "utf8");
    }

    this.initialized = true;
  }

  getDeviceKeyId() {
    if (!this.initialized) throw new Error("DeviceKeyManager is not initialized");
    return this.deviceKeyId;
  }

  getPublicKeyPem() {
    if (!this.initialized) throw new Error("DeviceKeyManager is not initialized");
    return this.publicKeyPem;
  }

  exportReceiptSigningSeedB64() {
    if (!this.initialized || !this.privateKeyPem) {
      throw new Error("DeviceKeyManager is not initialized");
    }
    const key = crypto.createPrivateKey(this.privateKeyPem);
    const jwk = key.export({ format: "jwk" });
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string") {
      throw new Error("Device signing key is not an Ed25519 private key");
    }
    const seed = Buffer.from(jwk.d, "base64url");
    if (seed.length !== 32) throw new Error("Device Ed25519 signing seed must be 32 bytes");
    return seed.toString("base64");
  }

  sign(content) {
    if (!this.initialized) throw new Error("DeviceKeyManager is not initialized");
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
    const sig = crypto.sign(null, buf, this.privateKeyPem);
    return sig.toString("hex");
  }
}

