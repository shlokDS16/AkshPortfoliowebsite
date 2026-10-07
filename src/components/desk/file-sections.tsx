import type { FileView } from "@/modules/showcase";
import { BlockHeader } from "./block-header";
import { Disclosure } from "./disclosure";
import { Exhibit } from "./exhibit";
import { FactTable } from "./fact-table";
import { KillCriteriaTable } from "./kill-criteria-table";
import { RevisionDiff } from "./revision-diff";
import { RevisionLog } from "./revision-log";
import { ScenarioTable } from "./scenario-table";
import { SourceList } from "./source-list";
import { ViewBlock } from "./view-block";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** design-dna 13.2 TESTS sub; numbers at the start of a sentence are words (13.1). */
export function testsSub(n: number): string {
  return `${n < WORDS.length ? WORDS[n] : n} ${n === 1 ? "test" : "tests"} Aksh set himself. "Met" means his view is wrong.`;
}

/** B+ labelled blocks in fixed order (spec s6): VIEW, TESTS, FACTS (+ exhibits), SCENARIO, SOURCES, HISTORY, Disclosure. */
export function FileSections({ file }: { file: FileView }) {
  return (
    <div id="file-body" className="space-y-(--section-gap) pt-(--block-gap)">
      <section aria-labelledby="view">
        <BlockHeader label="VIEW" id="view" title="Aksh's view" sub="His own words. Each figure opens the line it came from." />
        <ViewBlock blocks={file.view} />
      </section>
      <section aria-labelledby="tests">
        <BlockHeader label="TESTS" id="tests" title="I would be wrong if" sub={testsSub(file.tests.length)} />
        <KillCriteriaTable tests={file.tests} />
      </section>
      <section aria-labelledby="facts">
        <BlockHeader label="FACTS" id="facts" title="Source facts" sub="Taken from filings. Each row names its source and date." count={file.factCount} />
        <div className="space-y-(--block-gap)">
          {file.exhibits.map((x) => (
            <Exhibit key={x.n} data={x} />
          ))}
          <FactTable groups={file.factGroups} />
        </div>
      </section>
      {file.scenario ? (
        <section aria-labelledby="scenario">
          <BlockHeader label="SCENARIO" id="scenario" title="Scenarios" sub="Operating outputs under stated inputs, frozen with this revision." />
          <ScenarioTable data={file.scenario} />
        </section>
      ) : null}
      <section aria-labelledby="sources">
        <BlockHeader label="SOURCES" id="sources" title="Sources" />
        <SourceList sources={file.sources} />
      </section>
      <section aria-labelledby="history">
        <BlockHeader label="HISTORY" id="history" title="Revisions" sub="Reason first, then what was removed and what was added." />
        <div className="space-y-(--block-gap)">
          <RevisionDiff data={file.diff} />
          <RevisionLog revisions={file.log} />
        </div>
      </section>
      <Disclosure holdsPosition={file.holdsPosition} reviewedOn={file.reviewedOn} />
    </div>
  );
}
