"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ApiTokensError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Failed to load API tokens</h2>
      <p className="text-muted-foreground text-sm">
        API tokens could not be loaded. Please try again.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => { router.refresh(); reset(); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link
          href="/dashboard/settings"
          className="border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md px-4 py-2 text-sm"
        >
          Back to settings
        </Link>
      </div>
    </div>
  );
}
