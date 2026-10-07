import { isIsoDate } from "@/modules/casefile";

// Keys that carry a calendar date in the view contracts (src/lib/view-types.ts).
const DATE_KEYS = new Set([
  "on", "asOf", "dataAsOf", "dataTo", "readingAsOf", "lastChecked", "withheldUntil", "yearEnd", "filedOn", "since", "lastEntry",
  "lastRevised", "revisedOn", "reviewedOn", "firstWrittenOn",
]);

/** Rule 2 helper: every date-bearing field anywhere in a view model, with its path. Null values are fine (no date). */
export function dateFields(model: unknown, path = "$"): { path: string; value: string }[] {
  if (Array.isArray(model)) return model.flatMap((v, i) => dateFields(v, `${path}[${i}]`));
  if (model && typeof model === "object") {
    return Object.entries(model).flatMap(([k, v]) =>
      DATE_KEYS.has(k) && typeof v === "string" ? [{ path: `${path}.${k}`, value: v }] : dateFields(v, `${path}.${k}`),
    );
  }
  return [];
}

export const badDates = (model: unknown) => dateFields(model).filter((d) => !isIsoDate(d.value));
export const countDates = (model: unknown) => dateFields(model).length;
