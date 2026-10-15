import Link from "next/link";
import { formatDate } from "@/lib/format";

type PublicFile = { url: string; since: string } | null;

/**
 * Spec s33.6: "How this record is kept", rendered on /process only while a ledger case study is public. Fixed copy, not typed per
 * page. It says what the fingerprints show and what they do not, and that results stay private. `publicFile` is the one-line
 * switch (PUBLIC_FINGERPRINT_FILE in casefile/case-record.ts); null while the public copy is off.
 */
export function RecordKeeping({ publicFile }: { publicFile: PublicFile }) {
  return (
    <section id="record" aria-labelledby="record-heading" data-section data-lint-exclude className="mt-(--section-gap)">
      <h2 id="record-heading" className="text-title text-ink desk:text-title-desk">
        How this record is kept
      </h2>
      <div className="mt-(--stack) max-w-(--measure) space-y-(--para) text-read text-ink-body desk:text-read-desk">
        <p>
          Aksh keeps a private record of his investment ideas. Each entry names the company, says whether he expected it to do better or worse than the
          Nifty 50 and over what period, and says why, in his words.
        </p>
        <p>
          Each entry is sealed when it is written: the desk stores its exact text and a fingerprint (a SHA-256 hash) that also covers the entry before it,
          so no entry can be changed, reordered or removed through the desk without breaking the chain. The desk checks the chain every day and refuses to
          score or publish when it does not hold. The database owner could still rewrite the whole chain; a public copy of the fingerprints is what would
          show that.
        </p>
        <p>
          No entry carries a date he chooses. An idea can be withdrawn only in its first hours, before its first price is known, and the withdrawal is itself
          an entry.
        </p>
        <p>
          Entry and exit prices are the first official NSE closing prices after the entry was sealed; he does not type them. Results are price only, against
          the Nifty 50 price index, without dividends.
        </p>
        <p>
          Results stay private. This site shows no figure for how his ideas did. A closed idea may be written up as a case study at least 30 days after the
          latest entry it shows, through the same publishing checks as every page. Aksh chooses which ones to write up; the Mistakes page lists every
          published case in which he judged his own process wrong.
        </p>
        {publicFile ? (
          <p>
            Since {formatDate(publicFile.since)} the desk publishes each day&apos;s fingerprints in a public file,{" "}
            <a href={publicFile.url} className="break-all">
              {publicFile.url}
            </a>
            , and GitHub dates every change to it. An entry sealed before {formatDate(publicFile.since)} can be dated by that file only to{" "}
            {formatDate(publicFile.since)}.
          </p>
        ) : (
          <p>
            The public copy of the fingerprints is not switched on. Until it is, a fingerprint shows that an entry is the one the desk sealed at that place in
            its chain, not when it was written.
          </p>
        )}
        <p>
          <Link href="/cases">Read the closed cases</Link>
        </p>
      </div>
    </section>
  );
}
