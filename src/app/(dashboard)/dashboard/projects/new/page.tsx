"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createProject } from "@/lib/actions/projects";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

function validateName(value: string): string {
  if (!value.trim()) return "Project name cannot be empty";
  return "";
}

export default function NewProjectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameError, setNameError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nErr = validateName(nameValue);
    setNameError(nErr);
    if (nErr) return;

    setIsLoading(true);
    try {
      const result = await createProject({
        name: nameValue.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Project created successfully");
      router.push(`/dashboard/projects/${result.data!.id}`);
    } catch (error) {
      logger.error("Failed to create project", error);
      toast.error("Failed to create project");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
          <CardDescription>
            Add a new project to organize your environment variables
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="my-awesome-project"
                required
                disabled={isLoading}
                maxLength={50}
                value={nameValue}
                onChange={(e) => {
                  setNameValue(e.target.value);
                  if (nameError) setNameError(validateName(e.target.value));
                }}
                onBlur={() => setNameError(validateName(nameValue))}
                aria-describedby="name-counter name-error"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {nameError ? (
                  <span id="name-error" className="text-destructive">
                    {nameError}
                  </span>
                ) : (
                  <span />
                )}
                <span id="name-counter">{nameValue.length}/50</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-4">
            <Button
              type="submit"
              disabled={isLoading || !!nameError}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
            <Link href="/dashboard">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
