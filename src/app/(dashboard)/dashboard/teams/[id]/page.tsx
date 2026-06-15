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

  const data = await Promise.all([
    getTeam(id),
    getProjects().catch(() => []),
  ]).catch(() => null);

  if (!data) {
    notFound();
  }

  const [team, userProjects] = data;
  return (
    <TeamDetailClient initialTeam={team} id={id} userProjects={userProjects} />
  );
}
