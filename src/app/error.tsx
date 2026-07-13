'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { GraduationCap, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-6">
      <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </div>
        <span className="font-extrabold text-xl tracking-tight text-text-primary">Concentrate</span>
      </Link>

      <div>
        <p className="text-7xl font-extrabold text-danger">500</p>
        <h1 className="text-xl font-bold text-text-primary mt-2">Something went wrong</h1>
        <p className="text-sm text-text-secondary mt-2 max-w-sm">
          An unexpected error occurred while loading this page. You can try again or head back to the dashboard.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-primary-soft text-sm font-semibold transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
