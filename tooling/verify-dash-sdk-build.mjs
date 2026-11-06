import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DASH_SDK_VERSION = "5.0.1";
const DASH_SDK_INTEGRITIES = [
  "sha512-GYS5C1W1xhtuFRnUicJ710rlD4zf7xvShkGrSg/cnQT17jwrYgZQDFyfh85HWs5WzDC5DTKbBBQSAJWfjIcLOQ==",
  "sha512-3sBZfieE7XuLV2AwD90Ga3iIDM0NsBxYlKNrnfmjitejozpF06N9kYFdIuNObIBDgcpESC0UTkDInl+Ge1+ykQ==",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function verifyDashSdkBuild(root, applicationName) {
  const projectManifest = readJson(resolve(root, "package.json"));
  const installedEvoManifest = readJson(
    resolve(root, "node_modules/@dashevo/evo-sdk/package.json"),
  );
  const installedWasmManifest = readJson(
    resolve(root, "node_modules/.pnpm/node_modules/@dashevo/wasm-sdk/package.json"),
  );
  if (
    projectManifest.dependencies?.["@dashevo/evo-sdk"] !== DASH_SDK_VERSION ||
    installedEvoManifest.version !== DASH_SDK_VERSION ||
    installedWasmManifest.version !== DASH_SDK_VERSION
  ) {
    throw new Error(
      `${applicationName} requires exact installed Dash Evo SDK and WASM SDK version ${DASH_SDK_VERSION}.`,
    );
  }

  const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
  for (const integrity of DASH_SDK_INTEGRITIES) {
    if (!lockfile.includes(integrity)) {
      throw new Error(`pnpm lockfile is missing audited Dash SDK integrity ${integrity}.`);
    }
  }
}
