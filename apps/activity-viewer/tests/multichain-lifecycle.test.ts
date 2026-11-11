import { afterEach, describe, expect, it, vi } from "vitest";
import { createActivityViewerView } from "../src/view.js";
import { createBitcoinActivityAdapter } from "../src/activity-bitcoin.js";
import { createEvmActivityAdapter } from "../src/activity-evm.js";
import { createAccountActivityAdapter } from "../src/activity-account.js";
import { accountCoin, accountStatesReader } from "@ckd/public-data-providers/account-coins.js";
import { evmNetwork } from "@ckd/public-data-providers/evm-networks.js";
import { installExternalActivity } from "../src/external-activity.js";
import { emptyPublicHistory as emptyHistory } from "@ckd/public-data-providers/history.js";

const network = vi.hoisted(() => ({
  addressHistory: vi.fn(),
  utxoAddresses: vi.fn(),
  evmAccounts: vi.fn(),
  accountStates: vi.fn(),
}));
vi.mock("@ckd/public-data-providers/multi-chain-service.js", () => ({
  PublicMultiChainDataService: class {
    addressHistory = network.addressHistory;
    utxoAddresses = network.utxoAddresses;
    evmAccounts = network.evmAccounts;
  },
}));

class Control extends EventTarget {
  readonly attributes = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  value = "";
  disabled = false;
  hidden = false;
  textContent = "";
  lastChild = { textContent: "" };
  previousElementSibling = { textContent: "" };
  options = [{ textContent: "" }, { textContent: "" }];
  classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };
  append = vi.fn();
  replaceChildren = vi.fn();
  click(): void {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
}
function fixture(batchMode = false) {
  const controls = new Map<string, Control>();
  const element = (id: string): Control => {
    if (!controls.has(id)) controls.set(id, new Control());
    return controls.get(id)!;
  };
  const document = {
    getElementById: element,
    querySelector: (selector: string) =>
      selector === '[data-query-mode="batch"].active'
        ? batchMode
          ? element("batch-active")
          : null
        : element(selector.replace(/^#/u, "")),
    querySelectorAll: (selector: string) => [element(selector)],
    body: element("body"),
    createElement: () => new Control(),
  } as unknown as Document;
  element("viewer-coin").value = "bitcoin";
  element("viewer-network").value = "mainnet";
  const view = createActivityViewerView(document, { fingerprint: "test" } as Parameters<
    typeof createActivityViewerView
  >[1]);
  installExternalActivity(document, view, [
    createBitcoinActivityAdapter({
      addressHistory: network.addressHistory,
      utxoAddresses: network.utxoAddresses,
    }),
    createEvmActivityAdapter(
      evmNetwork("ethereum"),
      { accounts: network.evmAccounts },
      { addressHistory: network.addressHistory },
    ),
    createEvmActivityAdapter(evmNetwork("gnosis"), { accounts: network.evmAccounts }),
    ...["solana", "stellar", "near", "tron", "hedera", "ton"].map((id) =>
      createAccountActivityAdapter(accountStatesReader(accountCoin(id)), {
        states: network.accountStates,
      }),
    ),
  ]);
  view.setRunning(false, true, "core");
  return { element, view };
}
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
afterEach(() => vi.clearAllMocks());

describe("shared Activity Viewer query ownership", () => {
  it("locks Coin during Dash queries and lets Clear/Cancel reach the Dash owner even after a scripted coin change", async () => {
    const { element, view } = fixture();
    await settle();
    element("viewer-coin").value = "dash";
    view.setRunning(true, true, "core");
    expect(element("viewer-coin").disabled).toBe(true);
    element("viewer-coin").value = "bitcoin";
    const clear = vi.fn(),
      cancel = vi.fn();
    element("clear-viewer").addEventListener("click", clear);
    element("cancel-button").addEventListener("click", cancel);
    element("clear-viewer").click();
    element("cancel-button").click();
    expect(clear).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    view.setRunning(false, true, "core");
    expect(element("viewer-coin").disabled).toBe(false);
  });

  for (const action of ["clear-viewer", "cancel-button"]) {
    it(`discards a late successful Bitcoin response after ${action}`, async () => {
      const { element, view } = fixture();
      await settle();
      let resolveHistory: (value: ReturnType<typeof emptyHistory>) => void = () => {};
      network.addressHistory.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveHistory = resolve;
          }),
      );
      network.utxoAddresses.mockResolvedValue([{ balance: "1" }]);
      element("full-viewing-key").value = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
      element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
      expect(view.isQueryRunning()).toBe(true);
      for (const id of [
        "viewer-coin",
        "viewer-network",
        "full-viewing-key",
        "viewer-batch-input",
        "[data-query-mode]",
      ]) {
        expect(element(id).disabled).toBe(true);
      }
      const signal = network.addressHistory.mock.calls[0]![2] as AbortSignal;
      // Even a programmatic coin change must not redirect cancellation to Dash.
      element("viewer-coin").value = "dash";
      element(action).click();
      expect(signal.aborted).toBe(true);
      resolveHistory({ ...emptyHistory("BTC", "satoshi", 8), status: "complete" });
      await settle();
      expect(element("viewer-results").hidden).toBe(true);
      expect(element("viewer-summary").replaceChildren).not.toHaveBeenCalled();
      expect(view.isQueryRunning()).toBe(false);
      if (action === "clear-viewer") {
        expect(element("viewer-status").hidden).toBe(true);
        expect(element("full-viewing-key").value).toBe("");
      } else expect(element("viewer-status").textContent).toBe("Query cancelled.");
    });
  }

  it("renders a successful external query and restores shared controls", async () => {
    const { element, view } = fixture();
    await settle();
    network.addressHistory.mockResolvedValue({
      ...emptyHistory("BTC", "satoshi", 8),
      status: "complete",
    });
    network.utxoAddresses.mockResolvedValue([{ balance: "1" }]);
    element("full-viewing-key").value = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
    element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(element("viewer-results").hidden).toBe(false);
    expect(element("viewer-summary").replaceChildren).toHaveBeenCalledOnce();
    expect(view.canStartQuery()).toBe(true);
    expect(element("viewer-coin").disabled).toBe(false);
    expect(element("cancel-button").disabled).toBe(true);
  });

  it("cannot bypass the startup self-test through an external-coin submit event", async () => {
    const { element, view } = fixture();
    await settle();
    view.setRunning(false, false, "core");
    element("full-viewing-key").value = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
    element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(network.addressHistory).not.toHaveBeenCalled();
    expect(element("scan-button").disabled).toBe(true);
  });
});

