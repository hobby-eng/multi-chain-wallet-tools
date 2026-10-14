// AUD-023 selftests: shows that the new known-answer checks can fail. Each case lets the product
// self-test run unchanged once (it must pass), then changes one production function's answer
// through vi.mock (the real implementation is wrapped, nothing in the product is edited) and
// expects the self-test to throw. It also drives the Deriver's worker runtime with a failing
// feature check and a broken randomness source through the production entry points.
//
// Adapted during the AUD-023 remediation, which this file now checks: the signing and BIP38 checks
// moved into per-coin modules that run through the functions the build composed (AUD-023-BLD001),
// the SSKR check uses BCR-2020-011 and carries its name (AUD-023-FUN004), and checkSecureRandom
// refuses a draw that leaves part of the buffer empty (an AUD-023 observation).
//
// Run: pnpm exec vitest run --config docs/audits/AUD-023-harnesses/selftests-vitest.config.mjs
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The product's tests load the SSKR WebAssembly bytes the same way (packages/recovery-backup/tests).
vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    default: readFileSync(
      new URL(
        "../../../packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
        import.meta.url,
      ),
    ),
  };
});
const mutation = vi.hoisted(() => ({ active: "" as string }));
const on = (name: string) => mutation.active === name;

vi.mock("@ckd/core/bip85.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ckd/core/bip85.js")>();
  return {
    ...actual,
    deriveBip85Wif: (...args: Parameters<typeof actual.deriveBip85Wif>) => {
      const result = actual.deriveBip85Wif(...args);
      return on("bip85-wif") ? { ...result, wif: `${result.wif.slice(0, -1)}q` } : result;
    },
  };
});
vi.mock("../../../apps/key-derivation/src/workers/silent-payment.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../apps/key-derivation/src/workers/silent-payment.js")
    >();
  return {
    ...actual,
    deriveSilentPayment: async (...args: Parameters<typeof actual.deriveSilentPayment>) => {
      const result = await actual.deriveSilentPayment(...args);
      return on("sp-change") ? { ...result, changeAddress: result.address } : result;
    },
  };
});
vi.mock("../../../apps/key-derivation/src/workers/message-signer.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../apps/key-derivation/src/workers/message-signer.js")
    >();
  return {
    ...actual,
    signDerivedMessage: async (...args: Parameters<typeof actual.signDerivedMessage>) => {
      const result = await actual.signDerivedMessage(...args);
      if (on("compact-unverified")) return { ...result, verified: false };
      if (on("bip322-signature")) return { ...result, signature: `${result.signature}A` };
      return result;
    },
  };
});
vi.mock("../../../apps/key-derivation/src/workers/bip322-signer.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../apps/key-derivation/src/workers/bip322-signer.js")
    >();
  return {
    ...actual,
    // A verifier that accepts everything must be caught by the refusal check.
    verifyBip322Message: async (...args: Parameters<typeof actual.verifyBip322Message>) =>
      on("bip322-accepts-all") ? true : actual.verifyBip322Message(...args),
  };
});
vi.mock(
  "../../../apps/key-derivation/src/workers/bip38-encrypter-dash.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../apps/key-derivation/src/workers/bip38-encrypter-dash.js")
      >();
    return {
      ...actual,
      encryptDerivedP2pkhKey: async (...args: Parameters<typeof actual.encryptDerivedP2pkhKey>) => {
        const result = await actual.encryptDerivedP2pkhKey(...args);
        return on("bip38-dash")
          ? { ...result, encryptedKey: result.encryptedKey.toLowerCase() }
          : result;
      },
    };
  },
);
vi.mock("../../../apps/psbt-inspector/src/psbt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/psbt-inspector/src/psbt.js")>();
  return {
    ...actual,
    transactionId: (...args: Parameters<typeof actual.transactionId>) =>
      on("psbt-txid") ? "00".repeat(32) : actual.transactionId(...args),
  };
});
vi.mock("../../../apps/psbt-inspector/src/message-verifier.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/psbt-inspector/src/message-verifier.js")>();
  return {
    ...actual,
    verifySignedMessage: async (...args: Parameters<typeof actual.verifySignedMessage>) => {
      const result = await actual.verifySignedMessage(...args);
      return on("verifier-accepts-all") ? { ...result, valid: true } : result;
    },
  };
});
vi.mock(
  "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../packages/recovery-mnemocode/source/core/candidate-encryption.js")
      >();
    let first: Uint8Array | undefined;
    return {
      ...actual,
      decryptCandidates: async (...args: Parameters<typeof actual.decryptCandidates>) => {
        if (!on("age-opens-any")) return actual.decryptCandidates(...args);
        // Opens the list with any key: hands back the plaintext of the first, correct call.
        if (first === undefined) first = Uint8Array.from(await actual.decryptCandidates(...args));
        return Uint8Array.from(first);
      },
    };
  },
);
vi.mock("@noble/hashes/scrypt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noble/hashes/scrypt.js")>();
  return {
    ...actual,
    scrypt: (...args: Parameters<typeof actual.scrypt>) => {
      const out = actual.scrypt(...args);
      if (on("scrypt")) out[0] ^= 1;
      return out;
    },
  };
});
vi.mock("../../../packages/secret-boundary/src/public-input-guard.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../packages/secret-boundary/src/public-input-guard.js")
    >();
  return {
    ...actual,
    assertPublicLookupInput: (...args: Parameters<typeof actual.assertPublicLookupInput>) => {
      if (on("guard-lets-wif") && String(args[0]).startsWith("XBHdd")) return;
      return actual.assertPublicLookupInput(...args);
    },
  };
});
vi.mock("@ckd/public-data-providers/address-normalization.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@ckd/public-data-providers/address-normalization.js")>();
  return {
    ...actual,
    normalizeBitcoinAddress: (...args: Parameters<typeof actual.normalizeBitcoinAddress>) =>
      on("btc-no-checksum")
        ? String(args[0]).toLowerCase()
        : actual.normalizeBitcoinAddress(...args),
  };
});
vi.mock("../../../packages/recovery-backup/src/sskr.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/recovery-backup/src/sskr.js")>();
  return {
    ...actual,
    recoverSskrShares: (...args: Parameters<typeof actual.recoverSskrShares>) => {
      const out = actual.recoverSskrShares(...args);
      if (on("sskr")) out[15] ^= 1;
      return out;
    },
  };
});

