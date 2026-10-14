import type { CoinDerivationInput } from "@ckd/coins/registry.js";
import type { RuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { MAX_BATCH_SIZE } from "@ckd/core/bip32-limits.js";
import { LocalSearchAdmission } from "./local-search-admission.js";
import type { DerivationResult, ResultField } from "@ckd/core/types.js";

export interface AddressSearchMatch {
  index: number;
  path: string;
  address: string;
}

/** Refuses a search range that the adapter cannot derive. */
function assertSearchRange(adapter: RuntimeCoinAdapter, start: number, count: number): void {
  LocalSearchAdmission.range(start, count, adapter.limits?.startMax);
}

/**
 * Derives `count` rows from `start` in the adapter's batches and hands each batch's rows to
 * `visit` until it returns true; every batch's seed copy and rows are wiped once visited.
 */
async function visitDerivedRows(
  adapter: RuntimeCoinAdapter,
  baseInput: Omit<CoinDerivationInput, "start" | "count">,
  start: number,
  count: number,
  signal: AbortSignal | undefined,
  visit: (rows: DerivationResult["rows"]) => boolean,
): Promise<void> {
  const batchMax = adapter.batchSize ?? MAX_BATCH_SIZE;
  for (let offset = 0; offset < count; offset += batchMax) {
    signal?.throwIfAborted();
    const batchCount = Math.min(batchMax, count - offset);
    let result: DerivationResult | null = null;
    const batchSeed = baseInput.seed.slice();
    try {
      result = await adapter.derive({
        ...baseInput,
        seed: batchSeed,
        start: start + offset,
        count: batchCount,
      });
      signal?.throwIfAborted();
      if (visit(result.rows)) return;
    } finally {
      batchSeed.fill(0);
      clearDerivationResult(result);
    }
  }
}

/** What a search looks for: a payment address, or the value of named public result fields. */
export interface ResultTarget {
  readonly address: string;
  /** Compare named public result fields instead of the payment-address field. */
  readonly fieldKeys?: readonly string[];
}

/** Every field of a derived row: its basic and advanced fields and those of its groups. */
export function rowFields(row: DerivationResult["rows"][number]): ResultField[] {
  return [
    ...row.basic,
    ...row.advanced,
    ...(row.groups ?? []).flatMap((group) => [...group.basic, ...group.advanced]),
  ];
}

/**
 * The field of `fields` that holds `target`: a payment address compared by the coin's own rule
 * (its addressesEqual, else exactly), named fields without regard to case. The one comparison of
 * the search and of the reveal that re-derives what it found (AUD-024 family 26).
 */
export function matchedTargetField(
  adapter: Pick<RuntimeCoinAdapter, "addressesEqual">,
  fields: readonly ResultField[],
  target: ResultTarget,
): ResultField | undefined {
  const { fieldKeys, address } = target;
  if (fieldKeys === undefined)
    return fields.find(
      ({ role, value }) =>
        role === "paymentAddress" &&
        (adapter.addressesEqual?.(value, address) ?? value === address),
    );
  return fields.find(
    ({ key, value }) => fieldKeys.includes(key) && value.toLowerCase() === address.toLowerCase(),
  );
}

export async function findDerivedAddress(
  adapter: RuntimeCoinAdapter,
  baseInput: Omit<CoinDerivationInput, "start" | "count">,
  expectedAddress: string,
  start: number,
  count: number,
  signal?: AbortSignal,
): Promise<AddressSearchMatch | null> {
  const expected = expectedAddress.trim();
  if (expected.length === 0) throw new Error("Enter an expected address to search for.");
  assertSearchRange(adapter, start, count);
  let match: AddressSearchMatch | null = null;
  await visitDerivedRows(adapter, baseInput, start, count, signal, (rows) => {
    for (const row of rows) {
      const address = row.basic.find(({ key }) => key === "address")?.value;
      if (
        address !== undefined &&
        (adapter.addressesEqual?.(address, expected) ?? address === expected)
      ) {
        match = { index: row.index, path: row.path, address };
        return true;
      }
    }
    return false;
  });
  return match;
}

export interface AddressSearchRequest extends ResultTarget {
  readonly id: string;
}

export interface AddressSearchResult extends AddressSearchMatch {
  readonly id: string;
}

/** Derives each range once and resolves every requested address found in it. */
export async function findDerivedAddresses(
  adapter: RuntimeCoinAdapter,
  baseInput: Omit<CoinDerivationInput, "start" | "count">,
  requests: readonly AddressSearchRequest[],
  start: number,
  count: number,
  signal?: AbortSignal,
): Promise<AddressSearchResult[]> {
  if (requests.length === 0) throw new Error("Enter at least one expected address.");
  assertSearchRange(adapter, start, count);
  const remaining = new Map(requests.map((request) => [request.id, request]));
  const matches: AddressSearchResult[] = [];
  await visitDerivedRows(adapter, baseInput, start, count, signal, (rows) => {
    for (const row of rows) {
      const fields = rowFields(row);
      for (const [id, request] of remaining) {
        const matched = matchedTargetField(adapter, fields, request);
        if (matched !== undefined) {
          matches.push({ id, index: row.index, path: row.path, address: matched.value });
          remaining.delete(id);
        }
      }
    }
    return remaining.size === 0;
  });
  return matches;
}
