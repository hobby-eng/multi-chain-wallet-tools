import { afterEach, describe, expect, it, vi } from "vitest";

// The test replaces the engine's client and password review, so the package's WebAssembly is
// never compiled; the import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { MhfeError } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { KEEP_FOR_OTHER_WALLETS, MhfeRekeyTab } from "../src/ui/recovery-mhfe-rekey.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// The rekey tab's regression tests for AUD-022-API004 (what a rekey is told about the wallet's
// BIP39 passphrase) and AUD-022-API007 (the owner's phrase on every way out), driven through the
// real tab and its fields with a synthetic client (AUD-023-ARC001). No WebAssembly or Argon2 runs.

/** The radio groups the tab reads by name, with the value of each radio. */
const RADIO_GROUPS: Readonly<Record<string, readonly [string, string][]>> = {
  "mhfe-rekey-reference": [
    ["mhfe-rekey-ref-address", "address"],
    ["mhfe-rekey-ref-fingerprint", "fingerprint"],
    ["mhfe-rekey-ref-owner", "owner"],
  ],
};

/** The new container that the synthetic client seals. */
const SEALED = {
  container: "synthetic new container",
  containerFingerprint: "00000000",
  keep: [{ item: "containerWords", words: 12 }, { item: "password" }],
};

type RekeyRequest = Record<string, unknown> & {
  confirmation: { owner?: (check: { phrase: string }) => Promise<boolean> };
};

/**
 * The tab over a synthetic client: `confirmation` is what readContainer reports for 12 words, and
 * `rekey` decides what client.rekey does with each request.
 */
function setup(
  confirmation: "builtInCheck" | "walletOrOwner",
  rekey: (request: RekeyRequest, cancelled: Promise<never>) => Promise<unknown> = async () =>
    SEALED,
) {
  const element = installPage(RADIO_GROUPS);
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const requests: RekeyRequest[] = [];
  let cancel!: (cause: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => (cancel = reject));
  cancelled.catch(() => undefined);
  engine.cancelCore = () => cancel(new MhfeError("CANCELLED", "Synthetic cancellation"));
  // A container phrase as typed is read first; these are valid containers.
  engine.repair = (async () => ({
    inspectContainer: async () => ({ reading: "container", wordCount: 12, unreadable: [] }),
  })) as never;
  engine.client = (async () => ({
    readContainer: async (container: string) => ({
      container,
      suiteId: "SYNTHETIC",
      containerFingerprint: "00000000",
      builtInCheckLengths: confirmation === "builtInCheck" ? [12] : [],
      phraseLengths: [12],
      confirmationFor: { 12: confirmation },
    }),
    rekey: (request: RekeyRequest) => {
      requests.push(request);
      return rekey(request, cancelled);
    },
  })) as never;
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
    strength: async () => ({ weak: false }),
  })) as never;
  new MhfeRekeyTab({ jobs: gate, writeClipboard: async () => undefined } as never, engine);
  const fill = (): void => {
    element("#mhfe-rekey-words").value = "12";
    element("#mhfe-rekey-container").value = "synthetic old container";
    element("#mhfe-rekey-password").value = "synthetic old password";
    element("#mhfe-rekey-new-password").value = "synthetic new password";
    element("#mhfe-rekey-new-password-confirm").value = "synthetic new password";
  };
  const reference = (kind: "fingerprint" | "owner"): void => {
    element(`#mhfe-rekey-ref-${kind}`).checked = true;
    element("#mhfe-rekey-fingerprint").value = "73c5da0a";
  };
  const answer = (hasPassphrase: boolean | undefined): void => {
    element("#mhfe-rekey-wallet-passphrase-yes").checked = hasPassphrase === true;
    element("#mhfe-rekey-wallet-passphrase-no").checked = hasPassphrase === false;
  };
  const start = async (): Promise<void> => {
    element("#mhfe-rekey").click();
    await settle();
  };
  return {
    element,
    gate,
    requests,
    fill,
    reference,
    answer,
    start,
    status: () => element("#mhfe-rekey-status").textContent,
    owner: element("#mhfe-rekey-owner"),
    cancel: () => element("#mhfe-rekey-stop").onclick?.(),
  };
}

