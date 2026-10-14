// AUD-023 coordinator: counts the recovery helps of both built Derivers, as the first step of the
// regression case recovery-backup-roundtrips does (27 since Decode's question for codes marked ?).
// The whole case runs real MHFE operations and takes longer than the owner's two-minute limit for
// checks before a release, so only this step was checked after the count changed.
//
// Input: dist/ from `pnpm build` (read only). Run: node docs/audits/AUD-023-harnesses/coordinator-help-count.mjs
// Exit 0 when both pages have 27 helps, 1 otherwise.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
const root = resolve(import.meta.dirname, "../../..");
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
let ok = true;
for (const page of [
  "dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
]) {
  const context = await browser.newContext();
  await context.route("**/*", (r) => (/^(file|blob|data|about):/u.test(r.request().url()) ? r.continue() : r.abort()));
  const tab = await context.newPage();
  await tab.goto(pathToFileURL(resolve(root, page)).href);
  await tab.locator("#recovery-backup-mode").click();
  const count = await tab.locator(".recovery-help").count();
  console.log(`${page}: ${count} recovery helps`);
  ok &&= count === 27;
  await context.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
