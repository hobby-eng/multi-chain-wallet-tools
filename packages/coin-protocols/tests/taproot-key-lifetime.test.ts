import { afterEach, expect, it, vi } from "vitest";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { secp256k1 } from "@ckd/core/crypto.js";
import { Taproot } from "../src/coins/bitcoin/taproot.js";

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("retires its output key after WIF serialization (refused=%s)", (refused) => {
  const borrowed = new Uint8Array(32);
  borrowed[31] = 1;
  const network = getBitcoinNetwork("mainnet");
  const expected = Taproot.details(borrowed, network).outputPrivateKeyHex;
  const NativeBytes = Uint8Array;
  const allocated: Uint8Array[] = [];
  const retained: Uint8Array[] = [];
  // Observe only native allocations; cryptographic modules and serialization execute unchanged.
  vi.stubGlobal(
    "Uint8Array",
    new Proxy(NativeBytes, {
      get(target, property, receiver) {
        const method: unknown = Reflect.get(target, property, receiver);
        if (property !== "fromHex" || typeof method !== "function") return method;
        return (...args: unknown[]) => {
          const bytes: unknown = Reflect.apply(method, target, args);
          if (!(bytes instanceof NativeBytes)) throw new Error("Invalid native hex allocation.");
          if (bytes.length === 32) allocated.push(bytes);
          return bytes;
        };
      },
      construct(target, argumentsList: unknown[], newTarget) {
        const value: unknown = Reflect.construct(target, argumentsList, newTarget);
        if (!(value instanceof NativeBytes)) throw new Error("Invalid native allocation.");
        if (value.length === 32) allocated.push(value);
        return value;
      },
    }),
  );
  const outputNetwork = {
    ...network,
    get wif() {
      retained.push(
        ...allocated.filter((bytes) => Buffer.from(bytes).toString("hex") === expected),
      );
      return refused ? 256 : network.wif;
    },
  };
  if (refused) expect(() => Taproot.details(borrowed, outputNetwork)).toThrow();
  else expect(Taproot.details(borrowed, outputNetwork).outputPrivateKeyHex).toBe(expected);
  expect(retained).toHaveLength(1);
  expect(retained[0]).toEqual(new NativeBytes(32));
  expect(borrowed[31]).toBe(1);
  expect(borrowed.subarray(0, 31)).toEqual(new NativeBytes(31));
});

it.each([new Uint8Array(32), Uint8Array.of(2, ...new Uint8Array(32).fill(255))])(
  "refuses malformed public points with an input-free stable code",
  (publicKey) => {
    expect(() => Taproot.address(publicKey, getBitcoinNetwork("mainnet"))).toThrowError(
      expect.objectContaining({ code: "taproot.compressed-public-key" }),
    );
  },
);

it("refuses a zero private scalar with an input-free stable code", () => {
  expect(() => Taproot.details(new Uint8Array(32), getBitcoinNetwork("mainnet"))).toThrowError(
    expect.objectContaining({ code: "taproot.invalid-private-key" }),
  );
});

it("keeps watch-only Taproot derivation independent of private transports", () => {
  const key = new Uint8Array(32);
  key[31] = 1;
  const network = getBitcoinNetwork("mainnet");
  const publicKey = secp256k1.getPublicKey(key, true);
  const result = Taproot.address(publicKey, {
    ...network,
    get wif(): number {
      throw new Error("A public-only derivation cannot request WIF.");
    },
  });
  expect(result).not.toHaveProperty("outputPrivateKeyHex");
  expect(result).not.toHaveProperty("outputPrivateKeyWif");
  expect(publicKey).toEqual(secp256k1.getPublicKey(key, true));
});
