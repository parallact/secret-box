"use client";

import { useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { encryptVariable } from "@/lib/crypto/encryption";
import { createVariable } from "@/lib/actions/variables";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { DecryptedVar } from "@/types/variables";

interface AddVariableDialogProps {
  environmentId: string;
  cryptoKey: CryptoKey | null;
  onSuccess: (newVar: DecryptedVar) => void;
}

export const AddVariableDialog = memo(function AddVariableDialog({
  environmentId,
  cryptoKey,
  onSuccess,
}: AddVariableDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyError, setKeyError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cryptoKey) return;

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const key = formData.get("key") as string;
    const value = formData.get("value") as string;
    const isSecret = formData.get("isSecret") === "on";

    try {
      const encrypted = await encryptVariable(key, value, cryptoKey);

      const variable = await createVariable(environmentId, {
        ...encrypted,
        isSecret,
      });

      toast.success("Variable added");
      setOpen(false);
      onSuccess({
        id: variable.id,
        key,
        value,
        isSecret,
        updatedAt: variable.updatedAt,
      });
    } catch (error) {
      logger.error("Failed to add variable", error);
      toast.error("Failed to add variable");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Variable
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Variable</DialogTitle>
          <DialogDescription>
            Add a new environment variable. It will be encrypted before saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="key" className="text-sm font-medium">
                Key
              </label>
              <Input
                id="key"
                name="key"
                placeholder="DATABASE_URL"
                required
                disabled={isLoading}
                maxLength={255}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/\s/.test(val)) setKeyError("Key cannot contain spaces");
                  else if (val && !/^[A-Za-z_]/.test(val)) setKeyError("Key must start with a letter or underscore");
                  else setKeyError("");
                }}
                aria-describedby={keyError ? "key-error" : undefined}
              />
              {keyError && (
                <p id="key-error" className="text-xs text-destructive">{keyError}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="value" className="text-sm font-medium">
                Value
              </label>
              <Input
                id="value"
                name="value"
                placeholder="postgresql://..."
                disabled={isLoading}
                maxLength={500}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isSecret"
                name="isSecret"
                className="h-4 w-4"
              />
              <label htmlFor="isSecret" className="text-sm">
                Mark as secret (hide value by default)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading || !cryptoKey || !!keyError}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Variable
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
