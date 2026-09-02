"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CircleAlert } from "lucide-react";
import { ClubCrest } from "@/components/layout/ClubCrest";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function LoginPage() {
  const { isConfigured, isLoading, user, signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (e.g. came here manually, or session restored) — go straight in.
  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kvm-charcoal px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <ClubCrest className="h-14 w-14 text-lg" />
          <div>
            <div className="text-sm font-bold tracking-wide text-white">KV MECHELEN</div>
            <div className="text-xs font-medium tracking-widest text-kvm-red">SCOUTING HUB</div>
          </div>
        </div>

        <div className="border border-kvm-border-dark bg-white p-6">
          <h1 className="mb-1 text-lg font-bold text-kvm-ink">Sign in</h1>
          <p className="mb-5 text-sm text-gray-500">Internal scouting access only.</p>

          {!isConfigured ? (
            <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Authentication isn&apos;t configured for this deployment yet. Nothing you enter here can
                sign in until it is — see Settings once you have access another way.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-sm border border-kvm-border px-3 py-2 text-sm text-kvm-ink focus-visible:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-sm border border-kvm-border px-3 py-2 text-sm text-kvm-ink focus-visible:outline-none"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 border border-kvm-red bg-red-50 p-3 text-sm text-red-800">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-sm bg-kvm-red px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          <p className="mt-4 text-xs text-gray-400">
            Accounts are created by an administrator — there is no self-service sign-up for this
            internal tool.
          </p>
        </div>
      </div>
    </div>
  );
}
