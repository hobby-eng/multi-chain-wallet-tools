import { assertIndex } from "@ckd/core/bip32.js";
import { familyScan } from "./transparent-family-scanner.js";

export const scanDashLegacyCore = familyScan((config) => {
  assertIndex(config.account, "Account");
  return {
    id: "legacyCore",
    title: "Dash Core · legacy mobile",
    familyLabel: "Legacy mobile Core",
    description:
      "Scans the historical DashSync legacy account root m/account' receive/change chains. Non-HD random keypool wallets still require wallet.dat or exported private keys.",
    proofLabel: "historical DashSync legacy P2PKH scan",
    branches: [
      {
        key: "receive",
        label: "Legacy receive",
        count: config.legacyCoreCount,
        pathPrefix: () => `m/${config.account}'/0`,
      },
      {
        key: "change",
        label: "Legacy change",
        count: config.legacyCoreCount,
        pathPrefix: () => `m/${config.account}'/1`,
      },
    ].filter(({ count }) => count > 0),
  };
});
