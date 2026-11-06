import { afterEach, describe, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { installScriptDecoderFeature } from "../src/script-decoder-feature.js";
import { selectedNetwork } from "../src/ui-common.js";

const SCRIPT = "76a914751e76e8199196d454941c45d1b3a323f1433bd688ac";
const DESCRIPTOR = "pkh(0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)";
// Independent Python SHA256/Base58Check reproduced the existing mainnet literal first.
const DASH_MAINNET = "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE";
const DASH_TESTNET = "yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg6";

class InspectorPage extends CompleteIdPage {
  getElementById(id: string) {
    return this.querySelector(`#${id}`);
  }
}

function fixture(input = SCRIPT) {
  const page = new InspectorPage();
  page.require("script-chain").value = "bitcoin";
  page.require("script-network").value = "regtest";
  page.require("script-role").value = "script-pubkey";
  page.require("script-branch").value = "0";
  page.require("script-wildcard-index").value = "0";
  page.require("script-input").value = input;
  const option = page.createElement("option");
  option.setAttribute("value", "regtest");
  page.require("script-network").append(option);
  installScriptDecoderFeature({ script: true, descriptor: true });
  return { page, option };
}

function rendered(page: InspectorPage): string {
  return [page.require("script-classification"), ...page.require("script-wrappers").descendants()]
    .map((element) => element.textContent)
    .join("\n");
}

afterEach(() => vi.unstubAllGlobals());

describe("the actual Script decoder preserves the displayed network across chain changes", () => {
  it.each([SCRIPT, DESCRIPTOR])(
    "keeps an explicitly selected Dash mainnet address for %s",
    (input) => {
      const { page } = fixture(input);
      page.require("script-chain").value = "dash";
      page.require("script-network").value = "mainnet";
      page.require("script-chain").dispatchEvent(new Event("change"));
      page.require("decode-script").click();
      expect(page.require("script-error").hidden).toBe(true);
      expect(rendered(page)).toContain(DASH_MAINNET);
    },
  );

  it.each([SCRIPT, DESCRIPTOR])("synchronizes Bitcoin regtest to Dash testnet for %s", (input) => {
    const { page, option } = fixture(input);
    page.require("script-chain").value = "dash";
    page.require("script-chain").dispatchEvent(new Event("change"));
    expect(page.require("script-network").value).toBe("testnet");
    expect(option.disabled).toBe(true);
    page.require("decode-script").click();
    expect(page.require("script-error").hidden).toBe(true);
    expect(rendered(page)).toContain(DASH_TESTNET);
    expect(rendered(page)).not.toContain(DASH_MAINNET);
  });

  it("retires a previous result when the displayed network changes", () => {
    const { page } = fixture();
    page.require("decode-script").click();
    expect(page.require("script-results").hidden).toBe(false);
    page.require("script-network").value = "mainnet";
    page.require("script-network").dispatchEvent(new Event("change"));
    expect(page.require("script-results").hidden).toBe(true);
  });

  it.each(["regtest", "", "unknown network"])(
    "refuses unsupported Dash selection %s without a mainnet fallback",
    (network) => {
      const page = new InspectorPage();
      const select = page.asDocument().createElement("select");
      select.value = network;
      expect(() => selectedNetwork(select, "dash")).toThrow();
    },
  );
});
