import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";
import {
  BITCOIN_MAINNET_WIF,
  BITCOIN_TESTNET_WIF,
  DASH_MAINNET_WIF,
  DASH_TESTNET_WIF,
} from "../packages/crypto-core/src/wif-version.ts";
import { BIP85_HEX_BYTES } from "../packages/crypto-core/src/bip85-values.ts";
import { BIP39_WORD_COUNTS } from "../packages/crypto-core/src/bip39-word-counts.ts";
import { MAX_BIP32_INDEX } from "../packages/crypto-core/src/bip32-limits.ts";
import { EmbeddedDerivation } from "../packages/coin-protocols/src/coins/embedded-derivation.ts";

/** The WIF version bytes of each coin and network, as the BIP85 WIF choice offers them. */
const WIF_VERSIONS = {
  bitcoin: { mainnet: BITCOIN_MAINNET_WIF, testnet: BITCOIN_TESTNET_WIF },
  dash: { mainnet: DASH_MAINNET_WIF, testnet: DASH_TESTNET_WIF },
};

function bip85WifOptions(profile) {
  const coins = profile.id === "dash-community" ? ["dash"] : ["bitcoin", "dash"];
  return coins
    .flatMap((coin) =>
      Object.entries(WIF_VERSIONS[coin]).map(([network, version]) => {
        const name = coin === "dash" ? "Dash" : "Bitcoin";
        const hex = version.toString(16).padStart(2, "0").toUpperCase();
        return `<option data-coin="${coin}" value="${version}">${name} ${network} · 0x${hex}</option>`;
      }),
    )
    .join("");
}
import { ToolProtocolFooter, selectedCoins } from "./tool-protocol-footer.mjs";

/** ID prefix of every control in the derived (BIP85 child) wallet workspace. */
const CHILD_WALLET_ID_PREFIX = "bip85-wallet-";

/** A "?" beside a hard option (owner, 2026-10-27: only where the meaning is not plain at once). */
function optionHelp(name, title, paragraphs) {
  return `<details class="recovery-help option-help"><summary class="help-mark" aria-label="${name}">?</summary><div class="recovery-help-popover"><h3>${title}</h3>${paragraphs.map((text) => `<p>${text}</p>`).join("")}</div></details>`;
}

const SILENT_PAYMENT_HELP = optionHelp("What Silent Payments are", "Silent Payments · BIP352", [
  "Adds a tab that derives this wallet's reusable Silent Payments address, which begins with sp1 on mainnet. You can publish it once: each payer's wallet makes a new Taproot output from it, which outsiders cannot link to the address.",
  "Finding these payments needs a wallet that scans the blockchain for them; this offline page does not. Turn it on only if your wallet supports BIP352.",
]);

const BIP85_HELP = optionHelp("What child seeds are", "Child seeds · BIP85", [
  "Adds a tab that derives new, independent secrets from this wallet: a recovery phrase for another wallet, a WIF private key, a root xprv or hex entropy. The same phrase, passphrase, application, length and BIP85 index always give the same child again; a 12-word and a 24-word child at one index are unrelated.",
  "A child does not reveal its parent, but anyone with the parent phrase and its passphrase can make every child. Back up the parent: a child alone does not restore it.",
]);

/** What each coin's derivation tabs are, named as the tabs name them. */
const DERIVATION_TYPE_COPY = {
  bitcoin:
    "<strong>Bitcoin:</strong> each tab is an address type, with its own path and its own addresses from the same phrase: Legacy BIP44, Nested SegWit BIP49, Native SegWit BIP84 and Taproot BIP86, whose mainnet addresses begin with 1, 3, bc1q and bc1p. Choose the type of your wallet's addresses.",
  ethereum:
    "<strong>Ethereum:</strong> EOA · BIP44 gives the ordinary accounts that Ethereum wallets derive from a recovery phrase.",
  dash: "<strong>Dash:</strong> Core BIP44 holds the ordinary addresses of Dash Core and the Dash mobile wallets. The two Multisig tabs give one cosigner's account xpub for a shared P2SH wallet: Purpose48 for wallets that use that path, Core pkh signer for a Dash Core signer wallet. Platform DIP17 / DIP18 gives Dash Platform payment addresses, Identity DIP13 the keys of a Platform identity, Identity funding DIP13 the Dash Core addresses whose asset locks fund an identity, its top-ups, invitations and Platform address or shielded top-ups, DashPay DIP15 the addresses on which one DashPay contact pays you, from your and the contact's identity IDs, Masternode DIP9 a masternode's owner, voting, BLS operator and Evonode Platform node keys, and Shielded Orchard / ZIP-32 private Orchard addresses.",
};

/** The "?" of the derivation tabs, for the coins of this build only. */
function derivationTypeHelp(coins) {
  return optionHelp("What the derivation types are", "Derivation type", [
    "Each tab is one way in which wallets derive keys and addresses from the phrase; the path below shows the one chosen.",
    ...Object.entries(DERIVATION_TYPE_COPY)
      .filter(([coin]) => coins.has(coin))
      .map(([, text]) => text),
  ]);
}

/** Shared by every MHFE operation with a custom PIM; one text, no copies in the page. */
const MHFE_PIM_HELP = optionHelp("What the PIM is", "PIM", [
  "The PIM multiplies the time of every encryption and recovery, yours included, by PIM + 1: PIM 1 doubles it. A recovery that takes four to seven minutes in this page at PIM 0 takes about 3 to 5 days at PIM 1023, or 21 to 43 hours in fast mode.",
  "Unticked means PIM 0, the default, which needs no note. A container made with another PIM opens only with that same PIM, and nothing in the container records it: write it down with the password. A forgotten PIM can only be found by trying the values one by one, each a full recovery.",
  "A stronger password protects more than a higher PIM: each extra random word multiplies an attacker's work by 7,776, a PIM only by a fixed factor.",
]);

