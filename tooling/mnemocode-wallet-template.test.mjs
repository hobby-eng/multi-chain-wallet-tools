import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILD_PROFILES, getToolBuild } from "./build-profiles.mjs";
import { applyKeyDerivationFeatureTemplate } from "./key-derivation-features.mjs";
import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";
import { applyProfileTemplate } from "./profile-template.mjs";

const EXISTING_PREFIXES = [
  "mnemocode-decode",
  "mnemocode-restore",
  "mnemocode-forgotten-shares",
  "mnemocode-forgotten",
];
const ALL_PREFIXES = [...EXISTING_PREFIXES, "mnemocode-reencode"];
const PASSPHRASE_LIMIT_PREFIXES = new Set([
  "mnemocode-decode",
  "mnemocode-restore",
  "mnemocode-forgotten",
]);
const BITCOIN_PROFILES = ["legacy", "nested-segwit", "native-segwit", "taproot"];
const marker = (prefix) => `<!-- MNEMOCODE_WALLET_FIELDS: ${prefix} -->`;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ids = (html) => [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
const attribute = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, "u").exec(tag)?.[1];
const tags = (html) => [...html.matchAll(/<[a-z][^>]*>/gu)].map((match) => match[0]);
const names = (source, pattern) => [...source.matchAll(pattern)].map((match) => match[1]);

