// The SeedQR tab's hidden form with its actual installer, MnemoCode's WebAssembly and the download
// helper; only browser rendering is passive. Public test phrase and a synthetic contact only.
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { HiddenSeedQr } from "@ckd/recovery-backup/hidden-seedqr.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { recoveryFeature } from "../src/ui/recovery-seedqr.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { edit, type RecoveryTestElement } from "./fake-recovery-page.js";

const PHRASE = `${"abandon ".repeat(11)}about`;

beforeAll(async () => {
  await loadMnemoCode();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The SeedQR tab's elements, the hidden form's among them, in Encode's and Decode's panels. */
function seedQrPage(): PassiveQrPage {
  const page = new PassiveQrPage();
  page.add("clear-all", "button");
  const encode = page.add("seedqr-create-panel", "section");
  const decode = page.add("seedqr-restore-panel", "section");
  // Show and Hide act on the secrets of their own operation, as on the page.
  encode.className = "backup-operation";
  decode.className = "backup-operation";
  for (const [id, tag] of [
    ["toggle-seedqr-source", "button"],
    ["seedqr-source", "textarea"],
    ["seedqr-hidden-note", "p"],
    ["create-seedqr", "button"],
    ["toggle-seedqr-created", "button"],
    ["seedqr-create-result", "div"],
  ] as const)
    page.add(id, tag, encode);
  for (const [id, tag] of [
    ["seedqr-restore-format", "select"],
    ["toggle-seedqr-payload", "button"],
    ["seedqr-payload", "textarea"],
    ["restore-seedqr", "button"],
    ["seedqr-restore-result", "div"],
  ] as const)
    page.add(id, tag, decode);
  page.require("seedqr-payload").after = (...nodes) => decode.append(...nodes);
  // A radio button, as on the page: its change is always an edit, whatever its text value.
  page.add("seedqr-qr-form-hidden", "input", page.add("seedqr-qr-form", "fieldset", encode)).type =
    "radio";
  const format = page.add("seedqr-format", "select", encode);
  const compact = page.createElement("option");
  compact.setAttribute("value", "compact");
  format.append(compact);
  format.value = "standard";
  const decoy = page.add("seedqr-decoy", "div", encode);
  // A select's value is its first option's; the passive select has none until one is set.
  page.add("seedqr-decoy-kind", "select", decoy).value = "contact";
  page.add("seedqr-decoy-fields", "div", decoy);
  return page;
}

function install(): RecoveryJobGate {
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-qr-fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const context: RecoveryFeatureContext = {
    jobs,
    registry: createCoinRegistry([]),
    detectTargets: () => [],
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    readMnemonic: () => {
      jobs.assertReady();
      return PHRASE;
    },
    mnemonicToSeed,
    writeClipboard: async () => undefined,
    downloadText: () => {
      throw new Error("The PNG is saved as bytes, not text.");
    },
    useMnemonicInDeriver: () => undefined,
  };
  recoveryFeature.install(context);
  return jobs;
}

/** Makes a hidden SeedQR behind a contact card, shows it and saves its PNG; returns that PNG. */
function savedHiddenPng(page: PassiveQrPage): Uint8Array {
  const hidden = page.require("seedqr-qr-form-hidden");
  hidden.checked = true;
  hidden.dispatchEvent(new Event("change", { bubbles: true }));
  edit(page.require("seedqr-decoy-contact-name"), "Ana Ruiz");
  const pngs = vi.spyOn(HiddenSeedQr.prototype, "png", "get");
  page.require("create-seedqr").click();
  const card = page.require("seedqr-create-result").querySelector("article");
  if (card === null) throw new Error("The hidden SeedQR card is missing.");
  const save = card.querySelector("button.secret-copy-action") as RecoveryTestElement;
  expect(save.disabled).toBe(true);
  page.require("toggle-seedqr-created").click();
  save.click();
  expect(page.downloads).toEqual(["contact-qr.png"]);
  const png = pngs.mock.results[0]?.value as Uint8Array;
  expect(png.some((byte) => byte !== 0)).toBe(true);
  return png;
}

it.each(["source edit", "decoy edit", "form change", "Clear all", "pagehide", "gate loss"])(
  "zeroes the shown hidden SeedQR's PNG after %s",
  (reason) => {
    const page = seedQrPage();
    const jobs = install();
    const png = savedHiddenPng(page);
    if (reason === "source edit") edit(page.require("seedqr-source"), "edited");
    else if (reason === "decoy edit") edit(page.require("seedqr-decoy-contact-name"), "Ana R.");
    else if (reason === "form change") {
      page.require("seedqr-qr-form-hidden").checked = false;
      page.require("seedqr-qr-form-hidden").dispatchEvent(new Event("change", { bubbles: true }));
    } else if (reason === "Clear all") page.require("clear-all").click();
    else if (reason === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else jobs.setReady(false);
    expect(png.every((byte) => byte === 0)).toBe(true);
    expect(page.require("seedqr-create-result").children).toHaveLength(0);
  },
);

it("zeroes the previous PNG when a new hidden SeedQR is made", () => {
  const page = seedQrPage();
  install();
  const png = savedHiddenPng(page);
  page.require("create-seedqr").click();
  expect(png.every((byte) => byte === 0)).toBe(true);
});

it("conceals a new SeedQR of either form, with Show payload and Save PNG to match", () => {
  const page = seedQrPage();
  install();
  savedHiddenPng(page);
  const toggle = page.require("toggle-seedqr-created");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  // An ordinary SeedQR after a shown hidden one starts concealed too.
  const hidden = page.require("seedqr-qr-form-hidden");
  hidden.checked = false;
  hidden.dispatchEvent(new Event("change", { bubbles: true }));
  page.require("create-seedqr").click();
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(toggle.textContent).toBe("Show payload");
  const payload = page.require("seedqr-create-result").querySelector(".share-secret");
  expect(payload?.classList.contains("concealed")).toBe(true);
});
