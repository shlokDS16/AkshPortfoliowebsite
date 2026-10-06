import type { Streak } from "@/modules/capture";

export function StreakStrip({ streak }: { streak: Streak }) {
  return (
    <section aria-label="Capture streak" className="space-y-1">
      <div className="flex gap-0.5">
        {streak.days.map((day) => (
          <span
            key={day.date}
            title={`${day.date}: ${day.count}`}
            className={`h-3 flex-1 rounded-sm ${day.count > 0 ? "bg-foreground" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Logged research on {streak.activeDays} of the last {streak.windowDays} days.
      </p>
    </section>
  );
}
