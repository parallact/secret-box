/**
 * SecretBox — envelope-encryption primitives for team sharing.
 *
 * The base module (./encryption.ts) encrypts every secret directly with the
 * owner's master-password-derived key, so only the owner can ever decrypt.
 * That has no way to let a teammate — who has their *own* master password —
 * read a shared secret.
 *
 * This module adds the standard envelope (key-wrapping) scheme so team members
 * can decrypt shared secrets without anyone sharing a master password:
 *
 *   1. Each user has an RSA-OAEP keypair. The public key is stored in plaintext;
 *      the private key is exported and encrypted (wrapped) with the user's
 *      master-derived AES key, so the server only ever holds the ciphertext.
 *   2. Each project has a random AES-GCM Data Encryption Key (DEK). Its variables
 *      are encrypted with the DEK (via ./encryption.ts's encrypt/decrypt), NOT
 *      with a master-derived key directly.
 *   3. The DEK is wrapped with each authorized member's public key and stored as
 *      a per-(project, user) grant. A member unwraps the DEK with their private
 *      key and decrypts the variables.
 *
 * Everything here runs in the browser. The server never sees a private key, a
 * DEK, or any plaintext.
 *
 * These primitives are wired into production via the vault store (keypair
 * lifecycle + per-project DEKs), the lazy per-project migration and sharing
 * server actions (src/lib/actions/keypair.ts, project-keys.ts), and the
 * master-password rotation flow (which re-wraps the private key). A mistake here
 * can permanently lock secrets — see docs/team-e2e-sharing.md.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from "./encryption";

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGORITHM = "AES-GCM";
const DEK_LENGTH = 256;
const IV_LENGTH = 12;

export interface WrappedPrivateKey {
  /** base64 of the AES-GCM-encrypted PKCS8 private key */
  wrapped: string;
  /** base64 of the IV used to wrap it */
  iv: string;
}

/**
 * Generate a fresh RSA-OAEP keypair for a user. The private key is extractable
 * so it can be exported and wrapped for storage; the public key is exported and
 * stored in plaintext.
 */
export async function generateUserKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
}

/** Export a public key as base64 (SPKI). Safe to store/serve in plaintext. */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(spki);
}

/** Import a base64 (SPKI) public key for wrapping DEKs to a member. */
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const spki = base64ToArrayBuffer(spkiBase64);
  return crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, true, [
    "encrypt",
  ]);
}

/**
 * Wrap (encrypt) a private key with the user's master-derived AES key, for
 * storage. The wrapped blob is useless without the master password.
 */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  masterKey: CryptoKey
): Promise<WrappedPrivateKey> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrapped = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv as Uint8Array<ArrayBuffer> },
    masterKey,
    pkcs8
  );
  return {
    wrapped: arrayBufferToBase64(wrapped),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Unwrap (decrypt) the stored private key with the user's master-derived AES key.
 * Returns an RSA-OAEP private key usable for unwrapping DEK grants.
 */
export async function unwrapPrivateKey(
  wrappedBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const wrapped = base64ToArrayBuffer(wrappedBase64);
  const iv = base64ToArrayBuffer(ivBase64);
  const pkcs8 = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(iv) as Uint8Array<ArrayBuffer> },
    masterKey,
    wrapped
  );
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, true, [
    "decrypt",
  ]);
}

/**
 * Re-wrap a private key under a NEW master-derived key. Used when the master
 * password changes: the keypair itself stays the same (so existing DEK grants
 * remain valid) — only its wrapping key rotates.
 */
export async function rewrapPrivateKey(
  wrappedBase64: string,
  ivBase64: string,
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey
): Promise<WrappedPrivateKey> {
  const privateKey = await unwrapPrivateKey(wrappedBase64, ivBase64, oldMasterKey);
  return wrapPrivateKey(privateKey, newMasterKey);
}

/** Generate a fresh per-project Data Encryption Key (extractable, so it can be wrapped). */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGORITHM, length: DEK_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Wrap a project DEK for a member's public key. The resulting blob can only be
 * unwrapped by the holder of that member's private key.
 */
export async function wrapDekForPublicKey(dek: CryptoKey, publicKey: CryptoKey): Promise<string> {
  const rawDek = await crypto.subtle.exportKey("raw", dek);
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawDek);
  return arrayBufferToBase64(wrapped);
}

/**
 * Unwrap a project DEK grant with the current user's private key. Returns an
 * AES-GCM key usable with ./encryption.ts's encrypt/decrypt for the project's
 * variables.
 */
export async function unwrapDekWithPrivateKey(
  wrappedBase64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const wrapped = base64ToArrayBuffer(wrappedBase64);
  const rawDek = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, wrapped);
  return crypto.subtle.importKey("raw", rawDek, { name: AES_ALGORITHM, length: DEK_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}
