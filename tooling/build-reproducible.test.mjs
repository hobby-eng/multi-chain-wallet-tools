import { afterEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
/**
 * The files the reproducible build imports, copied into each temporary project: every module that
 * tooling/build-reproducible.mjs reaches through relative imports, inside tooling/ or beyond it,
 * JSON included, so that the fixture follows the build's own imports.
 */
const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_FILES = (() => {
  const reached = new Set(["tooling/build-reproducible.mjs"]);
  const waiting = [...reached];
  while (waiting.length > 0) {
    const file = waiting.pop();
    const source = readFileSync(join(REPOSITORY, file), "utf8");
    for (const [, specifier] of source.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/gu)) {
      const written = posix.normalize(posix.join(posix.dirname(file), specifier));
      // A TypeScript module names its neighbours by their .js output.
      const target =
        written.endsWith(".js") && !existsSync(join(REPOSITORY, written))
          ? written.replace(/\.js$/u, ".ts")
          : written;
      if (reached.has(target)) continue;
      reached.add(target);
      if (/\.(?:mjs|ts|js)$/u.test(target)) waiting.push(target);
    }
  }
  return [...reached].sort();
})();

function copyToolingFixture(root) {
  for (const file of FIXTURE_FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(REPOSITORY, file), join(root, file));
  }
  const listing = "packages/crypto-core/src/listing.ts";
  mkdirSync(dirname(join(root, listing)), { recursive: true });
  cpSync(fileURLToPath(new URL(`../${listing}`, import.meta.url)), join(root, listing));
}

describe("Docker copy-out and failure cleanup without a Docker daemon", () => {
  for (const mode of ["complete", "incomplete", "copy-failure", "build-failure"])
    it(mode, () => {
      const root = mkdtempSync(join(tmpdir(), "wallet-build-regression-"));
      temporary.push(root);
      for (const dir of ["tooling", "bin", "dist", "tmp", "packages/edition-profiles"])
        mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, "dist/keep.txt"), "previous output");
      writeFileSync(join(root, "package.json"), '{"type":"module","version":"1.2.3"}');
      copyToolingFixture(root);
      cpSync(
        fileURLToPath(
          new URL("../packages/edition-profiles/profile-capabilities.json", import.meta.url),
        ),
        join(root, "packages/edition-profiles/profile-capabilities.json"),
      );
      writeFileSync(
        join(root, "bin/docker"),
        `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const a=process.argv.slice(2), mode=process.env.FIXTURE_MODE;
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(a)+'\\n');
if(a[0]==='build'&&mode==='build-failure') process.exit(7);
if(a[0]==='create') fs.writeFileSync(a[a.indexOf('--cidfile')+1],'fixture-container\\n');
if(a[0]==='cp') {
 if(mode==='copy-failure') process.exit(9);
 for(const edition of mode==='incomplete'?['multi-chain-edition']:['multi-chain-edition','dash-community-edition']) {
  const p=path.join(a[2],edition,'release');fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'SHA256SUMS'),'fixture\\n');
 }
}
`,
        { mode: 0o755 },
      );
      const log = join(root, "calls.jsonl");
      const r = spawnSync(process.execPath, [join(root, "tooling/build-reproducible.mjs")], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
          TMPDIR: join(root, "tmp"),
          FIXTURE_MODE: mode,
          FIXTURE_LOG: log,
        },
      });
      expect(r.status, r.stderr).toBe(
        mode === "complete" ? 0 : mode === "copy-failure" ? 9 : mode === "build-failure" ? 7 : 1,
      );
      // This synthetic archive has no Git metadata: it must not claim a clean source tree.
      if (mode !== "build-failure")
        expect(readFileSync(log, "utf8")).toContain("SOURCE_DIRTY=true");
      const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      expect(
        calls.some((a) => a[0] === "rm" && a[1] === "--force" && a[2] === "fixture-container"),
        JSON.stringify(calls),
      ).toBe(mode !== "build-failure");
      expect(readdirSync(join(root, "tmp"))).toEqual([]);
      if (mode === "complete") {
        expect(existsSync(join(root, "dist/container-id"))).toBe(false);
        expect(existsSync(join(root, "dist/keep.txt"))).toBe(false);
        for (const edition of ["multi-chain-edition", "dash-community-edition"])
          expect(readFileSync(join(root, "dist", edition, "release/SHA256SUMS"), "utf8")).toBe(
            "fixture\n",
          );
      } else expect(readFileSync(join(root, "dist/keep.txt"), "utf8")).toBe("previous output");
    });

  // canonical-wasm-import.test.mjs checks how a complete export is installed in each package.
  it("takes the WASM source snapshot before Docker, and refuses a tree without it untouched", () => {
    const root = mkdtempSync(join(tmpdir(), "wallet-wasm-copy-regression-"));
    temporary.push(root);
    for (const dir of ["tooling", "bin", "tmp", "packages/edition-profiles"])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"type":"module","version":"1.2.3"}');
    copyToolingFixture(root);
    cpSync(
      fileURLToPath(
        new URL("../packages/edition-profiles/profile-capabilities.json", import.meta.url),
      ),
      join(root, "packages/edition-profiles/profile-capabilities.json"),
    );
    const calls = join(root, "docker-calls.log");
    writeFileSync(
      join(root, "bin/docker"),
      `#!/usr/bin/env node
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ') + '\\n');
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "tooling/build-reproducible.mjs"), "--wasm"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
          TMPDIR: join(root, "tmp"),
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(existsSync(calls)).toBe(false);
    for (const module of ["dash-shielded-wasm", "recovery-codex32-wasm", "recovery-sskr-wasm"])
      expect(existsSync(join(root, "packages", module, "generated"))).toBe(false);
    expect(existsSync(join(root, "tooling/wasm-canonical-manifest.json"))).toBe(false);
  });
});