import { runBip85SelfTest } from "../../../apps/key-derivation/src/workers/bip85-self-test.js";
import { runSilentPaymentSelfTest } from "../../../apps/key-derivation/src/workers/silent-payment-self-test.js";
import {
  runBip322FullSelfTest,
  runBitcoinMessageSigningSelfTest,
} from "../../../apps/key-derivation/src/workers/message-signer-self-test-bitcoin.js";
import { runDashBip38FullSelfTest } from "../../../apps/key-derivation/src/workers/bip38-self-test-dash.js";
import { signDerivedMessage } from "../../../apps/key-derivation/src/workers/message-signer.js";
import { encryptDerivedP2pkhKey } from "../../../apps/key-derivation/src/workers/bip38-encrypter-dash.js";
import * as psbtBitcoin from "../../../apps/psbt-inspector/src/self-test-bitcoin.js";
import * as psbtDash from "../../../apps/psbt-inspector/src/self-test-dash.js";
import { runCandidateListSelfTest } from "../../../apps/discovery-scanner/src/candidate-list-self-test.js";
import { runPublicInputGuardSelfTest } from "../../../packages/secret-boundary/src/public-input-guard-self-test.js";
import { createBitcoinActivityAdapter } from "../../../apps/activity-viewer/src/activity-bitcoin.js";
import { runSskrSelfTest } from "../../../packages/recovery-backup/src/self-test-sskr.js";
import { checkSecureRandom } from "../../../packages/crypto-core/src/secure-random.js";

afterEach(() => {
  mutation.active = "";
});

