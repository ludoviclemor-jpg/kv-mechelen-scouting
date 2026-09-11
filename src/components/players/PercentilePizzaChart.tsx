"use client";

import { cn } from "@/lib/utils";

export interface PizzaWedge {
  label: string;
  percentile: number | null; // null = not enough comparable players to rank this metric
  group: "attacking" | "progression" | "duels";
}

const GROUP_COLOR: Record<PizzaWedge["group"], { fill: string; text: string }> = {
  attacking: { fill: "#e30613", text: "#ffffff" }, // kvm-red
  progression: { fill: "#e0b400", text: "#1a1712" }, // kvm-yellow-dark, dark text for contrast
  duels: { fill: "#2b5da8", text: "#ffffff" },
};

const SIZE = 480;
const CENTER = SIZE / 2;
const INNER_R = 56;
const MAX_R = 196;
const LABEL_R = 214;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function point(radius: number, angleDeg: number) {
  const rad = toRad(angleDeg);
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function wedgePath(startAngle: number, endAngle: number, rInner: number, rOuter: number) {
  const p1 = point(rInner, startAngle);
  const p2 = point(rOuter, startAngle);
  const p3 = point(rOuter, endAngle);
  const p4 = point(rInner, endAngle);
  return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${rOuter} ${rOuter} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${rInner} ${rInner} 0 0 0 ${p1.x} ${p1.y} Z`;
}

/** Label text-anchor + slight offset so text on the right/left halves of the circle doesn't overlap the wedge. */
function labelAnchor(midAngle: number): "start" | "middle" | "end" {
  const norm = ((midAngle % 360) + 360) % 360; // 0 = top, clockwise
  const distFromTop = Math.min(Math.abs(norm - 0), Math.abs(norm - 360));
  const distFromBottom = Math.abs(norm - 180);
  if (distFromTop < 12 || distFromBottom < 12) return "middle";
  return norm > 0 && norm < 180 ? "start" : "end";
}

/**
 * A percentile "pizza" chart — one wedge per metric, radius = that
 * metric's real percentile rank (0-100) against comparable players
 * (see src/lib/percentile.ts), grouped/colored by phase of play. A
 * metric Impect hasn't computed enough comparable data for renders as a
 * flat grey sliver with "–", never a guessed rank.
 */
export function PercentilePizzaChart({
  wedges,
  centerContent,
}: {
  wedges: PizzaWedge[];
  centerContent?: React.ReactNode;
}) {
  const n = wedges.length;
  const anglePerWedge = 360 / n;

  return (
    <div className="relative mx-auto" style={{ width: SIZE, maxWidth: "100%", aspectRatio: "1 / 1" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Percentile chart">
        <circle cx={CENTER} cy={CENTER} r={MAX_R} fill="none" stroke="#e7e1d4" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="#ffffff" stroke="#e7e1d4" strokeWidth={1} />

        {wedges.map((w, i) => {
          const startAngle = -90 + i * anglePerWedge + 1.2;
          const endAngle = -90 + (i + 1) * anglePerWedge - 1.2;
          const midAngle = (startAngle + endAngle) / 2;
          const hasData = w.percentile !== null;
          const outerR = INNER_R + ((hasData ? w.percentile! : 4) / 100) * (MAX_R - INNER_R);
          const colors = GROUP_COLOR[w.group];
          const badgePoint = point(Math.max(outerR - 4, INNER_R + 14), midAngle);
          const labelPoint = point(LABEL_R, midAngle);
          const anchor = labelAnchor(midAngle);

          return (
            <g key={w.label}>
              <path d={wedgePath(startAngle, endAngle, INNER_R, outerR)} fill={hasData ? colors.fill : "#d8d1c0"} opacity={hasData ? 1 : 0.6} />
              <g transform={`translate(${badgePoint.x} ${badgePoint.y})`}>
                <rect x={-15} y={-10} width={30} height={20} rx={5} fill="#ffffff" stroke={hasData ? colors.fill : "#9a9488"} strokeWidth={1.5} />
                <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill={hasData ? "#1a1712" : "#85807a"}>
                  {hasData ? w.percentile : "–"}
                </text>
              </g>
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={12.5}
                fontWeight={600}
                fill="#4a453e"
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>

      {centerContent ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">{centerContent}</div>
        </div>
      ) : null}
    </div>
  );
}

export function PizzaLegend() {
  const items: { key: PizzaWedge["group"]; label: string }[] = [
    { key: "attacking", label: "Attacking output" },
    { key: "progression", label: "Progression / packing" },
    { key: "duels", label: "Duels & ball security" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className={cn("h-2.5 w-2.5 rounded-sm")} style={{ background: GROUP_COLOR[it.key].fill }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}
