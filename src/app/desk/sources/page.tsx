import { EmptyState } from "@/components/desk/empty-state";
import { AddForm } from "@/components/desk/private/sources/add-form";
import { buildCards, companyOptions, conceptOptions, readFilters, type FilterQuery } from "@/components/desk/private/sources/cards";
import { SourceCard } from "@/components/desk/private/sources/source-card";
import { SourceFilters } from "@/components/desk/private/sources/source-filters";
import { featureOn } from "@/lib/features";
import { errorText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAttachables } from "@/modules/catalog";
import { requireAdmin } from "@/modules/identity";
import { listItemsByIds } from "@/modules/research";
import { createSupabaseSourcesRepo, listSources } from "@/modules/sources";
import { archiveSourceAction, readAgainAction, restoreSourceAction, saveSourceAction, updateSourceAction } from "@/modules/sources/actions";
import { ItemsSubnav } from "../items/items-subnav";

type Query = FilterQuery & { error?: string };

/**
 * /desk/sources (spec s6.5): add a source (a link, the companies and concepts it informs, his note), then every saved source, newest first. The
 * machine's data on each card is read by the server once and shown in the machine face; his note is his. Filter by company, concept or "on a public file".
 */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const query = await searchParams;
  const db = await createSupabaseServerClient();
  const attachables = await listAttachables(db);
  const filters = readFilters(query, attachables.companies, attachables.concepts);
  const repo = createSupabaseSourcesRepo(db);
  const [records, publicLinks] = await Promise.all([
    listSources(repo, { companyId: filters.companyId, themeId: filters.themeId, includeArchived: filters.includeArchived }),
    repo.publicLinks(),
  ]);
  const shown = filters.onPublic ? records.filter((r) => publicLinks.has(r.id)) : records;
  const fileIds = [...new Set(shown.flatMap((r) => publicLinks.get(r.id) ?? []))];
  const itemTitles = new Map((await listItemsByIds(db, fileIds)).map((i) => [i.id, i.title]));
  const cards = buildCards({ records: shown, companies: attachables.companies, concepts: attachables.concepts, publicLinks, itemTitles });
  const companies = companyOptions(attachables.companies);
  const concepts = conceptOptions(attachables.concepts);
  const errorMessage = errorText(query.error);
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">Sources</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">
        Other people&apos;s videos, pages and newsletters you studied. Paste a link here, or put s: and the link in the capture box. The desk reads the title and the
        picture once. What you write about a link is private until you put it on a company file.
      </p>
      <ItemsSubnav ownVideos={featureOn("ownVideos")} letters={featureOn("letters")} />
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      <AddForm action={saveSourceAction} companies={companies} concepts={concepts} />
      <section aria-labelledby="saved-heading" className="space-y-4">
        <h2 id="saved-heading" className="text-subtitle text-ink desk:text-subtitle-desk">
          Saved sources <span className="tabular-nums text-ink-muted">{cards.length}</span>
        </h2>
        <SourceFilters companies={attachables.companies} concepts={attachables.concepts} selected={filters.selected} />
        {cards.length === 0 ? (
          <EmptyState
            body={records.length === 0 && !filters.companyId && !filters.themeId ? "No sources yet. Paste a link above." : "No source matches these filters."}
            shape={["Title", "Channel or site", "Picture", "My note", "Status"]}
          />
        ) : (
          <ul className="divide-y divide-rule">
            {cards.map((model) => (
              <SourceCard
                key={model.record.id}
                model={model}
                companies={companies}
                concepts={concepts}
                actions={{
                  readAgain: readAgainAction.bind(null, model.record.id),
                  archive: archiveSourceAction.bind(null, model.record.id),
                  restore: restoreSourceAction.bind(null, model.record.id),
                  update: updateSourceAction.bind(null, model.record.id),
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
