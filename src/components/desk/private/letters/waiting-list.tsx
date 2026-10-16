import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { WaitingReader } from "@/modules/distribution";
import { PendingButton } from "../pending-button";

type Action = (formData: FormData) => Promise<void>;

/**
 * The people who asked and have not been sent a confirmation email: the address and the day they asked, nothing else (spec s8.5). Confirmed
 * readers are never listed. "Bin" deletes a request and emails no one; its id travels in a hidden field, never as text.
 */
export function WaitingList({ waiting, bin }: { waiting: WaitingReader[]; bin: Action }) {
  if (waiting.length === 0) return <p className="text-small text-ink-muted">No one is waiting.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-rule">
        {waiting.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
            <span className="min-w-0 space-y-0.5">
              <span className="block break-all text-body text-ink">{w.email}</span>
              <span data-machine className="block font-mono text-mono-tag tabular-nums text-ink-muted">
                Asked {formatDate(istDate(w.requestedAt))}
              </span>
            </span>
            <form action={bin}>
              <input type="hidden" name="id" value={w.id} />
              <PendingButton variant="outline" size="sm">
                <span aria-hidden>Bin</span>
                <span className="sr-only">Bin the request from {w.email}</span>
              </PendingButton>
            </form>
          </li>
        ))}
      </ul>
      <form action={bin} className="space-y-1">
        <input type="hidden" name="all" value="1" />
        <PendingButton variant="outline" size="sm">
          Bin all {waiting.length}
        </PendingButton>
      </form>
      <p className="text-small text-ink-muted">Binning deletes the request. Nothing is emailed to the reader.</p>
    </div>
  );
}
