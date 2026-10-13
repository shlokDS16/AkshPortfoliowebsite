import Link from "next/link";
import { IdeaForm } from "@/components/desk/private/ledger/idea-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { isLedgerId, listPickCompanies } from "@/modules/ledger";
import { openIdeaAction } from "@/modules/ledger/actions";

type Props = { searchParams: Promise<{ company?: string; item?: string }> };

export default async function NewIdeaPage({ searchParams }: Props) {
  await requireAdmin();
  const { company, item } = await searchParams;
  const companies = await listPickCompanies(await createSupabaseServerClient());
  return (
    <div className="space-y-6">
      <p className="text-small">
        <Link href="/desk/ledger" className="underline decoration-1 underline-offset-3">
          Ledger
        </Link>
      </p>
      <h1 className="text-title text-ink desk:text-title-desk">Record an idea</h1>
      <p className="max-w-[60ch] text-small text-ink-muted desk:text-small-desk">
        This is a commitment, not a passing thought. The desk seals it with the date and time it is saved, then sets the entry price at the next close.
      </p>
      <IdeaForm companies={companies} action={openIdeaAction} companyId={isLedgerId(company) ? company : ""} itemId={isLedgerId(item) ? item : undefined} />
    </div>
  );
}
