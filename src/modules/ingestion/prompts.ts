import { z } from "zod";
import type { PageKind } from "@/modules/documents/client";

// The extraction prompt and the shape the model must answer in (spec s6.4, ADR-004 s4.4). Bump PROMPT_VERSION with any
// wording or schema change: the cache key includes it, so old answers are never reused for a new prompt.

export const PROMPT_VERSION = "extract-v1";

const PAGE_KINDS = ["pl", "bs", "cf", "notes", "segment", "mdna", "other"] as const satisfies readonly PageKind[];

/** No length limits here: Groq's strict mode does not document them, and a long line is still a true copy (Task 9 note). */
export const extractionSchema = z.strictObject({
  page_kind: z.enum(PAGE_KINDS),
  basis: z.enum(["consolidated", "standalone", "unknown"]),
  unit_header: z.string().nullable(),
  current_header: z.string().nullable(),
  prior_header: z.string().nullable(),
  rows: z.array(
    z.strictObject({
      label: z.string(),
      current_text: z.string(),
      prior_text: z.string().nullable(),
      line: z.string(),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const SYSTEM_PROMPT = [
  "You read one page of an Indian listed company's annual report or results. Copy; never compute.",
  "Return every line item that has a printed number for the latest period on this page.",
  "label: the line item's words as printed, without numbering such as (a) or ii.",
  "current_text and prior_text: the numbers exactly as printed, with commas, brackets and decimals; prior_text is null when there is no prior column.",
  "line: the full printed line the numbers sit on, character for character.",
  'current_header and prior_header: the column headings exactly as printed, for example "Year ended March 31, 2026".',
  'unit_header: the unit line exactly as printed, for example "(Rs. in crore)", or null.',
  "basis: consolidated or standalone when the page says so, else unknown.",
  "Never add a line that is not on the page. Never calculate totals, ratios or growth. A page with no figures returns an empty rows list.",
].join("\n");

export const userPrompt = (pageNo: number, text: string): string => `Page ${pageNo}:\n"""\n${text}\n"""`;

/** The system prompt for a schema retry: the model is shown what was wrong with its last answer (ADR-004 s4.5). */
export const retryPrompt = (issues: string): string => `${SYSTEM_PROMPT}\nYour previous answer was rejected: ${issues}. Follow the schema exactly.`;
