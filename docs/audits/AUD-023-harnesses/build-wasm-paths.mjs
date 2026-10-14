// AUD-023 build reviewer harness: looks for absolute build-machine paths (/home/, /Users/, C:\Users\)
// inside every committed WebAssembly module and checks whether each module is embedded in the
// canonical Deriver pages of dist/ (read only). Exits 1 when a module embeds such a path.
//
//   node docs/audits/AUD-023-harnesses/build-wasm-paths.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const modules = [];
for (const pkg of readdirSync("packages")) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".wasm")) modules.push(path);
    }
  };
  try {
    walk(join("packages", pkg, "generated"));
  } catch {}
}
const pages = [
  "dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
].map((path) => [path, readFileSync(path, "utf8")]);
let failures = 0;
for (const path of modules) {
  const bytes = readFileSync(path);
  const text = bytes.toString("latin1");
  const hits = text.match(/(?:\/home\/|\/Users\/|C:\\Users\\)[\x21-\x7e]{0,80}/gu) ?? [];
  const roots = [...new Set(hits.map((hit) => hit.split("/").slice(0, 7).join("/")))];
  const embedded = pages
    .filter(([, html]) => html.includes(bytes.toString("base64")))
    .map(([page]) => page);
  if (hits.length > 0) failures += 1;
  console.log(
    `${path}: ${hits.length} absolute path(s)${roots.length ? ` [${roots.join(", ")}]` : ""}; embedded in ${embedded.length ? embedded.join(", ") : "no canonical Deriver page"}`,
  );
}
process.exitCode = failures === 0 ? 0 : 1;
