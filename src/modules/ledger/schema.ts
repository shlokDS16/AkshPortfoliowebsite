import { z } from "zod";
import {
  BODY_MAX, CLOSE_REASONS, EXPECTS, HORIZON_MAX_DAYS, HORIZON_MIN_DAYS, MISTAKE_TAGS, PROCESS_CALLS,
} from "./constants";
import { LEDGER_ERROR_TEXT } from "./errors";

// Every message below is one of the ledger's fixed texts, so `errorCode()` turns a refusal into a desk code.
const BAD = LEDGER_ERROR_TEXT["ledger-bad-input"];
const HORIZON = LEDGER_ERROR_TEXT["ledger-bad-horizon"];
const WORDS = LEDGER_ERROR_TEXT["ledger-words-required"];
const TOO_LONG = LEDGER_ERROR_TEXT["ledger-body-too-long"];

export { BODY_MAX };

/** At least one character that is not whitespace (SQL `private.words_ok`: ASCII space, no-break space, zero-width space, BOM). */
const HAS_WORDS = /[^\s ​﻿]/;
/** The database counts characters, not UTF-16 units: ten thousand emoji are allowed. */
const withinLimit = (s: string) => s.length <= BODY_MAX || [...s].length <= BODY_MAX;

/** His words, exactly as typed. Never trimmed or altered: what he typed is what is sealed. */
const words = z
  .string({ error: BAD })
  .refine((s) => HAS_WORDS.test(s), { error: WORDS })
  .refine(withinLimit, { error: TOO_LONG });

const horizonDays = z.number({ error: HORIZON }).int(HORIZON).min(HORIZON_MIN_DAYS, HORIZON).max(HORIZON_MAX_DAYS, HORIZON);
const id = z.guid({ error: BAD });
const strict = <T extends z.core.$ZodShape>(shape: T) => z.strictObject(shape, { error: BAD });

export const openIdeaInput = strict({
  companyId: id,
  expects: z.enum(EXPECTS,{ error: BAD }),
  horizonDays,
  held: z.boolean({ error: BAD }),
  bodyMd: words,
  itemId: id.nullable().default(null),
});
export type OpenIdeaInput = z.output<typeof openIdeaInput>;

const tags = z
  .array(z.enum(MISTAKE_TAGS, { error: BAD }), { error: BAD })
  .min(1, BAD)
  .max(MISTAKE_TAGS.length, BAD)
  .refine((list) => new Set(list).size === list.length, { error: BAD });

/** One shape per kind, mirroring `private.validate_idea_stance`. `open` is not here: only openIdea() writes it. */
export const eventInput = z.discriminatedUnion(
  "kind",
  [
    strict({ kind: z.literal("note"), bodyMd: words }),
    strict({ kind: z.literal("revise"), bodyMd: words, horizonDays: horizonDays.optional() }),
    strict({ kind: z.literal("upsize"), bodyMd: words }),
    strict({ kind: z.literal("downsize"), bodyMd: words, held: z.boolean({ error: BAD }) }),
    strict({ kind: z.literal("close"), bodyMd: words, reason: z.enum(CLOSE_REASONS, { error: BAD }) }),
    strict({ kind: z.literal("review"), bodyMd: words, process: z.enum(PROCESS_CALLS, { error: BAD }), tags }),
    strict({ kind: z.literal("void"), bodyMd: words }),
  ],
  { error: BAD },
);
export type EventInput = z.output<typeof eventInput>;

/** The `stance` the database expects for this event: his choices only, never a price, a date or a return. */
export function toStance(input: EventInput): Record<string, unknown> {
  switch (input.kind) {
    case "revise":
      return input.horizonDays === undefined ? {} : { horizon_days: input.horizonDays };
    case "downsize":
      return { held: input.held };
    case "close":
      return { reason: input.reason };
    case "review":
      return { process: input.process, tags: input.tags };
    default:
      return {};
  }
}

export function isLedgerId(value: unknown): value is string {
  return typeof value === "string" && id.safeParse(value).success;
}
