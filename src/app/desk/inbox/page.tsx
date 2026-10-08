import { InboxSection } from "@/components/desk/private/inbox/inbox-section";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { aiPagesToday, createUsageRepo, listCompanyOptions, listInbox } from "@/modules/ingestion";
import { aiReadingOn } from "@/modules/ops/jobs";
import { readSelectedAction, setPageSelectedAction } from "./page-actions";
import { kickReadingAction } from "./pump-actions";

// The tab's own pump and the upload kick drain for up to 200 s inside this route's functions: the Hobby maximum (spec s8).
export const maxDuration = 300;

const actions = { setPageSelected: setPageSelectedAction, readSelected: readSelectedAction, kick: kickReadingAction };

/** Pages of today's free AI allowance spent, from the usage ledger the admin may read. A meter is not worth a broken inbox: null on failure. */
async function readAiPages(db: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  try {
    return aiPagesToday((await createUsageRepo(db).totals(serverEnv().GROQ_MODEL_TEXT)).today);
  } catch (error) {
    console.error("inbox: could not read the AI allowance", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

async function load() {
  const db = await createSupabaseServerClient();
  try {
    const aiOn = aiReadingOn();
    const [inbox, companies, aiPages] = await Promise.all([listInbox(db, new Date(), aiOn), listCompanyOptions(db), aiOn ? readAiPages(db) : null]);
    return { ...inbox, companies, aiPages };
  } catch (error) {
    // Name only: a database message can carry row data. The rest of the desk keeps working.
    console.error("inbox: could not load", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

export default async function InboxPage() {
  await requireAdmin();
  const inbox = await load();
  if (!inbox) {
    return (
      <div className="space-y-3">
        <h1 className="sr-only">Inbox</h1>
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          Could not load the inbox. Your uploads are safe; reload to try again.
        </p>
      </div>
    );
  }
  // Voice notes send Aksh's recordings to Groq: off unless VOICE_NOTES is "on" (ADR-004 s8).
  const voiceOn = serverEnv().VOICE_NOTES === "on";
  return <InboxSection docs={inbox.docs} usage={inbox.usage} aiOn={inbox.aiOn} aiPages={inbox.aiPages} companies={inbox.companies} actions={actions} voiceOn={voiceOn} />;
}
