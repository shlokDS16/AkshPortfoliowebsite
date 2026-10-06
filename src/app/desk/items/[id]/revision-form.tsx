import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Revision } from "@/modules/research";
import { addRevisionAction } from "@/modules/research/actions";

type Props = { itemId: string; latest: Revision | null; isPublic: boolean };

export function RevisionForm({ itemId, latest, isPublic }: Props) {
  return (
    <form key={latest?.id ?? "none"} action={addRevisionAction.bind(null, itemId)} className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">New revision</h2>
      {isPublic ? (
        <p className="text-sm text-muted-foreground">
          This item is public. A new revision is stored at once but stays hidden until it passes the publishing gate.
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="bodyMd">Body (Markdown)</Label>
        <Textarea id="bodyMd" name="bodyMd" defaultValue={latest?.bodyMd ?? ""} rows={12} className="font-mono text-sm" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="changeReason">Change reason</Label>
        <Input id="changeReason" name="changeReason" placeholder="What changed and why" />
      </div>
      <Button type="submit" size="sm">
        Save revision
      </Button>
    </form>
  );
}
