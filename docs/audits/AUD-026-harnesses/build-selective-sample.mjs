// AUD-026 build reviewer: compiles every job of the smoke matrix (tooling/build-matrix-plan.mjs)
// one by one, continuing past a failure (the repository's --matrix --smoke stops at the first), plus
// representative selective builds the smoke plan does not contain, each with the unmodified builder
// script and --output in the scratch folder given as the first argument. For each built page it
// counts marker texts of the coins and features the build left out, so that a reviewer can check
// physical exclusion beyond the builders' own graph assertions. Writes a JSON summary next to the
// pages. Exit 1 when any build fails or an excluded marker is found.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuildMatrixSmokePlan } from "../../../tooling/build-matrix-plan.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const scratch = resolve(
  process.argv[2] ?? resolve(root, "../tmp/wallet-tools/aud026/build/selective"),
);
const only = process.argv[3]; // optional: "smoke" or "extra"
mkdirSync(scratch, { recursive: true });
const scripts = {
  "key-derivation": "apps/key-derivation/scripts/build-key-derivation-html.mjs",
  "activity-viewer": "apps/activity-viewer/scripts/build-activity-viewer-html.mjs",
  "discovery-scanner": "apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs",
  "psbt-inspector": "apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs",
};
const ALL = { bitcoin: true, dash: true, ethereum: true };
const extra = [
  ["E01 no default coin", "multi-chain", "key-derivation", ["--coins", "dash,ethereum"]],
  ["E02 KD without mhfe", "multi-chain", "key-derivation", ["--exclude", "mhfe"]],
  ["E03 KD without mnemocode", "multi-chain", "key-derivation", ["--exclude", "mnemocode"]],
  [
    "E04 KD ethereum derive",
    "multi-chain",
    "key-derivation",
    ["--coins", "ethereum", "--features", "derive"],
  ],
  [
    "E05 KD mnemocode+sskr no cards",
    "multi-chain",
    "key-derivation",
    ["--coins", "bitcoin,dash", "--features", "derive,mnemocode,sskr"],
  ],
  ["E06 KD without sskr", "multi-chain", "key-derivation", ["--exclude", "sskr"]],
  ["E07 Dash KD without mhfe", "dash-community", "key-derivation", ["--exclude", "mhfe"]],
  ["E08 KD all coins derive only", "multi-chain", "key-derivation", ["--features", "derive"]],
  ["E09 Dash KD derive+mhfe", "dash-community", "key-derivation", ["--features", "derive,mhfe"]],
  [
    "E10 documented watch-only example",
    "multi-chain",
    "discovery-scanner",
    ["--coins", "bitcoin,ethereum", "--features", "watch-only-discovery"],
  ],
  [
    "E11 discovery ethereum watch-only",
    "multi-chain",
    "discovery-scanner",
    ["--coins", "ethereum", "--features", "watch-only-discovery"],
  ],
  [
    "E12 discovery no default coin",
    "multi-chain",
    "discovery-scanner",
    ["--coins", "dash,ethereum"],
  ],
  [
    "E13 Dash discovery seed only",
    "dash-community",
    "discovery-scanner",
    ["--features", "seed-discovery"],
  ],
  [
    "E14 activity bitcoin+ethereum",
    "multi-chain",
    "activity-viewer",
    ["--coins", "bitcoin,ethereum"],
  ],
  [
    "E15 psbt dash decoder",
    "multi-chain",
    "psbt-inspector",
    ["--coins", "dash", "--features", "psbt-decoder"],
  ],
  [
    "E16 KD mhfe without mnemocode, ethereum",
    "multi-chain",
    "key-derivation",
    ["--coins", "ethereum", "--features", "derive,mhfe"],
  ],
];

/** Marker texts that must not appear when the coin or feature is left out. */
const MARKERS = {
  coin: {
    bitcoin: [
      /\bP2WPKH\b/u,
      /\bbitcoin-native-segwit\b/u,
      /btcutil-js/u,
      /BIP0322-signed-message/u,
    ],
    ethereum: [/\bEIP-55\b/u, /\bethereum-rpc\.publicnode/u, /"ethereum"/u],
    dash: [/\bdash-platform\b/u, /dash_shielded_wasm/u, /\bDIP-?13\b/u],
  },
  "key-derivation": {
    mhfe: [/createArgon2Mt/u, /MhfeWallet/u, /wallet-check-enabled/u, /mhfe-panel/u],
    mnemocode: [/mnemocode-panel/u, /MnemoCode/u],
    "mnemocode-cards": [/mnemocode-cards-section/u, /pdf-lib/u],
    sskr: [/recovery_sskr_wasm/u, /sskr-panel/u],
    slip39: [/slip39-panel/u],
    codex32: [/recovery_codex32_wasm/u, /codex32-panel/u],
    "gordian-envelope": [/recovery_envelope_wasm/u, /gordian-envelope-panel/u],
    seedqr: [/seedqr-panel/u],
    bip85: [/bip85-panel|BIP85 child/u],
    "silent-payments": [/silent-payment/u],
    "wallet-matcher": [/wallet-matcher-panel/u],
  },
};

