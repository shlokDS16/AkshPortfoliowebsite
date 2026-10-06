"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { CountFlow } from "@/components/ui/count-flow";
import { Input } from "@/components/ui/input";
import { EASE_SNAP, MOTION } from "@/components/ui/motion-tokens";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TD, TH } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { RegisterFile } from "@/lib/view-types";
import { AsOf } from "./as-of";
import { EmptyState } from "./empty-state";
import { FileTitleTransition } from "./file-title-transition";
import { IdMark } from "./id-mark";
import { filterFiles, sortFiles, type RegisterSort } from "./register-sort";
import { TestsInline } from "./tests-inline";

const SORTS = [
  { value: "revised", label: "Last revised" },
  { value: "fileNo", label: "No." },
  { value: "company", label: "Company" },
];

/** One row per public file (segment 2 A). Rows slide on sort/search (FLIP, 220 ms); digits never change mid-move. */
export function RegisterTable({ files, searchable = true }: { files: RegisterFile[]; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<RegisterSort>("revised");
  const rows = useMemo(() => sortFiles(filterFiles(files, q), sort), [files, q, sort]);
  const hold = { minHeight: `${Math.max(files.length, 1) * 3.25 + 2.5}rem` } as CSSProperties;
  return (
    <section aria-labelledby="files-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="files-heading" className="text-title text-ink desk:text-title-desk">
            Files <CountFlow value={rows.length} className="tabular-nums text-ink-muted" />
          </h2>
          <p className="text-small text-ink-muted">Sorted by last revision. Every company link opens its file.</p>
        </div>
        {searchable ? (
          <label htmlFor="find" className="flex flex-col text-small text-ink-muted">
            Find a file
            <Input id="find" type="search" value={q} onChange={(e) => setQ(e.target.value)} className="mt-1 w-56" />
          </label>
        ) : null}
      </div>
      <div className="mt-3">
        <SegmentedControl size="sm" aria-label="Sort files" value={sort} onValueChange={(v) => setSort(v as RegisterSort)} items={SORTS} />
      </div>
      <div data-register style={hold} className="mt-3">
        {files.length === 0 ? (
          <EmptyState body="No files yet. Each company file will be listed here with its version, last revision and figures-to date." shape={["No.", "Company", "Sector", "Version", "Revised", "Tests", "Figures to"]} />
        ) : (
          <Table className="max-desk:block">
            <thead className="max-desk:sr-only">
              <tr>
                <TH>No.</TH>
                <TH>Company</TH>
                <TH>Sector</TH>
                <TH>Version</TH>
                <TH>Revised</TH>
                <TH>Tests</TH>
                <TH>Figures to</TH>
              </tr>
            </thead>
            <tbody className="max-desk:block">
              {rows.map((f) => (
                <m.tr
                  key={f.fileNo}
                  layout="position"
                  transition={{ duration: MOTION.slow, ease: EASE_SNAP }}
                  className="border-b border-rule max-desk:grid max-desk:grid-cols-[3rem_minmax(0,1fr)] max-desk:py-2"
                >
                  <TD className="max-desk:row-span-5 max-desk:p-0">
                    <IdMark kind="file" value={f.fileNo} />
                  </TD>
                  <TD className="max-desk:p-0">
                    <FileTitleTransition fileNo={f.fileNo}>
                      <Link href={f.href} className="font-semibold">
                        {f.company}
                      </Link>
                    </FileTitleTransition>
                    {f.symbol ? <span className="ml-1.5 font-mono text-mono-id text-ink-muted">{f.symbol}</span> : null}
                  </TD>
                  <TD className="text-ink-muted max-desk:p-0">{f.sector ?? "—"}</TD>
                  <TD className="max-desk:hidden">
                    <IdMark kind="revision" value={`R${f.revNo}`} />
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums max-desk:p-0 max-desk:text-small">
                    <span className="desk:hidden">R{f.revNo} · </span>
                    {formatDate(f.revisedOn)}
                  </TD>
                  <TD className="max-desk:p-0 max-desk:pt-1">
                    <TestsInline counts={f.tests} />
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums text-ink-muted max-desk:p-0 max-desk:text-small">
                    <span className="max-desk:hidden">{formatDate(f.dataAsOf)}</span>
                    <span className="desk:hidden">
                      <AsOf date={f.dataAsOf} />
                    </span>
                  </TD>
                </m.tr>
              ))}
            </tbody>
          </Table>
        )}
        {files.length > 0 && rows.length === 0 ? (
          <p role="status" className="py-6 text-small text-ink-muted">
            No file matches &quot;{q}&quot;. Search covers company names, symbols and sectors.
          </p>
        ) : null}
      </div>
    </section>
  );
}
