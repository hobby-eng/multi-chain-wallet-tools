import { afterEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_VAULT_CHANNEL } from "../src/iframe-protocol.js";

afterEach(() => vi.unstubAllGlobals());

// EIP-55's own example address.
const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
// The first XRP address of the public "abandon … about" phrase.
const XRP = "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3";

describe("the vault's network boundary client", () => {
  it("names the coin of evm.accounts and account.states requests by its id, beside the network", async () => {
    // A frame whose parent hands it the network channel, as the isolation shell does.
    const listeners: Array<(event: { source: unknown; data: unknown; ports: unknown[] }) => void> =
      [];
    const parent = {};
    vi.stubGlobal("window", {
      parent,
      addEventListener: (_type: string, listener: (typeof listeners)[number]) =>
        listeners.push(listener),
    });
    const { installNetworkBoundaryListener, recoveryNetworkApi } = await import("../src/client.js");
    installNetworkBoundaryListener();
    const { port1, port2 } = new MessageChannel();
    try {
      for (const listener of listeners)
        listener({ source: parent, data: { type: RECOVERY_VAULT_CHANNEL }, ports: [port1] });
      const api = await recoveryNetworkApi();
      const next = () =>
        new Promise<{ type: string; request: { id: string } }>((resolve) =>
          port2.addEventListener("message", (event) => resolve(event.data), { once: true }),
        );
      port2.start();
      let sent = next();
      const reply = api.evmAccounts("base", "mainnet", [ADDRESS]);
      const message = await sent;
      expect(message).toEqual({
        type: "invoke",
        request: {
          id: message.request.id,
          operation: "evm.accounts",
          payload: { network: "mainnet", coin: "base", addresses: [ADDRESS] },
        },
      });
      const value = { chainId: "8453", blockNumber: "1", entries: [] };
      port2.postMessage({ id: message.request.id, ok: true, value });
      await expect(reply).resolves.toEqual(value);
      sent = next();
      const states = api.accountStates("xrp", "mainnet", [XRP]);
      const request = await sent;
      expect(request).toEqual({
        type: "invoke",
        request: {
          id: request.request.id,
          operation: "account.states",
          payload: { network: "mainnet", coin: "xrp", addresses: [XRP] },
        },
      });
      const view = { coin: "xrp", height: null, entries: [] };
      port2.postMessage({ id: request.request.id, ok: true, value: view });
      await expect(states).resolves.toEqual(view);
    } finally {
      port1.close();
      port2.close();
    }
  });
});
