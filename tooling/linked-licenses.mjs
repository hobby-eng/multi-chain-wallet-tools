import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LAUNCHER_PLATFORMS } from "./key-derivation-launchers.mjs";
import { isMainScript } from "./run-script.mjs";
import { resolveRustToolchain } from "./rust-toolchain.mjs";
import { TOOLCHAIN_PINS } from "./toolchain-pins.mjs";

/**
 * The license texts of every crate that this project's Rust products link, read from the crates'
 * own sources: MIT, the BSD licenses and Blue Oak ask for their notices to travel with the
 * binary, which every flat release carries beside its files (release-legal-documents.mjs). The
 * crates are those that `cargo metadata` gives for a product's targets and that it reaches
 * through normal dependencies; procedural macros run only while it is built and are left out. Of
 * a crate offered under several licenses, MIT is taken where it is one of them. A crate under CC0
 * asks for no notice and is only listed. The choice of licence and of licence files is a copy of
 * MnemoCode's scripts/sskr-licenses.mjs, whose file for the SSKR engine the MnemoCode intake
 * brings: a change goes to both.
 *
 *   node tooling/linked-licenses.mjs               writes every product's LINKED_LICENSES.txt and
 *                                                  the Rust standard library's notice
 *   node tooling/linked-licenses.mjs --check       fails when a file is not what its crates give
 *   node tooling/linked-licenses.mjs --check-locks fails when a file was written from another
 *                                                  Cargo.lock; needs no Rust, for `pnpm check`
 *
 * Writing and --check read the crates offline, from the Cargo home that the build uses.
 */

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const LICENSE_ERRORS = Object.freeze({
  "no-license-file": "linked-licenses.no-license-file",
  "supplied-commit": "linked-licenses.supplied-commit",
  stale: "linked-licenses.stale",
});

/** A refusal of the license files, with a stable code. */
export class LinkedLicensesError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "LinkedLicensesError";
    this.code = LICENSE_ERRORS[kind];
  }
}

/** Every Rust product of this project that a release distributes, with its crate and file. */
export const LINKED_LICENSE_PRODUCTS = Object.freeze(
  [
    {
      id: "recovery-envelope-wasm",
      title: "the Gordian Envelope WebAssembly (recovery-envelope-wasm)",
      crate: "packages/recovery-envelope-wasm/rust",
      output: "packages/recovery-envelope-wasm/LINKED_LICENSES.txt",
      targets: ["wasm32-unknown-unknown"],
    },
    {
      id: "recovery-codex32-wasm",
      title: "the Codex32 WebAssembly (recovery-codex32-wasm)",
      crate: "packages/recovery-codex32-wasm/rust",
      output: "packages/recovery-codex32-wasm/LINKED_LICENSES.txt",
      targets: ["wasm32-unknown-unknown"],
    },
    {
      id: "dash-shielded-wasm",
      title: "the Dash Shielded WebAssembly (dash-shielded-wasm)",
      crate: "packages/dash-shielded-wasm/rust",
      output: "packages/dash-shielded-wasm/LINKED_LICENSES.txt",
      targets: ["wasm32-unknown-unknown"],
    },
    {
      id: "key-derivation-launcher",
      title: "the executable Key Derivation Tool (apps/key-derivation/launcher)",
      crate: "apps/key-derivation/launcher",
      output: "apps/key-derivation/launcher/LINKED_LICENSES.txt",
      // The crates of every platform a release builds it for, together.
      targets: [...new Set(Object.values(LAUNCHER_PLATFORMS).map(({ target }) => target))],
    },
  ].map((product) => Object.freeze({ ...product, targets: Object.freeze(product.targets) })),
);

/** The files of a crate that hold its license or its notices. */
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-.][\w.-]*)?$/iu;
/**
 * What a crate bundles under a license of its own, below its folder: secp256k1-sys compiles the C
 * library libsecp256k1, which is under MIT, while the crate itself is under CC0.
 */
