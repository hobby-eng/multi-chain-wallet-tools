import { HDKey } from "@scure/bip32";
import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { readFileSync } from "node:fs";
import { TAPROOT_UNSPENDABLE_KEY } from "@scure/btc-signer";
import { keyAggregate, sortKeys } from "@scure/btc-signer/musig2.js";
import { descriptors, hdkeychain, init, musig2 } from "btcutil-js";
import { beforeAll, describe, expect, it } from "vitest";
import officialVectors from "../../../apps/psbt-inspector/tests/independent-audit/official-vectors.json";
import remediationVectors from "../../../apps/psbt-inspector/tests/independent-audit/remediation-vectors.json";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import type { DerivationResult } from "@ckd/core/types.js";
import {
  BITCOIN_P2SH_MULTISIG,
  BITCOIN_P2SH_P2WSH_MULTISIG,
  BITCOIN_P2TR_MULTI_A_MULTISIG,
  BITCOIN_P2TR_MUSIG2_MULTISIG,
  BITCOIN_P2WSH_MULTISIG,
} from "../src/coins/bitcoin/multisig-wallet.js";
import { DASH_P2SH_MULTISIG, encodePlatformP2sh } from "../src/coins/dash/multisig-wallet.js";
import {
  buildMultisigWallet,
  multisigScript,
  orderMultisigKeys,
  parseCosignerKey,
  type MultisigCosigner,
} from "../src/coins/multisig-wallet.js";

// BIP67's two-key vector, which Dash Core's sortedmulti tests also use.
const BIP67_KEYS = [
  "02ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f8",
  "02fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f",
].map(hexToBytes);
const BIP67_SCRIPT =
  "522102fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f2102ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f852ae";

const MNEMONICS = [
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "birth kingdom trash renew flavor utility donkey gasp regular alert pave layer",
  "enemy check owner stumble unaware debris suffer peanut good fabric bleak outside",
];

function value(result: DerivationResult, key: string): string | undefined {
  return [
    ...result.basicSummary,
    ...result.summary,
    ...(result.rows[0]?.basic ?? []),
    ...(result.rows[0]?.advanced ?? []),
    ...(result.rows[0]?.groups ?? []).flatMap((group) => [...group.basic, ...group.advanced]),
  ].find((field) => field.key === key)?.value;
}

function seedCosigners(path: (index: number) => string): MultisigCosigner[] {
  return MNEMONICS.map((mnemonic, place) => {
    const root = HDKey.fromMasterSeed(mnemonicToSeed(mnemonic));
    const fingerprint = root.fingerprint.toString(16).padStart(8, "0");
    const accountPath = path(place);
    return {
      label: `Cosigner ${place + 1}`,
      account: root.derive(accountPath),
      origin: { fingerprint, path: accountPath.slice(2).replaceAll("'", "h") },
    };
  });
}

