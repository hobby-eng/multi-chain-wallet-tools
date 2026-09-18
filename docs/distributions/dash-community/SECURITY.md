# Security

These boundaries describe canonical source version **{{VERSION}}**. Verify the version of the HTML you actually downloaded in its Release passport.

Report vulnerabilities privately through this repository's GitHub security-advisory interface. Never include real recovery phrases, passphrases, private keys, viewing keys, or private wallet exports.

## Tool boundaries

- **Key Derivation Tool:** use a trusted disconnected computer. Private exports, BIP85 child phrases, message-signing keys, backup cards, and restored secrets are sensitive. QR encoding is not encryption. Keep threshold cards separately; including a BIP39 passphrase in an encrypted Envelope places both wallet secrets in that container.
- **Activity Viewer:** connects to public providers with public/watch-only inputs. Viewing keys cannot spend funds but expose private wallet activity. Providers can observe IP addresses, timing, and queried identifiers.
- **Discovery Scanner:** supports single and batch seed or public-key scans. Secret derivation runs in an opaque-origin, network-disabled vault. The separate network worker performs read-only queries with validated public data. A compromised host, browser, extension, or modified HTML remains outside this boundary.
- **PSBT & Multisig Inspector:** works offline. It inspects transaction and policy data, verifies supported public message proofs, and decrypts BIP38 locally. It does not sign, finalize, fund, query UTXOs, or broadcast transactions.

None of the tools broadcasts recovery transactions. Independently verify public addresses, derivation paths, and provider balances in a maintained Dash wallet before recovering funds. The project has extensive automated checks but has not received an independent cryptography-specialist audit.

Checksums detect altered downloads; they do not prove cryptographic correctness. Clipboard history, screenshots, browser extensions, swap, and crash dumps remain outside the tools' isolation boundaries. See the [canonical security model](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}/SECURITY_AUDIT.md).

This file is generated from canonical documentation source [{{SOURCE_SHA}}](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}). Update its template in the canonical repository.
