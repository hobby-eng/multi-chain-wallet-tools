import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VendoredMhfePackage } from "../../../tooling/vendored-mhfe-package.mjs";

const label = process.argv[2];
if (!/^[a-z][a-z0-9-]*$/u.test(label ?? "")) {
  throw new Error("Usage: node record-artifacts.mjs <lowercase-label>");
}
const root = process.cwd();
const generated = "packages/recovery-mhfe-wasm/generated";
const inventory = new VendoredMhfePackage(root);
const manifestBytes = readFileSync(resolve(root, inventory.manifestPath));
const manifest = JSON.parse(manifestBytes.toString());
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const records = {};
// This checks the present manifest's integrity, not its independent provenance pin.
inventory.verify(hash(manifestBytes));
for (const path of inventory.files()) {
  records[path] = hash(readFileSync(resolve(root, path)));
}
for (const path of [
  `${generated}/modules.json`,
  "dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
  "dist/verification-record.json",
]) {
  records[path] = existsSync(resolve(root, path)) ? hash(readFileSync(resolve(root, path))) : null;
}
const result = {
  auditId: "AUD-025",
  recordedUtc: new Date().toISOString(),
  vendorVersion: manifest.version,
  vendorBuildId: manifest.buildId,
  vendorFileIntegrityVerified: true,
  provenancePinVerified: false,
  records,
};
writeFileSync(
  resolve(root, `docs/audits/AUD-025-evidence/${label}-artifacts.json`),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
