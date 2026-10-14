// AUD-026 functional: Discovery Scanner probes with synthetic provider answers (no network).
// Production entry points: AddressBook/scanBranch (address-book.ts), extendAddressTarget
// (address-gap.ts), scanDashPlatformAddresses (platform-scanner.ts) and the Ethereum seed adapter.
// Each probe states the contract it checks; a probe named "DEFECT" asserts the observed defective
// behaviour so that the run documents it, and its expected contract is in the comment.
import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex, hash160 } from "@ckd/core/crypto.js";
import { BIP32_BRANCH_SIZE } from "@ckd/core/bip32-limits.js";
import { encodePlatformP2pkh } from "@ckd/coins/dash/platform.js";
import {
  AddressBook,
  scanBranch,
  scanBranches,
} from "../../../apps/discovery-scanner/src/address-book.js";
import {
  ADDRESS_DISCOVERY_GAP,
  extendAddressTarget,
} from "../../../apps/discovery-scanner/src/address-gap.js";
import { scanDashPlatformAddresses } from "../../../apps/discovery-scanner/src/coins/dash/platform-scanner.js";
import type { DashPlatformClient } from "../../../apps/discovery-scanner/src/coins/dash/platform-client.js";
import { ETHEREUM_SEED_RECOVERY_ADAPTER } from "../../../apps/discovery-scanner/src/coins/ethereum/seed.js";
import type { RecoveryScanConfig } from "../../../apps/discovery-scanner/src/types.js";

const ABANDON = `${"abandon ".repeat(11)}about`;

/** A synthetic branch: index -> state; every other index is unused. */
function syntheticBranch(used: Record<number, { balance: bigint; tx: number }>) {
  const asked: string[] = [];
  const book = new AddressBook<{ balance: bigint; tx: number }>({
    lookUp: async (addresses) => {
      asked.push(...addresses);
      return addresses.map((a) => used[Number(a.split(":")[1])] ?? { balance: 0n, tx: 0 });
    },
    balance: (s) => s.balance,
    used: (s) => s.tx > 0 || s.balance > 0n,
  });
  return { book, asked };
}

describe("AUD-026 functional discovery: gap, sparse indexes, dedup", () => {
  it("extends the gap from the last used index and stops after 20 empty addresses", async () => {
    const { book, asked } = syntheticBranch({
      0: { balance: 5n, tx: 1 },
      25: { balance: 7n, tx: 1 },
    });
    const shown: number[] = [];
    const checked = await scanBranch({
      initial: 20,
      batchSize: 7,
      signal: new AbortController().signal,
      cancelled: "x",
      derive: (index) => ({ address: `a:${index}`, index }),
      lookUp: book.lookUpWith({ includeUsedZeroBalance: false }),
      show: ({ derived }) => shown.push(derived.index),
      progress: () => {},
    });
    // Used index 0 extends the target to 0 + 1 + 20 = 21. The sparse used index 25 lies beyond
    // it, so it is not reached: the documented 20-address gap rule, not a defect.
    expect(checked).toBe(21);
    expect(shown).toEqual([0]);
    expect(asked.length).toBe(21);
    expect(book.balance).toBe(5n);
  });

  it("reaches a used index inside the gap and keeps a full gap after it", async () => {
    const { book } = syntheticBranch({ 19: { balance: 1n, tx: 1 }, 39: { balance: 2n, tx: 1 } });
    const checked = await scanBranch({
      initial: 20,
      batchSize: 100,
      signal: new AbortController().signal,
      cancelled: "x",
      derive: (index) => ({ address: `a:${index}`, index }),
      lookUp: book.lookUpWith({ includeUsedZeroBalance: false }),
      show: () => {},
      progress: () => {},
    });
    expect(checked).toBe(39 + 1 + ADDRESS_DISCOVERY_GAP);
    expect(book.funded).toBe(2);
    expect(book.balance).toBe(3n);
  });

  it("counts an address reached by two profiles once and keeps per-profile gaps", async () => {
    const { book, asked } = syntheticBranch({ 3: { balance: 10n, tx: 2 } });
    const total = await scanBranches([0, 1], () => ({
      initial: 5,
      batchSize: 5,
      signal: new AbortController().signal,
      cancelled: "x",
      derive: (index) => ({ address: `a:${index}`, index }),
      lookUp: book.lookUpWith({ includeUsedZeroBalance: true }),
      show: () => {},
      progress: () => {},
    }));
    expect(total).toBe(2 * (3 + 1 + ADDRESS_DISCOVERY_GAP));
    expect(asked.length).toBe(3 + 1 + ADDRESS_DISCOVERY_GAP); // second profile asks nothing new
    expect(book.balance).toBe(10n);
    expect(book.funded).toBe(1);
    expect(book.queried).toBe(24);
  });

  it("refuses a provider batch that drops an address (missing never becomes zero)", async () => {
    const book = new AddressBook<{ balance: bigint }>({
      lookUp: async (addresses) => addresses.slice(1).map(() => ({ balance: 0n })),
      balance: (s) => s.balance,
      used: () => false,
    });
    await expect(book.states(["x", "y"])).rejects.toThrow(/result count/u);
  });

  it("caps a target at the end of the BIP32 index space and reports truncation", () => {
    expect(extendAddressTarget(20, 5)).toEqual({ target: 26, truncated: false });
    expect(extendAddressTarget(20, BIP32_BRANCH_SIZE - 21)).toEqual({
      target: BIP32_BRANCH_SIZE,
      truncated: false,
    });
    expect(extendAddressTarget(20, BIP32_BRANCH_SIZE - 20)).toEqual({
      target: BIP32_BRANCH_SIZE,
      truncated: true,
    });
  });
});

