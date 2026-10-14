import "server-only";
import { createHash } from "node:crypto";
import { addDays, istDate } from "@/lib/dates";
import { CsvError, parseBhavcopyCsv, parseIndexCsv } from "@/lib/providers/nse-bhavcopy";
import { unzipSingle, ZipError, type ZipErrorCode } from "@/lib/providers/zip-one";
import { jobDbError } from "@/lib/supabase/errors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Db } from "@/lib/supabase/types";
import { CLOSE_LOOKBACK_DAYS, UPLOAD_LIMITS, type UploadRefusal, type UploadResult } from "@/modules/ledger/client";
import { scoreIdeas } from "./ledger-prices";

// The official NSE file Aksh downloaded and dropped on the Closes page, parsed here with the SAME readers the fetch uses
// (single-entry zip reader, strict header, byte and row caps, the trade date inside the file) and stored through the trusted
// door `store_uploaded_closes` (service role only), so the rows are an official upload and never "typed". Job code: it needs the
// secret-key client. The caller (the upload route) has checked the admin first and the sizes before reading; the sizes are checked
// again here, because this function must hold on its own. The file is never written anywhere and never kept: bytes in, rows out.
// A refusal carries a closed code (ledger/upload.ts); no parser message, file value, symbol or stack ever leaves this function.

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const; // "PK\x03\x04": a zip that holds at least one file

export type UploadInput = {
  /** The trading date the owner chose, YYYY-MM-DD. */
  date: string;
  /** The bhavcopy zip, as sent. */
  zip: Uint8Array;
  /** The index CSV, as sent, or null. */
  index: Uint8Array | null;
  /** The admin the route checked; recorded with the upload. */
  adminId: string;
};

export type UploadDeps = {
  db: Db;
  /** The India date today. */
  today: () => string;
};

export function buildUploadDeps(): UploadDeps {
  return { db: createSupabaseServiceClient(), today: () => istDate(new Date()) };
}

const refuse = (code: UploadRefusal, fileDate?: string): UploadResult => (fileDate === undefined ? { ok: false, code } : { ok: false, code, fileDate });

const ZIP_CODES: Record<ZipErrorCode, UploadRefusal> = {
  not_zip: "not_zip",
  truncated: "zip_damaged",
  corrupt: "zip_damaged",
  multi_entry: "zip_many",
  encrypted: "zip_unsupported",
  unsupported: "zip_unsupported",
  too_large: "zip_too_large",
};

const BAD_EQUITY: Record<string, UploadRefusal> = {
  bad_header: "bad_header",
  empty: "empty_file",
  malformed: "bad_row",
  bad_date: "bad_file_date",
  bad_number: "bad_close",
  duplicate: "duplicate",
  missing_index: "bad_header",
  too_large: "too_many_rows",
};

