// Real secret controls and WebCrypto adapter; only browser/crypto service edges are passive.
import { afterEach, expect, it, vi } from "vitest";
import { concealedValue } from "../../../apps/key-derivation/src/ui/recovery-mhfe-cards.ts";
import { RecoverySecretLifecycle } from "../../../apps/key-derivation/src/ui/recovery-secret-lifecycle.ts";
import { RecoveryTestPage } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";
import { webCryptoPbkdf2 } from "../../../apps/key-derivation/src/workers/webcrypto-pbkdf2.ts";

afterEach(() => { vi.unstubAllGlobals(); });

it.each(["blur", "hidden"])("reconceals a locally revealed MHFE card on %s", (event) => {
  const page = new RecoveryTestPage();
  RecoverySecretLifecycle.install(page);
  const { output, actions } = concealedValue("public synthetic phrase", { subject: "phrase" }, async () => {});
  page.body.append(output, actions);
  actions.querySelector("button").click();
  expect(output.classList.contains("concealed")).toBe(false);
  page.hideOrBlur(event);
  expect({ concealed: output.classList.contains("concealed"), copyDisabled: actions.querySelector(".secret-action").disabled }).toEqual({ concealed: true, copyDisabled: true });
});

it.each([false, true])("retires temporary secret encodings after WebCrypto settlement (reject=%s)", async (reject) => {
  const retained = [];
  vi.stubGlobal("crypto", { subtle: {
    async importKey(_format, raw) { retained.push(raw); return {}; },
    async deriveBits(options) { retained.push(options.salt); if (reject) throw new Error("synthetic derive refusal"); return new ArrayBuffer(16); },
  } });
  const result = webCryptoPbkdf2("public synthetic password", "public synthetic passphrase salt", 1, 16);
  if (reject) await expect(result).rejects.toThrow("synthetic derive refusal");
  else (await result).fill(0);
  expect(retained).toHaveLength(2);
  expect(retained.every((buffer) => buffer.every((byte) => byte === 0))).toBe(true);
});
