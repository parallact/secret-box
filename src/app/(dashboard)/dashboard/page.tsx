import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, FolderKey } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  // Get user's projects
  const projects = await db.project.findMany({
    where: { userId: session?.user?.id },
    include: {
      environments: {
        include: {
          _count: {
            select: { variables: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Projects</h1>
          <p className="text-muted-foreground">
            Manage your environment variables by project
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKey className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create your first project to start managing environment variables
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const totalVars = project.environments.reduce(
              (acc, env) => acc + env._count.variables,
              0
            );

            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <Card className="transition-colors hover:border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FolderKey className="h-5 w-5" />
                      {project.name}
                    </CardTitle>
                    <CardDescription>
                      {project.environments.length} environments &middot;{" "}
                      {totalVars} variables
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {project.environments.map((env) => (
                        <span
                          key={env.id}
                          className="rounded-full bg-muted px-2 py-1 text-xs"
                        >
                          {env.name}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
