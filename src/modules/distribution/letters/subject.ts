import { formatDate } from "@/lib/format";

// A new letter's subject (the item title) cannot be empty, so it starts as a label with the day it was made. It is not a subject: the desk
// marks it as a label, keeps Send off until he replaces it, and the approval refuses it. Pure; nothing here writes.

const LABEL = /^\s*Untitled letter(?:, .*)?\s*$/;

/** "Untitled letter, 16 Oct 2026". */
export const placeholderSubject = (today: string): string => `Untitled letter, ${formatDate(today)}`;

/** True while the subject is still the label the desk gave, whatever the date after it. */
export const isPlaceholderSubject = (title: string): boolean => LABEL.test(title);
