// The known answers of the Dash masternode keys for the full self-test. BLS12-381 is the heaviest
// curve the Deriver carries, so it loads only here and when the masternode keys are derived. The
// vectors are dashj's AuthenticationGroupExtensionTest keyTest (the seed of its public test
// mnemonic) and rust-dashcore key-wallet's dashbls and Ed25519 vectors (the seed of "abandon …
// about"); RESEARCH probes recomputed each one with an independent script.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { expectEqual, now, resultValue } from "../../../../packages/verification/src/helpers.js";

const DASHJ_SEED =
  "44cb0848958cb77898e464d18e3c70e2a437b343a894defa6010c5056a2b4a1c" +
  "aa01d04760871b578721b0a797fd1aacdfcd77f1870dddb34f1b204d5dbe07c0";
const ABANDON_SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

const VECTORS = [
  {
    seed: DASHJ_SEED,
    fields: {
      ownerAddress: "XpPxDdCV5is57YvZyDejDchDH4GjUHrBc8",
      votingAddress: "XbcgsvqyH7FGYCcQ7wTL9MXTgUpADsrq6J",
      operatorPublicKeyLegacy:
        "8efa464e7d58cfd90f3bb1bac18598928ffc7c112d4c64455c0ec72915fcab770a402c439ccc728288f3369ebbd530a5",
      platformNodeId: "c9bbba6a3ad5e87fb11af4f10458a52d3160259c",
    },
  },
  {
    seed: ABANDON_SEED,
    fields: {
      operatorSecretKey: "11122e1ad656d0610ce0f80d40da874d67ea656a3e66ed371c915ec3a488a43a",
      operatorPublicKey:
        "878cad04aae29eb76171937eb7101452b401b026efbc27db840f130374e6a9ec8443d917277f8921e0ba6678a7709875",
      platformNodeId: "302f2615e6955cce8ed3cff81e8011bfd3a2991f",
    },
  },
] as const;

export async function runDashMasternodeFullSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const { deriveDashMasternode } = await import("@ckd/coins/dash/masternode.js");
  for (const vector of VECTORS) {
    const result = deriveDashMasternode({
      seed: hexToBytes(vector.seed),
      network: "mainnet",
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    });
    try {
      for (const [key, expected] of Object.entries(vector.fields))
        expectEqual(`Dash masternode ${key}`, resultValue(result, key), expected);
    } finally {
      clearDerivationResult(result);
    }
  }
  return {
    passed: true,
    checks: ["Dash masternode owner, voting, BLS operator and Ed25519 Platform node keys"],
    durationMs: Math.round(now() - started),
  };
}
