"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  requireProjectOwnership,
  requireEnvironmentOwnership,
} from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

const PATH_REGEX = /^(\/[^\s]*|[A-Za-z]:[/\\][^\s]*|~\/[^\s]*)$/;

export async function createProject(data: {
  name: string;
  path?: string;
}): Promise<{ data: Awaited<ReturnType<typeof db.project.create>> | null; error: string | null }> {
  try {
    const userId = await requireAuth();

    if (!data.name?.trim()) return { data: null, error: "Project name cannot be empty" };
    if (data.name.trim().length > 50) return { data: null, error: "Project name cannot exceed 50 characters" };
    if (data.path && data.path.trim().length > 500) return { data: null, error: "Path is too long" };
    if (data.path && data.path.trim() && !PATH_REGEX.test(data.path.trim()))
      return { data: null, error: "Enter a valid path (e.g. /Users/me/project or C:\\projects\\app)" };

    const duplicate = await db.project.findFirst({
      where: { userId, name: { equals: data.name.trim(), mode: "insensitive" } },
    });
    if (duplicate) return { data: null, error: "A project with this name already exists" };

    const project = await db.project.create({
      data: {
        userId,
        name: data.name,
        path: data.path || null,
        environments: {
          create: [
            { name: "development" },
            { name: "staging" },
            { name: "production" },
          ],
        },
      },
      include: {
        environments: true,
      },
    });

    revalidatePath("/dashboard");

    await logAudit({ userId, action: "CREATE_PROJECT", resource: "PROJECT", resourceId: project.id });

    return { data: project, error: null };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") throw error;
    return { data: null, error: "Failed to create project" };
  }
}

export async function updateProject(
  projectId: string,
  data: { name?: string; path?: string }
) {
  try {
    const userId = await requireAuth();
    await requireProjectOwnership(projectId, userId);

    const project = await db.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        path: data.path,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/projects/${projectId}`);

    await logAudit({ userId, action: "UPDATE_PROJECT", resource: "PROJECT", resourceId: projectId });

    return project;
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Project not found"].includes(error.message)) throw error;
    throw new Error("Failed to update project");
  }
}

export async function deleteProject(projectId: string) {
  try {
    const userId = await requireAuth();
    await requireProjectOwnership(projectId, userId);

    await db.project.delete({
      where: { id: projectId },
    });

    revalidatePath("/dashboard");

    await logAudit({ userId, action: "DELETE_PROJECT", resource: "PROJECT", resourceId: projectId });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Project not found"].includes(error.message)) throw error;
    throw new Error("Failed to delete project");
  }
}

export async function getProjects() {
  const userId = await requireAuth();
  return db.project.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getProject(projectId: string) {
  try {
    const userId = await requireAuth();

    const project = await db.project.findFirst({
      where: { id: projectId, userId },
      include: {
        environments: {
          include: {
            variables: true,
          },
          orderBy: {
            name: "asc",
          },
        },
        linkedGlobals: {
          include: {
            global: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    return project;
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Project not found"].includes(error.message)) throw error;
    throw new Error("Failed to load project");
  }
}

export async function createEnvironment(projectId: string, name: string) {
  try {
    const userId = await requireAuth();
    await requireProjectOwnership(projectId, userId);

    const environment = await db.environment.create({
      data: {
        projectId,
        name,
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return environment;
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Project not found"].includes(error.message)) throw error;
    throw new Error("Failed to create environment");
  }
}

export async function deleteEnvironment(environmentId: string) {
  try {
    const userId = await requireAuth();
    const environment = await requireEnvironmentOwnership(environmentId, userId);

    await db.environment.delete({
      where: { id: environmentId },
    });

    revalidatePath(`/dashboard/projects/${environment.projectId}`);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Environment not found"].includes(error.message)) throw error;
    throw new Error("Failed to delete environment");
  }
}
