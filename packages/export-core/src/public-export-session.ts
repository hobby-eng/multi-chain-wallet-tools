/** Owns the visible public result and its pending export across controllers on one host. */
export class PublicExportSession {
  static readonly #hosts = new WeakMap<object, PublicExportSession>();
  #state: unknown = null;
  #pending: object | null = null;

  static forHost(host: object): PublicExportSession {
    let session = this.#hosts.get(host);
    if (session === undefined) {
      session = new PublicExportSession();
      this.#hosts.set(host, session);
    }
    return session;
  }

  replace(state: unknown): void {
    this.#state = state;
    this.#pending = null;
  }

  contains(state: unknown): boolean {
    return state !== null && this.#state === state;
  }

  begin(state: unknown): object | null {
    if (!this.contains(state) || this.#pending !== null) return null;
    this.#pending = {};
    return this.#pending;
  }

  owns(ticket: object, state: unknown): boolean {
    return this.#pending === ticket && this.contains(state);
  }

  finish(ticket: object, state: unknown): boolean {
    if (!this.owns(ticket, state)) return false;
    this.#pending = null;
    return true;
  }
}
