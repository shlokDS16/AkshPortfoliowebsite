import { OCR_CAPS } from "./caps";

// The words about scanned pages (browser-safe: the trays show them). Every line is also in spec s16.7; the lines marked
// there "pending Shlok approval" were worded by the build and not yet read by him.

export const OCR_TOO_BIG = "This scanned page is over the free reader's 1 MB limit. Enter it manually or skip.";
export const OCR_KEY_REFUSED = "The scan reader did not accept the desk's key. Check the OCR.space key in the settings, then try again.";
export const OCR_NOTHING_READ = "Nothing could be read from this scan. Enter the figures yourself, or skip.";
export const OCR_PAGE_REFUSED = "The scan reader could not take this page. Enter it manually or skip.";
export const SCAN_READING_OFF = "Scan reading is off, so this scanned page cannot be read. Enter it manually or skip.";

/** A photo whose file is gone (marked done, or deleted): pending Shlok approval, spec s16.8. */
export const IMAGE_NOT_STORED = "This photo is no longer stored, so it cannot be read. Choose Skip, or Try again.";

/** The sentences a scan step stores for itself; the tray shows them beside the page list. */
export const OCR_ATTENTION_TEXT: readonly string[] = [OCR_TOO_BIG, OCR_KEY_REFUSED, OCR_NOTHING_READ, OCR_PAGE_REFUSED, SCAN_READING_OFF, IMAGE_NOT_STORED];

/** A large scanned document: nothing is read until Aksh ticks pages (pending Shlok approval, spec s7/s16.7). */
export const scansNotice = (scans: number): string =>
  `${scans === 1 ? "1 page is a scan" : `${scans} pages are scans`}. Tick the pages to read; each uses one of today's ${OCR_CAPS.day} scan reads.`;
