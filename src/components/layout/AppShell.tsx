import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalSearch } from "./GlobalSearch";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-kvm-border bg-white px-8 py-2.5">
          <GlobalSearch />
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
