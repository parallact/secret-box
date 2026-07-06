"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireProjectOwnership } from "@/lib/auth-helpers";
import {
  reconcileProjectGrants,
  reconcileGrantsForTeamProjects,
} from "@/lib/team-grants";

export type TeamRole = "ADMIN" | "MEMBER" | "VIEWER";

interface CreateTeamInput {
  name: string;
}

interface InviteMemberInput {
  teamId: string;
  email: string;
  role: TeamRole;
}

const KNOWN_ERRORS = [
  "Unauthorized",
  "Team not found",
  "Team not found or you don't have permission",
  "Team not found or you're not the owner",
  "This user is not registered in My Secret Box.",
  "User is already a member of this team",
  "Invite already pending for this user",
  "Invite not found",
  "Member not found",
  "Cannot remove the team owner",
  "Project not found",
];

function isKnownError(error: unknown): boolean {
  return error instanceof Error && KNOWN_ERRORS.includes(error.message);
}

/**
 * Helper to verify team admin access
 */
async function requireTeamAdminAccess(teamId: string, userId: string) {
  const team = await db.team.findFirst({
    where: {
      id: teamId,
      OR: [
        { ownerId: userId },
        {
          members: {
            some: {
              userId,
              role: "ADMIN",
            },
          },
        },
      ],
    },
  });

  if (!team) {
    throw new Error("Team not found or you don't have permission");
  }

  return team;
}

/**
 * Helper to verify team membership (any role)
 */
