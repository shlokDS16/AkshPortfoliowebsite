import { EmptyState } from "@/components/desk/empty-state";

/**
 * The Mistakes page before any case qualifies. It describes what the page lists: the closed cases in which HIS review judged the
 * process flawed or named a kind of mistake. No claim about how a share did, and none of the words the site never uses
 * (final review F4; pending Shlok's approval of this copy).
 */
export function MistakesEmpty() {
  return (
    <EmptyState
      title="Nothing here yet."
      body="Closed cases in which Aksh judged his own process flawed, or named a kind of mistake, are listed here with his own words and a link to the case."
      shape={["Case", "His call", "His words"]}
    />
  );
}
