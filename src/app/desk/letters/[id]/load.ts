import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseLettersReads, letterScreen, publicRevisionIdsNow, renderLetter } from "@/modules/distribution";
import { lettersOn } from "@/modules/ops/jobs";
import { loadEditor } from "../../items/[id]/load";

/**
 * Everything the letter page shows, read once per request through Aksh's own session: the item with its revisions and gate preview (the same read
 * the item page uses), the letter's sends, the confirmed count, and which revisions the public site shows now. The email preview is made here from
 * the newest revision, with the site's own leave page where Resend's unsubscribe link goes at send time.
 */
export async function loadLetterPage(id: string) {
  const data = await loadEditor(id);
  if (!data || data.item.kind !== "letter") return null;
  const reads = createSupabaseLettersReads(await createSupabaseServerClient());
  const [sends, confirmed, currentRevisionIds] = await Promise.all([reads.sendsOf(id), reads.confirmedCount(), publicRevisionIdsNow()]);
  const { item, latest, current } = data;
  const screen = letterScreen({
    title: item.title,
    visibility: item.visibility,
    currentId: current?.id ?? null,
    latest: latest ? { id: latest.id, bodyMd: latest.bodyMd, structured: latest.structured } : null,
    sends,
    confirmed,
    on: lettersOn(),
    currentRevisionIds,
  });
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  const mail = renderLetter(
    { itemId: item.id, revisionId: latest?.id ?? "", subject: item.title, objective: item.learningObjective ?? "", note: latest?.bodyMd ?? "", entries: screen.entries },
    siteUrl,
    { unsubscribeUrl: `${siteUrl.replace(/\/+$/, "")}/letters/leave` },
  );
  return { data, screen, mail, sends, confirmed };
}

export type LetterPage = NonNullable<Awaited<ReturnType<typeof loadLetterPage>>>;
