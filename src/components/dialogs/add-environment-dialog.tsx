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
import { createEnvironment } from "@/lib/actions/projects";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface AddEnvironmentDialogProps {
  projectId: string;
  onSuccess: () => void;
}

export const AddEnvironmentDialog = memo(function AddEnvironmentDialog({
  projectId,
  onSuccess,
}: AddEnvironmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate name (lowercase, no spaces)
      const cleanName = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!cleanName) {
        toast.error("Please enter a valid environment name");
        setIsLoading(false);
        return;
      }

      await createEnvironment(projectId, cleanName);
      toast.success("Environment created");
      setOpen(false);
      setName("");
      onSuccess();
    } catch (error) {
      logger.error("Failed to create environment", error);
      toast.error("Failed to create environment");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Environment</DialogTitle>
          <DialogDescription>
            Create a new environment for this project (e.g., qa, demo, preview).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="env-name" className="text-sm font-medium">
                Environment Name
              </label>
              <Input
                id="env-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="qa"
                required
                disabled={isLoading}
                maxLength={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Use lowercase letters, numbers, and hyphens only.</span>
                <span>{name.length}/50</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Environment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
