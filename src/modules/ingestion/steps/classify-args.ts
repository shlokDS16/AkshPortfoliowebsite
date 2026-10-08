import { z } from "zod";
import { DOUBTFUL_MAX_PAGES, type PageVerdict } from "@/modules/documents";
import { PAGE_KINDS } from "../prompts";
import type { NewStep } from "../types";

// What a classify_pages step carries (ruling R2): its job_steps row is keyed by the first page of its batch, so one batch is
// one step; `pages` is every page still to sort (this batch first) and `accepted` the verdicts kept so far. Only the machine
// writes these, and a step still parses them before it trusts them.

const verdictSchema = z.object({
  pageNo: z.number().int().positive(),
  kind: z.enum(PAGE_KINDS),
  basis: z.enum(["consolidated", "standalone"]).nullable(),
  score: z.number(),
});

export const classifyArgsSchema = z.object({
  pages: z.array(z.number().int().positive()).min(1).max(DOUBTFUL_MAX_PAGES),
  accepted: z.array(verdictSchema).max(DOUBTFUL_MAX_PAGES),
});

export type ClassifyArgs = z.infer<typeof classifyArgsSchema>;

/** The step select_pages queues for the pages the rules could not place; later batches are queued by the batches before them. */
export const firstClassifyStep = (doubtful: number[]): NewStep => ({
  kind: "classify_pages",
  pageNo: doubtful[0],
  args: { pages: doubtful, accepted: [] } satisfies ClassifyArgs,
});

export const nextClassifyStep = (rest: number[], accepted: PageVerdict[]): NewStep => ({
  kind: "classify_pages",
  pageNo: rest[0],
  args: { pages: rest, accepted } satisfies ClassifyArgs,
});
