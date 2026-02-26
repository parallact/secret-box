"use client";

import { useState, useMemo, memo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Download,
  Trash2,
  MoreVertical,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  Pencil,
  CheckSquare,
  Square,
  FileCode,
  Search,
  X,
} from "lucide-react";
import { useVaultStore } from "@/stores/vault-store";
import { decryptVariable } from "@/lib/crypto/encryption";
import { deleteVariable } from "@/lib/actions/variables";
import { deleteProject, deleteEnvironment, updateProject } from "@/lib/actions/projects";
import { ImportEnvDialog } from "@/components/import-env-dialog";
import { EditVariableDialog } from "@/components/dialogs/edit-variable-dialog";
import { AddVariableDialog } from "@/components/dialogs/add-variable-dialog";
import { AddEnvironmentDialog } from "@/components/dialogs/add-environment-dialog";
import { CopyEnvironmentDialog } from "@/components/dialogs/copy-environment-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { useToggleSet } from "@/hooks/use-toggle-set";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { DecryptedVar, ProjectWithRelations } from "@/types/variables";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface ProjectViewProps {
  project: ProjectWithRelations;
}

export function ProjectView({ project }: ProjectViewProps) {
  const router = useRouter();
  const cryptoKey = useVaultStore((state) => state.cryptoKey);
  const [activeEnv, setActiveEnv] = useState(project.environments[0]?.id || "");
  const [decryptedVars, setDecryptedVars] = useState<Record<string, DecryptedVar[]>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  // Use custom hooks for toggle sets and clipboard
  const visibleValues = useToggleSet<string>();
  const selectedVars = useToggleSet<string>();
  const clipboard = useCopyToClipboard();

  // Decrypt variables for an environment - memoized to prevent unnecessary re-renders
  const decryptEnvVariables = useCallback(
    async (envId: string) => {
      if (!cryptoKey) return;

      const env = project.environments.find((e) => e.id === envId);
      if (!env) return;

      try {
        const decrypted = await Promise.all(
          env.variables.map(async (v) => {
            const { key, value } = await decryptVariable(
              v.keyEncrypted,
              v.valueEncrypted,
              v.ivKey,
              v.ivValue,
              cryptoKey
            );
            return { id: v.id, key, value, isSecret: v.isSecret, updatedAt: v.updatedAt };
          })
        );

        setDecryptedVars((prev) => ({ ...prev, [envId]: decrypted }));
      } catch (error) {
        logger.error("Failed to decrypt variables", error);
        toast.error("Failed to decrypt variables");
      }
    },
    [cryptoKey, project.environments]
  );

  // Filtered variables for the active environment
  const filteredVars = useMemo(() => {
    const vars = decryptedVars[activeEnv] || [];
    if (!searchQuery.trim()) return vars;
    const query = searchQuery.toLowerCase();
    return vars.filter((v) => v.key.toLowerCase().includes(query));
  }, [decryptedVars, activeEnv, searchQuery]);

  // Load variables when tab changes
  function handleTabChange(envId: string) {
    setActiveEnv(envId);
    setSearchQuery("");
  }

  // Initialize decryption when activeEnv or cryptoKey changes
  useEffect(() => {
    if (activeEnv && !decryptedVars[activeEnv] && cryptoKey) {
      decryptEnvVariables(activeEnv);
    }
  }, [activeEnv, cryptoKey, decryptEnvVariables, decryptedVars]);

  async function handleDeleteProject() {
    const confirmed = await confirm({
      title: "Delete Project",
      description: "Are you sure you want to delete this project? This action cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      router.push("/dashboard");
    } catch (error) {
      logger.error("Failed to delete project", error);
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRenameProject() {
    if (!editName.trim() || editName.trim() === project.name) {
      setIsEditingName(false);
      return;
    }
    setIsRenaming(true);
    try {
      await updateProject(project.id, { name: editName.trim() });
      toast.success("Project renamed");
      setIsEditingName(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename project");
    } finally {
      setIsRenaming(false);
    }
  }

  // Helper functions using the hooks
  const selectAllVars = useCallback(() => {
    const currentVars = decryptedVars[activeEnv] || [];
    selectedVars.selectAll(currentVars.map((variable) => variable.id));
  }, [decryptedVars, activeEnv, selectedVars]);

  async function handleBulkDelete() {
    if (selectedVars.size === 0) return;

    const confirmed = await confirm({
      title: "Delete Variables",
      description: `Are you sure you want to delete ${selectedVars.size} variable${selectedVars.size > 1 ? "s" : ""}? This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedVars.set).map((id) => deleteVariable(id))
      );
      setDecryptedVars((prev) => ({
        ...prev,
        [activeEnv]: prev[activeEnv].filter((variable) => !selectedVars.has(variable.id)),
      }));
      const deletedCount = selectedVars.size;
      selectedVars.clear();
      toast.success(`Deleted ${deletedCount} variable${deletedCount > 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to delete some variables");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function handleVariableUpdate(envId: string, updatedVar: DecryptedVar) {
    setDecryptedVars((prev) => ({
      ...prev,
      [envId]: prev[envId].map((v) => (v.id === updatedVar.id ? updatedVar : v)),
    }));
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
          <h1 className="text-2xl font-bold md:text-3xl truncate">{project.name}</h1>
          {project.path && (
            <p className="text-sm text-muted-foreground">{project.path}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportButton project={project} decryptedVars={decryptedVars} activeEnv={activeEnv} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => { setEditName(project.name); setIsEditingName(true); }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Name
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDeleteProject}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Environment Tabs */}
      <Tabs value={activeEnv} onValueChange={handleTabChange}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            <TabsList>
              {project.environments.map((env) => (
                <TabsTrigger key={env.id} value={env.id} className="max-w-[120px] truncate">
                  {env.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <AddEnvironmentDialog
              projectId={project.id}
              onSuccess={() => router.refresh()}
            />
          </div>
          <div className="flex items-center gap-2">
            <ImportEnvDialog
              environmentId={activeEnv}
              cryptoKey={cryptoKey}
              onSuccess={() => {
                setDecryptedVars((prev) => {
                  const next = { ...prev };
                  delete next[activeEnv];
                  return next;
                });
              }}
            />
            <AddVariableDialog
              environmentId={activeEnv}
              cryptoKey={cryptoKey}
              onSuccess={(newVar) => {
                setDecryptedVars((prev) => ({
                  ...prev,
                  [activeEnv]: [...(prev[activeEnv] || []), newVar],
                }));
              }}
            />
          </div>
        </div>

        {project.environments.map((env) => (
          <TabsContent key={env.id} value={env.id}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle className="text-lg">{env.name}</CardTitle>
                      <CardDescription>
                        {decryptedVars[env.id]?.length || 0} variables
                      </CardDescription>
                    </div>
                    {/* Copy Environment */}
                    <CopyEnvironmentDialog
                      sourceEnvId={env.id}
                      sourceEnvName={env.name}
                      environments={project.environments.map((e) => ({ id: e.id, name: e.name }))}
                      cryptoKey={cryptoKey}
                      decryptedVars={decryptedVars[env.id] || []}
                      onSuccess={(targetEnvId, copiedVars) => {
                        setDecryptedVars((prev) => ({
                          ...prev,
                          [targetEnvId]: [...(prev[targetEnvId] || []), ...copiedVars],
                        }));
                        setActiveEnv(targetEnvId);
                      }}
                    />
                    {/* Delete Environment - only show if more than 1 environment */}
                    {project.environments.length > 1 && (
                      <DeleteEnvironmentButton
                        environmentId={env.id}
                        environmentName={env.name}
                        variableCount={decryptedVars[env.id]?.length || 0}
                        onSuccess={() => router.refresh()}
                      />
                    )}
                  </div>
                  {/* Bulk Actions Bar */}
                  {decryptedVars[env.id]?.length > 0 && (
                    <div className="hidden items-center gap-2 md:flex">
                      {selectedVars.size > 0 ? (
                        <>
                          <span className="text-sm text-muted-foreground">
                            {selectedVars.size} selected
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={selectedVars.clear}
                          >
                            Clear
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                          >
                            {isBulkDeleting && (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            )}
                            Delete Selected
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={selectAllVars}
                        >
                          <CheckSquare className="mr-2 h-4 w-4" />
                          Select All
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!decryptedVars[env.id] ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Decrypting variables...</p>
                  </div>
                ) : decryptedVars[env.id].length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <FileCode className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">No variables yet</h3>
                    <p className="mt-1 text-center text-sm text-muted-foreground">
                      Add your first environment variable using the button above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Search bar - only for active tab with variables */}
                    {env.id === activeEnv && decryptedVars[env.id].length > 3 && (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Filter by key name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {searchQuery && (
                          <span className="whitespace-nowrap text-sm text-muted-foreground">
                            {filteredVars.length} of {decryptedVars[env.id].length}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Variable list */}
                    <div className="space-y-2">
                    {(env.id === activeEnv ? filteredVars : decryptedVars[env.id]).map((variable) => (
                      <VariableRow
                        key={variable.id}
                        variable={variable}
                        cryptoKey={cryptoKey}
                        isVisible={visibleValues.has(variable.id)}
                        isSelected={selectedVars.has(variable.id)}
                        isCopied={clipboard.isCopied(variable.id)}
                        onToggleVisibility={() => visibleValues.toggle(variable.id)}
                        onToggleSelection={() => selectedVars.toggle(variable.id)}
                        onCopy={() => clipboard.copy(variable.value, variable.id)}
                        onUpdate={(updated) => handleVariableUpdate(env.id, updated)}
                        onDelete={async () => {
                          const truncatedKey = variable.key.length > 40 ? variable.key.slice(0, 40) + "..." : variable.key;
                          const ok = await confirm({
                            title: "Delete variable",
                            description: `Are you sure you want to delete "${truncatedKey}"? This action cannot be undone.`,
                            confirmText: "Delete",
                            variant: "destructive",
                          });
                          if (!ok) return;
                          try {
                            await deleteVariable(variable.id);
                            setDecryptedVars((prev) => ({
                              ...prev,
                              [env.id]: prev[env.id].filter((v) => v.id !== variable.id),
                            }));
                            toast.success("Variable deleted");
                          } catch {
                            toast.error("Failed to delete variable");
                          }
                        }}
                      />
                    ))}
                    </div>
                    {/* No search results */}
                    {env.id === activeEnv && searchQuery && filteredVars.length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No variables matching &quot;{searchQuery}&quot;
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <ConfirmDialog />

      <Dialog open={isEditingName} onOpenChange={setIsEditingName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>Enter a new name for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              placeholder="Project name"
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameProject(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingName(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameProject} disabled={isRenaming || !editName.trim()}>
              {isRenaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const VariableRow = memo(function VariableRow({
  variable,
  cryptoKey,
  isVisible,
  isSelected,
  isCopied,
  onToggleVisibility,
  onToggleSelection,
  onCopy,
  onUpdate,
  onDelete,
}: {
  variable: DecryptedVar;
  cryptoKey: CryptoKey | null;
  isVisible: boolean;
  isSelected: boolean;
  isCopied: boolean;
  onToggleVisibility: () => void;
  onToggleSelection: () => void;
  onCopy: () => void;
  onUpdate: (updated: DecryptedVar) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <div
        className={`group flex flex-col gap-2 rounded-lg border p-3 transition-all duration-200 hover:shadow-sm md:flex-row md:items-center md:gap-4 ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "hover:border-primary/30 hover:bg-muted/50"
        }`}
      >
        {/* Selection checkbox - hidden on mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden shrink-0 transition-transform hover:scale-110 md:flex"
          onClick={onToggleSelection}
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 opacity-50 group-hover:opacity-100" />
          )}
        </Button>

        {/* Key and Value - stack on mobile, side by side on desktop */}
        <div className="flex flex-1 flex-col gap-1 overflow-hidden md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 md:flex-1">
            <code className="inline-block max-w-full truncate rounded bg-muted/50 px-2 py-1 text-sm font-semibold align-middle">{variable.key}</code>
            {variable.updatedAt && (
              <span className="ml-2 text-xs text-muted-foreground/60 hidden md:inline">
                {formatTimeAgo(variable.updatedAt)}
              </span>
            )}
          </div>
          <div className="min-w-0 md:flex-1 overflow-hidden">
            <code className="block truncate text-sm text-muted-foreground font-mono">
              {variable.isSecret && !isVisible
                ? "••••••••••••"
                : isVisible || !variable.isSecret
                ? variable.value
                : "••••••••••••"}
            </code>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-70 md:group-hover:opacity-100 transition-opacity">
          {variable.isSecret && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleVisibility}
              className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
            >
              {isVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onCopy}
            className={`h-8 w-8 transition-all ${isCopied ? "text-green-500" : "hover:bg-primary/10 hover:text-primary"}`}
          >
            {isCopied ? (
              <Check className="h-4 w-4 animate-in zoom-in-50" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(true)}
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <EditVariableDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        variable={variable}
        cryptoKey={cryptoKey}
        onSuccess={onUpdate}
      />
    </>
  );
});


const ExportButton = memo(function ExportButton({
  project,
  decryptedVars,
  activeEnv,
}: {
  project: ProjectWithRelations;
  decryptedVars: Record<string, DecryptedVar[]>;
  activeEnv: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    const vars = decryptedVars[activeEnv];
    if (!vars) return;

    setIsExporting(true);

    try {
      const env = project.environments.find((e) => e.id === activeEnv);
      const envName = env?.name || "unknown";

      // Generate .env content
      let content = `# Generated by SecretBox\n`;
      content += `# Project: ${project.name} | Environment: ${envName}\n`;
      content += `# Date: ${new Date().toISOString()}\n\n`;

      for (const v of vars) {
        content += `${v.key}="${v.value}"\n`;
      }

      // Download file
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `.env.${envName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Exported successfully");
    } catch (error) {
      logger.error("Failed to export", error);
      toast.error("Failed to export");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={isExporting}>
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Export .env
    </Button>
  );
});


const DeleteEnvironmentButton = memo(function DeleteEnvironmentButton({
  environmentId,
  environmentName,
  variableCount,
  onSuccess,
}: {
  environmentId: string;
  environmentName: string;
  variableCount: number;
  onSuccess: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete Environment",
      description: `Are you sure you want to delete "${environmentName}"?${variableCount > 0 ? ` This will also delete ${variableCount} variable${variableCount > 1 ? "s" : ""}.` : ""} This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteEnvironment(environmentId);
      toast.success("Environment deleted");
      onSuccess();
    } catch (error) {
      logger.error("Failed to delete environment", error);
      toast.error("Failed to delete environment");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </Button>
      <ConfirmDialog />
    </>
  );
});
