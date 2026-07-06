"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

interface ReEncryptedVariable {
  id: string;
  keyEncrypted: string;
  valueEncrypted: string;
  ivKey: string;
  ivValue: string;
}

// The caller's wrapped DEK for a project (their key grant), or null.
export async function getMyProjectGrant(projectId: string): Promise<string | null> {
  const userId = await requireAuth();
  const grant = await db.projectKeyGrant.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { wrappedDek: true },
  });
  return grant?.wrappedDek ?? null;
}

// Owner-driven lazy migration to the per-project DEK model. In one transaction:
// re-encrypt the project's variables with the DEK, store the owner's DEK grant,
// and flip encryptionMigrated. The owner already holds the plaintext (they
// decrypted with their master key client-side), so nothing is lost.
export async function migrateProjectToDek(
  projectId: string,
  ownerWrappedDek: string,
  reEncryptedVariables: ReEncryptedVariable[]
): Promise<{ error: string | null }> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, encryptionMigrated: true },
  });
  if (!project) return { error: "Project not found" };
  if (project.encryptionMigrated) return { error: null }; // already migrated (idempotent)

  // Ownership guard on every variable id being rewritten.
  const ids = reEncryptedVariables.map((v) => v.id);
  if (ids.length > 0) {
    const owned = await db.variable.count({
      where: { id: { in: ids }, environment: { projectId } },
    });
    if (owned !== ids.length) return { error: "Unauthorized variable in payload" };
  }
  // Completeness guard: must re-encrypt every variable in the project.
  const total = await db.variable.count({ where: { environment: { projectId } } });
  if (ids.length !== total) return { error: "All project variables must be re-encrypted" };

  await db.$transaction(async (tx) => {
    for (const v of reEncryptedVariables) {
      await tx.variable.update({
        where: { id: v.id },
        data: {
          keyEncrypted: v.keyEncrypted,
          valueEncrypted: v.valueEncrypted,
          ivKey: v.ivKey,
          ivValue: v.ivValue,
        },
      });
    }
    await tx.projectKeyGrant.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, wrappedDek: ownerWrappedDek },
      update: { wrappedDek: ownerWrappedDek },
    });
    await tx.project.update({ where: { id: projectId }, data: { encryptionMigrated: true } });
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { error: null };
}

// Owner grants DEK access to team members (each already wrapped for their public
// key client-side). Only members of a team the project is linked to are accepted.
export async function grantProjectAccess(
  projectId: string,
  grants: Array<{ userId: string; wrappedDek: string }>
): Promise<{ error: string | null; granted: number }> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found", granted: 0 };

  const targetIds = grants.map((g) => g.userId);
  // Valid recipients = members/owners of a team this project is linked to.
  const validMembers = await db.user.findMany({
    where: {
      id: { in: targetIds },
      OR: [
        { teamMembers: { some: { team: { projects: { some: { projectId } } } } } },
        { ownedTeams: { some: { projects: { some: { projectId } } } } },
      ],
    },
    select: { id: true },
  });
  const validSet = new Set(validMembers.map((m) => m.id));
  const toGrant = grants.filter((g) => validSet.has(g.userId));

  await db.$transaction(
    toGrant.map((g) =>
      db.projectKeyGrant.upsert({
        where: { projectId_userId: { projectId, userId: g.userId } },
        create: { projectId, userId: g.userId, wrappedDek: g.wrappedDek },
        update: { wrappedDek: g.wrappedDek },
      })
    )
  );
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { error: null, granted: toGrant.length };
}

// Revoke DEK access (on member removal / project unlink). Owner only.
export async function revokeProjectAccess(
  projectId: string,
  userIds: string[]
): Promise<{ error: string | null }> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };
  await db.$transaction(async (tx) => {
    const { count } = await tx.projectKeyGrant.deleteMany({
      where: { projectId, userId: { in: userIds } },
    });
    // Flag for DEK rotation so the revoked member's cached DEK can't decrypt
    // future writes (forward secrecy). The owner's client rotates on next open.
    if (count > 0) {
      await tx.project.update({ where: { id: projectId }, data: { dekRotationPending: true } });
    }
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { error: null };
}

// Members (and owners) of teams this project is linked to, other than the
// caller, who have a keypair — i.e. who the owner can wrap the DEK for.
export async function getShareableMembers(
  projectId: string
): Promise<Array<{ userId: string; publicKey: string }>> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return [];

  const users = await db.user.findMany({
    where: {
      id: { not: userId },
      keypair: { isNot: null },
      OR: [
        { teamMembers: { some: { team: { projects: { some: { projectId } } } } } },
        { ownedTeams: { some: { projects: { some: { projectId } } } } },
      ],
    },
    select: { id: true, keypair: { select: { publicKey: true } } },
  });
  return users
    .filter((u) => u.keypair)
    .map((u) => ({ userId: u.id, publicKey: u.keypair!.publicKey }));
}

