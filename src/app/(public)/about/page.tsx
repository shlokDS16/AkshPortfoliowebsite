import type { Metadata } from "next";
import { STANDARD_DISCLOSURE } from "@/components/desk/disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "About and disclosures", description: "Who writes the case files, how a page gets published, and the standard disclosure." };

// The publishing rules in plain words (docs/compliance/publishing-rules.md). Chrome, third person (design-dna 13.1).
const RULES = [
  "No language that tells anyone to buy, sell or hold a named company.",
  "No claims about returns or hit rates.",
  "Every figure is at least 30 days old; anything younger shows as withheld, with the date it becomes public.",
  "No file is first published within 30 days of a change of stance in Aksh's private notes.",
  "Every file states whether Aksh holds a position.",
  "Every page states what it teaches.",
  "Every revision passes these checks again before it goes live.",
  "Titles, summaries and share images are checked too.",
  "Valuation models stay private; files show operating scenarios only.",
];

export default async function AboutPage() {
  const snapshot = await getSnapshot();
  const reviewed = snapshot.status === "ok" ? snapshot.data.today : istDate(new Date());
  return (
    <PublicFrame current="about" chrome={snapshot.status === "ok" ? buildSiteChrome(snapshot.data) : null} strip={{ variant: "site" }}>
      <article data-lint-exclude className="prose-read pt-8 text-read text-ink-body desk:text-read-desk">
        <h1 className="text-display text-ink desk:text-display-desk">About and disclosures</h1>
        <p className="my-(--para)">
          Aksh Agrawal is a student in India who studies listed companies. Each case file records what he expected, the tests that would prove him wrong,
          and every revision since. The files are case studies written to learn how businesses work.
        </p>
        <h2 className="mt-(--section-gap) text-title text-ink desk:text-title-desk">How a page gets published</h2>
        <ol className="my-(--para) list-decimal space-y-1 pl-6">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="my-(--para)">The checks run in code before anything is published. There is no switch that skips them.</p>
        <section id="disclosures" className="mt-(--section-gap) border-t-2 border-ink bg-surface p-4 desk:p-6">
          <h2 className="text-title text-ink desk:text-title-desk">Disclosures</h2>
          <p className="mt-2 text-small text-ink-body desk:text-small-desk">{STANDARD_DISCLOSURE("stated on each file", formatDate(reviewed))}</p>
        </section>
      </article>
    </PublicFrame>
  );
}
