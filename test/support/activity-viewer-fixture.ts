import { createActivityViewerView } from "../../apps/activity-viewer/src/view.js";
import { CompleteIdPage } from "./complete-id-page.js";

/** Real Activity view and renderers on the shared passive native DOM boundary. */
export class ActivityViewerFixture {
  readonly page = new CompleteIdPage();
  readonly view = createActivityViewerView(this.page.asDocument(), {
    version: "0.1.5",
    releaseDate: "2026-09-01",
    fingerprint: "synthetic",
    checksumFile: "SHA256SUMS",
    profile: "multi-chain",
    edition: "Multi-Chain Edition",
    releaseRepository: "hobby-eng/multi-chain-wallet-tools",
  });
}