/**
 * Silent Payments tab, checkbox and panel. The original wallet uses an empty prefix; the derived child wallet
 * uses CHILD_WALLET_ID_PREFIX, so both workspaces share one markup and one runtime (silent-payment-feature.ts).
 */
function silentPaymentMarkup(idPrefix) {
  return {
    tab: `<button type="button" id="${idPrefix}silent-payment-tab" class="protocol-tab primary-mode-tab" data-feature-tab="silent-payment" role="radio" aria-checked="false" aria-controls="${idPrefix}silent-payment-panel" tabindex="-1" hidden><span>Silent Payments</span><small>BIP352</small></button>`,
    toggle: `<div class="field-heading-row"><label class="feature-tab-toggle" for="${idPrefix}include-silent-payment">
        <input id="${idPrefix}include-silent-payment" type="checkbox" aria-controls="${idPrefix}silent-payment-tab">
        <span>Show Silent Payments · BIP352</span>
      </label>${SILENT_PAYMENT_HELP}</div>`,
    panel: `<section id="${idPrefix}silent-payment-panel" class="supplemental-derivation span-three" aria-labelledby="${idPrefix}silent-payment-title" hidden>
          <div class="supplemental-heading"><span class="step">SP</span><h3 id="${idPrefix}silent-payment-title">Bitcoin Silent Payments · BIP352</h3><span id="${idPrefix}silent-payment-secret-control-slot" class="result-secret-control-slot"></span></div>
          <p class="feature-intro">Optional BIP352 address you can give out once and reuse. Senders derive individual on-chain outputs from this reusable address. Discovering the unique outputs actually paid to this wallet requires scanning eligible transaction inputs and outputs; this offline file does not scan the blockchain.</p>
          <div class="form-grid">
          <div><label for="${idPrefix}silent-payment-network">Network</label><select id="${idPrefix}silent-payment-network"><option value="mainnet">Mainnet</option><option value="testnet">Testnet / Signet</option></select></div>
          <div><label for="${idPrefix}silent-payment-account">Account</label><input id="${idPrefix}silent-payment-account" type="number" min="0" value="0"></div>
          <div><label for="${idPrefix}silent-payment-labels">Receive labels <span class="optional">optional</span></label><input id="${idPrefix}silent-payment-labels" type="text" placeholder="e.g. 1, 2, 3" autocomplete="off"><p class="field-note">At most <span id="${idPrefix}silent-payment-label-limit"></span> comma-separated label entries from 1 upward, such as those you use to tell payers apart (“1 → Alice”, “2 → webshop”). Leave blank for just the base reusable address. Label <code>0</code> is reserved for change and is always shown separately below.</p></div>
          </div>
          <div class="actions"><button id="${idPrefix}derive-silent-payment" class="primary" type="button">Derive Silent Payment info</button></div>
          <div id="${idPrefix}silent-payment-error" class="error" role="alert" hidden></div>
          <div id="${idPrefix}silent-payment-result" class="silent-payment-result" hidden>
            <div class="key-card root-material-card silent-payment-addresses">
              <div class="root-card-kicker">REUSABLE ADDRESSES</div>
              <div class="row"><span class="row-label">Base address</span><code class="value" id="${idPrefix}silent-payment-address"></code></div>
              <div id="${idPrefix}silent-payment-labeled-list"></div>
            </div>
            <div class="silent-payment-reserved">
              <div class="reserved-label-heading">⚠ Reserved change label (m=0) · internal use only — do not publish</div>
              <p class="field-note">BIP352 reserves label <code>m=0</code> exclusively for this wallet's own change outputs. Do not hand this value to anyone as a receiving address.</p>
              <code class="value" id="${idPrefix}silent-payment-change-address"></code>
            </div>
            <div class="signer-context silent-payment-technical">
              <div><span>Scan key path</span><code id="${idPrefix}silent-payment-scan-path"></code></div>
              <div><span>Scan public key</span><code id="${idPrefix}silent-payment-scan-key"></code></div>
              <div><span>Spend key path</span><code id="${idPrefix}silent-payment-spend-path"></code></div>
              <div><span>Spend public key</span><code class="secret-value" id="${idPrefix}silent-payment-spend-key"></code></div>
            </div>
            <p class="field-note">The reusable addresses above (<code>sp1…</code>) are what you share to be paid. Scan/spend public keys are wallet components, not addresses: pasting either into a typical block explorer will not find this wallet's Silent Payment outputs or balance.</p>
            <p class="field-note">There is no fixed list of on-chain receive addresses to pre-generate. Each sender derives a unique Taproot output from a reusable address and their own transaction inputs; only a BIP352-aware scanner reading chain data can detect the resulting outputs and balance.</p>
          </div>
        </section>`,
  };
}

