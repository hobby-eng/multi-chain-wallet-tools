// The self-test of Bitcoin wallet evidence (core/wallet-evidence.ts): the master fingerprint, the
// master and account extended public keys in their forms, an address in each of the four profiles,
// a compressed public key and a WIF, on mainnet and testnet, and a passphrase; an address found
// among several in a row (the scan of --scan-gap) and not before them; evidence of another
// wallet that does not match, and evidence that no wallet can match, refused. A host that builds
// in wallet evidence adds it to its self-test (SelfTestHost.features, MnemoCodeSelfTest.core), so
// that a build without Bitcoin carries none of it.
//
// It derives every key from the published seeds of the public phrase (master-fingerprint-
// self-test.ts), so it needs nothing from the host. It holds public test data, no secret: the WIF
// here is the private key of a public test vector.
//
// Host-neutral: it imports only core/wallet-evidence.ts and other self-test modules.

import {
  PUBLIC_MNEMONIC,
  PUBLIC_PHRASE_SEEDS,
  VECTOR_PASSPHRASE,
} from "./master-fingerprint-self-test.js";
import { BITCOIN } from "./coins/bitcoin-like.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "./self-test-check.js";
import {
  bitcoinProfiles,
  isPlacedKind,
  parseBitcoinAddress,
  WalletEvidenceCheck,
  type BitcoinNetworkName,
  type BitcoinProfile,
  type EvidenceMatch,
  type WalletEvidence,
} from "./wallet-evidence.js";

/**
 * The keys of the public phrase. BIP84's test vectors: the master and account zpub, and the first
 * receiving address with its public key and WIF; BIP86's: the account xpub and the first receiving
 * address; BIP49's, which are on testnet: the account upub. The others, the master key in its xpub,
 * ypub and tpub forms, the first receiving addresses of BIP44 and BIP49 on mainnet and the BIP84
 * address with the passphrase TREZOR, were computed independently with Python's hashlib and a
 * plain secp256k1, which first reproduce all of the published ones.
 */
const KEYS = {
  fingerprint: "73c5da0a",
  rootXpub:
    "xpub661MyMwAqRbcFkPHucMnrGNzDwb6teAX1RbKQmqtEF8kK3Z7LZ59qafCjB9eCRLiTVG3uxBxgKvRgbubRhqSKXnGGb1aoaqLrpMBDrVxga8",
  rootYpub:
    "ypub6QqdH2c5z79673aQjy9R4MUVPujYqGA1vY7YCAjmcFWdN9NLbDEiTeKLkP7ECKzds8NrfRnX8zGyZtXA9QFT7mTs8vi1PVeq8YQpcNKUMvQ",
  rootZpub:
    "zpub6jftahH18ngZxLmXaKw3GSZzZsszmt9WqedkyZdezFtWRFBZqsQH5hyUmb4pCEeZGmVfQuP5bedXTB8is6fTv19U1GQRyQUKQGUTzyHACMF",
  rootTpub:
    "tpubD6NzVbkrYhZ4XYa9MoLt4BiMZ4gkt2faZ4BcmKu2a9te4LDpQmvEz2L2yDERivHxFPnxXXhqDRkUNnQCpZggCyEZLBktV7VaSmwayqMJy1s",
  account84Zpub:
    "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
  account86Xpub:
    "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ",
  account49TestnetUpub:
    "upub5EFU65HtV5TeiSHmZZm7FUffBGy8UKeqp7vw43jYbvZPpoVsgU93oac7Wk3u6moKegAEWtGNF8DehrnHtv21XXEMYRUocHqguyjknFHYfgY",
  address44: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
  address49: "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf",
  address84: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
  address86: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
  /** BIP84's first change address: of the same wallet, at another place. */
  change84: "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
  /** BIP84's second receiving address, m/84'/0'/0'/0/1. */
  second84: "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
  publicKey84: "0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c",
  wif84: "KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d",
  trezorAddress84: "bc1qv5rmq0kt9yz3pm36wvzct7p3x6mtgehjul0feu",
} as const;
/** The WIF of the private key 1 (compressed), which no seed phrase gives at these places. */
const KEY_ONE_WIF = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn";
/** BIP173's P2WSH example: an address of a script, which no single key gives. */
const SCRIPT_ADDRESS = "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";
/** BIP84's first testnet receiving address of the public phrase (test/coins.test.ts). */
const TESTNET_ADDRESS = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";

