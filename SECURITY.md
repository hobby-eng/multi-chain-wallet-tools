# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through this repository's [GitHub private vulnerability reporting form](https://github.com/hobby-eng/multi-chain-wallet-tools/security/advisories/new). Reports are for the repository owner and maintainers; do not disclose an unpatched security issue in a public issue or pull request.

Never include real recovery phrases, passphrases, private keys, spending/viewing keys, or private wallet exports. Use public test vectors or an empty test wallet and provide the source commit or HTML Release passport, selected build modules, reproduction steps, and expected versus actual behavior.

Security fixes target the current canonical source. Older downloaded HTML files do not update themselves: check releases and replace affected artifacts. Verify the version and source fingerprint of the file you actually use; current-source documentation can be newer than the latest published release.

## Secret isolation and network access

- **Discovery Scanner, seed-capable builds:** mnemonic, passphrase, seed, private/spending/viewing keys, derivation, and private Orchard scanning stay inside a Secret Vault iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. Its opaque origin prevents direct DOM access from the surrounding network-capable page. Its CSP uses `default-src 'none'`, `connect-src 'none'`, and denies images, nested frames, workers, and form submissions.
- **Network boundary:** provider requests run in a separate Network Worker. Only public query data crosses the fixed, validated request protocol: addresses, public-key hashes, network identifiers, and public pool positions as required by the adapter. Mnemonics, passphrases, seeds, and private/spending/viewing keys are not network request inputs. Responses return for local processing; approved public reports exclude secrets. Secret-pattern checks provide an additional leakage tripwire. Public queries still reveal identifiers, timing, and IP addresses to providers.
- **Enforcement:** build checks reject network SDK/service imports in the vault and secret-derivation imports in the Network Worker. Artifact and browser checks verify sandbox, CSP, protocol boundaries, and startup isolation. This is defense in depth, not a guarantee against malicious secret-processing code exploiting an allowed public-data channel.
- **Key Derivation Tool and PSBT & Multisig Inspector:** network access is prohibited for the whole offline application by `connect-src 'none'` and build checks. They do not use the Scanner's iframe vault. The Deriver's original/child recovery-source handoff uses an expiring in-memory reference; linking does not copy secrets to the clipboard or send them over the network. Explicit secret copy/export actions remain sensitive.
- **Activity Viewer and watch-only Scanner builds:** use public/watch-only inputs and query public providers. Viewing keys reveal private wallet activity even though they cannot spend funds. Do not paste spending secrets into public-input tools.

None of the tools broadcasts recovery transactions. Independently verify public addresses, derivation paths, and provider balances in a maintained wallet for the selected coin before recovering funds. QR encoding and ordinary secret sharing are not encryption. Keep threshold cards separately; an encrypted Envelope containing both mnemonic entropy and its BIP39 passphrase reveals both to anyone with a valid unlocking permit.

## Limits and verification evidence

Use a trusted computer and verify downloads externally. A compromised browser, extension, operating system, firmware, build host, or modified HTML is outside the isolation boundary. Clipboard history, screenshots, swap, crash dumps, and immutable JavaScript strings cannot be reliably erased by these tools. Checksums detect changed bytes; they do not prove cryptographic correctness.

The project has extensive automated checks but has not received an independent cryptography-specialist audit. [SECURITY_AUDIT.md](SECURITY_AUDIT.md) documents the detailed threat model, implementation controls, and residual risks. [Audit records](docs/audits/README.md) preserve point-in-time findings and verification evidence; they are not a security certification. Application-specific policies are in each application's directory.
