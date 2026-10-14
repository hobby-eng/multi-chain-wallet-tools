// AUD-026 architecture harness: whether the chosen-word search can still be cancelled while it
// runs, as the Generate & Derive panel documents ("A newer call or clear() cancels a running
// search, which rejects with an AbortError", apps/key-derivation/src/ui/chosen-words-feature.ts).
// It calls the library entry the panel calls, generateMnemonicWithChosenWords, with a counting
// random source and aborts the signal right after the call returns, before any await. Public data
// only: the chosen word "zoo" and the never-use word "abandon". Exits 1 when the documented
// contract (a running search can be stopped) does not hold.
//
//   node docs/audits/AUD-026-harnesses/architecture-chosen-search-probe.mjs
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { generateMnemonicWithChosenWords } from "./packages/crypto-core/src/bip39-chosen-words.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { generateMnemonicWithChosenWords } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

let calls = 0;
const countingSource = (length) => {
  calls += 1;
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
};
const controller = new AbortController();
// A 24-word phrase with a fixed last word needs about 256 draws (checksum match), one batch.
const pending = generateMnemonicWithChosenWords(
  { wordCount: 24, chosen: [{ word: "zoo", position: 24 }], neverUse: ["abandon"] },
  { signal: controller.signal, randomBytes: countingSource },
);
const callsWhenCallReturned = calls;
controller.abort();
let outcome;
try {
  const phrase = await pending;
  outcome = { settled: "resolved", lastWordIsZoo: phrase.split(" ").at(-1) === "zoo" };
} catch (cause) {
  outcome = { settled: "rejected", name: cause?.name ?? null };
}
const result = {
  probe: "chosen-word-search-cancellation",
  randomSourceCallsBeforeTheCallReturned: callsWhenCallReturned,
  abortedImmediatelyAfterTheCall: true,
  outcome,
  // The documented contract: aborting a running search makes it reject with an AbortError.
  contractPassed: outcome.settled === "rejected" && outcome.name === "AbortError",
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.contractPassed ? 0 : 1;
