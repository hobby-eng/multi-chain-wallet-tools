import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DockerBuildLimits } from "./docker-build-limits.mjs";
import { DockerStageGraph } from "./docker-stage-graph.mjs";

describe("bounded canonical build targets", () => {
  const graph = new DockerStageGraph(
    readFileSync(new URL("../Dockerfile.reproducible", import.meta.url), "utf8"),
  );

  it("regenerates WASM without running full release checks", () => {
    const commands = graph.runCommands("wasm-artifacts").join("\n");
    expect(commands).toContain("build-all-wasm.mjs");
    expect(commands).not.toMatch(/\bpnpm\s+(?:verify\b|build:matrix:smoke\b)/u);
  });

  it("keeps every mandatory release gate in the complete artifact target", () => {
    const commands = graph.runCommands("artifacts").join("\n");
    for (const required of [
      "pnpm verify",
      "pnpm build:matrix:smoke",
      "verify /tmp/committed-generated",
    ])
      expect(commands).toContain(required);
  });

  it("expresses memory, no extra swap and CPU limits as Docker resource arguments", () => {
    expect(new DockerBuildLimits({}).arguments()).toEqual([]);
    expect(
      new DockerBuildLimits({
        WALLET_TOOLS_BUILD_MEMORY_MIB: "2560",
        WALLET_TOOLS_BUILD_CPUS: "1",
      }).arguments(),
    ).toEqual([
      "--resource",
      "memory=2560m",
      "--resource",
      "memory-swap=2560m",
      "--resource",
      "cpu-period=100000",
      "--resource",
      "cpu-quota=100000",
    ]);
    for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])
      expect(() => new DockerBuildLimits({ WALLET_TOOLS_BUILD_MEMORY_MIB: value })).toThrow();
  });
});
