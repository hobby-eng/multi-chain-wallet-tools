// What the Inspector's known-answer checks share: one check is a name and a function that throws
// when the answer differs, and a failure names the check.

/** One known-answer check; `run` throws when the answer differs. */
export interface InspectorCheck {
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

export function expectSame(check: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Self-test failed: ${check}.`);
}

/** A verifier must also refuse: `action` has to throw for the check to pass. */
export function expectRefused(check: string, action: () => unknown): void {
  let refused = false;
  try {
    action();
  } catch {
    refused = true;
  }
  if (!refused) throw new Error(`Self-test failed: ${check}.`);
}

/** The two-key BIP67 vector that both BIP67 and Dash Core's sortedmulti tests use. */
export const BIP67_KEYS = [
  "02ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f8",
  "02fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f",
];
/** Its sorted 2-of-2 redeem script. */
export const BIP67_SCRIPT =
  "522102fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f2102ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f852ae";
/**
 * BIP380's descriptor checksum vector, the same for every chain, and one of its invalid vectors:
 * an error in the payload under the same checksum, which must be refused.
 */
export const DESCRIPTOR_VECTOR = {
  text: "raw(deadbeef)#89f8spxm",
  checksum: "valid · 89f8spxm",
  refused: "raw(deedbeef)#89f8spxm",
};
/** BIP38's test key, and the passphrase of its second compressed vector. */
export const BIP38_KEY = "09c2686880095b1a4c249ee3ac4eea8a014f11e6f986d0b5025ac1f39afbd9ae";
export const BIP38_PASSPHRASE = "Satoshi";
/** The message of the compact signatures, signed with the public test key 1. */
export const SIGNED_MESSAGE = "Offline message signing self-test";
