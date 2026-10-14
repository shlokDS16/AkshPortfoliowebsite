// Why a workbook was not read. A code is stored on the version row (`refusal`); the sentence is what Aksh sees, with the Excel fix
// in it (spec s4, s8). Plain words. Nothing from the workbook ever goes into a message: only fixed words and counts.

export const REFUSAL_MESSAGES = {
  not_xlsx: "This file is not an .xlsx workbook. Save it from Excel as .xlsx and upload again.",
  password_or_xls: "This workbook is password-protected or in the old .xls format. Save it as .xlsx without a password and upload again.",
  too_big: "This workbook is larger than 10 MB. Remove sheets or pictures the valuation does not use and upload again.",
  zip_damaged: "This workbook is damaged or built in a way the desk will not read. Open it in Excel, save a copy as .xlsx and upload again.",
  zip_too_large: "This workbook unpacks to far more data than its size suggests. Open it in Excel, save a copy as .xlsx and upload again.",
  too_many_parts: "This workbook has too many internal parts. Remove sheets the valuation does not use and upload again.",
  macros: "This workbook contains macros. Save a copy as .xlsx (not .xlsm) and upload again.",
  external_links: "This workbook links to other workbooks. In Excel: Data > Edit Links > Break Link, then save and upload again.",
  active_x: "This workbook contains ActiveX controls. Delete them in Excel, save and upload again.",
  data_connections: "This workbook has data connections to outside sources. In Excel: Data > Queries & Connections, remove them, save and upload again.",
  date_1904: "This workbook uses the 1904 date system. In Excel: File > Options > Advanced, clear 'Use 1904 date system', save and upload again.",
  too_many_sheets: "This workbook has more than 30 sheets. Remove sheets the valuation does not use and upload again.",
  too_many_rows: "A sheet in this workbook runs past row 20,000. Remove the long data block the valuation does not use and upload again.",
  too_many_cells: "This workbook has more than 100,000 filled cells. Remove data the valuation does not use and upload again.",
  too_many_formulas: "This workbook has more than 20,000 formulas. Remove sheets the valuation does not use and upload again.",
  formula_too_long: "A formula in this workbook is longer than 8,192 characters. Split it into steps and upload again.",
  too_many_names: "This workbook has more than 500 named ranges. Delete the ones that are not used (Formulas > Name Manager) and upload again.",
  external_name: "A named range points outside this workbook. In Excel: Formulas > Name Manager, delete it, save and upload again.",
  model_too_large: "This workbook is too large to keep as a model. Remove sheets the valuation does not use and upload again.",
  too_complex: "The formulas in this workbook reference too many cells at once to be checked. Simplify the biggest ranges and upload again.",
  too_slow: "This workbook is too large to read in one go. Remove sheets the valuation does not use and upload again.",
  engine_failed: "The calculation engine could not open this workbook. Save a copy from Excel as .xlsx and upload again.",
} as const;

export type RefusalCode = keyof typeof REFUSAL_MESSAGES;

/** A hostile or unreadable workbook, refused with a code. The message never contains anything read from the file. */
export class XlsxRefusal extends Error {
  constructor(readonly code: RefusalCode) {
    super(REFUSAL_MESSAGES[code]);
    this.name = "XlsxRefusal";
  }
}

export const refusalMessage = (code: RefusalCode): string => REFUSAL_MESSAGES[code];
