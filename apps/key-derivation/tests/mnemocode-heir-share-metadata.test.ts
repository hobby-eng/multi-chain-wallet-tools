import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeirSheetFacts, HeirSheetSize } from "@ckd/recovery-backup/mnemocode-heirs.js";
import type { HeldShares } from "../src/ui/recovery-mnemocode-share-store.js";
import type { ShareFormat } from "../../../packages/recovery-mnemocode/source/sskr/transport.js";

interface PendingSheet {
  readonly facts: HeirSheetFacts;
  readonly size: HeirSheetSize;
  readonly resolve: (sheet: { fileName: string; bytes: Uint8Array }) => void;
  readonly reject: (cause: Error) => void;
}

const fixture = vi.hoisted(() => ({
  pending: [] as PendingSheet[],
  shares: undefined as HeldShares | undefined,
  form: "colors" as ShareFormat,
  set: { threshold: 2, count: 3 },
  listeners: new Set<() => void>(),
  download: vi.fn(),
}));

vi.mock("@ckd/build-info", () => ({
  BUILD_INFO: {
    version: "0.0.0-test",
    edition: "Public fixture",
    releaseRepository: "example/public-fixture",
    profile: "multi-chain",
  },
}));

vi.mock("@ckd/recovery-backup/mnemocode-heirs.js", async () => {
  const { capabilities } =
    await import("../../../packages/recovery-mnemocode/source/core/backup-options.js");
  return {
    MnemoCodeHeirSheets: class {
      static supports(mode: Parameters<typeof capabilities>[0]) {
        return capabilities(mode).heirSheet;
      }
      render(facts: HeirSheetFacts, size: HeirSheetSize) {
        return new Promise((resolve, reject) =>
          fixture.pending.push({ facts, size, resolve, reject }),
        );
      }
    },
  };
});
vi.mock("@ckd/export/download.js", () => ({ downloadBlob: fixture.download }));
vi.mock("@ckd/recovery-backup/mnemocode-card-assets.js", () => ({
  readMnemoCodeCardAsset: () => {
    throw new Error("The passive heir fixture must not read assets.");
  },
}));
vi.mock("@ckd/recovery-backup/mnemocode-cards.js", () => ({
  createMnemoCodeCardPlatform: () => ({}),
}));
vi.mock("../../../packages/recovery-mnemocode/source/export/heir-sheet-self-test.js", () => ({
  heirSheetSelfTest: () => ({}),
}));
vi.mock("../src/ui/recovery-mnemocode-self-test.js", () => ({
  mnemoCodeSelfTest: { addFeature: () => undefined },
}));
vi.mock("../src/ui/recovery-mnemocode-fields.js", () => ({
  installPhraseWordCounts: () => undefined,
  chosenPhraseWords: () => 12,
}));
vi.mock("../src/ui/recovery-mnemocode-share-choice.js", () => ({
  chosenShareSet: () => fixture.set,
  chosenShareForm: () => fixture.form,
}));
vi.mock("../src/ui/recovery-mnemocode-share-store.js", () => ({
  latestShares: {
    get shares() {
      return fixture.shares;
    },
    onChange: (listener: () => void) => fixture.listeners.add(listener),
  },
}));
vi.mock("../src/ui/recovery-workspace-shared.js", () => ({
  required: (selector: string) => {
    const control = document.querySelector(selector);
    if (control === null) throw new Error(`Missing passive control ${selector}.`);
    return control;
  },
}));

import { recoveryFeature } from "../src/ui/recovery-mnemocode-heirs.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { ownShareCards } from "../../../packages/recovery-mnemocode/source/export/sskr-render.js";
import * as cardMetadata from "@ckd/recovery-backup/mnemocode-share-cards.js";
import {
  sskrSetVector,
  sskrVector,
} from "../../../packages/recovery-mnemocode/source/sskr/known-answers.js";

class Control extends EventTarget {
  value = "";
  type = "text";
  disabled = false;
  textContent = "";
  readonly tagName: string;
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  constructor(tagName = "INPUT") {
    super();
    this.tagName = tagName;
  }
  closest() {
    return null;
  }
}

let controls: Map<string, Control>;
let documentStub: EventTarget;
let windowStub: EventTarget;
let gate: RecoveryJobGate;
const control = (selector: string): Control => controls.get(selector)!;
const press = () => control("#mnemocode-heirs-save").dispatchEvent(new Event("click"));
const flush = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