/** The storage keys of the first `count` DIP17 receive/internal addresses, from an independent path. */
function platformOracle(count: number) {
  const seed = mnemonicToSeed(ABANDON);
  const root = HDKey.fromMasterSeed(seed);
  const byAddress = new Map<string, { storage: string; keyClass: number; index: number }>();
  for (const keyClass of [0, 1]) {
    const node = root.derive(`m/9'/5'/17'/0'/${keyClass}'`);
    for (let index = 0; index < count; index += 1) {
      const hash = hash160(node.deriveChild(index).publicKey!);
      byAddress.set(encodePlatformP2pkh(hash, "dash"), {
        storage: `00${bytesToHex(hash)}`,
        keyClass,
        index,
      });
    }
  }
  return { seed, byAddress };
}

async function platformScan(entries: (addresses: string[]) => Array<[string, unknown]>) {
  const { seed } = platformOracle(1);
  const client = {
    addresses: async (addresses: string[]) => ({
      entries: entries(addresses),
      metadata: { height: "100", protocolVersion: 1 },
    }),
    addressHistory: async () => {
      throw new Error("fixture: no history");
    },
  } as unknown as DashPlatformClient;
  return scanDashPlatformAddresses(
    "probe",
    seed,
    {
      network: "mainnet",
      account: 0,
      platformAddressCount: 3,
      includeUsedZeroBalance: false,
    } as RecoveryScanConfig,
    client,
    new AbortController().signal,
    () => {},
    () => {},
  );
}

