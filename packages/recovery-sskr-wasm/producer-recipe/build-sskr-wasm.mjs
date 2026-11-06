// Builds the SSKR engine from sskr-wasm/rust in its pinned container (Dockerfile.sskr), then writes
// sskr-wasm/generated and the SHA-256 pins in sskr-wasm/integrity.json. With --check it builds into
// a temporary folder and only compares: each generated file must equal the committed one byte for
// byte. The build takes minutes, so the check runs for a release, not on every change.
//
//   node scripts/build-sskr-wasm.mjs [--check]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { ErrorCatalog } from "../src/core/error-catalog.ts";
import { afterFailure } from "../src/core/refusal.ts";

const ERRORS = new ErrorCatalog("scripts.build-sskr-wasm", {
  /**
   * @param {string} value0
   */
  "sskr-glue-missing": (value0) => `The SSKR glue is missing ${value0}.`,
  "sskr-glue-still-network-loader-async-start": () =>
    "The SSKR glue still has a network loader or an async start.",
  "sskr-declarations-missing-documented-async-start": () =>
    "The SSKR declarations are missing the documented async start.",
  "sskr-declarations-more-after-async-start": () =>
    "The SSKR declarations have more after the async start.",
  "sskr-recovery-output-shape": () => "The SSKR recovery glue has an unexpected output shape.",
  "sskr-creation-output-shape": () => "The SSKR creation glue has an unexpected output shape.",
});

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bridge = join(root, "sskr-wasm");
const generated = join(bridge, "generated");
const manifestPath = join(bridge, "integrity.json");
const GLUE_STEM = "recovery_sskr_wasm";
// Compact-UR and explicitly formatted recovery each return an owned secret buffer.
const RECOVERY_ENTRY_POINTS = 2;
// Compact-UR and formatted creation each return a String containing secret shares.
const CREATION_ENTRY_POINTS = 2;
const checkOnly = process.argv.includes("--check");

// The style that the generated declarations were first written in, kept so that a rebuild writes
// the same bytes (integrity.json).
const DECLARATION_STYLE = {
  parser: "typescript",
  singleQuote: true,
  semi: true,
  trailingComma: "all",
  printWidth: 120,
};

function removeSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw ERRORS.create("sskr-glue-missing", [`${startMarker.trim()}`]);
  return source.slice(0, start) + source.slice(end);
}

/**
 * wasm-bindgen's web glue can fetch the WASM by URL. MnemoCode checks the WASM bytes itself and
 * passes them to initSync (src/sskr/runtime.ts), so the loader and the async start are removed.
 */
