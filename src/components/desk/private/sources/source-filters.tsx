import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AttachableCompany, AttachableConcept } from "@/modules/catalog";

type Props = {
  companies: readonly AttachableCompany[];
  concepts: readonly AttachableConcept[];
  selected: { company?: string; concept?: string; onPublic?: boolean; archived?: boolean };
};

const select = "block min-h-11 w-full rounded-sm border border-input bg-paper px-2 text-body text-ink";

/** Company, concept, "on a public file" and archived: a GET form, so a filtered list is a plain address (the concept page links to it). */
export function SourceFilters({ companies, concepts, selected }: Props) {
  const filtered = Boolean(selected.company || selected.concept || selected.onPublic || selected.archived);
  return (
    <form method="get" action="/desk/sources" aria-label="Filter the sources" className="grid gap-3 desk:grid-cols-[1fr_1fr_auto_auto] desk:items-end">
      <div className="space-y-1">
        <Label htmlFor="filter-company">Company</Label>
        <select id="filter-company" name="company" defaultValue={selected.company ?? ""} className={select}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.symbol ? `${c.name} · ${c.symbol}` : c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-concept">Concept</Label>
        <select id="filter-concept" name="concept" defaultValue={selected.concept ?? ""} className={select}>
          <option value="">All concepts</option>
          {concepts.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-x-5">
        <label className="inline-flex min-h-11 items-center gap-2 text-small text-ink">
          <input type="checkbox" name="public" value="1" defaultChecked={selected.onPublic} className="size-[18px] accent-ink" />
          On a public file
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-small text-ink">
          <input type="checkbox" name="archived" value="1" defaultChecked={selected.archived} className="size-[18px] accent-ink" />
          Include archived
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline">
          Show
        </Button>
        {filtered ? (
          <Link href="/desk/sources" className="inline-flex min-h-11 items-center text-small text-ink underline decoration-1 underline-offset-3">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
