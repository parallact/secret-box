-- AlterTable
ALTER TABLE "Project" ADD COLUMN "encryptionMigrated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserKeypair" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "wrappedPrivateKey" TEXT NOT NULL,
    "keyIv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKeypair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectKeyGrant" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectKeyGrant_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserKeypair_userId_key" ON "UserKeypair"("userId");

-- CreateIndex
CREATE INDEX "ProjectKeyGrant_userId_idx" ON "ProjectKeyGrant"("userId");

-- AddForeignKey
ALTER TABLE "UserKeypair" ADD CONSTRAINT "UserKeypair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKeyGrant" ADD CONSTRAINT "ProjectKeyGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKeyGrant" ADD CONSTRAINT "ProjectKeyGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
