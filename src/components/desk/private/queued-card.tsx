"use client";

import { formatCount } from "@/lib/format";
import { NeedsYouCard } from "./needs-you-card";
import { useQueuedCount } from "./use-queue-state";

export function QueuedCard() {
  const queued = useQueuedCount();
  if (queued === 0) return null;
  return (
    <NeedsYouCard
      tone="neutral"
      stateWord="On this phone"
      title={`${formatCount(queued, "note")} not synced yet`}
      body="They are saved on this phone and will sync when you are back online. Nothing is lost."
    />
  );
}