describe("AUD-026 functional discovery: Platform proof batches", () => {
  const { byAddress } = platformOracle(30);
  const funded = [...byAddress.entries()].find(([, v]) => v.keyClass === 0 && v.index === 1)!;

  it("control: every requested key present, the funded one found", async () => {
    const section = await platformScan((addresses) =>
      addresses.map((address) => {
        const entry = byAddress.get(address)!;
        return [entry.storage, address === funded[0] ? { balance: "1000", nonce: "1" } : null] as [
          string,
          unknown,
        ];
      }),
    );
    expect(section.state).toBe("complete");
    expect(section.findings.map((f) => f.title)).toEqual([funded[0]]);
  });

  it("DEFECT: a batch that omits the funded address is reported complete with zero", async () => {
    // Contract (FULL_AUDIT_GUIDE CHECK-FUN-007; types.ts "Null means unavailable, never zero"):
    // a response must answer every requested resource; a missing answer must not become an
    // unused, zero-balance address in a "complete" section. Observed: it does.
    const section = await platformScan((addresses) =>
      addresses
        .filter((address) => address !== funded[0])
        .map((address) => [byAddress.get(address)!.storage, null] as [string, unknown]),
    );
    expect(section.state).toBe("complete");
    expect(section.findings).toEqual([]);
    expect(section.metrics[0]!.value).toMatch(/^0(\.0+)? DASH/u);
    expect(section.warning).toBeUndefined();
  });

  it("DEFECT: an empty entry list for every batch is reported complete with zero", async () => {
    const section = await platformScan(() => []);
    expect(section.state).toBe("complete");
    expect(section.scanned).toBe(6);
  });

  it("observation: an unrequested storage key in the answer is ignored", async () => {
    const section = await platformScan((addresses) => [
      ...addresses.map((address) => [byAddress.get(address)!.storage, null] as [string, unknown]),
      [`00${"11".repeat(20)}`, { balance: "5", nonce: "0" }],
    ]);
    expect(section.state).toBe("complete");
    expect(section.findings).toEqual([]);
  });
});

describe("AUD-026 functional discovery: Ethereum Ledger Live profile at the end of the index space", () => {
  it("DEFECT probe: a used Ledger Live account near 2^31 shortens the gap without a warning", async () => {
    // Ledger Live derives m/44'/60'/(account + index)'/0/0, so its maximum count is
    // BIP32_BRANCH_SIZE - account (seed.ts). AddressBook caps the target at that maximum after
    // AddressGapTracker extended it, but only the tracker's own end-of-space test sets the
    // warning, so a cap by `maximum` is silent.
    const account = BIP32_BRANCH_SIZE - 25;
    const usedLedgerIndex = 10; // path account' = 2^31 - 15
    const evmAccounts = async (_network: string, addresses: string[]) => ({
      blockNumber: "100",
      entries: addresses.map((address) => ({
        address,
        balance: "0",
        nonce: address === ledgerUsed ? "1" : "0",
      })),
    });
    // The address of m/44'/60'/(account + 10)'/0/0, computed independently with @scure/bip32 and
    // the production EIP-55 encoder's input (a key, not the scanner's derivation).
    const seed = mnemonicToSeed(ABANDON);
    const root = HDKey.fromMasterSeed(seed);
    const { ethereumAddressOfKey } = await import("@ckd/coins/ethereum/index.js");
    const ledgerUsed = ethereumAddressOfKey(
      root.derive(`m/44'/60'/${account + usedLedgerIndex}'/0/0`).publicKey!,
    );
    const progress: string[] = [];
    const result = await ETHEREUM_SEED_RECOVERY_ADAPTER.scan(
      { id: "probe", label: "probe", kind: "seed", mnemonic: ABANDON, passphrase: "" } as never,
      {
        network: "mainnet",
        account,
        coreReceiveCount: 20,
        includeUsedZeroBalance: true,
      } as RecoveryScanConfig,
      {
        signal: new AbortController().signal,
        networkApi: { evmAccounts } as never,
        onProgress: (p: { message: string }) => progress.push(p.message),
        onFinding: () => {},
      } as never,
    );
    const section = result.sections[0]!;
    const ledgerChecked = progress.filter((m) => m.startsWith("Ledger Live")).at(-1);
    // Expected: target 10 + 1 + 20 = 31 addresses, or a warning that the gap was cut to 14.
    expect(ledgerChecked).toBe("Ledger Live accounts: checked 25 of 25 derivation candidates");
    expect(section.state).toBe("complete");
    expect(section.warning ?? "").not.toMatch(/gap/u);
    expect(section.findings.some((f) => f.title === ledgerUsed)).toBe(true);
  });
});
