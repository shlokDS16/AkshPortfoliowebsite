import { describe, expect, it } from "vitest";
import { formatNumber, fromEditText, isDateFormat, isPercentFormat, toEditText } from "./format";

describe("formatNumber: from the cell's own Excel format", () => {
  it("shows a percent format as a percentage with its decimals", () => {
    expect(formatNumber(0.115, "0.0%")).toBe("11.5%");
    expect(formatNumber(0.115, "0%")).toBe("12%");
    expect(formatNumber(0.0575, "0.00%")).toBe("5.75%");
    expect(formatNumber(-0.02, "0.0%")).toBe("-2.0%");
  });

  it("decimals and grouping", () => {
    expect(formatNumber(1234567.891, "#,##0.00")).toBe("1,234,567.89");
    expect(formatNumber(1234567.891, "#,##0")).toBe("1,234,568");
    expect(formatNumber(1234.5, "0.0")).toBe("1234.5");
    expect(formatNumber(3, "0.00")).toBe("3.00");
    expect(formatNumber(0.5, "0.##")).toBe("0.5");
    expect(formatNumber(2, "0.##")).toBe("2");
  });

  it("literal text and currency symbols around the digits", () => {
    expect(formatNumber(1500, '"₹"#,##0')).toBe("₹1,500");
    expect(formatNumber(1500, "$#,##0.00")).toBe("$1,500.00");
    expect(formatNumber(12.5, '0.0"x"')).toBe("12.5x");
    expect(formatNumber(1500, "[$₹-4009]#,##0")).toBe("₹1,500");
    expect(formatNumber(1500, '#,##0" Cr"')).toBe("1,500 Cr");
  });

  it("negative numbers: a minus sign, or the format's own second section", () => {
    expect(formatNumber(-1500, "#,##0")).toBe("-1,500");
    expect(formatNumber(-1500, "#,##0;(#,##0)")).toBe("(1,500)");
    expect(formatNumber(-1500, "#,##0;[Red](#,##0)")).toBe("(1,500)");
  });

  it("a trailing comma scales by a thousand", () => {
    expect(formatNumber(2_500_000, "#,##0,")).toBe("2,500");
    expect(formatNumber(2_500_000, "0.0,,")).toBe("2.5");
  });

  it("General, no format and formats it does not read show the number plainly", () => {
    expect(formatNumber(0.115, null)).toBe("0.115");
    expect(formatNumber(1234.5678, "General")).toBe("1234.5678");
    expect(formatNumber(1 / 3, null)).toBe("0.3333333333");
    expect(formatNumber(1.5e-12, "0.00E+00")).toBe("0.0000000000015");
    expect(formatNumber(46309, "dd-mmm-yy")).toBe("46309");
  });

  it("is not thrown by odd input", () => {
    expect(formatNumber(Number.NaN, "0.0")).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY, null)).toBe("");
    expect(formatNumber(5, '"unterminated')).toBe("5");
  });
});

describe("isPercentFormat and isDateFormat", () => {
  it("tell the two apart", () => {
    expect(isPercentFormat("0.0%")).toBe(true);
    expect(isPercentFormat('0.0"%"')).toBe(false);
    expect(isPercentFormat("0.00")).toBe(false);
    expect(isPercentFormat(null)).toBe(false);
    for (const z of ["dd-mmm-yy", "yyyy-mm-dd", "d/m/yyyy", "mmm yyyy", "h:mm AM/PM", "[$-409]d mmmm yyyy;@"]) expect(isDateFormat(z), z).toBe(true);
    for (const z of ["0.0%", "#,##0.00", '"day "0', "General", null, '0.0"d"', "[Red]0.00"]) expect(isDateFormat(z), String(z)).toBe(false);
  });
});

describe("editing: a percent cell is edited in percent", () => {
  it("shows 0.115 with a 0.0% format as 11.5", () => {
    expect(toEditText(0.115, "0.0%")).toBe("11.5");
    expect(toEditText(0.0575, "0.00%")).toBe("5.75");
    expect(toEditText(0.07, "0%")).toBe("7");
  });

  it("shows other cells as the plain number", () => {
    expect(toEditText(1234.5, "#,##0.00")).toBe("1234.5");
    expect(toEditText(0.115, null)).toBe("0.115");
  });

  it("reads 11.5 back as 0.115 without floating-point dust", () => {
    expect(fromEditText("11.5", "0.0%")).toBe(0.115);
    expect(fromEditText("11.5%", "0.0%")).toBe(0.115);
    expect(fromEditText("7", "0%")).toBe(0.07);
    expect(fromEditText("0.07", "0.0%")).toBe(0.0007);
  });

  it("reads other cells as typed, accepting commas and a currency sign", () => {
    expect(fromEditText("1,234.5", "#,##0.00")).toBe(1234.5);
    expect(fromEditText("₹1,50,000", null)).toBe(150000);
    expect(fromEditText("-3.25", "0.00")).toBe(-3.25);
    expect(fromEditText("(5)", "0.00")).toBe(-5);
  });

  it("returns null for text that is not a number", () => {
    for (const text of ["", "  ", "abc", "1.2.3", "1e", "--2", "NaN", "Infinity"]) expect(fromEditText(text, "0.0"), text).toBeNull();
  });

  it("round trips", () => {
    for (const [value, z] of [[0.115, "0.0%"], [0.0525, "0.00%"], [123.456, "0.00"], [-0.3, "0%"]] as const) {
      expect(fromEditText(toEditText(value, z), z)).toBe(value);
    }
  });
});
