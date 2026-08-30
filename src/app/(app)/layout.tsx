import { AppStoreProvider } from "@/lib/app-store";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Every route in this group (dashboard, players, debutants, top
 * performers, shortlists, reports, settings) requires a signed-in
 * session — see components/auth/RequireAuth.tsx for what that does and
 * does not guarantee on a static-exported site. /login lives outside
 * this group deliberately, so it never redirects to itself.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppStoreProvider>
        <AppShell>{children}</AppShell>
      </AppStoreProvider>
    </RequireAuth>
  );
}
