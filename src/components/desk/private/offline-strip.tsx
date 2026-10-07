"use client";

import { WifiOff } from "lucide-react";
import { formatCount } from "@/lib/format";
import { useOnline, useQueuedCount } from "./use-queue-state";

/** "on this phone" states use --warn (design-dna 2.4); role="status", never an alert. */
export function OfflineStrip() {
  const online = useOnline();
  const queued = useQueuedCount();
  if (online) return null;
  const held = queued === 0 ? "New notes are" : `${formatCount(queued, "note")} ${queued === 1 ? "is" : "are"}`;
  return (
    <div role="status" className="relative z-(--z-strip) border-b border-dashed border-warn bg-surface text-small text-ink desk:text-small-desk">
      <p className="mx-auto flex max-w-page items-start gap-2 px-(--gutter) py-2">
        <WifiOff aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warn" />
        <span>
          <strong className="font-semibold text-warn">Offline.</strong> {held} saved on this phone and will sync when you are back online. Nothing is
          lost.
        </span>
      </p>
    </div>
  );
}
