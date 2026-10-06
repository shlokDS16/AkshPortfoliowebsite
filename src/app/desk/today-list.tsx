import Link from "next/link";
import { filingErrorText, type TodayGroup } from "@/modules/capture";

export function TodayList({ groups }: { groups: TodayGroup[] }) {
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">Nothing captured yet today.</p>;
  return (
    <section className="space-y-4" aria-label="Today">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="text-sm font-medium">{group.label}</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {group.entries.map((entry) => (
              <li key={entry.id} className="whitespace-pre-wrap">
                {entry.itemId ? (
                  <Link href={`/desk/items/${entry.itemId}`} className="hover:underline">
                    {entry.rawText}
                  </Link>
                ) : (
                  entry.rawText
                )}
                {entry.parseError ? <span className="ml-2 text-xs text-destructive">({filingErrorText(entry.parseError)})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
