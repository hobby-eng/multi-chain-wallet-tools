import { afterEach, describe, expect, it, vi } from "vitest";

// The Inspector's BIP38 form with a synthetic decryptor whose answers come when the test says
// so: no scrypt and no real key. A Clear or a newer run while a key is decrypted must leave
// nothing of the older run on the page (AUD-024-SEC001).

const pending: ((value: unknown) => void)[] = [];
const rejected: ((cause: unknown) => void)[] = [];
vi.mock("../src/bip38-decryptor.js", () => ({
  decryptBip38Key: () =>
    new Promise((resolve, reject) => {
      pending.push(resolve);
      rejected.push(reject);
    }),
}));

class MemoryElement {
  children: MemoryElement[] = [];
  readonly listeners = new Map<string, () => void>();
  readonly dataset: Record<string, string | undefined> = {};
  value = "";
  textContent = "";
  hidden = false;
  disabled = false;
  readOnly = false;
  type = "password";
  className = "";
  addEventListener(event: string, handler: () => void): void {
    this.listeners.set(event, handler);
  }
  setAttribute(): void {}
  append(...children: MemoryElement[]): void {
    this.children.push(...children);
  }
  replaceChildren(): void {
    this.children = [];
  }
  querySelectorAll(selector: string): MemoryElement[] {
    const key = selector === "[data-bip38-secret]" ? "bip38Secret" : "copyBip38Secret";
    const walk = (element: MemoryElement): MemoryElement[] =>
      element.children.flatMap((child) => [child, ...walk(child)]);
    return walk(this).filter((element) => element.dataset[key] !== undefined);
  }
  click(): void {
    this.listeners.get("click")?.();
  }
}

const elements = new Map<string, MemoryElement>();
const element = (id: string): MemoryElement => {
  let found = elements.get(id);
  if (found === undefined) {
    found = new MemoryElement();
    elements.set(id, found);
  }
  return found;
};
vi.mock("../src/ui-common.js", () => ({
  required: element,
  textElement: (_tag: string, _class: string, text: string) => {
    const made = new MemoryElement();
    made.textContent = text;
    return made;
  },
  copyPlainText: async () => undefined,
  syncNetworkChoice: () => undefined,
}));

const { installBip38Feature } = await import("../src/bip38-feature.js");

/** A synthetic decrypted key: no real address or private key. */
const SYNTHETIC = {
  address: "synthetic-address",
  compressed: true,
  wif: "synthetic-wif",
  privateKeyHex: "11".repeat(32),
};

function setup() {
  elements.clear();
  pending.length = 0;
  rejected.length = 0;
  vi.stubGlobal("document", {
    createElement: () => new MemoryElement(),
    addEventListener: () => undefined,
  });
  vi.stubGlobal("window", { addEventListener: () => undefined });
  installBip38Feature();
  const start = (password: string): void => {
    element("bip38-encrypted-key").value = "synthetic-encrypted-key";
    element("bip38-password").value = password;
    element("bip38-chain").value = "bitcoin";
    element("bip38-network").value = "mainnet";
    element("decrypt-bip38").click();
  };
  const secrets = (): number =>
    element("bip38-result-list").querySelectorAll("[data-bip38-secret]").length;
  return { start, secrets };
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe("the Inspector's BIP38 results belong to the run that is still current", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a key decrypted in the current run", async () => {
    const page = setup();
    page.start("synthetic password");
    pending[0]!(SYNTHETIC);
    await settle();
    expect(page.secrets()).toBe(2);
    expect(element("toggle-bip38-result").disabled).toBe(false);
  });

  it("shows nothing of a key that arrives after Clear", async () => {
    const page = setup();
    page.start("synthetic password");
    element("clear-bip38").click();
    pending[0]!(SYNTHETIC);
    await settle();
    expect(page.secrets()).toBe(0);
    expect(element("toggle-bip38-result").disabled).toBe(true);
    expect(element("bip38-results").hidden).toBe(true);
  });

  it("shows no refusal of a key that arrives after Clear either", async () => {
    const page = setup();
    page.start("synthetic password");
    element("clear-bip38").click();
    rejected[0]!(new Error("synthetic refusal"));
    await settle();
    expect(element("bip38-result-list").children).toHaveLength(0);
  });

  it("leaves a newer run's password and results alone when an older key arrives", async () => {
    const page = setup();
    page.start("synthetic old password");
    element("clear-bip38").click();
    page.start("synthetic new password");
    pending[0]!(SYNTHETIC);
    await settle();
    expect(page.secrets()).toBe(0);
    expect(element("bip38-password").value).toBe("synthetic new password");
    pending[1]!(SYNTHETIC);
    await settle();
    expect(page.secrets()).toBe(2);
    expect(element("bip38-password").value).toBe("");
  });
});
