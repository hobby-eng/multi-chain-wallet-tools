import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's client and password review, so the package's WebAssembly is
// never compiled; the import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeCheckTab, matchedLines } from "../src/ui/recovery-mhfe-check.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

const KINDS = ["address", "fingerprint", "builtInCheck", "walletCheck"];
const RADIO_GROUPS = {
  "mhfe-check-reference": KINDS.map((kind) => [`mhfe-check-ref-${kind}`, kind] as [string, string]),
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type Verdict = {
  matches: boolean;
  path: string | null;
  evidence: { builtInCheck: number | null; walletCheck: boolean | null };
};
interface CheckRequest {
  container: string;
  reference: Record<string, unknown>;
  passphrase?: string;
  onProgress: (progress: unknown) => void;
  onNoLength?: () => Promise<unknown>;
}

/** The Check tab over a synthetic client whose checks answer when the test says so. */
function setup(options: { client?: Promise<void> } = {}) {
  const element = installPage(RADIO_GROUPS);
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const requests: CheckRequest[] = [];
  const replies = [deferred<Verdict>(), deferred<Verdict>()];
  const readContainer = vi.fn(async (container: string) => ({
    container,
    suiteId: "SYNTHETIC",
    containerFingerprint: "00000000",
    builtInCheckLengths: [],
    offersWalletCheck: false,
  }));
  const client = {
    readContainer,
    check: (request: CheckRequest) => {
      requests.push(request);
      return replies[requests.length - 1]!.promise;
    },
  };
  // A container phrase as typed is read first; these are valid containers.
  engine.repair = (async () => ({
    inspectContainer: async () => ({ reading: "container", wordCount: 12, unreadable: [] }),
  })) as never;
  engine.client = (async () => {
    await options.client;
    return client;
  }) as never;
  // A synthetic review that needs no answer.
  engine.passwords = (async () => ({
    review: async () => ({
      profile: "MHFE-PASSWORD-CHECK-1",
      reading: "notThisShape",
      correction: null,
      correctionText: null,
      offersCorrection: false,
      repairsFirst: false,
      repairs: [],
    }),
  })) as never;
  new MhfeCheckTab({ jobs: gate, writeClipboard: async () => undefined } as never, engine);
  element("#mhfe-check-words").value = "12";
  element("#mhfe-check-container").value = "synthetic container a";
  element("#mhfe-check-password").value = "synthetic password";
  element("#mhfe-check-ref-fingerprint").checked = true;
  element("#mhfe-check-fingerprint").value = "00000000";
  const panel = element("#mhfe-check-panel");
  // An edit as the browser sends it: to the field, and bubbled up to the tab's panel.
  const edit = (selector: string, value: string): void => {
    element(selector).value = value;
    element(selector).dispatchEvent(new Event("input"));
    panel.dispatchEvent(new Event("input"));
  };
  const choose = (kind: string): void => {
    for (const other of KINDS) element(`#mhfe-check-ref-${other}`).checked = other === kind;
    element(`#mhfe-check-ref-${kind}`).dispatchEvent(new Event("change"));
    panel.dispatchEvent(new Event("change"));
  };
  return {
    element,
    gate,
    requests,
    replies,
    readContainer,
    edit,
    choose,
    press: () => element("#mhfe-check").click(),
    verdict: () => element("#mhfe-check-result").text,
    status: () => element("#mhfe-check-status").textContent,
    cancel: element("#mhfe-check-stop"),
  };
}

const MATCHES = { matches: true, path: null, evidence: { builtInCheck: null, walletCheck: null } };

describe("the MHFE Check verdict belongs to the fields it checked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Matches for unchanged fields", async () => {
    const tab = setup();
    tab.press();
    await settle();
    expect(tab.requests).toHaveLength(1);
    // The first progress report empties the password, which is no edit of the fields.
    tab.requests[0]!.onProgress({ stage: "recover", round: 1, rounds: 12 });
    expect(tab.element("#mhfe-check-password").value).toBe("");
    tab.replies[0]!.resolve(MATCHES);
    await settle();
    expect(tab.verdict()).toContain("Matches");
    expect(tab.gate.runningJob).toBeNull();
    expect(tab.cancel.hidden).toBe(true);
    expect(tab.cancel.onclick).toBeNull();
  });

  for (const selector of [
    "#mhfe-check-container",
    "#mhfe-check-password",
    "#mhfe-check-passphrase",
    "#mhfe-check-pim",
  ]) {
    it(`drops the verdict when ${selector} changes during the check`, async () => {
      const tab = setup();
      tab.press();
      await settle();
      tab.requests[0]!.onProgress({ stage: "recover", round: 1, rounds: 12 });
      tab.edit(selector, "synthetic edit");
      tab.replies[0]!.resolve(MATCHES);
      await settle();
      expect(tab.verdict()).not.toContain("Matches");
      expect(tab.status()).toContain("The fields changed while the check ran");
      expect(tab.gate.runningJob).toBeNull();
    });
  }

  it("drops the verdict when the kind of reference changes during the check", async () => {
    const tab = setup();
    tab.press();
    await settle();
    tab.choose("address");
    tab.replies[0]!.resolve(MATCHES);
    await settle();
    expect(tab.verdict()).not.toContain("Matches");
  });

  it("removes a verdict as soon as a field changes after the check", async () => {
    const tab = setup();
    tab.press();
    await settle();
    tab.replies[0]!.resolve(MATCHES);
    await settle();
    expect(tab.verdict()).toContain("Matches");
    tab.edit("#mhfe-check-fingerprint", "11111111");
    expect(tab.verdict()).not.toContain("Matches");
  });

  it("starts no check for fields changed before the container was read", async () => {
    const tab = setup();
    tab.press();
    tab.edit("#mhfe-check-container", "synthetic container b");
    await settle();
    expect(tab.requests).toHaveLength(0);
    expect(tab.element("#mhfe-check-read").text.trim()).toBe("");
    expect(tab.gate.runningJob).toBeNull();
  });

  it("shows an error only for the fields that gave it", async () => {
    const edited = setup();
    edited.press();
    await settle();
    edited.edit("#mhfe-check-container", "synthetic container b");
    edited.replies[0]!.reject(new Error("synthetic refusal"));
    await settle();
    expect(edited.status()).not.toContain("synthetic refusal");
    expect(edited.gate.runningJob).toBeNull();
    expect(edited.cancel.hidden).toBe(true);
    expect(edited.cancel.onclick).toBeNull();
    vi.unstubAllGlobals();

    const unchanged = setup();
    unchanged.press();
    await settle();
    unchanged.replies[0]!.reject(new Error("synthetic refusal"));
    await settle();
    expect(unchanged.status()).toContain("synthetic refusal");
  });

  it("checks the new fields on the next press and shows only that verdict", async () => {
    const tab = setup();
    tab.press();
    await settle();
    tab.edit("#mhfe-check-container", "synthetic container b");
    tab.replies[0]!.resolve(MATCHES);
    await settle();
    tab.element("#mhfe-check-password").value = "synthetic password";
    tab.press();
    await settle();
    expect(tab.requests).toHaveLength(2);
    expect(tab.requests[1]!.container).toBe("synthetic container b");
    tab.replies[1]!.resolve(MATCHES);
    await settle();
    expect(tab.verdict()).toContain("Matches");
  });

  it("starts nothing after a Cancel while the package is prepared", async () => {
    const compiled = deferred<void>();
    const tab = setup({ client: compiled.promise });
    tab.press();
    await settle();
    expect(tab.cancel.hidden).toBe(false);
    tab.cancel.onclick!();
    await settle();
    expect(tab.gate.runningJob).toBeNull();
    compiled.resolve();
    await settle();
    expect(tab.readContainer).not.toHaveBeenCalled();
    expect(tab.requests).toHaveLength(0);
    expect(tab.status()).toMatch(/^Stopped\./u);
  });
});

