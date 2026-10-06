import { DeskError } from "@/lib/errors";

/** A name can be made public only after it has been screened on the New names tab (and is not archived). */
export class NameNotScreenedError extends DeskError {
  readonly code = "NAME_NOT_SCREENED";
  constructor() {
    super("Screen this name on the New names tab first.");
    this.name = "NameNotScreenedError";
  }
}
