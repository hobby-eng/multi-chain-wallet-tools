# GitHub source and release procedure

Repository: `https://github.com/hobby-eng/multi-chain-wallet-tools`

This repository is the canonical source for both build profiles and the release surface for the Multi-Chain Edition. A future `hobby-eng/dash-wallet-tools` repository is intended to be a separate distribution/release surface for Dash Community Edition artifacts built from this source. It does not exist yet; do not copy or independently evolve application source there.

## What belongs in Git

Commit the application, package, test, tooling and documentation sources together with all lockfiles. In particular, these generated-looking files are mandatory build inputs and must remain tracked:

- `pnpm-lock.yaml`;
- `packages/dash-shielded-wasm/generated/` (the audited browser WASM and offline-only glue);
- `packages/dash-shielded-wasm/rust/Cargo.lock` (including the exact Dash Orchard revision).

Do not commit installed packages, local toolchains, compiler targets, coverage, logs, editor state, wallet material, or `dist/`. The root `.gitignore` excludes them. GitHub automatically provides source `.zip` and `.tar.gz` archives for every tag; the release workflow independently rebuilds the downloadable HTML from that tagged source.

The root `.gitattributes` fixes repository text files to LF line endings and marks WASM/assets as binary. This matters because release fingerprints and HTML checksums cover exact bytes.

Original project code is released under the root [MIT License](LICENSE), copyright (c) 2026 hobby-eng. The license is intentionally permissive for inspection, reuse and forks. Third-party components retain the separate licenses and copyright notices recorded in `THIRD_PARTY_NOTICES.md` and `ATTRIBUTION.md`.

## First push to the empty GitHub repository

Do not append another heading to `README.md`; the real project README already exists. From the project root:

```bash
git init
git branch -M main
git remote add origin git@github.com:hobby-eng/multi-chain-wallet-tools.git
git add -A
git status --short
git diff --cached --check
```

Before committing, confirm that caches and builds are ignored and the three mandatory reproducibility inputs are staged:

```bash
git check-ignore -v node_modules dist .tools packages/dash-shielded-wasm/rust/target
git ls-files pnpm-lock.yaml packages/dash-shielded-wasm/generated packages/dash-shielded-wasm/rust/Cargo.lock
```

Inspect `git status` for accidental mnemonic, wallet, `.env`, private-key, screenshot, or personal files. Then:

```bash
git commit -m "Initial source release"
git push -u origin main
```

If GitHub was initialized with a README or license instead of being empty, do not force-push. Fetch and merge/rebase that initial commit, or recreate the GitHub repository empty, before the final `git push`.

## Automated checks

The checked-in workflows pin every referenced GitHub-maintained action to a full commit SHA. Compilation itself runs through the repository's canonical Dockerfile:

- `.github/workflows/ci.yml` runs on every push to `main`, pull request and manual invocation. It builds the canonical container, runs the complete verification suite for both profiles, rebuilds Orchard WASM, rejects any generated-byte difference and creates both local flat bundles.
- `.github/workflows/full-wasm.yml` runs monthly or manually as a fresh scheduled repetition of the same complete, pinned Rust/WASM build gate.
- `.github/workflows/release.yml` runs for `v*` tags. It repeats the source/artifact checks, requires the tag to equal `v` plus `package.json` version and a matching curated `docs/releases/<tag>.md`, creates GitHub provenance attestations, and publishes a Multi-Chain release containing the existing three filenames, their sidecars, the MIT `LICENSE`, and a flat `SHA256SUMS`. It intentionally does not publish the Dash Community bundle.
- `.github/dependabot.yml` proposes pinned npm, Cargo, GitHub Actions and Docker updates weekly. `.github/workflows/upstream-versions.yml` separately compares the pinned Node LTS, pnpm, stable Rust, rustup, Evo SDK, wasm-bindgen and Dash Orchard tag/commit with their upstream releases; it opens or refreshes one review issue instead of modifying release inputs. Never merge a cryptographic/dependency update only because CI is green; inspect its changelog, lockfile diff and vectors.

