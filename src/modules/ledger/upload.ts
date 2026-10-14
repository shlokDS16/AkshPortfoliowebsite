// The shape of the "drop NSE's official file" upload (spec s31): its limits, the closed list of refusals, and the answer the
// route gives the page. Pure and browser-safe. The parsing itself is job code (src/modules/ops/ledger-upload.ts), because it
// uses the market-data readers and the secret-key client, which this module may not name.

/** Every limit of the upload, in bytes unless the name says otherwise. The real files: the zip is about 210 KB, the index about 18 KB. */
export const UPLOAD_LIMITS = {
  /** The whole request (both files and the form around them). Checked from Content-Length before reading and again while reading. */
  bodyBytes: 2_621_440, // 2.5 MB
  /** The zip as sent. */
  zipBytes: 2_097_152, // 2 MB
  /** The index CSV as sent. */
  indexBytes: 524_288, // 512 KB
  /** The one file inside the zip, unzipped (the same cap the fetch uses; the real one is 639 KB). */
  unzippedBytes: 8 * 1024 * 1024,
  /** Rows, fields per row and characters per field are the readers' own (nse-csv.ts): 50,000 / 256 / 4,096. */
  rows: 50_000,
} as const;

/** Each refusal is one of these; the page turns the code into plain words, and nothing from the file or a parser is ever shown. */
export const UPLOAD_REFUSALS = [
  "forbidden",
  "too_large",
  "not_a_form",
  "missing_zip",
  "bad_date",
  "future_date",
  "too_early",
  "too_old",
  "not_zip",
  "zip_damaged",
  "zip_many",
  "zip_unsupported",
  "zip_too_large",
  "not_text",
  "bad_header",
  "empty_file",
  "bad_row",
  "too_many_rows",
  "wrong_date",
  "bad_file_date",
  "bad_close",
  "duplicate",
  "index_bad",
  "index_no_nifty",
  "index_wrong_date",
  "day_shut",
  "store_failed",
] as const;
export type UploadRefusal = (typeof UPLOAD_REFUSALS)[number];

export type UploadResult =
  | {
      ok: true;
      tradeDate: string;
      /** Company closes WRITTEN by this upload. */
      stored: number;
      /** Company closes the file carried that were left as they were, because a close from NSE's fetched file or an earlier upload already stood. */
      kept: number;
      /** Companies the desk tracks (an open idea, or a closed one not yet final on official closes). */
      tracked: number;
      /** Whether the Nifty 50 close was stored (it is what opens the day). */
      indexStored: boolean;
      /** Ideas rescored afterwards, or null when scoring did not run (it will at the next daily run). */
      scored: number | null;
    }
  | { ok: false; code: UploadRefusal; /** The file's own trade date, for `wrong_date` and `index_wrong_date`: a validated YYYY-MM-DD, never raw text. */ fileDate?: string };