describe("multisig scripts", () => {
  it("sorts BIP67's vector into its published script and its Dash and Bitcoin addresses", () => {
    const script = multisigScript(2, orderMultisigKeys(BIP67_KEYS, "sorted"));
    expect(bytesToHex(script)).toBe(BIP67_SCRIPT);
    expect(DASH_P2SH_MULTISIG.outputs(script, "testnet")[0]?.value).toBe(
      "8nL86iHTC8K4eVZ6YwyhRWMLhSauj8XQAK",
    );
    expect(BITCOIN_P2SH_MULTISIG.outputs(script, "mainnet")[0]?.value).toBe(
      "39bgKC7RFbpoCRbtD5KEdkYKtNyhpsNa3Z",
    );
    expect(bytesToHex(multisigScript(2, orderMultisigKeys(BIP67_KEYS, "entered")))).not.toBe(
      BIP67_SCRIPT,
    );
  });

  it("encodes DIP-18's Platform P2SH vector", () => {
    const hash = hexToBytes("43fa183cf3fb6e9e7dc62b692aeb4fc8d8045636");
    expect(encodePlatformP2sh(hash, "dash")).toBe("dash1sppl5xpu70aka8nacc4kj2htflydspzkxch4cad6");
    expect(encodePlatformP2sh(hash, "tdash")).toBe(
      "tdash1sppl5xpu70aka8nacc4kj2htflydspzkxc8jtru5",
    );
    expect(
      bech32m.fromWords(bech32m.decode("dash1sppl5xpu70aka8nacc4kj2htflydspzkxch4cad6").words)[0],
    ).toBe(0x80);
  });

  it("matches Bitcoin Core's wsh(multi) and sh(wsh(multi)) descriptor vectors", () => {
    const wsh = multisigScript(
      2,
      [
        "03a0434d9e47f3c86235477c7b1ae6ae5d3442d49b1943c2b752a68e2a47e247c7",
        "03774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb",
        "03d01115d548e7561b15c38f004d734633687cf4419620095bc5b0f47070afe85a",
      ].map(hexToBytes),
    );
    const program = bech32.fromWords(
      bech32
        .decode(BITCOIN_P2WSH_MULTISIG.outputs(wsh, "mainnet")[0]!.value as `${string}1${string}`)
        .words.slice(1),
    );
    expect(bytesToHex(program)).toBe(
      "773d709598b76c4e3b575c08aad40658963f9322affc0f8c28d1d9a68d0c944a",
    );
    const nested = multisigScript(
      1,
      [
        "03f28773c2d975288bc7d1d205c3748651b075fbc6610e58cddeeddf8f19405aa8",
        "03499fdf9e895e719cfd64e67f07d38e3226aa7b63678949e6e49b241a60e823e4",
        "02d7924d4f7d43ea965a465ae3095ff41131e5946f3c85f79e44adbcf8e27e080e",
      ].map(hexToBytes),
    );
    const address = BITCOIN_P2SH_P2WSH_MULTISIG.outputs(nested, "mainnet")[0]!.value;
    // The vector's scriptPubKey is a914aec509e284f909f769bb7dda299a717c87cc97ac87.
    expect(bytesToHex(createBase58check(sha256).decode(address))).toBe(
      "05aec509e284f909f769bb7dda299a717c87cc97ac",
    );
  });

  it("refuses duplicate, uncompressed or too many keys and a wrong threshold", () => {
    expect(() => multisigScript(2, [BIP67_KEYS[0]!, BIP67_KEYS[0]!])).toThrow(/same public key/u);
    expect(() => multisigScript(3, BIP67_KEYS)).toThrow(/between 1/u);
    expect(() => multisigScript(1, [new Uint8Array(65).fill(4)])).toThrow(/compressed/u);
  });
});

