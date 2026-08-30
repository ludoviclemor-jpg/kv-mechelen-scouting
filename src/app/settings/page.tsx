import { CircleAlert, CircleCheck, Database, RefreshCw, Radar } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

type ConnectionState = "connected" | "not_connected";

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const connected = state === "connected";
  const Icon = connected ? CircleCheck : CircleAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold",
        connected
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300"
          : "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300"
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function IntegrationCard({
  icon: Icon,
  name,
  description,
  state,
  phase,
}: {
  icon: typeof Database;
  name: string;
  description: string;
  state: ConnectionState;
  phase: string;
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
        <ConnectionBadge state={state} />
        <button
          type="button"
          disabled
          title="Configured from the backend once available — no credentials are stored in the frontend"
          className="rounded-sm border border-kvm-border px-2.5 py-1 text-xs font-medium text-gray-400 disabled:cursor-not-allowed"
        >
          Configure
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Integration status and synchronization configuration."
      />

      <div className="space-y-6 p-8">
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Data Synchronization
          </h2>
          <div className="flex items-center justify-between gap-4 border border-kvm-border bg-white p-5">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-500">
                <RefreshCw size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-kvm-ink">Automatic daily sync</h3>
                <p className="mt-0.5 max-w-md text-xs text-gray-500">
                  Once SCOUTASTIC and SofaScore are connected, player records and
                  ratings will refresh automatically once per day.
                </p>
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Phase 5 — Daily Synchronization
                </p>
              </div>
            </div>
            <ConnectionBadge state="not_connected" />
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
              state="not_connected"
              phase="Phase 2"
            />
            <IntegrationCard
              icon={Radar}
              name="SofaScore"
              description="Live match ratings, minutes played and form data."
              state="not_connected"
              phase="Phase 4"
            />
            <IntegrationCard
              icon={Database}
              name="Database"
              description="PostgreSQL persistence for shortlists, statuses and scouting notes."
              state="not_connected"
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
                Backend API
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-400">
                <CircleAlert size={15} /> Not deployed
              </div>
            </div>
            <div className="border border-kvm-border bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Database
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-400">
                <CircleAlert size={15} /> Not connected
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