// Team members (besides the owner) who currently hold a grant for a project —
// used by the UI to show/refresh who can decrypt.
export async function getProjectGrantees(projectId: string): Promise<string[]> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return [];
  const grants = await db.projectKeyGrant.findMany({
    where: { projectId, userId: { not: userId } },
    select: { userId: true },
  });
  return grants.map((g) => g.userId);
}

// Grantees (besides the owner) with display info, for the "who has access" UI.
export async function getProjectGranteesWithInfo(
  projectId: string
): Promise<Array<{ userId: string; name: string | null; email: string | null }>> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return [];
  const grants = await db.projectKeyGrant.findMany({
    where: { projectId, userId: { not: userId } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return grants.map((g) => ({ userId: g.user.id, name: g.user.name, email: g.user.email }));
}

// All CURRENT grant holders (including the owner) with a public key, so the
// owner's client can re-wrap a freshly rotated DEK for each of them.
export async function getGranteesForRotation(
  projectId: string
): Promise<Array<{ userId: string; publicKey: string }>> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return [];
  const grants = await db.projectKeyGrant.findMany({
    where: { projectId },
    select: { user: { select: { id: true, keypair: { select: { publicKey: true } } } } },
  });
  return grants
    .filter((g) => g.user.keypair)
    .map((g) => ({ userId: g.user.id, publicKey: g.user.keypair!.publicKey }));
}

// Owner-driven DEK rotation (forward secrecy after a revocation). The owner has
// generated a fresh DEK client-side, re-encrypted every variable with it, and
// re-wrapped it for each remaining grantee. In one transaction: rewrite the
// variables, replace all grants with the new set, and clear the rotation flag.
export async function rotateProjectDek(
  projectId: string,
  reEncryptedVariables: ReEncryptedVariable[],
  grants: Array<{ userId: string; wrappedDek: string }>
): Promise<{ error: string | null }> {
  const userId = await requireAuth();
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, encryptionMigrated: true },
  });
  if (!project) return { error: "Project not found" };
  if (!project.encryptionMigrated) return { error: "Project is not DEK-encrypted" };

  // The owner must retain access, and the new grant set must exactly match the
  // current grantees — never silently add a new recipient or drop an existing
  // one during a rotation.
  const grantIds = new Set(grants.map((g) => g.userId));
  if (!grantIds.has(userId)) return { error: "Owner grant missing" };
  const current = await db.projectKeyGrant.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const currentIds = new Set(current.map((g) => g.userId));
  if (grantIds.size !== currentIds.size || [...grantIds].some((id) => !currentIds.has(id))) {
    return { error: "Grant set does not match current grantees" };
  }

  // Ownership + completeness guards on the re-encrypted variables (same as the
  // initial migration): every variable in the project must be rewritten.
  const ids = reEncryptedVariables.map((v) => v.id);
  if (ids.length > 0) {
    const owned = await db.variable.count({
      where: { id: { in: ids }, environment: { projectId } },
    });
    if (owned !== ids.length) return { error: "Unauthorized variable in payload" };
  }
  const total = await db.variable.count({ where: { environment: { projectId } } });
  if (ids.length !== total) return { error: "All project variables must be re-encrypted" };

  await db.$transaction(async (tx) => {
    for (const v of reEncryptedVariables) {
      await tx.variable.update({
        where: { id: v.id },
        data: {
          keyEncrypted: v.keyEncrypted,
          valueEncrypted: v.valueEncrypted,
          ivKey: v.ivKey,
          ivValue: v.ivValue,
        },
      });
    }
    await tx.projectKeyGrant.deleteMany({ where: { projectId } });
    await tx.projectKeyGrant.createMany({
      data: grants.map((g) => ({ projectId, userId: g.userId, wrappedDek: g.wrappedDek })),
    });
    await tx.project.update({
      where: { id: projectId },
      data: { dekRotationPending: false },
    });
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { error: null };
}
