import type { SourceType } from "@/lib/desk-types";

/** Dispatched cancelable; the Facts form cancels it once the row is there (dispatchEvent then returns false).
 * The document pane's "Use as source" -> the Facts form adds (or reuses) a source row. The pane never writes facts itself. */
export const ADD_SOURCE_EVENT = "desk:add-source";
export type AddSourceDetail = { doc: string; type: SourceType; filedOn: string; url: string };

/**
 * The document pane's "Use as a fact" on a machine-read line the page check confirmed: the Facts form adds a new fact row (and the
 * document's source row, reused when it is listed) with only the quote and the locator filled. Label and value stay empty for
 * Aksh; the machine's claim text is never in the event. Cancelable, like ADD_SOURCE_EVENT.
 */
export const ADD_FACT_EVENT = "desk:add-fact";
export type AddFactDetail = { source: AddSourceDetail; quote: string; locator: string };
