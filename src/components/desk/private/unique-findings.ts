type Finding = { rule: string; message: string; field?: string | null; sentence?: string | null; match?: string | null };

/**
 * A concept that is also the item's theme (items.theme_id, the legacy first link) is linted under both `themeName` and
 * `conceptName`, so one flagged name arrives as two identical findings. Both read "Linked concept name" on screen; this keeps the
 * first of any findings that say the same thing in the same place. Order is kept; nothing is re-worded.
 */
export function uniqueFindings<T extends Finding>(findings: readonly T[]): T[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const field = f.field === "themeName" ? "conceptName" : (f.field ?? "");
    const key = JSON.stringify([f.rule, f.message, field, f.sentence ?? "", f.match ?? ""]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
