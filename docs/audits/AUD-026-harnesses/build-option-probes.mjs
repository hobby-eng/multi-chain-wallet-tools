// AUD-026 build reviewer (CHECK-BLD-001): option parsing of selective builds without building. Calls
// the production parsers (tooling/key-derivation-features.mjs, tooling/tool-feature-options.mjs) with
// edge cases and compares each outcome with the documented rule (docs/BUILD_MODULES.md "Command-line
// composition"). Exit 1 when an outcome differs from the expectation written here.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES } from "../../../tooling/build-profiles.mjs";
import { parseKeyDerivationFeatures } from "../../../tooling/key-derivation-features.mjs";
import {
  parseRequestedOutput,
  parseToolFeatureOptions,
  requestedArtifact,
} from "../../../tooling/tool-feature-options.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const multi = BUILD_PROFILES["multi-chain"];
const dash = BUILD_PROFILES["dash-community"];
let failures = 0;
function probe(label, run, expectation) {
  let outcome;
  try {
    const result = run();
    outcome = result === undefined ? "ok" : `ok ${JSON.stringify(result)}`;
  } catch (error) {
    outcome = `error ${error.message}`;
  }
  const passed = expectation(outcome);
  if (!passed) failures += 1;
  console.log(`${passed ? "pass" : "FAIL"} ${label}\n     ${outcome.slice(0, 220)}`);
}
const kd = (profile, args) => {
  const parsed = parseKeyDerivationFeatures(profile, args);
  return { coins: parsed.coins, selected: parsed.selected };
};
const tool = (id, profile, args) => {
  const parsed = parseToolFeatureOptions(id, profile, args);
  return { coins: parsed.coins, selected: parsed.selected };
};
const isError = (pattern) => (outcome) => outcome.startsWith("error") && pattern.test(outcome);
const isOk =
  (check = () => true) =>
  (outcome) =>
    outcome.startsWith("ok") && check(outcome);

probe(
  "KD unknown feature",
  () => kd(multi, ["--features", "derive,nope"]),
  isError(/Unknown --features/u),
);
probe("KD empty --features=", () => kd(multi, ["--features="]), isError(/comma-separated/u));
probe("KD empty list entry", () => kd(multi, ["--coins", "bitcoin,"]), isError(/comma-separated/u));
probe("KD --features without value", () => kd(multi, ["--features"]), isError(/comma-separated/u));
probe("KD exclude derive", () => kd(multi, ["--exclude", "derive"]), isError(/derive/u));
probe(
  "KD exclude every coin",
  () => kd(multi, ["--exclude-coins", "bitcoin,dash,ethereum"]),
  isError(/at least one coin/u),
);
probe(
  "KD Dash edition with Bitcoin",
  () => kd(dash, ["--coins", "bitcoin"]),
  isError(/only the Dash/u),
);
probe(
  "KD cards without mnemocode refused",
  () => kd(multi, ["--features", "derive,mnemocode-cards"]),
  isError(/requires the "mnemocode"/u),
);
probe(
  "KD excluding mnemocode drops cards",
  () => kd(multi, ["--exclude", "mnemocode"]),
  isOk((o) => !o.includes("mnemocode")),
);
probe(
  "KD silent payments without Bitcoin",
  () => kd(multi, ["--coins", "dash", "--features", "derive,silent-payments"]),
  isError(/silent-payments/u),
);
probe(
  "KD aliases matcher/silent",
  () => kd(multi, ["--features", "derive,matcher,silent"]),
  isOk((o) => o.includes("wallet-matcher") && o.includes("silent-payments")),
);
probe(
  "KD repeated --features merge",
  () => kd(multi, ["--features", "derive", "--features", "mhfe"]),
  isOk((o) => o.includes('"mhfe"')),
);
probe(
  "KD include and exclude the same feature",
  () => kd(multi, ["--features", "derive,mhfe", "--exclude", "mhfe"]),
  isOk((o) => !o.includes("mhfe")),
);
probe(
  "KD Ethereum only drops signing features",
  () => kd(multi, ["--coins", "ethereum"]),
  isOk((o) => !o.includes("bip38") && !o.includes("message-signing")),
);
probe(
  "KD BIP38 with Ethereum only refused",
  () => kd(multi, ["--coins", "ethereum", "--features", "derive,bip38-encrypt"]),
  isError(/Bitcoin or Dash/u),
);
probe(
  "Discovery watch-only matcher refused",
  () => tool("discovery-scanner", multi, ["--features", "watch-only-discovery,wallet-matcher"]),
  isError(/requires seed-discovery/u),
);
probe(
  "Discovery custom paths alone refused",
  () => tool("discovery-scanner", multi, ["--features", "custom-paths"]),
  isError(/seed-discovery, watch-only-discovery/u),
);
probe(
  "Inspector Ethereum refused",
  () => tool("psbt-inspector", multi, ["--coins", "ethereum"]),
  isError(/Unknown --coins/u),
);
probe(
  "Inspector excluding every workflow refused",
  () =>
    tool("psbt-inspector", multi, [
      "--exclude",
      "psbt-decoder,script-decoder,descriptor-decoder,policy-builder,multisig-wallet,message-verification,bip38-decrypt",
    ]),
  isError(/at least one workflow/u),
);
probe(
  "Activity Dash edition with Ethereum refused",
  () => tool("activity-viewer", dash, ["--coins", "ethereum"]),
  isError(/only Dash/u),
);
probe(
  "--output inside a canonical edition refused",
  () => requestedArtifact(root, "dist/multi-chain-edition/x.html"),
  isError(/cannot write inside/u),
);
probe(
  "--output the canonical folder itself refused",
  () =>
    requestedArtifact(
      root,
      "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
    ),
  isError(/cannot write inside/u),
);
probe("--output not .html refused", () => requestedArtifact(root, "../x.txt"), isError(/\.html/u));
probe(
  "--output without value refused",
  () => parseRequestedOutput(["--output"]),
  isError(/requires an \.html path/u),
);
probe(
  "--output followed by an option refused",
  () => parseRequestedOutput(["--output", "--coins"]),
  isError(/requires an \.html path/u),
);
console.log(`Probes failing their expectation: ${failures}`);
if (failures > 0) process.exitCode = 1;