function bip85Markup(profile, derivationHelp) {
  // The derived child wallet offers Silent Payments with the same markup under its own ID prefix.
  // Child seeds are deliberately not offered there: a child of a child would nest without end.
  const childSilentPayment =
    profile.capabilities.bitcoinSilentPayments && profile.capabilities.bip85
      ? silentPaymentMarkup(CHILD_WALLET_ID_PREFIX)
      : { tab: "", toggle: "", panel: "" };
  const bip85Tab = !profile.capabilities.bip85
    ? ""
    : '<button type="button" id="bip85-tab" class="protocol-tab primary-mode-tab" data-feature-tab="bip85" role="radio" aria-checked="false" aria-controls="bip85-panel" tabindex="-1" hidden><span>Child seeds</span><small>BIP85</small></button>';
  const bip85Toggle = !profile.capabilities.bip85
    ? ""
    : `<div class="field-heading-row"><label class="feature-tab-toggle" for="include-bip85">
        <input id="include-bip85" type="checkbox" aria-controls="bip85-tab">
        <span>Show Child seeds · BIP85</span>
      </label>${BIP85_HELP}</div>`;
  const bip85Panel = !profile.capabilities.bip85
    ? ""
    : `<section class="supplemental-derivation span-three" id="bip85-panel" hidden>
        <div class="supplemental-heading"><span class="step">85</span><h3>Child seeds · BIP85</h3></div>
        <p class="feature-intro">First level: the original mnemonic and its BIP39 passphrase above form the parent seed; BIP85 derives the child mnemonic or secret from it. Changing either parent field or the BIP85 index changes this result.</p>
        <div class="form-grid">
          <div><label for="bip85-application">Application</label><select id="bip85-application"><option value="bip39">BIP39 mnemonic</option>${profile.id === "dash-community" ? '<option value="wif">WIF private key · Dash</option>' : '<option value="wif">WIF private key · Bitcoin / Dash</option>'}<option value="xprv">Root XPRV</option><option value="hex">Hex entropy</option></select></div>
          <div><label for="bip85-index">Index</label><input id="bip85-index" type="number" min="0" max="${MAX_BIP32_INDEX}" value="0"></div>
          <div id="bip85-words-field"><label for="bip85-words">Mnemonic words</label><select id="bip85-words">${BIP39_WORD_COUNTS.map((count) => `<option>${count}</option>`).join("")}</select></div>
          <div id="bip85-wif-field" hidden><label for="bip85-wif-encoding">WIF encoding</label><select id="bip85-wif-encoding">${bip85WifOptions(profile)}</select><p class="field-note">The BIP85 path and 32-byte private key stay the same; this choice changes only the network prefix of the WIF transport string.</p></div>
          <div id="bip85-bytes-field" hidden><label for="bip85-bytes">Entropy bytes</label><input id="bip85-bytes" type="number" min="${BIP85_HEX_BYTES.minimum}" max="${BIP85_HEX_BYTES.maximum}" value="${BIP85_HEX_BYTES.default}"></div>
        </div>
        <div class="actions"><button id="derive-bip85" class="primary" type="button">Derive child secret</button></div>
        <div id="bip85-error" class="error" role="alert" hidden></div>
        <div id="bip85-result" hidden>
          <div class="signer-context"><div><span>Application path</span><code id="bip85-path"></code></div></div>
          <div class="field-heading bip85-secret-heading"><label for="bip85-output">Derived secret</label><div class="section-head-actions"><details id="bip85-recovery-source-menu" class="recovery-source-menu" hidden><summary>Use in Recover &amp; Back Up</summary><div class="recovery-source-menu-items" aria-label="Recover and back up destination"><button type="button" data-recovery-source="bip85" data-recovery-target="matcher">Wallet Matcher</button><button type="button" data-recovery-source="bip85" data-recovery-target="seedqr">SeedQR</button><button type="button" data-recovery-source="bip85" data-recovery-target="mhfe">MHFE</button><button type="button" data-recovery-source="bip85" data-recovery-target="slip39">SLIP-39 shares</button><button type="button" data-recovery-source="bip85" data-recovery-target="sskr">Shamir shares (SSKR)</button><button type="button" data-recovery-source="bip85" data-recovery-target="gordian-envelope">Seed Envelope</button><button type="button" data-recovery-source="bip85" data-recovery-target="codex32">Codex32</button><button type="button" data-recovery-source="bip85" data-recovery-target="mnemocode">MnemoCode</button></div></details><button id="toggle-bip85-secret" class="secondary compact" type="button" aria-pressed="false">Show secret</button></div></div>
          <textarea id="bip85-output" class="secret-value concealed" rows="3" readonly></textarea>
          <p class="field-note">This result is a new wallet secret. Reveal it only when needed. For a BIP39 result, “Show derived wallet” creates a separate workspace below without replacing the original recovery phrase above.</p>
          <div class="actions"><button id="open-bip85-wallet" class="secondary" type="button" aria-expanded="false" hidden>Show derived wallet</button></div>
          <section id="bip85-wallet-workspace" class="nested-wallet-workspace" hidden>
            <div class="supplemental-heading"><span class="step">↳</span><h3>Derived wallet workspace</h3></div>
            <p class="feature-intro">Uses the child mnemonic above without replacing the original recovery phrase. All derivation stays in memory in this tab.</p>
            <div class="child-wallet-passphrase">
              <label for="bip85-child-passphrase">Child-wallet BIP39 passphrase <span class="optional">optional, case-sensitive</span></label>
              <div class="secret-input-wrap"><input id="bip85-child-passphrase" type="password" autocomplete="off" placeholder="Leave blank unless this child wallet uses one"><button id="toggle-bip85-child-passphrase" class="secondary compact" type="button" aria-pressed="false">Show</button></div>
              <p class="field-note">Second level: applied after the BIP85 child mnemonic is created. It does not change those words; it changes the child seed, addresses, and keys derived below.</p>
            </div>
            <div class="form-grid">
              <div class="span-two"><label for="bip85-wallet-coin">Coin</label><select id="bip85-wallet-coin"></select></div>
              <div id="bip85-wallet-network-field" class="nested-standard-content"><label for="bip85-wallet-network">Network</label><select id="bip85-wallet-network"></select></div>
              <div class="protocol-tabs-field span-three"><div class="field-heading-row"><label id="bip85-wallet-tabs-label">Derivation type</label>${derivationHelp}</div><div id="bip85-wallet-tabs" class="protocol-tabs primary-mode-tabs" role="radiogroup" aria-labelledby="bip85-wallet-tabs-label">${childSilentPayment.tab}</div></div>${childSilentPayment.toggle === "" ? "" : `<div class="feature-tab-options span-three">${childSilentPayment.toggle}</div>`}${childSilentPayment.panel}
              <div id="bip85-wallet-legacy-field" hidden><input id="bip85-wallet-legacy-toggle" type="checkbox" hidden></div>
              <div id="bip85-wallet-account-field" class="nested-standard-content"><label id="bip85-wallet-account-label" for="bip85-wallet-account">Account</label><input id="bip85-wallet-account" type="number" value="0" min="0" max="2147483647"></div>
              <div id="bip85-wallet-branch-field" class="nested-standard-content"><label id="bip85-wallet-branch-label" for="bip85-wallet-branch-input">Branch</label><input id="bip85-wallet-branch-input" type="number" value="0" min="0" max="2147483647"><select id="bip85-wallet-branch-select" hidden></select></div>
              <div class="nested-standard-content"><label id="bip85-wallet-start-label" for="bip85-wallet-start">Start index</label><input id="bip85-wallet-start" type="number" value="0" min="0" max="2147483647"></div>
              <div class="nested-standard-content"><label id="bip85-wallet-count-label" for="bip85-wallet-count">Number of results</label><input id="bip85-wallet-count" type="number" value="20" min="1" max="${EmbeddedDerivation.maximumRows}"></div>
              <div class="path-preview span-three nested-standard-content"><label>Standard derivation path · read-only</label><code id="bip85-wallet-path"></code></div>
              <div id="bip85-wallet-change-field" class="change-addresses-option span-three nested-standard-content" hidden><label for="bip85-wallet-include-change"><input id="bip85-wallet-include-change" type="checkbox"><span><strong>Also generate change addresses</strong><small id="bip85-wallet-change-help"></small></span></label></div>
              <div id="bip85-wallet-coinjoin-field" class="change-addresses-option span-three nested-standard-content" hidden><label for="bip85-wallet-include-coinjoin"><input id="bip85-wallet-include-coinjoin" type="checkbox"><span><strong>Show CoinJoin addresses</strong><small><code id="bip85-wallet-coinjoin-help"></code></small></span></label></div>
            </div>
            <div class="actions nested-standard-content"><button id="derive-bip85-wallet" class="primary" type="button">Derive child wallet addresses</button></div>
            <div id="bip85-wallet-error" class="error nested-standard-content" role="alert" hidden></div>
            <div id="bip85-wallet-status" class="status nested-standard-content" role="status" hidden></div>
            <section id="bip85-wallet-results" class="nested-standard-content" hidden>
              <div class="results-title nested-results-title">
                <span id="bip85-wallet-result-title">Child wallet results</span>
                <div class="result-controls">
                  <button class="danger-outline compact" id="bip85-wallet-toggle-secrets" type="button" aria-pressed="false">Show private keys</button>
                  <div class="mode-toggle"><button id="bip85-wallet-basic" class="active" type="button">Basic</button><button id="bip85-wallet-advanced" type="button">Advanced</button></div>
                </div>
              </div>
              <div id="bip85-wallet-branch-tabs" class="result-branch-tabs" hidden></div>
              <section class="panel bulk-panel nested-bulk-panel" aria-label="Child wallet selection and export">
                <div class="bulk-row bulk-toolbar-row">
                  <div class="bulk-format-control">
                    <div class="bulk-format-heading"><label for="bip85-wallet-export-format">Clipboard format</label><span class="selection-count"><span id="bip85-wallet-selected-count">0</span> selected</span></div>
                    <select id="bip85-wallet-export-format"><option value="structured">Human-readable structured text</option><option value="plain">Plain values</option><option value="tsv">TSV for spreadsheets</option></select>
                  </div>
                  <div class="mini-actions">
                    <div id="bip85-wallet-account-export" hidden><button class="secondary compact" id="bip85-wallet-open-account-export" type="button" aria-haspopup="dialog">Account export</button></div>
                    <button class="secondary compact" id="bip85-wallet-select-all" type="button">Select all</button>
                    <button class="secondary compact" id="bip85-wallet-select-none" type="button">Select none</button>
                    <button class="secondary compact" id="bip85-wallet-select-invert" type="button">Invert selection</button>
                  </div>
                </div>
                <div class="bulk-row export-row"><div class="bulk-actions">
                  <button class="secondary compact" data-bip85-bulk="addresses" type="button">Copy addresses</button>
                  <button class="secondary compact" data-bip85-bulk="publicKeys" type="button">Copy public keys</button>
                  <button class="secret-action compact" data-bip85-bulk="privateKeys" type="button">Copy private keys</button>
                  <button class="secret-action compact" data-bip85-bulk="selected" type="button">Copy selected</button>
                  <button class="secret-action compact" data-bip85-bulk="allDisplayed" type="button">Copy all displayed fields</button>
                  <button class="secondary compact" data-bip85-download="allDisplayed" type="button">Save selected</button>
                </div></div>
                <p class="field-note">Exports use selected child-wallet rows. Account export includes receive and change descriptors for this child account. Sensitive exports remain disabled until private keys are revealed.</p>
              </section>
              <dialog id="bip85-wallet-account-export-dialog" aria-labelledby="bip85-wallet-account-export-title">
                <div class="account-export-heading"><h3 id="bip85-wallet-account-export-title">Child wallet account export</h3><button class="secondary compact" id="bip85-wallet-close-account-export" type="button" aria-label="Close account export">Close</button></div>
                <p id="bip85-wallet-account-export-description"></p>
                <label for="bip85-wallet-account-export-format">Export format</label>
                <select id="bip85-wallet-account-export-format"><option value="core">Core wallet console command</option><option value="raw">Raw descriptors · Scanner / other wallets</option></select>
                <h4>Public descriptors</h4><p>Watch-only account data; cannot spend funds.</p>
                <div class="watch-only-actions"><button class="secondary" data-bip85-descriptor="publicCopy" type="button">Copy public descriptors</button><button class="secondary" data-bip85-descriptor="publicDownload" type="button">Save public descriptors</button></div>
                <h4>Private descriptors</h4><p>Unencrypted keys allow spending. Show private keys before export.</p>
                <div class="watch-only-actions"><button class="secondary" data-bip85-descriptor="privateCopy" type="button">Copy private descriptors</button><button class="secondary" data-bip85-descriptor="privateDownload" type="button">Save private descriptors</button></div>
              </dialog>
              <div id="bip85-wallet-summary"></div>
              <div id="bip85-wallet-notices"></div>
              <div id="bip85-wallet-list"></div>
            </section>
          </section>
        </div>
      </section>`;
  return { bip85Tab, bip85Toggle, bip85Panel };
}

