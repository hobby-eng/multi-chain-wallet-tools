import { describe, expect, it, vi } from "vitest";
import {
  fetchWasmBindgenMaxStableVersion,
  latestNodeInLine,
  noteEncryptionChangeRequiresReview,
  renderUpstreamVersionReport,
  runUpstreamVersionCheck,
  WASM_BINDGEN_CRATE_URL,
} from "./upstream-version-check.mjs";

describe("upstream version checker", () => {
  it("queries the exact wasm-bindgen crate endpoint and reads crate.max_stable_version", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            crate: { max_stable_version: "0.2.127" },
          }),
          { status: 200 },
        ),
    );

    await expect(fetchWasmBindgenMaxStableVersion(fetcher)).resolves.toBe("0.2.127");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(WASM_BINDGEN_CRATE_URL);
  });

  it("treats malformed crate metadata as a checker failure rather than an update", async () => {
    const output = { write: vi.fn() };
    const exitCode = await runUpstreamVersionCheck(
      ".",
      vi.fn(async () => new Response("{not-json", { status: 200 })),
      output,
    );

    expect(exitCode).toBe(2);
    expect(output.write).toHaveBeenCalledWith(
      expect.stringContaining(
        "Infrastructure/parser failure — this is not an update-available signal.",
      ),
    );
  });

  it("compares Node.js with the newest release of the pinned major line, not the LTS line", () => {
    const releases = [
      { version: "v26.10.0", lts: false },
      { version: "v26.9.0", lts: false },
      { version: "v24.21.0", lts: "Krypton" },
    ];
    expect(latestNodeInLine(releases, "26.10.0")).toBe("26.10.0");
    expect(latestNodeInLine(releases, "26.9.0")).toBe("26.10.0");
    expect(latestNodeInLine(releases, "24.20.0")).toBe("24.21.0");
    expect(latestNodeInLine(releases, "28.0.0")).toBeUndefined();
  });

  it("renders update-required and current outcomes distinctly", () => {
    const current = renderUpstreamVersionReport([
      { label: "wasm-bindgen", current: "0.2.127", latest: "0.2.127", matches: true },
    ]);
    const update = renderUpstreamVersionReport([
      { label: "wasm-bindgen", current: "0.2.127", latest: "0.2.128", matches: false },
    ]);

    expect(current.updateRequired).toBe(false);
    expect(current.report).toContain("dependencies are current");
    expect(update.updateRequired).toBe(true);
    expect(update.report).toContain("dependency review required");
  });

  it("requires review only for note-encryption code and dependency-surface changes", () => {
    expect(
      noteEncryptionChangeRequiresReview({
        status: "ahead",
        files: [{ filename: ".github/workflows/ci.yml" }, { filename: "README.md" }],
      }),
    ).toBe(false);
    expect(
      noteEncryptionChangeRequiresReview({
        status: "ahead",
        files: [{ filename: "src/lib.rs" }],
      }),
    ).toBe(true);
    expect(
      noteEncryptionChangeRequiresReview({
        status: "diverged",
        files: [],
      }),
    ).toBe(true);
    expect(
      noteEncryptionChangeRequiresReview({
        status: "ahead",
        files: Array.from({ length: 300 }, (_, index) => ({ filename: `docs/${index}.md` })),
      }),
    ).toBe(true);
  });
});
