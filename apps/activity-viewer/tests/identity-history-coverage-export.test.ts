import { describe, expect, it } from "vitest";
import { queryPlatformIdentityHistory } from "@ckd/dash-network/platform-identity-history.js";
import { PlatformIdentityHistoryFixture } from "../../../test/support/platform-identity-history-fixture.js";
import { ActivityViewerFixture } from "../../../test/support/activity-viewer-fixture.js";
import {
  createViewerExport,
  createViewerWorkbookExport,
  type ViewerSingleExportState,
} from "../src/export.js";
import { csvRecords, workbookRecords } from "./export-test-support.js";

async function stateWithWarnings(
  kind: "unknown-total" | "display-limit",
): Promise<Extract<ViewerSingleExportState, { mode: "identity" }>> {
  const fixture = new PlatformIdentityHistoryFixture();
  if (kind === "unknown-total") fixture.tokenTotal = null;
  else {
    fixture.info.totalDocuments = 2;
    fixture.collections.set("documents", [{ identifier: "doc-one" }, { identifier: "doc-two" }]);
  }
  const history = await queryPlatformIdentityHistory(
    fixture.identifier,
    "mainnet",
    1,
    undefined,
    fixture.fetch,
  );
  expect(history.historyWarnings).toHaveLength(1);
  return {
    mode: "identity",
    network: "mainnet",
    snapshot: {
      kind: "identity",
      network: "mainnet",
      inputKind: "identity-id",
      inputLabel: "Base58 Identity ID",
      publicKeyHashHex: null,
      resolvedDpnsName: null,
      resolvedDpnsDocumentId: null,
      resolvedRegistrationTransactionHash: null,
      requests: 1,
      identities: [
        {
          identifier: fixture.identifier,
          identifierHex: "00".repeat(31) + "01",
          balanceCredits: 50n,
          revision: 1n,
          nonce: null,
          dpnsNames: [],
          publicKeys: [],
        },
      ],
      proofs: [],
    },
    histories: [{ identifier: fixture.identifier, history, error: null }],
  };
}

const generatedAt = new Date("2026-09-01T00:00:00.000Z");

describe("Identity export qualifications", () => {
  it("retains qualifications and a failed neighbor in a mixed batch", async () => {
    const state = await stateWithWarnings("unknown-total");
    const warning = state.histories[0]!.history!.historyWarnings![0]!;
    const batch = {
      batch: true as const,
      mode: "mixed" as const,
      network: "mainnet" as const,
      items: [{ id: "query-1", label: "1 · IDENTITY · synthetic", state }],
      errors: [
        {
          id: "query-2",
          label: "2 · CORE · invalid input",
          message: "Lookup failed.",
          mode: "core" as const,
        },
      ],
    };
    const json = createViewerExport(batch, "json", generatedAt).text;
    expect(JSON.parse(json)).toMatchObject({
      data: {
        batch: { succeeded: 1, failed: 1 },
        results: [{ data: { identities: [{ history: { historyWarnings: [warning] } }] } }],
        errors: [{ message: "Lookup failed." }],
      },
    });
    const csv = csvRecords(createViewerExport(batch, "csv", generatedAt).text);
    expect(csv.find((row) => row.record_type === "identity")!.metadata).toContain(warning);
    expect(csv.find((row) => row.record_type === "error")!.status).toBe("failed");
    const workbook = await createViewerWorkbookExport(batch, generatedAt);
    expect((await workbookRecords(workbook.blob, 1))[0]!.history_warnings).toContain(warning);
    expect(
      (await workbookRecords(workbook.blob, 2)).find((row) => row.record_type === "identity")!
        .metadata,
    ).toContain(warning);
    expect((await workbookRecords(workbook.blob, 3))[0]!.status).toBe("failed");
  });

  for (const kind of ["unknown-total", "display-limit"] as const) {
    it(`shows the ${kind} qualification beside proof state in the real view`, async () => {
      const state = await stateWithWarnings(kind);
      const fixture = new ActivityViewerFixture();
      fixture.view.renderIdentity(state.snapshot, state.histories);
      expect(fixture.page.querySelector("#viewer-completeness")!.text).toContain(
        state.histories[0]!.history!.historyWarnings![0],
      );
      expect(
        fixture.page
          .querySelector("#viewer-completeness")!
          .classList.contains("viewer-completeness-warning"),
      ).toBe(true);
    });
    it(`retains the ${kind} qualification in JSON`, async () => {
      const state = await stateWithWarnings(kind);
      expect(JSON.parse(createViewerExport(state, "json", generatedAt).text)).toMatchObject({
        data: {
          identities: [
            {
              state: { balanceCredits: "50" },
              history: {
                historyWarnings: state.histories[0]!.history!.historyWarnings,
                historyCoverage: "limited-or-unverified",
              },
            },
          ],
        },
      });
    });
    it(`retains the ${kind} qualification in CSV`, async () => {
      const state = await stateWithWarnings(kind);
      const row = csvRecords(createViewerExport(state, "csv", generatedAt).text).find(
        (item) => item.record_type === "identity",
      )!;
      expect(row.status).toBe("verified");
      expect(row.amount_atomic).toBe("50");
      expect(row.metadata).toContain("history_coverage=limited-or-unverified");
      expect(row.metadata).toContain(state.histories[0]!.history!.historyWarnings![0]);
    });
    it(`retains the ${kind} qualification in XLSX summary and detail without changing proof balance`, async () => {
      const state = await stateWithWarnings(kind);
      const workbook = await createViewerWorkbookExport(state, generatedAt);
      const summary = (await workbookRecords(workbook.blob, 1))[0]!;
      const row = (await workbookRecords(workbook.blob, 2)).find(
        (item) => item.record_type === "identity",
      )!;
      expect(summary.status).toBe("verified");
      expect(summary.balance_atomic).toBe("50");
      expect(summary.history_coverage).toBe("limited-or-unverified");
      expect(summary.history_warnings).toContain(state.histories[0]!.history!.historyWarnings![0]);
      expect(row.metadata).toContain("history_coverage=limited-or-unverified");
      expect(row.metadata).toContain(state.histories[0]!.history!.historyWarnings![0]);
    });
  }
});
