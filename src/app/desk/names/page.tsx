import { StubCompanyList } from "@/components/desk/private/stub-company-list";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listNamesToScreen } from "@/modules/catalog";
import { requireAdmin } from "@/modules/identity";

export default async function NamesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const errorMessage = errorText(error);
  const noticeMessage = noticeText(notice);
  const names = await listNamesToScreen(await createSupabaseServerClient());
  return (
    <div className="space-y-4">
      <h1 className="text-title text-ink desk:text-title-desk">New names</h1>
      <p className="text-small text-ink-muted">Like a screener: say who each one is. Your notes were saved either way.</p>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      {noticeMessage ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {noticeMessage}
        </p>
      ) : null}
      <StubCompanyList names={names} />
    </div>
  );
}
