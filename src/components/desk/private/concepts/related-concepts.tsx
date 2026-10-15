import Link from "next/link";
import type { ConceptRef } from "@/modules/knowledge/client";
import { PendingButton } from "../pending-button";
import { LinkPicker } from "./link-picker";

type Props = {
  conceptId: string;
  slug: string;
  related: readonly ConceptRef[];
  /** Every screened concept; this one and the ones already linked are left out of the picker. */
  screened: readonly ConceptRef[];
  link: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
  unlink: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
};

/** His own links between concepts, private. Added from a picker of screened concepts, removed one tap at a time. */
export function RelatedConcepts({ conceptId, slug, related, screened, link, unlink }: Props) {
  const taken = new Set([conceptId, ...related.map((r) => r.id)]);
  return (
    <section aria-labelledby="related-h" className="space-y-3">
      <h2 id="related-h" className="text-title text-ink desk:text-title-desk">
        Related concepts
      </h2>
      {related.length > 0 ? (
        <ul className="divide-y divide-rule">
          {related.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-1">
              <Link href={`/desk/concepts/${r.slug}`} className="text-body text-ink underline decoration-1 underline-offset-3">
                {r.name}
              </Link>
              <form action={unlink.bind(null, conceptId, r.id, slug)}>
                <PendingButton variant="ghost" size="sm">
                  Remove <span className="sr-only">link to {r.name}</span>
                </PendingButton>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <LinkPicker conceptId={conceptId} slug={slug} options={screened.filter((c) => !taken.has(c.id))} link={link} />
    </section>
  );
}
