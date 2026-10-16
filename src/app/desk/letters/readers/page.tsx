import { Flash } from "@/components/desk/private/letters/flash";
import { LettersNav } from "@/components/desk/private/letters/letters-nav";
import { ReadersPanel } from "@/components/desk/private/letters/readers-panel";
import { grievanceContact } from "@/lib/letters-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseLettersReads } from "@/modules/distribution";
import { binRequestsAction, eraseReaderAction, sendConfirmationsAction, setSignupAction } from "@/modules/distribution/actions";
import { requireAdmin } from "@/modules/identity";
import { lettersOn } from "@/modules/ops/jobs";

/** /desk/letters/readers (spec s8.5): counts, the people waiting for a confirmation email, "Send confirmation emails" as its own press, and the sign-up switch. */
export default async function ReadersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const reads = createSupabaseLettersReads(await createSupabaseServerClient());
  const [counts, left, leftToday, signupOn, waiting] = await Promise.all([
    reads.readerCounts(),
    reads.confirmationsLeftToday(),
    reads.leftOnFormToday(),
    reads.signupOn(),
    reads.waiting(),
  ]);
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">Readers</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">
        People who asked for letters. Nobody is emailed until you press Send confirmation emails. Confirmed readers are only counted here, never listed.
      </p>
      <LettersNav current="readers" />
      <Flash error={error} notice={notice} />
      <ReadersPanel
        on={lettersOn()}
        counts={counts}
        left={left}
        leftToday={leftToday}
        signupOn={signupOn}
        contactSet={grievanceContact() !== null}
        waiting={waiting}
        actions={{
          sendConfirmations: sendConfirmationsAction,
          bin: binRequestsAction,
          erase: eraseReaderAction,
          openSignup: setSignupAction.bind(null, true),
          closeSignup: setSignupAction.bind(null, false),
        }}
      />
    </div>
  );
}
