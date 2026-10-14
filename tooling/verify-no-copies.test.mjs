import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The copy check reads its threshold strictly and takes only a comment as the marker of a
// deliberate copy (MnemoCode AUD-012-ARC013 and ARC015, ported with its fixture).

const SCRIPT = resolve(fileURLToPath(new URL(".", import.meta.url)), "verify-no-copies.mjs");

/** A function of about 60 tokens, copied into two files of a fixture. */
const COPIED_FUNCTION = `export function spread(values: readonly number[], limit: number): number[] {
  const kept: number[] = [];
  for (const value of values) {
    if (value < 0 || value > limit) continue;
    kept.push(value * 2 + limit - value / 3);
  }
  return kept.sort((left, right) => left - right).slice(0, limit);
}`;

/** The same function in Rust, for the Rust tokenizer. */
const COPIED_RUST = `pub fn spread(values: &[i64], limit: i64) -> Vec<i64> {
    let mut kept: Vec<i64> = Vec::new();
    for value in values {
        if *value < 0 || *value > limit { continue; }
        kept.push(value * 2 + limit - value / 3);
    }
    kept.sort();
    kept
}`;

/** The exit code of the check over `sources`, the files of one app; -1 for a crash. */
function checkFiles(sources, args = [], ending = "ts") {
  const root = mkdtempSync(join(tmpdir(), "wallet-tools-copies-"));
  try {
    mkdirSync(join(root, "tooling"));
    mkdirSync(join(root, "apps", "fixture", "src"), { recursive: true });
    copyFileSync(SCRIPT, join(root, "tooling", "verify-no-copies.mjs"));
    sources.forEach((source, index) =>
      writeFileSync(join(root, "apps", "fixture", "src", `file${index}.${ending}`), source),
    );
    const run = spawnSync(process.execPath, [
      join(root, "tooling", "verify-no-copies.mjs"),
      ...args,
    ]);
    // A crash also exits with 1; only a reported copy counts as one.
    if (run.status === 1 && !String(run.stderr).includes("tokens or more")) return -1;
    return run.status;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The exit code of the check over two files, `first` and `second`. */
function copyCheck(first, second, args = [], ending = "ts") {
  return checkFiles([first, second], args, ending);
}

describe("the copy check", () => {
  it("skips Rust test-only modules and still checks production code after them", () => {
    const tests = `#[cfg(test)] mod tests { ${COPIED_RUST} }`;
    expect(copyCheck(tests, tests, [], "rs")).toBe(0);
    expect(copyCheck(`${tests}\n${COPIED_RUST}`, `${tests}\n${COPIED_RUST}`, [], "rs")).toBe(1);
    expect(
      copyCheck(`#[cfg(not(test))] mod production { ${COPIED_RUST} }`, COPIED_RUST, [], "rs"),
    ).toBe(1);
  });
  it("finds a copy and takes only a comment just above it as its marker", () => {
    const marked = (marker) => copyCheck(`${marker}\n${COPIED_FUNCTION}`, COPIED_FUNCTION);
    expect(copyCheck(COPIED_FUNCTION, COPIED_FUNCTION)).toBe(1);
    expect(marked("// A deliberate copy: the worker cannot import.")).toBe(0);
    expect(marked("/* A deliberate copy: the worker cannot import. */")).toBe(0);
    expect(marked('const label = "not a deliberate copy";')).toBe(1);
    expect(marked("const label = `not a deliberate copy`;")).toBe(1);
    expect(marked("const pattern = /deliberate copy/u;")).toBe(1);
    // MARKER_LINES_ABOVE: a comment four lines above the copy is not its marker.
    expect(marked("// A deliberate copy: the worker cannot import.\n\n\n")).toBe(1);
  });

  it("reads Rust comments as markers and Rust strings as code", () => {
    const marked = (marker) => copyCheck(`${marker}\n${COPIED_RUST}`, COPIED_RUST, [], "rs");
    expect(copyCheck(COPIED_RUST, COPIED_RUST, [], "rs")).toBe(1);
    expect(marked("// A deliberate copy: the WASM build cannot share it.")).toBe(0);
    expect(marked('const LABEL: &str = "not a deliberate copy";')).toBe(1);
  });

  it("ends an import list without a semicolon at its module name", () => {
    // The copy has 92 tokens; an import list ended at the next semicolon would swallow the first
    // statement of the function and leave fewer than 90.
    expect(
      copyCheck(`import "./side-effect.js"\n${COPIED_FUNCTION}`, COPIED_FUNCTION, [
        "--tokens",
        "90",
      ]),
    ).toBe(1);
    expect(copyCheck(COPIED_FUNCTION, COPIED_FUNCTION, ["--tokens", "90"])).toBe(1);
  });

  it("compares every pair, so a marked first place hides no copy among the others", () => {
    const marked = `// A deliberate copy: the worker cannot import.\n${COPIED_FUNCTION}`;
    expect(checkFiles([marked, COPIED_FUNCTION, COPIED_FUNCTION])).toBe(1);
    expect(checkFiles([marked, marked, marked])).toBe(0);
  });

  it("refuses a threshold that is no positive whole number", () => {
    for (const args of [
      ["--tokens", "wrong"],
      ["--tokens"],
      ["--tokens", "0"],
      ["--tokens", "-5"],
      ["--tokens", "2.5"],
      ["--tokens", "9".repeat(400)],
    ])
      expect(copyCheck("export const a = 1;", "export const b = 2;", args)).toBe(2);
  });
});
