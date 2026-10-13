// The two NSE address templates (ADR-005 s2, checked 2026-10-13). The host is fixed in code: a template may change the PATH
// only, so a stray or hostile environment value can never point the daily job at another host. The date placeholder is the
// only variable part, and it is filled from a validated calendar date, never from free text.

export const NSE_HOST = "nsearchives.nseindia.com";

export const BHAVCOPY_PLACEHOLDER = "{YYYYMMDD}";
export const INDEX_PLACEHOLDER = "{DDMMYYYY}";
export type NsePlaceholder = typeof BHAVCOPY_PLACEHOLDER | typeof INDEX_PLACEHOLDER;

export const DEFAULT_NSE_BHAVCOPY_TEMPLATE = `https://${NSE_HOST}/content/cm/BhavCopy_NSE_CM_0_0_0_${BHAVCOPY_PLACEHOLDER}_F_0000.csv.zip`;
export const DEFAULT_NSE_INDEX_TEMPLATE = `https://${NSE_HOST}/content/indices/ind_close_all_${INDEX_PLACEHOLDER}.csv`;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The reason a template is not acceptable, or null. The value itself is never echoed. */
export function nseTemplateProblem(template: string, placeholder: NsePlaceholder): string | null {
  if (!template.startsWith(`https://${NSE_HOST}/`)) return `must start with https://${NSE_HOST}/`;
  if (template.split(placeholder).length !== 2) return `must contain ${placeholder} exactly once`;
  // Everything that could move the request elsewhere or hide a second address: userinfo, a query, a fragment, escapes,
  // a backslash, white space, a parent-directory step.
  if (/[\s@?#%\\]/.test(template) || template.includes("..")) return "may change the path only (no query, fragment, escape or user info)";
  let url: URL;
  try {
    url = new URL(template.replace(placeholder, "20260101"));
  } catch {
    return "is not a web address";
  }
  if (url.protocol !== "https:" || url.hostname !== NSE_HOST || url.port !== "" || url.username !== "" || url.password !== "") {
    return `must be https on ${NSE_HOST}`;
  }
  return null;
}

/** The address for one date. Throws on anything that is not a real calendar date (YYYY-MM-DD). */
export function fillNseTemplate(template: string, placeholder: NsePlaceholder, tradeDate: string): string {
  const m = ISO.exec(tradeDate);
  const probe = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !probe || probe.toISOString().slice(0, 10) !== tradeDate) throw new RangeError("not a calendar date");
  return template.replace(placeholder, placeholder === BHAVCOPY_PLACEHOLDER ? `${m[1]}${m[2]}${m[3]}` : `${m[3]}${m[2]}${m[1]}`);
}
