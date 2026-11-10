import { describe, expect, it } from "vitest";
import {
  findDashArtifactViolations,
  findDashInspectorArtifactViolations,
} from "./verify-dash-community-artifacts.mjs";

describe("Dash Community artifact exclusion rules", () => {
  it("rejects non-Dash registrations, protocol copy, and branding", () => {
    expect(
      findDashArtifactViolations(
        "bitcoin-taproot Ethereum EOA · BIP44 Multi-Chain Wallet Tools BIP86",
      ),
    ).toEqual(
      expect.arrayContaining([
        "Bitcoin",
        "Bitcoin adapter registration",
        "Ethereum",
        "non-Dash protocol copy",
        "Multi-Chain branding",
      ]),
    );
  });

  it("rejects the single-key coins by name, CashAddr and the Zcash transparent adapter", () => {
    expect(findDashArtifactViolations("XRP Ledger · bitcoincash:q · zcash")).toEqual(
      expect.arrayContaining(["single-key coin", "Bitcoin Cash", "Zcash transparent adapter"]),
    );
    // Dash's Orchard notes name Zcash's protocol, which is not the transparent adapter.
    expect(findDashArtifactViolations("Orchard, the shielded pool Zcash designed")).toEqual([]);
  });

  it("rejects the EVM networks by name, endpoint and chain-id request, but not the word Base", () => {
    expect(
      findDashArtifactViolations("BNB Chain · Avalanche C-Chain · https://bsc-rpc.publicnode.com"),
    ).toEqual(["EVM network BNB Chain", "EVM network Avalanche C-Chain", "EVM endpoint"]);
    expect(findDashArtifactViolations('{"method":"eth_chainId"}')).toEqual(["EVM endpoint"]);
    expect(findDashArtifactViolations("Base58Check · Base URL")).toEqual([]);
  });

  it("leaves embedded base64 runs of 512 characters or more out of the word scan", () => {
    const pad = (length) => "A".repeat(length);
    // A word that falls inside a long run is binary by chance, as "+XRP/" might be.
    expect(findDashArtifactViolations(`x ${pad(300)}+XRP/${pad(300)}== y`)).toEqual([]);
    // A shorter run is text and is scanned.
    expect(findDashArtifactViolations(`x ${pad(200)}+XRP/${pad(200)} y`)).toEqual([
      "single-key coin",
    ]);
    // Words right before and after a run, and between two runs, are still read.
    expect(findDashArtifactViolations(`Tron ${pad(600)} Solana ${pad(600)}`)).toEqual([
      "single-key coin",
    ]);
    expect(findDashArtifactViolations(`${pad(600)} NEAR`)).toEqual(["single-key coin"]);
  });

  it("rejects Silent Payments labels outside the Inspector's refusal text", () => {
    expect(findDashArtifactViolations("Silent Payments BIP-352")).toContain("Silent Payments");
    expect(
      findDashInspectorArtifactViolations("<main>Silent Payments BIP352</main><script></script>"),
    ).toContain("Silent Payments");
  });

  it("permits only the protocol-defined BIP32 HMAC domain string", () => {
    expect(
      findDashArtifactViolations(
        'Uint8Array.from("Bitcoin seed".split("")) Uint8Array.from(`Bitcoin seed`.split(""))',
      ),
    ).toEqual([]);
    expect(findDashArtifactViolations("Visible Bitcoin wallet option")).toContain("Bitcoin");
  });

  it("rejects unknown adapter registrations without a chain-specific denylist", () => {
    expect(
      findDashArtifactViolations('var adapters=[{id:"solana",group:"Solana",label:"Wallet"}]'),
    ).toContain("non-Dash derivation adapter registration: solana");
    expect(
      findDashArtifactViolations(
        String.raw`var worker="[{id:\"future-coin\",group:\"Future Coin\",label:\"Wallet\"}]"`,
      ),
    ).toContain("non-Dash derivation adapter registration: future-coin");
    expect(
      findDashArtifactViolations(
        'var recovery={id:"cardano",label:"Cardano",networks:["mainnet"]}',
      ),
    ).toContain("non-Dash recovery adapter registration: cardano");
  });

  it("accepts only the explicit Dash adapter registrations", () => {
    expect(
      findDashArtifactViolations(
        'var adapters=[{id:"dash-core",group:"Dash"},{id:"dash-platform",group:"Dash"},' +
          '{id:"dash-identity",group:"Dash"},{id:"dash-shielded",group:"Dash"}];' +
          'var recovery={id:"dash",label:"Dash",networks:["mainnet","testnet"]}',
      ),
    ).toEqual([]);
  });

  it("applies a reviewed shared-decoder allowlist to the Dash Inspector", () => {
    const safe =
      '<main>Dash only</main><script>const labels = ["Bitcoin", "Taproot", "MuSig2", "rawtr", "multi_a", "P2TR", "P2WPKH"];</script>';
    expect(findDashInspectorArtifactViolations(safe)).toEqual([]);
    expect(
      findDashInspectorArtifactViolations(safe.replace("</script>", "keyAggregate();</script>")),
    ).toContain("Bitcoin MuSig2 aggregation implementation");
    expect(
      findDashInspectorArtifactViolations("<main>Ethereum wallet</main><script></script>"),
    ).toContain("Ethereum");
    expect(
      findDashInspectorArtifactViolations(
        `<main>Dash</main><script>${"Bitcoin ".repeat(72)}</script>`,
      ),
    ).toContain("Bitcoin shared-decoder terms exceed reviewed allowlist: 72 > 71");
  });
});