// The functions a build composes for the worker (worker-runtime.ts FeatureFunctions), here the
// wrapped production modules above.
const features = { signDerivedMessage, encryptDerivedP2pkhKey };
const runMessageSigningSelfTest = () => runBitcoinMessageSigningSelfTest(features);
const runMessageSigningFullSelfTest = () => runBip322FullSelfTest(features);
const runDashBip38 = () => runDashBip38FullSelfTest(features);

/** Passes as shipped, throws once the named production answer is changed. */
async function passesThenFails(name: string, run: () => unknown, message: RegExp) {
  mutation.active = "";
  await run();
  mutation.active = name;
  await expect((async () => run())()).rejects.toThrow(message);
}

describe("each new known-answer check fails when its production answer changes", () => {
  it("BIP85 WIF", () =>
    passesThenFails("bip85-wif", runBip85SelfTest, /self-test failed: BIP85 WIF/u));
  it("Silent Payment change address", () =>
    passesThenFails("sp-change", runSilentPaymentSelfTest, /Silent Payment change address/u));
  it("compact message signature that no longer verifies", () =>
    passesThenFails(
      "compact-unverified",
      runMessageSigningSelfTest,
      /Bitcoin compact message verification/u,
    ));
  it(
    "BIP-322 page signature",
    () =>
      passesThenFails(
        "bip322-signature",
        runMessageSigningFullSelfTest,
        /BIP-322 simple signature/u,
      ),
    30_000,
  );
  it(
    "BIP-322 verifier that accepts every message",
    () =>
      passesThenFails(
        "bip322-accepts-all",
        runMessageSigningFullSelfTest,
        /BIP-322 refusal of another message/u,
      ),
    30_000,
  );
  it(
    "Dash BIP38 encryption",
    () => passesThenFails("bip38-dash", runDashBip38, /BIP38 Dash/u),
    30_000,
  );
  it("Inspector BIP174 transaction id", () =>
    passesThenFails(
      "psbt-txid",
      () => psbtBitcoin.bitcoinPsbtDecoder.run(),
      /BIP174 transaction id/u,
    ));
  it("Inspector compact verifier that accepts every message (Bitcoin and Dash)", async () => {
    await passesThenFails(
      "verifier-accepts-all",
      () => psbtBitcoin.bitcoinMessageVerification.run(),
      /compact refusal/u,
    );
    await passesThenFails(
      "verifier-accepts-all",
      () => psbtDash.dashMessageVerification.run(),
      /Dash compact refusal/u,
    );
  });
  it("Discovery: a list that opens with any key", () =>
    passesThenFails(
      "age-opens-any",
      runCandidateListSelfTest,
      /candidate list refusal of another key/u,
    ));
  it("Discovery: scrypt with a wrong output", () =>
    passesThenFails("scrypt", runCandidateListSelfTest, /scrypt RFC 7914 vector/u));
  it("public-input guard that lets a WIF through", () =>
    passesThenFails(
      "guard-lets-wif",
      runPublicInputGuardSelfTest,
      /let a WIF private key through/u,
    ));
  it("Activity Viewer: Bitcoin normalization without checksum", () =>
    passesThenFails(
      "btc-no-checksum",
      () => createBitcoinActivityAdapter({} as never).selfTest(),
      /Bitcoin address checksum refusal/u,
    ));
  it("SSKR shares restoring a different secret", () =>
    passesThenFails("sskr", runSskrSelfTest, /SSKR BCR-2020-011 grouped vector/u));
});

describe("limits: checks without a refusal case", () => {
  it("the Inspector's BIP-322 check still passes with a verifier that accepts every message", async () => {
    mutation.active = "verifier-accepts-all";
    await expect(psbtBitcoin.bitcoinBip322Verification.run()).resolves.toBeUndefined();
  }, 30_000);
});

