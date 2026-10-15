import { formatDate } from "@/lib/format";
import type { ISODate } from "@/lib/desk-types";

type Props = { address: string; revNo: number; revisedOn: ISODate; figuresTo: ISODate | null };

/**
 * Publishing rule 11.4, spec s5: the first thing on a printed public page. Hidden on screen (the dateline says the same); a note passes
 * no figures-to date. The revision line comes from the page's own view model, so a copy printed later still says which version it is.
 * Text is the site name, the page's address, two dates and a fixed sentence: no id, no figure.
 */
export function PrintMasthead({ address, revNo, revisedOn, figuresTo }: Props) {
  return (
    <div data-print-masthead className="mb-4 hidden border-b-2 border-ink pb-3 print:block">
      <p className="font-mono text-mono-tag uppercase text-ink">Aksh Agrawal · Case files</p>
      <p className="mt-1 font-mono text-mono-inline break-all text-ink-muted">{address}</p>
      <p className="mt-2 text-small text-ink-body">
        This copy shows revision R{revNo} of {formatDate(revisedOn)}. {figuresTo ? `Figures to ${formatDate(figuresTo)}. ` : ""}The current version is at the address above.
      </p>
    </div>
  );
}