const BAD_INDEX: Record<string, UploadRefusal> = {
  missing_index: "index_no_nifty",
  too_large: "too_many_rows",
};

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const realDate = (value: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

const startsWithZipMagic = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((b, i) => bytes[i] === b);

const decode = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** The database's refusals of `store_uploaded_closes`, by their code only (the message can quote data). */
function storeRefusal(error: { message: string; code?: string }): UploadRefusal {
  const code = error.code === "P0001" ? /^ledger:([a-z_]+)$/.exec(error.message)?.[1] : undefined;
  if (code === "future_date") return "too_early";
  if (code === "day_shut") return "day_shut";
  return "store_failed";
}

/**
 * Reads the two files and stores the tracked closes. Never throws for a bad file: every refusal is a typed result and nothing
 * is stored. A database failure while reading the tracked list or storing is also `store_failed` (job-style error text is logged
 * by shape only). Scoring runs after a successful store; if it cannot, the upload still stands and `scored` is null.
 */
export async function uploadOfficialCloses(deps: UploadDeps, input: UploadInput): Promise<UploadResult> {
  const { db } = deps;
  if (!realDate(input.date)) return refuse("bad_date");
  if (input.date > deps.today()) return refuse("future_date");
  if (input.date < addDays(deps.today(), -CLOSE_LOOKBACK_DAYS)) return refuse("too_old");
  if (input.zip.byteLength === 0) return refuse("missing_zip");
  if (input.zip.byteLength > UPLOAD_LIMITS.zipBytes || (input.index?.byteLength ?? 0) > UPLOAD_LIMITS.indexBytes) return refuse("too_large");
  // Sniffed by content, never by name or declared type: a zip begins with the zip signature, whatever it was called.
  if (!startsWithZipMagic(input.zip)) return refuse("not_zip");

  let equityText: string | null;
  try {
    equityText = decode(unzipSingle(input.zip, UPLOAD_LIMITS.unzippedBytes));
  } catch (error) {
    return refuse(error instanceof ZipError ? ZIP_CODES[error.code] : "zip_damaged");
  }
  if (equityText === null) return refuse("not_text");

  let indexText: string | null = null;
  if (input.index && input.index.byteLength > 0) {
    if (startsWithZipMagic(input.index)) return refuse("index_bad");
    indexText = decode(input.index);
    if (indexText === null) return refuse("index_bad");
  }

  let symbols: string[];
  try {
    const { data, error } = await db.rpc("tracked_symbols");
    if (error) throw jobDbError("ledger.trackedSymbols", error);
    symbols = data ?? [];
  } catch (error) {
    console.error("ledger upload: could not read the tracked companies", error instanceof Error ? error.name : typeof error);
    return refuse("store_failed");
  }

  let equity: ReturnType<typeof parseBhavcopyCsv>;
  try {
    equity = parseBhavcopyCsv(equityText, symbols);
  } catch (error) {
    return refuse(error instanceof CsvError ? (BAD_EQUITY[error.code] ?? "bad_row") : "bad_row");
  }
  if (equity.tradeDate !== input.date) return refuse("wrong_date", equity.tradeDate);

  let indexClose: number | null = null;
  if (indexText !== null) {
    try {
      const index = parseIndexCsv(indexText);
      if (index.tradeDate !== input.date) return refuse("index_wrong_date", index.tradeDate);
      indexClose = index.close;
    } catch (error) {
      return refuse(error instanceof CsvError ? (BAD_INDEX[error.code] ?? "index_bad") : "index_bad");
    }
  }

  // `p_index_close` is null when no index file was dropped; the database reads that as "no Nifty 50 close" (the day is then not
  // opened, and a shut day refuses the upload outright).
  // The record of the upload (who, when, which bytes) is written by the same database call, in the same transaction. The hashes are
  // computed here from the bytes this server received, never taken from the browser.
  const indexSent = input.index && input.index.byteLength > 0 ? input.index : null;
  const stored = await db.rpc("store_uploaded_closes", {
    p_trade_date: input.date,
    p_rows: equity.closes,
    p_index_close: indexClose as number,
    p_admin: input.adminId,
    p_zip_sha256: sha256(input.zip),
    p_zip_bytes: input.zip.byteLength,
    p_index_sha256: (indexSent ? sha256(indexSent) : null) as string,
    p_index_bytes: (indexSent ? indexSent.byteLength : null) as number,
  });
  if (stored.error) {
    const code = storeRefusal(stored.error);
    if (code === "store_failed") console.error("ledger upload: storing failed", stored.error.code ?? "no code");
    return refuse(code);
  }

  let scored: number | null = null;
  try {
    const detail = await scoreIdeas({ db });
    scored = Number(/^scored (\d+) /.exec(detail)?.[1] ?? 0);
  } catch {
    scored = null; // the closes are stored; the next daily run scores them
  }
  // The database answers with what it wrote and what it left as it was; a missing answer counts as nothing stored, never as stored.
  const counts = (Array.isArray(stored.data) ? stored.data[0] : stored.data) as { stored?: unknown; kept?: unknown } | null | undefined;
  const wrote = Number(counts?.stored ?? 0);
  const left = Number(counts?.kept ?? 0);
  return { ok: true, tradeDate: input.date, stored: wrote, kept: left, tracked: symbols.length, indexStored: indexClose !== null, scored };
}
