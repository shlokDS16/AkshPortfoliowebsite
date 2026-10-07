import type { FileView } from "@/modules/showcase";
import { Dateline } from "./dateline";
import { FileTitleTransition } from "./file-title-transition";
import { FileTag } from "./id-mark";
import { ReadFirst } from "./read-first";

/** D27: the h1 is the company (the register name morphs into it); the item title is the headline; never animated on load. */
export function FileHeader({ file }: { file: FileView }) {
  const meta = [file.symbol, file.sector, file.oneLiner].filter(Boolean).join(" · ");
  return (
    <header className="pt-6">
      <FileTag fileNo={file.fileNo} revNo={file.revNo} />
      <FileTitleTransition fileNo={file.fileNo}>
        <h1 className="mt-3 text-display text-ink desk:text-display-desk">{file.company}</h1>
      </FileTitleTransition>
      {meta ? <p className="mt-1 text-small text-ink-muted desk:text-small-desk">{meta}</p> : null}
      <p className="mt-4 max-w-(--measure) text-subtitle text-ink desk:text-subtitle-desk">{file.title}</p>
      <p className="mt-2 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        <span className="text-label uppercase text-ink-muted">What this teaches </span>
        {file.learningObjective}
      </p>
      <div className="mt-4">
        <Dateline {...file.dateline} />
      </div>
      <div className="mt-3">
        <ReadFirst notes={file.readFirst} />
      </div>
    </header>
  );
}
