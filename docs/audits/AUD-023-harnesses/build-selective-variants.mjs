// AUD-023 build reviewer harness: builds a small representative set of selective Deriver variants
// outside dist/, then checks each built page statically (one BIP39 wordlist, one copy of each WASM
// its features need and none of the others, no http(s) URL outside the reviewed links, no code or
// vectors of a coin or feature the build leaves out). Public test data only.
//
//   node docs/audits/AUD-023-harnesses/build-selective-variants.mjs build <variant-id>
//   node docs/audits/AUD-023-harnesses/build-selective-variants.mjs reject
//   node docs/audits/AUD-023-harnesses/build-selective-variants.mjs scan
//
// `build` writes docs/audits/AUD-023-evidence/builds/build/<id>.html (and the
// builder's .sha256 sidecar) and nothing else. `reject` runs combinations the builder must refuse
// and checks that each fails and writes no file. `scan` exits 1 when any built variant breaks one
// of its expectations, and prints every violation.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const out = resolve(root, "docs/audits/AUD-023-evidence/builds/build");
const builder = resolve(root, "apps/key-derivation/scripts/build-key-derivation-html.mjs");

const ALL_RECOVERY = "seedqr,mnemocode,mnemocode-cards,mhfe,slip39,codex32,sskr,gordian-envelope";
export const VARIANTS = {
  "kd-no-bitcoin": { profile: "multi-chain", args: ["--coins", "dash,ethereum"] },
  "kd-no-dash": { profile: "multi-chain", args: ["--coins", "bitcoin,ethereum"] },
  "kd-no-sskr": { profile: "multi-chain", args: ["--exclude", "sskr"] },
  "kd-recovery-only": {
    profile: "multi-chain",
    args: ["--coins", "ethereum", "--features", `derive,wallet-matcher,${ALL_RECOVERY}`],
  },
  "kd-dash-alone": { profile: "multi-chain", args: ["--coins", "dash"] },
  "kd-bitcoin-alone": { profile: "multi-chain", args: ["--coins", "bitcoin"] },
  "kd-dash-community-no-sskr": { profile: "dash-community", args: ["--exclude", "sskr"] },
};

// Distinctive public test vectors and code markers of each coin (sources named per entry).
const COIN_MARKERS = {
  bitcoin: [
    // message-signer-self-test.ts: Bitcoin compact signature address of the private key 1.
    "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
    // message-signer-self-test.ts: BIP-322 specification address.
    "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
    // bip38-self-test.ts: BIP38's official compressed vector.
    "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
  ],
  dash: [
    // message-signer-self-test.ts and message-signer-self-test-dash.ts: Dash compact signature.
    "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
    // bip38-self-test.ts and bip38-self-test-dash.ts: the Dash Core BIP38 vector.
    "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
    // MnemoCode core/coins/dash-self-test.ts.
    "XbAei18dD6mdL9LR6sTmbFJTQAJBcpxuxL",
  ],
  ethereum: [
    // MnemoCode core/coins/evm-self-test.ts (BIP44 Ethereum address of "abandon ... about").
    "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    // MnemoCode core/coins/evm.ts coin name.
    "Ethereum and EVM networks",
  ],
};
// Coins MnemoCode recognises that no Deriver build selects: present only with Bitcoin by design.
const MNEMOCODE_OTHER_COIN_MARKERS = [
  "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
  "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
];

const WASM = {
  dash: "packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm",
  codex32: "packages/recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm",
  sskr: "packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
  "gordian-envelope": "packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
  mhfe: "packages/recovery-mhfe-wasm/generated/runtime/mhfe.wasm",
};
// The reviewed open-source links of verify-key-derivation-artifact.mjs, plus the SVG namespace.
const ALLOWED_URLS = new Set([
  "http://www.w3.org/2000/svg",
  "https://github.com/SeedSigner/seedsigner/tree/dev/docs/seed_qr",
  "https://github.com/unjs/uqr",
  "https://github.com/paulmillr/qr",
  "https://github.com/hobby-eng/mnemocode",
  "https://github.com/trezor/python-shamir-mnemonic",
  "https://github.com/BlockchainCommons/bc-sskr-rust",
  "https://github.com/BlockchainCommons/bc-envelope-rust",
  "https://github.com/BlockchainCommons/bc-components-rust",
  "https://github.com/apoelstra/rust-codex32",
  "https://github.com/hobby-eng/mhfe-spec",
  "https://github.com/hobby-eng/mhfe",
]);

