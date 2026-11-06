import { describe, expect, it } from "vitest";
import { buildConcreteMultisigWallet, buildRangedWallet } from "../src/multisig-wallet.js";

// Published BIP32 vector 1, master public extended key.
const XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
const REQUEST = {
  chain: "bitcoin",
  network: "mainnet",
  required: 1,
  keyOrder: "bip67",
  wrapper: "p2wsh",
  accountXpubs: [XPUB],
  branches: [0, 1],
  startIndex: 0,
  endIndex: 0,
} as const;

describe("multisig wallet admission preserves the requested public derivation", () => {
  it.each(["2147483648", "4294967296h", "9007199254740992", "01"])(
    "refuses the invalid cosigner origin step %s in both front-end operations",
    (step) => {
      const key = `[d34db33f/${step}]${XPUB}`;
      expect(() => buildRangedWallet({ ...REQUEST, accountXpubs: [key] })).toThrow();
      expect(() => buildConcreteMultisigWallet({ ...REQUEST, publicKeys: [key] })).toThrow();
    },
  );

  it("preserves fingerprint-only origins and the highest permitted origin index", () => {
    for (const origin of ["d34db33f", "d34db33f/2147483647h"])
      expect(
        buildRangedWallet({ ...REQUEST, accountXpubs: [`[${origin}]${XPUB}`] }).descriptors[0]
          ?.descriptor,
      ).toContain(`[${origin}]${XPUB}/0/*`);
  });

  it.each([2, -1, 0.5, Number.NaN, "1", null])(
    "refuses an unsupported ranged branch before producing import metadata: case %#",
    (branch) => {
      expect(() => {
        Reflect.apply(buildRangedWallet, undefined, [{ ...REQUEST, branches: [branch] }]);
      }).toThrow(expect.objectContaining({ code: "multisig.branch" }));
    },
  );

  it.each([null, {}, "0", [], [0, 0], [0, 1, 0]])(
    "refuses a malformed or repeated branch collection: case %#",
    (branches) => {
      expect(() => {
        Reflect.apply(buildRangedWallet, undefined, [{ ...REQUEST, branches }]);
      }).toThrow(expect.objectContaining({ code: "multisig.branch" }));
    },
  );

  it.each([
    [-1, 0],
    [0.5, 1],
    [2, 1],
    [2147483648, 2147483648],
    [0, 200],
  ])("refuses an invalid or excessive range %s to %s before derivation", (startIndex, endIndex) => {
    expect(() => buildRangedWallet({ ...REQUEST, startIndex, endIndex })).toThrow();
  });

  it("keeps the receive/change labels and import internal flags aligned", () => {
    const wallet = buildRangedWallet(REQUEST);
    expect(wallet.descriptors.map(({ label }) => label)).toEqual(["receive /0/*", "change /1/*"]);
    const payload: unknown = JSON.parse(wallet.importJson);
    expect(payload).toMatchObject([{ internal: false }, { internal: true }]);
    expect(wallet.rows.map(({ branch }) => branch)).toEqual([0, 1]);
  });
  it("refuses sparse branch collections at admission", () => {
    const partial = [0];
    partial.length = 2;
    const empty: number[] = [];
    empty.length = 1;
    for (const branches of [empty, partial])
      expect(() => {
        Reflect.apply(buildRangedWallet, undefined, [{ ...REQUEST, branches }]);
      }).toThrow(expect.objectContaining({ code: "multisig.branch" }));
  });
});
