# ADR-001 addendum (2026-10-14): no GPL code; IronCalc replaces HyperFormula

Status: ACCEPTED (Shlok answered Q37 with option (b) on 2026-10-14). Supersedes ADR-001 s3 line 20 ("HyperFormula (GPLv3)
is acceptable because the repo stays open source") and the word "HyperFormula" in s4's `valuation` module line. ADR-001
itself is not edited. Applies to: `docs/specs/2026-10-14-valuation-2.7-design.md` (revision 2) and its plan.

## 1. Problem
ADR-001 accepted HyperFormula under GPLv3 on the premise that the repo stays open source. The repo is public with no
licence, and Shlok has decided it stays unlicensed and may become private. GPL code would then be a licence breach; a paid
HyperFormula licence is also ruled out. 2.7 still needs an engine that recalculates an Excel model.

## 2. Current state
No engine is installed. Rule for every dependency from now on: **permissive licences only (MIT, Apache-2.0, BSD, ISC);
no GPL, LGPL, AGPL or source-available licences**, runtime or build.

## 3. Options considered (each verified 2026-10-14 on the npm registry, GitHub and a local run)
| Option | Licence | Latest | Maintenance | Reads .xlsx | Engine | Verdict |
|---|---|---|---|---|---|---|
| **IronCalc** (`@ironcalc/nodejs` 0.8.3, native N-API, Linux x64 glibc binary 10.8 MB; `@ironcalc/wasm` 0.8.4, 1.97 MB wasm, about 668 KB gzipped) | MIT / Apache-2.0 dual (repo `LICENSE-MIT`, `LICENSE-Apache-2.0`) | 0.8.x, July-Aug 2026 | active (pushed 2026-10-14, 4.2k stars, not archived) | yes, Node binding `Model.fromXlsx(path)`; the wasm build does not | full engine: dependency graph, `evaluate()`, `#CIRC!`, `#N/IMPL` for unimplemented functions; locally NPV, IRR, XNPV, XIRR, PMT, INDEX/MATCH, OFFSET, INDIRECT, XLOOKUP, SUMPRODUCT, IFERROR, LET all computed; `toBytes()` from Node 0.8.3 loaded by wasm 0.8.4 `Model.from_bytes` | **Chosen** |
| fast-formula-parser 1.0.19 + our own dependency graph | MIT | 1.0.19 | dormant (last publish 2023-10-12) | no | evaluates one formula with reference callbacks; we would own the graph, ordering, cycles and recalculation | Rejected: we would be writing and maintaining a calc engine on a dormant parser |
| @formulajs/formulajs 4.6.1 | MIT | 4.6.1 | active (2026-07-28) | no | function library only: no parser, references or graph | Rejected as an engine (would need the option above around it) |
| hot-formula-parser 4.0.0 | MIT | 4.0.0 | dormant (2022-06-18) | no | per-formula, no graph | Rejected |
| HyperFormula 3.5.0 | GPL-3.0-only or commercial | - | active | no | full engine | Ruled out by Shlok (Q37 b) |
| IronCalc on the server only (no wasm in the browser) | as chosen | - | - | - | every input change is a server round trip (estimated, not measured: well under a second warm, seconds on a cold start) | Rejected for daily use; kept as the fallback if the wasm cannot load (spec D22) |

## 4. Decision
IronCalc: the Node binding reads and evaluates the workbook in the `xlsx_read` job; the wasm build recalculates scenarios in
Aksh's browser, on the model page only. SheetJS CE 0.20.3 (Apache-2.0) stays, as the independent reader of Excel's saved
values and formula text, so the mismatch report compares two readers rather than IronCalc with itself.

## 5. Tradeoffs
- The wasm is larger than HyperFormula (about 668 KB against 205 KB gzipped); it loads on one private route only.
- The wasm build has no raw-value getter in 0.8.4; the desk reads results through a full-precision number format on the
  result cells (15 significant digits; verified locally). Display uses Excel's own format, recorded separately.
- Two IronCalc packages at different patch versions (Node 0.8.3 is the newest Node build; wasm 0.8.3 ships without a file it
  imports, so 0.8.4 is used). A test pins that bytes from one load in the other.
- A native addon in a Vercel Function: `serverExternalPackages` and file tracing must be right, or the step fails on deploy.

## 6. Risks
- IronCalc is pre-1.0: its byte format and API may change between minors. Mitigation: exact pins, the round-trip test, the
  engine versions recorded on every model version.
- A Rust panic inside the addon may end the function: the lease expires twice and the step goes to `needs_attention`,
  the designed degradation.
- Function gaps show up as `#N/IMPL`; the mismatch report names the cell and the result cannot be chosen.

## 7. Future evolution
When `@ironcalc/wasm` gains `getCellValue`, drop the number-format readback. When a release of both packages carries the same
version, align the pins. If the repo is ever licensed, nothing here changes.
