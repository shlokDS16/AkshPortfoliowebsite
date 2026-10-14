"use client";

import { EventForm } from "@/components/desk/private/ledger/event-form";
import { IdeaForm } from "@/components/desk/private/ledger/idea-form";

// Development only: the two Ledger forms with an action that refuses, so their error state can be seen. No database.
const COMPANIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Kaveri Pumps (fictional)", symbol: "KAVPUMPS", needsReview: false },
  { id: "22222222-2222-4222-8222-222222222222", name: "Unlisted Co (fictional)", symbol: null, needsReview: false },
  { id: "33333333-3333-4333-8333-333333333333", name: "Stub Ltd (fictional)", symbol: "STUB", needsReview: true },
];
const refuse = async () => ({ error: "ledger-opposite-open" as const });

export function FormsPreview() {
  return (
    <div className="space-y-10">
      <IdeaForm companies={COMPANIES} action={refuse} />
      <EventForm ideaId={COMPANIES[0]!.id} allowed={["note", "revise", "upsize", "downsize", "close", "void"]} voidUntil="2026-10-13T09:30:00Z" action={refuse} />
    </div>
  );
}
