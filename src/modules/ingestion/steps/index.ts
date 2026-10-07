import type { StepHandler, StepKind } from "../types";
import { pdfText } from "./pdf-text";
import { selectPagesStep } from "./select-pages";

// Step handlers take every repo through ctx.deps.repos (ruling R7) and never import a Supabase client or touch the
// client the drain holds (ingestion.graph.test.ts). Task 12 replaces the extract_page placeholder.
const notBuilt: StepHandler = async () => ({ kind: "attention", error: "This kind of step is not built yet." });

export const HANDLERS: Record<StepKind, StepHandler> = {
  pdf_text: pdfText,
  select_pages: selectPagesStep,
  extract_page: notBuilt,
};
