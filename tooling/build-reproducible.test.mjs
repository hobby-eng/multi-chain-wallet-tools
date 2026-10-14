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
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
/** The tooling the reproducible build imports, copied into each temporary project. */
const TOOLING_FILES = [
  "build-reproducible.mjs",
  "build-profiles.mjs",
  "build-profile-definitions.mjs",
  "sync-mnemocode-source.mjs",
  "run-script.mjs",
  "profile-template.mjs",
  "tool-protocol-footer.mjs",
  "project-metadata.mjs",
  "wasm-modules.mjs",
  "docker-build-limits.mjs",
];

function copyToolingFixture(root) {
  for (const file of TOOLING_FILES)
    cpSync(fileURLToPath(new URL(file, import.meta.url)), join(root, "tooling", file));
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

  it("copies every canonical WASM module to its owning package", () => {
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
    writeFileSync(
      join(root, "bin/docker"),
      `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const a=process.argv.slice(2);
if(a[0]==='create') fs.writeFileSync(a[a.indexOf('--cidfile')+1],'fixture-container\\n');
if(a[0]==='cp') {
 for(const name of ['dash','codex32','sskr','envelope']) {
  const p=path.join(a[2],name); fs.mkdirSync(p,{recursive:true});
  fs.writeFileSync(path.join(p,name==='dash'?'dash_shielded_wasm_bg.wasm':
    name==='codex32'?'recovery_codex32_wasm_bg.wasm':
    name==='sskr'?'recovery_sskr_wasm_bg.wasm':'recovery_envelope_wasm_bg.wasm'),name);
 }
 fs.writeFileSync(path.join(a[2],'wasm-canonical-manifest.json'),'{}\\n');
}
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
    expect(result.status, result.stderr).toBe(0);
    const expected = [
      ["dash-shielded-wasm", "dash_shielded_wasm_bg.wasm", "dash"],
      ["recovery-codex32-wasm", "recovery_codex32_wasm_bg.wasm", "codex32"],
      ["recovery-sskr-wasm", "recovery_sskr_wasm_bg.wasm", "sskr"],
      ["recovery-envelope-wasm", "recovery_envelope_wasm_bg.wasm", "envelope"],
    ];
    for (const [packageDirectory, file, contents] of expected) {
      expect(
        readFileSync(join(root, "packages", packageDirectory, "generated", file), "utf8"),
      ).toBe(contents);
    }
    expect(readFileSync(join(root, "tooling/wasm-canonical-manifest.json"), "utf8")).toBe("{}\n");
  });
});
