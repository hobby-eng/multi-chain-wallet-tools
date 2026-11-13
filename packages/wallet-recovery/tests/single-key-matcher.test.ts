import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { detectMultiChainMatcherTargets } from "../src/matcher-targets-multichain.js";

// The first address of each single-key coin's variants for the public "abandon … about" phrase
// (packages/verification/src/derivation-self-test-*.ts), and the adapters that must derive it.
const KNOWN: readonly (readonly [string, readonly string[]])[] = [
  ["LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez", ["litecoin-legacy"]],
  ["M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXM", ["litecoin-nested-segwit"]],
  ["ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh", ["litecoin-native-segwit"]],
  ["DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC", ["dogecoin"]],
  [
    "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
    ["bitcoin-cash", "bitcoin-cash-coin-type-0"],
  ],
  ["t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F", ["zcash"]],
  ["rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3", ["xrp"]],
  ["TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH", ["tron"]],
  ["cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4", ["cosmos"]],
  ["inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz", ["injective"]],
  ["HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk", ["solana", "solana-ledger"]],
  ["GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX", ["stellar"]],
  ["5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412", ["near"]],
  [
    "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
    ["hedera"],
  ],
  // TON's Trust Wallet address; the Telegram wallet's key needs a TON phrase, which the Matcher's
  // BIP39 seeds are not.
  ["UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY", ["ton-trust", "ton-ledger"]],
];

const targetOf = (value: string, network: "mainnet" | "testnet" = "mainnet") =>
  detectMultiChainMatcherTargets(value, network, false)[0];

describe("single-key coins in the Wallet Matcher", () => {
  it("read each coin's address with its own adapters", () => {
    for (const [address, adapters] of KNOWN)
      expect([address, targetOf(address)?.adapterIds]).toEqual([address, adapters]);
  });

  it("compare CashAddr and bech32 forms in lower case, with the CashAddr prefix", () => {
    expect(targetOf("QQYX49MU0KKN9FTFJ6HJE6G2WFER34YFNQ5TAHQ3Q6")?.normalized).toBe(
      "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
    );
    expect(targetOf("LTC1QJMXNZ78NMC8NQ77WUXH25N2ES7RZM5C2RKK4WH")?.normalized).toBe(
      "ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh",
    );
  });

  it("give a 0x address to Ethereum, Ethereum Classic and Hedera's ECDSA keys alike", () => {
    expect(targetOf("0xFA22515E43658ce56A7682B801e9B5456f511420")?.adapterIds).toEqual([
      "ethereum",
      "ethereum-classic",
      "hedera-ecdsa",
    ]);
  });

  it("search a legacy 1… or 3… address under Bitcoin and under the coin whose rows show that form", () => {
    expect(targetOf("1mW6fDEMjKrDHvLvoEsaeLxSCzZBf3Bfg")?.adapterIds).toEqual([
      "bitcoin-legacy",
      "bitcoin-cash",
      "bitcoin-cash-coin-type-0",
    ]);
    expect(targetOf("31jkZShyVAMkVz5cQpu4qp73DrAXtFP3rZ")?.adapterIds).toEqual([
      "bitcoin-nested-segwit",
      "litecoin-nested-segwit",
    ]);
  });

  it("refuse a mistyped EIP-55 address and a Bitcoin Cash P2SH CashAddr", () => {
    // One character changed in a checksummed (mixed-case) address breaks its EIP-55 checksum.
    expect(() => targetOf("0xFA22515E43658ce56A7682B801e9B5456f511421")).toThrow(/not recognized/u);
    expect(targetOf("0xfa22515e43658ce56a7682b801e9b5456f511421")?.adapterIds).toContain(
      "ethereum",
    );
    // The CashAddr specification's P2SH example: a valid script address, not a key's, is refused.
    expect(() => targetOf("bitcoincash:ppm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq")).toThrow(
      /not recognized/u,
    );
  });

  it("read every form of a TON address as its non-bounceable UQ… form", () => {
    for (const form of [
      "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-U9d",
      "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9+U9d",
      "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9",
      "0:335996BA9CCE6625EBFDD7019CED50927C1A08B1846A289A55EFC37C01D77DF9",
    ])
      expect(targetOf(form)?.normalized).toBe("UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY");
    // A broken checksum, a testnet-only address and another workchain are refused.
    for (const refused of [
      "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKZ",
      "0QAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-akS",
      "-1:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9",
    ])
      expect(() => targetOf(refused)).toThrow(/not recognized/u);
  });

  it("refuse a Cardano mainnet address in plain words, since no Cardano key is searched", () => {
    // CIP-19's test vectors (cardano-foundation/CIPs @7720fed CIP-0019/README.md): a base, an
    // enterprise and a reward address.
    for (const address of [
      "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
      "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
      "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw",
    ])
      expect(() => targetOf(address)).toThrow(/cannot search Cardano addresses/u);
    // A testnet address, and a key text, are no mainnet address: not recognized, as before.
    expect(() =>
      targetOf("addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz", "testnet"),
    ).toThrow(/not recognized/u);
    expect(() =>
      targetOf("addr_vk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7st80zhd"),
    ).toThrow(/not recognized/u);
    expect(() => targetOf("addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl9")).toThrow(
      /not recognized/u,
    );
    // An addr1 text whose header names testnet (0x60) is no mainnet address either.
    const testnetHeader = Uint8Array.of(0x60, ...new Uint8Array(28));
    expect(() => targetOf(bech32.encode("addr", bech32.toWords(testnetHeader), false))).toThrow(
      /not recognized/u,
    );
  });

  it("refuse a line longer than any supported address before decoding it", () => {
    expect(() => targetOf("1".repeat(129))).toThrow(/longer than any supported address/u);
  });

  it("refuse a broken checksum of every coin and every single-key coin on testnet", () => {
    for (const broken of [
      "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ey",
      "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v4",
      "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q7",
      "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal5",
      "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYY",
      "M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXN",
      "ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wj",
      "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgD",
      "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7G",
      "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdJ",
      "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dy",
      "cosmos1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
    ])
      expect(() => targetOf(broken)).toThrow(/not recognized/u);
    expect(() => targetOf("DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC", "testnet")).toThrow(
      /not recognized/u,
    );
  });
});
