"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Key, Clock, Shield, ShieldCheck, ShieldAlert, AlertTriangle, ChevronRight, Code, Activity } from "lucide-react";
import Link from "next/link";
import { useVaultStore } from "@/stores/vault-store";
import { toast } from "sonner";

// Lazy load heavy 2FA components
const TwoFactorSetup = dynamic(
  () => import("@/components/two-factor-setup").then((mod) => mod.TwoFactorSetup),
  { loading: () => <Loader2 className="h-4 w-4 animate-spin" /> }
);
const TwoFactorDisable = dynamic(
  () => import("@/components/two-factor-disable").then((mod) => mod.TwoFactorDisable),
  { loading: () => <Loader2 className="h-4 w-4 animate-spin" /> }
);
import {
  generateSalt,
  deriveKey,
  deriveAuthVerifier,
  encryptVariable,
  decryptVariable,
  validateMasterPassword,
} from "@/lib/crypto/encryption";
import { rewrapPrivateKey } from "@/lib/crypto/keypair";
import { getMyKeypair } from "@/lib/actions/keypair";

export default function SettingsPage() {
  const autoLockMinutes = useVaultStore((state) => state.autoLockMinutes);
  const setAutoLockMinutes = useVaultStore((state) => state.setAutoLockMinutes);
  const [localAutoLock, setLocalAutoLock] = useState(autoLockMinutes.toString());
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Fetch 2FA status on mount
  useEffect(() => {
    const controller = new AbortController();

    async function fetchStatus() {
      try {
        const res = await fetch("/api/user/status", { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setTwoFactorEnabled(data.twoFactorEnabled ?? false);
        }
      } catch (err) {
        // Silently fail unless it's not an abort
        if (err instanceof Error && err.name !== "AbortError") {
          // Could log error if needed
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingStatus(false);
        }
      }
    }
    fetchStatus();

    return () => controller.abort();
  }, []);

  function handleAutoLockChange() {
    const minutes = parseInt(localAutoLock);
    if (isNaN(minutes) || minutes < 1 || minutes > 60) {
      toast.error("Please enter a number between 1 and 60");
      return;
    }
    setAutoLockMinutes(minutes);
    toast.success(`Auto-lock set to ${minutes} minutes`);
  }

  return (
    <div translate="no">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your vault and security settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Two-Factor Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {twoFactorEnabled ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-yellow-500" />
              )}
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStatus ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-md bg-muted p-4">
                  <div>
                    <p className="font-medium">
                      {twoFactorEnabled ? "Enabled" : "Not enabled"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {twoFactorEnabled
                        ? "Your account is protected with 2FA"
                        : "Enable 2FA for additional security"}
                    </p>
                  </div>
                  <div
                    className={`h-3 w-3 rounded-full ${
                      twoFactorEnabled ? "bg-green-500" : "bg-yellow-500"
                    }`}
                  />
                </div>
                <div className="flex gap-2">
                  <TwoFactorSetup
                    isEnabled={twoFactorEnabled}
                    onSuccess={() => setTwoFactorEnabled(true)}
                  />
                  <TwoFactorDisable
                    isEnabled={twoFactorEnabled}
                    onSuccess={() => setTwoFactorEnabled(false)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto-lock settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Auto-Lock
            </CardTitle>
            <CardDescription>
              Automatically lock your vault after a period of inactivity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={localAutoLock}
                  onChange={(e) => setLocalAutoLock(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
              <Button onClick={handleAutoLockChange} variant="outline">
                Save
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Current setting: {autoLockMinutes} minutes
            </p>
          </CardContent>
        </Card>

        {/* Change master password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Master Password
            </CardTitle>
            <CardDescription>
              Your master password encrypts all your secrets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangeMasterPasswordDialog />
          </CardContent>
        </Card>

        {/* API Tokens */}
        <Link href="/dashboard/settings/api-tokens">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>API Tokens</CardTitle>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription>
                Create tokens for programmatic access to your secrets
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Activity Log */}
        <Link href="/dashboard/settings/activity">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  <CardTitle>Activity Log</CardTitle>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription>
                View recent account activity and security events
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Security info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>
              How your data is protected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted p-4">
              <h4 className="font-medium">End-to-End Encryption</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                All your secrets are encrypted using AES-256-GCM before leaving
                your browser. We never see your data in plain text.
              </p>
            </div>
            <div className="rounded-md bg-muted p-4">
              <h4 className="font-medium">Key Derivation</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Your encryption key is derived from your master password using
                PBKDF2 with 100,000 iterations.
              </p>
            </div>
            <div className="rounded-md bg-muted p-4">
              <h4 className="font-medium">Zero Knowledge</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                If you lose your master password, we cannot recover your data.
                Make sure to keep it safe.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChangeMasterPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "processing">("form");
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const cryptoKey = useVaultStore((state) => state.cryptoKey);
  const currentSalt = useVaultStore((state) => state.salt);
  const lock = useVaultStore((state) => state.lock);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cryptoKey || !currentSalt) {
      toast.error("Vault must be unlocked to change password");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    const validation = validateMasterPassword(newPassword);
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    setIsLoading(true);
    setStep("processing");

    try {
      // Step 1: Fetch all encrypted data
      setProgress({ current: 1, total: 5, message: "Fetching encrypted data..." });

      const [projectsRes, globalsRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/globals"),
      ]);

      if (!projectsRes.ok || !globalsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const projects = await projectsRes.json();
      const globals = await globalsRes.json();

      // Collect all variables
      const allVariables: Array<{
        id: string;
        keyEncrypted: string;
        valueEncrypted: string;
        ivKey: string;
        ivValue: string;
      }> = [];

      for (const project of projects) {
        // DEK-migrated projects are encrypted with a per-project key, not the
        // master key, so they are unaffected by a master-password rotation.
        // Skip them — trying to decrypt them with the master key would fail.
        if (project.encryptionMigrated) continue;
        for (const env of project.environments || []) {
          for (const v of env.variables || []) {
            allVariables.push(v);
          }
        }
      }

      // Step 2: Decrypt all data with current key
      setProgress({ current: 2, total: 5, message: `Decrypting ${allVariables.length + globals.length} variables...` });

      const decryptedVariables: Array<{ id: string; key: string; value: string; isSecret: boolean }> = [];
      const decryptedGlobals: Array<{ id: string; key: string; value: string; isSecret: boolean }> = [];

      for (const v of allVariables) {
        const decrypted = await decryptVariable(
          v.keyEncrypted,
          v.valueEncrypted,
          v.ivKey,
          v.ivValue,
          cryptoKey
        );
        decryptedVariables.push({ id: v.id, ...decrypted, isSecret: false });
      }

      for (const g of globals) {
        const decrypted = await decryptVariable(
          g.keyEncrypted,
          g.valueEncrypted,
          g.ivKey,
          g.ivValue,
          cryptoKey
        );
        decryptedGlobals.push({ id: g.id, ...decrypted, isSecret: g.isSecret });
      }

      // Step 3: Generate new salt and derive new key
      setProgress({ current: 3, total: 5, message: "Generating new encryption key..." });

      const newSalt = generateSalt();
      const newCryptoKey = await deriveKey(newPassword, newSalt);

      // Step 4: Re-encrypt all data with new key
      setProgress({ current: 4, total: 5, message: "Re-encrypting data..." });

      const reencryptedVariables = await Promise.all(
        decryptedVariables.map(async (v) => {
          const encrypted = await encryptVariable(v.key, v.value, newCryptoKey);
          return { id: v.id, ...encrypted };
        })
      );

      const reencryptedGlobals = await Promise.all(
        decryptedGlobals.map(async (g) => {
          const encrypted = await encryptVariable(g.key, g.value, newCryptoKey);
          return { id: g.id, ...encrypted };
        })
      );

      // Step 5: Re-wrap the team-sharing keypair (if any) with the new master
      // key. The private key is wrapped under the master key; without this the
      // user would lose access to every shared/migrated project after re-login.
      let rewrappedKeypair: { wrappedPrivateKey: string; keyIv: string } | undefined;
      const keypair = await getMyKeypair();
      if (keypair) {
        const rewrapped = await rewrapPrivateKey(
          keypair.wrappedPrivateKey,
          keypair.keyIv,
          cryptoKey,
          newCryptoKey
        );
        rewrappedKeypair = {
          wrappedPrivateKey: rewrapped.wrapped,
          keyIv: rewrapped.iv,
        };
      }

      // Step 6: Send to server
      setProgress({ current: 5, total: 5, message: "Saving changes..." });

      // Zero-knowledge: prove ownership with the current master password's
      // verifier and send the new master password's verifier for storage.
      // Neither plaintext master password is transmitted.
      const currentVerifier = await deriveAuthVerifier(currentPassword, currentSalt);
      const newVerifier = await deriveAuthVerifier(newPassword, newSalt);

      const response = await fetch("/api/user/change-master-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentVerifier,
          newVerifier,
          newSalt,
          variables: reencryptedVariables,
          globalVariables: reencryptedGlobals,
          keypair: rewrappedKeypair,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to change password");
      }

      toast.success("Master password changed successfully. Please log in again.");
      setOpen(false);

      // Lock the vault to force re-login with new password
      lock();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change password");
      setStep("form");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!isLoading) {
      setOpen(newOpen);
      if (!newOpen) {
        setStep("form");
        setProgress({ current: 0, total: 0, message: "" });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Change Master Password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Master Password</DialogTitle>
          <DialogDescription>
            This will re-encrypt all your data with a new password.
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="rounded-md bg-yellow-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Make sure your vault is unlocked before changing the password.
                    This process will decrypt and re-encrypt all your data.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="currentPassword" className="text-sm font-medium">
                  Current Master Password
                </label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  disabled={isLoading}
                  maxLength={128}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="newPassword" className="text-sm font-medium">
                  New Master Password
                </label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  disabled={isLoading}
                  maxLength={128}
                />
                <p className="text-xs text-muted-foreground">
                  At least 12 characters with uppercase, lowercase, and numbers
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  disabled={isLoading}
                  maxLength={128}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !cryptoKey}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">{progress.message}</p>
                <p className="text-sm text-muted-foreground">
                  Step {progress.current} of {progress.total}
                </p>
              </div>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
