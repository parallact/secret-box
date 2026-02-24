"use client";

import Link from "next/link";

export default function TeamDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Failed to load team</h2>
      <p className="text-muted-foreground text-sm">
        {error.message || "The team could not be loaded."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link
          href="/dashboard/teams"
          className="border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md px-4 py-2 text-sm"
        >
          Back to teams
        </Link>
      </div>
    </div>
  );
}
