// The Wallet Matcher's limits as the page states them and as the Matcher applies them: its address
// field, the same in both editions, names the most address lines that a search reads.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectDashMatcherTargets } from "@ckd/recovery/matcher-targets-dash.js";
import { detectMultiChainMatcherTargets } from "@ckd/recovery/matcher-targets-multichain.js";
import { MAX_MATCHER_TARGETS } from "@ckd/recovery/matcher-targets.js";

const template = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
/** Dash Core's first address of "abandon … about", which both editions read. */
const DASH = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";

describe("the Wallet Matcher's line limit", () => {
  it("is the same on the page's address field and in the refusal of a longer list", () => {
    const placeholder = /<textarea\s[^>]*id="matcher-addresses"[^>]*placeholder="([^"]*)"/u.exec(
      template,
    )?.[1];
    const stated = /at most ([\d,]+) lines/u.exec(placeholder ?? "")?.[1];
    expect(stated).toBe(MAX_MATCHER_TARGETS.toLocaleString("en-US"));
    const lines = (count: number) => Array.from({ length: count }, () => DASH).join("\n");
    for (const detect of [detectMultiChainMatcherTargets, detectDashMatcherTargets]) {
      expect(() => detect(lines(MAX_MATCHER_TARGETS + 1), "mainnet", false)).toThrow(
        `Enter at most ${stated} known addresses.`,
      );
      // At the limit the list is read: its second line is then refused as a repeat, not for length.
      expect(() => detect(lines(MAX_MATCHER_TARGETS), "mainnet", false)).toThrow(
        "Address 2 duplicates an earlier address.",
      );
    }
  });
});
