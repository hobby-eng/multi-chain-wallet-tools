import type { PlatformAddressHistorySnapshot } from "@ckd/dash-network/platform-address-history.js";
import type { PlatformAddressSnapshot } from "@ckd/dash-network/platform-address-source.js";
import type { PlatformIdentityHistoryResult } from "@ckd/dash-network/platform-identity-history.js";
import type { PlatformIdentityLookupSnapshot } from "@ckd/dash-network/platform-identity-source.js";
import type { CoreAddressSnapshot } from "@ckd/dash-network/public-address.js";
import type { ActivitySnapshot, ViewerNetwork } from "@ckd/dash-network/types.js";
import type {
  PublicTextReportFormat,
  PublicReportFileFormat,
} from "@ckd/export/public-report-format.js";

/** One normalized public query with the snapshots needed to preserve proof and history semantics. */
export type ViewerSingleExportState =
  | { mode: "core"; network: ViewerNetwork; snapshot: CoreAddressSnapshot }
  | {
      mode: "platform";
      network: ViewerNetwork;
      snapshot: PlatformAddressSnapshot;
      history: PlatformAddressHistorySnapshot;
    }
  | {
      mode: "identity";
      network: ViewerNetwork;
      snapshot: PlatformIdentityLookupSnapshot;
      histories: PlatformIdentityHistoryResult[];
    }
  | { mode: "shielded"; network: ViewerNetwork; snapshot: ActivitySnapshot };

/** Associates one completed query with its batch identity and display label. */
export interface ViewerBatchExportItem {
  id: string;
  label: string;
  state: ViewerSingleExportState;
}

/** An explicit failed query retained alongside successful batch items. */
export interface ViewerBatchExportError {
  id: string;
  label: string;
  message: string;
  mode?: ViewerSingleExportState["mode"];
}

/** Fixed-coin or mixed batch results; failed inputs remain separate from completed queries. */
export interface ViewerBatchExportState {
  batch: true;
  mode: ViewerSingleExportState["mode"] | "mixed";
  network: ViewerNetwork;
  items: ViewerBatchExportItem[];
  errors: ViewerBatchExportError[];
}

/** A single normalized query or a batch with explicit failures. */
export type ViewerExportState = ViewerSingleExportState | ViewerBatchExportState;

/** Text report formats shared by the native controls and public API admission. */
export type ViewerTextExportFormat = PublicTextReportFormat;
/** Public report file formats, including the separately generated workbook. */
export type ViewerExportFormat = PublicReportFileFormat;

/** A local text report whose MIME type and suffix follow its admitted format. */
export interface ViewerExportFile {
  filename: string;
  mimeType: string;
  text: string;
}

/** A locally generated XLSX report; atomic monetary values remain exact strings in its cells. */
export interface ViewerWorkbookExportFile {
  filename: string;
  mimeType: string;
  blob: Blob;
}
