import Link from "next/link";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { UsedInRow } from "@/lib/view-types";
import { EmptyState } from "./empty-state";
import { IdMark } from "./id-mark";

/** End of a learning note: the public files that rely on it (segment 2). */
export function UsedIn({ uses }: { uses: UsedInRow[] }) {
  if (uses.length === 0) {
    return <EmptyState body="Not used in a file yet. Files that rely on this note will be listed here." shape={["File", "Where", "Since"]} />;
  }
  return (
    <Table>
      <THead>
        <tr>
          <TH>File</TH>
          <TH>Where</TH>
          <TH>Since</TH>
        </tr>
      </THead>
      <tbody>
        {uses.map((use) => (
          <TR key={use.href}>
            <TD>
              <IdMark kind="file" value={use.fileNo} /> <Link href={use.href}>{use.company}</Link>
            </TD>
            <TD>{use.where}</TD>
            <TD className="tabular-nums">{formatDate(use.since)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
