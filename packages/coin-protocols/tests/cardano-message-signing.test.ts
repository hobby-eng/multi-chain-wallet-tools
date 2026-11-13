// Cardano's message signing (coins/cardano/message-signing.ts): CIP-30's signData against
// cardano-signer's published CIP-8 signatures (gitmachtl/cardano-signer @3cc4a74 README.md) and
// Trezor's (trezor-firmware @433075c common/tests/fixtures/cardano/sign_message.json), and against
// own values of test/oracles/cardano_oracle.py, which first reproduces both. Public test data only.
import { blake2b } from "@noble/hashes/blake2.js";
import { describe, expect, it } from "vitest";
import { cardanoIcarusRoot } from "@ckd/core/cardano-icarus.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { Bip32Ed25519Signer } from "../src/bip32-ed25519.js";
import { cardanoDerivation } from "@ckd/coins/cardano/index.js";
import {
  CARDANO_MESSAGE_SIGNING,
  CardanoMessageSigningError,
} from "@ckd/coins/cardano/message-signing.js";
import { CborMap, encodeCbor } from "@ckd/coins/cardano/message-signing-cbor.js";
import { cardanoEnterpriseAddress, cardanoSigningAddress } from "@ckd/coins/cardano/address.js";
import {
  protectedHeader,
  readCoseKey,
  readCoseSign1,
  sigStructure,
  verifyCoseSign1,
} from "@ckd/coins/cardano/message-signing-cose.js";
import {
  MessageSigningFormatError,
  type MessageSigningRequest,
} from "@ckd/coins/message-signing.js";

const FORMAT = "cardano-cip30";
const MESSAGE = "Offline message signing self-test";
const ABOUT = `${"abandon ".repeat(11)}about`;

/** cardano-signer's "Hello world": its key as kL ‖ kR (the oracle's expansion), address and answer. */
const SIGNER = {
  key: "6844e21291a90fcd57b8472a707fea2758e315411fe809ac17a4c3b12476944a1ff5a381b976d133e6d16f7d834695a523a76ddb3153bb51c4e6e620db67fb1f",
  address: "addr1v9ux8dwy800s5pnq327g9uzh8f2fw98ldytxqaxumh3e8kqumfr6d",
  publicKey: "755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9",
  sign1:
    "84582aa201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8a166686173686564f44b48656c6c6f20776f726c645840fc58155f0cee05bc00e7299af1df1f159ac82a46a055786b259657934eff346eec81349d4678ceabc79f213c66a2bdbfd4ea5d9ebdc630bee5ac9cce75cfc001",
  coseKey: "a4010103272006215820755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9",
} as const;

/**
 * The oracle's own values beside OWN: the stake key's COSE_Sign1 for the base address, which names
 * the base address but is no signature of its payment key; and the base address's signature in
 * Lace's shape, its address also the key id in both structures.
 */
const STAKE_FOR_BASE =
  "845846a2012767616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d74657374584011a9600c20f2feeb2a2dad910cf1c5faa19ae6a5e4f61b56f16d95d49f4196fa841f757c94f76a7ed20dd582408e012c434bf5981e9df604c54161976d2ed100";
const LACE = {
  sign1:
    "845882a30127045839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d17667616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d746573745840fd34eee083f107a3f39791bfe62609cc45efb7e2083e0dd6fef00ca78d03ca9e257edb6f924aed6ace1323262c64c91cd921c4760550f05669821770de33220e",
  key: "a50101025839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176032720062158207ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a",
} as const;

/** The oracle's own values: "abandon ... about"'s Icarus receive key 0 and stake key. */
const OWN = {
  base: {
    role: 0,
    address:
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
    publicKey: "7ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a",
    signature:
      '{"signature":"845846a2012767616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d7465737458401e9079ca1f27e29008c5616764a82e02efeb03765c2df7258a59672d22987f2bfe2348a6753fedcdc1fe36b7722b219e4e2e067dd86af075945bbeb0af53c607","key":"a40101032720062158207ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a"}',
  },
  reward: {
    role: 2,
    address: "stake1u8j40zgr2gy4788kl54h6x3gu0pukq5lfr8nflufpg5dzaskqlx2l",
    publicKey: "012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160",
    signature:
      '{"signature":"84582aa201276761646472657373581de1e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d746573745840dce6f448d1f69cbc7b4aac5e169d3068a509a4b72c6ea99c01880479d6bd6ee8136826199a2ca4ec0155971844871eaf6405c04f03bdb108d57af3eec8181002","key":"a4010103272006215820012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160"}',
  },
} as const;

