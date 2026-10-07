import { DeskError } from "@/lib/errors";

/** The facts sheet has a line the parser refuses; the editor already marks the line, so the redirect carries only a code. */
export class FactsSheetError extends DeskError {
  readonly code = "FACTS_SHEET_INVALID";
  constructor() {
    super("The facts sheet has a problem; the line is marked in the editor.");
    this.name = "FactsSheetError";
  }
}

export class NoFigureDateError extends DeskError {
  readonly code = "NO_FIGURE_DATE";
  constructor() {
    super("This file has no dated figure yet, so there is nothing to set Figures to.");
    this.name = "NoFigureDateError";
  }
}
