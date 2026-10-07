import type { ViewBlockData } from "@/lib/view-types";
import { EmptyState } from "./empty-state";
import { ChipParagraph } from "./source-chip";

/** Aksh's view (spec ThesisBody): reading size, proportional figures, one continuous 2 px ink rule. */
export function ViewBlock({ blocks }: { blocks: ViewBlockData[] }) {
  if (blocks.length === 0) {
    return <EmptyState body="No view written yet. The VIEW block holds Aksh's own words; facts go in FACTS." shape={[]} />;
  }
  return (
    <div className="prose-read border-l-2 border-ink pl-3 text-read text-ink-body desk:pl-4 desk:text-read-desk">
      {blocks.map((block, i) => {
        if (block.kind === "h") {
          return (
            <h3 key={i} className="mt-6 text-subtitle text-ink desk:text-subtitle-desk">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={i} className="my-(--para) list-disc pl-5">
              {block.items.map((item, j) => (
                <li key={j}>
                  <ChipParagraph as="span" inline={item} />
                </li>
              ))}
            </ul>
          );
        }
        return <ChipParagraph key={i} inline={block.inline} />;
      })}
    </div>
  );
}
