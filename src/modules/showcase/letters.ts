import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { LETTER_KIND_LABEL, LETTER_POSITION_WORD } from "@/modules/distribution/public";
import { firstOn, letterHref, listedLetters, type LetterEntry, type ListedLetter } from "./letter-list";
import { cutWords, OBJECTIVE_BUDGET, TITLE_BUDGET } from "./seo-text";
import { ordinal, revisionsOf } from "./site";
import type { LetterEntryView, LetterPageView, LetterSummary, PublicSnapshot, ShareCardContent } from "./types";

// Plan 5c (spec s8.9): the archive's summaries, one letter's page model and its share card. Which letters are listed, and which entries still show,
// is letter-list.ts (it reads the snapshot and nothing else, so no reader, address or send can appear here).

export { hasLetters, letterHref, listedLetters } from "./letter-list";
export type { ListedLetter };

export function listLetterSummaries(s: PublicSnapshot): LetterSummary[] {
  return listedLetters(s).map(({ item }) => ({ slug: item.slug, href: letterHref(item.slug), subject: item.title, objective: item.learningObjective ?? "", publishedOn: firstOn(s, item) }));
}

/** His note as paragraphs: a blank line starts one, a single line break stays inside it. Whitespace-only paragraphs are dropped; nothing else is changed. */
const paragraphs = (note: string): string[] => note.split(/\r?\n(?:[ \t]*\r?\n)+/).filter((p) => /\S/.test(p));

const viewOf = (e: LetterEntry): LetterEntryView => ({
  kindLabel: LETTER_KIND_LABEL[e.kind], title: e.title, changeReason: e.changeReason, detail: e.detail, href: e.path,
  position: e.companyName === null ? null : LETTER_POSITION_WORD[e.holdsPosition ?? "not_disclosed"],
});

export function buildLetterView(s: PublicSnapshot, slug: string): LetterPageView | null {
  const found = listedLetters(s).find((l) => l.item.slug === slug);
  if (!found) return null;
  const { item, entries } = found;
  const revs = revisionsOf(s, item.id);
  const index = revs.findIndex((r) => r.id === item.revisionId);
  return {
    slug, subject: item.title, objective: item.learningObjective ?? "", note: paragraphs(item.bodyMd), entries: entries.map(viewOf),
    publishedOn: firstOn(s, item), revisedOn: istDate(item.revisedAt), revNo: index >= 0 ? index + 1 : Math.max(1, revs.length), revCount: revs.length,
  };
}

/** Spec s8.9: tag "Letter", his subject and sentence cut to the card's slots, the day it passed the gate. No figure, no reader count, no send. */
export function letterCard(s: PublicSnapshot, slug: string): ShareCardContent | null {
  const found = listedLetters(s).find((l) => l.item.slug === slug);
  if (!found) return null;
  const { item } = found;
  return {
    tag: "Letter", number: "L", sub: `R${ordinal(s, item).revNo}`, title: cutWords(item.title, TITLE_BUDGET), standfirst: cutWords(item.learningObjective ?? "", OBJECTIVE_BUDGET),
    footerLeft: `Published ${formatDate(firstOn(s, item))}`, footerRight: "For learning, not advice",
  };
}
