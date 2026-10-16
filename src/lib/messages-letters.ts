// The desk's fixed words for the letters (Phase 5c Task 12), spread into messages.ts so they travel as codes in the redirect, never as free
// text. A refusal text that comes from the database (migration 0025) is the same sentence here, keyed by code; modules/distribution/letters
// maps the database's sentence to its code. Every sentence is pending Shlok's approval (the task report lists them).

export const LETTER_ERROR_TEXT = {
  "letters-off": "Email is not set up yet. Letters still publish to the archive.", // = LETTERS_OFF_LINE (lib/providers/letters.ts; a test keeps them equal)
  "letter-not-found": "This letter could not be found.",
  "letter-nothing-ticked": "Tick at least one change to make a letter.",
  "letter-entry-stale": "One of the ticked changes is no longer new. Reload the list and try again.",
  "letter-subject-length": "The subject must be 1 to 120 characters.",
  "letter-objective-length": "The one sentence must be at most 300 characters.",
  "letter-note-length": "The note must be at most 4,000 characters.",
  "letter-read-required": "Tick that you have read the preview first.",
  "letter-no-readers": "There are no confirmed readers yet, so there is nobody to send this to.",
  "letter-subject-label": "The subject is still a label. Replace it with your own subject, save, and run the gate again.",
  // The database's own refusals of a send (approve_letter_send, migration 0025), one code each.
  "letter-not-a-letter": "This is not a letter.",
  "letter-not-current": "Approve the letter's current public revision.",
  "letter-not-public": "The letter is not public.",
  "letter-gate-stale": "The letter's last gate decision is not a pass under the current policy. Publish it again.",
  "letter-already-sent": "This letter has already been sent to subscribers, or its send is waiting.",
  "letter-another-sending": "Another letter is being sent. Wait until it has gone.",
  "letter-test-limit": "5 test copies sent today. The next can go tomorrow.",
  "letter-refused": "The database would not approve this send. Publish the letter again, then try once more.",
  "letter-cannot-cancel": "Only a send that is still waiting can be cancelled.",
  "letter-send-not-found": "This send could not be found.",
} as const;

export const LETTER_NOTICE_TEXT = {
  "letter-made": "Letter made. Write the subject and the one sentence, then run the publishing gate.",
  "letter-saved": "Letter saved. Run the publishing gate to put it on the archive.",
  "letter-unchanged": "Nothing changed: the letter already says that.",
  "send-approved": "Approved. The letter goes out within 15 minutes.",
  "test-copy-approved": "Approved. The test copy goes to you within 15 minutes.",
  "send-cancelled": "Cancelled. Nothing was sent.",
  "confirmations-sent": "Confirmation emails sent.",
  "confirmations-partial": "Some confirmation emails could not be sent. Those readers are waiting again.",
  "confirmations-capped": "50 confirmation emails sent today. The rest can go tomorrow.",
  "confirmations-none": "There is no one waiting to be sent a confirmation email.",
  "requests-binned": "Binned.",
  "reader-erased": "Erased.",
  "signup-opened": "Sign-ups open.",
  "signup-closed": "Sign-ups closed.",
} as const;

export type LetterErrorCode = keyof typeof LETTER_ERROR_TEXT;
export type LetterNoticeCode = keyof typeof LETTER_NOTICE_TEXT;
