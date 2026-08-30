"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Client-side route guard. Renders nothing (not even a flash of the
 * protected page) until auth state is known, then either redirects to
 * /login or renders children.
 *
 * IMPORTANT LIMITATION (see docs/AUTHENTICATION.md): this is a UI-level
 * gate, not a network-level one — GitHub Pages has no server to stop a
 * request before it's served, so the underlying static HTML for a
 * protected route is still fetchable directly (curl, "View Source", a
 * crawler). This component reliably keeps the *app* — its data fetches,
 * its navigation — behind login; it cannot make a public static file
 * private. Real, unconditional protection exists only for Supabase-backed
 * data (shortlists, notes), enforced by Postgres Row Level Security, not
 * by this component.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isConfigured, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isConfigured || !user) {
      router.replace("/login");
    }
  }, [isConfigured, isLoading, user, router]);

  if (isLoading || !isConfigured || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-kvm-red" aria-hidden="true" />
          {isLoading ? "Checking session…" : "Redirecting to login…"}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