describe("shared MnemoCode wallet fields", () => {
  const wallet = new MnemoCodeWalletTemplate();

  for (const prefixes of [EXISTING_PREFIXES, ALL_PREFIXES]) {
    it(`expands ${prefixes.length} independent questions without duplicate IDs or radio groups`, () => {
      const rendered = wallet.expand(prefixes.map(marker).join("\n"));
      const renderedIds = ids(rendered);
      expect(new Set(renderedIds).size).toBe(renderedIds.length);
      expect(rendered).not.toContain("MNEMOCODE_WALLET_FIELDS");
      expect(rendered).not.toMatch(/__MNEMOCODE_[A-Z_]+__/u);
      for (const prefix of prefixes) {
        expect(renderedIds).toContain(`${prefix}-wallet-fingerprint`);
        expect(renderedIds).toContain(`toggle-${prefix}-wallet-passphrase`);
        const radios = tags(rendered).filter(
          (tag) => attribute(tag, "name") === `${prefix}-wallet`,
        );
        expect(radios.map((tag) => attribute(tag, "value"))).toEqual([
          "fingerprint",
          "address",
          "key",
          "coin",
          "none",
        ]);
        expect(radios.every((tag) => attribute(tag, "type") === "radio")).toBe(true);
        expect(radios.every((tag) => !/\bchecked\b/u.test(tag))).toBe(true);
      }
    });
  }

  it.each(ALL_PREFIXES)("keeps field, Help and event references for %s", (prefix) => {
    const rendered = wallet.render(prefix);
    const renderedIds = new Set(ids(rendered));
    const runtime = read("apps/key-derivation/src/ui/recovery-mnemocode-evidence.ts");
    // Cover the owner's literal selectors and the names passed to its dynamic field readers.
    const literalNames = names(
      runtime,
      /`#(?:\$\{prefix\}|\$\{this\.#prefix\})-wallet-([a-z-]+)`/gu,
    );
    const valueNames = names(runtime, /this\.#(?:value|number)\("([a-z-]+)"\)/gu);
    const fieldNames = names(runtime, /\bfield\("([a-z-]+)"/gu).map((name) => `${name}-field`);
    expect(literalNames.length).toBeGreaterThan(0);
    expect(valueNames.length).toBeGreaterThan(0);
    expect(fieldNames.length).toBeGreaterThan(0);
    for (const name of [...literalNames, ...valueNames, ...fieldNames])
      expect(renderedIds.has(`${prefix}-wallet-${name}`), name).toBe(
        name === "passphrase-limit" ? PASSPHRASE_LIMIT_PREFIXES.has(prefix) : true,
      );
    expect(renderedIds.has(`toggle-${prefix}-wallet-passphrase`)).toBe(true);

    for (const [, references] of rendered.matchAll(
      /\b(?:for|aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/gu,
    ))
      for (const reference of references.split(/\s+/u))
        expect(renderedIds.has(reference), reference).toBe(true);

    for (const profile of BITCOIN_PROFILES) {
      const input = tags(rendered).find(
        (tag) => attribute(tag, "id") === `${prefix}-wallet-profile-${profile}`,
      );
      expect(input, profile).toBeDefined();
      expect(attribute(input, "type")).toBe("checkbox");
      expect(attribute(input, "value")).toBe(profile);
    }
    const passphrase = tags(rendered).find(
      (tag) => attribute(tag, "id") === `${prefix}-wallet-passphrase`,
    );
    expect(passphrase).toMatch(/^<textarea\b/u);
    expect(attribute(passphrase, "class")).toBe("concealed");
    expect(attribute(passphrase, "type")).toBeUndefined();
    expect(attribute(passphrase, "autocomplete")).toBe("off");
    expect(attribute(passphrase, "autocapitalize")).toBe("none");
    expect(attribute(passphrase, "spellcheck")).toBe("false");
    for (const name of ["account", "branch", "index"]) {
      const input = tags(rendered).find(
        (tag) => attribute(tag, "id") === `${prefix}-wallet-${name}`,
      );
      expect(input, name).toBeDefined();
      expect(input.startsWith("<input "), name).toBe(true);
      expect(attribute(input, "type"), name).toBe("number");
      expect(attribute(input, "min"), name).toBe("0");
      expect(attribute(input, "step"), name).toBe("1");
      expect(attribute(input, "value"), name).toBe("0");
      expect(attribute(input, "max"), name).toBeUndefined();
    }
    expect(rendered).toContain("0 receiving, 1 change, or another normal BIP32 branch");
    const addresses = tags(rendered).find(
      (tag) => attribute(tag, "id") === `${prefix}-wallet-addresses`,
    );
    expect(attribute(addresses, "min")).toBe("1");
    expect(attribute(addresses, "step")).toBe("1");
    expect(attribute(addresses, "max")).toBeUndefined();
    expect(attribute(addresses, "value")).toBeUndefined();
    expect(attribute(addresses, "aria-describedby")).toBe(`${prefix}-wallet-addresses-note`);
    expect(rendered).toContain(`<p id="${prefix}-wallet-addresses-note" class="field-note"></p>`);
    expect(rendered).not.toMatch(/\b(?:20|1000|1,000|256)\b/u);
    expect(renderedIds.has(`${prefix}-wallet-passphrase-limit`)).toBe(
      PASSPHRASE_LIMIT_PREFIXES.has(prefix),
    );
    expect(rendered).toContain('class="recovery-help option-help"');
    expect(rendered).toContain('class="recovery-help-popover"');
    expect(rendered.replace(/\s+/gu, " ")).toContain("so the encoded fingerprint never matches.");
    expect(rendered).toContain("A WIF can spend the funds.");
  });

  it.each([
    ["mnemocode-decode", "list every candidate instead", "Part of the wallet; each check uses it"],
    [
      "mnemocode-restore",
      "every phrase that fits is shown",
      "Part of the wallet; each check uses it, and a candidate list stores it with the phrases",
    ],
    [
      "mnemocode-forgotten-shares",
      "each set that fits is shown with its fingerprint",
      "Part of the wallet; each check uses it.",
    ],
    [
      "mnemocode-forgotten",
      "list every candidate instead",
      "Part of the wallet; each check uses it, and a candidate list stores it with the candidates",
    ],
  ])("preserves the existing operation notes for %s", (prefix, noneNote, passphraseNote) => {
    const rendered = wallet.render(prefix);
    expect(rendered).toContain(noneNote);
    const suffix = PASSPHRASE_LIMIT_PREFIXES.has(prefix)
      ? ` (at most <span id="${prefix}-wallet-passphrase-limit"></span> bytes).`
      : "";
    expect(rendered).toContain(`${passphraseNote}${suffix}`);
  });

  it("keeps reencoding's passphrase note independent of candidate lists", () => {
    const rendered = wallet.render("mnemocode-reencode");
    expect(rendered).toContain("Part of the wallet; each check uses it.");
    expect(rendered).not.toContain("wallet-passphrase-limit");
    expect(rendered).not.toContain("at most");
    expect(rendered).not.toContain("a candidate list stores it");
  });

  it.each([
    "",
    "mnemocode-",
    "mnemocode-decode--extra",
    "mnemocode-Decode",
    "other-decode",
    "../mnemocode-decode",
    "mnemocode-decode extra",
    'mnemocode-decode" onfocus="alert(1)',
    "mnemocode-decode<script>alert(1)</script>",
    'mnemocode-decode"--> <script>alert(1)</script><!--',
    "mnemocode-decode\nextra",
  ])("refuses an invalid prefix and its marker: %j", (prefix) => {
    expect(() => wallet.render(prefix)).toThrow(/Invalid MnemoCode wallet prefix/u);
    expect(() => wallet.expand(marker(prefix))).toThrow(/MnemoCode wallet/u);
  });

  it("refuses incomplete, malformed and duplicate markers", () => {
    for (const template of [
      "<!-- MNEMOCODE_WALLET_FIELDS: mnemocode-decode",
      "<!-- MNEMOCODE_WALLET_FIELDS -->",
      "<!-- MNEMOCODE_WALLET_FIELDS = mnemocode-decode -->",
    ])
      expect(() => wallet.expand(template)).toThrow(/Malformed MnemoCode wallet/u);
    expect(() =>
      wallet.expand(`${marker("mnemocode-decode")}\n${marker("mnemocode-decode")}`),
    ).toThrow(/Duplicate MnemoCode wallet prefix/u);
    expect(wallet.expand("<main>Unrelated tool</main>")).toBe("<main>Unrelated tool</main>");
  });

  it("keeps host-only wrappers and list controls outside the partial", () => {
    const template = `<div id="mnemocode-decode-missing-wallet" hidden>${marker("mnemocode-decode")}</div>
      <label for="mnemocode-restore-list"><input id="mnemocode-restore-list" type="checkbox"></label>`;
    const rendered = wallet.expand(template);
    expect(rendered).toContain('<div id="mnemocode-decode-missing-wallet" hidden>');
    expect(rendered).toContain('id="mnemocode-restore-list"');
    const partial = read("apps/key-derivation/src/partials/mnemocode-wallet-fields.html");
    expect(partial).not.toMatch(/<(?:section|script)\b|data-operation-panel|data-secret-scope/u);
    expect(partial).not.toContain("-missing-wallet");
    expect(partial).not.toContain("-list");
  });

  it.each([
    ["multi-chain", ["bitcoin", "ethereum", "dash"]],
    ["dash-community", ["dash"]],
    ["multi-chain", ["ethereum"]],
  ])("expands before admission for %s with %j", (profileId, coins) => {
    const profile = BUILD_PROFILES[profileId];
    const selection = {
      coins,
      has: () => true,
      hasCoin: (coin) => coins.includes(coin),
      hasRecovery: true,
    };
    const template = `<section id="mnemocode-panel">${ALL_PREFIXES.map(marker).join("\n")}</section>`;
    const expanded = applyProfileTemplate(
      template,
      profile,
      getToolBuild(profile, "key-derivation"),
      selection,
    );
    expect(expanded).not.toContain("MNEMOCODE_WALLET_FIELDS");
    const admitted = applyKeyDerivationFeatureTemplate(expanded, selection);
    for (const prefix of ALL_PREFIXES) {
      expect(admitted).toContain(`id="${prefix}-wallet-fingerprint"`);
      expect(admitted.includes(`id="${prefix}-wallet-address-row"`)).toBe(
        coins.includes("bitcoin"),
      );
      expect(admitted.includes(`id="${prefix}-wallet-key-field"`)).toBe(coins.includes("bitcoin"));
      expect(admitted.includes(`id="${prefix}-wallet-profile-row"`)).toBe(
        coins.includes("bitcoin"),
      );
      expect(admitted).toContain(`id="${prefix}-wallet-coin-field"`);
    }
  });

  it("keeps current page ownership in markers and shared field ownership in the partial", () => {
    const page = read("apps/key-derivation/src/index.html");
    const partial = read("apps/key-derivation/src/partials/mnemocode-wallet-fields.html");
    const renderer = read("tooling/mnemocode-wallet-template.mjs");
    for (const prefix of EXISTING_PREFIXES) {
      expect(page.split(marker(prefix))).toHaveLength(2);
      expect(page).not.toContain(`id="${prefix}-wallet-fingerprint-choice"`);
    }
    if (page.includes('id="mnemocode-reencode-panel"')) {
      expect(page.split(marker("mnemocode-reencode"))).toHaveLength(2);
      expect(page).not.toContain('id="mnemocode-reencode-wallet-fingerprint-choice"');
    }
    const sharedMessage = "Only the wallet tells which candidate is yours.";
    expect(page).not.toContain(sharedMessage);
    expect(partial.split(sharedMessage)).toHaveLength(2);
    expect(partial.split('id="__MNEMOCODE_PREFIX__-wallet-fingerprint-choice"')).toHaveLength(2);
    expect(renderer).not.toMatch(/<(?:fieldset|input|select)\b|\b(?:document|DOMParser|fetch)\b/u);
  });
});