const FIRST = { account: 0, branch: 0, index: 0 } as const;
const checks = new WalletEvidenceCheck(PUBLIC_PHRASE_SEEDS, [BITCOIN]);

/** Evidence of one key at the first receiving place, in `profiles`. */
function located(
  kind: "address" | "compressed-public-key" | "wif" | "account-xpub",
  value: string,
  profiles: readonly BitcoinProfile[],
  network: BitcoinNetworkName = "mainnet",
): WalletEvidence {
  return { kind, value, profiles, location: { network, ...FIRST } };
}

/** An address compared with the first `addresses` receiving addresses, from index `index` on. */
function scanned(value: string, addresses: number | undefined, index = 0): WalletEvidence {
  return {
    kind: "address",
    value,
    profiles: ["native-segwit"],
    location: { network: "mainnet", ...FIRST, index },
    ...(addresses === undefined ? {} : { addresses }),
  };
}

/** A match as one line: whether it matched, and where; refused evidence names why. */
function matchOf(evidence: WalletEvidence, passphrase = ""): string {
  const match: EvidenceMatch = checks.match(PUBLIC_MNEMONIC, evidence, passphrase);
  return match.matched ? `matched at ${match.path}` : "not matched";
}

/**
 * The quick known answers: BIP84's first address found where BIP84 puts it, its change address
 * not found there, and an address with a wrong checksum refused.
 */
function checkWalletEvidenceStartup(): void {
  for (const kind of ["constructor", "toString", "hasOwnProperty", "__proto__"])
    expectSame(isPlacedKind(kind), false, "Inherited wallet evidence kind");
  expectSame(
    matchOf(located("address", KEYS.address84, ["native-segwit"])),
    "matched at m/84'/0'/0'/0/0",
    "BIP84 address",
  );
  expectSame(
    matchOf(located("address", KEYS.change84, ["native-segwit"])),
    "not matched",
    "Another address of the wallet",
  );
  expectSame(
    matchOf(scanned(KEYS.second84, 2)),
    "matched at m/84'/0'/0'/0/1",
    "BIP84 second address among the first two",
  );
  expectRefused(
    () => parseBitcoinAddress(KEYS.address84.replace(/u$/u, "v"), "mainnet"),
    /not valid for Bitcoin mainnet\.$/u,
    "An address with a wrong checksum",
  );
}