describe("multisig wallets from cosigner accounts", () => {
  it("builds the same 2-of-3 Dash wallet from recovery phrases as from their xpubs", () => {
    const fromSeeds = seedCosigners(() => "m/48'/5'/0'/0'");
    const fromKeys = fromSeeds.map((cosigner) => ({
      ...cosigner,
      ...parseCosignerKey(
        `[${cosigner.origin!.fingerprint}/${cosigner.origin!.path}]${cosigner.account.publicExtendedKey}`,
        DASH_P2SH_MULTISIG.versions("mainnet"),
      ),
    }));
    const request = {
      scheme: DASH_P2SH_MULTISIG,
      network: "mainnet",
      required: 2,
      order: "sorted",
      branch: 0,
      start: 0,
      count: 2,
    } as const;
    const seeds = buildMultisigWallet({ ...request, cosigners: fromSeeds });
    const keys = buildMultisigWallet({ ...request, cosigners: fromKeys });
    // Computed by the research probe's independent script, not a published vector.
    expect(value(seeds, "address")).toBe("7dUNRiG1nVALhM1t3YqF4viRgfE5MwFSae");
    expect(value(seeds, "platformAddress")).toBe("dash1spu466hzqeq4pgjh9t0aemp5lddgpc8jjc8ynevx");
    expect(keys.rows.map((row) => row.basic.map(({ value }) => value))).toEqual(
      seeds.rows.map((row) => row.basic.map(({ value }) => value)),
    );
    expect(value(seeds, "cosigner1PrivateKeyWif")).toBeDefined();
    expect(value(keys, "cosigner1PrivateKeyWif")).toBeUndefined();
    expect(value(seeds, "descriptor")).toMatch(
      /^sh\(sortedmulti\(2,\[73c5da0a\/48h\/5h\/0h\/0h\]xpub/u,
    );
    expect(value(seeds, "descriptor")).toMatch(/#[a-z0-9]{8}$/u);
  });

  it("matches the Dash Core signer path's computed 2-of-3 address", () => {
    const result = buildMultisigWallet({
      scheme: DASH_P2SH_MULTISIG,
      network: "mainnet",
      required: 2,
      order: "sorted",
      cosigners: seedCosigners(() => "m/44'/5'/0'"),
      branch: 0,
      start: 0,
      count: 1,
    });
    expect(value(result, "address")).toBe("7pLWw49zFzaH7NQnxWe61YutDAQ1FAd2na");
    expect(value(result, "platformAddress")).toBe("dash1srcg4yh9ctkusn6gt95e0ew2e4pwxt67yua7snap");
  });

  it("refuses a repeated cosigner, too few cosigners and a private extended key", () => {
    const [first] = seedCosigners(() => "m/44'/5'/0'");
    const request = {
      scheme: DASH_P2SH_MULTISIG,
      network: "mainnet",
      required: 1,
      order: "sorted",
      branch: 0,
      start: 0,
      count: 1,
    } as const;
    expect(() => buildMultisigWallet({ ...request, cosigners: [first!, first!] })).toThrow(
      /same account key/u,
    );
    expect(() => buildMultisigWallet({ ...request, cosigners: [first!] })).toThrow(
      /two cosigners/u,
    );
    expect(() =>
      parseCosignerKey(first!.account.privateExtendedKey, DASH_P2SH_MULTISIG.versions("mainnet")),
    ).toThrow();
  });
});

describe("Bitcoin Taproot multisig", () => {
  // The Go/btcd WASM oracle is independent of Scure/Noble (as in the Inspector's audit tests).
  beforeAll(async () => {
    const wasm = readFileSync(
      new URL("../../../node_modules/btcutil-js/dist/btcutil.wasm", import.meta.url),
    );
    await init(Uint8Array.from(wasm).buffer);
  }, 30_000);

  const accounts = () =>
    MNEMONICS.map((mnemonic) =>
      HDKey.fromMasterSeed(mnemonicToSeed(mnemonic)).derive("m/48'/0'/0'/3'"),
    );

  it("writes multi_a as Bitcoin Core's miniscript vector does", () => {
    // Bitcoin Core miniscript_tests.cpp: multi_a(2,03d01115…,025601570c…).
    const keys = [
      "03d01115d548e7561b15c38f004d734633687cf4419620095bc5b0f47070afe85a",
      "025601570cb47f238d2b0286db4a990fa0f3ba28d1a319f5e7cf55c2a2444da7cc",
    ].map(hexToBytes);
    expect(bytesToHex(BITCOIN_P2TR_MULTI_A_MULTISIG.script!(2, keys))).toBe(
      "20d01115d548e7561b15c38f004d734633687cf4419620095bc5b0f47070afe85aac" +
        "205601570cb47f238d2b0286db4a990fa0f3ba28d1a319f5e7cf55c2a2444da7ccba529c",
    );
  });

  it.each(["sorted", "entered"] as const)(
    "matches Go's tr(H, %smulti_a) addresses",
    async (order) => {
      const nodes = accounts();
      const result = buildMultisigWallet({
        scheme: BITCOIN_P2TR_MULTI_A_MULTISIG,
        network: "mainnet",
        required: 2,
        order,
        cosigners: nodes.map((account, place) => ({ label: `Cosigner ${place + 1}`, account })),
        branch: 0,
        start: 0,
        count: 3,
      });
      const keys = nodes.map((node) => `${node.publicExtendedKey}/0/*`).join(",");
      const go = await descriptors.create(
        `tr(${bytesToHex(TAPROOT_UNSPENDABLE_KEY)},${order === "sorted" ? "sorted" : ""}multi_a(2,${keys}))`,
      );
      try {
        expect(result.rows.map((row) => row.basic[0]?.value)).toEqual(
          [0, 1, 2].map((index) => go.addressAt("mainnet", 0, index)),
        );
      } finally {
        go.free();
      }
      expect(result.rows[0]?.basic[0]?.value).toMatch(/^bc1p/u);
      expect(value(result, "descriptor")).toMatch(
        new RegExp(
          `^tr\\(50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0,${order === "sorted" ? "sorted" : ""}multi_a\\(2,`,
          "u",
        ),
      );
    },
  );

  it("builds BIP328's published aggregate xpubs from KeyAgg and its chain code", () => {
    // BIP328 aggregates its vector keys in the order given; BIP390's musig() sorts them first,
    // which the rawtr vectors below check through the scheme itself.
    for (const vector of officialVectors.bip328) {
      const aggregate = keyAggregate(
        vector.keys.map((key) => hexToBytes(key.toLowerCase())),
      ).aggPublicKey.toBytes(true);
      expect(bytesToHex(aggregate)).toBe(vector.aggregate_pubkey);
      const sorted = BITCOIN_P2TR_MUSIG2_MULTISIG.aggregate!(
        sortKeys(vector.keys.map((key) => hexToBytes(key.toLowerCase()))).map(
          (publicKey) => new HDKey({ publicKey }),
        ),
        "mainnet",
      );
      expect(sorted.chainCode).toEqual(
        hexToBytes("868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965"),
      );
      expect(
        new HDKey({ publicKey: aggregate, chainCode: sorted.chainCode! }).publicExtendedKey,
      ).toBe(vector.xpub);
    }
  });

  it("derives BIP390's published rawtr(musig(…)/0/*) keys", () => {
    for (const vector of remediationVectors.musig.filter(({ descriptor }) =>
      descriptor.startsWith("rawtr(musig(xpub"),
    )) {
      const xpubs = /musig\((xpub\w+),(xpub\w+)\)/u.exec(vector.descriptor)!.slice(1);
      const node = BITCOIN_P2TR_MUSIG2_MULTISIG.aggregate!(
        xpubs.map((xpub) => HDKey.fromExtendedKey(xpub)),
        "mainnet",
      );
      const child = node.deriveChild(0).deriveChild(vector.index);
      expect(`5120${bytesToHex(child.publicKey!.slice(1))}`).toBe(vector.script);
    }
  });

  it("matches Go's MuSig2 aggregate, BIP32 child and Taproot key-path address", async () => {
    const nodes = accounts();
    const result = buildMultisigWallet({
      scheme: BITCOIN_P2TR_MUSIG2_MULTISIG,
      network: "mainnet",
      required: 3,
      order: "sorted",
      cosigners: nodes.map((account, place) => ({ label: `Cosigner ${place + 1}`, account })),
      branch: 1,
      start: 4,
      count: 1,
    });
    const keys = nodes.map((node) => bytesToHex(node.publicKey!)).sort();
    const aggregate = await musig2.aggregateKeys(keys);
    const synthetic = new HDKey({
      publicKey: aggregate.combinedKey,
      chainCode: hexToBytes("868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965"),
    }).publicExtendedKey;
    const child = await hdkeychain.derivePath(synthetic, "m/1/4");
    const go = await descriptors.create(
      `tr(${bytesToHex(await hdkeychain.publicKey(child)).slice(2)})`,
    );
    try {
      expect(result.rows[0]?.basic[0]?.value).toBe(go.addressAt("mainnet", 0, 0));
    } finally {
      go.free();
    }
    expect(value(result, "descriptor")).toMatch(/^tr\(musig\(xpub\w+,xpub\w+,xpub\w+\)\/1\/\*\)#/u);
    expect(value(result, "cosigner1PrivateKeyWif")).toBeUndefined();
    expect(() =>
      buildMultisigWallet({
        scheme: BITCOIN_P2TR_MUSIG2_MULTISIG,
        network: "mainnet",
        required: 2,
        order: "sorted",
        cosigners: nodes.map((account, place) => ({ label: `Cosigner ${place + 1}`, account })),
        branch: 0,
        start: 0,
        count: 1,
      }),
    ).toThrow(/n-of-n/u);
  });
});

describe("P2WSH beyond the P2SH limit", () => {
  it("builds a 16-of-20 P2WSH wallet, whose 684-byte script P2SH could not carry", () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONICS[0]!));
    const cosigners = Array.from({ length: 20 }, (_, account) => ({
      label: `Cosigner ${account + 1}`,
      account: root.derive(`m/48'/0'/${account}'/2'`),
    }));
    const result = buildMultisigWallet({
      scheme: BITCOIN_P2WSH_MULTISIG,
      network: "mainnet",
      required: 16,
      order: "sorted",
      cosigners,
      branch: 0,
      start: 0,
      count: 1,
    });
    // OP_16, twenty 34-byte key pushes, the two-byte push of 20, OP_CHECKMULTISIG.
    expect(value(result, "redeemScript")).toHaveLength(684 * 2);
    expect(result.rows[0]?.basic[0]?.value).toMatch(/^bc1q/u);
  });
});
