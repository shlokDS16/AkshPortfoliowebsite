import { Flash } from "@/components/desk/private/letters/flash";
import { LetterList } from "@/components/desk/private/letters/letter-list";
import { LettersNav } from "@/components/desk/private/letters/letters-nav";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listLetterRows } from "@/modules/distribution";
import { requireAdmin } from "@/modules/identity";
import { lettersOn } from "@/modules/ops/jobs";

/** /desk/letters (spec s8.1): every letter, newest first, each with one line from its send rows. No sixth tab: Items stays current and links lead here. */
export default async function LettersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const rows = await listLetterRows(await createSupabaseServerClient());
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">Letters</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">A letter lists what changed on the site since the last one. You write the subject, publish it to the archive, and send it only when you press Send.</p>
      <LettersNav current="list" />
      <Flash error={error} notice={notice} />
      {lettersOn() ? null : <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">{LETTERS_OFF_LINE}</p>}
      <LetterList rows={rows} />
    </div>
  );
}
