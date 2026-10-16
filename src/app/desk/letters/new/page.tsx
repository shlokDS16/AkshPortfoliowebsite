import { CandidatePicker } from "@/components/desk/private/letters/candidate-picker";
import { Flash } from "@/components/desk/private/letters/flash";
import { LettersNav } from "@/components/desk/private/letters/letters-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readCandidatesNow } from "@/modules/distribution";
import { makeLetterAction } from "@/modules/distribution/actions";
import { requireAdmin } from "@/modules/identity";

/** /desk/letters/new (spec s8.1): the public changes that are not in a sent letter yet, each ticked. "Make this letter" is his press; nothing is drafted for him. */
export default async function NewLetterPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const { candidates, total } = await readCandidatesNow(await createSupabaseServerClient());
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">What changed</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">
        These public changes are not in a sent letter yet. Each entry is copied as it is on the site, with the page it came from. You can leave any out; you cannot change their words here.
      </p>
      <LettersNav current="new" />
      <Flash error={error} notice={notice} />
      <CandidatePicker candidates={candidates} total={total} action={makeLetterAction} />
    </div>
  );
}
