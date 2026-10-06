import { DeskError } from "@/lib/errors";

/** The rule 4 check is Aksh's own (D16): the server refuses a company file without the tick, and records nothing. */
export class HandCheckRequiredError extends DeskError {
  readonly code = "HAND_CHECK_REQUIRED";
  constructor() {
    super("Tick the rule 4 check before running the gate on a file that names a company.");
    this.name = "HandCheckRequiredError";
  }
}

export class FileStructureError extends DeskError {
  readonly code = "FILE_STRUCTURE";
  constructor() {
    super("The file's view, tests and facts do not line up yet. The checklist names what is missing.");
    this.name = "FileStructureError";
  }
}
