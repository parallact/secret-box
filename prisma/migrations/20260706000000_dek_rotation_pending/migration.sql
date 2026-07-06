-- Add per-project DEK rotation flag for forward secrecy on grant revocation.
ALTER TABLE "Project" ADD COLUMN "dekRotationPending" BOOLEAN NOT NULL DEFAULT false;