it("counts Ethereum addresses once regardless of casing, while keeping distinct accounts", async () => {
  const { element } = fixture(true);
  await settle();
  element("viewer-coin").value = "ethereum";
  const address = "0x52908400098527886E0F7030069857D2E4169EE7";
  const other = "0xde709f2102306220921060314715629080e2fb77";
  element("viewer-batch-input").value = [address, address.toLowerCase(), other].join("\n");
  network.addressHistory.mockResolvedValue({
    ...emptyHistory("ETH", "wei", 18),
    status: "complete",
  });
  network.evmAccounts.mockImplementation(async (_coin, _network, addresses) => ({
    chainId: "1",
    blockNumber: "1",
    entries: addresses.map((address: string) => ({
      address,
      balance: "1000000000000000000",
      nonce: "0",
    })),
  }));
  element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  expect(network.evmAccounts).toHaveBeenCalledTimes(2);
  expect(element("viewer-results-description").textContent).toBe("2 public addresses");
  const cards = element("viewer-summary").replaceChildren.mock.calls[0]! as Control[];
  expect(cards[0]!.append.mock.calls[0]![2].textContent).toBe("2 ETH");
});

it("counts a Hedera account that two lookups reach once in the batch's current balance", async () => {
  const { element } = fixture(true);
  await settle();
  element("viewer-coin").value = "hedera";
  element("viewer-coin").dispatchEvent(new Event("change"));
  await settle();
  // The account by its number and by its long-zero EVM address, and the key that holds it and one
  // more account, read a moment later: three lookups reach 0.0.163372, which counts once.
  const der =
    "302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf";
  const longZero = "0x0000000000000000000000000000000000027e2c";
  element("viewer-batch-input").value = ["0.0.163372", longZero, der].join("\n");
  network.accountStates.mockImplementation(async (coin: string, _network, addresses: string[]) => ({
    coin,
    height: null,
    entries: addresses.map((address) => {
      const accounts =
        address === "0.0.163372" || address.startsWith("0x")
          ? [{ id: "0.0.163372", balance: "14285" }]
          : [
              { id: "0.0.163372", balance: "14285" },
              { id: "0.0.629081", balance: "1" },
            ];
      const balance = accounts.reduce((sum, { balance }) => sum + BigInt(balance), 0n);
      return {
        address,
        exists: true,
        used: true,
        balance: String(balance),
        sequence: null,
        accounts,
      };
    }),
  }));
  element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  expect(network.accountStates).toHaveBeenCalledTimes(3);
  const cards = element("viewer-summary").replaceChildren.mock.calls[0]! as Control[];
  // 14285 + 1 tinybar, not 14285 + 14285 + 14286.
  expect(cards[0]!.append.mock.calls[0]![2].textContent).toBe("0.00014286 HBAR");
  expect(element("viewer-result-help").textContent).toContain(
    "1 account was reached by more than one lookup and counts once in the current balance.",
  );
});

