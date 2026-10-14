import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("RustSec catalog bootstrap without installed npm dependencies", () => {
  it("enumerates native crates while refusing every bare npm import", () => {
    const catalog = fileURLToPath(new URL("./wasm-catalog.mjs", import.meta.url));
    const source = `
      import { registerHooks } from 'node:module';
      import { pathToFileURL } from 'node:url';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (!/^(node:|file:|\\.\\.?\\/|\\/)/u.test(specifier))
          throw new Error('Unexpected npm dependency during catalog bootstrap: ' + specifier);
        return nextResolve(specifier, context);
      }});
      process.argv = [process.execPath, ${JSON.stringify(catalog)}, 'audit'];
      await import(pathToFileURL(process.argv[1]).href);
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).include.map(({ lockfile }) => lockfile)).toEqual([
      "packages/dash-shielded-wasm/rust/Cargo.lock",
      "packages/recovery-codex32-wasm/rust/Cargo.lock",
      "packages/recovery-sskr-wasm/rust/Cargo.lock",
      "packages/recovery-envelope-wasm/rust/Cargo.lock",
      "apps/key-derivation/launcher/Cargo.lock",
    ]);
  });
});
