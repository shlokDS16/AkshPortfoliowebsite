import { TriangleAlert } from "lucide-react";
import type { LivenessState } from "@/modules/ops";

/** Red strip (segment 4): names what is late, says notes are safe and that Shlok was emailed. No dismiss. */
export function LivenessStrip({ state }: { state: LivenessState }) {
  if (state.status === "ok") return null;
  return (
    <div
      role="alert"
      data-testid="health-strip"
      className="relative z-(--z-strip) border-b-2 border-bad bg-bad-wash text-small text-ink desk:text-small-desk"
    >
      <p className="mx-auto flex max-w-page items-start gap-2 px-(--gutter) py-2">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-bad" />
        {state.status === "late" ? (
          <span>
            <strong className="font-semibold text-bad">Background jobs are late:</strong> {state.problems.join("; ")}. Your notes are safe; documents wait
            until the jobs run. The uptime monitor has emailed Shlok and Aksh.
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-bad">The database cannot be reached right now.</strong> New captures stay saved on this device and sync
            when it is back.
          </span>
        )}
      </p>
    </div>
  );
}
