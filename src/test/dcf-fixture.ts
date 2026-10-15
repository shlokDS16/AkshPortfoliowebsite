import { buildXlsx, type CellSpec } from "./xlsx-builder";

// A tiny DCF the valuation tests share: an NPV, an XNPV, INDEX/MATCH, INDIRECT, a function the engine lacks, a loop, an error.
export const dcfCells: CellSpec[] = [
  { addr: "A1", v: "Cost of equity" }, { addr: "B1", v: 0.115, fmt: "0.0%" },
  { addr: "A2", v: "Cash flows" }, { addr: "B2", v: -100 }, { addr: "C2", v: 30 }, { addr: "D2", v: 50 }, { addr: "E2", v: 80 },
  { addr: "B3", f: "NPV(B1,C2:E2)+B2", v: 24.8357127 },
  { addr: "B4", f: "XNPV(B1,B2:D2,B7:D7)", v: 0 },
  { addr: "B6", f: "INDEX(C2:E2,MATCH(50,C2:E2,0))", v: 50 },
  { addr: "B7", v: 45000 }, { addr: "C7", v: 45365 }, { addr: "D7", v: 45730 },
  { addr: "B8", f: 'INDIRECT("B1")', v: 0.115 },
  { addr: "B9", f: 'CUBEVALUE("x")', v: 1 },
  { addr: "B10", f: "B11+1", v: 1 }, { addr: "B11", f: "B10+1", v: 1 },
  { addr: "B12", f: "1/0", v: "#DIV/0!", t: "e" },
  { addr: "B13", f: 'IF(B1>0.1,"high","low")', v: "high" },
  { addr: "B14", f: "B1>0.1", v: true },
  { addr: "B15", f: 'A1&" x"', v: "Cost of equity x" },
];

export const dcfBook = () => buildXlsx({ sheets: [{ name: "DCF", cells: dcfCells }] });
