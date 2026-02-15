import { describe, it, expect } from "vitest";
import { encryptAesGcm, decryptAesGcm } from "../../../src/main/crypto/aes-gcm";

describe("AES-GCM crypto", () => {
  it("encrypts and decrypts a buffer round-trip", () => {
    const plaintext = Buffer.from("Hello, World!");
    const { ciphertext, key } = encryptAesGcm(plaintext);
    // ciphertext has nonce prepended, decrypt extracts it
    const decrypted = decryptAesGcm(ciphertext, key);
    expect(decrypted.toString()).toBe("Hello, World!");
  });

  it("produces a 16-byte key", () => {
    const { key } = encryptAesGcm(Buffer.from("test"));
    expect(key.length).toBe(16);
  });

  it("produces a 12-byte nonce", () => {
    const { nonce } = encryptAesGcm(Buffer.from("test"));
    expect(nonce.length).toBe(12);
  });

  it("ciphertext includes nonce (12) + encrypted data + auth tag (16)", () => {
    const plaintext = Buffer.from("exact length test data!!");
    const { ciphertext } = encryptAesGcm(plaintext);
    // nonce (12) + encrypted (same as plaintext length) + auth tag (16)
    expect(ciphertext.length).toBe(12 + plaintext.length + 16);
  });

  it("generates unique keys and nonces per call", () => {
    const a = encryptAesGcm(Buffer.from("same data"));
    const b = encryptAesGcm(Buffer.from("same data"));
    expect(a.key.equals(b.key)).toBe(false);
    expect(a.nonce.equals(b.nonce)).toBe(false);
  });

  it("nonce is prepended to ciphertext (nMobile convention)", () => {
    const plaintext = Buffer.from("nonce check");
    const { ciphertext, nonce } = encryptAesGcm(plaintext);
    // First 12 bytes of ciphertext should be the nonce
    expect(ciphertext.subarray(0, 12).equals(nonce)).toBe(true);
  });

  it("decryption fails with wrong key", () => {
    const plaintext = Buffer.from("sensitive");
    const { ciphertext } = encryptAesGcm(plaintext);
    const wrongKey = Buffer.alloc(16, 0xff);
    expect(() => decryptAesGcm(ciphertext, wrongKey)).toThrow();
  });

  it("decryption fails with tampered ciphertext", () => {
    const plaintext = Buffer.from("integrity check");
    const { ciphertext, key } = encryptAesGcm(plaintext);
    // Flip a byte in the encrypted data (after nonce, before auth tag)
    const tampered = Buffer.from(ciphertext);
    tampered[14] ^= 0xff;
    expect(() => decryptAesGcm(tampered, key)).toThrow();
  });

  it("handles empty plaintext", () => {
    const plaintext = Buffer.alloc(0);
    const { ciphertext, key } = encryptAesGcm(plaintext);
    // nonce (12) + auth tag (16) = 28 bytes
    expect(ciphertext.length).toBe(28);
    const decrypted = decryptAesGcm(ciphertext, key);
    expect(decrypted.length).toBe(0);
  });

  it("handles large plaintext", () => {
    const plaintext = Buffer.alloc(1024 * 1024, 0xab); // 1MB
    const { ciphertext, key } = encryptAesGcm(plaintext);
    const decrypted = decryptAesGcm(ciphertext, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("key as byte array round-trip (nMobile interop)", () => {
    const plaintext = Buffer.from("interop test");
    const { ciphertext, key } = encryptAesGcm(plaintext);

    // Simulate nMobile wire format: key as byte array
    const keyArray = Array.from(key);
    const restoredKey = Buffer.from(keyArray);

    const decrypted = decryptAesGcm(ciphertext, restoredKey);
    expect(decrypted.toString()).toBe("interop test");
  });

  it("supports custom nonce size parameter", () => {
    const plaintext = Buffer.from("custom nonce");
    const { ciphertext, key } = encryptAesGcm(plaintext);
    // Default nonce size is 12
    const decrypted = decryptAesGcm(ciphertext, key, 12);
    expect(decrypted.toString()).toBe("custom nonce");
  });
});
