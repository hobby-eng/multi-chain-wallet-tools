import { HDKey } from "@scure/bip32";
import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import type { DerivationResult } from "@ckd/core/types.js";
import {
  BITCOIN_P2SH_MULTISIG,
  BITCOIN_P2SH_P2WSH_MULTISIG,
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
