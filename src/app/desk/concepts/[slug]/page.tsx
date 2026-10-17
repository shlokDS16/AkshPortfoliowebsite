import Link from "next/link";
import { notFound } from "next/navigation";
import { ConceptPage } from "@/components/desk/private/concepts/concept-page";
import { conceptSourceLines } from "@/components/desk/private/concepts/concept-sources";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { conceptPage, createSupabaseKnowledgeDeps, screenedConceptRefs } from "@/modules/knowledge";
import { linkConceptsAction, makePublicAction, saveDescriptionAction, unlinkConceptsAction } from "@/modules/knowledge/actions";
import { createSupabaseSourcesRepo, listSources } from "@/modules/sources";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

export default async function ConceptRoute({ params, searchParams }: Props) {
  await requireAdmin();
  const [{ slug }, { error, notice }] = await Promise.all([params, searchParams]);
  const db = await createSupabaseServerClient();
  const deps = createSupabaseKnowledgeDeps(db);
  const view = await conceptPage(deps, slug);
  if (!view) notFound();
  const screened = await screenedConceptRefs(deps);
  // The concept saved sources (Phase 5d): a list on the side, so a failed read leaves the page without it rather than failing the page.
  const sources = conceptSourceLines(await listSources(createSupabaseSourcesRepo(db), { themeId: view.concept.id }).catch(() => []));
  const errorMessage = errorText(error);
  const noticeMessage = noticeText(notice);
  return (
    <div className="space-y-(--block-gap)">
      <Link href="/desk/concepts" className="inline-flex min-h-11 items-center text-small text-ink underline decoration-1 underline-offset-3">
        Concepts
      </Link>
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
      <ConceptPage
        view={view}
        screened={screened}
        makePublic={makePublicAction.bind(null, view.concept.id, slug)}
        saveDescription={saveDescriptionAction.bind(null, view.concept.id, slug)}
        link={linkConceptsAction}
        unlink={unlinkConceptsAction}
        sources={sources}
      />
    </div>
  );
}