async function requireTeamMemberAccess(teamId: string, userId: string) {
  const team = await db.team.findFirst({
    where: {
      id: teamId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  return team;
}

export async function createTeam(data: CreateTeamInput) {
  try {
    const userId = await requireAuth();

    const team = await db.team.create({
      data: {
        name: data.name,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: "ADMIN",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    await logAudit({
      userId,
      action: "CREATE_TEAM",
      resource: "TEAM",
      resourceId: team.id,
    });

    revalidatePath("/dashboard/teams");

    return team;
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to create team");
  }
}

export async function getTeams() {
  try {
    const userId = await requireAuth();

    const teams = await db.team.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        projects: {
          include: {
            project: {
              select: { id: true, name: true },
            },
          },
        },
        _count: {
          select: { members: true, projects: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return teams;
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to load teams");
  }
}

export async function getTeam(teamId: string) {
  try {
    const userId = await requireAuth();
    await requireTeamMemberAccess(teamId, userId);

    const team = await db.team.findFirst({
      where: { id: teamId },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        projects: {
          include: {
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!team) {
      throw new Error("Team not found");
    }

    return team;
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to load team");
  }
}

export async function inviteMember(data: InviteMemberInput): Promise<{ error?: string }> {
  try {
    const userId = await requireAuth();
    await requireTeamAdminAccess(data.teamId, userId);

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (!user) {
      throw new Error("This user is not registered in My Secret Box.");
    }

    // Check if already a member
    const existingMember = await db.teamMember.findUnique({
      where: { teamId_userId: { teamId: data.teamId, userId: user.id } },
    });
    if (existingMember) {
      throw new Error("User is already a member of this team");
    }

    // Check for existing pending invite
    const existingInvite = await db.teamInvite.findUnique({
      where: { teamId_userId: { teamId: data.teamId, userId: user.id } },
    });
    if (existingInvite?.status === "PENDING") {
      throw new Error("Invite already pending for this user");
    }

    // Create or re-activate invite
    await db.teamInvite.upsert({
      where: { teamId_userId: { teamId: data.teamId, userId: user.id } },
      update: { status: "PENDING", role: data.role },
      create: { teamId: data.teamId, userId: user.id, role: data.role },
    });

    await logAudit({
      userId,
      action: "UPDATE_TEAM",
      resource: "TEAM",
      resourceId: data.teamId,
      metadata: { action: "invite_member", invitedUserId: user.id },
    });

    revalidatePath(`/dashboard/teams/${data.teamId}`);
    revalidatePath("/dashboard/invites");
    return {};
  } catch (error) {
    if (isKnownError(error)) return { error: (error as Error).message };
    return { error: "Failed to invite member" };
  }
}

export async function getPendingInvites() {
  try {
    const userId = await requireAuth();
    return db.teamInvite.findMany({
      where: { userId, status: "PENDING" },
      include: {
        team: {
          include: {
            owner: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to load invites");
  }
}

export async function respondToInvite(inviteId: string, accept: boolean) {
  try {
    const userId = await requireAuth();
    const invite = await db.teamInvite.findFirst({
      where: { id: inviteId, userId },
    });

    if (!invite || invite.status !== "PENDING") {
      throw new Error("Invite not found");
    }

    if (accept) {
      await db.$transaction([
        db.teamMember.create({
          data: { teamId: invite.teamId, userId, role: invite.role as TeamRole },
        }),
        db.teamInvite.update({ where: { id: inviteId }, data: { status: "ACCEPTED" } }),
      ]);
    } else {
      await db.teamInvite.update({ where: { id: inviteId }, data: { status: "REJECTED" } });
    }

    revalidatePath("/dashboard/teams");
    revalidatePath("/dashboard/invites");
    revalidatePath("/dashboard", "layout");
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to respond to invite");
  }
}

export async function removeMember(teamId: string, memberId: string) {
  try {
    const userId = await requireAuth();
    const team = await requireTeamAdminAccess(teamId, userId);

    // Can't remove the owner — scope memberId to teamId to prevent IDOR
    const member = await db.teamMember.findFirst({
      where: { id: memberId, teamId },
      include: { user: true },
    });

    if (!member) {
      throw new Error("Member not found");
    }

    if (member.userId === team.ownerId) {
      throw new Error("Cannot remove the team owner");
    }

    await db.teamMember.delete({
      where: { id: memberId },
    });

    // Revoke the removed member's DEK grants for this team's shared projects,
    // unless they still have access via another team (reconcile handles that).
    await reconcileGrantsForTeamProjects(teamId);

    await logAudit({
      userId,
      action: "UPDATE_TEAM",
      resource: "TEAM",
      resourceId: teamId,
      metadata: { action: "remove_member", removedUserId: member.userId },
    });

    revalidatePath(`/dashboard/teams/${teamId}`);
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to remove member");
  }
}

export async function updateMemberRole(
  teamId: string,
  memberId: string,
  role: TeamRole
) {
  try {
    const userId = await requireAuth();
    await requireTeamAdminAccess(teamId, userId);

    // Verify memberId belongs to this team before updating (prevent IDOR)
    const existing = await db.teamMember.findFirst({
      where: { id: memberId, teamId },
    });
    if (!existing) throw new Error("Member not found");

    const member = await db.teamMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    revalidatePath(`/dashboard/teams/${teamId}`);

    return member;
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to update member role");
  }
}

export async function linkProjectToTeam(teamId: string, projectId: string) {
  try {
    const userId = await requireAuth();

    // Verify user is admin of the team and owns the project
    await Promise.all([
      requireTeamAdminAccess(teamId, userId),
      requireProjectOwnership(projectId, userId),
    ]);

    await db.teamProject.create({
      data: {
        teamId,
        projectId,
      },
    });

    revalidatePath(`/dashboard/teams/${teamId}`);
    revalidatePath(`/dashboard/projects/${projectId}`);
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to link project to team");
  }
}

export async function unlinkProjectFromTeam(teamId: string, projectId: string) {
  try {
    const userId = await requireAuth();
    await requireTeamAdminAccess(teamId, userId);

    await db.teamProject.delete({
      where: {
        teamId_projectId: {
          teamId,
          projectId,
        },
      },
    });

    // Members who had access to this project only via this team link lose their
    // grant; anyone still connected through another team keeps it.
    await reconcileProjectGrants(projectId);

    revalidatePath(`/dashboard/teams/${teamId}`);
    revalidatePath(`/dashboard/projects/${projectId}`);
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to unlink project from team");
  }
}

export async function deleteTeam(teamId: string) {
  try {
    const userId = await requireAuth();

    // Only owner can delete team
    const team = await db.team.findFirst({
      where: {
        id: teamId,
        ownerId: userId,
      },
    });

    if (!team) {
      throw new Error("Team not found or you're not the owner");
    }

    // Capture the projects this team shares before the cascade removes the
    // links, so we can revoke the now-orphaned grants afterward.
    const linkedProjects = await db.teamProject.findMany({
      where: { teamId },
      select: { projectId: true },
    });

    await db.team.delete({
      where: { id: teamId },
    });

    // Members lose their grants for this team's projects unless another team
    // still links them.
    for (const { projectId } of linkedProjects) {
      await reconcileProjectGrants(projectId);
    }

    await logAudit({
      userId,
      action: "DELETE_TEAM",
      resource: "TEAM",
      resourceId: teamId,
    });

    revalidatePath("/dashboard/teams");
  } catch (error) {
    if (isKnownError(error)) throw error;
    throw new Error("Failed to delete team");
  }
}
