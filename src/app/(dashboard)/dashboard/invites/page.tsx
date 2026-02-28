import { getPendingInvites } from "@/lib/actions/teams";
import { InvitesClient } from "./invites-client";
import { Bell } from "lucide-react";

export default async function InvitesPage() {
  const invites = await getPendingInvites().catch(() => []);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Invitations</h1>
          <p className="text-muted-foreground">
            {invites.length > 0
              ? `You have ${invites.length} pending invitation${invites.length !== 1 ? "s" : ""}`
              : "Team invitations sent to you will appear here"}
          </p>
        </div>
      </div>
      <InvitesClient initialInvites={invites} />
    </div>
  );
}
