"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

/**
 * Client-side Supabase Auth — no Next.js server involved (GitHub Pages
 * has none). Session persistence/refresh is handled entirely by the
 * Supabase JS client (localStorage), which is why a browser refresh
 * doesn't log anyone out — see docs/AUTHENTICATION.md.
 *
 * `isConfigured: false` means Supabase isn't set up at all — see
 * docs/AUTHENTICATION.md for what the app does in that state (nothing
 * silently opens up; RequireAuth still blocks access).
 */
interface AuthApi {
  isConfigured: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!configured) return { error: "Authentication is not configured for this deployment." };
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [configured]
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    await getSupabaseClient().auth.signOut();
  }, [configured]);

  const value = useMemo<AuthApi>(
    () => ({
      isConfigured: configured,
      isLoading,
      user: session?.user ?? null,
      session,
      signIn,
      signOut,
    }),
    [configured, isLoading, session, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
