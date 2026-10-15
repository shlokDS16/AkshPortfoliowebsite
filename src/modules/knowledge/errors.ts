import { DeskError } from "@/lib/errors";

/** A concept cannot be linked to itself. Fixed text, shown through a code (lib/messages.ts; a test keeps them equal). Pending Shlok's approval. */
export class ConceptSelfLinkError extends DeskError {
  readonly code = "CONCEPT_SELF_LINK";
  constructor() {
    super("A concept cannot be linked to itself.");
    this.name = "ConceptSelfLinkError";
  }
}

/** The concept is gone, archived, or still waiting on the Names tab where a link needs a checked one. */
export class ConceptNotFoundError extends DeskError {
  readonly code = "CONCEPT_NOT_FOUND";
  constructor() {
    super("This concept could not be found.");
    this.name = "ConceptNotFoundError";
  }
}
