"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

export interface StoredKeypair {
  publicKey: string;
  wrappedPrivateKey: string;
  keyIv: string;
}

// Get the current user's keypair (public + wrapped private), or null if none yet.
export async function getMyKeypair(): Promise<StoredKeypair | null> {
  const userId = await requireAuth();
  return db.userKeypair.findUnique({
    where: { userId },
    select: { publicKey: true, wrappedPrivateKey: true, keyIv: true },
  });
}

// Persist a freshly generated keypair. Never overwrites an existing one — the
// keypair is stable so that existing DEK grants stay valid.
export async function saveMyKeypair(data: StoredKeypair): Promise<void> {
  const userId = await requireAuth();
  await db.userKeypair.upsert({
    where: { userId },
    create: { userId, ...data },
    update: {},
  });
}

// Re-wrap the private key under a new master key (on master-password change).
// The keypair itself is unchanged, so grants remain valid.
export async function rewrapMyKeypair(wrappedPrivateKey: string, keyIv: string): Promise<void> {
  const userId = await requireAuth();
  await db.userKeypair.update({
    where: { userId },
    data: { wrappedPrivateKey, keyIv },
  });
}

// Public keys for a set of users (to wrap a project DEK for them). Only returns
// users that have a keypair. Caller must be authenticated.
export async function getPublicKeysFor(
  userIds: string[]
): Promise<Array<{ userId: string; publicKey: string }>> {
  await requireAuth();
  if (userIds.length === 0) return [];
  const rows = await db.userKeypair.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, publicKey: true },
  });
  return rows;
}
