-- Track the authentication-material scheme for User.masterPassword so the
-- master password can stop being sent to the server (zero-knowledge / E2E).
--   1 = legacy: bcrypt(plaintext master password)
--   2 = verifier: bcrypt(client-derived, domain-separated auth verifier)
-- Existing rows keep the legacy scheme (default 1) and are transparently
-- upgraded to 2 the next time the user unlocks their vault.
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1;
