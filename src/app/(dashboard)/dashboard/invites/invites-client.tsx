"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, X, Loader2, Users, Crown } from "lucide-react";
import { respondToInvite, getPendingInvites } from "@/lib/actions/teams";
import { toast } from "sonner";

type Invite = Awaited<ReturnType<typeof getPendingInvites>>[number];

export function InvitesClient({ initialInvites }: { initialInvites: Invite[] }) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleRespond(inviteId: string, accept: boolean) {
    setLoadingId(inviteId);
    try {
      await respondToInvite(inviteId, accept);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success(accept ? "You joined the team!" : "Invite declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to respond to invite");
    } finally {
      setLoadingId(null);
    }
  }

  if (invites.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Users className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No pending invitations</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            When someone invites you to a team, it will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {invites.map((invite) => (
        <Card key={invite.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  {invite.team.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <Crown className="h-3 w-3" />
                  Owned by {invite.team.owner.name || invite.team.owner.email}
                  <span className="mx-1">·</span>
                  Role: <span className="capitalize ml-1">{invite.role.toLowerCase()}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRespond(invite.id, false)}
                  disabled={!!loadingId}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  {loadingId === invite.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-1 h-4 w-4" />
                  )}
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleRespond(invite.id, true)}
                  disabled={!!loadingId}
                >
                  {loadingId === invite.id ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Accept
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
