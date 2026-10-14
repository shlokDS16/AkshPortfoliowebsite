import Link from "next/link";
import { JournalList } from "@/components/desk/private/ledger/journal-list";
import { JOURNAL_INTRO, JOURNAL_TITLE } from "@/lib/messages-closes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { getJournal } from "@/modules/ledger";
import { windowOf } from "@/modules/ledger/client";

const WINDOW = 25;

type Props = { searchParams: Promise<{ lessons?: string }> };

export default async function JournalPage({ searchParams }: Props) {
  await requireAdmin();
  const { lessons: raw } = await searchParams;
  const limit = windowOf(raw, WINDOW);
  const lessons = await getJournal(await createSupabaseServerClient());
  return (
    <div className="max-w-[56rem] space-y-6">
      <p className="text-small">
        <Link href="/desk/ledger" className="underline decoration-1 underline-offset-3">
          Ledger
        </Link>
      </p>
      <h1 className="text-title text-ink desk:text-title-desk">{JOURNAL_TITLE}</h1>
      <p className="max-w-[62ch] text-small text-ink-muted desk:text-small-desk">{JOURNAL_INTRO}</p>
      <JournalList lessons={lessons} limit={limit} moreHref={`/desk/ledger/journal?lessons=${limit + WINDOW}`} />
    </div>
  );
}