/** Evidence of every kind and what it gives: the place of the match, or none. */
const MATCHES: readonly (readonly [string, WalletEvidence, string, string?])[] = [
  [
    "Master fingerprint",
    { kind: "master-fingerprint", value: KEYS.fingerprint.toUpperCase(), network: "mainnet" },
    "matched at m",
  ],
  [
    "Another master fingerprint",
    { kind: "master-fingerprint", value: "00000000", network: "mainnet" },
    "not matched",
  ],
  [
    "Master xpub",
    { kind: "master-xpub", value: KEYS.rootXpub, network: "mainnet" },
    "matched at m",
  ],
  [
    "Master ypub",
    { kind: "master-xpub", value: KEYS.rootYpub, network: "mainnet" },
    "matched at m",
  ],
  [
    "Master zpub",
    { kind: "master-xpub", value: KEYS.rootZpub, network: "mainnet" },
    "matched at m",
  ],
  [
    "Master tpub",
    { kind: "master-xpub", value: KEYS.rootTpub, network: "testnet" },
    "matched at m",
  ],
  [
    "Another master key",
    { kind: "master-xpub", value: KEYS.account84Zpub, network: "mainnet" },
    "not matched",
  ],
  [
    "Account zpub",
    located("account-xpub", KEYS.account84Zpub, ["native-segwit"]),
    "matched at m/84'/0'/0'",
  ],
  [
    "Account xpub of Taproot",
    located("account-xpub", KEYS.account86Xpub, ["taproot"]),
    "matched at m/86'/0'/0'",
  ],
  [
    "Testnet account upub",
    located("account-xpub", KEYS.account49TestnetUpub, ["nested-segwit"], "testnet"),
    "matched at m/49'/1'/0'",
  ],
  [
    "Legacy address",
    located("address", KEYS.address44, bitcoinProfiles),
    "matched at m/44'/0'/0'/0/0",
  ],
  [
    "Nested SegWit address",
    located("address", KEYS.address49, bitcoinProfiles),
    "matched at m/49'/0'/0'/0/0",
  ],
  [
    "Native SegWit address",
    located("address", KEYS.address84, bitcoinProfiles),
    "matched at m/84'/0'/0'/0/0",
  ],
  [
    "Taproot address",
    located("address", KEYS.address86, bitcoinProfiles),
    "matched at m/86'/0'/0'/0/0",
  ],
  [
    "Address in another profile",
    located("address", KEYS.address86, ["legacy", "nested-segwit", "native-segwit"]),
    "not matched",
  ],
  [
    "Compressed public key",
    located("compressed-public-key", KEYS.publicKey84, ["native-segwit"]),
    "matched at m/84'/0'/0'/0/0",
  ],
  ["WIF", located("wif", KEYS.wif84, ["native-segwit"]), "matched at m/84'/0'/0'/0/0"],
  ["Another WIF", located("wif", KEY_ONE_WIF, bitcoinProfiles), "not matched"],
  [
    "Address with the passphrase TREZOR",
    located("address", KEYS.trezorAddress84, ["native-segwit"]),
    "matched at m/84'/0'/0'/0/0",
    VECTOR_PASSPHRASE,
  ],
  [
    "Address without its passphrase",
    located("address", KEYS.trezorAddress84, ["native-segwit"]),
    "not matched",
  ],
  ["Second address at the first place only", scanned(KEYS.second84, undefined), "not matched"],
  [
    "Second address among the first twenty",
    scanned(KEYS.second84, 20),
    "matched at m/84'/0'/0'/0/1",
  ],
  ["Second address, scanned from the third", scanned(KEYS.second84, 20, 2), "not matched"],
];

/** Evidence that no wallet can match, refused before any key is derived, and why. */
const REFUSED: readonly (readonly [string, WalletEvidence, RegExp])[] = [
  [
    "A public key that is not compressed",
    located("compressed-public-key", `04${KEYS.publicKey84.slice(2)}`, ["native-segwit"]),
    /must start with 02 or 03/u,
  ],
  [
    "A public key off the curve",
    located("compressed-public-key", `02${"0".repeat(64)}`, ["native-segwit"]),
    /not a point of the secp256k1 curve/u,
  ],
  [
    "A script address",
    located("address", SCRIPT_ADDRESS, ["native-segwit"]),
    /not the address of a single key/u,
  ],
  [
    "A testnet address on mainnet",
    located("address", TESTNET_ADDRESS, ["native-segwit"]),
    /it is a testnet address/u,
  ],
  [
    "A testnet key on mainnet",
    { kind: "master-xpub", value: KEYS.rootTpub, network: "mainnet" },
    /does not match the selected Bitcoin network/u,
  ],
  ["No address to scan", scanned(KEYS.second84, 0), /number of addresses compared/u],
  [
    "A scan past the last index",
    scanned(KEYS.second84, 2, 0x7fffffff),
    /would pass index 2147483647/u,
  ],
];

/** Every check: the quick ones, every kind of evidence, and the evidence refused. */
function checkWalletEvidence(): void {
  checkWalletEvidenceStartup();
  for (const [name, evidence, expected, passphrase] of MATCHES)
    expectSame(matchOf(evidence, passphrase), expected, name);
  for (const [name, evidence, because] of REFUSED)
    expectRefused(() => matchOf(evidence), because, name);
}

/** The checks of Bitcoin wallet evidence, for a host that builds it in. */
export const WALLET_EVIDENCE_SELF_TEST: SelfTestFeature = selfTestFeature({
  name: "Wallet evidence",
  detail: "fingerprint, xpubs, four profiles, key, WIF, address scan, refusals",
  startup: checkWalletEvidenceStartup,
  run: checkWalletEvidence,
});
