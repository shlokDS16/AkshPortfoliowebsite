import type { SourceType } from "@/lib/desk-types";

/** The document pane's "Use as source" -> the Facts form adds (or reuses) a source row. The pane never writes facts itself. */
export const ADD_SOURCE_EVENT = "desk:add-source";
export type AddSourceDetail = { doc: string; type: SourceType; filedOn: string; url: string };
