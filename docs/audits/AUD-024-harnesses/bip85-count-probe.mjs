// Public BIP85 fixture only. Bundle source in memory; do not write build output or secrets.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureSource = readFileSync(
  resolve(root, "packages/crypto-core/tests/bip85.test.ts"),
  "utf8",
);
const fixture = fixtureSource.match(/const ROOT\s*=\s*"([^"]+)"/u)?.[1];
if (!fixture) throw new Error("Published BIP85 ROOT fixture was not found.");
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { deriveBip85Bip39 } from "./packages/crypto-core/src/bip85.ts";
      export { entropyToEnglishMnemonic } from "./packages/crypto-core/src/bip39.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
// The independent published 12-word answer proves this probe reached the real derivation.
const normal = api.deriveBip85Bip39(fixture, 12, 0);
const knownAnswerPassed =
  normal.path === "m/83696968'/39'/0'/12'/0'" &&
  normal.entropyHex === "6250b68daf746d12a24d58b4787a714b";
if (!knownAnswerPassed) throw new Error("Published BIP85 known answer failed.");
let accepted = false;
let path = null;
let entropyBytes = null;
let downstreamMnemonicRefuses = null;
try {
  const result = api.deriveBip85Bip39(fixture, 13, 0);
  accepted = true;
  path = result.path;
  const entropy = Uint8Array.from(Buffer.from(result.entropyHex, "hex"));
  entropyBytes = entropy.length;
  try {
    api.entropyToEnglishMnemonic(entropy);
    downstreamMnemonicRefuses = false;
  } catch {
    downstreamMnemonicRefuses = true;
  } finally {
    entropy.fill(0);
  }
} catch {
  // Refusal is the supported-domain contract; no mutable generated entropy escaped.
}
console.log(
  JSON.stringify(
    {
      knownAnswerPassed,
      unsupportedWordCount: 13,
      accepted,
      path,
      entropyBytes,
      downstreamMnemonicRefuses,
      contractPassed: !accepted,
    },
    null,
    2,
  ),
);
process.exitCode = accepted ? 1 : 0;
