"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Users,
  Plus,
  Loader2,
  FolderKey,
  Trash2,
  UserMinus,
  Crown,
  Shield,
  Eye,
} from "lucide-react";
import {
  getTeam,
  inviteMember,
  removeMember,
  updateMemberRole,
  deleteTeam,
  linkProjectToTeam,
  unlinkProjectFromTeam,
  type TeamRole,
} from "@/lib/actions/teams";
import { useConfirm } from "@/hooks/use-confirm";
import { toast } from "sonner";

type Team = Awaited<ReturnType<typeof getTeam>>;
type Member = Team["members"][number];
type UserProject = { id: string; name: string };

const roleIcons: Record<TeamRole, React.ReactNode> = {
  ADMIN: <Shield className="h-4 w-4 text-blue-500" />,
  MEMBER: <Users className="h-4 w-4 text-green-500" />,
  VIEWER: <Eye className="h-4 w-4 text-gray-500" />,
};

export function TeamDetailClient({
  initialTeam,
  id,
  userProjects,
}: {
  initialTeam: Team;
  id: string;
  userProjects: UserProject[];
}) {
  const [team, setTeam] = useState<Team>(initialTeam);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unlinkingProjectId, setUnlinkingProjectId] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();

  async function handleDeleteTeam() {
    const confirmed = await confirm({
      title: "Delete Team",
      description:
        "Are you sure you want to delete this team? All members will lose access.",
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteTeam(id);
      toast.success("Team deleted");
      router.push("/dashboard/teams");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete team");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRemoveMember(member: Member) {
    const confirmed = await confirm({
      title: "Remove Member",
      description: `Remove ${member.user.name || member.user.email} from the team?`,
      confirmText: "Remove",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await removeMember(id, member.id);
      setTeam((prev: Team) => ({
        ...prev,
        members: prev.members.filter((m: Member) => m.id !== member.id),
      }));
      toast.success("Member removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    }
  }

  async function handleRoleChange(memberId: string, role: TeamRole) {
    const member = team.members.find((m: Member) => m.id === memberId);
    const confirmed = await confirm({
      title: "Change Member Role",
      description: `Change ${member?.user.name || member?.user.email || "this member"}'s role to ${role}?`,
      confirmText: "Change Role",
    });
    if (!confirmed) return;

    try {
      await updateMemberRole(id, memberId, role);
      setTeam((prev: Team) => ({
        ...prev,
        members: prev.members.map((m: Member) =>
          m.id === memberId ? { ...m, role } : m
        ),
      }));
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  }

  async function handleUnlinkProject(projectId: string) {
    const confirmed = await confirm({
      title: "Unlink Project",
      description: "Remove this project from the team?",
      confirmText: "Unlink",
      variant: "destructive",
    });
    if (!confirmed) return;

    setUnlinkingProjectId(projectId);
    try {
      await unlinkProjectFromTeam(id, projectId);
      setTeam((prev: Team) => ({
        ...prev,
        projects: prev.projects.filter((tp) => tp.project.id !== projectId),
      }));
      toast.success("Project unlinked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlink project");
    } finally {
      setUnlinkingProjectId(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/teams"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to teams
          </Link>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            {team.name}
            <Crown className="h-6 w-6 text-yellow-500" />
          </h1>
          <p className="text-muted-foreground">
            Owned by {team.owner.name || team.owner.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InviteMemberDialog
            teamId={id}
            onSuccess={(member: Member) =>
              setTeam((prev: Team) => ({
                ...prev,
                members: [...prev.members, member],
              }))
            }
          />
          <Button
            variant="destructive"
            onClick={handleDeleteTeam}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Team
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members
            </CardTitle>
            <CardDescription>
              {team.members.length} member{team.members.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {team.members.map((member: Member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {roleIcons[member.role as TeamRole]}
                    <div>
                      <p className="font-medium">
                        {member.user.name || member.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.userId !== team.ownerId && (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(value: string) =>
                            handleRoleChange(member.id, value as TeamRole)
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member)}
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {member.userId === team.ownerId && (
                      <span className="text-sm text-muted-foreground">Owner</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Linked Projects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderKey className="h-5 w-5" />
                  Linked Projects
                </CardTitle>
                <CardDescription>
                  {team.projects.length} project{team.projects.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              <LinkProjectDialog
                teamId={id}
                linkedProjectIds={team.projects.map((tp) => tp.project.id)}
                userProjects={userProjects}
                onSuccess={(project) =>
                  setTeam((prev: Team) => ({
                    ...prev,
                    projects: [...prev.projects, { project } as Team["projects"][number]],
                  }))
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            {team.projects.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No projects linked yet. Use the button above to link a project.
              </p>
            ) : (
              <div className="space-y-2">
                {team.projects.map((tp: Team["projects"][number]) => (
                  <div
                    key={tp.project.id}
                    className="flex items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted"
                  >
                    <Link
                      href={`/dashboard/projects/${tp.project.id}`}
                      className="flex flex-1 items-center gap-2"
                    >
                      <FolderKey className="h-4 w-4 text-muted-foreground" />
                      <span>{tp.project.name}</span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleUnlinkProject(tp.project.id)}
                      disabled={unlinkingProjectId === tp.project.id}
                    >
                      {unlinkingProjectId === tp.project.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog />
    </div>
  );
}

function LinkProjectDialog({
  teamId,
  linkedProjectIds,
  userProjects,
  onSuccess,
}: {
  teamId: string;
  linkedProjectIds: string[];
  userProjects: UserProject[];
  onSuccess: (project: UserProject) => void;
}) {
  const [open, setOpen] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const availableProjects = userProjects.filter(
    (p) => !linkedProjectIds.includes(p.id)
  );

  async function handleLink(project: UserProject) {
    setLinkingId(project.id);
    try {
      await linkProjectToTeam(teamId, project.id);
      toast.success(`${project.name} linked to team`);
      setOpen(false);
      onSuccess(project);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link project");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Project</DialogTitle>
          <DialogDescription>
            Select a project to link to this team.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {availableProjects.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              All your projects are already linked to this team.
            </p>
          ) : (
            <div className="space-y-2">
              {availableProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleLink(project)}
                  disabled={!!linkingId}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {linkingId === project.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <FolderKey className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberDialog({
  teamId,
  onSuccess,
}: {
  teamId: string;
  onSuccess: (member: Member) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<TeamRole>("MEMBER");
  const [emailValue, setEmailValue] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const member = await inviteMember({ teamId, email, role });
      toast.success("Member invited");
      setEmailValue("");
      setOpen(false);
      onSuccess(member as Member);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite member");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Invite a user to join this team by their email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="colleague@example.com"
                required
                disabled={isLoading}
                maxLength={254}
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                <span>{emailValue.length}/254</span>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <Select value={role} onValueChange={(v: string) => setRole(v as TeamRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">
                    Admin - Can manage members and projects
                  </SelectItem>
                  <SelectItem value="MEMBER">
                    Member - Can view and edit variables
                  </SelectItem>
                  <SelectItem value="VIEWER">
                    Viewer - Can only view variables
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