describe("checkSecureRandom", () => {
  const original = globalThis.crypto;
  const install = (fill: (output: Uint8Array) => void) =>
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (o: Uint8Array) => (fill(o), o) },
    });
  afterEach(() =>
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original }),
  );

  it("refuses a source that leaves the buffer zero", () => {
    install(() => {});
    expect(() => checkSecureRandom()).toThrow(/repeats itself/u);
  });
  // A limit of the check at the reviewed snapshot, closed by the remediation.
  it("refuses a source that fills only the first byte", () => {
    let counter = 1;
    install((o) => {
      o[0] = counter++;
    });
    expect(() => checkSecureRandom()).toThrow(/stayed empty/u);
  });
  it("passes a counter source (limit of the check)", () => {
    let counter = 0;
    install((o) => {
      for (let i = 0; i < o.length; i++) o[i] = counter++ & 0xff;
    });
    expect(() => checkSecureRandom()).not.toThrow();
  });
  it("does not fail an honest source in 20,000 runs", () => {
    for (let i = 0; i < 20_000; i++) checkSecureRandom();
  });
});

describe("the Deriver's worker runtime", () => {
  type Listener = (event: { data: unknown }) => void;
  let listener: Listener;
  let posted: unknown[];
  beforeEach(() => {
    posted = [];
    (globalThis as { self?: unknown }).self = {
      addEventListener: (_: string, l: Listener) => {
        listener = l;
      },
      postMessage: (m: unknown) => posted.push(m),
    };
  });
  afterEach(() => {
    delete (globalThis as { self?: unknown }).self;
  });

  async function start(
    feature: () => never | { passed: true; checks: string[]; durationMs: number },
  ) {
    const { startDerivationWorker } =
      await import("../../../apps/key-derivation/src/workers/worker-runtime.js");
    const full = vi.fn(() => ({ passed: true as const, checks: ["full"], durationMs: 0 }));
    startDerivationWorker({
      getRuntimeCoinAdapter: () => {
        throw new Error("unused");
      },
      runDerivationSelfTest: async () => ({ passed: true, checks: ["derivation"], durationMs: 0 }),
      startupSelfTests: [feature],
      fullSelfTests: [full],
    });
    return full;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  it("answers a startup self-test without the full checks, and with them on request", async () => {
    const full = await start(() => ({ passed: true, checks: ["feature"], durationMs: 0 }));
    listener({ data: { id: 1, type: "self-test" } });
    await settle();
    expect(full).not.toHaveBeenCalled();
    listener({ data: { id: 2, type: "self-test", full: true } });
    await settle();
    expect(full).toHaveBeenCalledOnce();
    expect(posted.slice(1)).toEqual([
      {
        id: 1,
        ok: true,
        type: "self-test",
        result: expect.objectContaining({ checks: ["derivation", "feature"] }),
      },
      {
        id: 2,
        ok: true,
        type: "self-test",
        result: expect.objectContaining({ checks: ["derivation", "feature", "full"] }),
      },
    ]);
  });

  it("reports a failing feature check as a failed request, never as a pass", async () => {
    await start(() => {
      throw new Error("Cryptographic self-test failed: BIP85 WIF.");
    });
    listener({ data: { id: 7, type: "self-test" } });
    await settle();
    expect(posted.at(-1)).toEqual({
      id: 7,
      ok: false,
      error: "Cryptographic self-test failed: BIP85 WIF.",
    });
  });

  it("treats a truthy non-boolean full flag as the startup run", async () => {
    const full = await start(() => ({ passed: true, checks: ["feature"], durationMs: 0 }));
    listener({ data: { id: 3, type: "self-test", full: "yes" } });
    await settle();
    expect(full).not.toHaveBeenCalled();
  });
});

describe("the Deriver's startup suite with a broken randomness source", () => {
  it("throws and still releases its worker", async () => {
    const { runStartupSelfTests } =
      await import("../../../apps/key-derivation/src/ui/startup-self-test.js");
    const terminate = vi.fn();
    const selfTest = vi.fn();
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (o: Uint8Array) => o.fill(9) },
    });
    try {
      await expect(
        runStartupSelfTests({
          runBip39SelfTest: () => ({ passed: true, checks: [], durationMs: 0 }),
          runRecoveryBackupSelfTest: () => ({ passed: true, checks: [], durationMs: 0 }),
          createWorker: () => ({ selfTest, terminate }) as never,
        }),
      ).rejects.toThrow(/repeats itself/u);
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
    }
    expect(selfTest).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
