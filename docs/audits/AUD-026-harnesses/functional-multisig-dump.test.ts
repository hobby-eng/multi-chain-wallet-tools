// AUD-026 functional: dumps the PSBT Inspector's ranged multisig wallet (buildRangedWallet) for
// public cosigner keys, including the Deriver's own Dash cosigner exports from
// functional-derivation-dump.test.ts, so that functional-multisig-oracle.py recomputes descriptors,
// checksums, redeem scripts and addresses independently. Output:
// docs/audits/AUD-026-evidence/functional/multisig.json (local evidence only).
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { buildRangedWallet } from "../../../apps/psbt-inspector/src/multisig-wallet.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);
const ABANDON = `${"abandon ".repeat(11)}about`;
const TREZOR = { private: 0x04358394, public: 0x043587cf };

function cosigner(path: string, testnet = false): string {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(ABANDON), testnet ? TREZOR : undefined);
  const node = root.derive(path);
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  return `[${fp}${path.slice(1).replaceAll("'", "h")}]${node.publicExtendedKey}`;
}

it("dumps ranged multisig wallets", () => {
  const derived = JSON.parse(readFileSync(new URL("derivations.json", OUT), "utf8"));
  const dashCases = derived[0].cases.filter(
    (c: { id: string; shape: { network: string; account: number; branch: number } }) =>
      c.id.startsWith("dash-multisig") && c.shape.network === "mainnet" && c.shape.account === 0,
  );
  const purpose48 = dashCases.find((c: { id: string }) => c.id === "dash-multisig-p2sh");
  const corePkh = dashCases.find((c: { id: string }) => c.id === "dash-multisig-core-pkh");
  const value = (fields: { key: string; value: string }[], key: string) =>
    fields.find((f) => f.key === key)!.value;
  const requests = [
    {
      chain: "bitcoin",
      network: "mainnet",
      required: 2,
      keyOrder: "bip67",
      wrapper: "p2wsh",
      accountXpubs: [0, 1, 2].map((a) => cosigner(`m/48'/0'/${a}'/2'`)),
      branches: [0, 1],
      startIndex: 0,
      endIndex: 2,
    },
    {
      chain: "bitcoin",
      network: "testnet",
      required: 2,
      keyOrder: "supplied",
      wrapper: "p2sh",
      accountXpubs: [3, 1].map((a) => cosigner(`m/48'/1'/${a}'/1'`, true)),
      branches: [0],
      startIndex: 2147483646,
      endIndex: 2147483647,
    },
    {
      // The Deriver's two Dash exports as the Inspector reads them: the Purpose48 origin-tagged
      // xpub and the Core pkh signer's receive descriptor.
      chain: "dash",
      network: "mainnet",
      required: 1,
      keyOrder: "bip67",
      wrapper: "p2sh",
      accountXpubs: [
        value(purpose48.result.basicSummary, "descriptorAccountKey"),
        value(corePkh.result.basicSummary, "receivePkhDescriptor"),
      ],
      branches: [0, 1],
      startIndex: 0,
      endIndex: 1,
    },
  ] as const;
  const dump = requests.map((request) => ({
    request,
    wallet: buildRangedWallet(request as never),
  }));
  for (const { wallet } of dump) expect(wallet.rows.length).toBeGreaterThan(0);
  writeFileSync(
    new URL("multisig.json", OUT),
    JSON.stringify(
      dump.map(({ request, wallet }) => ({
        request,
        descriptors: wallet.descriptors,
        rows: wallet.rows,
        importJson: wallet.importJson,
      })),
      null,
      1,
    ),
  );
});
