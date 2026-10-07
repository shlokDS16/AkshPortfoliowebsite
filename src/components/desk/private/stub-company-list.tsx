import type { NameToScreen } from "@/modules/catalog";
import { decideNameAction } from "@/modules/catalog/actions";
import { EmptyState } from "../empty-state";
import { NameCard } from "./name-card";

/** The private "New names" screener (design-dna s17 item 17): stubs from unknown $SYM and #theme captures. */
export function StubCompanyList({ names }: { names: NameToScreen[] }) {
  if (names.length === 0) {
    return <EmptyState body="No new names. Unknown $symbols and #themes from your captures appear here." shape={[]} />;
  }
  return (
    <div className="grid gap-3 desk:grid-cols-2">
      {names.map((n) => (
        <NameCard key={n.id} name={n} action={decideNameAction.bind(null, n.id, n.type)} />
      ))}
    </div>
  );
}
