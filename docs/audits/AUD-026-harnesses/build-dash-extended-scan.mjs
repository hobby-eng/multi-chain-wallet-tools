// AUD-026 build reviewer: the owner's rule is that the Dash Community edition contains no other
// coin. tooling/verify-dash-community-artifacts.mjs checks a fixed list of words (Bitcoin,
// Litecoin, Dogecoin, Ethereum, some BIP numbers). This harness scans the four Dash Community pages
// in dist/ (or the pages given as arguments) for a wider list of other coins, address forms and
// protocols, and prints every hit with its surrounding text, so that a reviewer can tell user copy
// from code. The PSBT Inspector's shared-decoder terms that the gate allowlists are reported but not
// counted as failures. Exit 1 when any term outside that allowlist is found.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "../../../tooling/build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const profile = BUILD_PROFILES["dash-community"];
const pages =
  process.argv.length > 2
    ? process.argv.slice(2).map((path) => [path, "unknown"])
    : profileToolIds(profile).map((toolId) => [
        resolve(root, "dist", getToolBuild(profile, toolId).artifactRelativePath),
        toolId,
      ]);
// Other coins (names, tickers in copy, address prefixes) and Bitcoin-only or Ethereum-only protocols.
const TERMS = [
  [/\bLitecoin\b|\bLTC\b/giu, "Litecoin"],
  [/\bDogecoin\b|\bDOGE\b/gu, "Dogecoin"],
  [/\bBitcoin Cash\b|\bBCH\b|\bcashaddr\b/giu, "Bitcoin Cash"],
  [/\bCosmos\b|\bATOM\b|\bcosmos1/gu, "Cosmos"],
  [/\bXRP\b|\bRipple\b/gu, "XRP"],
  [
    /\bSolana\b|\bTron\b|\bTRX\b|\bCardano\b|\bMonero\b|\bZcash\b|\bPolygon\b|\bAvalanche\b|\bBNB\b/gu,
    "other chain name",
  ],
  [/\bEVM\b|\bKeccak\b|\bkeccak256\b|\bEIP-?\d+\b|\bERC-?20\b/gu, "Ethereum/EVM term"],
  [/\bbitcoin\b/giu, "bitcoin"],
  [/\bethereum\b|\bether\b|\bETH\b/giu, "ethereum"],
  [/\bbc1[qp]|\btb1[qp]|\bbcrt1/gu, "Bitcoin bech32 address prefix"],
  [/\b[xyzuv]pub\b/gu, "SLIP-132 prefix (ypub/zpub/upub/vpub; xpub is generic BIP32)"],
  [
    /\bSegWit\b|\bTaproot\b|\bSchnorr\b|\bMuSig2?\b|\bBIP-?(?:49|84|86|141|143|173|322|340|341|350|352)\b/giu,
    "Bitcoin-only protocol",
  ],
  [/\bSilent Payments?\b|\bBIP-?352\b/giu, "Silent Payments"],
];
// The reviewed allowlist of tooling/verify-dash-community-artifacts.mjs for the Inspector.
const INSPECTOR_ALLOWED = new Set(["bitcoin", "Bitcoin-only protocol"]);
let failures = 0;
for (const [path, toolId] of pages) {
  const html = readFileSync(path, "utf8");
  console.log(`== ${path.replace(`${root}/`, "")} (${html.length} chars)`);
  for (const [pattern, label] of TERMS) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length === 0) continue;
    // "xpub" itself is the generic BIP32 prefix that Dash also uses.
    const relevant = matches.filter((match) => match[0] !== "xpub");
    if (relevant.length === 0) continue;
    const allowed = toolId === "psbt-inspector" && INSPECTOR_ALLOWED.has(label);
    if (!allowed) failures += relevant.length;
    const forms = [...new Set(relevant.map((match) => match[0]))].slice(0, 8).join(", ");
    console.log(`  ${allowed ? "allowlisted" : "HIT"} ${label}: ${relevant.length} (${forms})`);
    for (const match of relevant.slice(0, 4)) {
      const start = Math.max(0, match.index - 70);
      console.log(
        `    …${html.slice(start, match.index + match[0].length + 50).replace(/\s+/gu, " ")}…`,
      );
    }
  }
}
console.log(`Terms outside the gate's allowlist: ${failures}`);
if (failures > 0) process.exitCode = 1;
