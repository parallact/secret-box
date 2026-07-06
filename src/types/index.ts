// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

// SecretBox Types

export interface DecryptedVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedGlobalVariable extends DecryptedVariable {
  linkedProjects: string[];
}

export interface DecryptedEnvironment {
  id: string;
  name: string;
  variables: DecryptedVariable[];
}

export interface DecryptedProject {
  id: string;
  name: string;
  path?: string;
  environments: DecryptedEnvironment[];
  linkedGlobals: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedForMigration {
  id: string;
  key: string;
  value: string;
}

export interface VaultState {
  // State
  isUnlocked: boolean;
  isLoading: boolean;
  cryptoKey: CryptoKey | null;
  // Team sharing (envelope encryption): the user's keypair (private key in memory,
  // public key base64) and a cache of unwrapped per-project DEKs.
  privateKey: CryptoKey | null;
  publicKey: string | null;
  projectKeys: Record<string, CryptoKey>;
  projects: DecryptedProject[];
  globalVariables: DecryptedGlobalVariable[];
  autoLockMinutes: number;

  // Actions
  unlock: (masterPassword: string, salt: string) => Promise<void>;
  lock: () => void;
  // Resolve the key to encrypt/decrypt a project's variables: the per-project DEK
  // when migrated, or the legacy master key otherwise.
  getProjectKey: (
    projectId: string,
    migrated: boolean,
    myWrappedDek: string | null
  ) => Promise<CryptoKey>;
  // Owner-driven lazy migration of a legacy project to the DEK model.
  migrateProjectToDek: (
    projectId: string,
    decrypted: DecryptedForMigration[]
  ) => Promise<boolean>;
  // Owner grants the project DEK to team members (wrapping it for each pubkey).
  grantProjectToMembers: (
    projectId: string,
    members: Array<{ userId: string; publicKey: string }>
  ) => Promise<number>;
  // Owner rotates the project DEK after a revocation: generate a fresh DEK,
  // re-encrypt every variable, and re-wrap it for the remaining grantees.
  rotateProjectDek: (
    projectId: string,
    decrypted: DecryptedForMigration[],
    grantees: Array<{ userId: string; publicKey: string }>
  ) => Promise<boolean>;
  setAutoLockMinutes: (minutes: number) => void;
  setProjects: (projects: DecryptedProject[]) => void;
  setGlobalVariables: (globals: DecryptedGlobalVariable[]) => void;
  addProject: (project: DecryptedProject) => void;
  updateProject: (id: string, updates: Partial<DecryptedProject>) => void;
  deleteProject: (id: string) => void;
  addGlobalVariable: (variable: DecryptedGlobalVariable) => void;
  updateGlobalVariable: (
    id: string,
    updates: Partial<DecryptedGlobalVariable>
  ) => void;
  deleteGlobalVariable: (id: string) => void;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Form types
export interface CreateProjectForm {
  name: string;
  path?: string;
}

export interface CreateVariableForm {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface ImportEnvResult {
  variables: Array<{ key: string; value: string }>;
  errors: string[];
}
