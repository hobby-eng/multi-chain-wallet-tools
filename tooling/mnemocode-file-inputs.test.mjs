// Real input controllers and their source fields; no worker, derivation or encryption runs.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";
import { installTextFileImport } from "@ckd/ui/text-file-import.js";
import { MnemoCodeWalletRecognition } from "@ckd/recovery-backup/mnemocode-wallet-bitcoin.js";
import {
  parseListPassphrase,
  parseRecipient,
} from "../packages/recovery-mnemocode/source/core/candidate-encryption.ts";
import { WalletEvidenceField } from "../apps/key-derivation/src/ui/recovery-mnemocode-evidence.ts";
import { CandidateListField } from "../apps/key-derivation/src/ui/recovery-mnemocode-list.ts";
import { PHRASE_FILE_IMPORT } from "../apps/key-derivation/src/ui/recovery-workspace-shared.ts";
import {
  RecoveryTestPage,
  settlePromises,
} from "../apps/key-derivation/tests/fake-recovery-page.ts";

vi.mock("@ckd/ui/text-file-import.js", () => ({ installTextFileImport: vi.fn() }));
vi.mock("@ckd/recovery-backup/mnemocode-wallet-bitcoin.js", () => ({
  MnemoCodeWalletRecognition: { COINS: [], PROFILES: [], assertEvidence: vi.fn() },
}));

const WALLET_PREFIXES = [
  "mnemocode-decode",
  "mnemocode-restore",
  "mnemocode-forgotten-shares",
  "mnemocode-forgotten",
  "mnemocode-reencode",
];
const LIST_PREFIXES = ["mnemocode-restore", "mnemocode-forgotten"];
const source = new MnemoCodeWalletTemplate().expand(
  readFileSync(new URL("../apps/key-derivation/src/index.html", import.meta.url), "utf8"),
);

/** Only controls consumed here are materialized, from the same expansion as a product build. */
function fields(page, prefix) {
  for (const [, tag, attributes] of source.matchAll(
    /<(input|textarea|select|button|div|p|span|label)\b([^>]*)>/gu,
  )) {
    const values = new Map(
      [...attributes.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, name, value]) => [name, value]),
    );
    const id = values.get("id");
    if (id === undefined || !(id.startsWith(`${prefix}-`) || id.startsWith(`toggle-${prefix}-`)))
      continue;
    const field = page.add(id, tag);
    if (tag === "textarea") {
      // This fake control alone simulates the browser API's CR/CRLF-to-LF presentation.
      let presented = "";
      Object.defineProperty(field, "value", {
        get: () => presented,
        set: (text) => {
          presented = text.replace(/\r\n?/gu, "\n");
        },
      });
      field.type = "textarea";
    }
    for (const [name, value] of values) field.setAttribute(name, value);
    field.className = values.get("class") ?? "";
    field.name = values.get("name") ?? "";
    field.value = values.get("value") ?? "";
    field.type = values.get("type") ?? field.type;
    field.checked = /\schecked(?:\s|\/?$)/u.test(attributes);
    field.hidden = /\shidden(?:\s|\/?$)/u.test(attributes);
  }
}

function choose(page, name, value) {
  const radios = page.querySelectorAll(`input[name="${name}"]`);
  expect(radios.some((radio) => radio.value === value)).toBe(true);
  for (const radio of radios) radio.checked = radio.value === value;
  radios.find((radio) => radio.checked).dispatchEvent(new Event("change"));
}

function importOptions(page, id) {
  const calls = vi
    .mocked(installTextFileImport)
    .mock.calls.filter(([, field]) => field === page.require(id));
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe(page);
  const options = calls[0][2];
  expect(options.accept).toBe(PHRASE_FILE_IMPORT.accept);
  // The shared reader owns the repeated label, not every operation's host controller.
  expect(options.label).toBeUndefined();
  return options;
}

