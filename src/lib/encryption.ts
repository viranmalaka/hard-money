import crypto from "crypto";

function getKeyring(): Map<string, Buffer> {
  const devKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const raw = process.env.APP_ENCRYPTION_KEYS ||
    (process.env.APP_ENCRYPTION_KEY ? `current:${process.env.APP_ENCRYPTION_KEY}` :
      process.env.NODE_ENV === "production" ? "" : `current:${devKey}`);
  const keys = new Map<string, Buffer>();
  for (const entry of raw.split(",").map((v) => v.trim()).filter(Boolean)) {
    const [kid, hex] = entry.includes(":") ? entry.split(/:(.+)/, 2) : ["current", entry];
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Encryption keys must be 64 hexadecimal characters");
    keys.set(kid, Buffer.from(hex, "hex"));
  }
  if (process.env.NODE_ENV === "production" && keys.size === 0) throw new Error("APP_ENCRYPTION_KEY(S) must be configured in production");
  return keys;
}

/**
 * Encrypts plaintext using AES-256-GCM with a random 12-byte IV
 * Format: v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptAesGcm(plaintext: string): string {
  const [, key] = [...getKeyring().entries()][0] || ["current", crypto.randomBytes(32)];
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
  if (!encrypted || (!encrypted.startsWith("v1:") && !encrypted.startsWith("v2:"))) {
    throw new Error("Invalid or unversioned encrypted payload");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error("Corrupted encrypted payload format");
  }

  const [, kid, ivHex, authTagHex, ciphertextHex] = parts.length === 5
    ? parts
    : [parts[0], "current", parts[1], parts[2], parts[3]];
  const key = getKeyring().get(kid);
  if (!key) throw new Error("Unknown encryption key id");
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
