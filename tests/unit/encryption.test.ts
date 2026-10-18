import { describe, it, expect } from "vitest";
import { encryptAesGcm, decryptAesGcm, maskApiKey } from "@/lib/encryption";

describe("AES-256-GCM Encryption Utility", () => {
  it("encrypts and decrypts accurately", () => {
    const secret = "AIzaSyD-mock-gemini-key-1234567890abcdef";
    const encrypted = encryptAesGcm(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);

    const decrypted = decryptAesGcm(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("masks API keys properly", () => {
    expect(maskApiKey("AIzaSyD-mock-gemini-key-1234abcd")).toBe("••••abcd");
    expect(maskApiKey("1234")).toBe("••••1234");
  });
});
