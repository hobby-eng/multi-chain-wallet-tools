import { describe, expect, it } from "vitest";
import { hexToBytes } from "@ckd/core/crypto.js";
import { ZCASH_MESSAGE_SIGNING as zcash } from "../src/coins/zcash/message-signing.js";

// Our own answer for the public key 1 (tmp check/a2_vectors.py), and Zallet's forum vector
// (zallet-core/src/components/json_rpc/methods/verify_message.rs L123-L127), verify only.
const request = (address: string, message = "Offline message signing self-test") =>
  ({ format: "zcash-compact", address, message, network: "mainnet" }) as const;
const KEY_ONE = "t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs";
const SIGNATURE =
  "IOEH8KXORrLPsZDNWt0j5eFztRbE+ZaJMwhJgOuF2Hz1L/0T93WP/0WoOjoGZFHachu9FXzGCgvuELkCXx8xFWE=";
const verify = (address: string, signature: string, message?: string) =>
  Promise.resolve().then(() => zcash.verify(request(address, message), signature));

describe("Zcash's message signing", () => {
  it("signs the key 1's t1 address and verifies it", async () => {
    const signed = await zcash.sign(hexToBytes("01".padStart(64, "0")), request(KEY_ONE), []);
    expect(signed).toMatchObject({ signature: SIGNATURE, verified: true });
    expect(await verify(KEY_ONE, SIGNATURE)).toBe(true);
    expect(await verify(KEY_ONE, SIGNATURE, "another message")).toBe(false);
  });

  it("verifies Zallet's forum vector", async () => {
    expect(
      await verify(
        "t1VydNnkjBzfL1iAMyUbwGKJAF7PgvuCfMY",
        "H3RY+6ZfWUbzaaXxK8I42thf+f3tOrwKP2elphxAxq8tKypwJG4+V7EGR+sTWMZ5MFyvTQW8ZIV0yGU+93JTioA=",
        "20251117: 1 Yay; 2 Yay; 3 Yay; 4 Yay; 5 Nay; 6 Nay; 7 Yay; 8 Yay; 9 Nay",
      ),
    ).toBe(true);
  });

  it.each([
    // The first Base64 letter sets the header's top six bits: H makes 28, J makes 36.
    ["an uncompressed header, as Zallet does", "H"],
    ["a BIP137 typed header", "J"],
  ])("refuses %s", async (_name, header) => {
    await expect(verify(KEY_ONE, `${header}${SIGNATURE.slice(1)}`)).rejects.toMatchObject({
      code: "INVALID_HEADER",
    });
  });
});
