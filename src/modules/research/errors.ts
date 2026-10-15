import { DeskError } from "@/lib/errors";

/**
 * A concept change is refused while a newer version of the note waits for the publishing gate: a concept added or removed
 * in that waiting version could otherwise reach the public through a change reason. Fixed text, shown through a code
 * (lib/messages.ts, a test keeps them equal). Pending Shlok's approval.
 */
export class ConceptChangePendingError extends DeskError {
  readonly code = "CONCEPT_CHANGE_PENDING";
  constructor() {
    super("A newer version of this note is waiting to be published. Publish it before changing the concepts.");
    this.name = "ConceptChangePendingError";
  }
}
