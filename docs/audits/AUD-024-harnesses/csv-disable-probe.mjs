// A public generator point and a synthetic script; no transaction signing or browser.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: 'export { decodeScript } from "./apps/psbt-inspector/src/script.ts";',
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
const point = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const script = `635121${point}51ae67050100008000b27521${point}ac68`;
const decoded = api.decodeScript(script, "bitcoin", "mainnet");
const contractPassed = !decoded.inferredPolicy.includes("relative delay 1 blocks");
console.log(
  JSON.stringify(
    {
      source: "apps/psbt-inspector/src/script.ts",
      sourceSha256: createHash("sha256")
        .update(readFileSync(resolve(root, "apps/psbt-inspector/src/script.ts")))
        .digest("hex"),
      executionScope:
        "Actual decodeScript with synthetic positive five-byte disabled CSV operand; no consensus interpreter or browser",
      reference: "https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki#summary",
      encodedOperand: "0x80000001",
      inferredPolicy: decoded.inferredPolicy,
      contractPassed,
    },
    null,
    2,
  ),
);
process.exitCode = contractPassed ? 0 : 1;
