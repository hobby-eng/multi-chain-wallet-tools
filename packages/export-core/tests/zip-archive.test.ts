import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ZipArchive } from "../src/zip-archive.js";

describe("Shared archive byte ownership", () => {
  it("retains the archived bytes while clearing every transferred input", () => {
    const entries = { "public.txt": new TextEncoder().encode("synthetic public fixture") };
    const packed = ZipArchive.pack(entries);
    try {
      expect(strFromU8(unzipSync(packed)["public.txt"]!)).toBe("synthetic public fixture");
      expect(entries["public.txt"].every((byte) => byte === 0)).toBe(true);
    } finally {
      packed.fill(0);
    }
  });

  it("clears all transferred inputs even when the ZIP library refuses an entry", () => {
    const accepted = Uint8Array.of(1);
    const refused = Uint8Array.of(2);
    const entries = { "public.txt": accepted, ["a".repeat(65536)]: refused };
    expect(() => ZipArchive.pack(entries)).toThrow("filename too long");
    expect(accepted).toEqual(Uint8Array.of(0));
    expect(refused).toEqual(Uint8Array.of(0));
  });
});
