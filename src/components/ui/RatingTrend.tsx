"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Point {
  date: string;
  rating: number;
}

/** Compact inline sparkline used in cards and tables. */
export function RatingTrendSparkline({ data }: { data: Point[] }) {
  if (data.length < 2) {
    return <span className="text-xs text-gray-400">Not enough data</span>;
  }

  const first = data[0].rating;
  const last = data[data.length - 1].rating;
  const delta = Math.round((last - first) * 100) / 100;
  const direction = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";

  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const color =
    direction === "up" ? "#059669" : direction === "down" ? "#d0021b" : "#8a8a8a";

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-20 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis domain={["dataMin - 0.3", "dataMax + 0.3"]} hide />
            <Line
              type="monotone"
              dataKey="rating"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span
        className={cn(
          "flex items-center gap-0.5 text-xs font-medium tabular-nums",
          direction === "up" && "text-emerald-600",
          direction === "down" && "text-kvm-red",
          direction === "flat" && "text-gray-400"
        )}
      >
        <Icon size={13} aria-hidden="true" />
        {delta > 0 ? "+" : ""}
        {delta.toFixed(2)}
      </span>
    </div>
  );
}

/** Larger chart used on the player profile page. */
export function RatingTrendChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        No rated matches yet
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fontSize: 11, fill: "#8a8a8a" }}
            width={28}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="#d0021b"
            strokeWidth={2}
            dot={{ r: 3, fill: "#d0021b" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
