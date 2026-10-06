import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

type Props = { latest: string | null; figuresTo: string | null; action: (formData: FormData) => Promise<void> };

/** Rule 3a made easy: one tap sets Figures to (the Data as of field in Details) to the latest figure date in the saved facts. */
export function FiguresToHint({ latest, figuresTo, action }: Props) {
  if (!latest || (figuresTo && figuresTo >= latest)) return null;
  return (
    <form action={action} className="space-y-2 rounded-sm border border-rule p-3 text-small text-ink-body">
      <p>
        Latest figure in the saved facts: {formatDate(latest)}. Figures to: {figuresTo ? formatDate(figuresTo) : "not set"}. Rule 3 needs Figures to to be that date
        or later; it is the Data as of field under Details.
      </p>
      <Button type="submit" variant="outline" size="sm">
        Set Figures to {formatDate(latest)}
      </Button>
    </form>
  );
}
