import { describe, expect, it } from "vitest";
import { PublicReportFormat, PublicReportFormatError } from "../src/public-report-format.js";

describe("Public report format choices", () => {
  it("preserves CSV and JSON for text reports and admits XLSX only for file reports", () => {
    for (const format of ["csv", "json"] as const) {
      expect(PublicReportFormat.text(format)).toBe(format);
      expect(PublicReportFormat.file(format)).toBe(format);
    }
    expect(PublicReportFormat.file("xlsx")).toBe("xlsx");
    expect(() => PublicReportFormat.text("xlsx")).toThrow(PublicReportFormatError);
  });

  it.each(["YAML", "", null, undefined, false, 1, Symbol("synthetic"), { toString: () => "json" }])(
    "refuses an unknown value %s without coercion or a default",
    (value) => {
      for (const read of [
        () => PublicReportFormat.text(value),
        () => PublicReportFormat.file(value),
      ]) {
        expect(read).toThrow(expect.objectContaining({ code: "export.report.format" }));
      }
    },
  );
});