describe("a check that detects the original seed phrase's length (MHFE 0.6.0)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends words 0 with the passphrase, and compares a 24-word phrase with the wallet given when no length passed", async () => {
    const tab = setup();
    tab.choose("builtInCheck");
    tab.element("#mhfe-check-words").value = "0";
    tab.element("#mhfe-check-passphrase").value = "TREZOR";
    tab.press();
    await settle();
    expect(tab.requests).toHaveLength(1);
    const request = tab.requests[0]!;
    expect(request.reference).toEqual({ words: 0 });
    expect(request.passphrase).toBe("TREZOR");
    // Detection found no length: the question shows, and the answer goes back to the package.
    const answer = request.onNoLength!();
    await settle();
    expect(tab.element("#mhfe-check-no-length").hidden).toBe(false);
    tab.element("#mhfe-check-no-length-reference").value = "73C5DA0A";
    tab.element("#mhfe-check-no-length-compare").onclick!();
    await expect(answer).resolves.toEqual({ fingerprint: "73c5da0a", passphrase: "TREZOR" });
    expect(tab.element("#mhfe-check-no-length").hidden).toBe(true);
    tab.replies[0]!.resolve(MATCHES);
    await settle();
    // The match came from the fingerprint given, and an answer is no edit of the fields.
    expect(tab.verdict()).toContain(
      "the master key fingerprint of the wallet, with this BIP39 passphrase",
    );
  });

  it("keeps the result when the phrase has fewer words, which detection found not to pass", async () => {
    const tab = setup();
    tab.choose("builtInCheck");
    tab.element("#mhfe-check-words").value = "0";
    tab.press();
    await settle();
    const answer = tab.requests[0]!.onNoLength!();
    tab.element("#mhfe-check-no-length-fewer").onclick!();
    await expect(answer).resolves.toBeNull();
  });

  it("asks nothing after a detection with a length of its own", async () => {
    const tab = setup();
    tab.choose("builtInCheck");
    tab.element("#mhfe-check-words").value = "12";
    tab.press();
    await settle();
    expect(tab.requests[0]!.reference).toEqual({ words: 12 });
    expect(tab.requests[0]).not.toHaveProperty("onNoLength");
    expect(tab.requests[0]).not.toHaveProperty("passphrase");
  });
});

