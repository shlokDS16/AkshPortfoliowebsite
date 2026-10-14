import { Pencil } from "lucide-react";
import { NeedsYouCard } from "@/components/desk/private/needs-you-card";
import { Tray } from "@/components/desk/private/tray";
import { formatCount } from "@/lib/format";
import type { NeedsYou } from "@/modules/ledger/client";

const SHOWN = 12;
const WORD = { check: "Needs a check", lesson: "No lesson yet", horizon: "Past its horizon" } as const;

/** The ideas that need a look, listed as cards (a flagged idea is never hidden). Each card opens the idea. */
export function LedgerNeeds({ cards }: { cards: NeedsYou[] }) {
  return (
    <Tray title="Needs you" count={cards.length} empty={{ body: "Nothing needs you. Ideas past their horizon, closed ideas with no lesson, and prices that need a check appear here." }}>
      <div className="space-y-3">
        {cards.slice(0, SHOWN).map((c) => (
          <NeedsYouCard
            key={`${c.kind}-${c.ideaId}`}
            tone={c.kind === "check" ? "bad" : "warn"}
            icon={c.kind === "lesson" ? Pencil : undefined}
            stateWord={WORD[c.kind]}
            title={c.name}
            body={c.body}
            action={{ label: c.kind === "lesson" ? "Write the lesson" : "Open the idea", href: `/desk/ledger/${c.ideaId}#new-entry` }}
          />
        ))}
        {cards.length > SHOWN ? <p className="text-small text-ink-muted">{formatCount(cards.length - SHOWN, "more idea")} need you; open the lists below.</p> : null}
      </div>
    </Tray>
  );
}
