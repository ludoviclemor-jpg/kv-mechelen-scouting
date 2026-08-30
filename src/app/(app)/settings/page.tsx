"use client";

import { CircleAlert, CircleCheck, AlertTriangle, Database, RefreshCw, Radar, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SYNC_META } from "@/lib/players-data";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/app-store";
import { useAuth } from "@/lib/auth/AuthProvider";

type ConnectionState = "connected" | "warning" | "not_connected";

function ConnectionBadge({ state, label }: { state: ConnectionState; label?: string }) {
  const Icon = state === "connected" ? CircleCheck : state === "warning" ? AlertTriangle : CircleAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold",
        state === "connected" && "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300",
        state === "warning" && "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300",
        state === "not_connected" && "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300"
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {label ?? (state === "connected" ? "Connected" : state === "warning" ? "Needs attention" : "Not connected")}
    </span>
  );
}

function IntegrationCard({
  icon: Icon,
  name,
  description,
  state,
  phase,
  badgeLabel,
}: {
  icon: typeof Database;
  name: string;
  description: string;
  state: ConnectionState;
  phase: string;
  badgeLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-kvm-border bg-white p-5">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-500">
          <Icon size={18} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-kvm-ink">{name}</h3>
          <p className="mt-0.5 max-w-md text-xs text-gray-500">{description}</p>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {phase}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <ConnectionBadge state={state} label={badgeLabel} />
        <button
          type="button"
          disabled
          title="Configured via the SCOUTASTIC_API_KEY GitHub Actions secret — no credentials are stored in the frontend"
          className="rounded-sm border border-kvm-border px-2.5 py-1 text-xs font-medium text-gray-400 disabled:cursor-not-allowed"
        >
          Configure
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const meta = SYNC_META;
  const summary = meta.lastSyncSummary;
  const { isPersistent } = useAppStore();
  const { user, isConfigured: authConfigured } = useAuth();

  const scoutasticState: ConnectionState =
    meta.lastSyncStatus === "success"
      ? "connected"
      : meta.lastSyncStatus === "partial"
        ? "warning"
        : meta.lastSyncStatus === "failed"
          ? "warning"
          : "not_connected";

  const syncBadgeLabel =
    meta.lastSyncStatus === "never_run"
      ? "Never run"
      : meta.lastSyncStatus === "success"
        ? "Last sync OK"
        : meta.lastSyncStatus === "partial"
          ? "Partial sync"
          : "Last sync failed";

  return (
    <>
      <PageHeader
        title="Settings"
        description="Integration status and synchronization configuration."
      />

      <div className="space-y-6 p-8">
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Account
          </h2>
          <div className="flex items-center justify-between gap-4 border border-kvm-border bg-white p-5">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-500">
                <UserCircle size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-kvm-ink">{user?.email ?? "Not signed in"}</h3>
                <p className="mt-0.5 max-w-md text-xs text-gray-500">
                  Signed in via Supabase Auth. Session persists across browser restarts until you
                  sign out.
                </p>
              </div>
            </div>
            <ConnectionBadge
              state={authConfigured && user ? "connected" : "not_connected"}
              label={authConfigured && user ? "Authenticated" : "Not authenticated"}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Data Synchronization
          </h2>
          <div className="border border-kvm-border bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-500">
                  <RefreshCw size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-kvm-ink">SCOUTASTIC sync</h3>
                  <p className="mt-0.5 max-w-md text-xs text-gray-500">
                    Player records are synced from SCOUTASTIC on a schedule via GitHub
                    Actions (the API key lives only as a repository secret, never in
                    this frontend). Trigger it manually from the Actions tab
                    (&quot;Sync SCOUTASTIC&quot; → Run workflow), or locally with{" "}
                    <code className="rounded-sm bg-gray-100 px-1 py-0.5 text-[11px]">
                      SCOUTASTIC_API_KEY=… node scripts/sync-scoutastic.mjs
                    </code>
                    .
                  </p>
                </div>
              </div>
              <ConnectionBadge state={scoutasticState} label={syncBadgeLabel} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-kvm-border pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Last sync
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-kvm-ink">
                  {meta.lastSyncedAt ? formatDate(meta.lastSyncedAt.slice(0, 10)) : "Never"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Active players
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{meta.activePlayersCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Competitions synced
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-kvm-ink">
                  {summary ? `${summary.competitionsSucceeded} / ${summary.competitionsAttempted}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Players failed
                </dt>
                <dd className={cn("mt-0.5 text-sm font-medium", summary && summary.playersFailed > 0 ? "text-kvm-red" : "text-kvm-ink")}>
                  {summary ? summary.playersFailed : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Integrations
          </h2>
          <div className="space-y-3">
            <IntegrationCard
              icon={Radar}
              name="SCOUTASTIC"
              description="Player profiles, competitions and club/league metadata."
              state={scoutasticState}
              badgeLabel={syncBadgeLabel}
              phase="Phase 2 — live"
            />
            <IntegrationCard
              icon={Radar}
              name="SofaScore"
              description="Match ratings. No legitimate public API exists — see docs/SOFASCORE_PROVIDER.md. Provider-agnostic architecture is built and ready; nothing is connected yet."
              state="not_connected"
              badgeLabel="No provider configured"
              phase="Phase 4 — architecture ready"
            />
            <IntegrationCard
              icon={Database}
              name="Database"
              description="Postgres (via Supabase) persistence for shortlists, statuses and scouting notes. Schema and client code are built — see db/schema.sql and docs/POSTGRES_PERSISTENCE.md."
              state={isPersistent ? "connected" : "not_connected"}
              badgeLabel={isPersistent ? "Connected" : "Not connected — using local-only fallback"}
              phase="Phase 3"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            System Status
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="border border-kvm-border bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Frontend
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CircleCheck size={15} /> Live
              </div>
            </div>
            <div className="border border-kvm-border bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Sync workflows
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CircleCheck size={15} /> Configured (GitHub Actions)
              </div>
            </div>
            <div className="border border-kvm-border bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Shortlists &amp; notes
              </div>
              <div
                className={cn(
                  "mt-1 flex items-center gap-1.5 text-sm font-semibold",
                  isPersistent ? "text-emerald-700" : "text-gray-400"
                )}
              >
                {isPersistent ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
                {isPersistent ? "Persisted (Postgres)" : "Local only — resets on reload"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
