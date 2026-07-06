/**
 * SecretBox — team DEK-grant reconciliation (server-only internal helper).
 *
 * A project's variables are encrypted with a per-project DEK (see
 * crypto/keypair.ts). Each authorized user holds a `ProjectKeyGrant` = the DEK
 * wrapped for their public key. The set of users who SHOULD hold a grant is:
 *   - the project owner, plus
 *   - every member/owner of any team the project is still linked to.
 *
 * When membership or team↔project links change (member removed, project
 * unlinked, team deleted), grants can outlive that authorization. This helper
 * brings the grants back in line by revoking any grant whose holder is no longer
 * authorized. It is idempotent and safe to call after any such change.
 *
 * NOTE: this is not "use server" on purpose — it must NOT be exposed as a
 * client-callable server action. It is invoked only from trusted server actions
 * (teams.ts) that have already performed their own authorization checks.
 *
 * Limitation: revoking a grant removes the user's *server-side* access to the
 * DEK, but it does not rotate the DEK. A user who cached the DEK in memory
 * before being revoked can still decrypt the current ciphertext until they lock
 * their vault. Forward-secret DEK rotation is a documented follow-up
 * (docs/team-e2e-sharing.md).
 */

import { db } from "@/lib/db";
import { selectGranteesToRevoke } from "@/lib/team-grants-logic";

/**
 * Revoke DEK grants for any user no longer authorized to access `projectId`.
 * Returns the number of grants revoked (0 if the project is unshared or all
 * grantees are still authorized).
 */
export async function reconcileProjectGrants(projectId: string): Promise<number> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) return 0;

  // Users who should currently hold a grant: members/owners of any team the
  // project is still linked to. The project owner is always authorized.
  const authorized = await db.user.findMany({
    where: {
      OR: [
        { teamMembers: { some: { team: { projects: { some: { projectId } } } } } },
        { ownedTeams: { some: { projects: { some: { projectId } } } } },
      ],
    },
    select: { id: true },
  });
  const grants = await db.projectKeyGrant.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const toRevoke = selectGranteesToRevoke(
    grants.map((g) => g.userId),
    authorized.map((u) => u.id),
    project.userId
  );
  if (toRevoke.length === 0) return 0;

  const count = await db.$transaction(async (tx) => {
    const { count } = await tx.projectKeyGrant.deleteMany({
      where: { projectId, userId: { in: toRevoke } },
    });
    // Flag the project for DEK rotation so the owner's client re-keys it and the
    // revoked member's cached DEK can't decrypt future writes (forward secrecy).
    if (count > 0) {
      await tx.project.update({
        where: { id: projectId },
        data: { dekRotationPending: true },
      });
    }
    return count;
  });
  return count;
}

/**
 * Reconcile grants for every project currently linked to a team. Used when a
 * team member is removed (they may lose access to several of the team's
 * projects at once).
 */
export async function reconcileGrantsForTeamProjects(teamId: string): Promise<void> {
  const links = await db.teamProject.findMany({
    where: { teamId },
    select: { projectId: true },
  });
  for (const { projectId } of links) {
    await reconcileProjectGrants(projectId);
  }
}
