import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's classes, so the package's WebAssembly is never compiled; the
// import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { MarkedContainer } from "../src/ui/recovery-mhfe-marked-container.js";
import { searchTimeText } from "../src/ui/recovery-mhfe-missing-words.js";
import { MhfeRun } from "../src/ui/recovery-mhfe-run.js";
import { timeRange } from "../src/ui/recovery-mhfe-status.js";
import { type FakeElement, installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// A container phrase with words typed as ?, read as mhfe reads it: the repair words at once, or a
// search without them (MHFE 0.6.0). Driven through the real classes with a synthetic package; the
// package's own answers are checked by tooling/verify-mhfe-vector.mjs.

// mhfe's zero-12 container and its own fingerprint.
const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const markedAt = (...places: number[]): string =>
  CONTAINER.split(" ")
    .map((word, index) => (places.includes(index + 1) ? "?" : word))
    .join(" ");

const M = "mhfe-decrypt-missing";
// Public zero-12 container at a nonstandard path, independently computed with @scure/bip32.
const CUSTOM_PATH = "m/123'/4/9'/8";
const CONTAINER_ADDRESS = "bc1qpph2gpw6eyuhl0gm6w5hcml80rvy3th3l0l9qu";
const RADIO_GROUPS: Readonly<Record<string, [string, string][]>> = {
  [`${M}-known`]: ["container", "original", "passphrase", "nothing"].map(
    (known) => [`${M}-known-${known}`, known] as [string, string],
  ),
  [`${M}-passphrase-used`]: ["no", "yes"].map(
    (answer) => [`${M}-passphrase-used-${answer}`, answer] as [string, string],
  ),
  // The gaps themselves are made from the package's decoyScanGap; "Another number" is markup.
  [`${M}-gap`]: [[`${M}-gap-other`, "other"]],
};

/** Every text under `element`, depth first. */
function texts(element: FakeElement | string): string[] {
  if (typeof element === "string") return [element];
  return [element.textContent, ...element.children.flatMap(texts)];
}

/** The first button under `element` whose text is `label`. */
function button(element: FakeElement | string, label: string): FakeElement | undefined {
  if (typeof element === "string") return undefined;
  if (element.textContent === label && element.children.length === 0) return element;
  for (const child of element.children) {
    const found = button(child, label);
    if (found !== undefined) return found;
  }
  return undefined;
}

function setup(written: string, found = true, pendingSearch?: Promise<void>) {
  const element = installPage(RADIO_GROUPS);
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const calls: { name: string; request: Record<string, unknown> }[] = [];
  const missing = written.split(" ").flatMap((word, index) => (word === "?" ? [index + 1] : []));
  engine.repair = (async () => ({
    inspectContainer: async ({ container }: { container: string }) =>
      container.includes("?")
        ? { reading: "marked", wordCount: 24, unreadable: missing }
        : { reading: "container", wordCount: 24, unreadable: [] },
    repairContainer: async (request: Record<string, unknown>) => {
      calls.push({ name: "repairContainer", request });
      return {
        container: CONTAINER,
        containerFingerprint: "487a156e",
        unchanged: false,
        containerWords: missing,
        cardWords: [],
        changes: missing.map((position) => ({ onCard: false, position, read: null, word: "x" })),
      };
    },
  })) as never;
  const result = {
    found,
    container: found ? CONTAINER : null,
    containerFingerprint: found ? "487a156e" : null,
    words: found ? [{ position: 24, word: "peace" }] : [],
    path: null,
    candidates: 8,
  };
  engine.client = (async () => ({
    // The package's values as parameters() gives them.
    parameters: async () => ({ decoyScanGap: 20, rounds: 12 }),
    // Which searches apply is the library's answer: the owner's wallet for one missing word.
    searchCandidates: async () => ({
      missing,
      candidates: missing.length === 1 ? 8 : 16384,
      offersWalletSearch: missing.length === 1,
      offersOwnChecks: missing.length === 1,
    }),
    searchDecoy: async (request: Record<string, unknown>) => {
      calls.push({ name: "searchDecoy", request });
      await pendingSearch;
      return result;
    },
    searchWallet: async (request: Record<string, unknown>) => {
      calls.push({ name: "searchWallet", request });
      await pendingSearch;
      return {
        ...result,
        found: true,
        container: CONTAINER,
        words: [{ position: 24, word: "peace" }],
      };
    },
  })) as never;
  element("#mhfe-container").value = written;
  const resume = vi.fn();
  const marked = new MarkedContainer(
    { jobs: gate, writeClipboard: async () => undefined } as never,
    engine,
    {
      prefix: "decrypt",
      field: {
        textarea: element("#mhfe-container"),
        get value() {
          return element("#mhfe-container").value;
        },
      } as never,
      status: element("#mhfe-decrypt-status") as never,
      recovery: {
        pim: { value: () => 0 },
        settings: async () => ({
          password: "synthetic password",
          passwordRepair: "asTyped",
          pim: 0,
        }),
      },
      resume,
    },
  );
  const ready = (): Promise<boolean> => marked.ready(new MhfeRun(() => undefined));
  const press = async (id: string): Promise<void> => {
    element(id).click();
    await settle();
  };
  const result$ = () => element("#mhfe-decrypt-marked-result");
  const status = () => element("#mhfe-decrypt-marked-status").textContent;
  return { element, calls, resume, ready, press, result: result$, status };
}

describe("a container phrase with words marked ?", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("goes on with a valid container and stops at a marked one", async () => {
    expect(await setup(CONTAINER).ready()).toBe(true);
    const page = setup(markedAt(3, 17));
    expect(await page.ready()).toBe(false);
    expect(page.element("#mhfe-decrypt-marked").hidden).toBe(false);
    expect(page.element("#mhfe-decrypt-marked-reading").textContent).toMatch(
      /^Words 3 and 17 of the container phrase cannot be read\./u,
    );
    expect(page.element("#mhfe-decrypt-marked-card-field").hidden).toBe(false);
    expect(page.element("#mhfe-decrypt-marked-no-card").hidden).toBe(false);
  });

  it("repairs it with the repair words and uses it only after Use it", async () => {
    const page = setup(markedAt(3, 17));
    await page.ready();
    page.element("#mhfe-decrypt-marked-card").value = "shaft pupil patient jewel";
    await page.press("#mhfe-decrypt-marked-repair");
    expect(page.calls[0]).toEqual({
      name: "repairContainer",
      request: { container: markedAt(3, 17), card: "shaft pupil patient jewel" },
    });
    expect(texts(page.result())).toContain("Repaired words 3 and 17 of the container phrase.");
    expect(page.element("#mhfe-container").value).toBe(markedAt(3, 17));
    button(page.result(), "Use it")?.click();
    expect(page.element("#mhfe-container").value).toBe(CONTAINER);
    expect(page.resume).toHaveBeenCalledOnce();
  });

  /** Chooses an answer of a radio group as a person does, and lets the block follow it. */
  const choose = (page: ReturnType<typeof setup>, group: string, value: string): void => {
    for (const [id, radioValue] of RADIO_GROUPS[group]!)
      page.element(`#${id}`).checked = radioValue === value;
    page.element(`#${M}`).dispatchEvent(new Event("change"));
  };

  it("finds word 24 by the container's own fingerprint, with no passphrase, and says by what", async () => {
    const page = setup(markedAt(24));
    await page.ready();
    await page.press("#mhfe-decrypt-marked-no-card");
    expect(page.element(`#${M}-candidates`).textContent).toBe(
      "MHFE tries every word the checksum allows: 8 candidates.",
    );
    choose(page, `${M}-known`, "container");
    expect(page.element(`#${M}-reference-field`).hidden).toBe(false);
    expect(page.element(`#${M}-passphrase-question-text`).textContent).toBe(
      "Is a BIP39 passphrase used with the container phrase?",
    );
    page.element(`#${M}-reference`).value = "487A156E";
    choose(page, `${M}-passphrase-used`, "no");
    await page.press(`#${M}-run`);
    expect(page.calls.map((call) => call.name)).toEqual(["searchDecoy"]);
    expect(page.calls[0]!.request).toMatchObject({
      container: markedAt(24),
      reference: { fingerprint: "487a156e" },
      passphrase: "",
    });
    expect(page.calls[0]!.request).not.toHaveProperty("scanGap");
    expect(texts(page.result())).toContain(
      "Found word 24: peace, with the container's own wallet.",
    );
    button(page.result(), "Use it")?.click();
    expect(page.element("#mhfe-container").value).toBe(CONTAINER);
    expect(page.resume).toHaveBeenCalledWith(
      "the container's own wallet: master key fingerprint 487a156e",
    );
  });

  it("compares the container's own wallet with exactly the passphrase given", async () => {
    const page = setup(markedAt(24));
    await page.ready();
    await page.press("#mhfe-decrypt-marked-no-card");
    choose(page, `${M}-known`, "container");
    page.element(`#${M}-reference`).value = "487a156e";
    choose(page, `${M}-passphrase-used`, "yes");
    expect(page.element(`#${M}-passphrase-field`).hidden).toBe(false);
    expect(page.element(`#${M}-passphrase-label`).textContent).toBe(
      "BIP39 passphrase of the container phrase",
    );
    page.element(`#${M}-passphrase`).value = "TREZOR";
    await page.press(`#${M}-run`);
    expect(page.calls[0]!.request).toMatchObject({ passphrase: "TREZOR" });
  });

  it("offers only the container's own wallet for two missing words, and asks how far it goes", async () => {
    const page = setup(markedAt(5, 16), false);
    await page.ready();
    await page.press("#mhfe-decrypt-marked-no-card");
    for (const known of ["original", "passphrase", "nothing"])
      expect(page.element(`#${M}-known-${known}`).label?.hidden).toBe(true);
    expect(page.element(`#${M}-limits`).textContent).toBe(
      "Two words are missing: only a fingerprint or an address of the container's own wallet finds them, without the password.",
    );
    choose(page, `${M}-known`, "container");
    page.element(`#${M}-reference`).value = "3FWJwUxDaXoGrxZQHT4EHBDZCZw7iHUaRn";
    page.element(`#${M}-reference`).dispatchEvent(new Event("input"));
    expect(page.element(`#${M}-coin-field`).hidden).toBe(false);
    expect(page.element(`#${M}-gap-field`).hidden).toBe(false);
    page.element(`#${M}-coin`).value = "bitcoin";
    choose(page, `${M}-gap`, "other");
    page.element(`#${M}-gap-own`).value = "60";
    choose(page, `${M}-passphrase-used`, "no");
    await page.press(`#${M}-run`);
    expect(page.calls[0]).toMatchObject({
      name: "searchDecoy",
      request: {
        reference: { address: "3FWJwUxDaXoGrxZQHT4EHBDZCZw7iHUaRn", coin: "bitcoin" },
        scanGap: 60,
      },
    });
    expect(page.status()).toMatch(
      /^The container's own wallet does not match: the address or fingerprint/u,
    );
    // Back at the first question, not at the container phrase.
    expect(page.element(`#${M}`).hidden).toBe(false);
  });

  it("says the time of a search with your wallet, and Not now goes back to the question", async () => {
    const page = setup(markedAt(24));
    await page.ready();
    await page.press("#mhfe-decrypt-marked-no-card");
    choose(page, `${M}-known`, "original");
    expect(page.element(`#${M}-passphrase-question-text`).textContent).toBe(
      "Is a BIP39 passphrase used with the original seed phrase?",
    );
    page.element(`#${M}-reference`).value = "73c5da0a";
    choose(page, `${M}-passphrase-used`, "no");
    await page.press(`#${M}-run`);
    expect(page.calls).toEqual([]);
    expect(page.element(`#${M}-time`).textContent).toBe(
      "8 candidates, each a full recovery: about 32 to 56 minutes at these settings.",
    );
    await page.press(`#${M}-not-now`);
    expect(page.element(`#${M}-run`).textContent).toBe("Search");
    expect(page.element(`#${M}-time`).hidden).toBe(true);
    await page.press(`#${M}-run`);
    await page.press(`#${M}-run`);
    expect(page.calls[0]).toMatchObject({
      name: "searchWallet",
      request: {
        password: "synthetic password",
        reference: { fingerprint: "73c5da0a" },
        passphrase: "",
      },
    });
    expect(texts(page.result())).toContain("Found word 24: peace, with your wallet.");
  });

  for (const known of ["container", "original"] as const) {
    it(`forwards an exact address path to the ${known === "container" ? "decoy" : "original wallet"} search`, async () => {
      const page = setup(markedAt(24));
      await page.ready();
      await page.press("#mhfe-decrypt-marked-no-card");
      choose(page, `${M}-known`, known);
      page.element(`#${M}-reference`).value = CONTAINER_ADDRESS;
      page.element(`#${M}-coin`).value = "bitcoin";
      page.element(`#${M}-reference`).dispatchEvent(new Event("input"));
      page.element(`#${M}-use-path`).checked = true;
      page.element(`#${M}-path`).value = ` ${CUSTOM_PATH} `;
      page.element(`#${M}-use-path`).dispatchEvent(new Event("change"));
      choose(page, `${M}-passphrase-used`, "no");
      await page.press(`#${M}-run`);
      if (known === "original") await page.press(`#${M}-run`);
      expect(page.calls[0]).toMatchObject({
        name: known === "container" ? "searchDecoy" : "searchWallet",
        request: {
          reference: { address: CONTAINER_ADDRESS, coin: "bitcoin", path: CUSTOM_PATH },
          passphrase: "",
        },
      });
      expect(page.calls[0]!.request).not.toHaveProperty("scanGap");
    });
  }

  for (const control of ["path", "use-path"] as const) {
    it(`drops a running search result after the ${control} choice changes`, async () => {
      let finish!: () => void;
      const page = setup(markedAt(24), true, new Promise((resolve) => (finish = resolve)));
      await page.ready();
      await page.press("#mhfe-decrypt-marked-no-card");
      choose(page, `${M}-known`, "container");
      page.element(`#${M}-reference`).value = CONTAINER_ADDRESS;
      page.element(`#${M}-coin`).value = "bitcoin";
      page.element(`#${M}-reference`).dispatchEvent(new Event("input"));
      page.element(`#${M}-path`).value = CUSTOM_PATH;
      page.element(`#${M}-use-path`).checked = true;
      page.element(`#${M}-use-path`).dispatchEvent(new Event("change"));
      choose(page, `${M}-passphrase-used`, "no");
      await page.press(`#${M}-run`);
      expect(page.calls).toHaveLength(1);
      const input = page.element(`#${M}-${control}`);
      if (control === "path") input.value = "m/123'/4/9'/7";
      else input.checked = false;
      const event = control === "path" ? "input" : "change";
      input.dispatchEvent(new Event(event));
      // FakeElement does not bubble events: deliver the same edit to the owning block.
      page.element(`#${M}`).dispatchEvent(new Event(event));
      finish();
      await settle();
      expect(texts(page.result()).join(" ")).not.toContain("Found word");
      expect(page.status()).toContain("The fields changed while the operation ran");
    });
  }

  for (const [known, passphrase, reference] of [
    ["passphrase", "TREZOR", { walletCheck: true }],
    ["passphrase", "", { builtInCheck: true }],
    ["nothing", "", { builtInCheck: true }],
  ] as const)
    it(`searches with the original seed phrase's own checks (${known}, passphrase ${passphrase === "" ? "empty" : "given"})`, async () => {
      const page = setup(markedAt(24));
      await page.ready();
      await page.press("#mhfe-decrypt-marked-no-card");
      choose(page, `${M}-known`, known);
      expect(page.element(`#${M}-reference-field`).hidden).toBe(true);
      if (known === "passphrase") {
        expect(page.element(`#${M}-passphrase-label`).textContent).toBe(
          "BIP39 passphrase of the original seed phrase",
        );
        page.element(`#${M}-passphrase`).value = passphrase;
      }
      await page.press(`#${M}-run`);
      await page.press(`#${M}-run`);
      expect(page.calls[0]).toMatchObject({
        name: "searchWallet",
        request: { container: markedAt(24), reference, passphrase },
      });
      expect(texts(page.result())).toContain(
        "Found word 24: peace, by the original seed phrase's own check.",
      );
    });
});

describe("the time of a search with the owner's wallet", () => {
  it("uses one readable unit, as mhfe does", () => {
    expect(timeRange(60, 120)).toBe("1 to 2 minutes");
    expect(timeRange(3 * 3600, 6 * 3600)).toBe("3 to 6 hours");
    expect(timeRange(4 * 86400, 8 * 86400)).toBe("4 to 8 days");
  });

  it("multiplies one recovery by the candidates and PIM + 1", () => {
    expect(searchTimeText(8, 0, [60, 120])).toBe(
      "8 candidates, each a full recovery: about 8 to 16 minutes at these settings.",
    );
    expect(searchTimeText(8, 1, [60, 120])).toBe(
      "8 candidates, each a full recovery: about 16 to 32 minutes at these settings.",
    );
    expect(searchTimeText(8, 0, [240, 420])).toBe(
      "8 candidates, each a full recovery: about 32 to 56 minutes at these settings.",
    );
  });
});
