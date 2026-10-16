import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PendingButton } from "../pending-button";

/** A linked concept that is not public: the gate will refuse the revision until it is. `action` is "Make public" for a checked concept; a stub has none. */
export type ConceptCheck = { id: string; name: string; unchecked: boolean; action: ((formData: FormData) => Promise<void>) | null };

// The name is his and can be long: the button wraps it rather than widening the phone page (min-w-0 lets the column shrink).
/** One checklist line, mirroring the company line: the sentence, and the way out. */
export function ConceptCheckRow({ concept }: { concept: ConceptCheck }) {
  return (
    <li className="flex gap-2 bg-bad-wash px-2 py-2">
      <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-bad" />
      <div className="min-w-0 text-small">
        <p className="font-semibold text-ink">Linked concept</p>
        <p className="text-ink-muted">{concept.unchecked ? `Concept "${concept.name}" is not checked yet.` : `Concept "${concept.name}" is not public yet.`}</p>
        {concept.unchecked ? (
          <Link href="/desk/names" className="mt-1 inline-flex min-h-11 items-center text-small text-ink underline decoration-1 underline-offset-3">
            Check it on Names
          </Link>
        ) : concept.action ? (
          <form action={concept.action} className="mt-1">
            <PendingButton variant="outline" size="sm" className="h-auto min-h-8 py-1.5 whitespace-normal text-left pointer-coarse:h-auto pointer-coarse:min-h-11">
              Make {concept.name} public
            </PendingButton>
          </form>
        ) : null}
      </div>
    </li>
  );
}
