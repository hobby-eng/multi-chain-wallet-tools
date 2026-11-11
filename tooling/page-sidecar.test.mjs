import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sidecarPath, sidecarRecords, writeSidecar } from "./page-sidecar.mjs";

// SHA-256 of the empty string, from FIPS 180-4's published examples.
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function withFolder(check) {
  const folder = mkdtempSync(resolve(tmpdir(), "wallet-page-sidecar-"));
  try {
    check(folder);
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
}

describe("the checksum file next to a built page", () => {
  it("is the page's path with .sha256, holding one sha256sum line", () => {
    withFolder((folder) => {
      const page = resolve(folder, "Wallet_Key_Derivation_Tool.html");
      expect(sidecarPath(page)).toBe(`${page}.sha256`);
      writeSidecar(page, EMPTY_SHA256, "Wallet_Key_Derivation_Tool.html");
      expect(readFileSync(`${page}.sha256`, "utf8")).toBe(
        `${EMPTY_SHA256}  Wallet_Key_Derivation_Tool.html\n`,
      );
      expect(sidecarRecords(page, EMPTY_SHA256, "Wallet_Key_Derivation_Tool.html")).toBe(true);
    });
  });

  it("records nothing when it is missing or names another digest or another file", () => {
    withFolder((folder) => {
      const page = resolve(folder, "Dash_Community_Key_Derivation_Tool.html");
      expect(sidecarRecords(page, EMPTY_SHA256, "Dash_Community_Key_Derivation_Tool.html")).toBe(
        false,
      );
      writeFileSync(sidecarPath(page), `${EMPTY_SHA256}  Wallet_Key_Derivation_Tool.html\n`);
      expect(sidecarRecords(page, EMPTY_SHA256, "Dash_Community_Key_Derivation_Tool.html")).toBe(
        false,
      );
      expect(sidecarRecords(page, "0".repeat(64), "Wallet_Key_Derivation_Tool.html")).toBe(false);
    });
  });
});
