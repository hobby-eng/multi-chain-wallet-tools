// AUD-026 security reviewer (CHECK-SEC-006): does the Deriver artifact gate notice a new call of the
// Function constructor written without `new`? It reads the reviewed gate,
// apps/key-derivation/scripts/verify-key-derivation-artifact.mjs, takes its `forbidden` list of
// patterns as written there, and applies it to (1) the dist Deriver pages and (2) synthetic
// snippets. The Scanner and Activity Viewer gates count every Function constructor; the Deriver
// gate lists `new Function` and `eval(` only. Exit 1 when a dynamic-code form passes the list.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const gate = readFileSync(
  path.join(root, "apps/key-derivation/scripts/verify-key-derivation-artifact.mjs"),
  "utf8",
);
const listText = /const forbidden = (\[[\s\S]*?\n\]);/u.exec(gate)?.[1];
if (listText === undefined) throw new Error("The gate's forbidden list was not found.");
// The list is an array literal of [RegExp, label] pairs with no references to other names.
const forbidden = new Function(`return ${listText};`)();
const caught = (text) => forbidden.filter(([pattern]) => pattern.test(text)).map(([, l]) => l);

const report = { pages: {}, snippets: {} };
for (const page of [
  "dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
]) {
  const html = readFileSync(path.join(root, page), "utf8");
  const calls = [...html.matchAll(/(?<![.\w$])Function\s*\(/gu)].map((match) =>
    html.slice(Math.max(0, match.index - 60), match.index + 60),
  );
  report.pages[page] = { bareFunctionCalls: calls.length, contexts: calls };
}
const snippets = {
  "new Function": 'const f = new Function("return 1");',
  "bare Function call": 'const f = Function("return 1");',
  "global Function call": 'const f = globalThis.Function("return 1");',
  "indirect eval": 'const f = (0, globalThis["ev" + "al"])("1");',
  "eval call": 'eval("1");',
};
let missed = 0;
for (const [label, snippet] of Object.entries(snippets)) {
  const labels = caught(snippet);
  report.snippets[label] = labels.length === 0 ? "passes the gate" : `caught: ${labels.join(", ")}`;
  if (labels.length === 0) missed += 1;
}
console.log(JSON.stringify(report, null, 2));
if (missed > 0) {
  console.error(`${missed} dynamic-code forms pass the Deriver gate's forbidden list.`);
  process.exit(1);
}
