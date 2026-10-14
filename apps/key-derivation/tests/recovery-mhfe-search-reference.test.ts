import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { WalletReferenceField } from "../src/ui/recovery-mhfe-reference.js";
import { SearchReference } from "../src/ui/recovery-mhfe-search-reference.js";
import { installPage } from "./fake-mhfe-page.js";

// Public oracle: abandon-12 without a passphrase at this nonstandard path. The host tests the
// binding and displayed scope; the browser regression tests the real MHFE search against it.
const PATH = "m/123'/4/9'/8";
const ADDRESS = "bc1qvuascgkl4e7tjq39h6hucr7km0yhdg7ulyzunc";
const PREFIXES = [
  "mhfe-decrypt-missing",
  "mhfe-check-missing",
  "mhfe-rekey-missing",
  "mhfe-wallets-missing",
  "mhfe-check-no-length",
];

interface AddressRequest {
  address: string;
  coin: string;
  path?: string;
  scanGap?: number;
}

const STANDARD_SCOPE = {
  type: "P2WPKH",
  onlyPath: false,
  search: "standard receiving and change paths",
  addresses: 2000,
};

function setup(prefix = PREFIXES[0]!) {
  const element = installPage({ [`${prefix}-gap`]: [[`${prefix}-gap-other`, "other"]] });
  element(`#${prefix}-coin`).value = "bitcoin";
  const describeAddress = vi.fn(async (request: AddressRequest) =>
    request.path === undefined
      ? STANDARD_SCOPE
      : { ...STANDARD_SCOPE, onlyPath: true, search: request.path, addresses: 1 },
  );
  const engine = {
    coreParameters: async () => ({ decoyScanGap: 20 }),
    wallet: async () => ({ describeAddress }),
  } as unknown as MhfeEngine;
  const reference = new SearchReference(engine, prefix);
  reference.show(false);
  const edit = (name: string, value: string | boolean): void => {
    const field = element(`#${prefix}-${name}`);
    if (typeof value === "boolean") field.checked = value;
    else field.value = value;
    field.dispatchEvent(new Event(typeof value === "boolean" ? "change" : "input"));
  };
  const scope = (): string => element(`#${prefix}-search`).textContent;
  const describeScope = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(400);
  };
  return { prefix, element, engine, reference, describeAddress, edit, scope, describeScope };
}

