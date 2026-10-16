import { DeskError } from "@/lib/errors";
import { LETTER_ERROR_TEXT, type LetterErrorCode } from "@/lib/messages-letters";

export { LETTER_ERROR_TEXT, type LetterErrorCode };

/** A refusal with a fixed code; its message is the fixed text and never carries data (not an address, not a title, not a provider's words). */
export class LetterError extends DeskError {
  readonly code: LetterErrorCode;
  constructor(code: LetterErrorCode) {
    super(LETTER_ERROR_TEXT[code]);
    this.code = code;
    this.name = "LetterError";
  }
}

// The database's own sentences when it refuses a send (approve_letter_send / cancel_letter_send, migrations 0025), as codes. A sentence
// that is not here (an "Entry n changed ..." message carries a number) is the generic refusal.
const REFUSALS: ReadonlyMap<string, LetterErrorCode> = new Map<string, LetterErrorCode>([
  ["This is not a letter.", "letter-not-a-letter"],
  ["Approve the letter's current public revision.", "letter-not-current"],
  ["The letter is not public.", "letter-not-public"],
  ["The letter's last gate decision is not a pass under the current policy. Publish it again.", "letter-gate-stale"],
  ["This letter has already been sent to subscribers, or its send is waiting.", "letter-already-sent"],
  ["A broadcast was already made for this letter. Check it in Resend; to send again, make a new letter.", "letter-broadcast-made"],
  ["Another letter is being sent. Wait until it has gone.", "letter-another-sending"],
  ["5 test copies sent today. The next can go tomorrow.", "letter-test-limit"],
  ["Only a send that is still waiting can be cancelled.", "letter-cannot-cancel"],
  ["This send could not be found.", "letter-send-not-found"],
]);

/** The code for a refusal the database raised with SQLSTATE 55000 (a state refusal). */
export function refusalCode(message: string): LetterErrorCode {
  return REFUSALS.get(message) ?? "letter-refused";
}
