import { afterEach, expect, it, vi } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { RecoveryMnemonicDiagnostic } from "../src/ui/recovery-mnemonic-diagnostic.js";
import { RecoveryTestPage, RecoveryTestElement } from "./fake-recovery-page.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not resume a fingerprint after a native passphrase getter revokes readiness", () => {
  const page = new RecoveryTestPage();
  const input = page.add("revoked-phrase", "textarea");
  input.value = PHRASE;
  input.classList.add("concealed");
  page.add("revoked-reveal", "button");
  const passphrase = page.add("revoked-passphrase", "input");
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  Object.defineProperty(passphrase, "value", {
    get: () => {
      jobs.setReady(false);
      return "TREZOR";
    },
  });
  let seeds = 0;
  new RecoveryMnemonicDiagnostic(
    {
      jobs,
      linkedValue: () => null,
      linkedSourceRevealed: () => false,
      mnemonicToSeed: (...args) => {
        seeds += 1;
        return mnemonicToSeed(...args);
      },
    },
    "seedqr",
    "#revoked-phrase",
    "#revoked-reveal",
    "#revoked-passphrase",
  );
  input.classList.remove("concealed");
  input.dispatchEvent(new Event("input"));
  expect(jobs.ready).toBe(false);
  expect(seeds).toBe(0);
});

it("admits readiness and disclosure before reading a passphrase or deriving a recovery fingerprint", () => {
  const page = new RecoveryTestPage();
  const input = page.add("diagnostic-phrase", "textarea");
  input.classList.add("concealed");
  input.value = PHRASE;
  page.add("diagnostic-reveal", "button");
  const passphrase = page.add("diagnostic-passphrase", "input");
  let reads = 0;
  Object.defineProperty(passphrase, "value", {
    get: () => {
      reads += 1;
      return "TREZOR";
    },
  });
  // This fixture's old native `after` port is inert; supply native insertion without replacing app code.
  vi.spyOn(input, "after").mockImplementation((...nodes: unknown[]) => {
    for (const node of nodes)
      if (node instanceof RecoveryTestElement) input.insertAdjacentElement("afterend", node);
  });
  const jobs = new RecoveryJobGate();
  const seeds: Uint8Array[] = [];
  new RecoveryMnemonicDiagnostic(
    {
      jobs,
      linkedValue: () => null,
      linkedSourceRevealed: () => false,
      mnemonicToSeed: (...args) => {
        const seed = mnemonicToSeed(...args);
        seeds.push(seed);
        return seed;
      },
    },
    "seedqr",
    "#diagnostic-phrase",
    "#diagnostic-reveal",
    "#diagnostic-passphrase",
  );
  expect(reads).toBe(0);
  expect(seeds).toHaveLength(0);
  jobs.setReady(true);
  expect(reads).toBe(0);
  expect(seeds).toHaveLength(0);
  input.classList.remove("concealed");
  input.dispatchEvent(new Event("input"));
  expect(reads).toBe(1);
  expect(seeds).toHaveLength(1);
  expect(seeds[0]?.every((byte) => byte === 0)).toBe(true);
  const root = page.querySelector(".recovered-seed-diagnostic")!;
  const words = root.querySelectorAll("td").filter((cell) => cell.textContent === "abandon");
  expect(words).toHaveLength(11);
  jobs.setReady(false);
  expect(words.every((cell) => cell.textContent === "")).toBe(true);
  expect(reads).toBe(1);
  input.value = " ".repeat(8193);
  jobs.setReady(true);
  expect(seeds).toHaveLength(1);
  expect(
    root.descendants().some((node) => node.textContent.includes("UTF-16 code unit limit")),
  ).toBe(true);
});
