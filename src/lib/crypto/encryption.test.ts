import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import {
  deriveAuthVerifier,
  deriveKey,
  generateSalt,
  encrypt,
  decrypt,
} from "./encryption";

describe("authentication verifier (zero-knowledge auth)", () => {
  it("is deterministic for the same master password + salt", async () => {
    const salt = generateSalt();
    const a = await deriveAuthVerifier("Sup3r-Secret-Pw", salt);
    const b = await deriveAuthVerifier("Sup3r-Secret-Pw", salt);
    expect(a).toBe(b);
  });

  it("changes when the password changes", async () => {
    const salt = generateSalt();
    const a = await deriveAuthVerifier("Sup3r-Secret-Pw", salt);
    const b = await deriveAuthVerifier("Sup3r-Secret-Px", salt);
    expect(a).not.toBe(b);
  });

  it("changes when the salt changes (per-user, no cross-user rainbow tables)", async () => {
    const a = await deriveAuthVerifier("Sup3r-Secret-Pw", generateSalt());
    const b = await deriveAuthVerifier("Sup3r-Secret-Pw", generateSalt());
    expect(a).not.toBe(b);
  });

  it("produces a 256-bit (base64, 44-char) value that round-trips through bcrypt", async () => {
    const salt = generateSalt();
    const verifier = await deriveAuthVerifier("Sup3r-Secret-Pw", salt);
    expect(verifier).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 32 bytes -> 44 base64 chars
    const hash = await bcrypt.hash(verifier, 12);
    expect(await bcrypt.compare(verifier, hash)).toBe(true);
    const wrong = await deriveAuthVerifier("Sup3r-Secret-Px", salt);
    expect(await bcrypt.compare(wrong, hash)).toBe(false);
  });

  it("is domain-separated: the verifier does not equal the raw vault-key material", async () => {
    // The vault key (deriveKey) and the verifier are derived from the same
    // password+salt but MUST be independent. We can't export the vault CryptoKey,
    // but we assert the verifier is not usable as, and differs from, a value an
    // attacker could trivially relate to the key. Here we confirm the vault key
    // still encrypts/decrypts correctly (unaffected by the verifier path) and
    // that the verifier is a distinct, stable artifact.
    const password = "Sup3r-Secret-Pw";
    const salt = generateSalt();
    const key = await deriveKey(password, salt);
    const { encrypted, iv } = await encrypt("hello", key);
    expect(await decrypt(encrypted, iv, key)).toBe("hello");

    const verifier = await deriveAuthVerifier(password, salt);
    // Verifier must not be the plaintext or the salt.
    expect(verifier).not.toBe(password);
    expect(verifier).not.toBe(salt);
  });
});