function offlineGlue(glue) {
  const asyncExport = "\nexport { initSync, __wbg_init as default };";
  const withoutLoader = removeSection(glue, "\nasync function __wbg_load", "\nfunction initSync");
  const withoutAsyncStart = removeSection(
    withoutLoader,
    "\nasync function __wbg_init",
    asyncExport,
  ).replace(asyncExport, "\nexport { initSync };");
  const offline = withoutAsyncStart.replace(
    "__wbg_init.__wbindgen_wasm_module = module;",
    "initSync.__wbindgen_wasm_module = module;",
  );
  // wasm-bindgen copies the recovered secret before freeing its WASM allocation. Erase that
  // allocation even when making the host copy fails; keep this transform reproducible.
  const recoveryOutput = `        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export2(r0, r1 * 1, 1);
        return v2;`;
  if (offline.split(recoveryOutput).length - 1 !== RECOVERY_ENTRY_POINTS)
    throw ERRORS.create("sskr-recovery-output-shape", []);
  const recovered = offline.replaceAll(
    recoveryOutput,
    `        var v2 = getArrayU8FromWasm0(r0, r1);
        try {
            return v2.slice();
        } finally {
            try {
                v2.fill(0);
            } finally {
                wasm.__wbindgen_export2(r0, r1 * 1, 1);
            }
        }`,
  );
  // A String's Rust owner is transferred to wasm-bindgen. Wipe its WASM allocation
  // before free, including a failed host decode; never edit generated glue by hand.
  const creationOutput = `        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);`;
  if (recovered.split(creationOutput).length - 1 !== CREATION_ENTRY_POINTS)
    throw ERRORS.create("sskr-creation-output-shape", []);
  const result = recovered.replaceAll(
    creationOutput,
    `        try {
            if (deferred5_0 !== undefined) {
                getArrayU8FromWasm0(deferred5_0, deferred5_1).fill(0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);
        }`,
  );
  if (/\bfetch\s*\(|import\.meta|__wbg_load|\b__wbg_init\b/u.test(result)) {
    throw ERRORS.create("sskr-glue-still-network-loader-async-start", []);
  }
  return result;
}

/** The declarations without the async start that offlineGlue removes. */
function offlineDeclarations(declarations) {
  const start = declarations.lastIndexOf("export default function __wbg_init");
  const documentation = declarations.lastIndexOf("\n/**", start);
  if (start < 0 || documentation < 0) {
    throw ERRORS.create("sskr-declarations-missing-documented-async-start", []);
  }
  if (!/^export default function __wbg_init[^\n]*;\s*$/u.test(declarations.slice(start))) {
    throw ERRORS.create("sskr-declarations-more-after-async-start", []);
  }
  return `${declarations.slice(0, documentation).trimEnd()}\n`;
}

/** Runs the container and returns the four generated files by name. */
async function build(output) {
  execFileSync(
    "docker",
    [
      "build",
      // The toolchain stage downloads the x86-64 builds of Node.js and rustup, so the image is
      // x86-64 on every host; another platform would fail or give other bytes.
      "--platform",
      "linux/amd64",
      "--file",
      join(root, "Dockerfile.sskr"),
      "--target",
      "output",
      "--output",
      `type=local,dest=${output}`,
      join(bridge, "rust"),
    ],
    { stdio: "inherit" },
  );
  const read = (name) => readFileSync(join(output, name));
  return {
    [`${GLUE_STEM}_bg.wasm`]: read(`${GLUE_STEM}_bg.wasm`),
    [`${GLUE_STEM}.js`]: Buffer.from(offlineGlue(read(`${GLUE_STEM}.js`).toString("utf8"))),
    [`${GLUE_STEM}.d.ts`]: Buffer.from(
      await format(
        offlineDeclarations(read(`${GLUE_STEM}.d.ts`).toString("utf8")),
        DECLARATION_STYLE,
      ),
    ),
    [`${GLUE_STEM}_bg.wasm.d.ts`]: Buffer.from(
      await format(read(`${GLUE_STEM}_bg.wasm.d.ts`).toString("utf8"), DECLARATION_STYLE),
    ),
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every shipped Rust input, including the patched dependency, plus the canonical build rules. */
function inputPaths() {
  const rust = join(bridge, "rust");
  const sources = readdirSync(rust, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(bridge, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((path) => !path.startsWith("rust/target/"));
  return [...sources.sort(), "../Dockerfile.sskr", "../scripts/build-sskr-wasm.mjs"];
}

/** Generated outputs and their build inputs share one complete integrity inventory. */
function integrityPaths(files) {
  return [...Object.keys(files).map((name) => "generated/" + name), ...inputPaths()];
}

const output = mkdtempSync(join(tmpdir(), "mnemocode-sskr-"));
const removeOutput = () => rmSync(output, { recursive: true, force: true });
try {
  const files = await build(output);
  if (checkOnly) {
    let differences = 0;
    for (const [name, bytes] of Object.entries(files)) {
      const same = bytes.equals(readFileSync(join(generated, name)));
      if (!same) differences += 1;
      console.log(`${same ? "same" : "DIFFERENT"}  ${name}  ${sha256(bytes)}`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const paths = integrityPaths(files);
    for (const path of paths) {
      if (manifest[path] !== sha256(readFileSync(join(bridge, path)))) differences += 1;
    }
    if (Object.keys(manifest).length !== paths.length) differences += 1;
    if (differences > 0) {
      console.error(`${differences} rebuilt SSKR output or integrity pin difference(s).`);
      process.exitCode = 1;
    } else {
      console.log("The rebuilt SSKR engine equals sskr-wasm/generated byte for byte.");
    }
  } else {
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(generated, name), bytes);
    // Every pinned file is hashed again, the Rust inputs included; the order of the pins stays.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const paths = integrityPaths(files);
    for (const path of Object.keys(manifest)) {
      if (!paths.includes(path)) delete manifest[path];
    }
    for (const path of paths) {
      manifest[path] = sha256(readFileSync(join(bridge, path)));
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("Wrote sskr-wasm/generated and sskr-wasm/integrity.json.");
  }
} catch (error) {
  // A folder that cannot be removed is named beside the failure, never in its place (CORE-22).
  throw await afterFailure(error, removeOutput);
}
removeOutput();
