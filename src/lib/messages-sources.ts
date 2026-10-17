// The desk's fixed words for sources (Phase 5d Task 3), spread into messages.ts so they travel as codes in a redirect or a returned state,
// never as free text. Every sentence is pending Shlok's approval (the task report lists them). The two "studied" refusals that come
// from the gate keep the gate's own sentences (migration 0027); these are the desk's earlier, plainer checks of the same rules.

export const SOURCE_ERROR_TEXT = {
  "source-not-found": "This source could not be found.",
  "source-no-link": "A source needs a link.", // = the capture filing error "no-source-link" (modules/capture/messages.ts; a test keeps them equal)
  "source-note-full": "A source note holds at most 4,000 characters. Shorten the note.",
  "source-on-public-file": "It is on the public file. Save a revision without it first.", // = the database's sentence (migration 0026)
  "source-too-many-companies": "A source can be attached to at most 5 companies.", // = the database's sentence
  "source-too-many-concepts": "A source can be attached to at most 8 concepts.", // = the database's sentence
  "source-read-recent": "The desk read this link less than a minute ago. Try again in a minute.",
  "studied-not-company-file": "Outside sources go on a company file.", // = rule 14.1
  "studied-too-many": "A file can show at most 12 outside sources.", // = rule 14.1
  "studied-note-long": "What readers see from me can be at most 500 characters.",
  "studied-not-attached": "One of these sources is not attached to this file's company. Attach it to the company first.",
  "studied-unavailable": "One of these sources was archived or is no longer on YouTube. Take it off the list.",
} as const;

export type SourceErrorCode = keyof typeof SOURCE_ERROR_TEXT;
