const TEXT_FORMATS = ["csv", "json"] as const;
const FILE_FORMATS = [...TEXT_FORMATS, "xlsx"] as const;

/** Text formats supported by public Activity and Discovery reports. */
export type PublicTextReportFormat = (typeof TEXT_FORMATS)[number];
/** Public Activity file formats, including its locally generated workbook. */
export type PublicReportFileFormat = (typeof FILE_FORMATS)[number];

/** Refuses unsupported choices without echoing supplied text or reading report data. */
export class PublicReportFormatError extends Error {
  readonly code = "export.report.format";
  constructor() {
    super("Choose a supported public report format.");
    this.name = "PublicReportFormatError";
  }
}

/** One format rule for native controls and public report API boundaries. */
export class PublicReportFormat {
  /** Admits CSV or JSON; missing values never select a default format. */
  static text(value: unknown): PublicTextReportFormat {
    return PublicReportFormat.#admit(value, TEXT_FORMATS);
  }

  /** Admits CSV, JSON or XLSX before serialization or file naming. */
  static file(value: unknown): PublicReportFileFormat {
    return PublicReportFormat.#admit(value, FILE_FORMATS);
  }

  static #admit<T extends string>(value: unknown, formats: readonly T[]): T {
    const format = formats.find((candidate) => candidate === value);
    if (format === undefined) throw new PublicReportFormatError();
    return format;
  }
}
