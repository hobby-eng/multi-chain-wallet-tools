// Actual password controller/fields; the MHFE package edge supplies synthetic password answers.
import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { settlePromises } from "./fake-recovery-page.js";
import { NewPasswordChoice } from "../src/ui/recovery-mhfe-new-password.js";
import { PasswordField } from "../src/ui/recovery-mhfe-fields.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { SecretValue } from "@ckd/core/secret-value.js";
const MADE = "public synthetic password five words";

function mount(defer = false) {
  const page = new PassiveQrPage();
  const block = page.add("mhfe-encrypt-made");
  for (const suffix of ["shown", "text", "strength", "check-word-note", "copy-field"])
    page.add(`mhfe-encrypt-made-${suffix}`, "div", block);
  for (const suffix of ["written", "again", "copy", "toggle-copy"])
    page.add(
      suffix === "toggle-copy" ? "toggle-mhfe-encrypt-made-copy" : `mhfe-encrypt-made-${suffix}`,
      suffix === "copy" ? "input" : "button",
      block,
    );
  for (const id of ["own-password", "status"]) page.add(`mhfe-encrypt-${id}`);
  for (const id of ["password", "password-confirm"]) {
    page.add(`mhfe-encrypt-${id}`, "input").type = "password";
    page.add(`toggle-mhfe-encrypt-${id}`, "button");
  }
  for (const kind of ["own", "words", "checkWord", "characters"]) {
    const radio = page.add(`kind-${kind}`, "input");
    radio.type = "radio";
    radio.name = "mhfe-encrypt-password-kind";
    radio.value = kind;
    radio.checked = kind === "own";
  }
  page.add("clear-all", "button");
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  let release: () => void = () => {
    throw new Error("No pending generation.");
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = {
    passwords: async () => ({
      make: async () => {
        if (defer) await pending;
        return { password: MADE, bits: 64.625, checkWord: false, weak: false };
      },
    }),
  };
  // This fake implements only the package edge the choice consumes; no crypto module is replaced.
  const choice = new NewPasswordChoice(
    engine,
    "encrypt",
    {
      password: new PasswordField("mhfe-encrypt-password", "password"),
      repeat: new PasswordField("mhfe-encrypt-password-confirm", "password repetition"),
    },
    document.querySelector<HTMLElement>("#mhfe-encrypt-status")!,
    jobs,
  );
  const choose = async (kind = "words") => {
    for (const radio of page.querySelectorAll('input[name="mhfe-encrypt-password-kind"]'))
      radio.checked = radio.value === kind;
    page.require(`kind-${kind}`).dispatchEvent(new Event("change"));
    await settlePromises();
  };
  return { page, jobs, choice, choose, release };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["blur", "hidden"] as const)(
  "conceals a generated password on %s and allows deliberate viewing again",
  async (event) => {
    const view = mount();
    await view.choose();
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe(MADE);
    view.page.hideOrBlur(event);
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
    expect(view.page.require("mhfe-encrypt-made-shown").hidden).toBe(true);
    view.page.visibilityState = "visible";
    view.page.require("mhfe-encrypt-made-again").click();
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe(MADE);
  },
);
it.each(["blur", "gate"] as const)(
  "never publishes a pending password after %s revoked disclosure",
  async (event) => {
    const view = mount(true);
    await view.choose();
    if (event === "blur") view.page.hideOrBlur("blur");
    else {
      view.jobs.setReady(false);
      view.jobs.setReady(true);
    }
    view.release();
    await settlePromises();
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
  },
);
it.each(["clear", "forget", "kind"] as const)(
  "retires byte-owned generated material on %s",
  async (reason) => {
    const owners: SecretValue<string>[] = [];
    const original = SecretValue.text.bind(SecretValue);
    vi.spyOn(SecretValue, "text").mockImplementation((text) => {
      const owner = original(text);
      owners.push(owner);
      return owner;
    });
    const view = mount();
    await view.choose();
    expect(owners.length).toBeGreaterThan(0);
    if (reason === "clear") view.page.require("clear-all").click();
    else if (reason === "forget") view.choice.forget();
    else await view.choose("own");
    for (const owner of owners) expect(() => owner.value).toThrow("wiped");
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
  },
);

it("refuses an unknown native menu value without starting password generation", async () => {
  const view = mount();
  view.page.require("kind-words").value = "synthetic-invalid-kind";
  view.page.require("kind-own").checked = false;
  view.page.require("kind-words").checked = true;
  view.page.require("kind-words").dispatchEvent(new Event("change"));
  await settlePromises();
  expect(view.page.require("mhfe-encrypt-status").textContent).toBe(
    "Choose a supported password kind.",
  );
  expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
});

it.each(["clear", "kind"] as const)(
  "wipes a late generated byte owner after %s replaced its request",
  async (reason) => {
    const owners: SecretValue<string>[] = [];
    const original = SecretValue.text.bind(SecretValue);
    vi.spyOn(SecretValue, "text").mockImplementation((text) => {
      const owner = original(text);
      owners.push(owner);
      return owner;
    });
    const view = mount(true);
    await view.choose();
    if (reason === "clear") view.page.require("clear-all").click();
    else await view.choose("own");
    view.release();
    await settlePromises();
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) expect(() => owner.value).toThrow("wiped");
    expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
  },
);

it("clears the person's own fields on page lifetime end", () => {
  const view = mount();
  view.page.require("mhfe-encrypt-password").value = MADE;
  view.page.require("mhfe-encrypt-password-confirm").value = MADE;
  view.page.window.dispatchEvent(new Event("pagehide"));
  expect(view.page.require("mhfe-encrypt-password").value).toBe("");
  expect(view.page.require("mhfe-encrypt-password-confirm").value).toBe("");
});

it("conceals an already shown generated password before refusing a later unknown kind", async () => {
  const view = mount();
  await view.choose();
  expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe(MADE);
  view.page.require("kind-words").value = "unknown";
  view.page.require("kind-words").dispatchEvent(new Event("change"));
  await settlePromises();
  expect(view.page.require("mhfe-encrypt-status").textContent).toBe(
    "Choose a supported password kind.",
  );
  expect(view.page.require("mhfe-encrypt-made-text").textContent).toBe("");
});
