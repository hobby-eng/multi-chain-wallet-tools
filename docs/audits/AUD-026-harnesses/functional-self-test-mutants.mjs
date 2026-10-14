// AUD-026 functional: can the Deriver's startup cryptographic self-test fail? Each mutant changes
// one production line in memory (an esbuild onLoad plugin; the working tree is untouched), bundles
// packages/verification/src/self-test.ts for Node into the scratch folder, and runs
// runCryptoSelfTest. A mutant must be "killed" (the self-test throws or reports passed: false).
// Mutants marked expectSurvive document what the startup subset does not cover (account and change
// branch), which the unit tests and the full derivation oracle cover instead.
// Usage: node docs/audits/AUD-026-harnesses/functional-self-test-mutants.mjs <scratch-dir>
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const scratch = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Pass a scratch directory.");
const MUTANTS = [
  ["none (control)", null, null, null],
  [
    "Dash testnet P2PKH version",
    "packages/crypto-core/src/networks.ts",
    "p2pkh: 140,",
    "p2pkh: 76,",
  ],
  [
    "Ethereum address takes the first 20 hash bytes",
    "packages/coin-protocols/src/coins/ethereum/index.ts",
    "digest.slice(-20)",
    "digest.slice(0, 20)",
  ],
  [
    "Taproot tweak tag (address)",
    "packages/coin-protocols/src/coins/bitcoin/taproot.ts",
    'taggedHash("TapTweak", internalKey);\n  const tweak = bytesToNumber(tweakBytes);\n  const order = secp256k1.Point.Fn.ORDER;\n  if',
    'taggedHash("TapTweaK", internalKey);\n  const tweak = bytesToNumber(tweakBytes);\n  const order = secp256k1.Point.Fn.ORDER;\n  if',
  ],
  [
    "DIP18 Platform type byte",
    "packages/coin-protocols/src/coins/dash/platform.ts",
    "PLATFORM_P2PKH_TYPE = 0xb0",
    "PLATFORM_P2PKH_TYPE = 0x80",
  ],
  [
    "DIP13 key index not hardened",
    "packages/coin-protocols/src/coins/dash/identity.ts",
    "${identityIndex}'/${keyIndex}'`",
    "${identityIndex}'/${keyIndex}`",
  ],
  [
    "chosen last word sets all 11 bits",
    "packages/crypto-core/src/bip39-chosen-words.ts",
    "BIP39_WORD_BITS - checksum, index >> checksum",
    "BIP39_WORD_BITS - checksum, index",
  ],
  [
    "change branch ignored",
    "packages/coin-protocols/src/account-branch.ts",
    "account.deriveChild(options.branch)",
    "account.deriveChild(0)",
    true,
  ],
];

function plugin(file, from, to) {
  return {
    name: "mutate",
    setup(b) {
      if (file === null) return;
      const target = resolve(root, file);
      b.onLoad({ filter: /\.ts$/ }, (args) => {
        if (args.path !== target) return undefined;
        const source = readFileSync(args.path, "utf8");
        if (source.split(from).length !== 2)
          throw new Error(`Mutation point not unique in ${file}`);
        return { contents: source.replace(from, to), loader: "ts" };
      });
    },
  };
}

if (typeof Uint8Array.fromBase64 !== "function")
  Uint8Array.fromBase64 = (value) => new Uint8Array(Buffer.from(value, "base64"));
mkdirSync(scratch, { recursive: true });
let unexpected = 0;
for (const [index, [label, file, from, to, expectSurvive = false]] of MUTANTS.entries()) {
  const outfile = resolve(scratch, `functional-mutant-${index}.mjs`);
  await build({
    entryPoints: [resolve(root, "packages/verification/src/self-test.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "error",
    loader: { ".wasm": "binary" },
    tsconfig: resolve(root, "tsconfig.json"),
    plugins: [plugin(file, from, to)],
  });
  let outcome;
  try {
    const report = await (await import(pathToFileURL(outfile).href)).runCryptoSelfTest();
    outcome = report.passed === true ? "survived" : `killed: ${report.error ?? "passed=false"}`;
  } catch (cause) {
    outcome = `killed: ${String(cause?.message ?? cause).slice(0, 120)}`;
  }
  rmSync(outfile, { force: true });
  const wanted = file === null || expectSurvive ? "survived" : "killed";
  const ok = outcome.startsWith(wanted);
  if (!ok) unexpected += 1;
  console.log(`${ok ? "as expected" : "UNEXPECTED"} · ${label}: ${outcome}`);
}
process.exit(unexpected === 0 ? 0 : 1);
