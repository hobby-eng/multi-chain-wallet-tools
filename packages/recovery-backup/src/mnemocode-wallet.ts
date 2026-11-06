// How a MnemoCode search, a restore of shares or a re-encoding recognises the wallet among its
// candidates: the person's description of the wallet (WalletEvidence, plain data that a worker is
// given), turned into MnemoCode's own evidence (WalletEvidence of its WebAssembly), which checks it
// when it is made and compares each candidate with it. MnemoCode reads an address as every coin
// whose form it has, and a Bitcoin key's address types from its form. The coins compared are those
// of this page's MnemoCode file, or of a selective build only its own (mnemocode-offered-coins.ts).
import type { MnemoCodeBinding } from "./mnemocode-engine.js";
import { COIN_WORDS, OFFERED_COIN_IDS } from "./mnemocode-offered-coins.js";

export type BitcoinNetworkName = "mainnet" | "testnet";

/** The place of a key: the account, the branch and the index of its path. */
export interface AddressLocation {
  readonly account: number;
  readonly branch: number;
  readonly index: number;
}

/** A place of a Bitcoin key, with its network. */
export interface DerivationLocation extends AddressLocation {
  readonly network: BitcoinNetworkName;
}

interface KeyAtPlace<K extends string> {
  readonly kind: K;
  readonly value: string;
  readonly location: DerivationLocation;
}

interface ScannedKey<K extends string> extends KeyAtPlace<K> {
  /** How many addresses are compared from the place on; MnemoCode's default where left out. */
  readonly addresses?: number;
}

interface NetworkKey<K extends string> {
  readonly kind: K;
  readonly value: string;
  readonly network: BitcoinNetworkName;
}

/** What the person told of the wallet, as MnemoCode reads it. */
export type WalletEvidence =
  | {
      /** An address of any coin, which names its coin and its network. */
      readonly kind: "address";
      readonly value: string;
      readonly location: AddressLocation;
      readonly addresses?: number;
    }
  | ScannedKey<"compressed-public-key">
  | ScannedKey<"wif">
  | NetworkKey<"master-xpub">
  | KeyAtPlace<"account-xpub">
  | NetworkKey<"master-fingerprint">;

/** What a candidate is compared with, and the wallet's BIP39 passphrase. */
export interface WalletEvidenceRequest {
  readonly evidence: WalletEvidence;
  readonly passphrase: string;
}

/** The scan of addresses from a place, as MnemoCode bounds it (wallet/scan.rs). */
export const ADDRESS_SCAN = Object.freeze({
  defaultCount: 20,
  maxCount: 1_000,
  lastIndex: 2 ** 31 - 1,
});

/** The addresses compared by default from index `first`: 20, or those left before the last index. */
export function defaultAddressCount(first: number): number {
  return Math.min(ADDRESS_SCAN.defaultCount, ADDRESS_SCAN.lastIndex - first + 1);
}

/** The longest BIP39 passphrase a candidate list stores, in UTF-8 bytes (docs/CANDIDATES.md). */
export const MAX_LIST_PASSPHRASE_BYTES = 256;

export interface OfferedCoin {
  readonly id: string;
  readonly name: string;
  readonly addressForms: string;
}

/**
 * The coins whose addresses the wallet question compares: those of this page's MnemoCode that the
 * page names, in MnemoCode's order, or of a selective build only its own.
 */
export function offeredCoins(binding: MnemoCodeBinding): readonly OfferedCoin[] {
  return binding.walletCoins().flatMap((id) => {
    const words = Object.hasOwn(COIN_WORDS, id) ? COIN_WORDS[id] : undefined;
    if (words === undefined || !(OFFERED_COIN_IDS?.includes(id) ?? true)) return [];
    return [{ id, name: words.name, addressForms: words.addressForms }];
  });
}

/** Whether evidence of `kind` sits at a place of an account. */
export function isPlacedKind(kind: WalletEvidence["kind"]): boolean {
  return kind !== "master-fingerprint" && kind !== "master-xpub";
}

/** What a match by evidence of `kind` is confirmed by, as MnemoCode words it. */
export function matchedBy(kind: WalletEvidence["kind"]): "fingerprint" | "key" | "address" {
  if (kind === "master-fingerprint") return "fingerprint";
  if (kind === "address") return "address";
  return "key";
}

/** A count of addresses as MnemoCode takes it: NaN for its default. */
function count(addresses: number | undefined): number {
  return addresses ?? Number.NaN;
}

