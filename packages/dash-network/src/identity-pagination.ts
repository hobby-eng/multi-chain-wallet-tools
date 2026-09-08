/** Integrity checks for offset-paginated, auxiliary Explorer collections. */
export class IdentityPageIntegrity {
  #seen = new Set<string>();
  #total: number | null;
  #loaded = 0;
  constructor(
    readonly context: string,
    readonly kind: 'transactions' | 'transfers' | 'resources',
    expected: number | null,
  ) { this.#total = expected; }

  get total(): number | null { return this.#total; }
  get loaded(): number { return this.#loaded; }

  accept(items: Record<string, unknown>[], total: number | null, limit: number, displayLimit: number): void {
    if (items.length > limit) throw new Error(`Platform Explorer ${this.context} exceeded its page size.`);
    if (total !== null) {
      if (this.#total !== null && this.#total !== total) throw new Error(`Platform Explorer ${this.context} changed during pagination or disagrees with its summary count.`);
      this.#total = total;
    }
    const current = new Set<string>();
    for (const item of items) {
      // The current transfer API does not expose a stable row ID. Compare the full
      // movement across pages, never just its transaction hash. Identical legs in
      // one page are retained; indistinguishable legs across pages are ambiguous.
      const key = this.kind === 'transfers'
        ? JSON.stringify([item.txHash, item.sender, item.recipient, item.amount, item.type, item.timestamp, item.blockHash])
        : this.kind === 'transactions' ? item.hash : item.identifier;
      if (typeof key !== 'string' || key.length === 0) throw new Error(`Platform Explorer ${this.context} omitted a record identifier.`);
      const identity = this.kind === 'transactions' ? key.toLowerCase() : key;
      if (this.#seen.has(identity) || (this.kind !== 'transfers' && current.has(identity))) {
        throw new Error(`Platform Explorer ${this.context} repeated a record across its history.`);
      }
      current.add(identity);
    }
    for (const key of current) this.#seen.add(key);
    this.#loaded += items.length;
    if (this.#total !== null && this.#loaded > this.#total) throw new Error(`Platform Explorer ${this.context} exceeded its reported count.`);
    if (items.length < limit && this.#total !== null && this.#loaded < Math.min(this.#total, displayLimit)) {
      throw new Error(`Platform Explorer ${this.context} ended before its reported count.`);
    }
  }
}