function parse(args) {
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1].split(",") : undefined;
  };
  return { coins: value("--coins"), features: value("--features"), exclude: value("--exclude") };
}

function excludedMarkers(toolId, profileId, args, html) {
  const { coins, features, exclude } = parse(args);
  const selectedCoins = new Set(
    coins ?? (profileId === "dash-community" ? ["dash"] : Object.keys(ALL)),
  );
  const hits = [];
  for (const [coin, patterns] of Object.entries(MARKERS.coin)) {
    if (selectedCoins.has(coin)) continue;
    // The PSBT Inspector shares decoders whose Bitcoin terms the Dash gate allowlists.
    if (toolId === "psbt-inspector") continue;
    for (const pattern of patterns) {
      const count = [...html.matchAll(new RegExp(pattern.source, "gu"))].length;
      if (count > 0) hits.push(`${coin}:${pattern.source}=${count}`);
    }
  }
  const featureMarkers = MARKERS[toolId];
  if (featureMarkers !== undefined) {
    for (const [feature, patterns] of Object.entries(featureMarkers)) {
      const left =
        (features !== undefined && !features.includes(feature)) ||
        (exclude !== undefined && exclude.includes(feature)) ||
        (feature === "mnemocode-cards" && exclude?.includes("mnemocode"));
      if (!left) continue;
      for (const pattern of patterns) {
        const count = [...html.matchAll(new RegExp(pattern.source, "gu"))].length;
        if (count > 0) hits.push(`${feature}:${pattern.source}=${count}`);
      }
    }
  }
  return hits;
}

const jobs = [];
if (only !== "extra")
  for (const [index, job] of createBuildMatrixSmokePlan().entries()) {
    const args = ["--profile", job.profileId, "--coins", job.coins.join(",")];
    if (job.features.length > 0) args.push("--features", job.features.join(","));
    jobs.push([`S${String(index + 1).padStart(2, "0")}`, job.profileId, job.toolId, args]);
  }
if (only !== "smoke")
  for (const [label, profileId, toolId, args] of extra)
    jobs.push([label, profileId, toolId, ["--profile", profileId, ...args]]);

const results = [];
for (const [label, profileId, toolId, args] of jobs) {
  const output = resolve(scratch, `${label.split(" ")[0]}.html`);
  const started = Date.now();
  const run = spawnSync(
    process.execPath,
    [resolve(root, scripts[toolId]), ...args, "--output", output],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const result = { label, profileId, toolId, args, status: run.status, ms: Date.now() - started };
  if (run.status === 0) {
    const html = readFileSync(output, "utf8");
    result.bytes = Buffer.byteLength(html);
    result.excludedMarkers = excludedMarkers(toolId, profileId, args, html);
  } else {
    result.error = `${run.stderr}`
      .split("\n")
      .filter((line) => /Error|error:/u.test(line))
      .slice(0, 3)
      .join(" | ");
    result.detail = `${run.stderr}`.slice(0, 1500);
  }
  results.push(result);
  const flag = run.status !== 0 ? "FAIL" : result.excludedMarkers.length > 0 ? "MARK" : "ok";
  console.log(
    `${flag.padEnd(4)} ${label} ${toolId} ${args.join(" ")}${run.status !== 0 ? `\n     ${result.error}` : result.excludedMarkers.length > 0 ? `\n     excluded markers: ${result.excludedMarkers.join(", ")}` : ""}`,
  );
}
writeFileSync(
  resolve(scratch, "build-selective-summary.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
const failed = results.filter((result) => result.status !== 0);
const marked = results.filter((result) => result.status === 0 && result.excludedMarkers.length > 0);
console.log(
  `Jobs: ${results.length}; build failures: ${failed.length}; builds with excluded markers: ${marked.length}`,
);
if (failed.length > 0 || marked.length > 0) process.exitCode = 1;
