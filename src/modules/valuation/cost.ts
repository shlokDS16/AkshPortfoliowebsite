// An upper estimate of how long IronCalc will take over a workbook, made from the reference graph BEFORE the engine runs. The engine's
// evaluate() is one synchronous native call that cannot be interrupted, and the cell caps do not bound it: 20,000 formulas that each sum
// the same 80,000 cells took 96 s, and a whole-column SUMPRODUCT takes 0.4 s by itself. So the read is refused when the estimate is over
// MAX_EVAL_ESTIMATE_MS (limits.ts). The constants below were measured on 2026-10-14 (Node 24, IronCalc 0.8.3, Windows desktop) and are
// deliberately above the measurements; re-measure with scripts/measure/caps.measure.ts before changing them. Pure and browser-safe.
//
// What was measured per formula (a column of 800 filled rows of a 1,048,576-row reference):
//   SUM, SUMIF(S), COUNTIF(S), AVERAGEIF, XLOOKUP, INDEX, NPV, STDEV, VAR, PRODUCT, ...  ~0 ms   (the engine stops at the last filled cell)
//   MAX, MIN, COUNT, AVERAGE, MEDIAN, LARGE, MATCH, VLOOKUP, LOOKUP, AND, OR, ...         10-45 ms (it walks every row of the reference)
//   SUMPRODUCT, MMULT, TRANSPOSE, CORREL, SLOPE, ...                                      50-440 ms, up to 1,400 ms with array arithmetic
// A range inside array arithmetic that sits in another function, such as SUM(IF(A:A>5,B:B,0)), is not recognised and is the residual risk.

export const NS_PER_PRESENT_CELL = 60;
export const NS_PER_DECLARED_SCAN = 50;
export const NS_PER_DECLARED_ARRAY = 650;

/** Functions that build arrays from the whole reference. */
const ARRAY = new Set([
  "SUMPRODUCT", "MMULT", "TRANSPOSE", "MINVERSE", "MDETERM", "FREQUENCY", "CORREL", "SLOPE", "INTERCEPT", "RSQ", "COVAR", "COVARIANCE.S",
  "COVARIANCE.P", "FORECAST", "FORECAST.LINEAR", "LINEST", "SUMX2MY2", "SUMX2PY2", "SUMXMY2", "SORT", "FILTER", "UNIQUE",
]);

/** Functions that walk every row of the reference, filled or not. */
const SCAN = new Set([
  "MAX", "MIN", "COUNT", "COUNTA", "COUNTBLANK", "AVERAGE", "MEDIAN", "LARGE", "SMALL", "RANK", "PERCENTILE", "QUARTILE", "MODE", "GEOMEAN",
  "HARMEAN", "SUBTOTAL", "CONCAT", "AND", "OR", "MATCH", "VLOOKUP", "LOOKUP", "CHOOSE",
]);

export type RangeCost = {
  /** Cells the reference names (a whole column is 1,048,576). */
  declared: number;
  /** Filled cells inside it. */
  present: number;
};

export type FormulaCostInput = {
  functions: string[];
  ranges: RangeCost[];
  /** The cell's references cannot be listed (OFFSET, INDIRECT, ...): it may read anything in the workbook. */
  dynamic: boolean;
  /** Filled cells in the whole workbook. */
  totalCells: number;
};

export function estimateFormulaNs({ functions, ranges, dynamic, totalCells }: FormulaCostInput): number {
  const array = functions.some((f) => ARRAY.has(f));
  const scan = !array && functions.some((f) => SCAN.has(f));
  let ns = dynamic ? totalCells * NS_PER_PRESENT_CELL : 0;
  for (const r of ranges) ns += array ? r.declared * NS_PER_DECLARED_ARRAY : scan ? r.declared * NS_PER_DECLARED_SCAN : r.present * NS_PER_PRESENT_CELL;
  return ns;
}
