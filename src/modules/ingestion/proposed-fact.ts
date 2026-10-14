import { z } from "zod";
import { PERIOD_RE } from "@/modules/casefile/client";
import { MAX_PAGE_NO } from "@/modules/documents/client";

// The shape of a proposal's value (browser-safe: the review screen validates Aksh's edits with it). Two schemas for
// two jobs (ruling R22): `machineFactSchema` records what the machine read, honestly null where the page did not say;
// `proposedFactSchema` is what an edit or a staged row must satisfy before it can become a fact.

export const FLAGS = ["value_not_on_page", "quote_not_on_page", "prior_not_on_page", "period_unknown", "unit_unknown"] as const;
export type Flag = (typeof FLAGS)[number];

const PAGE_KINDS = ["pl", "bs", "cf", "notes", "segment", "mdna", "other"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().finite();

const common = {
  label: z.string().trim().min(1).max(80),
  value: num,
  valueText: z.string().trim().min(1).max(60),
  page: z.number().int().min(1).max(MAX_PAGE_NO),
  locator: z.string().trim().min(1).max(40),
  quote: z.string().trim().max(600),
  basis: z.enum(["consolidated", "standalone"]).nullable(),
  topic: z.string().trim().min(1).max(40),
  statement: z.enum(PAGE_KINDS),
};

/** What the machine read: the period, date and unit are null when the page headings did not give one. */
export const machineFactSchema = z.strictObject({
  ...common,
  unit: z.string().trim().max(12).nullable(),
  period: z.string().regex(PERIOD_RE).nullable(),
  asOf: isoDate.nullable(),
  prior: z.strictObject({ label: z.string().regex(PERIOD_RE).nullable(), value: num, valueText: z.string().trim().min(1).max(60) }).nullable(),
});
export type MachineFact = z.infer<typeof machineFactSchema>;

/** A fact fit to file: every field present (an edit fills the ones the page left null). */
export const proposedFactSchema = z.strictObject({
  ...common,
  unit: z.string().trim().min(1).max(12),
  period: z.string().regex(PERIOD_RE),
  asOf: isoDate,
  prior: z.strictObject({ label: z.string().regex(PERIOD_RE), value: num, valueText: z.string().trim().min(1).max(60) }).nullable(),
});
export type ProposedFact = z.infer<typeof proposedFactSchema>;
