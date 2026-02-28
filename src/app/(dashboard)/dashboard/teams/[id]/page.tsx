import { notFound } from "next/navigation";
import { getTeam } from "@/lib/actions/teams";
import { getProjects } from "@/lib/actions/projects";
import { TeamDetailClient } from "./team-detail-client";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [team, userProjects] = await Promise.all([
      getTeam(id),
      getProjects().catch(() => []),
    ]);
    return <TeamDetailClient initialTeam={team} id={id} userProjects={userProjects} />;
  } catch {
    notFound();
  }
}
