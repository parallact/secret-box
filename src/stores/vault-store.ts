import { create } from "zustand";
import { deriveKey, encryptVariable } from "@/lib/crypto/encryption";
import {
  generateUserKeypair,
  exportPublicKey,
  importPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  generateDek,
  wrapDekForPublicKey,
  unwrapDekWithPrivateKey,
} from "@/lib/crypto/keypair";
import { getMyKeypair, saveMyKeypair } from "@/lib/actions/keypair";
import { migrateProjectToDek as migrateProjectToDekAction, grantProjectAccess } from "@/lib/actions/project-keys";
import { logger } from "@/lib/logger";
import type {
  VaultState,
  DecryptedProject,
  DecryptedGlobalVariable,
} from "@/types";

// Ensure the user has an RSA keypair loaded in memory (generating + storing it on
// first unlock). Best-effort: a failure here must not block unlocking the vault.
async function ensureKeypair(
  masterKey: CryptoKey,
  set: (partial: Partial<VaultState>) => void
): Promise<void> {
  try {
    const existing = await getMyKeypair();
    if (existing) {
      const privateKey = await unwrapPrivateKey(existing.wrappedPrivateKey, existing.keyIv, masterKey);
      set({ privateKey, publicKey: existing.publicKey });
      return;
    }
    const kp = await generateUserKeypair();
    const wrapped = await wrapPrivateKey(kp.privateKey, masterKey);
    const publicKey = await exportPublicKey(kp.publicKey);
    await saveMyKeypair({ publicKey, wrappedPrivateKey: wrapped.wrapped, keyIv: wrapped.iv });
    set({ privateKey: kp.privateKey, publicKey });
  } catch (error) {
    logger.error("Keypair setup failed (team sharing disabled this session)", error);
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  // Initial state
  isUnlocked: false,
  isLoading: false,
  cryptoKey: null,
  privateKey: null,
  publicKey: null,
  projectKeys: {},
  projects: [],
  globalVariables: [],
  autoLockMinutes: 5,

  // Set auto-lock timeout
  setAutoLockMinutes: (minutes: number) => {
    set({ autoLockMinutes: minutes });
    resetInactivityTimer();
  },

  // Unlock the vault with master password
  unlock: async (masterPassword: string, salt: string) => {
    set({ isLoading: true });
    try {
      const key = await deriveKey(masterPassword, salt);
      set({ cryptoKey: key, isUnlocked: true, isLoading: false });
      // Load / create the sharing keypair (non-blocking for the unlock itself).
      await ensureKeypair(key, set);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Lock the vault (clear all keys from memory)
  lock: () => {
    set({
      isUnlocked: false,
      cryptoKey: null,
      privateKey: null,
      publicKey: null,
      projectKeys: {},
      projects: [],
      globalVariables: [],
    });
  },

  // Resolve the key to encrypt/decrypt a project's variables.
  getProjectKey: async (projectId, migrated, myWrappedDek) => {
    const state = get();
    const cached = state.projectKeys[projectId];
    if (cached) return cached;

    if (!migrated) {
      // Legacy project: variables are encrypted directly with the master key.
      if (!state.cryptoKey) throw new Error("Vault is locked");
      return state.cryptoKey;
    }

    // Migrated project: unwrap the caller's DEK grant with their private key.
    if (!myWrappedDek) throw new Error("No key grant for this project");
    if (!state.privateKey) throw new Error("Keypair not loaded");
    const dek = await unwrapDekWithPrivateKey(myWrappedDek, state.privateKey);
    set((s) => ({ projectKeys: { ...s.projectKeys, [projectId]: dek } }));
    return dek;
  },

  // Owner-driven migration of a legacy project to the DEK model. The caller
  // passes the already-decrypted variables (they hold the master key).
  migrateProjectToDek: async (projectId, decrypted) => {
    const state = get();
    if (!state.publicKey) return false;
    try {
      const dek = await generateDek();
      const reEncrypted = await Promise.all(
        decrypted.map(async (v) => {
          const enc = await encryptVariable(v.key, v.value, dek);
          return {
            id: v.id,
            keyEncrypted: enc.keyEncrypted,
            valueEncrypted: enc.valueEncrypted,
            ivKey: enc.ivKey,
            ivValue: enc.ivValue,
          };
        })
      );
      const ownerPub = await importPublicKey(state.publicKey);
      const ownerWrappedDek = await wrapDekForPublicKey(dek, ownerPub);
      const { error } = await migrateProjectToDekAction(projectId, ownerWrappedDek, reEncrypted);
      if (error) {
        logger.error("Project DEK migration failed", error);
        return false;
      }
      set((s) => ({ projectKeys: { ...s.projectKeys, [projectId]: dek } }));
      return true;
    } catch (error) {
      logger.error("Project DEK migration error", error);
      return false;
    }
  },

  // Owner grants the project DEK to team members (wrapping it for each public key).
  grantProjectToMembers: async (projectId, members) => {
    const dek = get().projectKeys[projectId];
    if (!dek || members.length === 0) return 0;
    const grants = await Promise.all(
      members.map(async (m) => {
        const pub = await importPublicKey(m.publicKey);
        const wrappedDek = await wrapDekForPublicKey(dek, pub);
        return { userId: m.userId, wrappedDek };
      })
    );
    const { granted } = await grantProjectAccess(projectId, grants);
    return granted;
  },

  // Set all projects
  setProjects: (projects: DecryptedProject[]) => {
    set({ projects });
  },

  // Set all global variables
  setGlobalVariables: (globals: DecryptedGlobalVariable[]) => {
    set({ globalVariables: globals });
  },

  // Add a new project
  addProject: (project: DecryptedProject) => {
    set((state) => ({ projects: [...state.projects, project] }));
  },

  // Update a project
  updateProject: (id: string, updates: Partial<DecryptedProject>) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  // Delete a project
  deleteProject: (id: string) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  // Add a global variable
  addGlobalVariable: (variable: DecryptedGlobalVariable) => {
    set((state) => ({
      globalVariables: [...state.globalVariables, variable],
    }));
  },

  // Update a global variable
  updateGlobalVariable: (
    id: string,
    updates: Partial<DecryptedGlobalVariable>
  ) => {
    set((state) => ({
      globalVariables: state.globalVariables.map((v) =>
        v.id === id ? { ...v, ...updates } : v
      ),
    }));
  },

  // Delete a global variable
  deleteGlobalVariable: (id: string) => {
    set((state) => ({
      globalVariables: state.globalVariables.filter((v) => v.id !== id),
    }));
  },
}));

// Auto-lock after inactivity
let inactivityTimer: NodeJS.Timeout | null = null;

export function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }

  const state = useVaultStore.getState();
  if (state.isUnlocked) {
    const timeout = state.autoLockMinutes * 60 * 1000;
    inactivityTimer = setTimeout(() => {
      useVaultStore.getState().lock();
    }, timeout);
  }
}

// Setup activity listeners (call once on app mount)
export function setupInactivityListeners() {
  if (typeof window === "undefined") return;

  const events = ["mousedown", "keydown", "scroll", "touchstart"];
  events.forEach((event) => {
    window.addEventListener(event, resetInactivityTimer);
  });

  return () => {
    events.forEach((event) => {
      window.removeEventListener(event, resetInactivityTimer);
    });
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
  };
}