function secondaryToolMarkup(profile, footer) {
  const psbtBuilderWrapperOptions = !profile.capabilities.advancedPsbt
    ? '<option value="p2sh">Legacy P2SH</option>'
    : '<option value="p2wsh">Native P2WSH</option><option value="p2sh">Legacy P2SH</option><option value="p2tr">Taproot P2TR · Tapscript policy</option><option value="p2tr-musig2">Taproot P2TR · MuSig2 key path</option>';
  const psbtWrapperHelp = optionHelp(
    "What the output wrapper does",
    "Output wrapper",
    !profile.capabilities.advancedPsbt
      ? [
          "Dash policies use Legacy P2SH: the address commits to the HASH160 of the policy's script, and the script may be at most 520 bytes, about 15 keys in plain multisig.",
        ]
      : [
          "How the policy's script becomes an address. Native P2WSH (bc1q…) commits to the script's SHA-256 and is the usual choice for multisig. Legacy P2SH (3…) commits to its HASH160 and limits the script to 520 bytes, about 15 keys in plain multisig.",
          "Taproot P2TR · Tapscript puts the policy in one script leaf behind an unspendable key, so only that script can spend. Taproot P2TR · MuSig2 is one aggregate key that all participants sign together: it has no script, so it is N-of-N only, without a timelock, and every signer must support MuSig2.",
        ],
  );
  const psbtRangedKeysHelp = optionHelp("What a ranged descriptor key is", "Ranged keys", [
    "A key given as a descriptor with <code>&lt;0;1&gt;</code> and <code>*</code> stands for many keys. These fields pick the ones used for the address shown: the first or second multipath branch, usually receive or change, and the index that replaces <code>*</code>.",
    !profile.capabilities.advancedPsbt
      ? "The P2SH address is exported as a <code>raw()</code> descriptor of this one address: keep the ranged keys to make the others."
      : "With P2WSH or Taproot the descriptor shown keeps the whole range. A P2SH address is exported as a <code>raw()</code> descriptor of this one address: keep the ranged keys to make the others.",
  ]);
  const psbtScriptRoleHelp = optionHelp(
    "What the two kinds of script are",
    "What the script is",
    !profile.capabilities.advancedPsbt
      ? [
          "Redeem script: the script that a spender reveals, such as a multisig script. The page also shows the P2SH address that commits to it.",
          "scriptPubKey: the locking script of an output itself, as a block explorer shows it, such as <code>a914…87</code>. It is decoded as it stands.",
        ]
      : [
          "Redeem / witness script: the script that a spender reveals, such as a multisig script. The page also shows the P2SH address that commits to it and, for Bitcoin, the P2WSH address.",
          "scriptPubKey: the locking script of an output itself, as a block explorer shows it, such as <code>0020…</code> or <code>a914…87</code>. It is decoded as it stands.",
        ],
  );
  const psbtWalletWrapperOptions = !profile.capabilities.advancedPsbt
    ? '<option value="p2sh">Legacy P2SH</option>'
    : '<option value="p2sh">Legacy P2SH</option><option value="p2wsh">Bitcoin Native P2WSH</option>';
  const psbtCapabilities = !profile.capabilities.advancedPsbt
    ? '<div><span class="capability-check">✓</span><span>Dash Core PSBT v0</span></div>'
    : '<div><span class="capability-check">✓</span><span>Bitcoin PSBT v0 / v2</span></div><div><span class="capability-check">✓</span><span>Dash Core PSBT v0</span></div>';
  const psbtProtocolScope = !profile.capabilities.advancedPsbt
    ? "Dash Core BIP-174-compatible PSBT v0 inspection; legacy Script and descriptor decoding; P2SH multisig, hashlock, and CLTV/CSV recovery-policy construction; deterministic watch-only P2SH multisig construction. SegWit, Taproot, Schnorr, and MuSig2 are excluded."
    : "Bitcoin BIP-174/BIP-370/BIP-371/BIP-373 field inspection; Dash Core BIP-174-compatible v0 inspection; Script and descriptor decoding; P2SH/P2WSH multisig, hashlock, Taproot/MuSig2 inspection, and CLTV/CSV recovery-policy construction; deterministic watch-only multisig construction.";
  const psbtDescriptorScope = !profile.capabilities.advancedPsbt
    ? '<p class="field-note"><strong>Dash descriptor coverage:</strong> legacy <code>pk()</code>, <code>pkh()</code>, <code>sh()</code>, <code>multi()</code>, <code>sortedmulti()</code>, <code>addr()</code>, <code>raw()</code>, and supported legacy Miniscript/hashlock/timelock fragments, with BitcoinerLab Miniscript safety analysis. SegWit, Taproot, Schnorr, MuSig2, and their PSBT fields are rejected.</p>'
    : '<p class="field-note"><strong>Bitcoin descriptor coverage:</strong> common wallet descriptors, Taproot/MuSig2, and Miniscript hashlock/timelock trees receive BitcoinerLab Miniscript safety analysis. Arbitrary descriptor address expansion and private-key descriptors remain unsupported.</p>';
  const psbtMusigScope = !profile.capabilities.advancedPsbt
    ? ""
    : '<p class="field-note"><strong>MuSig2 scope:</strong> the BIP-390 descriptor spelling is <code>musig(...)</code>, but it represents the modern BIP-327 MuSig2 protocol—not legacy MuSig1. Pinned public-key routines from <code>@scure/btc-signer</code> calculate and cross-check KeySort/KeyAgg, Taproot outputs, and BIP-328 aggregate-key derivation; the PSBT inspector structurally recognizes BIP-373 fields. The dependency package name contains “Signer”, but this utility does not expose transaction signing, secret nonces, or interactive partial-signature rounds.</p>';
  const psbtDependencyScope = !profile.capabilities.advancedPsbt
    ? "BitcoinerLab Miniscript 2.0.0, Noble Curves/Hashes 2.4.0, and Scure Base/BIP32 2.4.0 — MIT; bip68 1.0.4 — ISC."
    : "BitcoinerLab Miniscript 2.0.0, Scure BTC Signer 2.4.1, Noble Curves/Hashes 2.4.0, and Scure Base/BIP32 2.4.0 — MIT; bip68 1.0.4 — ISC.";
  const psbtDecoderIntroduction = !profile.capabilities.advancedPsbt
    ? "Inspect raw Dash Script hex or a supported legacy Dash output descriptor/Miniscript."
    : "Inspect raw Script hex or a Bitcoin output descriptor/Miniscript exported by wallets such as Nunchuk.";
  const activityTrustItems =
    profile.id === "dash-community"
      ? "<span>Proof-verified Platform DAPI</span><span>Local Orchard note recovery</span><span>Public Dash L1 history</span>"
      : "<span>Validated public inputs</span><span>Bounded provider requests</span><span>Local sensitive-key processing</span>";
  const activityCapabilityCard =
    profile.id === "dash-community"
      ? '<aside class="viewer-capability-card" aria-label="Viewer capabilities"><div class="capability-orbit" aria-hidden="true"><span></span></div><div class="capability-kicker">DASH RESOURCE TYPES</div><h2>Verify with confidence</h2><div class="capability-list"><div><span class="capability-check">✓</span><span>Core address activity</span></div><div><span class="capability-check">✓</span><span>Platform and Identity state</span></div><div><span class="capability-check">✓</span><span>Local Orchard note recovery</span></div><div class="capability-safe"><span>✓</span><span>Read-only by design</span></div></div></aside>'
      : '<aside class="viewer-capability-card" aria-label="Viewer capabilities"><div class="capability-orbit" aria-hidden="true"><span></span></div><div class="capability-kicker">SUPPORTED PUBLIC WORKFLOWS</div><h2>Inspect with confidence</h2><div class="capability-list"><div><span class="capability-check">✓</span><span>Bitcoin address history</span></div><div><span class="capability-check">✓</span><span>Ethereum account activity</span></div><div><span class="capability-check">✓</span><span>Dash Core, Platform, Identity and Orchard</span></div><div class="capability-safe"><span>✓</span><span>Read-only by design</span></div></div></aside>';
  const activityRuntimeDescription =
    profile.id === "dash-community"
      ? "Dash Core, Platform, Identity and Orchard reads · Orchard processing local · Blob Worker check pending"
      : "Selected-coin public reads · local sensitive-key processing where required · Blob Worker check pending";
  const activityFooterProtocols =
    profile.id === "dash-community"
      ? "Dash Evo SDK 5.0.3 · proof-verified DAPI queries · Dash Orchard dashified-0.14.1 · DashScan Core API · Dash Platform Explorer"
      : "Bitcoin public history · Ethereum account activity · Dash Evo SDK 5.0.3 · Dash Orchard dashified-0.14.1 · DashScan Core API · Dash Platform Explorer";
  const psbtScriptPlaceholder = !profile.capabilities.advancedPsbt
    ? "522102...53ae or sh(sortedmulti(...))#checksum"
    : "522102...53ae or tr(xpub.../0/*,{multi_a(...)})#checksum";
  const psbtPolicyScope = !profile.capabilities.advancedPsbt
    ? '<p class="field-note"><strong>Policy scope:</strong> Dash P2SH policies use legacy Script operations supported by Dash Core. Standard multisig is broadly interoperable; CLTV/CSV/hashlock branches require a separately tested custom signer and recovery procedure.</p>'
    : '<p class="field-note"><strong>Policy scope:</strong> advanced script shapes are Bitcoin-Script style policies. Dash L1 supports standard P2SH multisig and common CLTV/CSV script opcodes, but wallet auto-signing/recovery support is not guaranteed for custom branches. Hashlock/preimage scripts are contract-style policies, not normal multisig wallet recovery; OP_RETURN outputs are not spendable wallet outputs.</p>';
  const psbtNunchukScope = !profile.capabilities.advancedPsbt
    ? ""
    : '<p class="field-note"><strong>Nunchuk-style templates:</strong> HODL/Zen HODL maps to M-of-N after a lock. Named presets cover common flexible, decaying, expanding, and staged recovery shapes. Use Custom Bitcoin Miniscript for another exact policy tree, then independently confirm wallet-specific descriptor and signing support before funding.</p>';
  const psbtCustomMiniscriptOption = !profile.capabilities.advancedPsbt
    ? ""
    : '<option value="custom-miniscript">Custom Bitcoin Miniscript · P2WSH or Tapscript</option>';
  const psbtVerifyAddressPlaceholder = !profile.capabilities.advancedPsbt
    ? "Dash address"
    : "Bitcoin or Dash address";
  const psbtVerifySignaturePlaceholder = !profile.capabilities.advancedPsbt
    ? "Base64 Dash Core compact signature"
    : "Base64 signature, prefixed with smp, ful, or pof when applicable";
  const psbtMessageVerifyScope = !profile.capabilities.advancedPsbt
    ? "<strong>Dash:</strong> Dash Core compact P2PKH signatures are checked with the protocol-compatible Dash signed-message domain."
    : "<strong>Bitcoin:</strong> BIP-322 legacy, simple, full, and proof-of-funds formats are checked by the pinned btcutil verifier and Bitcoin Script engine. Unprefixed pre-finalization simple signatures remain accepted for compatibility. <strong>Dash:</strong> Dash Core compact P2PKH signatures are checked with the protocol-compatible Dash signed-message domain.";
  const psbtFooterProtocols = footer.render("psbt-inspector");
  const psbtChainScope = profile.capabilities.advancedPsbt ? " · BITCOIN &amp; DASH" : "";
  return {
    psbtBuilderWrapperOptions,
    psbtWrapperHelp,
    psbtRangedKeysHelp,
    psbtScriptRoleHelp,
    psbtWalletWrapperOptions,
    psbtCapabilities,
    psbtProtocolScope,
    psbtDescriptorScope,
    psbtMusigScope,
    psbtDependencyScope,
    psbtDecoderIntroduction,
    activityTrustItems,
    activityCapabilityCard,
    activityRuntimeDescription,
    activityFooterProtocols,
    psbtScriptPlaceholder,
    psbtPolicyScope,
    psbtNunchukScope,
    psbtCustomMiniscriptOption,
    psbtVerifyAddressPlaceholder,
    psbtVerifySignaturePlaceholder,
    psbtMessageVerifyScope,
    psbtFooterProtocols,
    psbtChainScope,
  };
}

