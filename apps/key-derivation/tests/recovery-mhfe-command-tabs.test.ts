import { setMaxListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// The tests replace the engine's classes, so the package's WebAssembly is never compiled; the
// import only needs a value.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeCheckTab } from "../src/ui/recovery-mhfe-check.js";
import { MhfeDecodeTab } from "../src/ui/recovery-mhfe-decode.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { MhfeRekeyTab } from "../src/ui/recovery-mhfe-rekey.js";
import { MhfeWalletsTab } from "../src/ui/recovery-mhfe-wallets.js";
import { installPage, settle, withPackageValues } from "./fake-mhfe-page.js";

// The mhfe command and the memory level on Decode, Check, Change password and Hidden wallets,
// driven through the real tabs with a synthetic package: each command exactly as mhfe 0.8.0 takes
// it, copied exactly, never with a secret typed into the tab, and each tab's work closed and
// refused above level 0 before its container is read. No WebAssembly or Argon2 runs.

type Element = ReturnType<typeof installPage>;

/** Synthetic secrets typed into the tabs' secret fields; none may reach a command. */
const SECRETS = {
  container: "synthetic container abandon ability",
  password: "synthetic password able about",
  passphrase: "synthetic passphrase above absent",
  address: "synthetic address absorb abstract",
  fingerprint: "73c5da0a",
} as const;

/** The radio groups the tabs read by name, with the value of each radio. */
const RADIO_GROUPS: Readonly<Record<string, readonly [string, string][]>> = {
  "mhfe-check-reference": ["address", "fingerprint", "builtInCheck", "walletCheck"].map(
    (kind) => [`mhfe-check-ref-${kind}`, kind] as [string, string],
  ),
  "mhfe-rekey-reference": ["address", "fingerprint", "owner"].map(
    (kind) => [`mhfe-rekey-ref-${kind}`, kind] as [string, string],
  ),
  "mhfe-rekey-new-password-kind": ["own", "words", "checkWord", "characters"].map(
    (kind) => [`mhfe-rekey-new-password-kind-${kind}`, kind] as [string, string],
  ),
};

/** What the package reads from a synthetic 24-word container. */
const FACTS = {
  container: SECRETS.container,
  words: 24,
  suiteId: "MHFE-BIP39-256-EXPERIMENTAL-3",
  phraseLengths: [12, 15, 18, 21, 24],
  builtInCheckLengths: [12, 15, 18, 21],
  confirmationFor: { "0": "walletOrOwner" },
  hiddenWallets: true,
  offersWalletCheck: true,
  containerFingerprint: "00000000",
};

/**
 * Every tab on one page over one synthetic package, its parameters read as after the self-test;
 * `facts` is what the package reads from any container.
 */
async function page(facts: Record<string, unknown> = FACTS) {
  const element = installPage(RADIO_GROUPS);
  // Four tabs on one page each listen to Clear and to pagehide, more than Node's warning expects.
  setMaxListeners(40, element("#clear-all"), window);
  const gate = new RecoveryJobGate();
  gate.setReady(true);
  const engine = new MhfeEngine();
  withPackageValues(engine);
  const inspectContainer = vi.fn(async () => ({
    reading: "container",
    wordCount: 24,
    unreadable: [],
  }));
  engine.repair = (async () => ({ inspectContainer })) as never;
  const openHiddenWallets = vi.fn(async () => ({ open: vi.fn(), close: vi.fn(async () => {}) }));
  const make = vi.fn(async () => ({
    password: "public made password five words",
    bits: 64,
    weak: false,
    checkWord: false,
  }));
  engine.client = (async () => ({
    parameters: async () => engine.coreParameters(),
    readContainer: async () => facts,
    openHiddenWallets,
  })) as never;
  engine.passwords = (async () => ({
    make,
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
  const copied: string[] = [];
  const context = {
    jobs: gate,
    writeClipboard: async (text: string) => {
      copied.push(text);
    },
  } as never;
  new MhfeDecodeTab(context, engine);
  new MhfeCheckTab(context, engine);
  new MhfeRekeyTab(context, engine);
  new MhfeWalletsTab(context, engine);
  element('input[name="mhfe-rekey-repair-count"]:checked').value = "4";
  engine.passed();
  await settle();
  return { element, gate, engine, copied, inspectContainer, openHiddenWallets, make };
}

/** The command a tab shows: its parts, an option with its value each, joined by spaces. */
function shown(element: Element, prefix: string): string {
  return element(`#mhfe-${prefix}-command-text`)
    .children.map((part) => (typeof part === "string" ? part : part.textContent))
    .join("");
}

/** The panel of each tab's command, whose edits the command follows. */
const PANELS: Readonly<Record<string, string>> = {
  decrypt: "#mhfe-restore-panel",
  check: "#mhfe-check-panel",
  rekey: "#mhfe-rekey-panel",
  wallets: "#mhfe-wallets-panel",
};

/** An edit as the browser sends it: to the field, and bubbled up to the tab's panel. */
function edit(element: Element, prefix: string, selector: string, change: () => void): void {
  change();
  element(selector).dispatchEvent(new Event("change"));
  element(PANELS[prefix]!).dispatchEvent(new Event("change"));
}

/** Sets a PIM field, `pim` as typed or undefined to untick it, and a memory level. */
function settings(
  element: Element,
  prefix: string,
  field: string,
  values: { pim?: string; level?: number },
): void {
  edit(element, prefix, `#mhfe-${field}-use-pim`, () => {
    element(`#mhfe-${field}-use-pim`).checked = values.pim !== undefined;
    element(`#mhfe-${field}-pim`).value = values.pim ?? "1";
  });
  if (values.level !== undefined)
    edit(element, prefix, `#mhfe-${field}-memory-level`, () => {
      element(`#mhfe-${field}-memory-level`).value = String(values.level);
    });
}

/** Chooses the radio `id` of its group, as a click does. */
function choose(element: Element, prefix: string, group: string, id: string): void {
  edit(element, prefix, `#${id}`, () => {
    for (const [other] of RADIO_GROUPS[group]!) element(`#${other}`).checked = other === id;
  });
}

/** Presses Copy and returns what reached the clipboard last. */
async function copy(tab: Awaited<ReturnType<typeof page>>, prefix: string): Promise<string> {
  tab.element(`#mhfe-${prefix}-command-copy`).click();
  await settle();
  expect(tab.element(`#mhfe-${prefix}-command-status`).textContent).toBe("Copied to clipboard.");
  return tab.copied.at(-1) ?? "";
}

/** Types every synthetic secret into the secret fields of every tab. */
function typeSecrets(element: Element): void {
  for (const id of [
    "#mhfe-container",
    "#mhfe-check-container",
    "#mhfe-rekey-container",
    "#mhfe-wallets-container",
  ])
    element(id).value = SECRETS.container;
  for (const id of [
    "#mhfe-decrypt-password",
    "#mhfe-check-password",
    "#mhfe-rekey-password",
    "#mhfe-rekey-new-password",
    "#mhfe-rekey-new-password-confirm",
    "#mhfe-wallets-password",
  ])
    element(id).value = SECRETS.password;
  for (const id of [
    "#mhfe-decrypt-check-passphrase",
    "#mhfe-check-passphrase",
    "#mhfe-rekey-passphrase",
    "#mhfe-wallets-main-passphrase",
  ])
    element(id).value = SECRETS.passphrase;
  for (const id of ["#mhfe-check-address", "#mhfe-rekey-address"])
    element(id).value = SECRETS.address;
  for (const id of ["#mhfe-check-fingerprint", "#mhfe-rekey-fingerprint"])
    element(id).value = SECRETS.fingerprint;
}

/** Fails if any synthetic secret is in `texts`. */
function expectNoSecret(texts: readonly string[]): void {
  for (const text of texts)
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
}

describe("the mhfe command on every MHFE tab that opens a container", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers every memory level on each tab, level 0 chosen, and no command at the defaults", async () => {
    const tab = await page();
    for (const field of ["decrypt", "check", "rekey", "rekey-new", "wallets"]) {
      const select = tab.element(`#mhfe-${field}-memory-level`);
      expect(select.childElementCount).toBe(22);
      expect(select.value).toBe("0");
    }
    for (const prefix of ["decrypt", "check", "rekey", "wallets"]) {
      tab.element(PANELS[prefix]!).dispatchEvent(new Event("change"));
      expect(tab.element(`#mhfe-${prefix}-command`).hidden).toBe(true);
    }
    for (const button of ["#mhfe-decrypt", "#mhfe-check", "#mhfe-rekey", "#mhfe-wallets-start"])
      expect(tab.element(button).disabled).toBe(false);
  });
});

describe("the mhfe decrypt command of Decode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives Decode's command for the first password, and adds the others at mhfe's prompt", async () => {
    const tab = await page();
    typeSecrets(tab.element);
    settings(tab.element, "decrypt", "decrypt", { pim: "3", level: 2 });
    expect(shown(tab.element, "decrypt")).toBe("mhfe decrypt --pim 3 --mem 2");
    edit(tab.element, "decrypt", "#mhfe-decrypt-source-words", () => {
      tab.element("#mhfe-decrypt-source-words").value = "24";
    });
    const line = "mhfe decrypt --pim 3 --mem 2 --words 24";
    expect(shown(tab.element, "decrypt")).toBe(line);
    expect(await copy(tab, "decrypt")).toBe(line);
    // Another password at PIM 0 and level 0 shows the command too, which never names it.
    settings(tab.element, "decrypt", "decrypt", { level: 0 });
    edit(tab.element, "decrypt", "#mhfe-decrypt-source-words", () => {
      tab.element("#mhfe-decrypt-source-words").value = "0";
    });
    expect(tab.element("#mhfe-decrypt-command").hidden).toBe(true);
    tab.element("#mhfe-decrypt-add-password").click();
    tab.element("#mhfe-decrypt-2-password").value = SECRETS.password;
    settings(tab.element, "decrypt", "decrypt-2", { pim: "5" });
    expect(tab.element("#mhfe-decrypt-command").hidden).toBe(false);
    expect(shown(tab.element, "decrypt")).toBe("mhfe decrypt --pim 0 --mem 0");
    settings(tab.element, "decrypt", "decrypt-2", { pim: "700" });
    expect(shown(tab.element, "decrypt")).toBe("mhfe decrypt --pim 0 --mem 0");
    expectNoSecret([shown(tab.element, "decrypt"), ...tab.copied]);
  });

  it("says Decode's PIM refusal, named for the first of several passwords, instead of a command", async () => {
    const tab = await page();
    tab.element("#mhfe-decrypt-add-password").click();
    settings(tab.element, "decrypt", "decrypt", { pim: "1024" });
    expect(shown(tab.element, "decrypt")).toBe("");
    expect(tab.element("#mhfe-decrypt-command-copy").disabled).toBe(true);
    expect(tab.element("#mhfe-decrypt-command-status").textContent).toBe(
      "Password 1: Type a PIM from 1 to 1023, or untick “Use a custom PIM”.",
    );
  });

  it("says that a stated length with a built-in check takes one password, as mhfe decrypt does", async () => {
    const tab = await page();
    settings(tab.element, "decrypt", "decrypt", { pim: "3" });
    for (const [words, one] of [
      ["0", false],
      ["12", true],
      ["21", true],
      ["24", false],
    ] as const) {
      edit(tab.element, "decrypt", "#mhfe-decrypt-source-words", () => {
        tab.element("#mhfe-decrypt-source-words").value = words;
      });
      expect(tab.element("#mhfe-decrypt-command-one").hidden).toBe(!one);
      expect(tab.element("#mhfe-decrypt-command-more").hidden).toBe(one);
    }
  });

  it("hides the command once Clear all removes the password that showed it", async () => {
    const tab = await page();
    // The page's list of added passwords is inside the tab's panel, where its change bubbles.
    tab
      .element("#mhfe-decrypt-more-passwords")
      .addEventListener("change", () =>
        tab.element(PANELS["decrypt"]!).dispatchEvent(new Event("change")),
      );
    tab.element("#mhfe-decrypt-add-password").click();
    settings(tab.element, "decrypt", "decrypt-2", { pim: "5" });
    expect(tab.element("#mhfe-decrypt-command").hidden).toBe(false);
    tab.element("#clear-all").click();
    expect(tab.element("#mhfe-decrypt-command").hidden).toBe(true);
  });
});

