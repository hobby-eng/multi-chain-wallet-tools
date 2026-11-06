import { afterEach, describe, expect, it, vi } from "vitest";
import { DashPlatformNetworkService } from "../src/dash-platform-network.js";
import { normalizeIdentityLookupInput } from "@ckd/dash-network/platform-identity-source.js";

afterEach(() => vi.unstubAllGlobals());

describe("Platform history identifier admission", () => {
  it.each(["1".repeat(32), "1".repeat(31) + "2"])(
    "admits a canonical 32-byte identifier %s on each network",
    async (identifier) => {
      expect(normalizeIdentityLookupInput(identifier)).toMatchObject({
        kind: "identity-id",
        identityId: identifier,
      });
      for (const network of ["mainnet", "testnet"] as const) {
        const calls: string[] = [];
        vi.stubGlobal("fetch", async (url: string) => {
          calls.push(url);
          return Response.json(
            url.endsWith("/status")
              ? { network, indexer: { status: "synced" }, api: { block: { height: 10 } } }
              : {
                  identifier,
                  totalTransfers: 0,
                  totalTxs: 0,
                  balance: "0",
                  totalGasSpent: "0",
                  timestamp: null,
                },
          );
        });
        const result = await new DashPlatformNetworkService().platformIdentityHistory(
          network,
          identifier,
        );
        expect(result).toMatchObject({
          resource: identifier,
          totalReceived: "0",
          totalSent: "0",
          indexedHeight: 10,
        });
        expect(calls).toHaveLength(2);
        expect(calls[1]).toContain(`/identity/${identifier}`);
      }
    },
  );

  it.each([
    "1".repeat(44),
    "1".repeat(31),
    "z".repeat(44),
    "1".repeat(45),
    " " + "1".repeat(32),
    "0".repeat(32),
    null,
    undefined,
  ])("refuses a wrong-size or noncanonical identifier %s before HTTP", async (identifier) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const service = new DashPlatformNetworkService();
    // Reflect models a plain JavaScript caller without asserting a valid string.
    await expect(
      Reflect.apply(service.platformIdentityHistory.bind(service), service, [
        "mainnet",
        identifier,
      ]),
    ).rejects.toMatchObject({ code: "platform.identifier.invalid" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
