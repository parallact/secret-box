/**
 * SecretBox Encryption Module
 *
 * Uses Web Crypto API for end-to-end encryption.
 * All encryption/decryption happens in the browser.
 * The server never sees plaintext secrets.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const ITERATIONS = 600000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Convert ArrayBuffer to base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

/**
 * Generate a random IV for encryption
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Derive an encryption key from a master password and salt
 */
export async function deriveKey(
  masterPassword: string,
  saltBase64: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = base64ToArrayBuffer(saltBase64);

  // Import the master password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive the actual encryption key
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt) as Uint8Array<ArrayBuffer>,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );

  return key;
}

/**
 * Domain-separation label for the authentication verifier. Combined with the
 * per-user salt it makes the verifier's PBKDF2 input distinct from the vault
 * key's, so the two derivations are cryptographically independent: learning the
 * verifier (or its bcrypt hash) reveals nothing about the AES vault key.
 */
const AUTH_VERIFIER_LABEL = "secretbox-auth-verifier|v1|";

/**
 * Derive the server-side authentication VERIFIER from the master password.
 *
 * This is the ONLY master-password-derived value that is ever sent to the
 * server. The server stores bcrypt(verifier) and compares against it on
 * unlock / register / master-password change. The plaintext master password
 * and the AES vault key (see deriveKey) never leave the browser, preserving the
 * end-to-end / zero-knowledge model.
 *
 * The verifier is domain-separated from the vault key via AUTH_VERIFIER_LABEL,
 * so it cannot be used to reconstruct the vault key. Returns base64 of 32 bytes
 * (well under bcrypt's 72-byte input limit).
 */
export async function deriveAuthVerifier(
  masterPassword: string,
  saltBase64: string
): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = new Uint8Array(base64ToArrayBuffer(saltBase64));

  // Prefix the salt with a fixed label so the PBKDF2 salt differs from the one
  // deriveKey() uses (the raw salt), guaranteeing independent outputs.
  const labelBytes = encoder.encode(AUTH_VERIFIER_LABEL);
  const verifierSalt = new Uint8Array(labelBytes.length + saltBytes.length);
  verifierSalt.set(labelBytes, 0);
  verifierSalt.set(saltBytes, labelBytes.length);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: verifierSalt as Uint8Array<ArrayBuffer>,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH
  );

  return arrayBufferToBase64(bits);
}

/**
 * Encrypt a string value
 * Returns: { encrypted: base64, iv: base64 }
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = generateIV();

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as Uint8Array<ArrayBuffer> },
    key,
    encoder.encode(plaintext)
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt an encrypted value
 */
export async function decrypt(
  encryptedBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder();
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(iv) as Uint8Array<ArrayBuffer> },
    key,
    encrypted
  );

  return decoder.decode(decrypted);
}

/**
 * Encrypt a key-value pair
 */
export async function encryptVariable(
  key: string,
  value: string,
  cryptoKey: CryptoKey
): Promise<{
  keyEncrypted: string;
  valueEncrypted: string;
  ivKey: string;
  ivValue: string;
}> {
  const [keyResult, valueResult] = await Promise.all([
    encrypt(key, cryptoKey),
    encrypt(value, cryptoKey),
  ]);

  return {
    keyEncrypted: keyResult.encrypted,
    valueEncrypted: valueResult.encrypted,
    ivKey: keyResult.iv,
    ivValue: valueResult.iv,
  };
}

/**
 * Decrypt a key-value pair
 */
export async function decryptVariable(
  keyEncrypted: string,
  valueEncrypted: string,
  ivKey: string,
  ivValue: string,
  cryptoKey: CryptoKey
): Promise<{ key: string; value: string }> {
  const [key, value] = await Promise.all([
    decrypt(keyEncrypted, ivKey, cryptoKey),
    decrypt(valueEncrypted, ivValue, cryptoKey),
  ]);

  return { key, value };
}

/**
 * Validate master password strength
 */
export function validateMasterPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate password strength (0-100)
 */
export function calculatePasswordStrength(password: string): number {
  let strength = 0;

  // Length
  if (password.length >= 8) strength += 20;
  if (password.length >= 12) strength += 20;
  if (password.length >= 16) strength += 10;

  // Character types
  if (/[a-z]/.test(password)) strength += 10;
  if (/[A-Z]/.test(password)) strength += 10;
  if (/[0-9]/.test(password)) strength += 10;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 20;

  return Math.min(100, strength);
}