/** Expands edition-specific markup without changing the source template. */
export class ProfileTemplate {
  static render(template, profile, tool, selection) {
    template = new MnemoCodeWalletTemplate().expand(template);
    const footer = new ToolProtocolFooter(profile, selection);
    const dashBrandMark =
      profile.id === "dash-community"
        ? '<span class="dash-header-brand"><span class="dash-header-mark" aria-hidden="true"><svg viewBox="0 0 943 943"><circle cx="471.5" cy="471.5" r="471"/><path d="M572.3 207.7H335.6L316 317.3l213.6.3c105.2 0 136.3 38.2 135.4 101.5-.5 32.5-14.5 87.4-20.6 105.2-16.2 47.4-49.5 101.6-174.3 101.4l-207.6-.1-19.7 109.7h236.1c83.3 0 118.7-9.7 156.2-27 83.2-38.4 132.7-120.5 152.5-227.6 29.5-159.5-7.3-273-215.3-273"/><path d="M233.5 416.5c-62 0-70.9 40.4-76.7 64.8-7.7 32-10.2 44.9-10.2 44.9h242.3c62 0 70.9-40.4 76.7-64.8 7.7-32 10.2-44.9 10.2-44.9Z"/></svg></span><span>Dash Community Edition</span></span>'
        : '<span class="profile-header-brand">Multi-Chain Wallet Tools</span>';
    const profileBrandMark =
      profile.id === "dash-community"
        ? '<span class="profile-brand-mark" aria-hidden="true"><svg viewBox="0 0 943 943"><circle fill="#008de4" cx="471.5" cy="471.5" r="471"/><path fill="#fff" d="M572.3 207.7H335.6L316 317.3l213.6.3c105.2 0 136.3 38.2 135.4 101.5-.5 32.5-14.5 87.4-20.6 105.2-16.2 47.4-49.5 101.6-174.3 101.4l-207.6-.1-19.7 109.7h236.1c83.3 0 118.7-9.7 156.2-27 83.2-38.4 132.7-120.5 152.5-227.6 29.5-159.5-7.3-273-215.3-273"/><path fill="#fff" d="M233.5 416.5c-62 0-70.9 40.4-76.7 64.8-7.7 32-10.2 44.9-10.2 44.9h242.3c62 0 70.9-40.4 76.7-64.8 7.7-32 10.2-44.9 10.2-44.9Z"/></svg></span>'
        : "";
    const recoveryCoinField =
      profile.id === "dash-community"
        ? ""
        : '<div><label for="recovery-coin">Coin</label><select id="recovery-coin"></select></div>';
    const recoveryPublicKeyPlaceholder =
      profile.id === "dash-community"
        ? "Paste a public key, account xpub, or Dash Orchard viewing key. One key per line."
        : "Paste a public key, account xpub, descriptor, or Dash Orchard viewing key. One key per line.";
    const recoveryPublicKeyScope =
      profile.id === "dash-community"
        ? "<strong>Limited search scope.</strong> Public keys only cover their own account, branch or reachable address formats; other hardened accounts are excluded. For the broadest search across supported Dash wallet schemes, use your seed phrase and original BIP39 passphrase, if any."
        : "<strong>Limited search scope.</strong> Public keys only cover their own account, branch or reachable address formats; other hardened accounts are excluded. For the broadest search across supported wallet schemes, use your seed phrase and original BIP39 passphrase, if any. Trying different formats for one xpub does not search the separate Legacy, SegWit and Taproot accounts.";
    const activityCoinControl =
      profile.id === "dash-community"
        ? ""
        : '<div class="viewer-coin-field"><label for="viewer-coin">Coin</label><select id="viewer-coin"><option value="bitcoin" selected>Bitcoin</option><option value="ethereum">Ethereum</option><option value="dash">Dash</option></select><p class="field-note">Choose the coin before entering a public lookup.</p></div>';
    const psbtChainOptions =
      profile.id === "dash-community"
        ? '<option value="dash">Dash Core</option>'
        : '<option value="bitcoin">Bitcoin</option><option value="dash">Dash Core</option>';
    const signerFormatField = profile.capabilities.bitcoinMessageSigning
      ? `<div id="message-signer-format-field" hidden>
          <label for="message-signer-format-select">Signature format</label>
          <select id="message-signer-format-select">
            <option value="bitcoin-bip322-legacy">BIP-322 full · recommended</option>
            <option value="bitcoin-compact">Legacy compact · BIP137 compatibility</option>
          </select>
          <p class="field-note">BIP-322 is the current general-purpose Bitcoin message-signing standard. Use compact BIP137 only for software that does not support BIP-322.</p>
        </div>`
      : "";
    const psbtNetworkOptions =
      profile.id === "dash-community"
        ? '<option value="mainnet">Mainnet</option><option value="testnet">Testnet</option>'
        : '<option value="mainnet">Mainnet</option><option value="testnet">Testnet / Signet</option><option value="regtest">Regtest</option>';
    const silentPayment = profile.capabilities.bitcoinSilentPayments
      ? silentPaymentMarkup("")
      : { tab: "", toggle: "", panel: "" };
    const silentPaymentTab = silentPayment.tab;
    const silentPaymentToggle = silentPayment.toggle;
    const silentPaymentPanel = silentPayment.panel;
    const derivationHelp = derivationTypeHelp(selectedCoins(profile, selection));
    const { bip85Tab, bip85Toggle, bip85Panel } = bip85Markup(profile, derivationHelp);
    const secondaryMarkup = secondaryToolMarkup(profile, footer);
    const replacements = {
      __DOCUMENT_TITLE__: tool.documentTitle,
      __EDITION_NAME__: profile.editionName,
      __BUILD_PROFILE__: profile.id,
      __BRAND_NAME__: profile.brandName,
      __EDITION_EYEBROW__: tool.eyebrow,
      __KEY_DERIVATION_INTRODUCTION__: tool.introduction,
      __KEY_DERIVATION_FOOTER_PROTOCOLS__: footer.render("key-derivation"),
      __DISCOVERY_FOOTER_PROTOCOLS__: footer.render("discovery-scanner"),
      __KEY_DERIVATION_SIGNER_FORMAT_FIELD__: signerFormatField,
      __DASH_HEADER_BRAND__: dashBrandMark,
      __PROFILE_BRAND_MARK__: profileBrandMark,
      __RECOVERY_COIN_FIELD__: recoveryCoinField,
      __RECOVERY_PUBLIC_KEY_PLACEHOLDER__: recoveryPublicKeyPlaceholder,
      __RECOVERY_PUBLIC_KEY_SCOPE__: recoveryPublicKeyScope,
      __ACTIVITY_COIN_CONTROL__: activityCoinControl,
      __ACTIVITY_TRUST_ITEMS__: secondaryMarkup.activityTrustItems,
      __ACTIVITY_CAPABILITY_CARD__: secondaryMarkup.activityCapabilityCard,
      __ACTIVITY_RUNTIME_DESCRIPTION__: secondaryMarkup.activityRuntimeDescription,
      __ACTIVITY_FOOTER_PROTOCOLS__: secondaryMarkup.activityFooterProtocols,
      __TOOL_INTRODUCTION__: tool.introduction,
      __PSBT_CHAIN_OPTIONS__: psbtChainOptions,
      __PSBT_NETWORK_OPTIONS__: psbtNetworkOptions,
      __SILENT_PAYMENT_TAB__: silentPaymentTab,
      __SILENT_PAYMENT_TOGGLE__: silentPaymentToggle,
      __SILENT_PAYMENT_PANEL__: silentPaymentPanel,
      __MHFE_PIM_HELP__: MHFE_PIM_HELP,
      __DERIVATION_TYPE_HELP__: derivationHelp,
      __BIP85_TAB__: bip85Tab,
      __BIP85_TOGGLE__: bip85Toggle,
      __BIP85_PANEL__: bip85Panel,
      __PSBT_BUILDER_WRAPPER_OPTIONS__: secondaryMarkup.psbtBuilderWrapperOptions,
      __PSBT_WRAPPER_HELP__: secondaryMarkup.psbtWrapperHelp,
      __PSBT_RANGED_KEYS_HELP__: secondaryMarkup.psbtRangedKeysHelp,
      __PSBT_SCRIPT_ROLE_HELP__: secondaryMarkup.psbtScriptRoleHelp,
      __PSBT_WALLET_WRAPPER_OPTIONS__: secondaryMarkup.psbtWalletWrapperOptions,
      __PSBT_CAPABILITIES__: secondaryMarkup.psbtCapabilities,
      __PSBT_PROTOCOL_SCOPE__: secondaryMarkup.psbtProtocolScope,
      __PSBT_DESCRIPTOR_SCOPE__: secondaryMarkup.psbtDescriptorScope,
      __PSBT_MUSIG_SCOPE__: secondaryMarkup.psbtMusigScope,
      __PSBT_DEPENDENCY_SCOPE__: secondaryMarkup.psbtDependencyScope,
      __PSBT_DECODER_INTRODUCTION__: secondaryMarkup.psbtDecoderIntroduction,
      __PSBT_SCRIPT_PLACEHOLDER__: secondaryMarkup.psbtScriptPlaceholder,
      __PSBT_POLICY_SCOPE__: secondaryMarkup.psbtPolicyScope,
      __PSBT_NUNCHUK_SCOPE__: secondaryMarkup.psbtNunchukScope,
      __PSBT_CUSTOM_MINISCRIPT_OPTION__: secondaryMarkup.psbtCustomMiniscriptOption,
      __PSBT_VERIFY_ADDRESS_PLACEHOLDER__: secondaryMarkup.psbtVerifyAddressPlaceholder,
      __PSBT_VERIFY_SIGNATURE_PLACEHOLDER__: secondaryMarkup.psbtVerifySignaturePlaceholder,
      __PSBT_MESSAGE_VERIFY_SCOPE__: secondaryMarkup.psbtMessageVerifyScope,
      __PSBT_FOOTER_PROTOCOLS__: secondaryMarkup.psbtFooterProtocols,
      __PSBT_CHAIN_SCOPE__: secondaryMarkup.psbtChainScope,
    };
    let rendered = template;
    for (const [marker, value] of Object.entries(replacements)) {
      if (value !== undefined) rendered = rendered.replaceAll(marker, value);
    }
    const remaining = rendered.match(
      /__(?:DOCUMENT_TITLE|EDITION_NAME|BUILD_PROFILE|BRAND_NAME|EDITION_EYEBROW|KEY_DERIVATION_[A-Z_]+|DISCOVERY_[A-Z_]+|DASH_HEADER_BRAND|PROFILE_BRAND_MARK|RECOVERY_COIN_FIELD|RECOVERY_PUBLIC_KEY_PLACEHOLDER|RECOVERY_PUBLIC_KEY_SCOPE|ACTIVITY_[A-Z_]+|TOOL_INTRODUCTION|PSBT_[A-Z_]+)__/gu,
    );
    if (remaining !== null)
      throw new Error(`Unexpanded build-profile marker: ${remaining.join(", ")}`);
    return rendered;
  }
}

/** Compatibility entry for the existing tool builders. */
export const applyProfileTemplate = ProfileTemplate.render.bind(ProfileTemplate);
