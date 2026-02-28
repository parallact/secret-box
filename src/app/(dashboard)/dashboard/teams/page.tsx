import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, FolderKey, ChevronRight } from "lucide-react";
import { getTeams } from "@/lib/actions/teams";
import { CreateTeamDialog } from "./teams-client";

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Teams</h1>
          <p className="text-muted-foreground">
            Collaborate on projects with your team
          </p>
        </div>
        <CreateTeamDialog />
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No teams yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create a team to start collaborating with others
              <br />
              on your environment variables.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team.id} href={`/dashboard/teams/${team.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardDescription>
                    Owned by {team.owner?.name || team.owner?.email || "Unknown"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {team._count.members} member{team._count.members !== 1 ? "s" : ""}
                    </div>
                    <div className="flex items-center gap-1">
                      <FolderKey className="h-4 w-4" />
                      {team._count.projects} project{team._count.projects !== 1 ? "s" : ""}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
