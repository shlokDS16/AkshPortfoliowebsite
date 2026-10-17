"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/messages";
import type { ReadAgainState, SourceActionState } from "@/modules/sources/actions";

export type ActionsProps = {
  id: string;
  archived: boolean;
  actions: { readAgain: () => Promise<ReadAgainState>; archive: () => Promise<SourceActionState>; restore: () => Promise<SourceActionState> };
};

/**
 * A card's buttons. "Read again" asks the server to read this one link now (it refuses inside a minute of the last read, in a fixed sentence);
 * "Archive" and "Restore" move it off or back on the list (the database refuses while a public file shows it, also in a fixed sentence). A
 * success needs no message: the page is refreshed by the action and the card shows the new state.
 */
export function SourceActions({ archived, actions }: Omit<ActionsProps, "id">) {
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const run = (call: () => Promise<{ ok: boolean; error?: string }>, isRead = false) => {
    setRefusal(null);
    setReading(isRead);
    start(async () => {
      const answer = await call().catch(() => ({ ok: false, error: "save-failed" }));
      if (!answer.ok) setRefusal(errorText(answer.error) ?? errorText("save-failed"));
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {archived ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(actions.restore)}>
            Restore
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(actions.readAgain, true)}>
              Read again
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(actions.archive)}>
              Archive
            </Button>
          </>
        )}
      </div>
      {pending && reading ? <p className="text-small text-ink-muted">Reading the link</p> : null}
      {refusal ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
