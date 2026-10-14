import { afterEach, describe, expect, it, vi } from "vitest";

// Drive the actual Build button and real policy compiler with an in-memory form. No signing,
// generated private keys or derived expectations: these are public secp256k1 generator multiples.
const PRIMARY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const RECOVERY = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const EMERGENCY = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

class BuilderElement {
  readonly listeners = new Map<string, () => void>();
  value = "";
  textContent = "";
  hidden = false;
  disabled = false;
  addEventListener(event: string, handler: () => void): void {
    this.listeners.set(event, handler);
  }
  setCustomValidity(): void {}
  querySelector(): null {
    return null;
  }
  click(): void {
    this.listeners.get("click")?.();
  }
}

const elements = new Map<string, BuilderElement>();
function element(id: string): BuilderElement {
  let found = elements.get(id);
  if (found === undefined) {
    found = new BuilderElement();
    elements.set(id, found);
  }
  return found;
}

vi.mock("../src/ui-common.js", () => ({
  required: element,
  selectedNetwork: () => "testnet",
  syncNetworkChoice: () => undefined,
}));
const { installPolicyBuilderFeature } = await import("../src/policy-builder-feature.js");

function setup(chain = "bitcoin"): void {
  elements.clear();
  vi.stubGlobal("document", {
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const values: Record<string, string> = {
    "builder-chain": chain,
    "builder-network": "testnet",
    "builder-wrapper": "p2wsh",
    "builder-key-order": "supplied",
    "policy-mode": "staged-recovery",
    "required-signatures": "1",
    "public-keys": PRIMARY,
    "recovery-public-key": RECOVERY,
    "recovery-required": "1",
    "emergency-public-keys": EMERGENCY,
    "emergency-required": "1",
    "lock-kind": "relative-time",
    "lock-value": "1",
    "time-unit": "seconds",
    "second-lock-kind": "relative-time",
    "second-lock-value": "2",
    "second-time-unit": "seconds",
  };
  for (const [id, value] of Object.entries(values)) element(id).value = value;
  installPolicyBuilderFeature();
}

function expectPolicy(
  firstSeconds: number,
  secondSeconds: number,
  firstOperand: number,
  secondOperand: number,
): void {
  element("build-policy").click();
  expect(element("builder-error").hidden, element("builder-error").textContent).toBe(true);
  expect(element("policy-results").hidden).toBe(false);
  expect(element("policy-expression").textContent).toBe(
    `or(primary-key,after(${firstSeconds},first-recovery-key),after(${secondSeconds},second-recovery-key))`,
  );
  expect(element("policy-miniscript").textContent).toBe(
    `or_d(pk(${PRIMARY}),or_i(and_v(v:pkh(${RECOVERY}),older(${firstOperand})),and_v(v:pkh(${EMERGENCY}),older(${secondOperand}))))`,
  );
}

describe("both policy-builder locks use the same time-unit owner (AUD-024-ARC003)", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Literal expectations use the builder's 30-day month and BIP68's upward 512-second rounding.
  const cases = [
    { unit: "seconds", first: 1, second: 2, firstOperand: 4_194_305, secondOperand: 4_194_305 },
    { unit: "minutes", first: 60, second: 120, firstOperand: 4_194_305, secondOperand: 4_194_305 },
    {
      unit: "hours",
      first: 3_600,
      second: 7_200,
      firstOperand: 4_194_312,
      secondOperand: 4_194_319,
    },
    {
      unit: "days",
      first: 86_400,
      second: 172_800,
      firstOperand: 4_194_473,
      secondOperand: 4_194_642,
    },
    {
      unit: "months",
      first: 2_592_000,
      second: 5_184_000,
      firstOperand: 4_199_367,
      secondOperand: 4_204_429,
    },
  ];
  for (const chain of ["bitcoin", "dash"]) {
    for (const { unit, first, second, firstOperand, secondOperand } of cases) {
      it(`builds both ${chain} recovery branches in ${unit}`, () => {
        setup(chain);
        element("time-unit").value = unit;
        element("second-time-unit").value = unit;
        expectPolicy(first, second, firstOperand, secondOperand);
      });
    }
  }

  it("keeps separate selectors and rounds each delay up", () => {
    setup();
    element("time-unit").value = "days";
    element("second-time-unit").value = "months";
    expectPolicy(86_400, 5_184_000, 4_194_473, 4_204_429);
    expect(element("policy-requirement").textContent).toContain(
      "86528 seconds (169 × 512-second units)",
    );
    expect(element("policy-requirement").textContent).toContain(
      "5184000 seconds (10125 × 512-second units)",
    );
  });

  it("does not multiply block delays even with an irrelevant time selector", () => {
    setup();
    element("lock-kind").value = "relative-blocks";
    element("second-lock-kind").value = "relative-blocks";
    element("time-unit").value = "months";
    element("second-time-unit").value = "weeks";
    expectPolicy(1, 2, 1, 2);
  });

  it("accepts the largest BIP68 duration through both controls", () => {
    setup();
    element("lock-value").value = "33553920";
    element("second-lock-value").value = "33553920";
    expectPolicy(33_553_920, 33_553_920, 4_259_839, 4_259_839);
  });

  for (const second of [false, true]) {
    const prefix = second ? "second-" : "";
    const name = second ? "second" : "first";
    for (const unit of ["weeks", "constructor", ""]) {
      it(`refuses unsupported ${name} time unit ${JSON.stringify(unit)}`, () => {
        setup();
        element(`${prefix}time-unit`).value = unit;
        element("build-policy").click();
        expect(element("policy-results").hidden).toBe(true);
        expect(element("builder-error").hidden).toBe(false);
        expect(element("builder-error").textContent).toBe("Unsupported relative time unit.");
      });
    }
    for (const value of ["-1", "0.5", "33553921"]) {
      it(`refuses invalid ${name} relative-time value ${value}`, () => {
        setup();
        element(`${prefix}lock-value`).value = value;
        element("build-policy").click();
        expect(element("policy-results").hidden).toBe(true);
        expect(element("builder-error").hidden).toBe(false);
        expect(element("builder-error").textContent).toBe(
          value === "33553921"
            ? "Relative time delay is too large."
            : "Lock value is outside the supported script-number range.",
        );
      });
    }
  }
});