/** "A, B or C", as MnemoCode lists names in words. */
function inWords(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/**
 * MnemoCode's evidence of an address, read as every coin of this page's file whose form it has. A
 * selective build narrows it to its own coins, and refuses an address of none of them by naming its
 * own; the shared forms are of two coins, so no address is of two of a build's coins and another.
 */
function addressEvidence(
  binding: MnemoCodeBinding,
  evidence: Extract<WalletEvidence, { kind: "address" }>,
) {
  const { account, branch, index } = evidence.location;
  const read = (coin: string) =>
    binding.WalletEvidence.coinAddress(
      coin,
      evidence.value,
      account,
      branch,
      index,
      count(evidence.addresses),
    );
  const every = read("");
  if (OFFERED_COIN_IDS === undefined) return every;
  const coins = every.coins;
  const own = coins.filter((id) => OFFERED_COIN_IDS?.includes(id) === true);
  if (own.length === coins.length) return every;
  every.free();
  if (own.length === 1) return read(own[0]!);
  const names = offeredCoins(binding).map((coin) => coin.name);
  throw new Error(`This build compares addresses of ${inWords(names)} only.`);
}

/**
 * MnemoCode's evidence of `evidence`, checked as it is made; the caller frees it. An address of a
 * coin that the build does not offer is refused here.
 */
export function walletEvidenceOf(binding: MnemoCodeBinding, evidence: WalletEvidence) {
  const Evidence = binding.WalletEvidence;
  switch (evidence.kind) {
    case "master-fingerprint":
      return Evidence.masterFingerprint(evidence.value);
    case "master-xpub":
      return Evidence.masterKey(evidence.value, evidence.network);
    case "account-xpub":
      return Evidence.accountKey(
        evidence.value,
        evidence.location.network,
        evidence.location.account,
      );
    case "wif": {
      const { network, account, branch, index } = evidence.location;
      return Evidence.wif(
        evidence.value,
        network,
        account,
        branch,
        index,
        count(evidence.addresses),
      );
    }
    case "compressed-public-key": {
      const { network, account, branch, index } = evidence.location;
      using place = new binding.WalletPlace(
        network,
        account,
        branch,
        index,
        count(evidence.addresses),
      );
      return Evidence.publicKey(evidence.value, place);
    }
    case "address":
      return addressEvidence(binding, evidence);
  }
}

/**
 * The names of the coins that MnemoCode reads `address` as, in its order, as a page says them while
 * the address is typed; none for an address that no coin of the build reads.
 */
export function addressCoinNames(binding: MnemoCodeBinding, address: string): readonly string[] {
  try {
    using evidence = walletEvidenceOf(binding, {
      kind: "address",
      value: address,
      location: { account: 0, branch: 0, index: 0 },
      addresses: 1,
    });
    return evidence.coins.map((id) => (Object.hasOwn(COIN_WORDS, id) ? COIN_WORDS[id]!.name : id));
  } catch {
    return [];
  }
}

/** "an address of A or B", as MnemoCode's summary names the coins an address was read as. */
export function addressOf(names: readonly string[]): string {
  return `an address of ${inWords(names)}`;
}

/** What the wallet says of one phrase: whether it matched, at which path, and MnemoCode's warning. */
export interface WalletAnswer {
  readonly matched: boolean;
  readonly path?: string;
  readonly warning?: string;
}

/** The wallet's answer for `phrase`, as MnemoCode checks it. */
export function walletAnswer(
  binding: MnemoCodeBinding,
  wallet: WalletEvidenceRequest,
  phrase: string,
): WalletAnswer {
  using evidence = walletEvidenceOf(binding, wallet.evidence);
  using check = evidence.check(phrase, wallet.passphrase);
  return {
    matched: check.matched,
    ...(check.path === undefined ? {} : { path: check.path }),
    ...(check.warning === undefined ? {} : { warning: check.warning }),
  };
}

/**
 * The searches compared with the wallet of `request`, or with no wallet; the caller frees it. The
 * evidence is checked as it is made, so a search refuses wrong evidence before it starts.
 */
export function walletRecovery(
  binding: MnemoCodeBinding,
  request: WalletEvidenceRequest | undefined,
) {
  if (request === undefined) return binding.Recovery.withoutWallet();
  using evidence = walletEvidenceOf(binding, request.evidence);
  return evidence.recovery(request.passphrase);
}