describe("the mhfe check command of Check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Check's reference to mhfe check's options, never with the address or fingerprint", async () => {
    const tab = await page();
    typeSecrets(tab.element);
    settings(tab.element, "check", "check", { pim: "3", level: 2 });
    // Nothing chosen yet: mhfe asks what to compare with from its list.
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2");
    expect(tab.element("#mhfe-check-command-list").hidden).toBe(false);
    choose(tab.element, "check", "mhfe-check-reference", "mhfe-check-ref-address");
    await settle();
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2 --address");
    expect(tab.element("#mhfe-check-command-list").hidden).toBe(true);
    edit(tab.element, "check", "#mhfe-check-path", () => {
      tab.element("#mhfe-check-coin").value = "bitcoin";
      tab.element("#mhfe-check-use-path").checked = true;
      tab.element("#mhfe-check-path").value = " m/84'/0'/0'/0/5 ";
    });
    const line = `mhfe check --pim 3 --mem 2 --address --coin bitcoin --path "m/84'/0'/0'/0/5"`;
    expect(shown(tab.element, "check")).toBe(line);
    expect(await copy(tab, "check")).toBe(line);
    edit(tab.element, "check", "#mhfe-check-path", () => {
      tab.element("#mhfe-check-path").value = "m/0;id";
    });
    expect(shown(tab.element, "check")).toBe("");
    expect(tab.element("#mhfe-check-command-status").textContent).toContain(
      "mhfe takes a derivation path such as",
    );
    edit(tab.element, "check", "#mhfe-check-path", () => {
      tab.element("#mhfe-check-path").value = "";
    });
    expect(tab.element("#mhfe-check-command-status").textContent).toBe(
      "Type the derivation path, or turn off Only one derivation path.",
    );
    edit(tab.element, "check", "#mhfe-check-coin", () => {
      tab.element("#mhfe-check-coin").value = "from-address";
      tab.element("#mhfe-check-use-path").checked = false;
    });
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2 --address");
    choose(tab.element, "check", "mhfe-check-reference", "mhfe-check-ref-fingerprint");
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2 --fingerprint");
    choose(tab.element, "check", "mhfe-check-reference", "mhfe-check-ref-builtInCheck");
    for (const [words, option] of [
      ["12", " --words 12"],
      ["0", " --words auto"],
    ] as const) {
      edit(tab.element, "check", "#mhfe-check-words", () => {
        tab.element("#mhfe-check-words").value = words;
      });
      expect(shown(tab.element, "check")).toBe(`mhfe check --pim 3 --mem 2${option}`);
    }
    choose(tab.element, "check", "mhfe-check-reference", "mhfe-check-ref-walletCheck");
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2");
    expect(tab.element("#mhfe-check-command-list").hidden).toBe(false);
    expectNoSecret([shown(tab.element, "check"), ...tab.copied]);
  });

  it("writes --coin dash in the Dash edition once the coins load, with no further edit", async () => {
    vi.stubGlobal("__DASH_COMMUNITY__", true);
    const tab = await page();
    tab.engine.walletParameters = (async () => ({
      maxInputTextBytes: 8192,
      walletCheckBits: 16,
      coins: [{ id: "dash", name: "Dash", addressForms: "synthetic forms" }],
    })) as never;
    // As a browser's select does: once filled, it shows its first option.
    const coin = tab.element("#mhfe-check-coin");
    const fill = coin.replaceChildren.bind(coin);
    coin.replaceChildren = (...options) => {
      fill(...options);
      const [first] = options;
      coin.value = typeof first === "string" || first === undefined ? "" : first.value;
    };
    settings(tab.element, "check", "check", { pim: "3", level: 2 });
    choose(tab.element, "check", "mhfe-check-reference", "mhfe-check-ref-address");
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2 --address");
    await settle();
    expect(shown(tab.element, "check")).toBe("mhfe check --pim 3 --mem 2 --address --coin dash");
  });
});

