import { action, decodeHarness, fixture } from "./recovery-decode-fixture.js";
import { expect, it } from "vitest";
import { MnemoCodeDecodeTab } from "../src/ui/recovery-mnemocode-decode.js";
import { edit } from "./fake-recovery-page.js";

it.each(["edit", "replace", "clear"])(
  "retires recovered diagnostic nodes before Decode result %s",
  (operation) => {
    const { page, context, result } = decodeHarness("direct", false);
    page.add("clear-all", "button");
    new MnemoCodeDecodeTab(context);
    page.require("mnemocode-input").value = fixture.phrase;
    page.require("decode-mnemocode").click();
    action(result, "Show phrase")!.click();
    const diagnostic = result.querySelector(".recovered-seed-diagnostic")!;
    const retired = diagnostic.querySelectorAll(".secret-value");
    expect(retired.length).toBeGreaterThan(0);
    expect(retired.some((node) => node.textContent === "abandon")).toBe(true);
    if (operation === "edit") edit(page.require("mnemocode-input"), fixture.otherPhrase);
    else if (operation === "replace") page.require("decode-mnemocode").click();
    else page.require("clear-all").click();
    expect(retired.every((node) => node.textContent === "")).toBe(true);
  },
);