describe("an MHFE password change is told about the wallet's BIP39 passphrase (AUD-022-API004)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const hasPassphrase of [true, false])
    it(`passes the answer "${hasPassphrase ? "yes" : "no"}" with the built-in check`, async () => {
      const tab = setup("builtInCheck");
      tab.fill();
      tab.answer(hasPassphrase);
      await tab.start();
      expect(tab.requests).toHaveLength(1);
      expect(tab.requests[0]).toMatchObject({
        confirmation: { builtInCheck: true },
        walletHasPassphrase: hasPassphrase,
      });
      expect(tab.requests[0]).not.toHaveProperty("passphrase");
    });

  it("compares a fingerprint with the passphrase of a wallet that has one", async () => {
    const tab = setup("walletOrOwner");
    tab.fill();
    tab.reference("fingerprint");
    tab.answer(true);
    tab.element("#mhfe-rekey-passphrase").value = "TREZOR";
    await tab.start();
    expect(tab.requests[0]).toMatchObject({
      confirmation: { fingerprint: "73c5da0a" },
      passphrase: "TREZOR",
      walletHasPassphrase: true,
    });
  });

  it("sends no passphrase for a wallet without one, whatever the hidden field holds", async () => {
    const tab = setup("walletOrOwner");
    tab.fill();
    tab.reference("fingerprint");
    tab.answer(false);
    tab.element("#mhfe-rekey-passphrase").value = "stale text";
    await tab.start();
    expect(tab.requests[0]).toMatchObject({ walletHasPassphrase: false });
    expect(tab.requests[0]).not.toHaveProperty("passphrase");
  });

  it("refuses before any work when the question is not answered, or the passphrase is missing", async () => {
    const unanswered = setup("builtInCheck");
    unanswered.fill();
    await unanswered.start();
    expect(unanswered.requests).toHaveLength(0);
    expect(unanswered.status()).toContain("has a BIP39 passphrase");

    vi.unstubAllGlobals();
    const empty = setup("walletOrOwner");
    empty.fill();
    empty.reference("fingerprint");
    empty.answer(true);
    await empty.start();
    expect(empty.requests).toHaveLength(0);
    expect(empty.status()).toContain("Type the wallet's BIP39 passphrase");
  });
});

describe("a password change whose length several readings pass (AMBIGUOUS_LENGTH)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says the library's message and asks for an address, the fingerprint or the owner", async () => {
    const tab = setup("builtInCheck", async () => {
      throw new MhfeError(
        "AMBIGUOUS_LENGTH",
        "The built-in check passes for 12 and 21 words by accident: state the word count of the original seed phrase, which encryption asked to keep",
      );
    });
    tab.fill();
    tab.answer(false);
    await tab.start();
    expect(tab.status()).toBe(
      "The built-in check passes for 12 and 21 words by accident: state the word count of the original seed phrase, which encryption asked to keep.",
    );
    // The built-in check alone no longer confirms: the confirmation choice opens (mhfe 0.6.0).
    expect(tab.element("#mhfe-rekey-reference").hidden).toBe(false);
    expect(tab.element("#mhfe-rekey-builtin-note").hidden).toBe(true);
  });
});

describe("the owner's phrase question closes on every way out (AUD-022-API007)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A rekey that shows the owner the phrase and waits, until Cancel or `fail`. */
  function asksOwner(fail?: Promise<never>) {
    return (request: RekeyRequest, cancelled: Promise<never>) => {
      void request.confirmation.owner?.({ phrase: "synthetic recovered phrase" });
      return Promise.race([cancelled, ...(fail === undefined ? [] : [fail])]);
    };
  }

  it("empties the phrase and releases the job after Cancel", async () => {
    const tab = setup("walletOrOwner", asksOwner());
    tab.fill();
    tab.reference("owner");
    tab.answer(false);
    await tab.start();
    expect(tab.owner.children.length).toBeGreaterThan(0);
    expect(tab.gate.runningJob).toBe("MHFE password change");
    tab.cancel();
    await settle();
    expect(tab.owner.children).toHaveLength(0);
    expect(tab.gate.runningJob).toBeNull();
  });

  it("empties the phrase and releases the job after a failure", async () => {
    let fail!: (cause: unknown) => void;
    const failure = new Promise<never>((_, reject) => (fail = reject));
    const tab = setup("walletOrOwner", asksOwner(failure));
    tab.fill();
    tab.reference("owner");
    tab.answer(false);
    await tab.start();
    expect(tab.owner.children.length).toBeGreaterThan(0);
    fail(new MhfeError("VERIFICATION_FAILED", "Synthetic failure"));
    await settle();
    expect(tab.owner.children).toHaveLength(0);
    expect(tab.gate.runningJob).toBeNull();
  });
});

