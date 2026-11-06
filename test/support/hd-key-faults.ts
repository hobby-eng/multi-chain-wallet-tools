import { HDKey } from "@scure/bip32";
import { vi } from "vitest";

function nativeMethod(name: string): (receiver: HDKey, args: unknown[]) => unknown {
  const method: unknown = Object.getOwnPropertyDescriptor(HDKey.prototype, name)?.value;
  if (typeof method !== "function") throw new Error("The native HD method is unavailable.");
  return (receiver, args) => {
    const result: unknown = Reflect.apply(method, receiver, args);
    return result;
  };
}

function nativeGetter(name: string): (receiver: HDKey) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(HDKey.prototype, name);
  const getter: unknown = descriptor === undefined ? undefined : Reflect.get(descriptor, "get");
  if (typeof getter !== "function") throw new Error("The native HD getter is unavailable.");
  return (receiver) => {
    const result: unknown = Reflect.apply(getter, receiver, []);
    return result;
  };
}

function sdkReceiver<Arguments extends unknown[], Result>(
  operation: (node: HDKey, ...args: Arguments) => Result,
): (this: HDKey, ...args: Arguments) => Result {
  return function (this: HDKey, ...args: Arguments): Result {
    return operation(this, ...args);
  };
}

/** Observes real SDK objects and injects faults at its derivation/storage boundary only. */
export class HdKeyFaults {
  readonly #roots: HDKey[] = [];
  readonly #returned: HDKey[] = [];
  readonly #privateCopies: Uint8Array[] = [];
  readonly #wiped = new WeakSet<HDKey>();
  readonly #nativeWipe = nativeMethod("wipePrivateData");
  #rootDerivations = 0;
  #refuseDerivation: number | undefined;
  #refusePublicDepth: number | undefined;
  #refuseExtendedDepth: number | undefined;
  #refuseFingerprintDepth: number | undefined;
  #throwWipeDepth: number | undefined;
  readonly #refusal = new Error("Synthetic HD service refusal.");

  constructor() {
    const fromSeed = HDKey.fromMasterSeed.bind(HDKey);
    vi.spyOn(HDKey, "fromMasterSeed").mockImplementation((seed, versions) => {
      const root = fromSeed(seed, versions);
      this.#roots.push(root);
      return root;
    });
    const derive = nativeMethod("derive");
    const publicKey = nativeGetter("publicKey");
    const privateKey = nativeGetter("privateKey");
    const extended = nativeGetter("privateExtendedKey");
    const fingerprint = nativeGetter("fingerprint");
    vi.spyOn(HDKey.prototype, "derive").mockImplementation(
      sdkReceiver((node, path: string) => {
        if (node.depth === 0 && ++this.#rootDerivations === this.#refuseDerivation)
          throw this.#refusal;
        const child = derive(node, [path]);
        if (!(child instanceof HDKey)) throw new Error("The native SDK did not return a key.");
        this.#returned.push(child);
        return child;
      }),
    );
    vi.spyOn(HDKey.prototype, "publicKey", "get").mockImplementation(
      sdkReceiver((node) => {
        if (node.depth === this.#refusePublicDepth) throw this.#refusal;
        const bytes = publicKey(node);
        if (bytes !== null && !(bytes instanceof Uint8Array))
          throw new Error("Invalid public bytes.");
        return bytes;
      }),
    );
    vi.spyOn(HDKey.prototype, "privateKey", "get").mockImplementation(
      sdkReceiver((node) => {
        const bytes = privateKey(node);
        if (bytes !== null && !(bytes instanceof Uint8Array))
          throw new Error("Invalid private bytes.");
        if (bytes !== null) this.#privateCopies.push(bytes);
        return bytes;
      }),
    );
    vi.spyOn(HDKey.prototype, "privateExtendedKey", "get").mockImplementation(
      sdkReceiver((node) => {
        if (node.depth === this.#refuseExtendedDepth) throw this.#refusal;
        const text = extended(node);
        if (typeof text !== "string") throw new Error("Invalid extended key text.");
        return text;
      }),
    );
    vi.spyOn(HDKey.prototype, "fingerprint", "get").mockImplementation(
      sdkReceiver((node) => {
        if (node.depth === this.#refuseFingerprintDepth) throw this.#refusal;
        const value = fingerprint(node);
        if (typeof value !== "number") throw new Error("Invalid native fingerprint.");
        return value;
      }),
    );
    vi.spyOn(HDKey.prototype, "wipePrivateData").mockImplementation(
      sdkReceiver((node) => {
        this.#wiped.add(node);
        this.#nativeWipe(node, []);
        if (node.depth === this.#throwWipeDepth) throw this.#refusal;
        return node;
      }),
    );
  }

  /** Refuses the selected root's path derivation, counted from one. */
  refuseRootDerivation(call: number): void {
    this.#refuseDerivation = call;
  }
  /** Refuses an SDK public-key read at the selected node depth. */
  refusePublicAtDepth(depth: number): void {
    this.#refusePublicDepth = depth;
  }
  /** Refuses extended-private serialization at the selected node depth. */
  refuseExtendedAtDepth(depth: number): void {
    this.#refuseExtendedDepth = depth;
  }
  /** Refuses the SDK's precomputed fingerprint read at the selected node depth. */
  refuseFingerprintAtDepth(depth: number): void {
    this.#refuseFingerprintDepth = depth;
  }
  /** Throws after a real wipe, to prove outer resources are still disposed. */
  throwAfterWipeAtDepth(depth: number): void {
    this.#throwWipeDepth = depth;
  }
  /** Root objects created by the actual SDK for this operation. */
  get roots(): readonly HDKey[] {
    return this.#roots;
  }
  /** Final path nodes returned to the host, excluding SDK-internal intermediate nodes. */
  get returned(): readonly HDKey[] {
    return this.#returned;
  }
  /** Copies returned by the SDK's private-key getter, retained only for cleanup assertions. */
  get privateCopies(): readonly Uint8Array[] {
    return this.#privateCopies;
  }
  /** Whether the host called this SDK node's wipe operation. */
  wasWiped(node: HDKey): boolean {
    return this.#wiped.has(node);
  }
  /** Clears public-fixture state even after a failing assertion, bypassing injected failures. */
  wipe(): void {
    for (const bytes of this.#privateCopies) bytes.fill(0);
    for (const node of [...this.#returned, ...this.#roots]) this.#nativeWipe(node, []);
  }
  /** Ends retained public-fixture observations even when a test leaves through an error. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