`Dockerfile.reproducible` pins the Ubuntu 24.04-based base image by immutable digest and pins Node.js 24.20.0, pnpm 11.25.0, Rust/Cargo 1.98.1 and wasm-bindgen 0.2.127. Downloaded Node/rustup installers are checksum-verified. Dependency fetching happens before the final `pnpm verify` layer; that complete verification/build layer runs with `--network=none`. The generated WASM is compared byte for byte with the committed reviewed input before any release artifact can leave the image.

The Release passport's `Source/build fingerprint · SHA-256 (not the HTML checksum)` value is a digest of the source tree and embedded build inputs, including the canonical Docker definition and generated WASM; it is not the byte-for-byte HTML checksum. The latter exists only in the external per-file `.sha256` sidecar and flat `SHA256SUMS`. A native build on another host may be functionally correct but byte-different. `./tooling/build-reproducible.sh` is the supported Docker-only way to reproduce the official release bytes locally; `pnpm build:reproducible` is an equivalent convenience command.

## Release checklist

1. Update workspace versions and `releaseDate`, add curated notes at `docs/releases/v<version>.md`, update relevant documentation, and commit the changes. Give each significant user-facing, security, dependency, or build change its own release-note bullet instead of combining distinct features. The intended tag is always `v` plus the root `package.json` version.
2. From a clean source checkout with Docker Engine/Desktop running, run `./tooling/build-reproducible.sh`. This performs the locked install, TypeScript checks, JavaScript/fixed-vector tests, native Rust tests, a release WASM rebuild and exact generated-byte comparison, generated-browser-WASM tests, two byte-identical builds of both profiles, per-profile manifest checks, Dash graph/content isolation checks, and each application's CSP/artifact verifier.
3. Run the live network release observations below. They are intentionally not part of deterministic CI because changing chain state or a provider outage must not change the reproducible build result.
4. Ensure the working tree is clean. A GPG key is not required. Create and push an annotated tag:

   ```bash
   git tag -a v<version> -m "v<version>"
   git push origin v<version>
   ```

   If a maintainer later configures a trusted GPG key, `git tag -s ...` may be used instead as an additional human-approval signal. GitHub Actions provenance remains available either way.
5. Open the tag's Actions run. All checks must pass. Only after every gate succeeds does the workflow publish the release using its curated notes.
6. Rebuild locally with `./tooling/build-reproducible.sh`. Compare `dist/release/SHA256SUMS` with the published release manifest. If a maintainer has a GPG key and wants an additional detached approval signature, sign that exact flat manifest locally without giving CI the private key:

   ```bash
   pnpm release:sign -- YOUR_GPG_KEY_ID
   gh release upload v<version> dist/release/SHA256SUMS.asc --repo hobby-eng/multi-chain-wallet-tools
   ```

   The `.asc` file can instead be uploaded through the GitHub release web form. Skip this optional signing step when no GPG key is configured.
7. Review the published notes, artifact list, provenance attestations, and checksums. If any release gate or post-publication comparison is wrong, remove the release and tag rather than replacing assets silently.

A GPG key is optional for this project. GitHub's artifact attestation links CI-built bytes to the tagged repository, workflow and commit and is the normal reproducible provenance path. A sidecar checksum detects corruption but authenticates nothing by itself. If OpenPGP signing is used later, its private key must never be stored in the repository, GitHub Actions secrets, browser storage, or release bundle; the detached signature means only that its owner personally approved the exact flat manifest. Neither attestation nor signature proves cryptographic correctness.

## Live release observations

