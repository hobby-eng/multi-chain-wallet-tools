import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { parsers } from "prettier/plugins/typescript";
import { createDiscoveryScannerController } from "../../../apps/discovery-scanner/src/controller.js";
import {
  RecoveryConcurrencyLimiter,
  mapRecoveryTasks,
} from "../../../apps/discovery-scanner/src/concurrency.js";
import { ALL_DISCOVERY_FEATURES } from "../../../apps/discovery-scanner/src/feature-selection.js";
import { dashSeedLookups } from "../../../apps/discovery-scanner/src/scan-estimate.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";

/** Reuse only the repository's synthetic view/inputs, without running its tests or copying logic. */
class ScannerFixture {
  static async page() {
    const source = readFileSync(
      new URL("../../../apps/discovery-scanner/tests/controller.test.ts", import.meta.url),
      "utf8",
    );
    const ast = await parsers.typescript.parse(source, {});
    const wanted = ["TestControl", "snapshot", "result", "testView"];
    const declarations = wanted.map((name) => {
      const node = ast.body.find((item: { id?: { name: string } }) => item.id?.name === name);
      if (node === undefined) throw new Error(`Reassess the fixture: ${name} is absent.`);
      return source.slice(node.range[0], node.range[1]);
    });
    const compiled = await transform(declarations.join("\n"), { loader: "ts", format: "cjs" });
    return runInNewContext(`${compiled.code}\n({page: testView(), result});`, {
      EventTarget,
      Event,
      vi,
    });
  }
}

describe("AUD-024-API004: a Scanner export reply belongs to its scan generation", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const rejected of [false, true])
    it(`drops a delayed ${rejected ? "error" : "success"} after another normal scan`, async () => {
      vi.stubGlobal("window", { addEventListener: vi.fn() });
      const { page, result } = await ScannerFixture.page();
      const { view, controls } = page;
      let resolve!: (name: string) => void;
      let reject!: (cause: Error) => void;
      const reply = new Promise<string>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const scan = vi.fn(async () => result());
      const dependencies = {
        ...ALL_DISCOVERY_FEATURES,
        RecoveryConcurrencyLimiter,
        SecretEgressGuard,
        assertValidMnemonic: (value: string) => value.trim(),
        createRecoveryExport: (_results: unknown, format: string) => ({
          filename: `report.${format}`,
          mimeType: format === "csv" ? "text/csv" : "application/json",
          text: "public report",
        }),
        describeUnknownError: (cause: unknown) =>
          cause instanceof Error ? cause.message : String(cause),
        getRecoveryCoin: () => ({
          id: "dash",
          label: "Dash",
          networks: ["mainnet", "testnet"],
          minimumSeedLookups: dashSeedLookups,
          scan,
        }),
        listRecoveryCoins: () => [],
        mapRecoveryTasks,
        recoveryNetworkApi: async () => ({ ping: async () => "isolated-network-worker-v1" }),
        requestRecoveryExport: vi.fn(() => reply),
        runRecoverySelfTest: async () => ({ checks: ["synthetic"], durationMs: 1 }),
      };
      createDiscoveryScannerController(view, dependencies as never).start();
      await vi.waitFor(() => expect(view.showSelfTestPassed).toHaveBeenCalledOnce());
      controls.startButton.click();
      await vi.waitFor(() =>
        expect(view.setStatus).toHaveBeenCalledWith(
          "Recovery scan complete. Review and export the standard-wallet handoff report.",
        ),
      );
      controls.exportCsvButton.click();
      await vi.waitFor(() => expect(dependencies.requestRecoveryExport).toHaveBeenCalledOnce());
      view.setStatus.mockClear();
      controls.startButton.click();
      await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
      await vi.waitFor(() =>
        expect(view.setStatus).toHaveBeenCalledWith(
          "Recovery scan complete. Review and export the standard-wallet handoff report.",
        ),
      );
      view.setStatus.mockClear();
      view.showError.mockClear();
      if (rejected) reject(new Error("synthetic old export failure"));
      else resolve("old-report.csv");
      await new Promise((done) => setTimeout(done, 0));
      expect(view.setStatus).not.toHaveBeenCalledWith(expect.stringMatching(/^Exported/u));
      expect(view.showError).not.toHaveBeenCalled();
    });
});
