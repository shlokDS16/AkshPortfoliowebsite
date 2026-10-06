import type { RegisterFile } from "@/lib/view-types";

export type RegisterSort = "revised" | "fileNo" | "company";

export function filterFiles(files: RegisterFile[], q: string): RegisterFile[] {
  const term = q.trim().toLowerCase();
  if (!term) return files;
  return files.filter((f) => [f.company, f.symbol ?? "", f.sector ?? ""].some((v) => v.toLowerCase().includes(term)));
}

/** Last revision first by default; never by any performance measure (rule 2). */
export function sortFiles(files: RegisterFile[], sort: RegisterSort): RegisterFile[] {
  const byNo = (a: RegisterFile, b: RegisterFile) => Number(a.fileNo) - Number(b.fileNo);
  const copy = [...files];
  if (sort === "revised") return copy.sort((a, b) => b.revisedOn.localeCompare(a.revisedOn) || byNo(a, b));
  if (sort === "company") return copy.sort((a, b) => a.company.localeCompare(b.company, "en-IN"));
  return copy.sort(byNo);
}
