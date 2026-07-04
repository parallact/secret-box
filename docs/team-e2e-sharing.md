# Team end-to-end sharing (envelope encryption)

## Problem

Today every secret is encrypted directly with the owner's master-password-derived
key (`deriveKey(masterPassword, salt)` in `src/lib/crypto/encryption.ts`). A team
member has their *own* master password, so there is no key any teammate could use
to decrypt a shared secret. As a result the "Teams" feature can organize
membership and roles, but **members cannot actually read another owner's secrets** —
`getProject` and the v1 API both require `userId = owner`.

This document describes the envelope-encryption design that closes that gap, and
the wiring that remains after the cryptographic foundation landed.

## Status

- ✅ **Foundation (this PR):** `src/lib/crypto/keypair.ts` (keypair gen, private-key
  wrap/unwrap/re-wrap, DEK gen, DEK wrap/unwrap) and the schema
  (`UserKeypair`, `ProjectKeyGrant`, `Project.encryptionMigrated`).
- ⏳ **Remaining:** the wiring below. It changes the core variable
  encryption path, so it must be built and **tested against a running instance**
  before being enabled — a mistake here can permanently lock secrets.

## Scheme

1. **Per-user keypair.** Each user gets an RSA-OAEP keypair. The public key is
   stored in plaintext. The private key is exported and wrapped (AES-GCM) with the
   user's master-derived key, so the server only holds ciphertext.
2. **Per-project DEK.** Each project has a random AES-GCM Data Encryption Key. Its
   variables are encrypted with the DEK (still via `encryption.ts`), not with a
   master-derived key.
3. **Grants.** The DEK is wrapped with each authorized member's public key and
   stored as a `ProjectKeyGrant`. A member unwraps the DEK with their private key.

The private key, the DEKs, and all plaintext stay in the browser.

## Data model (landed)

- `UserKeypair(userId, publicKey, wrappedPrivateKey, keyIv)`
- `ProjectKeyGrant(projectId, userId, wrappedDek)` — PK `(projectId, userId)`
- `Project.encryptionMigrated: boolean` — DEK-encrypted vs legacy owner-key.

## Remaining wiring

1. **Keypair lifecycle** — on vault unlock, if the user has no `UserKeypair`,
   `generateUserKeypair()` → store `{publicKey, wrap(privateKey, masterKey)}`;
   always unwrap the private key into the vault store (in memory only). New actions:
   `ensureKeypair`, `getKeypair`.
2. **Per-project DEK + lazy migration** — when the owner opens a project with
   `encryptionMigrated = false`: `generateDek()`, re-encrypt every variable
   (decrypt with the owner master key → encrypt with the DEK), create the owner's
   grant (`wrapDekForPublicKey(dek, ownerPublicKey)`), and flip
   `encryptionMigrated = true` — all in one transaction.
3. **Vault store** — track unwrapped per-project DEKs. `getProjectKey(projectId)`
   returns the DEK for a migrated project (unwrap the caller's grant) or the master
   key for a legacy one. Variable read/write dialogs use this instead of the raw
   master `cryptoKey`.
4. **Sharing** — on `linkProjectToTeam` (and when inviting a member to a team that
   already has projects), the owner unwraps each project DEK, fetches each member's
   public key, and creates grants. New action `grantProjectAccess(projectId, grants)`.
5. **Member read authz** — `getProject` and `/api/v1/projects/*` must also allow a
   user who holds a `ProjectKeyGrant` (i.e. is a member of a team the project is
   linked to) and return that grant so the client can unwrap the DEK.
6. **Master-password change** — extend `/api/user/change-master-password` to also
   accept the re-wrapped private key (`rewrapPrivateKey(...)`). The keypair itself
   does not change, so existing grants stay valid; only its wrapping key rotates.
7. **Revocation** — removing a member or unlinking a project deletes their grants.
   For forward secrecy, also rotate the project DEK and re-encrypt (follow-up).

## Testing checklist (before enabling)

- Owner creates a project, adds variables, opens it → lazy migration runs once;
  variables still decrypt; second open does not re-migrate.
- Owner shares the project with a team; a member logs in with a *different* master
  password and can read the shared variables.
- Member without a grant / not on the team cannot fetch the project (authz).
- Owner changes their master password → can still unlock and read; existing grants
  still valid; a member is unaffected.
- Remove a member → their grant is gone and they can no longer read.
- API token path returns ciphertext only (server never decrypts).
