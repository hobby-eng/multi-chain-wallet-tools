import { describe, expect, it } from "vitest";
import { bech32, bech32m, createBase58check } from "@scure/base";
import { bytesToHex, hexToBytes, sha256 } from "@ckd/core/crypto.js";
import { getBitcoinNetwork, getDashNetwork } from "@ckd/core/networks.js";
import { descriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import { decodeDescriptor } from "../src/descriptor.js";
import { InspectorNetworkProfile } from "../src/network-profile.js";
import { describeScript } from "../src/psbt-presentation.js";
import { buildPolicy, policyHex } from "../src/policy.js";
import { buildCustomMiniscriptPolicy } from "../src/custom-miniscript.js";
import { bitcoinDescriptorDecoder } from "../src/self-test-bitcoin.js";
import { BIP67_KEYS, BIP67_SCRIPT } from "../src/self-test-checks.js";
import { BITCOIN_ADDRESS_VECTORS } from "../src/self-test-vectors-bitcoin.js";
import type { PsbtNetwork } from "../src/psbt-types.js";

const base58check = createBase58check(sha256);
const NETWORKS: readonly PsbtNetwork[] = ["mainnet", "testnet", "regtest"];
const EXPECTED_HRPS = { mainnet: "bc", testnet: "tb", regtest: "bcrt" } as const;
const WITNESS_HEADER_BYTES = 2; // Version opcode and direct program push.
const PUBLIC_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const GENESIS_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const GENESIS_SCRIPT = "76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";

function addressDescriptor(address: string): string {
  const body = `addr(${address})`;
  return `${body}#${descriptorChecksum(body)}`;
}

function compiledRows(address: string, network: PsbtNetwork = "mainnet") {
  const decoded = decodeDescriptor(addressDescriptor(address), { chain: "bitcoin", network });
  expect(decoded.compiledOutput).not.toBeNull();
  return Object.fromEntries(decoded.compiledOutput!.rows.map(({ label, value }) => [label, value]));
}

describe("AUD-028-FUN001 address descriptors and the shared Inspector profile", () => {
  it.each(Object.values(BITCOIN_ADDRESS_VECTORS))(
    "compiles the published address $address to its exact script",
    ({ address, script }) => {
      expect(compiledRows(address)).toMatchObject({ Address: address, scriptPubKey: script });
      expect(describeScript(hexToBytes(script), "bitcoin", "mainnet").address).toBe(address);
    },
  );

  it("preserves the public genesis Base58 control", () => {
    expect(compiledRows(GENESIS_ADDRESS)).toMatchObject({
      Address: GENESIS_ADDRESS,
      scriptPubKey: GENESIS_SCRIPT,
      "Output type": "P2PKH",
    });
    expect(() => compiledRows(GENESIS_ADDRESS, "testnet")).toThrow(/does not belong/u);
  });

  it.each(NETWORKS)("uses the exact %s HRP for both witness checksum families", (network) => {
    for (const [version, vector] of [
      [0, BITCOIN_ADDRESS_VECTORS.witnessV0],
      [1, BITCOIN_ADDRESS_VECTORS.taproot],
    ] as const) {
      const program = hexToBytes(vector.script).subarray(WITNESS_HEADER_BYTES);
      const encoding = version === 0 ? bech32 : bech32m;
      // Explicit expected HRPs and published program bytes are independent of
      // the profile's choice. The mainnet answer is also pinned as a literal.
      const address = encoding.encode(EXPECTED_HRPS[network], [
        version,
        ...encoding.toWords(program),
      ]);
      expect(compiledRows(address, network)).toMatchObject({
        Address: address,
        scriptPubKey: vector.script,
        "Witness version": String(version),
      });
      for (const other of NETWORKS.filter((candidate) => candidate !== network))
        expect(() => compiledRows(address, other)).toThrow(/does not belong/u);
    }
  });

  it("refuses the wrong witness checksum family, corruption, mixed case and bad padding", () => {
    const taproot = BITCOIN_ADDRESS_VECTORS.taproot;
    const v0 = BITCOIN_ADDRESS_VECTORS.witnessV0;
    for (const [version, script, wrongEncoding] of [
      [1, taproot.script, bech32],
      [0, v0.script, bech32m],
    ] as const) {
      const program = hexToBytes(script).subarray(WITNESS_HEADER_BYTES);
      const wrongFamily = wrongEncoding.encode("bc", [version, ...wrongEncoding.toWords(program)]);
      expect(() => compiledRows(wrongFamily)).toThrow(/checksum/iu);
    }
    expect(() => compiledRows(`${taproot.address.slice(0, -1)}q`)).toThrow(/checksum/iu);
    expect(() => compiledRows(`bC${taproot.address.slice(2)}`)).toThrow();
    // A nonzero final padding bit must never be silently truncated.
    expect(() => compiledRows(bech32m.encode("bc", [1, 1]))).toThrow();
    expect(compiledRows(taproot.address.toUpperCase()).Address).toBe(taproot.address);
  });

  it.each([
    [17, 32],
    [0, 2],
    [1, 1],
    [1, 41],
  ] as const)("refuses witness version %i with a %i-byte program", (version, length) => {
    const encoding = version === 0 ? bech32 : bech32m;
    const address = encoding.encode("bc", [version, ...encoding.toWords(new Uint8Array(length))]);
    expect(() => compiledRows(address)).toThrow(/version|length/u);
  });

  it("preserves outer descriptor checksum checks and public-key-only policy admission", () => {
    const body = addressDescriptor(BITCOIN_ADDRESS_VECTORS.taproot.address);
    const corrupted = body.slice(0, -1) + (body.endsWith("q") ? "p" : "q");
    expect(() => decodeDescriptor(corrupted)).toThrow(/descriptor checksum/iu);
    // Deliberately invalid synthetic tokens, never real extended private keys.
    expect(() => decodeDescriptor("wpkh(xprvTESTONLY)")).toThrow();
    expect(() =>
      buildPolicy({
        chain: "bitcoin",
        network: "mainnet",
        publicKeys: ["xprvTESTONLY"],
        required: 1,
        lockKind: "none",
        lockValue: 0,
        bitcoinWrapper: "p2wsh",
      }),
    ).toThrow(/public key/iu);
  });

  it("retains Dash coin exclusions", () => {
    const profile = new InspectorNetworkProfile("dash", "testnet");
    expect(() => profile.witnessAddress(1, new Uint8Array(32))).toThrow(/unavailable/u);
    expect(() => profile.signerNetwork).toThrow(/unavailable/u);
    for (const descriptor of [`tr(${PUBLIC_KEY.slice(2)})`, `wpkh(${PUBLIC_KEY})`])
      expect(() => decodeDescriptor(descriptor, { chain: "dash" })).toThrow(/unavailable/u);
    expect(
      describeScript(hexToBytes(BITCOIN_ADDRESS_VECTORS.taproot.script), "dash", "testnet").address,
    ).toBeNull();
  });

  it("includes positives and refusals in the startup check reused by the full self-test", () => {
    expect(() => bitcoinDescriptorDecoder.run()).not.toThrow();
  });
});

describe("Inspector encoding ownership across policies, scripts and descriptors", () => {
  it("matches the public generator-key mainnet address literals for both coins", () => {
    const hash = hexToBytes("751e76e8199196d454941c45d1b3a323f1433bd6");
    expect(new InspectorNetworkProfile("bitcoin", "mainnet").p2pkhAddress(hash)).toBe(
      "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
    );
    expect(new InspectorNetworkProfile("dash", "mainnet").p2pkhAddress(hash)).toBe(
      "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
    );
  });

  it.each(NETWORKS)("uses crypto-core's Base58 and BIP32 facts on %s", (network) => {
    const coreName = network === "mainnet" ? "mainnet" : "testnet";
    for (const chain of ["bitcoin", "dash"] as const) {
      const facts = chain === "bitcoin" ? getBitcoinNetwork(coreName) : getDashNetwork(coreName);
      const profile = new InspectorNetworkProfile(chain, network);
      expect(profile.versions).toEqual(facts.versions);
      const publicKeyHash = hexToBytes("751e76e8199196d454941c45d1b3a323f1433bd6");
      const address = profile.p2pkhAddress(publicKeyHash);
      expect(base58check.decode(address)).toEqual(Uint8Array.of(facts.p2pkh, ...publicKeyHash));
      const policy = buildPolicy({
        chain,
        network,
        required: 2,
        publicKeys: BIP67_KEYS,
        keyOrder: "bip67",
        lockKind: "none",
        lockValue: 0,
        bitcoinWrapper: "p2sh",
      });
      expect(policyHex(policy).redeemScript).toBe(BIP67_SCRIPT);
      expect(base58check.decode(policy.address)[0]).toBe(facts.p2sh);
      expect(describeScript(policy.scriptPubKey, chain, network).address).toBe(policy.address);
      if (chain === "bitcoin") {
        expect(profile.signerNetwork).toMatchObject({
          bech32: EXPECTED_HRPS[network],
          pubKeyHash: facts.p2pkh,
          scriptHash: facts.p2sh,
          wif: facts.wif,
        });
        expect(compiledRows(policy.address, network).scriptPubKey).toBe(
          bytesToHex(policy.scriptPubKey),
        );
      }
    }
  });

  it.each(NETWORKS)("keeps P2WSH and both Taproot compiler paths aligned on %s", (network) => {
    // The preset is multisig even for one key; pk() uses CHECKSIG and commits
    // to a different script than multi(1,...) with CHECKMULTISIG.
    const witnessMiniscript = `multi(1,${PUBLIC_KEY})`;
    const witness = buildCustomMiniscriptPolicy(witnessMiniscript, "p2wsh", network);
    const tapscript = buildCustomMiniscriptPolicy(
      `pk(${PUBLIC_KEY.slice(2)})`,
      "tapscript",
      network,
    );
    const policy = buildPolicy({
      chain: "bitcoin",
      network,
      required: 1,
      publicKeys: [PUBLIC_KEY],
      lockKind: "none",
      lockValue: 0,
      bitcoinWrapper: "p2wsh",
    });
    // Literal Script encoding: OP_1, a 33-byte key push, OP_1, CHECKMULTISIG.
    const expectedWitnessScript = hexToBytes(`5121${PUBLIC_KEY}51ae`);
    expect(policy.miniscript).toBe(witnessMiniscript);
    expect(policy.redeemScript).toEqual(expectedWitnessScript);
    expect(witness.script).toEqual(expectedWitnessScript);
    expect(policy.scriptPubKey).toEqual(witness.scriptPubKey);
    expect(policy.address).toBe(witness.address);
    for (const compiled of [witness, tapscript]) {
      expect(describeScript(compiled.scriptPubKey, "bitcoin", network).address).toBe(
        compiled.address,
      );
      const descriptor = decodeDescriptor(compiled.descriptor, { chain: "bitcoin", network });
      expect(descriptor.compiledOutput?.rows).toContainEqual({
        label: "scriptPubKey",
        value: bytesToHex(compiled.scriptPubKey),
      });
      expect(compiledRows(compiled.address, network).scriptPubKey).toBe(
        bytesToHex(compiled.scriptPubKey),
      );
    }
    for (const body of [`rawtr(${PUBLIC_KEY.slice(2)})`, `tr(${PUBLIC_KEY.slice(2)})`]) {
      const decoded = decodeDescriptor(body, { chain: "bitcoin", network });
      const rows = Object.fromEntries(
        decoded.compiledOutput!.rows.map(({ label, value }) => [label, value]),
      );
      expect(rows.Address).toMatch(new RegExp(`^${EXPECTED_HRPS[network]}1p`, "u"));
      expect(compiledRows(rows.Address!, network).scriptPubKey).toBe(rows.scriptPubKey);
    }
  });
});
