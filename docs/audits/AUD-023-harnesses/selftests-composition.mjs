// AUD-023 selftests: builds selective artifacts of the four tools into the audit's scratch build
// folder (never dist/) and checks that each self-test, its name and its vector text come with its
// coin and feature only. It also reads the coordinator's Dash Community artifacts in dist/ (read
// only) for the new self-tests' Bitcoin/Ethereum vector text.
//
// Run (heavy: thirteen esbuild builds, one at a time):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/selftests-composition.mjs
// SKIP_BUILD=1 checks the artifacts of an earlier run without building again.
// Exit code 0 when every expectation holds, 1 when any fails.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const out = resolve(root, "docs/audits/AUD-023-evidence/builds/selftests");
mkdirSync(out, { recursive: true });

const MARK = {
  bip85: ["BIP85 BIP39 / WIF / XPRV / HEX", "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp"],
  silent: [
    "Silent Payments / BIP352",
    "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy",
  ],
  compactBitcoin: ["Compact message signatures", "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8Zx"],
  compactDash: [
    "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nk",
    "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
  ],
  bip322: ["BIP-322 simple signature vector", "smpAkgwRQIhAOzyynlqt93lOKJr"],
  bip38Bitcoin: ["6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7"],
  bip38Dash: ["6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH"],
  cards: ["MnemoCode share card known answers"],
  // Only the check's name: MnemoCode's own share known answers (vendored core) hold the same
  // shares and come with MnemoCode, not with the SSKR feature.
  sskr: ["SSKR published vector"],
  psbtBitcoin: [
    "Bitcoin PSBT decoding (BIP174)",
    "82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617b",
  ],
  psbtDash: [
    "Dash PSBT decoding",
    "8nL86iHTC8K4eVZ6YwyhRWMLhSauj8XQAK",
    "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVh",
  ],
  inspectorBip322: ["BIP-322 message verification vector"],
  inspectorBip38: ["BIP38 decryption vector", "1HmPbwsvG5qJ3KJfxzsZRZWhbm1xBMuS8B"],
  inspectorCompact: ["compact message verification"],
  descriptor: ["raw(deadbeef)#89f8spxm"],
  guard: ["Public-input guard refuses phrases, WIF and extended private keys"],
  lists: ["Candidate list import (age X25519, MNCL)", "AGE-SECRET-KEY-18SJMVMW"],
  btcAddress: ["Bitcoin BIP173/BIP350 address checksum"],
  ethAddress: ["Ethereum EIP-55 address checksum", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
};

const builds = [
  [
    "D-bitcoin",
    "key-derivation",
    ["--coins", "bitcoin"],
    {
      present: ["bip85", "silent", "compactBitcoin", "bip322", "bip38Bitcoin"],
      absent: ["compactDash", "bip38Dash"],
    },
  ],
  [
    "D-dash",
    "key-derivation",
    ["--coins", "dash"],
    {
      present: ["bip85", "compactDash", "bip38Dash"],
      absent: ["silent", "compactBitcoin", "bip322", "bip38Bitcoin"],
    },
  ],
  [
    "D-ethereum",
    "key-derivation",
    ["--coins", "ethereum"],
    {
      present: ["bip85"],
      absent: ["silent", "compactBitcoin", "compactDash", "bip322", "bip38Bitcoin", "bip38Dash"],
    },
  ],
  [
    "D-no-features",
    "key-derivation",
    ["--exclude", "bip85,silent-payments,bip38-encrypt,message-signing"],
    {
      present: [],
      absent: [
        "bip85",
        "silent",
        "compactBitcoin",
        "compactDash",
        "bip322",
        "bip38Bitcoin",
        "bip38Dash",
      ],
    },
  ],
  [
    "D-no-cards",
    "key-derivation",
    ["--exclude", "mnemocode-cards"],
    { present: ["sskr"], absent: ["cards"] },
  ],
  ["D-no-sskr", "key-derivation", ["--exclude", "sskr"], { present: ["cards"], absent: ["sskr"] }],
  [
    "P-bitcoin",
    "psbt-inspector",
    ["--coins", "bitcoin"],
    {
      present: ["psbtBitcoin", "inspectorBip322", "inspectorBip38", "descriptor"],
      absent: ["psbtDash"],
    },
  ],
  [
    "P-dash",
    "psbt-inspector",
    ["--coins", "dash"],
    {
      present: ["psbtDash", "descriptor"],
      absent: ["psbtBitcoin", "inspectorBip322", "inspectorBip38"],
    },
  ],
  [
    "P-bitcoin-script",
    "psbt-inspector",
    ["--coins", "bitcoin", "--features", "script-decoder"],
    {
      present: [],
      absent: ["psbtBitcoin", "inspectorBip38", "inspectorCompact", "descriptor", "psbtDash"],
    },
  ],
  [
    "S-watch-only",
    "discovery-scanner",
    ["--features", "watch-only-discovery"],
    { present: ["guard"], absent: ["lists"] },
  ],
  [
    "S-seed-only",
    "discovery-scanner",
    ["--features", "seed-discovery"],
    { present: ["lists"], absent: [] },
  ],
  [
    "V-dash",
    "activity-viewer",
    ["--coins", "dash"],
    { present: ["guard"], absent: ["btcAddress", "ethAddress"] },
  ],
  [
    "V-bitcoin",
    "activity-viewer",
    ["--coins", "bitcoin"],
    { present: ["guard", "btcAddress"], absent: ["ethAddress"] },
  ],
];
const SCRIPT = {
  "key-derivation": "apps/key-derivation/scripts/build-key-derivation-html.mjs",
  "psbt-inspector": "apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs",
  "discovery-scanner": "apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs",
  "activity-viewer": "apps/activity-viewer/scripts/build-activity-viewer-html.mjs",
};

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

for (const [id, tool, args, expected] of builds) {
  const path = `${out}/${id}.html`;
  if (process.env.SKIP_BUILD !== "1") {
    const run = spawnSync(
      process.execPath,
      [SCRIPT[tool], "--profile", "multi-chain", ...args, "--output", path],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    record(
      `${id}: build succeeds`,
      run.status === 0,
      (run.stderr || run.stdout).trim().slice(-600),
    );
    if (run.status !== 0) continue;
  }
  const html = readFileSync(path, "utf8");
  for (const key of expected.present) {
    const missing = MARK[key].filter((m) => !html.includes(m));
    record(`${id}: carries ${key}`, missing.length === 0, missing);
  }
  for (const key of expected.absent) {
    const found = MARK[key].filter((m) => html.includes(m));
    record(`${id}: carries no ${key}`, found.length === 0, found);
  }
}

// Dash Community artifacts of the coordinator's build: none of the new self-tests' Bitcoin or
// Ethereum names or vectors.
const DC = resolve(root, "dist/dash-community-edition");
const nonDash = [
  ...MARK.silent,
  ...MARK.compactBitcoin,
  ...MARK.bip322,
  ...MARK.bip38Bitcoin,
  ...MARK.psbtBitcoin,
  ...MARK.inspectorBip322,
  ...MARK.inspectorBip38,
  ...MARK.btcAddress,
  ...MARK.ethAddress,
  "BIP173",
  "EIP-55",
  "39bgKC7RFbpoCRbtD5KEdkYKtNyhpsNa3Z",
  "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
  "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
];
for (const file of [
  "key-derivation/Dash_Community_Key_Derivation_Tool.html",
  "psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html",
  "activity-viewer/Dash_Community_Activity_Viewer.html",
  "discovery-scanner/Dash_Community_Discovery_Scanner.html",
]) {
  const html = readFileSync(`${DC}/${file}`, "utf8");
  const found = nonDash.filter((m) => html.includes(m));
  record(
    `Dash Community ${file.split("/")[0]}: no Bitcoin/Ethereum self-test text`,
    found.length === 0,
    found,
  );
  // The Inspector's parser has its own reviewed allowlist of chain names in code
  // (tooling/verify-dash-community-artifacts.mjs); that is not this audit's scope.
  if (file.startsWith("psbt-inspector")) continue;
  const words = [...html.matchAll(/\b(bitcoin|ethereum|litecoin|dogecoin)\b/giu)]
    .map((m) => html.slice(m.index, m.index + 12))
    .filter((t) => t !== "Bitcoin seed");
  record(
    `Dash Community ${file.split("/")[0]}: forbidden coin words only as "Bitcoin seed"`,
    words.length === 0,
    [...new Set(words)].slice(0, 5),
  );
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}`);
  if (!r.ok) console.log(`     ${JSON.stringify(r.detail).slice(0, 500)}`);
}
console.log(`${results.length - failed}/${results.length} expectations held.`);
process.exit(failed === 0 ? 0 : 1);
