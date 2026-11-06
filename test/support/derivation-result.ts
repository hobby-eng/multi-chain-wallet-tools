import { field, type DerivationResult } from "@ckd/core/types.js";
import { AccountDescriptorFixture } from "./account-descriptor-fixture.js";

/** Fresh synthetic result graphs for ownership tests, without cryptographic computation. */
export class DerivationResultFixture {
  /** Poison one native graph getter after admission; the exception carries no real material. */
  static refuseGroupsRead(result: DerivationResult): void {
    const row = result.rows[0];
    if (row === undefined) throw new Error("The synthetic result needs one row.");
    Object.defineProperty(row, "groups", {
      get: () => {
        throw new Error("Synthetic private getter detail");
      },
    });
  }

  /** Native property-write failures precede private owners, without replacing application modules. */
  static refusePublicWrite(result: DerivationResult, mode: "readonly" | "throwing-setter"): void {
    const publicField = field("fixturePublic", "Synthetic public field", "synthetic public value");
    if (mode === "readonly") Object.defineProperty(publicField, "value", { writable: false });
    else
      Object.defineProperty(publicField, "value", {
        get: () => "synthetic public value",
        set: () => {
          throw new Error("Synthetic native setter detail.");
        },
      });
    result.basicSummary.unshift(publicField);
  }

  /** Private labels cover summaries, rows, groups, descriptors and privacy-sensitive watch-only text. */
  static create(): DerivationResult {
    const secret = () => field("privateKey", "Private key", "synthetic private\r\n\ud800", true);
    return {
      id: "synthetic",
      title: "Synthetic result",
      networkLabel: "mainnet",
      pathTemplate: "m/i",
      basicSummary: [secret()],
      summary: [secret()],
      notices: [],
      watchOnly: {
        label: "Synthetic watch-only",
        description: "Synthetic wallet graph",
        text: "synthetic privacy-sensitive export",
        fileName: "synthetic.txt",
        mimeType: "text/plain",
        privacySensitive: true,
      },
      accountDescriptors: AccountDescriptorFixture.create(),
      rows: [
        {
          index: 0,
          path: "m/0",
          title: "Synthetic row",
          basic: [field("address", "Address", "synthetic public address"), secret()],
          advanced: [secret()],
          groups: [
            { key: "group", title: "Synthetic group", basic: [secret()], advanced: [secret()] },
          ],
        },
      ],
    };
  }
}