describe("MnemoCode secret and recipient file-input bindings", () => {
  let page;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new RecoveryTestPage();
    page.add("clear-all", "button");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(WALLET_PREFIXES)(
    "wires exact BIP39 password files and CSS reveal for %s",
    async (prefix) => {
      fields(page, prefix);
      const wallet = new WalletEvidenceField(prefix);
      const key = importOptions(page, `${prefix}-wallet-key`);
      const password = importOptions(page, `${prefix}-wallet-passphrase`);
      expect(installTextFileImport).toHaveBeenCalledTimes(2);
      expect(key.preserveWhitespace).toBe(false);
      expect(password.preserveWhitespace).toBe(true);
      expect(password.stripFinalLineBreak).toBe(true);
      expect(password.normalize).toBeUndefined();
      const literal = "\uFEFF  public synthetic BIP39\r\npassword\rwith spaces\t ";
      const field = page.require(`${prefix}-wallet-passphrase`);
      expect(field.tagName).toBe("textarea");
      expect(field.classList.contains("concealed")).toBe(true);
      password.value.assign(literal);
      expect(field.value).toBe("\uFEFF  public synthetic BIP39\npassword\nwith spaces\t ");
      page.require(`${prefix}-wallet-fingerprint`).value = "73C5DA0A";
      choose(page, `${prefix}-wallet`, "fingerprint");
      expect(wallet.passphrase).toBe(literal);
      expect(wallet.request()).toEqual({
        evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
        passphrase: literal,
      });
      expect(MnemoCodeWalletRecognition.assertEvidence).toHaveBeenCalledWith({
        kind: "master-fingerprint",
        value: "73c5da0a",
        network: "mainnet",
      });
      const toggle = page.require(`toggle-${prefix}-wallet-passphrase`);
      toggle.click();
      expect(field.classList.contains("concealed")).toBe(false);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(wallet.request().passphrase).toBe(literal);
      page.hideOrBlur("blur");
      expect(field.classList.contains("concealed")).toBe(true);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(wallet.passphrase).toBe(literal);
      const edited = field.value;
      field.dispatchEvent(new Event("input"));
      expect(wallet.request().passphrase).toBe(edited);
      password.value.assign(literal);
      page.require("clear-all").click();
      expect(field.value).toBe("");
      // No read between Clear and restoration: the old imported factor must already be gone.
      field.value = edited;
      expect(wallet.passphrase).toBe(edited);
      await settlePromises();
    },
  );

  it("does not invent an unoffered key field or picker in an edition without Bitcoin", () => {
    const prefix = WALLET_PREFIXES[0];
    fields(page, prefix);
    page.require(`${prefix}-wallet-key`).remove();
    page.require(`${prefix}-wallet-key-kind`).remove();
    new WalletEvidenceField(prefix);
    importOptions(page, `${prefix}-wallet-passphrase`);
    expect(installTextFileImport).toHaveBeenCalledOnce();
  });

  it.each(LIST_PREFIXES)(
    "delegates %s file normalization and retains internal CR/LF",
    async (prefix) => {
      fields(page, prefix);
      const list = new CandidateListField(prefix);
      const key = importOptions(page, `${prefix}-list-key`);
      const password = importOptions(page, `${prefix}-list-passphrase`);
      const confirm = importOptions(page, `${prefix}-list-passphrase-confirm`);
      expect(installTextFileImport).toHaveBeenCalledTimes(3);
      expect(key.normalize).toBe(parseRecipient);
      expect(password.normalize).toBe(parseListPassphrase);
      expect(confirm.normalize).toBe(parseListPassphrase);
      const fileText = "\uFEFF  public synthetic list password \r\n\n";
      expect(password.normalize(fileText)).toBe("public synthetic list password");
      expect(confirm.normalize(fileText)).toBe("public synthetic list password");
      expect(() => key.normalize("synthetic invalid recipient")).toThrow();
      expect(() => password.normalize("tiny")).toThrow();
      page.require(`${prefix}-list`).checked = true;
      const exact = password.normalize("\uFEFF  public synthetic\r\nlist password\rsecond line \n");
      const passwordField = page.require(`${prefix}-list-passphrase`);
      const confirmField = page.require(`${prefix}-list-passphrase-confirm`);
      expect(passwordField.tagName).toBe("textarea");
      expect(confirmField.tagName).toBe("textarea");
      password.value.assign(exact);
      confirm.value.assign(exact);
      choose(page, `${prefix}-list-protect`, "passphrase");
      expect(list.request()).toEqual({ kind: "passphrase", passphrase: exact });
      expect(passwordField.value).toBe("public synthetic\nlist password\nsecond line");
      const toggle = page.require(`toggle-${prefix}-list-passphrase`);
      toggle.click();
      for (const field of [passwordField, confirmField])
        expect(field.classList.contains("concealed")).toBe(false);
      expect(list.request().passphrase).toBe(exact);
      page.hideOrBlur("hidden");
      for (const field of [passwordField, confirmField])
        expect(field.classList.contains("concealed")).toBe(true);
      expect(list.request().passphrase).toBe(exact);
      passwordField.dispatchEvent(new Event("input"));
      expect(() => list.request()).toThrow("The two list passphrases differ.");
      confirmField.dispatchEvent(new Event("input"));
      expect(list.request().passphrase).toBe(passwordField.value);
      const typed = "  public synthetic typed password \t";
      page.require(`${prefix}-list-passphrase`).value = typed;
      page.require(`${prefix}-list-passphrase-confirm`).value = typed;
      choose(page, `${prefix}-list-protect`, "passphrase");
      // Typed values still reach the protection owner unchanged; imports alone use file parsers.
      expect(list.request()).toEqual({ kind: "passphrase", passphrase: typed });
      page.require(`${prefix}-list-passphrase-confirm`).value = "different synthetic password";
      expect(() => list.request()).toThrow("The two list passphrases differ.");
      password.value.assign(exact);
      confirm.value.assign(exact);
      page.require("clear-all").click();
      expect(passwordField.value).toBe("");
      expect(confirmField.value).toBe("");
      passwordField.value = "public synthetic\nlist password\nsecond line";
      confirmField.value = passwordField.value;
      expect(list.request().passphrase).toBe(passwordField.value);
      await settlePromises();
    },
  );
});
