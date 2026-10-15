import { DeskError } from "@/lib/errors";

/** A name can be made public only after it has been screened on the New names tab (and is not archived). */
export class NameNotScreenedError extends DeskError {
  readonly code = "NAME_NOT_SCREENED";
  constructor() {
    super("Screen this name on the New names tab first.");
    this.name = "NameNotScreenedError";
  }
}

/** A public item names this stub, so the catalog guard (0004) freezes it: unpublish that item first (A1.4). */
export class NameOnPublicItemError extends DeskError {
  readonly code = "NAME_ON_PUBLIC_ITEM";
  constructor() {
    super("A public item names this. Unpublish that item before changing what this name is.");
    this.name = "NameOnPublicItemError";
  }
}

/** His description of a concept is capped (2,000 characters); fixed text, shown through a code (lib/messages.ts). */
export class ConceptDescriptionTooLongError extends DeskError {
  readonly code = "CONCEPT_DESCRIPTION_TOO_LONG";
  constructor() {
    super("That is over 2,000 characters. Shorten it.");
    this.name = "ConceptDescriptionTooLongError";
  }
}