function request(
  address: string,
  message: string,
  publicKey?: string,
  format = FORMAT,
): MessageSigningRequest {
  return {
    format,
    address,
    message,
    network: "mainnet",
    ...(publicKey === undefined ? {} : { inputs: { publicKeyHex: publicKey } }),
  };
}

/** The row fields of `role`'s first key of "abandon ... about" under Icarus. */
function rowFields(role: number): Map<string, string> {
  const derive = cardanoDerivation("cardano");
  if (derive === undefined) throw new Error("Cardano has no derivation.");
  const seed = cardanoIcarusRoot(ABOUT, "", "icarus");
  const result = derive({ seed, network: "mainnet", account: 0, branch: role, start: 0, count: 1 });
  try {
    const row = result.rows[0];
    return new Map([...(row?.basic ?? []), ...(row?.advanced ?? [])].map((f) => [f.key, f.value]));
  } finally {
    seed.fill(0);
    clearDerivationResult(result);
  }
}

/** The kL ‖ kR that the row's signingKey field gives the signer. */
function rowKey(role: number): Uint8Array {
  const text = rowFields(role).get("signingKey");
  if (text === undefined || CARDANO_MESSAGE_SIGNING.key === undefined)
    throw new Error("The row has no signing key.");
  return CARDANO_MESSAGE_SIGNING.key.read(text);
}

const refusalCode = async (action: () => unknown): Promise<string> => {
  try {
    await action();
    return "accepted";
  } catch (cause) {
    return cause instanceof CardanoMessageSigningError || cause instanceof MessageSigningFormatError
      ? cause.code
      : String(cause);
  }
};

