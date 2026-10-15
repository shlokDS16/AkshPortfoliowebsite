import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { Item } from "@/modules/research";
import { updateItemMetaAction } from "@/modules/research/actions";

/** `figuresToFromLedger`: a case study from the ledger takes its Figures to from the ledger alone, so the date is shown and not edited. */
export function MetaForm({ item, figuresToFromLedger = false }: { item: Item; figuresToFromLedger?: boolean }) {
  const locked = item.visibility === "public";
  return (
    <form key={item.updatedAt} action={updateItemMetaAction.bind(null, item.id)} className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Details</h2>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          This item is public. Unpublish it to change these details; body changes go through a new revision and the gate.
        </p>
      ) : null}
      <fieldset disabled={locked} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={item.title} required />
        </div>
        <p className="text-sm text-muted-foreground">
          Slug: <span data-testid="slug">{item.slug ?? "set automatically on first publish"}</span>
        </p>
        <div className="space-y-1">
          <Label htmlFor="learningObjective">Learning objective</Label>
          <Textarea id="learningObjective" name="learningObjective" defaultValue={item.learningObjective ?? ""} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="holdsPosition">Holds position</Label>
            <select
              id="holdsPosition"
              name="holdsPosition"
              defaultValue={item.holdsPosition ?? ""}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="">Not set</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="not_disclosed">Not disclosed</option>
            </select>
          </div>
          <div className="space-y-1">
            {figuresToFromLedger ? (
              <>
                <p className="text-small font-medium text-ink">Figures to</p>
                <p className="text-body text-ink">{item.dataAsOf ? formatDate(item.dataAsOf) : "Not set"}</p>
                <p className="text-small text-ink-muted">Set from the ledger. Refresh from the ledger moves it.</p>
              </>
            ) : (
              <>
                <Label htmlFor="dataAsOf">Figures to</Label>
                <Input id="dataAsOf" name="dataAsOf" type="date" defaultValue={item.dataAsOf ?? ""} />
              </>
            )}
          </div>
        </div>
        <Button type="submit" size="sm">
          Save details
        </Button>
      </fieldset>
    </form>
  );
}
