import { z } from "zod";

export const ITEM_KINDS = ["note", "thesis", "learning", "case_study", "process"] as const;
export const VISIBILITIES = ["private", "clients", "public"] as const;
export const ITEM_STATUSES = ["draft", "published", "archived"] as const;
export const HOLDS_POSITIONS = ["yes", "no", "not_disclosed"] as const;
export const REVISION_AUTHORS = ["aksh", "system"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type HoldsPosition = (typeof HOLDS_POSITIONS)[number];
export type RevisionAuthor = (typeof REVISION_AUTHORS)[number];

const structured = z.record(z.string(), z.unknown());
const itemId = z.guid();

/** True when `value` can be an item id; callers treat anything else as "no such item". */
export { isUuid as isItemId } from "@/lib/ids";

export const createItemInput = z.object({
  kind: z.enum(ITEM_KINDS, "Choose a kind"),
  title: z.string().trim().min(1, "Title is required").max(200),
  bodyMd: z.string().max(200_000).default(""),
  companyId: z.guid().nullable().default(null),
  themeId: z.guid().nullable().default(null),
  learningObjective: z.string().trim().min(1).max(300).nullable().default(null),
  structured: structured.default({}),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type CreateItemInput = z.input<typeof createItemInput>;

export const addRevisionInput = z.object({
  itemId,
  bodyMd: z.string().max(200_000),
  structured: structured.default({}),
  changeReason: z.string().trim().max(300).nullable().default(null),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type AddRevisionInput = z.input<typeof addRevisionInput>;

export const appendRevisionInput = z.object({
  itemId,
  appendMd: z.string().trim().min(1, "Nothing to append").max(20_000),
  changeReason: z.string().trim().max(300).nullable().default(null),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type AppendRevisionInput = z.input<typeof appendRevisionInput>;

/**
 * Strict on purpose: the slug is not editable here (controller ruling R5). It is set only
 * inside the SQL publish_revision(), so a patch that names it is an error, not a silent no-op.
 */
export const updateItemMetaInput = z
  .strictObject({
    title: z.string().trim().min(1, "Title is required").max(200),
    kind: z.enum(ITEM_KINDS, "Choose a kind"),
    learningObjective: z.string().trim().min(1).max(300).nullable(),
    dataAsOf: z.iso.date("Use a valid date (YYYY-MM-DD)").nullable(),
    holdsPosition: z.enum(HOLDS_POSITIONS, "Choose yes, no or not disclosed").nullable(),
  })
  .partial();
export type UpdateItemMetaInput = z.input<typeof updateItemMetaInput>;
