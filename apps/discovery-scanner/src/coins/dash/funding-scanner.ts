import { familyScan } from "./transparent-family-scanner.js";

export const scanDashProviderCollateral = familyScan((config) => {
  return {
    id: "providerCollateral",
    title: "Dash provider collateral/holdings",
    familyLabel: "Provider collateral/holdings",
    description:
      "Scans the masternode collateral holding P2PKH path m/9'/coin_type'/3'/0'/i (DashSync \"provider funds\", dashj MASTERNODE_HOLDINGS), which receives the 1000 DASH ProRegTx collateral output only for masternodes registered through DashSync-based software. Provider owner/voting/operator/platform-node auth keys are credentials and are not balance paths.",
    proofLabel: "provider collateral/holdings P2PKH scan",
    branches: [
      {
        key: "holdings",
        label: "Provider holdings",
        count: config.providerCollateralCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/3'/0'`,
      },
    ].filter(({ count }) => count > 0),
  };
});