describe("CIP-30 signData: cardano-signer's and Trezor's published signatures", () => {
  it("signs cardano-signer's Hello world byte for byte and verifies it with the row's key", async () => {
    const signed = await CARDANO_MESSAGE_SIGNING.sign(
      hexToBytes(SIGNER.key),
      request(SIGNER.address, "Hello world"),
      [],
    );
    expect(signed).toEqual({
      signature: `{"signature":"${SIGNER.sign1}","key":"${SIGNER.coseKey}"}`,
      format: "CIP-30 signData (CIP-8 COSE_Sign1)",
      verified: true,
    });
    const verify = (message: string, text = signed.signature) =>
      CARDANO_MESSAGE_SIGNING.verify(request(SIGNER.address, message, SIGNER.publicKey), text);
    expect(await verify("Hello world")).toBe(true);
    // The COSE_Sign1 alone, and tagged 18, verify alike.
    expect(await verify("Hello world", SIGNER.sign1)).toBe(true);
    expect(await verify("Hello world", `D2${SIGNER.sign1.toUpperCase()}`)).toBe(true);
    expect(await verify("Hello world!")).toBe(false);
  });

  it("builds Trezor's Sig_structures, which its published signatures sign", () => {
    // sign_message.json: m/1852'/1815'/4'/0/0 of "all ... all" signs "ff00" for account 0's base
    // address, and "Test" with its own key hash in the header.
    const publicKey = hexToBytes(
      "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    );
    for (const [header, payload, signature] of [
      [
        "0180f9e2c88e6c817008f3a812ed889b4a4da8e0bd103f86e7335422aa122a946b9ad3d2ddf029d3a828f0468aece76895f15c9efbd69b4277",
        "ff00",
        "9efaff0b74c0beb2cadd727d8bafe13b31107235c5fc46c6c33e596e024d391c9fbe37072e43965add6ee0a4788562382031486b74fd59d636aa1ca3b1ddfe06",
      ],
      [
        "d9553a4de9c7ad8532abdb1d0a7f425b8007d25c9f1edcf0b5f5c3ba",
        "54657374",
        "2201b8e7fa9ea919935e06ecc3e845433855066acaaf61cb8e624a2eb7139b73a9d126e7ee04548fff06ac933bd5419fc78c5aebee9b536cbee1481b52ec3e03",
      ],
    ] as const) {
      const protectedBytes = protectedHeader(hexToBytes(header));
      const sign1 = {
        protectedBytes,
        address: hexToBytes(header),
        payload: hexToBytes(payload),
        hashed: false,
        signature: hexToBytes(signature),
        keyId: undefined,
      };
      expect(verifyCoseSign1(sign1, hexToBytes(payload), publicKey)).toBe(true);
      expect(verifyCoseSign1(sign1, hexToBytes(`${payload}00`), publicKey)).toBe(false);
      expect(bytesToHex(sigStructure(protectedBytes, hexToBytes(payload)))).toMatch(/^846a/u);
    }
  });

  it("reads cardano-signer's signature by a stake key for a reward address", () => {
    // README.md "Sign hex-data payload": a testnet reward address, which only the COSE level reads.
    const payload = hexToBytes(
      "7b2263686f696365223a22596573222c22636f6d6d656e74223a22222c226e6574776f726b223a2270726576696577222c2270726f706f73616c223a2232303338633431376431313265303035656636316339356437313065653632313834613663313737643138623264613839316639376365666165346638353335222c2270726f746f636f6c223a2253756e64616553776170222c227469746c65223a22546573742050726f706f73616c202d2054616d7065726564222c2276657273696f6e223a2231222c22766f7465644174223a2233313337323237222c22766f746572223a227374616b655f7465737431757174336e7161707a373939747670326c7438616474747432396b36786132786e6c7461686e363535747534736763366173617167227d",
    );
    const sign1 = readCoseSign1(
      hexToBytes(
        "84582aa201276761646472657373581de0c13582aec9a44fcc6d984be003c5058c660e1d2ff1370fd8b49ba73fa166686173686564f45901277b2263686f696365223a22596573222c22636f6d6d656e74223a22222c226e6574776f726b223a2270726576696577222c2270726f706f73616c223a2232303338633431376431313265303035656636316339356437313065653632313834613663313737643138623264613839316639376365666165346638353335222c2270726f746f636f6c223a2253756e64616553776170222c227469746c65223a22546573742050726f706f73616c202d2054616d7065726564222c2276657273696f6e223a2231222c22766f7465644174223a2233313337323237222c22766f746572223a227374616b655f7465737431757174336e7161707a373939747670326c7438616474747432396b36786132786e6c7461686e363535747534736763366173617167227d5840c2ffc4650e21376297f42040028382406bf888c09f35a74324e80a531cc6359a6d2acc9a6e4c58c664463a25889de37d2f54422ae20a259db6fed37b86d05202",
      ),
    );
    const { publicKey } = readCoseKey(
      hexToBytes(
        "a40101032720062158209be513df12b3fabe7c1b8c3f9fab0968eb2168d5689bf981c2f7c35b11718b27",
      ),
    );
    expect(bytesToHex(sign1.address)).toBe(
      "e0c13582aec9a44fcc6d984be003c5058c660e1d2ff1370fd8b49ba73f",
    );
    expect(verifyCoseSign1(sign1, payload, publicKey)).toBe(true);
    expect(verifyCoseSign1(sign1, Uint8Array.of(...payload, 0x20), publicKey)).toBe(false);
  });
});

describe("CIP-30 signData from a derived row", () => {
  it.each(Object.entries(OWN))(
    "signs with the %s row's key, read from its signingKey field, as the oracle does",
    async (_, own) => {
      const fields = rowFields(own.role);
      expect(fields.get("address")).toBe(own.address);
      expect(fields.get("publicKeyHex")).toBe(own.publicKey);
      const key = rowKey(own.role);
      try {
        const signed = await CARDANO_MESSAGE_SIGNING.sign(key, request(own.address, MESSAGE), []);
        expect(signed.signature).toBe(own.signature);
      } finally {
        key.fill(0);
      }
      expect(
        await CARDANO_MESSAGE_SIGNING.verify(
          request(own.address, MESSAGE, own.publicKey),
          own.signature,
        ),
      ).toBe(true);
    },
  );

  it("signs the enterprise address with the payment key, and nothing with another key", async () => {
    const enterprise = rowFields(0).get("enterpriseAddress") ?? "";
    const key = rowKey(0);
    try {
      const signed = await CARDANO_MESSAGE_SIGNING.sign(key, request(enterprise, MESSAGE), []);
      expect(
        await CARDANO_MESSAGE_SIGNING.verify(
          request(enterprise, MESSAGE, OWN.base.publicKey),
          signed.signature,
        ),
      ).toBe(true);
      // The base address's signature names the base address: it is not valid for the enterprise one.
      expect(
        await CARDANO_MESSAGE_SIGNING.verify(
          request(enterprise, MESSAGE, OWN.base.publicKey),
          OWN.base.signature,
        ),
      ).toBe(false);
      expect(
        await refusalCode(() =>
          CARDANO_MESSAGE_SIGNING.sign(key, request(OWN.reward.address, MESSAGE), []),
        ),
      ).toBe("SIGNING_FAILED");
    } finally {
      key.fill(0);
    }
  });

  it("reads a signingKey only with the Rust crate's bits and its own public key after it", () => {
    const text = rowFields(0).get("signingKey") ?? "";
    const read = (value: string) => () => CARDANO_MESSAGE_SIGNING.key?.read(value);
    expect(read(text)).not.toThrow();
    const flip = (at: number, mask: number) => {
      const bytes = hexToBytes(text);
      bytes[at] = (bytes[at] ?? 0) ^ mask;
      return bytesToHex(bytes);
    };
    for (const bad of [
      text.slice(2),
      text.toUpperCase(),
      flip(0, 0b0000_0001),
      flip(31, 0b1000_0000),
      flip(31, 0b0100_0000),
      flip(64, 0b0000_0001),
    ])
      expect(read(bad)).toThrow(expect.objectContaining({ code: "derivation.key.material" }));
  });
});

/** The base address's verification of `signature` with the row key `publicKey` (none for null). */
const base = (
  signature: string = OWN.base.signature,
  publicKey: string | null = OWN.base.publicKey,
) =>
  CARDANO_MESSAGE_SIGNING.verify(
    request(OWN.base.address, MESSAGE, publicKey ?? undefined),
    signature,
  );
/** The COSE_Sign1 hex of a DataSignature. */
const sign1Of = (text: string) => /"signature":"([0-9a-f]+)"/u.exec(text)?.[1] ?? "";

/** A COSE_Sign1 of the self-test message over `header`, signed by the base row's key. */
const signedOver = (header: CborMap): string => {
  const key = rowKey(0);
  const signer = Bip32Ed25519Signer.fromExtendedKey(key);
  try {
    const protectedBytes = encodeCbor(header);
    const payload = new TextEncoder().encode(MESSAGE);
    const signature = signer.sign(sigStructure(protectedBytes, payload));
    return bytesToHex(
      encodeCbor([protectedBytes, new CborMap([["hashed", false]]), payload, signature]),
    );
  } finally {
    signer.wipe();
    key.fill(0);
  }
};

describe("CIP-30 signData verification: keys and headers", () => {
  it("takes the key from the row, never from a pasted COSE_Key", async () => {
    expect(await base()).toBe(true);
    // No row key, another key for the row, or a pasted key that is not the row's: never valid.
    expect(await base(OWN.base.signature, null)).toBe(false);
    expect(await base(OWN.base.signature, OWN.reward.publicKey)).toBe(false);
    const otherKey = OWN.base.signature.replace(OWN.base.publicKey, OWN.reward.publicKey);
    expect(await base(otherKey)).toBe(false);
    // The reward signature, with its own key pasted, does not prove the base address.
    expect(await base(OWN.reward.signature)).toBe(false);
  });

  it("accepts a key only when its hash is the address's own: the stake key's signature naming the base address is not valid", async () => {
    const stakeKey = `a4010103272006215820${OWN.reward.publicKey}`;
    for (const signature of [
      STAKE_FOR_BASE,
      `{"signature":"${STAKE_FOR_BASE}","key":"${stakeKey}"}`,
    ])
      expect(await base(signature, OWN.reward.publicKey)).toBe(false);
  });

  it("verifies over the protected header as received: Lace's, with the address also as key id", async () => {
    expect(await base(`{"signature":"${LACE.sign1}","key":"${LACE.key}"}`)).toBe(true);
    expect(await base(LACE.sign1)).toBe(true);
    // CIP-30: the key ids of the two structures must be the same, byte for byte: here the address
    // with its last byte changed, as long as the header's.
    const kid = Uint8Array.from(readCoseSign1(hexToBytes(LACE.sign1)).address);
    kid[kid.length - 1] = (kid.at(-1) ?? 0) ^ 1;
    const otherId = bytesToHex(
      encodeCbor(
        new CborMap([
          [1, 1],
          [2, kid],
          [3, -8],
          [-1, 6],
          [-2, hexToBytes(OWN.base.publicKey)],
        ]),
      ),
    );
    expect(await refusalCode(() => base(`{"signature":"${LACE.sign1}","key":"${otherId}"}`))).toBe(
      "INVALID_SIGNATURE",
    );
  });

  it("refuses a header of another algorithm, a key id that is not bytes, and an address key with a byte order mark", async () => {
    const address = readCoseSign1(hexToBytes(sign1Of(OWN.base.signature))).address;
    for (const header of [
      new CborMap([
        [1, -7],
        ["address", address],
      ]),
      new CborMap([
        [1, -8],
        [4, 1],
        ["address", address],
      ]),
      // "\u{FEFF}address" encodes differently from "address": it is another key, not the address.
      new CborMap([
        [1, -8],
        ["address", address],
        ["\u{FEFF}address", Uint8Array.of(0x61)],
      ]),
    ])
      expect(await refusalCode(() => base(signedOver(header)))).toBe("INVALID_SIGNATURE");
  });

  it("verifies by RFC 8032's strict rule: a key of small order proves nothing", async () => {
    // The identity point as key and as R, with S = 0, satisfies ZIP-215's cofactored equation for
    // any message; the strict rule refuses a key of small order.
    const identity = `01${"00".repeat(31)}`;
    const address = cardanoEnterpriseAddress(hexToBytes(identity));
    const target = cardanoSigningAddress(address);
    if (target === undefined) throw new Error("The identity's enterprise address must be read.");
    const sign1 = bytesToHex(
      encodeCbor([
        protectedHeader(target.bytes),
        new CborMap([["hashed", false]]),
        new TextEncoder().encode(MESSAGE),
        hexToBytes(`${identity}${"00".repeat(32)}`),
      ]),
    );
    expect(await CARDANO_MESSAGE_SIGNING.verify(request(address, MESSAGE, identity), sign1)).toBe(
      false,
    );
  });

  it("refuses a hashed flag that is not a boolean, and spaces that JSON does not allow", async () => {
    const sign1 = sign1Of(OWN.base.signature);
    for (const signature of [
      sign1.replace("a166686173686564f4", "a166686173686564f6"),
      OWN.base.signature.replace(',"key"', ',\u00a0"key"'),
      `\u00a0${sign1}`,
    ])
      expect(await refusalCode(() => base(signature))).toBe("INVALID_SIGNATURE");
    expect(await base(` \n${OWN.base.signature.replace(',"key"', ' ,\t"key"')}\r\n`)).toBe(true);
  });
});

describe("CIP-30 signData verification: payloads and refusals", () => {
  it("accepts a payload hashed with BLAKE2b-224 and a detached one, which it never writes", async () => {
    const message = new TextEncoder().encode(MESSAGE);
    const key = rowKey(0);
    const signer = Bip32Ed25519Signer.fromExtendedKey(key);
    try {
      const header = protectedHeader(
        readCoseSign1(hexToBytes(sign1Of(OWN.base.signature))).address,
      );
      const hashed = blake2b(message, { dkLen: 28 });
      const variants = [
        [new CborMap([["hashed", true]]), hashed, hashed],
        [new CborMap([]), null, message],
      ] as const;
      for (const [unprotected, payload, signed] of variants) {
        const signature = signer.sign(sigStructure(header, signed));
        const text = bytesToHex(encodeCbor([header, unprotected, payload, signature]));
        expect(await base(text)).toBe(true);
        expect(
          await CARDANO_MESSAGE_SIGNING.verify(
            request(OWN.base.address, `${MESSAGE}!`, OWN.base.publicKey),
            text,
          ),
        ).toBe(false);
      }
    } finally {
      signer.wipe();
      key.fill(0);
    }
  });

  it.each([
    [
      "a header integer longer than it needs",
      (h: string) => h.replace("845846a20127", "845847a2013807"),
    ],
    ["an indefinite-length array", (h: string) => `9f${h.slice(2)}ff`],
    ["a trailing byte", (h: string) => `${h}00`],
    ["a tag other than COSE_Sign1's", (h: string) => `d3${h}`],
    ["a header with crit", (h: string) => h.replace("845846a2012767", "845848a301270280" + "67")],
    [
      "an unprotected header with another key",
      (h: string) => h.replace("a166686173686564f4", "a1636b6964f4"),
    ],
    [
      "hashed written as an integer",
      (h: string) => h.replace("a166686173686564f4", "a166686173686564" + "00"),
    ],
    [
      "a signature of 63 bytes",
      (h: string) => h.replace(/5840([0-9a-f]{126})[0-9a-f]{2}$/u, "583f$1"),
    ],
    ["a three-element array", (h: string) => `83${h.slice(2, h.indexOf("5840"))}`],
    ["odd hex", (h: string) => h.slice(1)],
    ["text that is not hex", (h: string) => `${h.slice(0, -2)}zz`],
  ])("refuses %s as unreadable", async (_, change) => {
    const sign1 = change(sign1Of(OWN.base.signature));
    expect(await refusalCode(() => base(sign1))).toBe("INVALID_SIGNATURE");
  });

  it.each([
    ["an extra member", (s: string) => s.replace('{"signature"', '{"address":"00","signature"')],
    ["a repeated member", (s: string) => s.replace('"key"', '"signature"')],
    [
      "a COSE_Key with keys out of order",
      (s: string) => s.replace('"key":"a4010103272006', '"key":"a4030101272006'),
    ],
    ["a COSE_Key of another curve", (s: string) => s.replace("a4010103272006", "a4010103272004")],
    [
      "a JSON value that is not a string",
      (s: string) => s.replace(/"key":"[0-9a-f]+"/u, '"key":1'),
    ],
  ])("refuses a DataSignature with %s", async (_, change) => {
    expect(await refusalCode(() => base(change(OWN.base.signature)))).toBe("INVALID_SIGNATURE");
  });

  it("refuses a malformed signature before it looks for the row's key", async () => {
    expect(await refusalCode(() => base("00", null))).toBe("INVALID_SIGNATURE");
  });

  it("refuses a key that cannot sign and a format it does not own", async () => {
    const key = hexToBytes(SIGNER.key);
    key[0] = (key[0] ?? 0) | 1;
    expect(
      await refusalCode(() =>
        CARDANO_MESSAGE_SIGNING.sign(key, request(SIGNER.address, "Hello world"), []),
      ),
    ).toBe("INVALID_KEY");
    expect(
      await refusalCode(() =>
        CARDANO_MESSAGE_SIGNING.verify(
          request(SIGNER.address, "Hello world", SIGNER.publicKey, "ton-sign-data-text"),
          SIGNER.sign1,
        ),
      ),
    ).toBe("UNSUPPORTED_FORMAT");
  });
});