for (const input of [
  "1BoatSLRHtKNngkdXEeobR76b53LETtpyT\n1BoatSLRHtKNngkdXEeobR76b53LETtpyU",
  "1BoatSLRHtKNngkdXEeobR76b53LETtpyT\n" + "abandon ".repeat(11) + "about",
])
  it("preflights the entire batch before any network call and erases detected secrets", async () => {
    const { element } = fixture(true);
    await settle();
    element("viewer-batch-input").value = input;
    element("full-viewing-key").value = "stale input";
    element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(network.addressHistory).not.toHaveBeenCalled();
    expect(network.utxoAddresses).not.toHaveBeenCalled();
    expect(element("viewer-error").hidden).toBe(false);
    if (input.includes("abandon")) {
      expect(element("viewer-batch-input").value).toBe("");
      expect(element("full-viewing-key").value).toBe("");
    }
  });

it("offers Gnosis on Mainnet only and loads its balance and nonce without a history", async () => {
  const { element } = fixture();
  await settle();
  element("viewer-network").value = "testnet";
  element("viewer-coin").value = "gnosis";
  element("viewer-coin").dispatchEvent(new Event("change"));
  await settle();
  expect(element("viewer-network").options[1]).toMatchObject({ disabled: true });
  expect(element("viewer-network").value).toBe("mainnet");
  const address = "0x52908400098527886E0F7030069857D2E4169EE7";
  element("full-viewing-key").value = address;
  network.evmAccounts.mockResolvedValue({
    chainId: "100",
    blockNumber: "7",
    entries: [{ address, balance: "1500000000000000000", nonce: "2" }],
  });
  element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  expect(network.evmAccounts).toHaveBeenCalledWith(
    "gnosis",
    "mainnet",
    [address],
    expect.anything(),
  );
  expect(network.addressHistory).not.toHaveBeenCalled();
  const cards = element("viewer-summary").replaceChildren.mock.calls[0]! as Control[];
  expect(cards[0]!.append.mock.calls[0]![2].textContent).toBe("1.5 xDAI");
  expect(element("viewer-completeness").textContent).toMatch(/not read for this network/u);
  element("viewer-coin").value = "ethereum";
  element("viewer-coin").dispatchEvent(new Event("change"));
  await settle();
  expect(element("viewer-network").options[1]).toMatchObject({ disabled: false });
});

// NEAR's first implicit account of the public "abandon … about" phrase, its public key and its
// secret key as the Deriver shows them, Solana's first keypair in Phantom's import form and
// Stellar's first secret seed.
const NEAR_ACCOUNT = "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412";
const NEAR_PUBLIC_KEY = "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25";
const NEAR_SECRET_KEY =
  "ed25519:F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH";