const BUNDLED = Object.freeze({
  "secp256k1-sys": { files: ["depend/secp256k1/COPYING"], license: "MIT for libsecp256k1" },
});
/**
 * License files that a crate's repository holds but its published package lacks, kept in
 * tooling/linked-license-texts/ as they are at the commit the package was published from, which
 * its .cargo_vcs_info.json names. Another commit, as a new version brings, is refused until its
 * files are taken again.
 */
const SUPPLIED = Object.freeze({
  "blake2b_simd 1.0.5": {
    repository: "github.com/oconnor663/blake2_simd",
    commit: "47714dc3c424e82213d7f2eb4a833e3843017be5",
    folder: "oconnor663-blake2-simd-47714dc",
    files: ["LICENSE"],
  },
  "frost-core 3.0.0": {
    repository: "github.com/ZcashFoundation/frost",
    commit: "2016e44ba4a4757a996300350063b937a2ad33e8",
    folder: "zcashfoundation-frost-2016e44",
    files: ["LICENCE", "LICENCE.MIT"],
  },
  "frost-rerandomized 3.0.0": {
    repository: "github.com/ZcashFoundation/frost",
    commit: "2016e44ba4a4757a996300350063b937a2ad33e8",
    folder: "zcashfoundation-frost-2016e44",
    files: ["LICENCE", "LICENCE.MIT"],
  },
  "halo2_poseidon 0.1.0": {
    repository: "github.com/zcash/halo2",
    commit: "f066ace1f234d7fe1908851ed86b1801e0b1ffea",
    folder: "zcash-halo2-f066ace",
    files: ["COPYING.md", "LICENSE-MIT"],
  },
});
/**
 * The Rust standard library's own notices, which the toolchain writes for binaries that link it:
 * every product here does. Kept byte for byte as the pinned toolchain has it, named by its version,
 * so that a new toolchain asks for its file before any gate passes.
 */
export const RUST_LIBRARY_NOTICE = `notices/rust-${TOOLCHAIN_PINS.rust}-library-NOTICE.html`;

/** The library notice of the pinned toolchain as installed, wherever its host is. */
function toolchainLibraryNotice(root) {
  const { rustupHome } = resolveRustToolchain(root);
  const toolchains = rustupHome === undefined ? [] : readdirSync(join(rustupHome, "toolchains"));
  const pinned = toolchains.find((name) => name.startsWith(`${TOOLCHAIN_PINS.rust}-`));
  if (pinned === undefined)
    throw new LinkedLicensesError(
      "stale",
      `Rust ${TOOLCHAIN_PINS.rust} is not installed, so its library notice cannot be read.`,
    );
  return readFileSync(
    join(rustupHome, "toolchains", pinned, "share/doc/rust/COPYRIGHT-library.html"),
  );
}

/** The line of a written file that names the Cargo.lock it was written from. */
const LOCK_LINE = /^Cargo\.lock SHA-256: ([0-9a-f]{64})$/mu;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The licenses that `expression` offers to choose from: those of its group in parentheses, or all
 * of it when it has none; with the text that offers them.
 */
