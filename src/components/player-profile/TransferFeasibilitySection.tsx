import { ContractBadge } from "@/components/ui/ContractBadge";
import { contractStatus, formatCurrency, formatDate } from "@/lib/utils";

/** One label/value row, consistent with PlayerHeader's own `Row` convention. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-kvm-ink">{children}</dd>
    </div>
  );
}

/**
 * Transfer feasibility, deliberately separate from sportive scoring
 * (Request B, section 6: "houd sportieve fit los van transferhaalbaarheid").
 * Shows only the real fields this project actually has synced —
 * market value and contract expiry (`players` table) — plus the fields
 * the brief asked for that have no real source in this project yet
 * (salary, availability, registration conditions), explicitly labelled
 * "Unknown" rather than estimated. Missing financial info here never
 * feeds back into Current Level, Potential, or KV Mechelen Fit.
 */
export function TransferFeasibilitySection({
  marketValueEUR,
  contractExpiry,
}: {
  marketValueEUR: number | null;
  contractExpiry: string | null;
}) {
  const contract = contractStatus(contractExpiry);
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Transfer Feasibility</h3>
      <dl className="divide-y divide-kvm-border rounded-md border border-kvm-border px-3">
        <Row label="Market value">
          {marketValueEUR !== null ? formatCurrency(marketValueEUR) : "Unknown"}
        </Row>
        <Row label="Contract">
          {contractExpiry ? (
            <span className="inline-flex items-center gap-1.5">
              <ContractBadge expiryIso={contractExpiry} />
              {formatDate(contractExpiry)}
            </span>
          ) : (
            "Unknown"
          )}
        </Row>
        <Row label="Salary indication">Unknown</Row>
        <Row label="Availability">Unknown</Row>
        <Row label="Registration conditions">Unknown</Row>
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        Market value is an estimate, not a proven asking price. Salary, availability and registration-condition data
        aren&apos;t currently synced from any source in this project — shown as Unknown, never estimated. Missing
        financial information here never lowers a sportive rating, and no KV Mechelen budget is assumed.
        {contract.tier === "expired" ? " This contract has already expired." : ""}
      </p>
    </section>
  );
}
