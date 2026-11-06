// Actual committed SSKR WASM and checked codec; public synthetic share, no rebuild or KDF.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SskrCodec } from "../../../packages/recovery-backup/src/sskr-codec.ts";

it("keeps a typed unknown UR type out of the public recovery refusal", () => {
  const codec = new SskrCodec(new Uint8Array(readFileSync("packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm")));
  const secret = new Uint8Array(16).fill(1);
  const seed = new Uint8Array(32).fill(2);
  let restored;
  try {
    const [share] = codec.create(secret, 1, [{ threshold: 1, count: 1 }], seed);
    restored = codec.recover([share]);
    expect(restored).toEqual(secret);
    const marker = "public-audit-marker";
    expect(share.startsWith("ur:sskr/")).toBe(true);
    let failure;
    try { codec.recover([share.replace("ur:sskr/", `ur:${marker}/`)]); }
    catch (cause) { failure = cause; }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).not.toContain(marker);
  } finally { secret.fill(0); seed.fill(0); restored?.fill(0); }
});
