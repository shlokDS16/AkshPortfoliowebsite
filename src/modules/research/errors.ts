import { dbError } from "@/lib/supabase/errors";

/** Base class: every subclass message is plain English and safe to show on a desk screen. */
export abstract class ResearchError extends Error {
  abstract readonly code: string;
}

export class ItemNotFoundError extends ResearchError {
  readonly code = "ITEM_NOT_FOUND";
  constructor(readonly itemId: string) {
    super("This item could not be found.");
    this.name = "ItemNotFoundError";
  }
}

/** Mirrors the SQL guard (decision D10) so Aksh gets a plain-English message first. */
export class PublicItemLockedError extends ResearchError {
  readonly code = "PUBLIC_ITEM_LOCKED";
  constructor(readonly itemId?: string) {
    super("This item is public. Unpublish it before changing its details.");
    this.name = "PublicItemLockedError";
  }
}

/** A revision is never edited or deleted (SQL append-only trigger, SQLSTATE P0001). */
export class AppendOnlyError extends ResearchError {
  readonly code = "REVISION_APPEND_ONLY";
  constructor() {
    super("Revisions are append-only: an existing revision cannot be changed or deleted. Save a new revision instead.");
    this.name = "AppendOnlyError";
  }
}

/** A database check or link rule rejected the values (SQLSTATE 23514 / 23503). */
export class ItemRuleError extends ResearchError {
  readonly code = "ITEM_RULE";
  constructor() {
    super("The database rejected these values. Check the fields (title, kind, linked company or theme) and try again.");
    this.name = "ItemRuleError";
  }
}

/** A request the server refuses because it does not match anything it recorded (for example a crafted POST). */
export class InvalidInputError extends ResearchError {
  readonly code = "INVALID_INPUT";
  constructor() {
    super("Check the fields and try again.");
    this.name = "InvalidInputError";
  }
}

/** Row-level security or a privilege check refused the call (SQLSTATE 42501 outside the item guard). */
export class AccessDeniedError extends ResearchError {
  readonly code = "ACCESS_DENIED";
  constructor() {
    super("You are not allowed to do that. Sign in again as the admin.");
    this.name = "AccessDeniedError";
  }
}

const FROZEN_COLUMNS_GUARD = "items: a public item changes only through publish_revision()";

/**
 * Turns a Postgres error into a typed error with a plain-English message; anything unknown
 * stays a DbError (whose text is for logs only, never for the UI).
 * The item guard raises 42501 with a message starting "items:"; RLS also uses 42501. Only the
 * frozen-columns message means "this item is public"; P0002 is what publish_revision()/unpublish_item() raise.
 */
export function toResearchError(op: string, error: { message: string; code?: string }, itemId?: string): Error {
  switch (error.code) {
    case "PGRST116":
      return new ItemNotFoundError(itemId ?? "");
    case "42501":
      if (error.message.startsWith(FROZEN_COLUMNS_GUARD)) return new PublicItemLockedError(itemId);
      // The other publish-guard messages ("only publish_revision() can ...") are a rule, not a locked item.
      return error.message.startsWith("items:") ? new ItemRuleError() : new AccessDeniedError();
    case "P0002":
      return new ItemNotFoundError(itemId ?? "");
    case "23514":
    case "23503":
      return new ItemRuleError();
    case "P0001":
      return new AppendOnlyError();
    default:
      return dbError(op, error);
  }
}