describe("the warning about the wallets of other passwords (owner's wording, mhfe 0.6.0)", () => {
  it("keeps the old container and gives no advice to destroy it", () => {
    expect(KEEP_FOR_OTHER_WALLETS).toBe(
      "Wallets that other passwords open on the old container do not move to the new one: keep the old container, its passwords and its settings until you have moved their funds.",
    );
    expect(KEEP_FOR_OTHER_WALLETS).not.toMatch(/destroy|delete/u);
  });
});

describe("a password change confirmed again on the same recovery (mhfe 0.6.0 onConfirmAgain)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type ConfirmAgain = (refusal: {
    error: MhfeError;
    ownerLengths: number[];
  }) => Promise<Record<string, unknown> | null>;

  /** A rekey that asks to confirm again once, keeps the answer and seals unless it is null. */
  function confirmsAgain(error: MhfeError, ownerLengths: number[], answers: unknown[]) {
    return async (request: RekeyRequest) => {
      const answer = await (request.onConfirmAgain as ConfirmAgain)({ error, ownerLengths });
      answers.push(answer);
      if (answer === null) throw error;
      return SEALED;
    };
  }

  type Node = { textContent: string; children: unknown[]; id?: string; click(): void };
  /** The first element below `host`, the page's fake ones included, that `match` accepts. */
  const find = (host: unknown, match: (node: Node) => boolean): Node => {
    const pending = [...(host as Node).children];
    while (pending.length > 0) {
      const node = pending.shift() as Node;
      if (typeof node === "string") continue;
      if (match(node)) return node;
      pending.push(...node.children);
    }
    throw new Error("No such element.");
  };
  const clickButton = (host: unknown, text: string): void =>
    find(host, (node) => node.textContent === text).click();

  it("asks for an address or the fingerprint after LENGTH_DIFFERS, without the owner", async () => {
    const answers: unknown[] = [];
    const refusal = new MhfeError("LENGTH_DIFFERS", "The built-in check finds 12 words");
    const tab = setup("builtInCheck", confirmsAgain(refusal, [], answers));
    tab.fill();
    tab.answer(false);
    await tab.start();
    expect(tab.status()).toMatch(
      /finds 12 words.*receiving address or the master key fingerprint/u,
    );
    expect(tab.element("#mhfe-rekey-reference").hidden).toBe(false);
    // The choice is a question of the running job: answering it does not drop the job.
    expect(tab.element("#mhfe-rekey-reference").dataset.jobQuestion).toBe("");
    tab.reference("fingerprint");
    clickButton(tab.owner, "Confirm");
    await settle();
    expect(answers).toEqual([{ fingerprint: "73c5da0a" }]);
    expect(tab.requests).toHaveLength(1);
    expect(tab.element("#mhfe-rekey-reference").dataset.jobQuestion).toBeUndefined();
  });

  it("lets the owner pick one of several lengths after AMBIGUOUS_LENGTH", async () => {
    const answers: unknown[] = [];
    const refusal = new MhfeError("AMBIGUOUS_LENGTH", "Several lengths pass by accident");
    const tab = setup("builtInCheck", confirmsAgain(refusal, [12, 21], answers));
    tab.fill();
    tab.answer(false);
    await tab.start();
    tab.reference("owner");
    // Nothing is preselected: Confirm without a word count is refused on the page.
    clickButton(tab.owner, "Confirm");
    expect(tab.status()).toMatch(/Choose the word count/u);
    (
      find(tab.owner, (node) => node.id === "mhfe-rekey-again-words") as unknown as {
        value: string;
      }
    ).value = "21";
    clickButton(tab.owner, "Confirm");
    await settle();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ words: 21 });
    expect(typeof (answers[0] as { owner: unknown }).owner).toBe("function");
  });

  it("ends with the original refusal when the person stops", async () => {
    const answers: unknown[] = [];
    const refusal = new MhfeError("LENGTH_DIFFERS", "The built-in check finds 12 words");
    const tab = setup("builtInCheck", confirmsAgain(refusal, [], answers));
    tab.fill();
    tab.answer(false);
    await tab.start();
    clickButton(tab.owner, "Stop");
    await settle();
    expect(answers).toEqual([null]);
    expect(tab.status()).toMatch(/finds 12 words/u);
    expect(tab.owner.childElementCount).toBe(0);
  });
});
