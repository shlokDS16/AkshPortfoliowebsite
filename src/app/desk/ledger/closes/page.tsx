import Link from "next/link";
import { ActionForm, type Correcting } from "@/components/desk/private/ledger/action-form";
import { CloseForm } from "@/components/desk/private/ledger/close-form";
import { ClosesCurrent, ClosesDays } from "@/components/desk/private/ledger/closes-days";
import { HandCloses, RestatedScores, UploadRecords } from "@/components/desk/private/ledger/closes-hand";
import { CorporateActions } from "@/components/desk/private/ledger/corporate-actions";
import { FetchCloses } from "@/components/desk/private/ledger/fetch-closes";
import { NseDrop } from "@/components/desk/private/ledger/nse-drop";
import { istDate } from "@/lib/dates";
import { errorText, noticeText } from "@/lib/messages";
import {
  ACTIONS_HEADING, CLOSES_DAYS_HEADING, CLOSES_INTRO, CLOSES_TITLE, DROP_HEADING, FETCH_HEADING, HAND_HEADING, RESTATED_HEADING, TYPE_HEADING, UPLOADS_HEADING,
} from "@/lib/messages-closes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { getClosesPage, isLedgerId } from "@/modules/ledger";
import { addCorporateActionAction, enterCloseAction } from "@/modules/ledger/actions";
import { readRuns } from "../runs";
import { fetchClosesNowAction } from "./actions";

export const maxDuration = 60; // "Fetch closes now" runs the closes step (up to 25 s) and the scores (5 s)

type Props = { searchParams: Promise<{ error?: string; notice?: string; correct?: string }> };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="space-y-3 border-t border-rule pt-5">
      <h2 id={`${id}-h`} className="text-title text-ink desk:text-title-desk">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function ClosesPage({ searchParams }: Props) {
  await requireAdmin();
  const { error, notice, correct } = await searchParams;
  const today = istDate(new Date());
  const db = await createSupabaseServerClient();
  const [page, runs] = await Promise.all([getClosesPage(db, today), readRuns(db, ["ledger:prices", "ledger:score"])]);
  const message = errorText(error);
  const noticeMessage = noticeText(notice);
  // A correction starts from the entry in force it replaces; an id that is not one in force is ignored.
  const live = page.actions.flatMap((g) => g.live.map((a) => ({ ...a, companyId: g.companyId })));
  const target = isLedgerId(correct) ? live.find((a) => a.id === correct) : undefined;
  const correcting: Correcting | null = target
    ? { id: target.id, companyId: target.companyId, kind: target.kind, exDate: target.exDate, factor: target.factor, note: target.note }
    : null;
  const total = page.actions.reduce((n, g) => n + g.live.length + g.replaced.length, 0);
  return (
    <div className="max-w-[56rem] space-y-6">
      <p className="text-small">
        <Link href="/desk/ledger" className="underline decoration-1 underline-offset-3">
          Ledger
        </Link>
      </p>
      <h1 className="text-title text-ink desk:text-title-desk">{CLOSES_TITLE}</h1>
      <p className="max-w-[62ch] text-small text-ink-muted desk:text-small-desk">{CLOSES_INTRO}</p>
      {message ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {message}
        </p>
      ) : null}
      {noticeMessage ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {noticeMessage}
        </p>
      ) : null}
      <ClosesCurrent status={page.status} runs={runs} />
      <Section id="days" title={CLOSES_DAYS_HEADING}>
        <ClosesDays days={page.days} />
      </Section>
      <Section id="fetch" title={FETCH_HEADING}>
        <FetchCloses action={fetchClosesNowAction} />
      </Section>
      <Section id="drop" title={DROP_HEADING}>
        <NseDrop today={today} />
      </Section>
      <Section id="typed" title={TYPE_HEADING}>
        <CloseForm key={page.hand.length} companies={page.companies} today={today} action={enterCloseAction} />
      </Section>
      <Section id="hand" title={HAND_HEADING}>
        <HandCloses closes={page.hand} />
      </Section>
      <Section id="uploads" title={UPLOADS_HEADING}>
        <UploadRecords uploads={page.uploads} />
      </Section>
      <Section id="restated" title={RESTATED_HEADING}>
        <RestatedScores items={page.restated} />
      </Section>
      <Section id="actions" title={ACTIONS_HEADING}>
        <CorporateActions groups={page.actions} />
        <ActionForm key={`${total}-${correcting?.id ?? "new"}`} companies={page.companies} action={addCorporateActionAction} correcting={correcting} />
      </Section>
    </div>
  );
}