Run `pnpm test:activity-viewer:network`, both `test:activity-viewer:core-*` commands, both `test:activity-viewer:platform-*` commands, `pnpm test:discovery:mainnet`, `pnpm test:discovery:testnet`, and the bounded `pnpm test:discovery:batch-mainnet` plus `pnpm test:discovery:batch5-mainnet` checks on a network-connected test machine. The Platform Activity Viewer tests require Explorer balance/nonce to agree with proof-verified DAPI. Discovery smoke uses only documented public BIP39 vectors.

Temporarily block optional lookup providers where applicable and confirm the primary finding remains visible with a warning. A changing provider must never turn a valid primary result into a false zero. Inspect request payloads in browser developer tools: only validated public addresses, public-key hashes and Orchard pool ranges may leave the isolated Discovery Scanner vault.

Open all three standalone files directly with `file://` in each supported browser. Check the release passports/self-tests and narrow/mobile layout. In the Wallet Key Derivation Tool verify auto-generation and the reveal gate, then enable change generation for every Bitcoin variant and Dash Core: confirm `/0` Receive and `/1` Change paths, independent selection/paging/export state, branch-specific descriptors, a known-address match on the change branch, and that Ethereum, Platform and Orchard do not show the two-branch checkbox. Check Activity Viewer Single/Batch, Auto/Advanced, mixed-result selection, clearing, and CSV/XLSX/JSON export; check Discovery Scanner single/batch progress, cancellation, isolation diagnostics, and secret-free CSV/JSON export. Complete one full Orchard cold scan separately before release.

## What GitHub publishes

`pnpm release:bundle` creates exactly these local upload candidates:

```text
dist/release/Wallet_Key_Derivation_Tool.html
dist/release/Wallet_Key_Derivation_Tool.html.sha256
dist/release/Wallet_Activity_Viewer.html
dist/release/Wallet_Activity_Viewer.html.sha256
dist/release/Wallet_Discovery_Scanner.html
dist/release/Wallet_Discovery_Scanner.html.sha256
dist/release/LICENSE
dist/release/SHA256SUMS
```

It remains the only bundle published by this repository's tag workflow. `pnpm release:bundle:dash-community` separately prepares, but does not publish:

```text
dist/dash-community/release/Dash_Community_Key_Derivation_Tool.html
dist/dash-community/release/Dash_Community_Key_Derivation_Tool.html.sha256
dist/dash-community/release/Dash_Community_Activity_Viewer.html
dist/dash-community/release/Dash_Community_Activity_Viewer.html.sha256
dist/dash-community/release/Dash_Community_Discovery_Scanner.html
dist/dash-community/release/Dash_Community_Discovery_Scanner.html.sha256
dist/dash-community/release/LICENSE
dist/dash-community/release/SHA256SUMS
```

Do not attach those files to a `multi-chain-wallet-tools` release. A future Dash distribution workflow should check out an exact canonical source commit/tag, run the same pinned container, select the verified Dash bundle, and publish it without maintaining a source fork.

The manifest uses plain filenames, not subdirectories, so a user can download all release assets into one directory and immediately run:

```bash
sha256sum -c SHA256SUMS
gh attestation verify Wallet_Key_Derivation_Tool.html -R hobby-eng/multi-chain-wallet-tools
gh attestation verify Wallet_Activity_Viewer.html -R hobby-eng/multi-chain-wallet-tools
gh attestation verify Wallet_Discovery_Scanner.html -R hobby-eng/multi-chain-wallet-tools
```

The manifest also covers the released `LICENSE`. The attestation commands require an online GitHub CLI; checksum verification works offline. Only when a release includes the optional `SHA256SUMS.asc`, verify it separately with `gpg --verify SHA256SUMS.asc SHA256SUMS` and a public key obtained through an independent trusted channel.

If an artifact is served as a web page instead of a downloadable `file://` tool, configure the host to send `Content-Security-Policy: frame-ancestors 'none'` and preferably `X-Frame-Options: DENY`. Browsers ignore `frame-ancestors` inside an HTML `<meta>` CSP, so the build cannot supply this hosting-only clickjacking control.
