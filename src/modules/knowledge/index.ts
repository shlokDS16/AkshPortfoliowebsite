// Server-side entry: the learning graph's desk read models (concept pages, his links, the month in review). Private (the desk).
// Public code never imports this; the public concept views are built from the cached snapshot in modules/showcase.
import "server-only";

export { ConceptNotFoundError, ConceptSelfLinkError } from "./errors";
export { createSupabaseKnowledgeDeps, createSupabaseKnowledgeRepo } from "./repo";
export { conceptIndex, conceptPage, linkConcepts, monthCounts, monthPage, saveItemConcepts, unlinkConcepts } from "./service";
export type { ConceptIndexRow, ConceptPageView, ConceptSource, KnowledgeDeps, KnowledgeRepo, MonthCounts, MonthView } from "./types";
