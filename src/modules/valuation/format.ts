// Numbers shown the way the workbook shows them, from the cell's own Excel number format (`z`), and edited the way a person types them
// (a percent cell is edited in percent: 11.5 means 11.5%). Browser-safe, no imports. It reads the common formats finance workbooks use
// (digits, decimals, grouping, %, currency and text around the number, a negative section, thousand scaling); anything else shows the
// number plainly rather than guessing. Grouping is the western 1,234,567; the lakh style depends on the reader's Excel settings, not the file.

type Affixes = { prefix: string; suffix: string };
type Spec = Affixes & {
  minInt: number;
  minFrac: number;
  maxFrac: number;
  grouping: boolean;
  /** How many thousands the digits are divided by (trailing commas). */
  scale: number;
  /** How many percent signs: each multiplies by 100. */
  percent: number;
  negative: Affixes | null;
};

/** Splits at ';' outside quotes and brackets. */
function sections(z: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote = false;
  let bracket = false;
  for (let i = 0; i < z.length; i++) {
    const ch = z[i];
    if (ch === "\\" && !quote) {
      current += ch + (z[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"' && !bracket) quote = !quote;
    else if (ch === "[" && !quote) bracket = true;
    else if (ch === "]" && !quote) bracket = false;
    if (ch === ";" && !quote && !bracket) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

type Scan = { literals: { text: string; digitsBefore: boolean }[]; date: boolean; percent: number; unreadable: boolean };

/** Walks one section; returns its digit placeholders and literal text, or flags it as a date, scientific, or unreadable. */
function scanSection(section: string): { scan: Scan; digits: string } {
  const scan: Scan = { literals: [], date: false, percent: 0, unreadable: false };
  let digits = "";
  let inDigits = false;
  let sawDigits = false;
  const literal = (text: string) => scan.literals.push({ text, digitsBefore: sawDigits });
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      if (end < 0) {
        scan.unreadable = true;
        return { scan, digits };
      }
      if (inDigits) inDigits = false;
      literal(section.slice(i + 1, end));
      i = end;
    } else if (ch === "\\") {
      if (inDigits) inDigits = false;
      literal(section[i + 1] ?? "");
      i++;
    } else if (ch === "_" || ch === "*") {
      i++;
    } else if (ch === "[") {
      const end = section.indexOf("]", i + 1);
      if (end < 0) {
        scan.unreadable = true;
        return { scan, digits };
      }
      const inner = section.slice(i + 1, end);
      if (inner.startsWith("$")) literal(inner.slice(1).split("-")[0]);
      else if (/^[hms]+$/i.test(inner)) scan.date = true;
      i = end;
    } else if (ch === "0" || ch === "#" || ch === "?") {
      digits += ch === "?" ? "#" : ch;
      inDigits = true;
      sawDigits = true;
    } else if ((ch === "." || ch === ",") && (inDigits || (ch === "." && /[0#?]/.test(section[i + 1] ?? "")))) {
      digits += ch;
      inDigits = true;
    } else if (ch === "%") {
      scan.percent++;
      inDigits = false;
      literal("%");
    } else if (/[dDyYhHsS]/.test(ch) || (ch.toLowerCase() === "m" && !inDigits)) {
      scan.date = true;
    } else if (ch === "E" || ch === "e") {
      if (/[+-]/.test(section[i + 1] ?? "")) scan.unreadable = true;
      else literal(ch);
    } else if (ch === "@" || ch === "G") {
      if (section.startsWith("General", i)) i += 6;
      else if (ch === "G") literal(ch);
    } else {
      inDigits = false;
      literal(ch);
    }
  }
  return { scan, digits };
}

function affixes(scan: Scan): Affixes {
  return {
    prefix: scan.literals.filter((l) => !l.digitsBefore).map((l) => l.text).join(""),
    suffix: scan.literals.filter((l) => l.digitsBefore).map((l) => l.text).join(""),
  };
}

function parse(z: string): Spec | null {
  const parts = sections(z);
  const { scan, digits } = scanSection(parts[0]);
  if (scan.unreadable || scan.date || digits === "") return null;
  // Commas after the last digit placeholder scale by a thousand each; commas between placeholders group.
  const trailing = /,+$/.exec(digits)?.[0].length ?? 0;
  const [intPart, ...rest] = digits.slice(0, digits.length - trailing).split(".");
  const frac = rest.join("");
  const intDigits = intPart.replace(/,/g, "");
  const fracDigits = frac.replace(/,/g, "");
  let negative: Affixes | null = null;
  if (parts.length > 1) {
    const second = scanSection(parts[1]);
    if (!second.scan.unreadable && !second.scan.date && second.digits !== "") negative = affixes(second.scan);
  }
  return {
    ...affixes(scan),
    minInt: (intDigits.match(/0/g) ?? []).length,
    minFrac: (fracDigits.match(/0/g) ?? []).length,
    maxFrac: fracDigits.length,
    grouping: /,/.test(intPart),
    scale: trailing,
    percent: scan.percent,
    negative,
  };
}

const plainFormat = new Intl.NumberFormat("en-US", { useGrouping: false, maximumSignificantDigits: 10 });

/** A number as plain text: up to 10 significant digits, never an exponent. */
function plain(value: number): string {
  return Number.isFinite(value) ? plainFormat.format(value) : "";
}

export function isPercentFormat(z: string | null): boolean {
  if (!z) return false;
  const { scan, digits } = scanSection(sections(z)[0]);
  return !scan.unreadable && !scan.date && digits !== "" && scan.percent > 0;
}

/** A date or time format (d, m, y, h, s tokens outside quotes, or [h] elapsed time). */
export function isDateFormat(z: string | null): boolean {
  if (!z || z === "General") return false;
  const { scan } = scanSection(sections(z)[0]);
  return scan.date;
}

/** The value as the workbook's format shows it; plain when there is no format or it is not one this module reads. */
export function formatNumber(value: number, z: string | null): string {
  if (!Number.isFinite(value)) return "";
  const spec = z && z !== "General" ? parse(z) : null;
  if (!spec) return plain(value);
  const scaled = (Math.abs(value) * 100 ** spec.percent) / 1000 ** spec.scale;
  const digits = new Intl.NumberFormat("en-US", {
    minimumIntegerDigits: Math.max(1, spec.minInt),
    minimumFractionDigits: spec.minFrac,
    maximumFractionDigits: spec.maxFrac,
    useGrouping: spec.grouping,
  }).format(scaled);
  const negative = value < 0 && /[1-9]/.test(digits);
  if (negative && spec.negative) return `${spec.negative.prefix}${digits}${spec.negative.suffix}`;
  return `${negative ? "-" : ""}${spec.prefix}${digits}${spec.suffix}`;
}

const clean = (n: number): number => Number(n.toPrecision(12));

/** The text to put in an edit box: a percent cell is edited in percent (0.115 shows as 11.5). */
export function toEditText(value: number, z: string | null): string {
  return String(isPercentFormat(z) ? clean(value * 100) : Number(value.toPrecision(15)));
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Reads what was typed into an edit box back into the cell's value; null when it is not a number. */
export function fromEditText(text: string, z: string | null): number | null {
  let t = text.trim().replace(/[,\s₹$€£]/g, "");
  let negative = false;
  const parens = /^\((.*)\)$/.exec(t);
  if (parens) {
    t = parens[1];
    negative = true;
  }
  const percentSign = t.endsWith("%");
  if (percentSign) t = t.slice(0, -1);
  if (!NUMBER.test(t)) return null;
  let n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (negative) n = -n;
  return isPercentFormat(z) || percentSign ? clean(n / 100) : n;
}
