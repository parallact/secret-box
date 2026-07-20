import { z } from "zod";

// Email validation
export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .max(254, "Email cannot exceed 254 characters")
  .email("Invalid email format");

// Account password validation (for login)
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

// Master password validation (stronger requirements)
export const masterPasswordSchema = z
  .string()
  .min(12, "Master password must be at least 12 characters")
  .max(128, "Master password is too long")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number");

// Name validation
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name cannot exceed 50 characters")
  .regex(
    /^(?=.*\p{L})[\p{L}\s\-']+$/u,
    "Only letters, spaces, hyphens, and apostrophes allowed"
  );

// Base64 blob (salt / verifier) sent from the client. We never see the
// plaintext master password, so we only sanity-check shape here.
const base64BlobSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Invalid encoding");

// Registration schema (zero-knowledge): the client derives the encryption salt
// and the authentication verifier locally and sends only those. The plaintext
// master password never reaches the server, so master-password strength is
// enforced client-side (see validateMasterPassword) instead of here.
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  masterVerifier: base64BlobSchema,
  encryptionSalt: base64BlobSchema,
});

// Login schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

// Unlock vault schema (zero-knowledge). The client always sends the derived
// `verifier`. `masterPassword` (plaintext) is present ONLY for legacy accounts
// (authVersion 1) whose stored hash is still over the plaintext — it is used
// once to verify + transparently upgrade them to the verifier scheme, after
// which it is never sent again.
export const unlockSchema = z.object({
  verifier: base64BlobSchema,
  masterPassword: z.string().min(1).max(128).optional(),
});

// Project schema
export const projectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name is too long")
    .trim(),
  path: z
    .string()
    .max(500, "Path is too long")
    .optional()
    .nullable(),
});

// Environment schema
export const environmentSchema = z.object({
  name: z
    .string()
    .min(1, "Environment name is required")
    .max(50, "Environment name is too long")
    .trim(),
});

// Variable key validation (environment variable naming convention)
export const variableKeySchema = z
  .string()
  .min(1, "Variable key is required")
  .max(255, "Variable key is too long")
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Variable key must start with a letter or underscore, and contain only letters, numbers, and underscores"
  );

// Variable schema (encrypted data)
export const variableSchema = z.object({
  keyEncrypted: z.string().min(1),
  valueEncrypted: z.string().min(1),
  ivKey: z.string().min(1),
  ivValue: z.string().min(1),
  isSecret: z.boolean().default(false),
});

// 2FA schemas
export const totpCodeSchema = z
  .string()
  .length(6, "Code must be 6 digits")
  .regex(/^\d{6}$/, "Code must contain only numbers");

// Backup code schema
export const backupCodeSchema = z
  .string()
  .min(1, "Backup code is required")
  .max(20, "Invalid backup code")
  .regex(/^[A-Za-z0-9\-]+$/, "Invalid backup code format");

// API Token schema
export const apiTokenSchema = z.object({
  name: z
    .string()
    .min(1, "Token name is required")
    .max(100, "Token name is too long")
    .trim(),
  permissions: z.array(z.enum(["READ", "WRITE"])).min(1, "At least one permission is required"),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Helper to validate and return typed data or error
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError?.message || "Validation failed",
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UnlockInput = z.infer<typeof unlockSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type EnvironmentInput = z.infer<typeof environmentSchema>;
export type VariableInput = z.infer<typeof variableSchema>;
export type ApiTokenInput = z.infer<typeof apiTokenSchema>;
export type BackupCodeInput = z.infer<typeof backupCodeSchema>;
