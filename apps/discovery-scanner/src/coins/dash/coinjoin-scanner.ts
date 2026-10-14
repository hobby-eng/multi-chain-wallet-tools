import { familyScan } from "./transparent-family-scanner.js";

export const scanDashCoinJoin = familyScan((config) => {
  return {
    id: "coinjoin",
    title: "Dash Mobile CoinJoin · DIP9",
    familyLabel: "Dash Mobile CoinJoin · DIP9",
    description:
      "Scans the released mobile/DashSync DIP9 CoinJoin compatibility chains. Dash Core desktop CoinJoin outputs remain covered by the always-on BIP44 receive/change scan.",
    proofLabel: "DIP9 mobile compatibility P2PKH scan",
    branches: [
      {
        key: "external",
        label: "External mobile/DashSync",
        count: config.coinJoinExternalCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/4'/${config.account}'/0`,
      },
      {
        key: "internal",
        label: "Internal defensive compatibility",
        count: config.coinJoinInternalCount,
        pathPrefix: (coinType: number) => `m/9'/${coinType}'/4'/${config.account}'/1`,
      },
    ].filter(({ count }) => count > 0),
  };
});