describe("the mhfe rekey command of Change password", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives Change password's command with both containers' settings and no passphrase answer", async () => {
    const tab = await page();
    typeSecrets(tab.element);
    settings(tab.element, "rekey", "rekey", { pim: "1", level: 1 });
    settings(tab.element, "rekey", "rekey-new", { level: 2 });
    edit(tab.element, "rekey", "#mhfe-rekey-words", () => {
      tab.element("#mhfe-rekey-words").value = "24";
    });
    choose(tab.element, "rekey", "mhfe-rekey-reference", "mhfe-rekey-ref-fingerprint");
    edit(tab.element, "rekey", "#mhfe-rekey-wallet-passphrase-yes", () => {
      tab.element("#mhfe-rekey-wallet-passphrase-yes").checked = true;
    });
    choose(
      tab.element,
      "rekey",
      "mhfe-rekey-new-password-kind",
      "mhfe-rekey-new-password-kind-checkWord",
    );
    tab.element('input[name="mhfe-rekey-repair-count"]:checked').value = "8";
    tab.element(PANELS["rekey"]!).dispatchEvent(new Event("change"));
    const line =
      "mhfe rekey --pim 1 --mem 1 --words 24 --confirm fingerprint --new-pim 0 --new-mem 2 --new-password check-word --repair-words 8";
    expect(shown(tab.element, "rekey")).toBe(line);
    expect(tab.element("#mhfe-rekey-command-made").hidden).toBe(false);
    expect(tab.element("#mhfe-rekey-command-path").hidden).toBe(true);
    expect(await copy(tab, "rekey")).toBe(line);
    // The owner's confirmation is mhfe's "show"; an address at one path has no option in rekey.
    choose(tab.element, "rekey", "mhfe-rekey-reference", "mhfe-rekey-ref-owner");
    expect(shown(tab.element, "rekey")).toContain(" --confirm show ");
    choose(tab.element, "rekey", "mhfe-rekey-reference", "mhfe-rekey-ref-address");
    edit(tab.element, "rekey", "#mhfe-rekey-use-path", () => {
      tab.element("#mhfe-rekey-use-path").checked = true;
      tab.element("#mhfe-rekey-path").value = "m/84'/0'/0'/0/5";
    });
    expect(shown(tab.element, "rekey")).toContain(" --confirm address --new-pim ");
    expect(shown(tab.element, "rekey")).not.toContain("--path");
    expect(tab.element("#mhfe-rekey-command-path").hidden).toBe(false);
    expect(shown(tab.element, "rekey")).not.toContain("passphrase");
    expectNoSecret([shown(tab.element, "rekey"), ...tab.copied]);
  });

  it("names the refused PIM of Change password by its container", async () => {
    const tab = await page();
    settings(tab.element, "rekey", "rekey-new", { pim: "" });
    expect(shown(tab.element, "rekey")).toBe("");
    expect(tab.element("#mhfe-rekey-command-status").textContent).toBe(
      "New container: Type the PIM as a whole number, or untick “Use a custom PIM”.",
    );
  });

  it("makes no new password above level 0 on either side, and makes one back at level 0", async () => {
    const tab = await page();
    settings(tab.element, "rekey", "rekey", { level: 1 });
    choose(
      tab.element,
      "rekey",
      "mhfe-rekey-new-password-kind",
      "mhfe-rekey-new-password-kind-words",
    );
    await settle();
    expect(tab.make).not.toHaveBeenCalled();
    expect(shown(tab.element, "rekey")).toContain(" --new-password words ");
    settings(tab.element, "rekey", "rekey", { level: 0 });
    await settle();
    expect(tab.make).toHaveBeenCalledOnce();
    settings(tab.element, "rekey", "rekey-new", { level: 3 });
    choose(
      tab.element,
      "rekey",
      "mhfe-rekey-new-password-kind",
      "mhfe-rekey-new-password-kind-characters",
    );
    await settle();
    expect(tab.make).toHaveBeenCalledOnce();
  });

  it("drops --confirm once a container read shows that its built-in check confirms unasked", async () => {
    const tab = await page({
      ...FACTS,
      confirmationFor: { "0": "walletOrOwner", "12": "builtInCheck" },
    });
    settings(tab.element, "rekey", "rekey", { pim: "1" });
    edit(tab.element, "rekey", "#mhfe-rekey-words", () => {
      tab.element("#mhfe-rekey-words").value = "12";
    });
    choose(tab.element, "rekey", "mhfe-rekey-reference", "mhfe-rekey-ref-fingerprint");
    const before = "mhfe rekey --pim 1 --mem 0 --words 12 --confirm fingerprint";
    expect(shown(tab.element, "rekey")).toContain(`${before} --new-pim 0 `);
    // The preview reads the typed container's format facts, as the page shows them.
    tab.element("#mhfe-rekey-container").value = SECRETS.container;
    tab.element("#mhfe-rekey-container").dispatchEvent(new Event("change"));
    await settle();
    expect(tab.element("#mhfe-rekey-builtin-note").hidden).toBe(false);
    expect(shown(tab.element, "rekey")).toBe(
      "mhfe rekey --pim 1 --mem 0 --words 12 --new-pim 0 --new-mem 0 --new-password own --repair-words 4",
    );
    expectNoSecret([shown(tab.element, "rekey")]);
  });
});