describe("MHFE address references in missing-word and recovery questions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  for (const prefix of PREFIXES) {
    it(`keeps the standard search and clears path controls for a fingerprint in ${prefix}`, async () => {
      const page = setup(prefix);
      page.edit("reference", ADDRESS);
      expect(page.reference.reference()).toEqual({ address: ADDRESS, coin: "bitcoin" });
      await page.describeScope();
      expect(page.describeAddress).toHaveBeenLastCalledWith({
        address: ADDRESS,
        coin: "bitcoin",
        scanGap: 0,
      });
      expect(page.scope()).toBe(
        "Type: P2WPKH · Search: standard receiving and change paths, 2,000 addresses",
      );
      page.edit("path", PATH);
      page.edit("use-path", true);
      page.edit("reference", "73C5DA0A");
      expect(page.reference.reference()).toEqual({ fingerprint: "73c5da0a" });
      expect(page.reference.scanGap()).toBeUndefined();
      expect(page.element(`#${prefix}-path-field`).hidden).toBe(true);
      expect(page.element(`#${prefix}-use-path`).checked).toBe(false);
      expect(page.element(`#${prefix}-path`).value).toBe("");
      expect(page.scope()).toBe("");
      await page.describeScope();
      expect(page.describeAddress).toHaveBeenCalledOnce();
    });

    it(`sends the same trimmed exact path to the description and search in ${prefix}`, async () => {
      const page = setup(prefix);
      page.edit("reference", ADDRESS);
      page.edit("path", ` ${PATH} `);
      page.edit("use-path", true);
      const expected = { address: ADDRESS, coin: "bitcoin", path: PATH };
      expect(page.reference.reference()).toEqual(expected);
      expect(page.element(`#${prefix}-path`).hidden).toBe(false);
      expect(page.element(`#${prefix}-path-label`).textContent).toBe("Only one derivation path");
      expect(page.element(`#${prefix}-path-note`).hidden).toBe(false);
      expect(page.element(`#${prefix}-path`).getAttribute("placeholder")).toBe("m/…");
      await page.describeScope();
      expect(page.describeAddress).toHaveBeenLastCalledWith({ ...expected, scanGap: 0 });
      expect(page.scope()).toBe(`Type: P2WPKH · Search: only ${PATH}`);
    });
  }

  for (const path of ["", " \t "]) {
    it(`refuses a selected ${path === "" ? "empty" : "whitespace-only"} path before standard search`, async () => {
      const page = setup();
      page.edit("reference", ADDRESS);
      page.edit("path", path);
      page.edit("use-path", true);
      expect(() => page.reference.reference()).toThrow("Type the derivation path");
      await page.describeScope();
      expect(page.describeAddress).not.toHaveBeenCalled();
      expect(page.scope()).toContain("Type the derivation path");
    });
  }

  it("ignores a retained path while unchecked and restores the standard scan gap", async () => {
    const page = setup();
    page.reference.show(true);
    page.edit("reference", ADDRESS);
    page.edit("gap-other", true);
    page.edit("gap-own", "60");
    page.edit("path", PATH);
    page.edit("use-path", true);
    expect(page.element(`#${page.prefix}-gap-field`).hidden).toBe(true);
    expect(page.reference.scanGap()).toBeUndefined();
    // A hidden, invalid custom gap cannot invalidate the selected single-path search.
    page.edit("gap-own", "not a number");
    expect(page.reference.scanGap()).toBeUndefined();
    page.edit("gap-own", "60");
    page.edit("use-path", false);
    expect(page.element(`#${page.prefix}-gap-field`).hidden).toBe(false);
    expect(page.reference.scanGap()).toBe(60);
    expect(page.reference.reference()).not.toHaveProperty("path");
    await page.describeScope();
    expect(page.describeAddress).toHaveBeenLastCalledWith({
      address: ADDRESS,
      coin: "bitcoin",
      scanGap: 60,
    });
  });

  it("leaves hardened markers and malformed paths to the library, displaying its refusal", async () => {
    const page = setup();
    page.edit("reference", ADDRESS);
    page.edit("use-path", true);
    page.edit("path", "m/123h/4/9h/8");
    expect(page.reference.reference()).toHaveProperty("path", "m/123h/4/9h/8");
    page.describeAddress.mockRejectedValueOnce(new Error("The derivation path is invalid."));
    page.edit("path", "m/2147483648");
    await page.describeScope();
    expect(page.describeAddress).toHaveBeenLastCalledWith({
      address: ADDRESS,
      coin: "bitcoin",
      path: "m/2147483648",
      scanGap: 0,
    });
    expect(page.scope()).toBe("The derivation path is invalid.");
  });

  for (const action of ["edit", "hide", "reset", "fingerprint"] as const) {
    it(`drops an older scope reply after ${action}`, async () => {
      const page = setup();
      let reply!: (value: typeof STANDARD_SCOPE) => void;
      page.describeAddress.mockImplementationOnce(
        () => new Promise((resolve) => (reply = resolve)),
      );
      page.edit("reference", ADDRESS);
      await page.describeScope();
      expect(page.describeAddress).toHaveBeenCalledOnce();
      if (action === "edit") page.edit("path", PATH);
      else if (action === "hide") page.reference.hide();
      else if (action === "reset") page.reference.reset();
      else page.edit("reference", "73c5da0a");
      reply(STANDARD_SCOPE);
      await Promise.resolve();
      await Promise.resolve();
      expect(page.scope()).toBe("");
    });
  }

  it("drops a late library refusal after the field is hidden", async () => {
    const page = setup();
    let refuse!: (cause: Error) => void;
    page.describeAddress.mockImplementationOnce(
      () => new Promise((_, reject) => (refuse = reject)),
    );
    page.edit("reference", ADDRESS);
    await page.describeScope();
    page.reference.hide();
    refuse(new Error("old invalid path"));
    await Promise.resolve();
    await Promise.resolve();
    expect(page.scope()).toBe("");
  });

  it("shares the exact-path choice and empty refusal with Check and Change password", () => {
    const element = installPage({
      "mhfe-check-reference": [["mhfe-check-ref-address", "address"]],
    });
    element("#mhfe-check-ref-address").checked = true;
    element("#mhfe-check-coin").value = "bitcoin";
    const reference = new WalletReferenceField({} as MhfeEngine, "check");
    element("#mhfe-check-address").value = ADDRESS;
    element("#mhfe-check-use-path").checked = true;
    element("#mhfe-check-path").value = ` ${PATH} `;
    expect(reference.walletReference()).toEqual({ address: ADDRESS, coin: "bitcoin", path: PATH });
    element("#mhfe-check-path").value = " ";
    expect(() => reference.walletReference()).toThrow("Type the derivation path");
    reference.reset();
    expect(element("#mhfe-check-path").value).toBe("");
    expect(element("#mhfe-check-use-path").checked).toBe(false);
  });
});
