import type { StepHandler, StepKind } from "../types";
import { extractPage } from "./extract-page";
import { ocrPage } from "./ocr-page";
import { pdfText } from "./pdf-text";
import { selectPagesStep } from "./select-pages";

// Step handlers take every repo through ctx.deps.repos (ruling R7) and never import a Supabase client or touch the
// client the drain holds (ingestion.graph.test.ts).

export const HANDLERS: Record<StepKind, StepHandler> = {
  pdf_text: pdfText,
  select_pages: selectPagesStep,
  extract_page: extractPage,
  ocr_page: ocrPage,
};