const SOLANA_KEYPAIR =
  "27npWoNE4HfmLeQo1TyWcW7NEA28qnsnDK7kcttDQEWrCWnro83HMJ97rMmpvYYZRwDAvG4KRuB7hTBacvwD7bgi";
const STELLAR_SECRET_SEED = "SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRZ";
// Hedera's first Ed25519 key of the phrase, raw and as its DER private key, and TON's first Trust
// Wallet secret key (seed and public key), as the Deriver shows them.
const HEDERA_KEY = "10fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf";
const HEDERA_PRIVATE_DER =
  "302e020100300506032b657004220420523f9ff611ac02e8e188617750e7e50feabd2ef9ee9b218a5c8ce2693275361d";
const TON_SECRET_KEY =
  "b477ef5ed17fb8a2b8faddd7a9835a227243a82c70b190c7af4896155aa7df9f7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf";

/** A fixture with `coin` selected and `input` in the single field, submitted. */
async function submitted(coin: string, input: string) {
  const fixed = fixture();
  await settle();
  fixed.element("viewer-coin").value = coin;
  fixed.element("viewer-coin").dispatchEvent(new Event("change"));
  await settle();
  fixed.element("full-viewing-key").value = input;
  fixed.element("viewer-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  return fixed;
}

it("reads a NEAR public key's implicit account, the value screened before it is read", async () => {
  network.accountStates.mockImplementation(async (coin: string, _network, addresses: string[]) => ({
    coin,
    height: "9",
    entries: addresses.map((address) => ({
      address,
      exists: true,
      used: true,
      balance: "2000000000000000000000000",
      sequence: null,
    })),
  }));
  const { element } = await submitted("near", NEAR_PUBLIC_KEY);
  expect(element("viewer-input-label").textContent).toBe("NEAR account public key");
  expect(network.accountStates).toHaveBeenCalledWith(
    "near",
    "mainnet",
    [NEAR_ACCOUNT],
    expect.anything(),
  );
  expect(element("viewer-results-description").textContent).toBe(NEAR_ACCOUNT);
  expect(element("diagnostic-proof").textContent).toBe("Account query heights 9");
});

it.each([
  ["NEAR's 64 hex digits", "near", NEAR_ACCOUNT, "public key (ed25519:…)"],
  ["a NEAR secret key", "near", NEAR_SECRET_KEY, "public key (ed25519:…)"],
  ["a Solana keypair", "solana", SOLANA_KEYPAIR, null],
  ["a Stellar secret seed", "stellar", STELLAR_SECRET_SEED, null],
  [
    "Hedera's raw key, 64 hex digits",
    "hedera",
    HEDERA_KEY,
    "public key in DER form (302a… or 302d…)",
  ],
  [
    "a Hedera DER private key",
    "hedera",
    HEDERA_PRIVATE_DER,
    "public key in DER form (302a… or 302d…)",
  ],
  ["a TON secret key in hex", "ton", TON_SECRET_KEY, null],
])(
  "refuses %s as private material: input erased, no request made",
  async (_name, coin, input, hint) => {
    const { element } = await submitted(coin, input);
    expect(network.accountStates).not.toHaveBeenCalled();
    expect(element("full-viewing-key").value).toBe("");
    expect(element("viewer-error").hidden).toBe(false);
    expect(element("viewer-error").textContent).toMatch(/Private key-like material/u);
    expect(element("viewer-error").textContent.includes(input)).toBe(false);
    if (hint === null) expect(element("viewer-error").textContent).not.toMatch(/lookups take/u);
    else expect(element("viewer-error").textContent.includes(hint)).toBe(true);
  },
);

it("claims no history for a balance read without a height (Tron)", async () => {
  network.accountStates.mockImplementation(async (coin: string, _network, addresses: string[]) => ({
    coin,
    height: null,
    entries: addresses.map((address) => ({
      address,
      exists: true,
      used: true,
      balance: "5000000",
      sequence: null,
    })),
  }));
  const { element } = await submitted("tron", "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH");
  expect(element("viewer-input-help").textContent).toMatch(/^Loads current TRX balance; Tron/u);
  expect(element("diagnostic-proof").textContent).toBe(
    "Current provider state; the provider reports no height",
  );
});