function alternatives(expression) {
  const offered = expression.match(/\(([^()]*)\)|^([^()]*)$/u);
  const text = offered?.[1] === undefined ? (offered?.[2] ?? "") : `(${offered[1]})`;
  return { text, choice: text.replace(/^\(|\)$/gu, "").split(/\s+OR\s+|\//u) };
}

/** The license taken of `expression`: MIT where it is one of several offered, else all of it. */
export function takenLicense(expression) {
  const { text, choice } = alternatives(expression);
  return choice.includes("MIT") && choice.length > 1 ? expression.replace(text, "MIT") : expression;
}

/** The licenses offered beside MIT that are left out where MIT is taken. */
export function licensesNotTaken(expression) {
  const { choice } = alternatives(expression);
  return choice.includes("MIT") && choice.length > 1
    ? choice.filter((license) => license !== "MIT")
    : [];
}

/** Whether the license file `file` holds the text of one of `licenses`, by its name. */
function names(file, licenses) {
  return licenses.some((license) =>
    file.toLowerCase().includes(license.split("-")[0].toLowerCase()),
  );
}

/** The crates that `product` links on any of its targets, by name and version, with folders. */
function linkedCrates(product, root, toolchain) {
  const crates = new Map();
  for (const target of product.targets) {
    const metadata = JSON.parse(
      execFileSync(
        toolchain.cargo,
        ["metadata", "--offline", "--locked", "--format-version", "1", "--filter-platform", target],
        {
          cwd: resolve(root, product.crate),
          env: toolchain.environment,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        },
      ),
    );
    const packages = new Map(metadata.packages.map((item) => [item.id, item]));
    const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
    const procedural = (item) => item.targets.some((each) => each.kind.includes("proc-macro"));
    const reached = new Set();
    const waiting = [metadata.resolve.root];
    while (waiting.length > 0) {
      const id = waiting.pop();
      if (reached.has(id)) continue;
      reached.add(id);
      for (const dependency of nodes.get(id).deps) {
        // A normal dependency has a kind of null; build and development ones are not linked.
        const normal = dependency.dep_kinds.some((kind) => kind.kind === null);
        if (normal && !procedural(packages.get(dependency.pkg))) waiting.push(dependency.pkg);
      }
    }
    reached.delete(metadata.resolve.root);
    for (const item of [...reached].map((id) => packages.get(id)))
      crates.set(`${item.name} ${item.version}`, {
        name: item.name,
        version: item.version,
        license: item.license ?? "",
        folder: dirname(item.manifest_path),
      });
  }
  // Plain code-unit order, the same on every system, as the file is compared byte for byte.
  return [...crates.values()].sort((a, b) =>
    `${a.name} ${a.version}` < `${b.name} ${b.version}` ? -1 : 1,
  );
}

/** The supplied license files of `crate`, after checking the commit its package came from. */
function suppliedTexts(crate, root) {
  const supplied = SUPPLIED[`${crate.name} ${crate.version}`];
  if (supplied === undefined) return [];
  const vcs = join(crate.folder, ".cargo_vcs_info.json");
  const published = existsSync(vcs) ? JSON.parse(readFileSync(vcs, "utf8")).git?.sha1 : undefined;
  if (published !== supplied.commit)
    throw new LinkedLicensesError(
      "supplied-commit",
      `${crate.name} ${crate.version} was published from ${published ?? "an unnamed commit"}, not from the commit whose license files are kept.`,
    );
  return supplied.files.map((file) => ({
    file: `${file} (${supplied.repository} at ${supplied.commit})`,
    text: readFileSync(
      resolve(root, "tooling/linked-license-texts", supplied.folder, `${file}.txt`),
      "utf8",
    ).trim(),
  }));
}

/**
 * The license texts that `crate` asks to travel with the binary, each with its file: those of the
 * license taken, none for CC0, those of what it bundles under another license, and those kept
 * here for a package published without them (SUPPLIED).
 */
function licenseTexts(crate, root) {
  // A crate that follows REUSE keeps its license texts in LICENSES/, named by their licenses.
  const reuse = existsSync(join(crate.folder, "LICENSES"))
    ? readdirSync(join(crate.folder, "LICENSES")).map((file) => `LICENSES/${file}`)
    : [];
  const own =
    crate.license === "CC0-1.0"
      ? []
      : [...readdirSync(crate.folder).filter((file) => LICENSE_FILE.test(file)), ...reuse]
          .filter((file) => !names(file, licensesNotTaken(crate.license)))
          .sort();
  const texts = [...own, ...(BUNDLED[crate.name]?.files ?? [])]
    .filter((file) => existsSync(join(crate.folder, file)))
    .map((file) => ({ file, text: readFileSync(join(crate.folder, file), "utf8").trim() }));
  return [...texts, ...suppliedTexts(crate, root)];
}

/** The licenses of `crate`: the one taken, and any of what it bundles. */
function licensesOf(crate) {
  const bundled = BUNDLED[crate.name]?.license;
  const taken = takenLicense(crate.license);
  return bundled === undefined ? taken : `${taken}; ${bundled}`;
}

/** The text of `product`'s LINKED_LICENSES.txt, from its crates as they are now. */
export function linkedLicensesText(product, { root = defaultRoot } = {}) {
  const toolchain = resolveRustToolchain(root);
  const lock = sha256(readFileSync(resolve(root, product.crate, "Cargo.lock")));
  const crates = linkedCrates(product, root, toolchain);
  const rule = "=".repeat(78);
  const parts = [
    `Licenses of the crates linked into ${product.title}`,
    "",
    "Written by tooling/linked-licenses.mjs from the crates' own sources; do not edit it.",
    `Cargo.lock SHA-256: ${lock}`,
    `Targets: ${product.targets.join(", ")}`,
    "Of a crate offered under several licenses, MIT is taken where it is one of them.",
    "A crate under CC0-1.0 asks for no notice and is only listed.",
    "",
    ...crates.map((crate) => `${crate.name} ${crate.version}: ${licensesOf(crate)}`),
  ];
  for (const crate of crates) {
    const texts = licenseTexts(crate, root);
    if (texts.length === 0 && crate.license === "CC0-1.0") continue;
    if (texts.length === 0)
      throw new LinkedLicensesError(
        "no-license-file",
        `${crate.name} ${crate.version} holds no file of its license.`,
      );
    parts.push("", rule, `${crate.name} ${crate.version}: ${licensesOf(crate)}`, rule);
    for (const { file, text } of texts) parts.push("", `--- ${file}`, "", text);
  }
  return `${parts.join("\n")}\n`;
}

/**
 * Refuses a written file whose Cargo.lock has changed since, without Rust: the crates and their
 * sources follow from the lock, whose checksums pin them, so the same lock gives the same file.
 */
export function assertLinkedLicenseLocks({ root = defaultRoot } = {}) {
  if (!existsSync(resolve(root, RUST_LIBRARY_NOTICE)))
    throw new LinkedLicensesError(
      "stale",
      `${RUST_LIBRARY_NOTICE}, the library notice of the pinned Rust, is missing: run node tooling/linked-licenses.mjs.`,
    );
  for (const product of LINKED_LICENSE_PRODUCTS) {
    const output = resolve(root, product.output);
    const written = existsSync(output) ? LOCK_LINE.exec(readFileSync(output, "utf8"))?.[1] : null;
    const lock = sha256(readFileSync(resolve(root, product.crate, "Cargo.lock")));
    if (written !== lock)
      throw new LinkedLicensesError(
        "stale",
        `${product.output} was not written from ${product.crate}/Cargo.lock as it is: run node tooling/linked-licenses.mjs.`,
      );
  }
}

/** Refuses a written file that is not what its crates give now; reads the crates offline. */
export function assertLinkedLicenses({ root = defaultRoot } = {}) {
  const notice = resolve(root, RUST_LIBRARY_NOTICE);
  if (!existsSync(notice) || !readFileSync(notice).equals(toolchainLibraryNotice(root)))
    throw new LinkedLicensesError(
      "stale",
      `${RUST_LIBRARY_NOTICE} is not the library notice of the installed Rust ${TOOLCHAIN_PINS.rust}: run node tooling/linked-licenses.mjs.`,
    );
  for (const product of LINKED_LICENSE_PRODUCTS) {
    const output = resolve(root, product.output);
    if (
      !existsSync(output) ||
      readFileSync(output, "utf8") !== linkedLicensesText(product, { root })
    )
      throw new LinkedLicensesError(
        "stale",
        `${product.output} is not what the linked crates give: run node tooling/linked-licenses.mjs.`,
      );
  }
}

if (isMainScript(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--check-locks")) {
    assertLinkedLicenseLocks();
    console.log("Every license file of the linked crates matches its Cargo.lock.");
  } else if (args.includes("--check")) {
    assertLinkedLicenses();
    console.log("The license files of the linked crates are current.");
  } else {
    writeFileSync(resolve(defaultRoot, RUST_LIBRARY_NOTICE), toolchainLibraryNotice(defaultRoot));
    console.log(`Wrote ${RUST_LIBRARY_NOTICE}.`);
    for (const product of LINKED_LICENSE_PRODUCTS) {
      writeFileSync(resolve(defaultRoot, product.output), linkedLicensesText(product));
      console.log(`Wrote ${product.output}.`);
    }
  }
}