describe("the matches a check lists, as mhfe check lists them", () => {
  it("names the checksum, the search, the reference and the original seed phrase's own checks", () => {
    const foundBy = "the container's own wallet: master key fingerprint e0f73b78";
    expect(
      matchedLines("fingerprint", { builtInCheck: 12, walletCheck: true }, true, foundBy, 16),
    ).toEqual([
      "the container phrase passes its BIP39 checksum",
      foundBy,
      "the master key fingerprint of the wallet, with this BIP39 passphrase",
      "the built-in check of a 12-word original seed phrase",
      "the phrase + passphrase check: its first 16 bits are zero",
    ]);
  });

  it("lists a check only where it passed, and the chosen one once", () => {
    expect(
      matchedLines("address", { builtInCheck: null, walletCheck: false }, false, undefined, 16),
    ).toEqual([
      "the container phrase passes its BIP39 checksum",
      "the receiving address of the wallet, without a BIP39 passphrase",
    ]);
    expect(
      matchedLines("builtInCheck", { builtInCheck: 15, walletCheck: null }, false, undefined, 16),
    ).toEqual([
      "the container phrase passes its BIP39 checksum",
      "the built-in check of a 15-word original seed phrase",
    ]);
    expect(
      matchedLines("walletCheck", { builtInCheck: null, walletCheck: true }, true, undefined, 16),
    ).toEqual([
      "the container phrase passes its BIP39 checksum",
      "the phrase + passphrase check: its first 16 bits are zero",
    ]);
  });
});
