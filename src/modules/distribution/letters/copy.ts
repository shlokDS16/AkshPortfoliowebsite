import { LETTER_KIND_LABEL, LETTER_POSITION_LABEL, LETTER_POSITION_WORD, LETTERS_COPY, LETTERS_NOTICE_VERSION } from "../public";

// Fixed words of the letters (spec s15). Every string here is pending Shlok's approval; the task report lists them. A banned-word test
// reads this file and public.ts (copy.test.ts). Nothing in it is typed by a reader or by Aksh. The words a reader sees on the public pages
// are in ../public.ts (so those pages can import them); the email's own words are here.

export { LETTERS_NOTICE_VERSION };
export const ASK_THANKS = LETTERS_COPY.asked;
export const CONFIRM_DONE = LETTERS_COPY.confirmed;
export const CONFIRM_EXPIRED = LETTERS_COPY.expired;
export const LEAVE_DONE = LETTERS_COPY.left;

/** The placeholder Resend replaces with the reader's own unsubscribe link in a broadcast. */
export const UNSUBSCRIBE_PLACEHOLDER = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export const KIND_LABEL = LETTER_KIND_LABEL;

/** The standard disclosure's first two sentences, then the one the letter adds (spec s8.7). */
export const DISCLOSURE_LINE =
  "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Each page states the position in the company it discusses.";
export const WHY_YOU_GET_THIS = (host: string) => `You get this because you asked on ${host} and confirmed by email.`;
export const UNSUBSCRIBE_LABEL = "Unsubscribe";
export const ARCHIVE_LABEL = "The archive";
export const POSITION_LABEL = LETTER_POSITION_LABEL;
export const POSITION_WORD = LETTER_POSITION_WORD;

export const CONFIRMATION_SUBJECT = "Confirm your letters from Aksh Agrawal";
export const CONFIRMATION_BODY = (host: string, link: string) =>
  `Someone, probably you, asked to get letters from ${host}. To confirm, open: ${link} (valid for 7 days). If you did not ask, ignore this email; nothing else will be sent.`;

/** At most this many confirmation emails go in a day (D93). */
export const CONFIRMATIONS_PER_DAY = 50;
/** letters_request keeps no new request while this many are waiting (migration 0024; copy.test.ts reads the SQL and keeps them equal). */
export const WAITING_CAP = 300;