function variantFeatures(id) {
  // What each variant must and must not contain, read from its arguments.
  const { profile, args } = VARIANTS[id];
  const value = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1].split(",");
  };
  const coins =
    value("--coins") ?? (profile === "dash-community" ? ["dash"] : Object.keys(COIN_MARKERS));
  const allFeatures = ["mhfe", "codex32", "sskr", "gordian-envelope", "mnemocode"];
  const included = value("--features") ?? allFeatures;
  const excluded = value("--exclude") ?? [];
  const features = included.filter((feature) => !excluded.includes(feature));
  return { coins, features };
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function scanVariant(id) {
  const path = resolve(out, `${id}.html`);
  if (!existsSync(path)) return [`${id}: not built`];
  const html = readFileSync(path, "utf8");
  const { coins, features } = variantFeatures(id);
  const violations = [];
  const wordlists =
    count(html, "abandon\nability\nable\nabout") + count(html, "abandon\\nability\\nable\\nabout");
  if (wordlists !== 1) violations.push(`${id}: ${wordlists} BIP39 wordlists`);
  for (const [owner, file] of Object.entries(WASM)) {
    const copies = count(html, readFileSync(resolve(root, file)).toString("base64"));
    const expected = owner === "dash" ? coins.includes("dash") : features.includes(owner);
    if (copies !== (expected ? 1 : 0))
      violations.push(`${id}: ${copies} copies of the ${owner} WASM`);
  }
  for (const url of new Set(html.match(/https?:\/\/[^\s"'`<>)\\]+/giu) ?? [])) {
    if (!ALLOWED_URLS.has(url)) violations.push(`${id}: URL outside the reviewed links: ${url}`);
  }
  for (const [coin, markers] of Object.entries(COIN_MARKERS)) {
    if (coins.includes(coin)) continue;
    for (const marker of markers)
      if (html.includes(marker))
        violations.push(`${id}: excluded coin ${coin} still has ${marker}`);
  }
  if (!coins.includes("bitcoin"))
    for (const marker of MNEMOCODE_OTHER_COIN_MARKERS)
      if (html.includes(marker))
        violations.push(`${id}: MnemoCode coin marker ${marker} without Bitcoin`);
  if (!features.includes("sskr")) {
    for (const marker of [
      'id="sskr-panel"',
      'id="mnemocode-restore-panel"',
      'id="mnemocode-split-section"',
    ])
      if (html.includes(marker)) violations.push(`${id}: SSKR excluded but ${marker} remains`);
  }
  console.log(
    `${id}: ${html.length} bytes, coins ${coins.join("+")}, features ${features.join("+")}, ` +
      `${wordlists} wordlist(s), Bitcoin markers ${COIN_MARKERS.bitcoin.filter((m) => html.includes(m)).length}, ` +
      `Dash markers ${COIN_MARKERS.dash.filter((m) => html.includes(m)).length}, ` +
      `Ethereum markers ${COIN_MARKERS.ethereum.filter((m) => html.includes(m)).length}`,
  );
  return violations;
}

const REJECTED = [
  ["dash-community", ["--coins", "bitcoin"]],
  ["dash-community", ["--coins", "dash,ethereum"]],
  ["multi-chain", ["--exclude", "derive"]],
  ["multi-chain", ["--features", "derive,mnemocode-cards"]],
  ["multi-chain", ["--coins", "dash", "--features", "derive,silent-payments"]],
  ["multi-chain", ["--coins", "ethereum", "--features", "derive,message-signing"]],
  ["multi-chain", ["--coins", "ethereum", "--features", "derive,bip38-encrypt"]],
  ["multi-chain", ["--coins", "bitcoin", "--exclude-coins", "bitcoin"]],
  ["multi-chain", ["--features", "derive,nonsense"]],
  ["multi-chain", ["--coins", ""]],
  ["multi-chain", ["--coins", "bitcoin,,dash"]],
];

// Imported by build-variant-startup.mjs for VARIANTS only; the commands run when called directly.
const [mode, id] = process.argv.slice(2);
const direct = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (!direct) {
  // Nothing to run.
} else if (mode === "build") {
  const variant = VARIANTS[id];
  if (variant === undefined) throw new Error(`Unknown variant ${id}.`);
  const output = resolve(out, `${id}.html`);
  const result = spawnSync(
    process.execPath,
    [builder, "--profile", variant.profile, ...variant.args, "--output", output],
    { cwd: root, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} else if (mode === "reject") {
  let failures = 0;
  for (const [index, [profile, args]] of REJECTED.entries()) {
    const output = resolve(out, `rejected-${index}.html`);
    rmSync(output, { force: true });
    const result = spawnSync(
      process.execPath,
      [builder, "--profile", profile, ...args, "--output", output],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    const message = `${result.stderr}`.split("\n").find((line) => /Error/u.test(line)) ?? "";
    const refused = result.status !== 0 && !existsSync(output);
    if (!refused) failures += 1;
    console.log(
      `${refused ? "refused" : "NOT REFUSED"}: --profile ${profile} ${args.join(" ")} -> ${message.trim()}`,
    );
  }
  process.exitCode = failures === 0 ? 0 : 1;
} else if (mode === "scan") {
  const violations = Object.keys(VARIANTS).flatMap(scanVariant);
  for (const violation of violations) console.log(`VIOLATION ${violation}`);
  process.exitCode = violations.length === 0 ? 0 : 1;
} else {
  throw new Error("Usage: build-selective-variants.mjs build <id> | reject | scan");
}
