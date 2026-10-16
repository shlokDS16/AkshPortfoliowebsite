import "server-only";
import { serverEnv } from "./env.server";
import { lettersMode } from "./providers/letters-mode";

// What the sign-up page and the desk need to know about the letters settings, as plain answers and nothing else: no key, no segment
// id, no adapter (the public side may import this file, never an adapter; src/modules/showcase/isolation.letters.test.ts). Each
// answer is "no" when the environment cannot be read, so a broken setting turns a feature off and never throws into a page.

const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** The reader-facing contact for questions and complaints (LETTERS_GRIEVANCE_EMAIL), or null when it is unset or not an address. */
export function grievanceContact(read: () => { LETTERS_GRIEVANCE_EMAIL?: string } = serverEnv): string | null {
  try {
    const value = read().LETTERS_GRIEVANCE_EMAIL?.trim();
    return value && value.length <= 254 && ADDRESS.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Whether email is set up (the three settings, or the local fixture). The sign-up form is shown only then (review finding 8). */
export function lettersEmailReady(read: () => Parameters<typeof lettersMode>[0] = serverEnv): boolean {
  try {
    return lettersMode(read()).mode !== "off";
  } catch {
    return false;
  }
}
