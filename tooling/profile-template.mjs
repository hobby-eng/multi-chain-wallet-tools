export function applyProfileTemplate(template, profile, tool) {
  const dashBrandMark =
    profile.id === 'dash-community'
      ? '<span class="dash-header-brand"><span class="dash-header-mark" aria-hidden="true"><svg viewBox="0 0 943 943"><circle cx="471.5" cy="471.5" r="471"/><path d="M572.3 207.7H335.6L316 317.3l213.6.3c105.2 0 136.3 38.2 135.4 101.5-.5 32.5-14.5 87.4-20.6 105.2-16.2 47.4-49.5 101.6-174.3 101.4l-207.6-.1-19.7 109.7h236.1c83.3 0 118.7-9.7 156.2-27 83.2-38.4 132.7-120.5 152.5-227.6 29.5-159.5-7.3-273-215.3-273"/><path d="M233.5 416.5c-62 0-70.9 40.4-76.7 64.8-7.7 32-10.2 44.9-10.2 44.9h242.3c62 0 70.9-40.4 76.7-64.8 7.7-32 10.2-44.9 10.2-44.9Z"/></svg></span><span>Dash Community Edition</span></span>'
      : '<span class="profile-header-brand">Multi-Chain Wallet Tools</span>';
  const profileBrandMark =
    profile.id === 'dash-community'
      ? '<span class="profile-brand-mark" aria-hidden="true"><svg viewBox="0 0 943 943"><circle fill="#008de4" cx="471.5" cy="471.5" r="471"/><path fill="#fff" d="M572.3 207.7H335.6L316 317.3l213.6.3c105.2 0 136.3 38.2 135.4 101.5-.5 32.5-14.5 87.4-20.6 105.2-16.2 47.4-49.5 101.6-174.3 101.4l-207.6-.1-19.7 109.7h236.1c83.3 0 118.7-9.7 156.2-27 83.2-38.4 132.7-120.5 152.5-227.6 29.5-159.5-7.3-273-215.3-273"/><path fill="#fff" d="M233.5 416.5c-62 0-70.9 40.4-76.7 64.8-7.7 32-10.2 44.9-10.2 44.9h242.3c62 0 70.9-40.4 76.7-64.8 7.7-32 10.2-44.9 10.2-44.9Z"/></svg></span>'
      : '';
  const recoveryCoinField =
    profile.id === 'dash-community'
      ? ''
      : '<div><label for="recovery-coin">Coin</label><select id="recovery-coin"></select></div>';
  const recoveryPublicKeyPlaceholder =
    profile.id === 'dash-community'
      ? 'Paste a public key, account xpub, or Dash Orchard viewing key. One key per line.'
      : 'Paste a public key, account xpub, descriptor, or Dash Orchard viewing key. One key per line.';
  const recoveryPublicKeyScope =
    profile.id === 'dash-community'
      ? '<strong>Limited search scope.</strong> Public keys only cover their own account, branch or reachable address formats; other hardened accounts are excluded. For the broadest search across supported Dash wallet schemes, use your seed phrase and original BIP39 passphrase, if any.'
      : '<strong>Limited search scope.</strong> Public keys only cover their own account, branch or reachable address formats; other hardened accounts are excluded. For the broadest search across supported wallet schemes, use your seed phrase and original BIP39 passphrase, if any. Trying different formats for one xpub does not search the separate Legacy, SegWit and Taproot accounts.';
  const activityCoinControl =
    profile.id === 'dash-community'
      ? ''
      : '<div class="viewer-coin-field"><label for="viewer-coin">Coin</label><select id="viewer-coin"><option value="bitcoin" selected>Bitcoin</option><option value="ethereum">Ethereum</option><option value="dash">Dash</option></select><p class="field-note">Choose the coin before entering a public lookup.</p></div>';
  const psbtChainOptions =
    profile.id === 'dash-community'
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
    : '';
  const psbtNetworkOptions =
    profile.id === 'dash-community'
      ? '<option value="mainnet">Mainnet</option><option value="testnet">Testnet</option>'
      : '<option value="mainnet">Mainnet</option><option value="testnet">Testnet / Signet</option><option value="regtest">Regtest</option>';
  const silentPaymentTab = !profile.capabilities.bitcoinSilentPayments
    ? ''
    : '<button type="button" id="silent-payment-tab" class="protocol-tab primary-mode-tab" data-feature-tab="silent-payment" role="radio" aria-checked="false" aria-controls="silent-payment-panel" tabindex="-1" hidden><span>Silent Payments</span><small>BIP352</small></button>';
  const silentPaymentToggle = !profile.capabilities.bitcoinSilentPayments
    ? ''
    : `<label class="feature-tab-toggle" for="include-silent-payment" title="Give out one reusable address while each payment lands on a separate, unlinkable on-chain output.">
        <input id="include-silent-payment" type="checkbox" aria-controls="silent-payment-tab">
        <span>Show Silent Payments · BIP352</span>
      </label>`;
  const silentPaymentPanel = !profile.capabilities.bitcoinSilentPayments
    ? ''
    : `<section id="silent-payment-panel" class="supplemental-derivation span-three" aria-labelledby="silent-payment-title" hidden>
          <div class="supplemental-heading"><span class="step">SP</span><h3 id="silent-payment-title">Bitcoin Silent Payments · BIP352</h3><span id="silent-payment-secret-control-slot" class="result-secret-control-slot"></span></div>
          <p class="feature-intro">Optional BIP352 address you can give out once and reuse. Everyone pays the same address, but each payment still lands on its own private, unlinkable output on-chain — nobody can tell they came from the same address. Discovering the unique outputs actually paid to this wallet requires scanning eligible transaction inputs and outputs; this offline file does not scan the blockchain.</p>
          <div class="form-grid">
          <div><label for="silent-payment-network">Network</label><select id="silent-payment-network"><option value="mainnet">Mainnet</option><option value="testnet">Testnet / Signet</option></select></div>
          <div><label for="silent-payment-account">Account</label><input id="silent-payment-account" type="number" min="0" max="2147483647" value="0"></div>
          <div><label for="silent-payment-labels">Receive labels <span class="optional">optional</span></label><input id="silent-payment-labels" type="text" placeholder="e.g. 1, 2, 3" autocomplete="off"><p class="field-note">Comma-separated label numbers from 1 upward, such as those you use to tell payers apart (“1 → Alice”, “2 → webshop”). Leave blank for just the base reusable address. Label <code>0</code> is reserved for change and is always shown separately below.</p></div>
          </div>
          <div class="actions"><button id="derive-silent-payment" class="primary" type="button">Derive Silent Payment info</button></div>
          <div id="silent-payment-error" class="error" role="alert" hidden></div>
          <div id="silent-payment-result" hidden>
            <div class="key-card root-material-card silent-payment-addresses">
              <div class="root-card-kicker">REUSABLE ADDRESSES</div>
              <div class="row"><span class="row-label">Base address</span><code class="value" id="silent-payment-address"></code></div>
              <div id="silent-payment-labeled-list"></div>
            </div>
            <div class="silent-payment-reserved">
              <div class="reserved-label-heading">⚠ Reserved change label (m=0) · internal use only — do not publish</div>
              <p class="field-note">BIP352 reserves label <code>m=0</code> exclusively for this wallet's own change outputs. Do not hand this value to anyone as a receiving address.</p>
              <code class="value" id="silent-payment-change-address"></code>
            </div>
            <div class="signer-context silent-payment-technical">
              <div><span>Scan key path</span><code id="silent-payment-scan-path"></code></div>
              <div><span>Scan public key</span><code id="silent-payment-scan-key"></code></div>
              <div><span>Spend key path</span><code id="silent-payment-spend-path"></code></div>
              <div><span>Spend public key</span><code class="secret-value" id="silent-payment-spend-key"></code></div>
            </div>
            <p class="field-note">The reusable addresses above (<code>sp1…</code>) are what you share to be paid. Scan/spend public keys are wallet components, not addresses: pasting either into a typical block explorer will not find this wallet's Silent Payment outputs or balance.</p>
            <p class="field-note">There is no fixed list of on-chain receive addresses to pre-generate. Each sender derives a unique Taproot output from a reusable address and their own transaction inputs; only a BIP352-aware scanner reading chain data can detect the resulting outputs and balance.</p>
          </div>
        </section>`;
  const bip85Tab = !profile.capabilities.bip85
    ? ''
    : '<button type="button" id="bip85-tab" class="protocol-tab primary-mode-tab" data-feature-tab="bip85" role="radio" aria-checked="false" aria-controls="bip85-panel" tabindex="-1" hidden><span>Child seeds</span><small>BIP85</small></button>';
  const bip85Toggle = !profile.capabilities.bip85
    ? ''
    : `<label class="feature-tab-toggle" for="include-bip85" title="Derive independent child seeds and application secrets from this wallet.">
        <input id="include-bip85" type="checkbox" aria-controls="bip85-tab">
        <span>Show Child seeds · BIP85</span>
      </label>`;
  const bip85Panel = !profile.capabilities.bip85
    ? ''
    : `<section class="supplemental-derivation span-three" id="bip85-panel" hidden>
        <div class="supplemental-heading"><span class="step">85</span><h3>Child seeds · BIP85</h3></div>
        <p class="feature-intro">First level: the original mnemonic and its BIP39 passphrase above form the parent seed; BIP85 derives the child mnemonic or secret from it. Changing either parent field or the BIP85 index changes this result.</p>
        <div class="form-grid">
          <div><label for="bip85-application">Application</label><select id="bip85-application"><option value="bip39">BIP39 mnemonic</option>${profile.id === 'dash-community' ? '<option value="wif">WIF private key · Dash</option>' : '<option value="wif">WIF private key · Bitcoin / Dash</option>'}<option value="xprv">Root XPRV</option><option value="hex">Hex entropy</option></select></div>
          <div><label for="bip85-index">Index</label><input id="bip85-index" type="number" min="0" max="2147483647" value="0"></div>
          <div id="bip85-words-field"><label for="bip85-words">Mnemonic words</label><select id="bip85-words"><option>12</option><option>15</option><option>18</option><option>21</option><option>24</option></select></div>
          <div id="bip85-wif-field" hidden><label for="bip85-wif-encoding">WIF encoding</label><select id="bip85-wif-encoding">${profile.id === 'dash-community' ? '<option data-coin="dash" value="204">Dash mainnet · 0xCC</option><option data-coin="dash" value="239">Dash testnet · 0xEF</option>' : '<option data-coin="bitcoin" value="128">Bitcoin mainnet · 0x80</option><option data-coin="bitcoin" value="239">Bitcoin testnet · 0xEF</option><option data-coin="dash" value="204">Dash mainnet · 0xCC</option><option data-coin="dash" value="239">Dash testnet · 0xEF</option>'}</select><p class="field-note">The BIP85 path and 32-byte private key stay the same; this choice changes only the network prefix of the WIF transport string.</p></div>
          <div id="bip85-bytes-field" hidden><label for="bip85-bytes">Entropy bytes</label><input id="bip85-bytes" type="number" min="16" max="64" value="32"></div>
        </div>
        <div class="actions"><button id="derive-bip85" class="primary" type="button">Derive child secret</button></div>
        <div id="bip85-error" class="error" role="alert" hidden></div>
        <div id="bip85-result" hidden>
          <div class="signer-context"><div><span>Application path</span><code id="bip85-path"></code></div></div>
          <div class="field-heading bip85-secret-heading"><label for="bip85-output">Derived secret</label><div class="section-head-actions"><details id="bip85-recovery-source-menu" class="recovery-source-menu" hidden><summary>Use in Recover &amp; Back Up</summary><div class="recovery-source-menu-items" aria-label="Recover and back up destination"><button type="button" data-recovery-source="bip85" data-recovery-target="matcher">Wallet Matcher</button><button type="button" data-recovery-source="bip85" data-recovery-target="seedqr">SeedQR</button><button type="button" data-recovery-source="bip85" data-recovery-target="mhfe">MHFE</button><button type="button" data-recovery-source="bip85" data-recovery-target="slip39">SLIP-39 shares</button><button type="button" data-recovery-source="bip85" data-recovery-target="shamir">CKD Shamir</button><button type="button" data-recovery-source="bip85" data-recovery-target="sskr">SSKR</button><button type="button" data-recovery-source="bip85" data-recovery-target="gordian-envelope">Seed Envelope</button><button type="button" data-recovery-source="bip85" data-recovery-target="codex32">Codex32</button></div></details><button id="toggle-bip85-secret" class="secondary compact" type="button" aria-pressed="false">Reveal recovery source</button></div></div>
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
              <div id="bip85-wallet-network-field"><label for="bip85-wallet-network">Network</label><select id="bip85-wallet-network"></select></div>
              <div class="protocol-tabs-field span-three"><label id="bip85-wallet-tabs-label">Derivation type</label><div id="bip85-wallet-tabs" class="protocol-tabs primary-mode-tabs" role="radiogroup" aria-labelledby="bip85-wallet-tabs-label"></div></div>
              <div id="bip85-wallet-legacy-field" hidden><input id="bip85-wallet-legacy-toggle" type="checkbox" hidden></div>
              <div id="bip85-wallet-account-field"><label id="bip85-wallet-account-label" for="bip85-wallet-account">Account</label><input id="bip85-wallet-account" type="number" value="0" min="0" max="2147483647"></div>
              <div id="bip85-wallet-branch-field"><label id="bip85-wallet-branch-label" for="bip85-wallet-branch-input">Branch</label><input id="bip85-wallet-branch-input" type="number" value="0" min="0" max="2147483647"><select id="bip85-wallet-branch-select" hidden></select></div>
              <div><label id="bip85-wallet-start-label" for="bip85-wallet-start">Start index</label><input id="bip85-wallet-start" type="number" value="0" min="0" max="2147483647"></div>
              <div><label id="bip85-wallet-count-label" for="bip85-wallet-count">Number of results</label><input id="bip85-wallet-count" type="number" value="20" min="1" max="200"></div>
              <div class="path-preview span-three"><label>Standard derivation path · read-only</label><code id="bip85-wallet-path"></code></div>
              <div id="bip85-wallet-change-field" class="change-addresses-option span-three" hidden><label for="bip85-wallet-include-change"><input id="bip85-wallet-include-change" type="checkbox"><span><strong>Also generate change addresses</strong><small id="bip85-wallet-change-help"></small></span></label></div>
              <div id="bip85-wallet-coinjoin-field" class="change-addresses-option span-three" hidden><label for="bip85-wallet-include-coinjoin"><input id="bip85-wallet-include-coinjoin" type="checkbox"><span><strong>Show CoinJoin addresses</strong><small><code id="bip85-wallet-coinjoin-help"></code></small></span></label></div>
            </div>
            <div class="actions"><button id="derive-bip85-wallet" class="primary" type="button">Derive child wallet addresses</button></div>
            <div id="bip85-wallet-error" class="error" role="alert" hidden></div>
            <div id="bip85-wallet-status" class="status" role="status" hidden></div>
            <section id="bip85-wallet-results" hidden>
              <div class="results-title nested-results-title">
                <span id="bip85-wallet-result-title">Child wallet results</span>
                <div class="result-controls">
                  <button class="danger-outline compact" id="bip85-wallet-toggle-secrets" type="button" aria-pressed="false">Reveal all private keys</button>
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
                  <button class="secondary compact" data-bip85-download="allDisplayed" type="button">Download selected</button>
                </div></div>
                <p class="field-note">Exports use selected child-wallet rows. Account export includes receive and change descriptors for this child account. Sensitive exports remain disabled until private keys are revealed.</p>
              </section>
              <dialog id="bip85-wallet-account-export-dialog" aria-labelledby="bip85-wallet-account-export-title">
                <div class="account-export-heading"><h3 id="bip85-wallet-account-export-title">Child wallet account export</h3><button class="secondary compact" id="bip85-wallet-close-account-export" type="button">Close</button></div>
                <p id="bip85-wallet-account-export-description"></p>
                <label for="bip85-wallet-account-export-format">Export format</label>
                <select id="bip85-wallet-account-export-format"><option value="core">Core wallet console command</option><option value="raw">Raw descriptors · Scanner / other wallets</option></select>
                <h4>Public descriptors</h4><p>Watch-only account data; cannot spend funds.</p>
                <div class="watch-only-actions"><button class="secondary" data-bip85-descriptor="publicCopy" type="button">Copy public descriptors</button><button class="secondary" data-bip85-descriptor="publicDownload" type="button">Download public descriptors</button></div>
                <h4>Private descriptors</h4><p>Unencrypted keys allow spending. Reveal private keys before export.</p>
                <div class="watch-only-actions"><button class="secondary" data-bip85-descriptor="privateCopy" type="button">Copy private descriptors</button><button class="secondary" data-bip85-descriptor="privateDownload" type="button">Download private descriptors</button></div>
              </dialog>
              <div id="bip85-wallet-summary"></div>
              <div id="bip85-wallet-notices"></div>
              <div id="bip85-wallet-list"></div>
            </section>
          </section>
        </div>
      </section>`;
  const psbtBuilderWrapperOptions = !profile.capabilities.advancedPsbt
    ? '<option value="p2sh">Legacy P2SH</option>'
    : '<option value="p2wsh">Native P2WSH</option><option value="p2sh">Legacy P2SH</option><option value="p2tr">Taproot P2TR · Tapscript policy</option><option value="p2tr-musig2">Taproot P2TR · MuSig2 key path</option>';
  const psbtWalletWrapperOptions = !profile.capabilities.advancedPsbt
    ? '<option value="p2sh">Legacy P2SH</option>'
    : '<option value="p2sh">Legacy P2SH</option><option value="p2wsh">Bitcoin Native P2WSH</option>';
  const psbtCapabilities = !profile.capabilities.advancedPsbt
    ? '<div><span class="capability-check">✓</span><span>Dash Core PSBT v0</span></div>'
    : '<div><span class="capability-check">✓</span><span>Bitcoin PSBT v0 / v2</span></div><div><span class="capability-check">✓</span><span>Dash Core PSBT v0</span></div>';
  const psbtProtocolScope = !profile.capabilities.advancedPsbt
    ? 'Dash Core BIP-174-compatible PSBT v0 inspection; legacy Script and descriptor decoding; P2SH multisig, hashlock, and CLTV/CSV recovery-policy construction; deterministic watch-only P2SH multisig construction. SegWit, Taproot, Schnorr, and MuSig2 are excluded.'
    : 'Bitcoin BIP-174/BIP-370/BIP-371/BIP-373 field inspection; Dash Core BIP-174-compatible v0 inspection; Script and descriptor decoding; P2SH/P2WSH multisig, hashlock, Taproot/MuSig2 inspection, and CLTV/CSV recovery-policy construction; deterministic watch-only multisig construction.';
  const psbtDescriptorScope = !profile.capabilities.advancedPsbt
    ? '<p class="field-note"><strong>Dash descriptor coverage:</strong> legacy <code>pk()</code>, <code>pkh()</code>, <code>sh()</code>, <code>multi()</code>, <code>sortedmulti()</code>, <code>addr()</code>, <code>raw()</code>, and supported legacy Miniscript/hashlock/timelock fragments, with BitcoinerLab Miniscript safety analysis. SegWit, Taproot, Schnorr, MuSig2, and their PSBT fields are rejected.</p>'
    : '<p class="field-note"><strong>Bitcoin descriptor coverage:</strong> common wallet descriptors, Taproot/MuSig2, and Miniscript hashlock/timelock trees receive BitcoinerLab Miniscript safety analysis. Arbitrary descriptor address expansion and private-key descriptors remain unsupported.</p>';
  const psbtMusigScope = !profile.capabilities.advancedPsbt
    ? ''
    : '<p class="field-note"><strong>MuSig2 scope:</strong> the BIP-390 descriptor spelling is <code>musig(...)</code>, but it represents the modern BIP-327 MuSig2 protocol—not legacy MuSig1. Pinned public-key routines from <code>@scure/btc-signer</code> calculate and cross-check KeySort/KeyAgg, Taproot outputs, and BIP-328 aggregate-key derivation; the PSBT inspector structurally recognizes BIP-373 fields. The dependency package name contains “Signer”, but this utility does not expose transaction signing, secret nonces, or interactive partial-signature rounds.</p>';
  const psbtDependencyScope = !profile.capabilities.advancedPsbt
    ? 'BitcoinerLab Miniscript 2.0.0, Noble Curves/Hashes 2.4.0, and Scure Base/BIP32 2.4.0 — MIT; bip68 1.0.4 — ISC.'
    : 'BitcoinerLab Miniscript 2.0.0, Scure BTC Signer 2.4.1, Noble Curves/Hashes 2.4.0, and Scure Base/BIP32 2.4.0 — MIT; bip68 1.0.4 — ISC.';
  const psbtDecoderIntroduction = !profile.capabilities.advancedPsbt
    ? 'Inspect raw Dash Script hex or a supported legacy Dash output descriptor/Miniscript.'
    : 'Inspect raw Script hex or a Bitcoin output descriptor/Miniscript exported by wallets such as Nunchuk.';
  const activityTrustItems =
    profile.id === 'dash-community'
      ? '<span>Proof-verified Platform DAPI</span><span>Local Orchard note recovery</span><span>Public Dash L1 history</span>'
      : '<span>Validated public inputs</span><span>Bounded provider requests</span><span>Local sensitive-key processing</span>';
  const activityCapabilityCard =
    profile.id === 'dash-community'
      ? '<aside class="viewer-capability-card" aria-label="Viewer capabilities"><div class="capability-orbit" aria-hidden="true"><span></span></div><div class="capability-kicker">DASH RESOURCE TYPES</div><h2>Verify with confidence</h2><div class="capability-list"><div><span class="capability-check">✓</span><span>Core address activity</span></div><div><span class="capability-check">✓</span><span>Platform and Identity state</span></div><div><span class="capability-check">✓</span><span>Local Orchard note recovery</span></div><div class="capability-safe"><span>✓</span><span>Read-only by design</span></div></div></aside>'
      : '<aside class="viewer-capability-card" aria-label="Viewer capabilities"><div class="capability-orbit" aria-hidden="true"><span></span></div><div class="capability-kicker">SUPPORTED PUBLIC WORKFLOWS</div><h2>Inspect with confidence</h2><div class="capability-list"><div><span class="capability-check">✓</span><span>Bitcoin address history</span></div><div><span class="capability-check">✓</span><span>Ethereum account activity</span></div><div><span class="capability-check">✓</span><span>Dash Core, Platform, Identity and Orchard</span></div><div class="capability-safe"><span>✓</span><span>Read-only by design</span></div></div></aside>';
  const activityRuntimeDescription =
    profile.id === 'dash-community'
      ? 'Dash Core, Platform, Identity and Orchard reads · Orchard processing local · Blob Worker check pending'
      : 'Selected-coin public reads · local sensitive-key processing where required · Blob Worker check pending';
  const activityFooterProtocols =
    profile.id === 'dash-community'
      ? 'Dash Evo SDK 4.1.1 · proof-verified DAPI queries · Dash Orchard dashified-0.14.1 · DashScan Core API · Dash Platform Explorer'
      : 'Bitcoin public history · Ethereum account activity · Dash Evo SDK 4.1.1 · Dash Orchard dashified-0.14.1 · DashScan Core API · Dash Platform Explorer';
  const psbtScriptPlaceholder = !profile.capabilities.advancedPsbt
    ? '522102...53ae or sh(sortedmulti(...))#checksum'
    : '522102...53ae or tr(xpub.../0/*,{multi_a(...)})#checksum';
  const psbtPolicyScope = !profile.capabilities.advancedPsbt
    ? '<p class="field-note"><strong>Policy scope:</strong> Dash P2SH policies use legacy Script operations supported by Dash Core. Standard multisig is broadly interoperable; CLTV/CSV/hashlock branches require a separately tested custom signer and recovery procedure.</p>'
    : '<p class="field-note"><strong>Policy scope:</strong> advanced script shapes are Bitcoin-Script style policies. Dash L1 supports standard P2SH multisig and common CLTV/CSV script opcodes, but wallet auto-signing/recovery support is not guaranteed for custom branches. Hashlock/preimage scripts are contract-style policies, not normal multisig wallet recovery; OP_RETURN outputs are not spendable wallet outputs.</p>';
  const psbtNunchukScope = !profile.capabilities.advancedPsbt
    ? ''
    : '<p class="field-note"><strong>Nunchuk-style templates:</strong> HODL/Zen HODL maps to M-of-N after a lock. Named presets cover common flexible, decaying, expanding, and staged recovery shapes. Use Custom Bitcoin Miniscript for another exact policy tree, then independently confirm wallet-specific descriptor and signing support before funding.</p>';
  const psbtCustomMiniscriptOption = !profile.capabilities.advancedPsbt
    ? ''
    : '<option value="custom-miniscript">Custom Bitcoin Miniscript · P2WSH or Tapscript</option>';
  const psbtVerifyAddressPlaceholder = !profile.capabilities.advancedPsbt ? 'Dash address' : 'Bitcoin or Dash address';
  const psbtVerifySignaturePlaceholder = !profile.capabilities.advancedPsbt
    ? 'Base64 Dash Core compact signature'
    : 'Base64 signature, prefixed with smp, ful, or pof when applicable';
  const psbtMessageVerifyScope = !profile.capabilities.advancedPsbt
    ? '<strong>Dash:</strong> Dash Core compact P2PKH signatures are checked with the protocol-compatible Dash signed-message domain.'
    : '<strong>Bitcoin:</strong> BIP-322 legacy, simple, full, and proof-of-funds formats are checked by the pinned btcutil verifier and Bitcoin Script engine. Unprefixed pre-finalization simple signatures remain accepted for compatibility. <strong>Dash:</strong> Dash Core compact P2PKH signatures are checked with the protocol-compatible Dash signed-message domain.';
  const psbtFooterProtocols = !profile.capabilities.advancedPsbt
    ? 'Dash Core PSBT v0 · P2SH · multisig · hashlocks · CLTV/CSV'
    : 'BIP-174 · BIP-370 · BIP-371 · BIP-373 · Dash Core PSBT · P2SH/P2WSH · Taproot · MuSig2 · CLTV/CSV';
  const psbtChainScope = profile.capabilities.advancedPsbt ? ' · BITCOIN &amp; DASH' : '';
  const replacements = {
    __DOCUMENT_TITLE__: tool.documentTitle,
    __EDITION_NAME__: profile.editionName,
    __BUILD_PROFILE__: profile.id,
    __BRAND_NAME__: profile.brandName,
    __EDITION_EYEBROW__: tool.eyebrow,
    __KEY_DERIVATION_INTRODUCTION__: tool.introduction,
    __KEY_DERIVATION_FOOTER_PROTOCOLS__: tool.footerProtocols,
    __KEY_DERIVATION_SIGNER_FORMAT_FIELD__: signerFormatField,
    __DASH_HEADER_BRAND__: dashBrandMark,
    __PROFILE_BRAND_MARK__: profileBrandMark,
    __RECOVERY_COIN_FIELD__: recoveryCoinField,
    __RECOVERY_PUBLIC_KEY_PLACEHOLDER__: recoveryPublicKeyPlaceholder,
    __RECOVERY_PUBLIC_KEY_SCOPE__: recoveryPublicKeyScope,
    __ACTIVITY_COIN_CONTROL__: activityCoinControl,
    __ACTIVITY_TRUST_ITEMS__: activityTrustItems,
    __ACTIVITY_CAPABILITY_CARD__: activityCapabilityCard,
    __ACTIVITY_RUNTIME_DESCRIPTION__: activityRuntimeDescription,
    __ACTIVITY_FOOTER_PROTOCOLS__: activityFooterProtocols,
    __TOOL_INTRODUCTION__: tool.introduction,
    __PSBT_CHAIN_OPTIONS__: psbtChainOptions,
    __PSBT_NETWORK_OPTIONS__: psbtNetworkOptions,
    __SILENT_PAYMENT_TAB__: silentPaymentTab,
    __SILENT_PAYMENT_TOGGLE__: silentPaymentToggle,
    __SILENT_PAYMENT_PANEL__: silentPaymentPanel,
    __BIP85_TAB__: bip85Tab,
    __BIP85_TOGGLE__: bip85Toggle,
    __BIP85_PANEL__: bip85Panel,
    __PSBT_BUILDER_WRAPPER_OPTIONS__: psbtBuilderWrapperOptions,
    __PSBT_WALLET_WRAPPER_OPTIONS__: psbtWalletWrapperOptions,
    __PSBT_CAPABILITIES__: psbtCapabilities,
    __PSBT_PROTOCOL_SCOPE__: psbtProtocolScope,
    __PSBT_DESCRIPTOR_SCOPE__: psbtDescriptorScope,
    __PSBT_MUSIG_SCOPE__: psbtMusigScope,
    __PSBT_DEPENDENCY_SCOPE__: psbtDependencyScope,
    __PSBT_DECODER_INTRODUCTION__: psbtDecoderIntroduction,
    __PSBT_SCRIPT_PLACEHOLDER__: psbtScriptPlaceholder,
    __PSBT_POLICY_SCOPE__: psbtPolicyScope,
    __PSBT_NUNCHUK_SCOPE__: psbtNunchukScope,
    __PSBT_CUSTOM_MINISCRIPT_OPTION__: psbtCustomMiniscriptOption,
    __PSBT_VERIFY_ADDRESS_PLACEHOLDER__: psbtVerifyAddressPlaceholder,
    __PSBT_VERIFY_SIGNATURE_PLACEHOLDER__: psbtVerifySignaturePlaceholder,
    __PSBT_MESSAGE_VERIFY_SCOPE__: psbtMessageVerifyScope,
    __PSBT_FOOTER_PROTOCOLS__: psbtFooterProtocols,
    __PSBT_CHAIN_SCOPE__: psbtChainScope,
  };
  let rendered = template;
  for (const [marker, value] of Object.entries(replacements)) {
    if (value !== undefined) rendered = rendered.replaceAll(marker, value);
  }
  const remaining = rendered.match(
    /__(?:DOCUMENT_TITLE|EDITION_NAME|BUILD_PROFILE|BRAND_NAME|EDITION_EYEBROW|KEY_DERIVATION_[A-Z_]+|DASH_HEADER_BRAND|PROFILE_BRAND_MARK|RECOVERY_COIN_FIELD|RECOVERY_PUBLIC_KEY_PLACEHOLDER|RECOVERY_PUBLIC_KEY_SCOPE|ACTIVITY_[A-Z_]+|TOOL_INTRODUCTION|PSBT_[A-Z_]+)__/gu,
  );
  if (remaining !== null) throw new Error(`Unexpanded build-profile marker: ${remaining.join(', ')}`);
  return rendered;
}
