import { afterEach, expect, it, vi } from "vitest";
import { installResultTabNavigation } from "../src/ui/result-tab-navigation.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { keyDown } from "./fake-recovery-page.js";

afterEach(() => vi.unstubAllGlobals());
function mount() {
  const page = new PassiveQrPage();
  const receive = page.add("receive", "button");
  const change = page.add("change", "button");
  const coinjoin = page.add("coinjoin", "button");
  const external = page.add("external", "button");
  const internal = page.add("internal", "button");
  const host: Parameters<typeof installResultTabNavigation>[0] & {
    calls: string[];
    disabled: boolean;
  } = {
    topLevel: [
      [receive as unknown as HTMLButtonElement, "receive"],
      [change as unknown as HTMLButtonElement, "change"],
      [coinjoin as unknown as HTMLButtonElement, "coinjoin"],
    ],
    coinJoinBranches: [
      [external as unknown as HTMLButtonElement, "coinjoin-external"],
      [internal as unknown as HTMLButtonElement, "coinjoin-internal"],
    ],
    calls: [],
    disabled: false,
    activateTopLevel(tab) {
      this.calls.push(tab);
    },
    activateBranch(branch) {
      this.calls.push(branch);
    },
    branchEnabled() {
      return !this.disabled;
    },
    focusBranch(branch) {
      this.calls.push(`focus:${branch}`);
    },
  };
  installResultTabNavigation(host);
  return { page, host, receive, change, coinjoin, external, internal };
}

it("preserves method owners for pointer, keyboard, availability and focus callbacks", () => {
  const view = mount();
  view.receive.click();
  keyDown(view.receive, "ArrowRight");
  expect(view.page.activeElement).toBe(view.change);
  keyDown(view.external, "End");
  expect(view.host.calls).toEqual([
    "receive",
    "change",
    "coinjoin-internal",
    "focus:coinjoin-internal",
  ]);
});

it("keeps hidden and disabled tabs out of activation and ignores other keys", () => {
  const view = mount();
  view.change.hidden = true;
  keyDown(view.receive, "ArrowRight");
  expect(view.host.calls).toEqual(["coinjoin"]);
  view.coinjoin.disabled = true;
  keyDown(view.receive, "ArrowRight");
  view.host.disabled = true;
  keyDown(view.external, "End");
  const event = keyDown(view.receive, "Escape");
  expect(event.defaultPrevented).toBe(false);
  expect(view.host.calls).toEqual(["coinjoin"]);
});