function edit(selector: string, root = selector, type = "input") {
  const field = control(selector);
  field.value += "x";
  const event = new Event(type);
  Object.defineProperty(event, "target", { value: field });
  control(root).dispatchEvent(event);
}

beforeEach(() => {
  fixture.pending.length = 0;
  fixture.listeners.clear();
  fixture.download.mockReset();
  fixture.form = "colors";
  fixture.set = { threshold: 2, count: 3 };
  fixture.shares = {
    records: sskrSetVector.shares,
    form: "colors",
    masked: false,
    origin: "split",
  };
  controls = new Map(
    [
      "#mnemocode-encode-mode",
      "#mnemocode-encode-format",
      "#mnemocode-encode-dates",
      "#mnemocode-source",
      "#mnemocode-split-section",
      "#mnemocode-heirs-section",
      "#mnemocode-heirs-size",
      "#mnemocode-heirs-words",
      "#mnemocode-heirs-status",
      "#mnemocode-heirs-save",
      "#clear-all",
      'input[name="mnemocode-heirs-backup"]:checked',
    ].map((selector) => [selector, new Control(selector.endsWith("-size") ? "SELECT" : "INPUT")]),
  );
  control("#mnemocode-encode-mode").value = "direct";
  control("#mnemocode-encode-format").value = "colors";
  control("#mnemocode-heirs-size").value = "a5";
  control('input[name="mnemocode-heirs-backup"]:checked').value = "shares";
  documentStub = new EventTarget();
  Object.assign(documentStub, {
    querySelector: (selector: string) => controls.get(selector) ?? null,
  });
  windowStub = new EventTarget();
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
  gate = new RecoveryJobGate();
  gate.setReady(true);
  recoveryFeature.install({ jobs: gate } as RecoveryFeatureContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MnemoCode heir share metadata and asynchronous ownership", () => {
  it.each(["unicode", "colors", "colors-unicode"] as const)(
    "P53: passes the shared own-code count for %s, excluding decoys",
    async (form) => {
      fixture.form = form;
      fixture.shares = { ...fixture.shares!, form };
      const expected = ownShareCards(sskrSetVector.shares[0], form);
      const metadata = vi.spyOn(cardMetadata, "ownShareCards");
      press();
      const pending = fixture.pending[0]!;
      expect(pending.facts.backup).toEqual({
        kind: "shares",
        format: form,
        threshold: 2,
        count: 3,
        codes: expected,
      });
      expect(metadata).toHaveBeenCalledExactlyOnceWith(sskrSetVector.shares[0], form);
      pending.resolve({ fileName: "public-heirs.pdf", bytes: Uint8Array.of(1) });
      await flush();
    },
  );

  it.each(["ur", "words", "indexes"] as const)(
    "leaves codes absent for %s without requiring a rendered or generated share",
    async (form) => {
      fixture.form = form;
      fixture.shares = undefined;
      const metadata = vi.spyOn(cardMetadata, "ownShareCards");
      press();
      expect(fixture.pending[0]!.facts.backup).toEqual({
        kind: "shares",
        format: form,
        threshold: 2,
        count: 3,
      });
      expect(metadata).not.toHaveBeenCalled();
      fixture.pending[0]!.resolve({ fileName: "public-heirs.pdf", bytes: Uint8Array.of(1) });
      await flush();
    },
  );

  it.each([
    () => {
      fixture.shares = undefined;
    },
    () => {
      fixture.shares = { ...fixture.shares!, records: [] };
    },
    () => {
      fixture.shares = { ...fixture.shares!, origin: "repair" };
    },
    () => {
      fixture.shares = { ...fixture.shares!, form: "unicode" };
    },
    () => {
      fixture.shares = { ...fixture.shares!, masked: true };
    },
    () => {
      fixture.set = { threshold: 2, count: 4 };
    },
    () => {
      fixture.set = { threshold: 3, count: 3 };
    },
    () => {
      fixture.shares = { ...fixture.shares!, records: sskrVector.shares.slice(0, 3) };
    },
  ])(
    "refuses missing, stale, repaired or grouped split metadata before drawing",
    async (change) => {
      change();
      const metadata = vi.spyOn(cardMetadata, "ownShareCards");
      press();
      await flush();
      expect(fixture.pending).toEqual([]);
      expect(metadata).not.toHaveBeenCalled();
      expect(fixture.download).not.toHaveBeenCalled();
      expect(control("#mnemocode-heirs-status").textContent).toContain(
        "Split the phrase into shares",
      );
      expect(control("#mnemocode-heirs-save").disabled).toBe(false);
    },
  );

  it("rejects malformed retained records through the shared reader without disclosing them", async () => {
    const damaged = "public-invalid-share";
    fixture.shares = { ...fixture.shares!, records: [damaged, ...sskrSetVector.shares.slice(1)] };
    press();
    await flush();
    expect(fixture.pending).toEqual([]);
    expect(fixture.download).not.toHaveBeenCalled();
    expect(control("#mnemocode-heirs-status").textContent).not.toContain(damaged);
  });

  it("keeps encoded sheets available without a retained share or any share metadata call", async () => {
    fixture.shares = undefined;
    control('input[name="mnemocode-heirs-backup"]:checked').value = "encoded";
    const metadata = vi.spyOn(cardMetadata, "ownShareCards");
    press();
    expect(fixture.pending[0]!.facts.backup).toEqual({
      kind: "encoded",
      format: "colors",
      words: 12,
    });
    expect(metadata).not.toHaveBeenCalled();
    fixture.pending[0]!.resolve({ fileName: "public-heirs.pdf", bytes: Uint8Array.of(1) });
    await flush();
  });

  it("serializes the passive renderer and restores availability after publication", async () => {
    press();
    press();
    expect(fixture.pending).toHaveLength(1);
    expect(gate.runningJob).toBe("MnemoCode instructions for heirs");
    expect(control("#mnemocode-heirs-save").disabled).toBe(true);
    const bytes = Uint8Array.of(1);
    fixture.pending[0]!.resolve({ fileName: "public-heirs.pdf", bytes });
    await flush();
    expect(fixture.download).toHaveBeenCalledTimes(1);
    expect(bytes).toEqual(Uint8Array.of(0));
    expect(gate.runningJob).toBeNull();
    expect(control("#mnemocode-heirs-save").disabled).toBe(false);
  });

  it.each([
    () => edit("#mnemocode-encode-mode"),
    () => edit("#mnemocode-encode-format"),
    () => edit("#mnemocode-encode-dates"),
    () => edit("#mnemocode-source"),
    () => edit("#mnemocode-heirs-size", "#mnemocode-heirs-section", "change"),
    () => edit("#mnemocode-split-section"),
    () => fixture.listeners.forEach((listener) => listener()),
    () => control("#clear-all").dispatchEvent(new Event("click")),
    () => windowStub.dispatchEvent(new Event("pagehide")),
    () => gate.setReady(false),
  ])(
    "drops a late sheet after source, settings, lifetime or startup invalidation",
    async (invalidate) => {
      press();
      const pending = fixture.pending[0]!;
      invalidate();
      const bytes = Uint8Array.of(1);
      pending.resolve({ fileName: "public-heirs.pdf", bytes });
      await flush();
      expect(fixture.download).not.toHaveBeenCalled();
      expect(bytes).toEqual(Uint8Array.of(0));
      expect(control("#mnemocode-heirs-status").textContent).toContain("nothing was saved");
    },
  );

  it("does not enter rendering before startup or while another admitted job is running", async () => {
    gate.setReady(false);
    press();
    gate.setReady(true);
    let release!: () => void;
    const other = gate.runHeavy(
      "Synthetic other job",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    press();
    expect(fixture.pending).toEqual([]);
    release();
    await other;
  });

  it("keeps current errors and drops stale errors", async () => {
    press();
    fixture.pending[0]!.reject(new Error("Synthetic drawing failure."));
    await flush();
    expect(control("#mnemocode-heirs-status").textContent).toBe("Synthetic drawing failure.");
    press();
    edit("#mnemocode-source");
    fixture.pending[1]!.reject(new Error("Synthetic late drawing failure."));
    await flush();
    expect(control("#mnemocode-heirs-status").textContent).toContain("nothing was saved");
    expect(fixture.download).not.toHaveBeenCalled();
  });
});
