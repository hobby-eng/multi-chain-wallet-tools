import { describe, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import type { DerivationResult } from "@ckd/core/types.js";
import * as registry from "../src/coins/registry.js";
import * as dashRegistry from "../src/coins/dash-registry.js";
import { createCoinRegistry, resolveCoinProtocol } from "../src/coins/registry-base.js";
import { getRuntimeCoinAdapter } from "../src/coins/runtime-registry.js";
import { getRuntimeCoinAdapter as getDashRuntimeCoinAdapter } from "../src/coins/dash-runtime-registry.js";
import { DashRuntimeRegistry } from "../src/coins/dash/runtime.js";
import { deriveDashIdentityAuthenticationKey } from "../src/coins/dash/identity.js";
import {
  matcherSearchBranches,
  matcherSearchTargets,
} from "../../../apps/key-derivation/src/ui/matcher-search-scope.js";
import type { WalletMatcherTargetDetector } from "@ckd/recovery/matcher-types.js";

// Literal paths follow BIP44/49/84/86 and DIP9/13/17. No expected path is built by a profile.
const PATHS = [
  ["bitcoin-legacy", "m/44'/1'/2147483647'/1", false],
  ["bitcoin-nested-segwit", "m/49'/1'/2147483647'/1", false],
  ["bitcoin-native-segwit", "m/84'/1'/2147483647'/1", false],
  ["bitcoin-taproot", "m/86'/1'/2147483647'/1", false],
  ["ethereum", "m/44'/60'/2147483647'/1", false],
  ["dash-core", "m/44'/1'/2147483647'/1", false],
  ["dash-core-coinjoin", "m/9'/1'/4'/2147483647'/1", false],
  ["dash-legacy-mobile", "m/2147483647'/1", false],
  ["dash-multisig-p2sh", "m/48'/1'/2147483647'/0'/1", false],
  ["dash-multisig-core-pkh", "m/44'/1'/2147483647'/1", false],
  ["dash-platform", "m/9'/1'/17'/2147483647'/1'", true],
] as const;

describe("protocol path policy", () => {
  it.each(PATHS)(
    "%s shares its preview and actual boundary derivation path",
    async (id, branchPath, hardenedBranch) => {
      const input = {
        network: "testnet" as const,
        account: MAX_BIP32_INDEX,
        branch: 1,
        start: MAX_BIP32_INDEX,
        count: 1,
      };
      const metadata = resolveCoinProtocol(registry, id)!;
      const expected = `${branchPath}/2147483647`;
      expect(metadata.pathPreview(input)).toBe(expected);
      expect(metadata.pathPreview({ ...input, start: MAX_BIP32_INDEX - 1, count: 2 })).toBe(
        `${branchPath}/2147483646…2147483647`,
      );
      const derive = vi.spyOn(HDKey.prototype, "derive");
      const deriveChild = vi.spyOn(HDKey.prototype, "deriveChild");
      // Synthetic bytes only; no mnemonic conversion or KDF.
      const seed = new Uint8Array(64).fill(1);
      let result: DerivationResult | null = null;
      try {
        result = await getRuntimeCoinAdapter(id).derive({ ...input, seed });
        expect(result.rows[0]?.path).toBe(expected);
        const requested = hardenedBranch
          ? branchPath
          : branchPath.slice(0, branchPath.lastIndexOf("/"));
        expect(derive.mock.calls.some(([path]) => path === requested)).toBe(true);
        expect(deriveChild.mock.calls.some(([index]) => index === MAX_BIP32_INDEX)).toBe(true);
        expect(() => getRuntimeCoinAdapter(id).derive({ ...input, seed, branch: 2 })).toThrow();
        expect(() => getRuntimeCoinAdapter(id).derive({ ...input, seed, count: 2 })).toThrow();
      } finally {
        clearDerivationResult(result);
        seed.fill(0);
        derive.mockRestore();
        deriveChild.mockRestore();
      }
    },
  );

  it("preserves Identity's hardened indices and Shielded's uint32 diversifier range", () => {
    const input = { network: "mainnet" as const, account: 7, branch: 1, start: 8, count: 2 };
    expect(registry.getCoinAdapter("dash-identity").pathPreview(input)).toBe(
      "m/9'/5'/5'/0'/0'/{8'…9'}/{0'…3'}",
    );
    expect(
      registry.getCoinAdapter("dash-shielded").pathPreview({
        ...input,
        start: 0xffff_ffff,
        count: 1,
      }),
    ).toBe("m/32'/5'/7' · external diversifier 4294967295");
    expect(registry.getCoinAdapter("ethereum").pathPreview(input)).toBe("m/44'/60'/7'/1/8…9");
    expect(registry.getCoinAdapter("ethereum").pathPreview({ ...input, network: "testnet" })).toBe(
      "m/44'/60'/7'/1/8…9",
    );
  });

  it.each([
    ["mainnet", "m/9'/5'/5'/0'/0'/2147483647'/2147483647'"],
    ["testnet", "m/9'/1'/5'/0'/0'/2147483647'/2147483647'"],
  ] as const)("requests the exact Identity boundary key path on %s", (network, expected) => {
    const seed = new Uint8Array(64).fill(1);
    const root = HDKey.fromMasterSeed(seed, getDashNetwork(network).versions);
    const derive = vi.spyOn(root, "derive");
    const key = deriveDashIdentityAuthenticationKey(
      root,
      network,
      MAX_BIP32_INDEX,
      MAX_BIP32_INDEX,
    );
    try {
      expect(key.path).toBe(expected);
      expect(derive).toHaveBeenCalledWith(expected);
      expect(() => deriveDashIdentityAuthenticationKey(root, network, MAX_BIP32_INDEX + 1)).toThrow(
        /Identity index/u,
      );
      expect(() =>
        deriveDashIdentityAuthenticationKey(root, network, 0, MAX_BIP32_INDEX + 1),
      ).toThrow(/Identity key index/u);
    } finally {
      key.privateKey.fill(0);
      key.publicKey.fill(0);
      key.publicKeyHash.fill(0);
      root.wipePrivateData();
      derive.mockRestore();
      seed.fill(0);
    }
  });
});

describe("optional protocol metadata", () => {
  it("resolves CoinJoin preview, labels and branches identically in both editions", () => {
    for (const [metadataRegistry, runtime] of [
      [registry, getRuntimeCoinAdapter],
      [dashRegistry, getDashRuntimeCoinAdapter],
    ] as const) {
      const protocol = resolveCoinProtocol(metadataRegistry, "dash-core-coinjoin")!;
      expect(protocol.label).toBe("Dash Mobile CoinJoin · DIP9");
      expect(
        protocol.pathPreview({ network: "mainnet", account: 7, branch: 0, start: 2, count: 1 }),
      ).toBe("m/9'/5'/4'/7'/0/2");
      expect(
        protocol.pathPreview({ network: "testnet", account: 7, branch: 1, start: 2, count: 1 }),
      ).toBe("m/9'/1'/4'/7'/1/2");
      expect(runtime(protocol.id).label).toBe(protocol.label);
      expect(runtime(protocol.id).pathPreview(protocol.defaults)).toBe(
        protocol.pathPreview(protocol.defaults),
      );
      expect(matcherSearchBranches(protocol, false)).toEqual([0]);
      expect(matcherSearchBranches(protocol, true)).toEqual([0, 1]);
    }
  });

  it("uses optional protocol metadata for scope without a CoinJoin-specific remapping", () => {
    const core = registry.getCoinAdapter("dash-core");
    const scoped = createCoinRegistry([
      {
        ...core,
        coinJoin: {
          ...core.coinJoin!,
          workerAdapterId: "optional-chain",
          label: "Optional chain",
        },
      },
    ]);
    const detector: WalletMatcherTargetDetector = () => [
      {
        id: "address-1",
        input: "synthetic",
        normalized: "synthetic",
        network: "mainnet",
        adapterIds: ["optional-chain"],
      },
    ];
    expect(
      matcherSearchTargets("synthetic", "mainnet", detector, scoped, "dash", false)[0]?.adapterIds,
    ).toEqual(["optional-chain"]);
    expect(resolveCoinProtocol(scoped, "optional-chain")?.label).toBe("Optional chain");
    const excluded = createCoinRegistry([]);
    expect(resolveCoinProtocol(excluded, "dash-core-coinjoin")).toBeUndefined();
    expect(() => DashRuntimeRegistry.adapter("dash-core-coinjoin", excluded)).toThrow(
      /Unsupported/u,
    );
    const withoutOptionalCore = { ...core };
    delete withoutOptionalCore.coinJoin;
    const withoutOptional = createCoinRegistry([withoutOptionalCore]);
    expect(resolveCoinProtocol(withoutOptional, "dash-core-coinjoin")).toBeUndefined();
  });
});
