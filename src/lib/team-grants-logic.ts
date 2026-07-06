/**
 * Pure grant-reconciliation logic (no DB), split out so it can be unit-tested
 * without a database. See team-grants.ts for the DB-bound wrapper.
 */

/**
 * Given the users who currently hold a DEK grant, the users who are still
 * authorized (members/owners of a team the project is linked to), and the
 * project owner, return the grantees whose access must be revoked.
 *
 * The project owner is ALWAYS retained, even if absent from `authorizedIds`.
 */
export function selectGranteesToRevoke(
  currentGranteeIds: readonly string[],
  authorizedIds: Iterable<string>,
  ownerId: string
): string[] {
  const authorized = new Set(authorizedIds);
  authorized.add(ownerId); // never revoke the project owner
  return currentGranteeIds.filter((id) => !authorized.has(id));
}
