# Security

These boundaries describe canonical source version **{{VERSION}}**. Verify the version of the HTML you actually downloaded in its Release passport.

Report vulnerabilities privately through this repository's GitHub security-advisory interface. Never include real recovery phrases, passphrases, private keys, viewing keys, or private wallet exports.

## Tool boundaries

- **Key Derivation Tool:** use a trusted disconnected computer. Private exports, BIP85 child phrases, message-signing keys, backup cards, and restored secrets are sensitive. QR encoding is not encryption. Keep threshold cards separately; including a BIP39 passphrase in an encrypted Envelope places both wallet secrets in that container.
- **Activity Viewer:** connects to public providers with public/watch-only inputs. Viewing keys cannot spend funds but expose private wallet activity. Providers can observe IP addresses, timing, and queried identifiers.
- **Discovery Scanner:** supports single and batch seed or public-key scans. Secret derivation runs in an opaque-origin, network-disabled vault. The separate network worker performs read-only queries with validated public data. A compromised host, browser, extension, or modified HTML remains outside this boundary.
- **PSBT & Multisig Inspector:** works offline. It inspects transaction and policy data, verifies supported public message proofs, and decrypts BIP38 locally. It does not sign, finalize, fund, query UTXOs, or broadcast transactions.

None of the tools broadcasts recovery transactions. Independently verify public addresses, derivation paths, and provider balances in a maintained Dash wallet before recovering funds. The project has extensive automated checks but has not received an independent cryptography-specialist audit.

## Secret isolation and network access

The seed-capable Discovery Scanner keeps mnemonic, BIP39 passphrase, seed, and private/spending/viewing keys inside a **Secret Vault**: an embedded iframe with `sandbox="allow-scripts"`, without `allow-same-origin`. Its opaque origin prevents the surrounding network-capable page from directly reading its DOM or secret fields. Derivation and private Orchard scanning run inside this vault.

The vault's Content Security Policy sets `default-src 'none'` and **`connect-src 'none'`**. It also denies images, nested frames, workers, and form submissions. These browser-enforced restrictions block network connections from the secret-bearing document. Build checks reject network SDK/service imports in the vault and secret-derivation imports in the separate Network Worker; artifact and browser checks verify the resulting isolation.

When a scan needs provider data, a fixed, validated message protocol passes only public query data, such as addresses, public-key hashes, network identifiers, or public pool positions, to the Network Worker. Mnemonics, passphrases, seed bytes, and private/spending/viewing keys are not network request inputs. Secret-pattern checks add a tripwire against accidental leakage. Public provider responses return to the vault for local processing; exported reports contain only the approved public-data projection. Providers can still observe the public queries and their timing.

The **Key Derivation Tool and PSBT & Multisig Inspector** instead prohibit network connections for the whole offline application with `connect-src 'none'`; they do not use the Scanner's iframe vault. In-memory recovery-source links in the Deriver do not copy the linked phrase or passphrase to the OS clipboard or send them over the network. Explicitly revealed secret exports and copy actions remain the user's responsibility.

These controls isolate trusted secret-processing code from the network-capable realm. They cannot guarantee protection from a compromised browser/OS or deliberately malicious code inside the vault, and cannot guarantee erasure of JavaScript strings or browser memory copies.

Checksums detect altered downloads; they do not prove cryptographic correctness. Clipboard history, screenshots, browser extensions, swap, and crash dumps remain outside the tools' isolation boundaries. See the [canonical security model](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}/SECURITY_AUDIT.md).

This file is generated from canonical documentation source [{{SOURCE_SHA}}](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}). Update its template in the canonical repository.
