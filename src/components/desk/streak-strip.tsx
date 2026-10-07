import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { StreakData } from "@/lib/view-types";

/** Counts only, no content of the private notes (decisions.md segment 2). */
export function StreakStrip({ cells, daysLogged, lastEntry, variant = "tile" }: StreakData & { variant?: "tile" | "rail" | "desk" }) {
  const days = cells.length;
  const sentence =
    variant === "desk"
      ? `Logged research on ${daysLogged} of the last ${days} days.`
      : variant === "rail"
        ? `${daysLogged} of the last ${days} days research logged; counts only.`
        : daysLogged === 0
          ? `No research logged in the last ${days} days.`
          : `${daysLogged} of the last ${days} days.`;
  return (
    <div className={variant === "rail" ? "mt-8 border-t border-rule pt-4" : undefined}>
      <div role="img" aria-label={`Research logged on ${daysLogged} of the last ${days} days`} className="grid grid-cols-30 gap-px">
        {cells.map((on, i) => (
          <span key={i} data-cell className={cn("h-3", on ? "bg-ink" : "bg-rule")} />
        ))}
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        {sentence}
        {lastEntry && variant !== "desk" ? ` Last entry ${formatDate(lastEntry)}.` : ""}
      </p>
    </div>
  );
}
