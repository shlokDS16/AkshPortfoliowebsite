// Synthetic NSE files for tests: the real header rows (ADR-005 s2, read 2026-10-13), invented symbols and prices.
// Never a real NSE file: the repo is public and NSE forbids redistribution.

export const BHAVCOPY_HEADER = [
  "TradDt", "BizDt", "Sgmt", "Src", "FinInstrmTp", "FinInstrmId", "ISIN", "TckrSymb", "SctySrs", "XpryDt", "FininstrmActlXpryDt",
  "StrkPric", "OptnTp", "FinInstrmNm", "OpnPric", "HghPric", "LwPric", "ClsPric", "LastPric", "PrvsClsgPric", "UndrlygPric",
  "SttlmPric", "OpnIntrst", "ChngInOpnIntrst", "TtlTradgVol", "TtlTrfVal", "TtlNbOfTxsExctd", "SsnId", "NewBrdLotQty", "Rmks",
  "Rsvd1", "Rsvd2", "Rsvd3", "Rsvd4",
] as const;

export const INDEX_HEADER = [
  "Index Name", "Index Date", "Open Index Value", "High Index Value", "Low Index Value", "Closing Index Value", "Points Change",
  "Change(%)", "Volume", "Turnover (Rs. Cr.)", "P/E", "P/B", "Div Yield",
] as const;

export type BhavRow = {
  date?: string;
  symbol: string;
  series?: string;
  isin?: string;
  close?: string;
  name?: string;
  sgmt?: string;
  src?: string;
};

/** A field is quoted when it holds a comma, a quote or a line break, as NSE's exporter would. */
export const quote = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function bhavLine(row: BhavRow, header: readonly string[] = BHAVCOPY_HEADER): string {
  const values: Record<string, string> = {
    TradDt: row.date ?? "2026-10-12",
    BizDt: row.date ?? "2026-10-12",
    Sgmt: row.sgmt ?? "CM",
    Src: row.src ?? "NSE",
    FinInstrmTp: "STK",
    FinInstrmId: "1",
    ISIN: row.isin ?? "INE000A01010",
    TckrSymb: row.symbol,
    SctySrs: row.series ?? "EQ",
    FinInstrmNm: row.name ?? `${row.symbol} LIMITED`,
    OpnPric: "100.00",
    HghPric: "110.00",
    LwPric: "95.00",
    ClsPric: row.close ?? "105.50",
    LastPric: "105.50",
    PrvsClsgPric: "101.00",
    TtlTradgVol: "1000",
    TtlTrfVal: "105500.00",
    TtlNbOfTxsExctd: "10",
    SsnId: "F1",
    NewBrdLotQty: "1",
  };
  return header.map((name) => quote(values[name] ?? "")).join(",");
}

export function bhavCsv(rows: readonly BhavRow[], opts: { header?: readonly string[]; eol?: string } = {}): string {
  const header = opts.header ?? BHAVCOPY_HEADER;
  return [header.join(","), ...rows.map((r) => bhavLine(r, header))].join(opts.eol ?? "\n") + (opts.eol ?? "\n");
}

export function indexCsv(rows: readonly { name: string; date?: string; close?: string }[], opts: { header?: readonly string[] } = {}): string {
  const header = opts.header ?? INDEX_HEADER;
  const lines = rows.map((r) => {
    const values: Record<string, string> = {
      "Index Name": r.name,
      "Index Date": r.date ?? "12-10-2026",
      "Open Index Value": "22000.1",
      "High Index Value": "22100.2",
      "Low Index Value": "21900.3",
      "Closing Index Value": r.close ?? "22050.55",
      "Points Change": "-10.5",
      "Change(%)": "-.05",
      Volume: "1000",
      "Turnover (Rs. Cr.)": "100.00",
      "P/E": "19.12",
      "P/B": "2.75",
      "Div Yield": "1.53",
    };
    return header.map((name) => quote(values[name] ?? "")).join(",");
  });
  return [header.join(","), ...lines].join("\n") + "\n";
}
