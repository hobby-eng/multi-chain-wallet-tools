export type NetworkName = "mainnet" | "testnet";
/** Result presentation modes shared by rendering and export admission. */
export const DISPLAY_MODES = ["basic", "advanced"] as const;
/** One admitted result presentation mode. */
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export interface ResultField {
  key: string;
  label: string;
  value: string;
  secret: boolean;
  role?: "paymentAddress";
  /** The URI scheme of a payment QR code, only for a coin with a standard one (BIP21 and its kin). */
  paymentUriScheme?: "bitcoin" | "ethereum" | "dash" | "litecoin" | "dogecoin" | "zcash" | "solana";
  description?: string;
}

export interface ResultFieldGroup {
  key: string;
  title: string;
  description?: string;
  basic: ResultField[];
  advanced: ResultField[];
}

export interface DerivedRow {
  index: number;
  path: string;
  title: string;
  /**
   * Why the row has no value to show, shown in the place of its values: an index that has no
   * address (a Zcash Sapling diversifier index). Such a row has no basic fields.
   */
  note?: string;
  basic: ResultField[];
  advanced: ResultField[];
  /** Related fields rendered together while the row remains the selection/export unit. */
  groups?: ResultFieldGroup[];
}

interface WatchOnlyExport {
  label: string;
  description: string;
  text: string;
  fileName: string;
  mimeType: "text/plain" | "application/json";
  /** Watch-only material cannot spend, but exposes the wallet's address graph or activity. */
  privacySensitive: true;
}

/** Separate explicit export; privateText grants account spending access and is never public report data. */
export interface AccountDescriptorExport {
  accountPath: string;
  publicText: string;
  privateText: string;
  scannerText: string;
  fileStem: string;
}

export interface DerivationResult {
  id: string;
  title: string;
  networkLabel: string;
  pathTemplate: string;
  /** Account-scoped fields useful in Basic mode, kept separate from per-address rows. */
  basicSummary: ResultField[];
  /** Additional account/root fields shown in Advanced mode. */
  summary: ResultField[];
  watchOnly?: WatchOnlyExport;
  accountDescriptors?: AccountDescriptorExport;
  rows: DerivedRow[];
  notices: string[];
}

export interface Bip32BatchOptions {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  branch: number;
  start: number;
  count: number;
}

export interface ShieldedBatchOptions {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  start: number;
  count: number;
}

export function field(
  key: string,
  label: string,
  value: string,
  secret = false,
  description?: string,
): ResultField {
  return description === undefined
    ? { key, label, value, secret }
    : { key, label, value, secret, description };
}

/**
 * The columns of a table of rows whose fields are `lists`: every key once, standing for the first
 * entry seen with it, in the order that the rows give their fields. A row that lacks some of its
 * coin's fields, such as a Zcash Sapling index without an address, moves no column, whichever row
 * comes first; keys that no row orders come in the order they were first seen.
 */
export function fieldColumns<Entry>(
  lists: Iterable<readonly Entry[]>,
  keyOf: (entry: Entry) => string,
): Entry[] {
  const first = new Map<string, Entry>();
  const successors = new Map<string, Set<string>>();
  // Rows of one coin repeat a few sequences of keys; each sequence is read once.
  const sequences = new Set<string>();
  for (const list of lists) {
    const keys: string[] = [];
    for (const entry of list) {
      const key = keyOf(entry);
      if (keys.includes(key)) continue;
      keys.push(key);
      if (!first.has(key)) first.set(key, entry);
    }
    const sequence = keys.join("\n");
    if (sequences.has(sequence)) continue;
    sequences.add(sequence);
    keys.forEach((key, at) => {
      const next = keys[at + 1];
      if (next !== undefined) successors.set(key, (successors.get(key) ?? new Set()).add(next));
    });
  }
  return orderedColumns(first, successors);
}

/** The entries of `first` with each key after every key that a row puts before it. */
function orderedColumns<Entry>(
  first: ReadonlyMap<string, Entry>,
  successors: ReadonlyMap<string, ReadonlySet<string>>,
): Entry[] {
  const remaining = [...first];
  const columns: Entry[] = [];
  while (remaining.length > 0) {
    // The first-seen key that no remaining key precedes; rows that disagree on an order leave
    // none, and then the first-seen remaining key goes next.
    const free = remaining.findIndex(
      ([key]) => !remaining.some(([other]) => successors.get(other)?.has(key) === true),
    );
    for (const [, entry] of remaining.splice(Math.max(free, 0), 1)) columns.push(entry);
  }
  return columns;
}

/**
 * Whether a row's field names an address that the row's key may sign for: a public field that is
 * the row's address, whatever its role (a Cardano stake key's reward address), or another public
 * payment-address form of it. The page offers signing on such fields only (results.ts), and
 * DerivedPrivateKey binds a key to one of them.
 */
export function isSigningAddressField(field: ResultField): boolean {
  return (field.key === "address" || field.role === "paymentAddress") && !field.secret;
}

export function paymentAddressField(
  key: string,
  label: string,
  value: string,
  paymentUriScheme?: ResultField["paymentUriScheme"],
): ResultField {
  return paymentUriScheme === undefined
    ? { key, label, value, secret: false, role: "paymentAddress" }
    : { key, label, value, secret: false, role: "paymentAddress", paymentUriScheme };
}
