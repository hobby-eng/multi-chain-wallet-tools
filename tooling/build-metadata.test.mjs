import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createBuildInfo } from "./build-metadata.mjs";
import { BUILD_PROFILES } from "./build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("build metadata profiles", () => {
  it("records the edition and names the release's one checksum file", () => {
    const multi = BUILD_PROFILES["multi-chain"];
    const dash = BUILD_PROFILES["dash-community"];
    const multiInfo = createBuildInfo(root, multi);
    const dashInfo = createBuildInfo(root, dash);

    expect(multiInfo).toMatchObject({
      profile: "multi-chain",
      edition: "Multi-Chain Edition",
      releaseRepository: "hobby-eng/multi-chain-wallet-tools",
      checksumFile: "SHA256SUMS",
    });
    expect(dashInfo).toMatchObject({
      profile: "dash-community",
      edition: "Dash Community Edition",
      releaseRepository: "hobby-eng/dash-wallet-tools",
      checksumFile: "SHA256SUMS",
    });
    expect(dashInfo.fingerprint).toBe(multiInfo.fingerprint);
  });
});
