import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertReleaseLegalDocuments,
  copyReleaseLegalDocuments,
  RELEASE_LEGAL_DOCUMENTS,
  RELEASE_LEGAL_NAMES,
} from "./release-legal-documents.mjs";

const root = resolve(import.meta.dirname, "..");
const ROOT_DOCUMENTS = new Set(["LICENSE", "ATTRIBUTION.md", "THIRD_PARTY_NOTICES.md"]);
const supplemental = RELEASE_LEGAL_DOCUMENTS.filter(({ source }) => !ROOT_DOCUMENTS.has(source));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function withRelease(check) {
  const release = mkdtempSync(resolve(tmpdir(), "wallet-release-legal-"));
  try {
    check(release);
  } finally {
    rmSync(release, { force: true, recursive: true });
  }
}

describe("flat release legal documents", () => {
  it("lists existing sources under unique flat names that no other release file uses", () => {
    for (const { source } of RELEASE_LEGAL_DOCUMENTS)
      expect(existsSync(resolve(root, source))).toBe(true);
    expect(new Set(RELEASE_LEGAL_NAMES).size).toBe(RELEASE_LEGAL_NAMES.length);
    for (const name of RELEASE_LEGAL_NAMES) {
      expect(name).toMatch(/^[A-Za-z0-9_.-]+$/u);
      expect(["SHA256SUMS", "verification-record.json"]).not.toContain(name);
    }
    expect(Object.isFrozen(RELEASE_LEGAL_DOCUMENTS)).toBe(true);
    expect(Object.isFrozen(RELEASE_LEGAL_DOCUMENTS[0])).toBe(true);
  });

  it("ships exactly the package licence and notice files the root notices cite", () => {
    const notices = readFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8");
    const cited = [...notices.matchAll(/`(packages\/[^`\s]+)`/gu)]
      .map(([, path]) => path)
      .filter((path) => /LICENSE|NOTICE/u.test(posix.basename(path)));
    expect(new Set(cited)).toEqual(new Set(supplemental.map(({ source }) => source)));
    for (const { name } of supplemental) expect(notices).toContain(`\`${name}\``);
  });

  it("copies each document byte for byte and returns its SHA256SUMS line", () => {
    withRelease((release) => {
      const lines = copyReleaseLegalDocuments(root, release);
      expect(lines).toHaveLength(RELEASE_LEGAL_DOCUMENTS.length);
      RELEASE_LEGAL_DOCUMENTS.forEach(({ name, source }, index) => {
        const sourceBytes = readFileSync(resolve(root, source));
        expect(lines[index]).toBe(`${sha256(sourceBytes)}  ${name}`);
        expect(readFileSync(resolve(release, name)).equals(sourceBytes)).toBe(true);
      });
    });
  });

  it("rejects a released document that differs from its source by one byte or is missing", () => {
    withRelease((release) => {
      copyReleaseLegalDocuments(root, release);
      expect(() => assertReleaseLegalDocuments(root, release)).not.toThrow();

      const argon2 = resolve(release, "MHFE-LICENSE-ARGON2");
      const original = readFileSync(argon2);
      const changed = Buffer.from(original);
      changed[0] ^= 1;
      writeFileSync(argon2, changed);
      expect(() => assertReleaseLegalDocuments(root, release)).toThrow(
        "Flat release MHFE-LICENSE-ARGON2 differs from packages/recovery-mhfe-wasm/LICENSE-ARGON2.",
      );

      writeFileSync(argon2, original);
      rmSync(resolve(release, "MnemoCode-NOTICE"));
      expect(() => assertReleaseLegalDocuments(root, release)).toThrow(
        "Flat release lacks MnemoCode-NOTICE.",
      );
    });
  });
});
