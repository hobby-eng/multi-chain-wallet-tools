import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

// Public test phrases only: BIP39's "abandon … about", DIP-14's and dashj's test mnemonics.
const BIRTH = "birth kingdom trash renew flavor utility donkey gasp regular alert pave layer";
const ENEMY = "enemy check owner stumble unaware debris suffer peanut good fabric bleak outside";
// Dash Core's DIP15 friendship vector IDs, 00 01 … 1f in Base58 and ff fe … e0 in hex.
const OWN_ID = "1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE";
const CONTACT_ID = "fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0";

const fieldValues = (page, root, field) =>
  page
    .locator(`${root} [data-copy-field="${field}"]`)
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement.querySelector(".value")?.textContent ??
          button.closest(".row")?.querySelector(".value")?.textContent,
      ),
    );

async function selectProtocol(page, adapterId) {
  await page.locator(`#protocol-tabs [data-adapter-id="${adapterId}"]`).click();
  await page.locator("#results").waitFor({ state: "visible" });
  await page.locator("#address-list [data-copy-field]").first().waitFor();
}

/** The Deriver's new Dash keys and the Multisig wallet tab, offline, with public test phrases. */
export class DashKeysAndMultisigCase {
  static async run(context, profile, run, open, storageSnapshot) {
    const page = await open(context, profile, "key-derivation", run);
    const before = await storageSnapshot(page);
    if (profile.id === "multi-chain") await page.locator("#coin").selectOption("dash");
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(BrowserFixtures.mnemonic);

    // Masternode keys: rust-dashcore key-wallet's Platform node ID and BLS operator key.
    await selectProtocol(page, "dash-masternode");
    assert.deepEqual(await fieldValues(page, "#address-list", "platformNodeId"), [
      "302f2615e6955cce8ed3cff81e8011bfd3a2991f",
    ]);
    assert.deepEqual(await fieldValues(page, "#address-list", "operatorPublicKey"), [
      "878cad04aae29eb76171937eb7101452b401b026efbc27db840f130374e6a9ec8443d917277f8921e0ba6678a7709875",
    ]);
    assert.equal(
      await page.locator('#address-list [data-copy-field="operatorSecretKey"]').isDisabled(),
      true,
    );

    // Identity funding keys: every kind, and the invitation key both ways.
    await selectProtocol(page, "dash-identity-funding");
    const [registration] = await fieldValues(page, "#address-list", "registrationAddress");
    assert.match(registration ?? "", /^X/u);
    const [invitation] = await fieldValues(page, "#address-list", "invitationAddress");
    const [hardened] = await fieldValues(page, "#address-list", "invitationHardenedAddress");
    assert.notEqual(invitation, hardened);
    assert.equal(
      await page.locator("#account-label").innerText(),
      "Identity index of the bound top-up key",
    );

    // DashPay: two identity IDs of its own, refused while empty, then the contact's chain.
    await page.locator('#protocol-tabs [data-adapter-id="dash-dashpay"]').click();
    await page.locator("#protocol-text-ownIdentityId").waitFor();
    // The refusal is the protocol's own text, never what was typed.
    await page.locator("#error").filter({ hasText: "Enter your identity ID." }).waitFor();
    await page.locator("#protocol-text-ownIdentityId").fill(OWN_ID);
    await page.locator("#protocol-text-contactIdentityId").fill(CONTACT_ID);
    await page.locator("#results").waitFor({ state: "visible" });
    await page.locator('#address-list [data-copy-field="address"]').first().waitFor();
    const [payment] = await fieldValues(page, "#address-list", "address");
    assert.match(payment ?? "", /^X/u);
    assert.match(await page.locator("#path-preview").innerText(), /15'\/0'\/\(your ID\)/u);

    // Multisig wallet: 2-of-3 Purpose48 from three public phrases (the research probe's value).
    await page.locator("#recovery-backup-mode").click();
    await page.locator('[data-recovery-tab][aria-controls="multisig-panel"]').click();
    await page
      .locator("#multisig-cosigners")
      .fill([BrowserFixtures.mnemonic, BIRTH, ENEMY].join("\n"));
    await page.locator("#multisig-path").selectOption("purpose48");
    await page.locator("#multisig-count").fill("1");
    await page.locator("#run-multisig").click();
    await page.locator('#multisig-results [data-copy-field="address"]').first().waitFor();
    assert.deepEqual(await fieldValues(page, "#multisig-results", "address"), [
      "7dUNRiG1nVALhM1t3YqF4viRgfE5MwFSae",
    ]);
    assert.deepEqual(await fieldValues(page, "#multisig-results", "platformAddress"), [
      "dash1spu466hzqeq4pgjh9t0aemp5lddgpc8jjc8ynevx",
    ]);
    assert.equal(
      await page
        .locator('#multisig-results [data-copy-field="cosigner1PrivateKeyWif"]')
        .isDisabled(),
      true,
    );
    assert.match(await page.locator("#multisig-summary").innerText(), /sh\(sortedmulti\(2,/u);
    if (profile.id === "multi-chain") {
      // Taproot multi_a: a script-path bc1p address under BIP341's unspendable internal key.
      await page.locator("#multisig-scheme").selectOption("bitcoin-p2tr-multi-a");
      assert.equal(await page.locator("#multisig-path").inputValue(), "bip48-3");
      await page.locator("#run-multisig").click();
      await page.locator("#multisig-summary").filter({ hasText: "sortedmulti_a(2," }).waitFor();
      const [taproot] = await fieldValues(page, "#multisig-results", "address");
      assert.match(taproot ?? "", /^bc1p/u);
      // MuSig2 is n-of-n: no threshold or key order to choose.
      await page.locator("#multisig-scheme").selectOption("bitcoin-p2tr-musig2");
      assert.equal(await page.locator("#multisig-required").isDisabled(), true);
      await page.locator("#run-multisig").click();
      await page.locator("#multisig-summary").filter({ hasText: "tr(musig(" }).waitFor();
      assert.match(await page.locator("#multisig-summary").innerText(), /3 of 3/u);
    } else {
      assert.equal(await page.locator('#multisig-scheme option[data-coin="bitcoin"]').count(), 0);
    }
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(run.requests.length, 0);
    run.checks.push(
      "Dash masternode, identity funding and DashPay tabs derive their public vectors; Multisig wallet builds the 2-of-3 Core and Platform P2SH addresses with private keys concealed; storage/no HTTP",
    );
  }
}
