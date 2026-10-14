import { createCipheriv } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Bip38PasswordMaterial } from "../src/bip38-password-material.js";
import { CheckedRandomByteSource } from "../src/random-byte-source.js";
import { EthereumAddress } from "../src/eip55.js";

describe("secret material owners without an expensive KDF", () => {
  it("NFC-encodes once, matches independent AES, and wipes after an asynchronous consumer", async () => {
    const derived = Uint8Array.from({ length: 64 }, (_, i) => i);
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const cipher = createCipheriv("aes-256-ecb", derived.subarray(32), null);
    cipher.setAutoPadding(false);
    const expected = Buffer.concat([cipher.update(new Uint8Array(32)), cipher.final()]);
    let passwordBytes: Uint8Array | undefined;
    let escaped: Bip38PasswordMaterial | undefined;
    const encrypted = await Bip38PasswordMaterial.with(
      "e\u0301",
      Uint8Array.of(1, 2, 3, 4),
      async (material) => {
        escaped = material;
        await Promise.resolve();
        const result = material.encrypt(key);
        expect(result).toEqual(new Uint8Array(expected));
        expect(material.decrypt(result)).toEqual(key);
        return result;
      },
      async (password, _salt, options) => {
        passwordBytes = password;
        expect([...password]).toEqual([0xc3, 0xa9]);
        expect(options).toEqual({ N: 16384, r: 8, p: 8, dkLen: 64 });
        return derived;
      },
    );
    expect(encrypted).toEqual(new Uint8Array(expected));
    expect(derived.every((byte) => byte === 0)).toBe(true);
    expect(passwordBytes!.every((byte) => byte === 0)).toBe(true);
    expect(() => escaped!.encrypt(key)).toThrow(/disposed/u);
  });

  it("wipes refused KDF material and consumer failures", async () => {
    for (const length of [63, 64]) {
      const derived = new Uint8Array(length).fill(7);
      let passwordBytes: Uint8Array | undefined;
      const consume = vi.fn(() => {
        throw new Error("synthetic consumer failure");
      });
      await expect(
        Bip38PasswordMaterial.with("synthetic", new Uint8Array(4), consume, async (password) => {
          passwordBytes = password;
          return derived;
        }),
      ).rejects.toThrow(length === 63 ? /invalid material/u : /consumer failure/u);
      expect(consume).toHaveBeenCalledTimes(Number(length === 64));
      expect(derived.every((byte) => byte === 0)).toBe(true);
      expect(passwordBytes!.every((byte) => byte === 0)).toBe(true);
    }
  });

  it("admits caller-owned random bytes and wipes a malformed draw", () => {
    const accepted = new Uint8Array(16).fill(7);
    expect(new CheckedRandomByteSource(() => accepted).bytes(16)).toBe(accepted);
    expect(accepted[0]).toBe(7);
    const refused = new Uint8Array(15).fill(7);
    expect(() => new CheckedRandomByteSource(() => refused).bytes(16)).toThrow(/expected 16/u);
    expect(refused.every((byte) => byte === 0)).toBe(true);
    const source = vi.fn(() => accepted);
    for (const count of [-1, 1.5, NaN, Infinity])
      expect(() => new CheckedRandomByteSource(source).bytes(count)).toThrow(/safe integer/u);
    expect(source).not.toHaveBeenCalled();
  });
});

describe("one EIP55 formatter and public admission", () => {
  // Public examples retained from the repository's independent Ethereum conformance fixtures.
  const address = "0x52908400098527886E0F7030069857D2E4169EE7";
  it("keeps the published checksum while accepting uniform-case input", () => {
    expect(EthereumAddress.fromHex(address.toLowerCase()).checksummed).toBe(address);
    expect(EthereumAddress.parse(address.toLowerCase()).checksummed).toBe(address);
    expect(EthereumAddress.parse(address).checksummed).toBe(address);
  });
  it("refuses wrong mixed casing and malformed public input", () => {
    for (const input of [address.replace("E0F", "e0F"), address.slice(2), null, "0x1234"])
      expect(() => EthereumAddress.parse(input)).toThrow(/Ethereum address/u);
  });
});
