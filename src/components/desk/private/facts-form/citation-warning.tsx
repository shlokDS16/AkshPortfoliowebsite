type Props = { fresh: string[]; old: string[]; confirming: boolean };

const list = (ids: string[]) => ids.map((id) => `[${id}]`).join(", ");
const verb = (ids: string[]) => (ids.length === 1 ? "is" : "are");

/** Rule 4: body citations with no fact. Newly broken ones hold the save for a second press; old ones only warn. */
export function CitationWarning({ fresh, old, confirming }: Props) {
  if (fresh.length === 0 && old.length === 0) return null;
  return (
    <div role="alert" className="space-y-1 rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
      {fresh.length > 0 ? (
        <p>
          The body cites {list(fresh)}, which {verb(fresh)} no longer in the facts. Those citations will break. Add the fact back or change the body.
          {confirming ? " Press Save revision again to save anyway." : ""}
        </p>
      ) : null}
      {old.length > 0 ? (
        <p>
          The body already cited {list(old)} before this edit, and {verb(old)} not in the facts. Saving is allowed; fix it when you can.
        </p>
      ) : null}
    </div>
  );
}
