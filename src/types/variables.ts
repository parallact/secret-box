import type { Variable, Environment, Project, GlobalVariable, ProjectGlobal } from "@prisma/client";

/**
 * Decrypted variable representation for UI display
 */
export interface DecryptedVar {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  updatedAt?: Date;
}

/**
 * Decrypted global variable with linked projects
 */
export interface DecryptedGlobal extends DecryptedVar {
  linkedProjects: string[];
}

/**
 * Project with all relations loaded
 */
export type ProjectWithRelations = Project & {
  environments: (Environment & { variables: Variable[] })[];
  linkedGlobals: (ProjectGlobal & { global: GlobalVariable })[];
  // Team sharing: whether the caller owns the project, and their wrapped DEK
  // grant (null for a legacy / not-yet-migrated project).
  isOwner: boolean;
  myWrappedDek: string | null;
};

/**
 * Global variable with linked projects
 */
export type GlobalWithProjects = GlobalVariable & {
  projects: (ProjectGlobal & { project: Project })[];
};