describe("the mhfe decrypt command of Hidden wallets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives Hidden wallets exactly Decode's command, so a shell history cannot tell them apart", async () => {
    const tab = await page();
    typeSecrets(tab.element);
    for (const [pim, level] of [
      ["3", 0],
      [undefined, 2],
      ["1023", 21],
    ] as const) {
      settings(tab.element, "decrypt", "decrypt", { ...(pim === undefined ? {} : { pim }), level });
      settings(tab.element, "wallets", "wallets", { ...(pim === undefined ? {} : { pim }), level });
      expect(shown(tab.element, "wallets")).toBe(shown(tab.element, "decrypt"));
      expect(shown(tab.element, "wallets")).toMatch(/^mhfe decrypt --pim \d+ --mem \d+$/u);
    }
    expect(await copy(tab, "wallets")).toBe("mhfe decrypt --pim 1023 --mem 21");
    expectNoSecret([shown(tab.element, "wallets"), ...tab.copied]);
  });

  it("locks Hidden wallets' memory level with its other settings while a session is open", async () => {
    const tab = await page();
    tab.element("#mhfe-wallets-container").value = SECRETS.container;
    tab.element("#mhfe-wallets-start").click();
    await settle();
    expect(tab.openHiddenWallets).toHaveBeenCalledOnce();
    expect(tab.element("#mhfe-wallets-memory-level").disabled).toBe(true);
    tab.element("#mhfe-wallets-close").click();
    await settle();
    expect(tab.element("#mhfe-wallets-memory-level").disabled).toBe(false);
  });
});

