import type { StepHandler, StepKind } from "../types";

// Step handlers take every repo through ctx.deps.repos (ruling R7) and never import a Supabase client
// (ingestion.graph.test.ts). Tasks 6 and 12 replace these placeholders.
const notBuilt: StepHandler = async () => ({ kind: "attention", error: "This kind of step is not built yet." });

export const HANDLERS: Record<StepKind, StepHandler> = {
  pdf_text: notBuilt,
  select_pages: notBuilt,
  extract_page: notBuilt,
};
