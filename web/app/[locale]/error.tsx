"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      {error.digest && <p className="mt-1 font-mono text-xs text-fg-subtle">Error ID: {error.digest}</p>}
      <button onClick={reset} className="btn mt-6">Try again</button>
    </div>
  );
}
