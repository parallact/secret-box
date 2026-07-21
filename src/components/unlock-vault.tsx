"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import { useVaultStore } from "@/stores/vault-store";
import { deriveAuthVerifier } from "@/lib/crypto/encryption";
import { logger } from "@/lib/logger";

export function UnlockVault() {
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const unlock = useVaultStore((state) => state.unlock);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Step 1: fetch the (non-secret) salt + auth scheme so we can derive the
      // verifier locally. The plaintext master password is never sent for
      // modern (verifier) accounts.
      const saltRes = await fetch("/api/vault/unlock");
      const saltData = await saltRes.json();

      if (!saltRes.ok) {
        setError(saltData.error || "Failed to unlock vault");
        setIsLoading(false);
        return;
      }

      const salt: string = saltData.salt;
      const authVersion: number = saltData.authVersion ?? 1;

      // Step 2: prove knowledge of the master password via the derived verifier.
      // Legacy (authVersion 1) accounts also send the plaintext ONCE so the
      // server can verify against the old hash and upgrade them to the verifier
      // scheme; every subsequent unlock is verifier-only.
      const verifier = await deriveAuthVerifier(masterPassword, salt);
      const payload =
        authVersion >= 2 ? { verifier } : { verifier, masterPassword };

      const res = await fetch("/api/vault/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to unlock vault");
        setIsLoading(false);
        return;
      }

      // Derive encryption key from master password and salt (client-side only)
      await unlock(masterPassword, salt);

      // Clear the password from memory
      setMasterPassword("");
    } catch (err) {
      logger.error("Unlock error", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Unlock Your Vault</CardTitle>
          <CardDescription>
            Enter your master password to access your secrets
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleUnlock}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="masterPassword">Master Password</Label>
              <Input
                id="masterPassword"
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Enter your master password"
                autoComplete="off"
                required
                disabled={isLoading}
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlock
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