describe("each tab's work above memory level 0", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const [prefix, field, button, message] of [
    ["decrypt", "decrypt", "#mhfe-decrypt", "recover at level 2"],
    ["check", "check", "#mhfe-check", "rehearse at level 2"],
    ["rekey", "rekey", "#mhfe-rekey", "change the password at level 2"],
    ["rekey", "rekey-new", "#mhfe-rekey", "change the password at level 2"],
    ["wallets", "wallets", "#mhfe-wallets-start", "open hidden wallets at level 2"],
  ] as const)
    it(`closes and refuses the work of ${field} above level 0 before its container is read`, async () => {
      const tab = await page();
      typeSecrets(tab.element);
      settings(tab.element, prefix, field, { level: 2 });
      expect(tab.element(button).disabled).toBe(true);
      expect(tab.element(`#mhfe-${prefix}-missing-run`).disabled).toBe(true);
      tab.gate.setReady(true);
      expect(tab.element(button).disabled).toBe(true);
      // The fake page delivers a click to a closed button too: the run refuses on its own.
      tab.element(button).click();
      await settle();
      expect(tab.inspectContainer).not.toHaveBeenCalled();
      expect(tab.openHiddenWallets).not.toHaveBeenCalled();
      expect(tab.element(`#mhfe-${prefix}-status`).textContent).toBe(
        `A browser runs memory level 0 only: ${message} with the mhfe command.`,
      );
      settings(tab.element, prefix, field, { level: 0 });
      expect(tab.element(button).disabled).toBe(false);
    });
});
