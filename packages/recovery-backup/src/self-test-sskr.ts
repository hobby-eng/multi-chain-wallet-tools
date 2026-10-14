import { hexToBytes } from "@noble/hashes/utils.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { createSskrShares, recoverSskrShares } from "./sskr.js";
import { expectBytes, now } from "./self-test-helpers.js";

/**
 * The official grouped SSKR test vector of Blockchain Commons' BCR-2020-011: its five shares in
 * two groups restore the secret below. A published answer catches a fault that a round trip
 * through the same code would hide. (MnemoCode keeps the same vector in sskr/known-answers.ts.)
 */
const PUBLISHED_SHARES = [
  "ur:sskr/gogrrsbyadaefmnlbnctaaecvoqdfnjpbzecstfgaxtifpsskbfw",
  "ur:sskr/gogrrsbyadaohtrygabavahphnlrlpmkghwyiojkjtkpmdkncfjp",
  "ur:sskr/gogrrsbybgaefywsfefhiymofseyihfremkivwsogrespmclwepd",
  "ur:sskr/gogrrsbybgaootkoehgoztzcreloknrfvawyinssrksnmedtfmks",
  "ur:sskr/gogrrsbybgaaiaeenbuyksetonswsstduoprvwrphkbytlfzlyca",
];
/** The secret of BCR-2020-011's grouped vector. */
const PUBLISHED_SECRET = "7daa851251002874e1a1995f0897e6b1";

export function runSskrSelfTest(): CryptoSelfTestReport {
  const started = now();
  const secret = hexToBytes("000102030405060708090a0b0c0d0e0f");
  const vectors = [
    ["compact-ur", "SSKR Compact UR encode/decode"],
    ["bytewords", "SSKR Bytewords encode/decode"],
  ] as const;
  const checks = ["SSKR BCR-2020-011 grouped vector", ...vectors.map(([, label]) => label)];
  try {
    const published = recoverSskrShares(PUBLISHED_SHARES, "compact-ur");
    const expected = hexToBytes(PUBLISHED_SECRET);
    try {
      expectBytes("SSKR BCR-2020-011 grouped vector", published, expected);
    } finally {
      published.fill(0);
      expected.fill(0);
    }
    for (const [encoding, label] of vectors) {
      const shares = createSskrShares(secret, 1, [{ threshold: 2, count: 3 }], encoding);
      const recovered = recoverSskrShares([shares[0]!, shares[2]!], encoding);
      try {
        expectBytes(label, recovered, secret);
      } finally {
        recovered.fill(0);
      }
    }
    return { passed: true, checks, durationMs: Math.round(now() - started) };
  } finally {
    secret.fill(0);
  }
}
