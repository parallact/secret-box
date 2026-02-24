"use client";

import { useRouter } from "next/navigation";

export default function DashboardError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground text-sm">
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={() => { router.refresh(); reset(); }}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
