// Turns form text into the values the schema (schema.ts) checks. This file only reads the form; every rule is the schema's.
// It never trims and never supplies a default: a field that was not filled in stays `undefined`, so the schema refuses it
// with the ledger's own message instead of a guess being sealed. Pure (a FormData in, a plain object out).

const field = (data: FormData, key: string): string | undefined => {
  const value = data.get(key);
  return typeof value === "string" ? value : undefined;
};

/**
 * His words. A browser sends a textarea's line breaks as CRLF inside a form submission; the textarea itself holds LF. The
 * words are put back as he typed them (CRLF to LF) and are otherwise left alone: no trimming, no other change.
 */
const words = (data: FormData, key: string): string | undefined => field(data, key)?.replace(/\r\n/g, "\n");

/** A whole number of days typed as digits, otherwise NaN (which the schema refuses with the horizon message). */
const days = (raw: string | undefined): number => (raw !== undefined && /^\d{1,5}$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN);

/** The horizon radios: a named choice carries its days; "other" reads the days box. Not chosen: undefined. */
function horizon(data: FormData, key = "horizon"): number | undefined {
  const choice = field(data, key);
  if (choice === undefined || choice === "") return undefined;
  return days(choice === "other" ? field(data, `${key}Other`) : choice);
}

const yesNo = (raw: string | undefined): boolean | undefined => (raw === "yes" ? true : raw === "no" ? false : undefined);

export function openIdeaFromForm(data: FormData): unknown {
  return {
    companyId: field(data, "companyId"),
    expects: field(data, "expects"),
    horizonDays: horizon(data),
    held: yesNo(field(data, "held")),
    bodyMd: words(data, "bodyMd"),
    itemId: field(data, "itemId") || null,
  };
}

/** One shape per kind, the same keys the schema's union expects. A kind the form does not offer yields only `{ kind }`. */
export function eventFromForm(data: FormData): unknown {
  const kind = field(data, "kind");
  const bodyMd = words(data, "bodyMd");
  switch (kind) {
    case "note":
    case "upsize":
    case "void":
      return { kind, bodyMd };
    case "revise": {
      if (field(data, "horizon") === "keep") return { kind, bodyMd };
      const horizonDays = horizon(data);
      return horizonDays === undefined ? { kind, bodyMd } : { kind, bodyMd, horizonDays };
    }
    case "downsize":
      return { kind, bodyMd, held: yesNo(field(data, "held")) };
    case "close":
      return { kind, bodyMd, reason: field(data, "reason") };
    case "review":
      return { kind, bodyMd, process: field(data, "process"), tags: data.getAll("tags").filter((t): t is string => typeof t === "string") };
    default:
      return { kind };
  }
}
