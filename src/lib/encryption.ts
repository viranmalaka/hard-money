import crypto from "crypto";

const DEFAULT_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getEncryptionKey(): Buffer {
  const hexKey = process.env.APP_ENCRYPTION_KEY || DEFAULT_KEY;
  if (hexKey.length === 64) {
    return Buffer.from(hexKey, "hex");
  }
  // Fallback: derive 32-byte key via SHA-256
  return crypto.createHash("sha256").update(hexKey).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with a random 12-byte IV
 * Format: v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptAesGcm(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
}

/**
 * Decrypts ciphertext previously encrypted with encryptAesGcm
 */
export function decryptAesGcm(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith("v1:")) {
    throw new Error("Invalid or unversioned encrypted payload");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Corrupted encrypted payload format");
  }

  const [, ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Helper to mask an API key for safe display (e.g. ••••abcd)
 */
export function maskApiKey(rawKey: string): string {
  if (!rawKey) return "";
  const last4 = rawKey.slice(-4);
  return `••••${last4}`;
}
