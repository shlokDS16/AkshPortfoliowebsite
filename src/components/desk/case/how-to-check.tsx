import { formatDate } from "@/lib/format";
import type { CaseStudyView } from "@/modules/showcase";
import { Machine } from "./case-entry";
import { FingerprintCheck } from "./fingerprint-check";

const RULE = "Each fingerprint is the SHA-256 of the fingerprint before it, one line break, and the sealed text below, in UTF-8, with nothing after it.";
const LIMIT =
  "This shows the text is the one the desk sealed at that place in its chain. It does not show when it was written: the public copy of the fingerprints is not switched on.";

/** Spec s33.7: one collapsed block per entry (the previous fingerprint, the sealed text, the button), then what the check cannot show. */
export function HowToCheck({ checks, publicFile }: Pick<CaseStudyView, "checks" | "publicFile">) {
  return (
    <>
      <p data-lint-exclude className="max-w-[72ch] text-body text-ink-body">
        {RULE}
      </p>
      <div className="mt-(--stack) border-t border-rule">
        {checks.map((c) => (
          <details key={c.seq} className="border-b border-rule">
            <summary className="flex min-h-11 cursor-pointer items-center py-2 text-body text-ink marker:text-ink-muted">
              {c.kindLabel}, <span className="ml-1 tabular-nums">{formatDate(c.sealedOn)}</span>
            </summary>
            <Machine className="space-y-3 pb-4">
              <div>
                <p className="uppercase">Fingerprint before it</p>
                <p className="break-all text-ink">{c.prevHash}</p>
              </div>
              <div>
                <p className="uppercase">Sealed text</p>
                <pre className="whitespace-pre-wrap break-all text-ink select-all">{c.canonical}</pre>
              </div>
              <div>
                <p className="uppercase">Its fingerprint</p>
                <p className="break-all text-ink">{c.hash}</p>
              </div>
              <FingerprintCheck prevHash={c.prevHash} canonical={c.canonical} hash={c.hash} />
              {c.findLine ? <p className="font-sans text-small text-ink-body">{c.findLine}</p> : null}
            </Machine>
          </details>
        ))}
      </div>
      {publicFile ? null : (
        <p data-lint-exclude className="mt-(--stack) max-w-[72ch] text-small text-ink-muted desk:text-small-desk">
          {LIMIT}
        </p>
      )}
    </>
  );
}
