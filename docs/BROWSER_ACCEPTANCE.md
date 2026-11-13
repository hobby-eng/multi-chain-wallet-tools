# Standalone-file browser acceptance

Run this check locally after building all eight HTML artifacts. It opens the real `file://` files in Chromium and Firefox. It does not serve replacement HTTP pages or disable browser security, CSP or the Secret Vault sandbox.

Playwright is a pinned development dependency, not a runtime dependency of the HTML tools. Install its matching Chromium and Firefox binaries once:

```sh
pnpm exec playwright install chromium firefox
pnpm test:browser:files
pnpm test:browser:regressions
pnpm test:browser:selective
```

Release acceptance requires Chromium 156 and Firefox 157 or newer; pinned Playwright 1.65.0 bundles Chromium 158 and Firefox 159. Firefox 153 is below the supported acceptance baseline because its process can crash while reloading the BIP85 regression case.

`PLAYWRIGHT_MODULE` can override module resolution for a separately installed matching copy. `HEADED=1` shows the browsers. `BROWSER_ENGINES=chromium` selects a single engine for diagnosis; it is not evidence that Firefox passed. In `pnpm test:browser:files`, `BROWSER_PROFILE` and `BROWSER_TOOLS` (comma-separated tool ids) rerun one profile or some tools alone, for example a case whose step timeout ran out during a pause; `report.json` records the filters, and a filter that selects no run fails.

The runner saves `report.json`, console/page errors, request URLs and synthetic request bodies, artifact SHA-256 hashes, Git commit/dirty status, browser versions and desktop/mobile screenshots under `test-results/browser-files/<timestamp>/`. Its process fails if any requested browser cannot start, any check fails or no run took place. Review the screenshots manually as well as the machine-readable status.

Covered checks:

- Startup self-tests for all available tools in both editions, opening the built files directly.
- Bitcoin default selection in Multi-Chain tools and Dash-only control surfaces in every Dash Community artifact, including the P2SH-only PSBT Inspector.
- Offline derivation from the public BIP39 test phrase, Clear, and absence of HTTP during derivation.
- Scanner seed-batch and public-key-batch controls, scope warning, testnet selection and Clear; synthetic public-key scan, cancel/restart, JSON export and two-seed batch execution.
- Secret Vault `allow-scripts` sandbox and rejection of parent-DOM access.
- Deterministic provider fixtures for basic Bitcoin/Ethereum viewing and 150-row Dash Core history; every EVM network's endpoint answers `eth_chainId` with its own chain id, and every Blockscout host answers an empty history.
- Footer scrolling, bounded whitespace and horizontal overflow at 1280- and 390-pixel viewport widths.
- Uncaught page errors, unexpected HTTP requests and the previously reported local-file origin error.

This is bounded UI acceptance, not a full end-to-end wallet-discovery or network compatibility suite. It does not exercise every export/clipboard path, verify real DAPI proofs, or cover every mainnet/testnet provider. Scanner execution uses deterministic provider fixtures. Run the existing live smoke commands separately with public test fixtures. Never replace the bundled synthetic test phrase/addresses with a real wallet: request logs and screenshots are deliberately retained.

The user-run report `test-results/browser-files/2026-09-08T21-41-48.962Z/report.json` records **12/12 passing cases** for clean commit `22f7d04f2810a5d8bdfaedc57dff6fae53ca9c84`, using Chromium 151.0.7922.34 and Firefox 153.0. Its recorded hashes matched that revision's six HTML artifacts. This is historical evidence for that revision, not evidence that Firefox 153 meets the current release baseline. Later changes require a new build and browser run. Fixture or browser-environment failures must be inspected rather than treated as application success or automatically waived.

The selective smoke runner is `pnpm test:browser:selective`. It builds Bitcoin-only, Ethereum-only, BNB Chain-only and XRP-only Activity Viewers, seed-only Discovery without custom paths, seed Discovery on Base and Gnosis alone, on Ethereum Classic alone (with custom paths and both Ethereum's and Ethereum Classic's derivation known answers), on Solana and Tron alone and on Hedera and TON alone, an Injective-only Activity Viewer, watch-only Discovery, and a minimal recovery-enabled Deriver into a temporary directory. It opens every variant in Chromium and Firefox and rejects startup errors, failed self-tests, missing release fingerprints, missing feature pruning, or a non-resizing Discovery boundary.

The extended regression runner is `pnpm test:browser:regressions`. Its matrix covers all four tools in both editions and both engines, including verification revision binding, the compact coins' message signing (Litecoin's three address types, Dogecoin, Bitcoin Cash from its CashAddr and its legacy form with one signature, Zcash, Ethereum, Ethereum Classic, Tron, Solana in both formats, Stellar, NEAR with its recipient and nonce, and TON's text and binary payloads, the Telegram wallet's row included), the Deriver's own check of each signature its signing dialog makes (valid for the address, not valid for a changed message, a blank signature refused, and on a Bitcoin P2PKH row a compact signature signed, verified and pointed to its format when pasted under BIP-322), the EVM networks' candidate scan and Viewer lookup (their own endpoints and units, a refused wrong chain id, Testnet offered only where it exists, Ethereum Classic's coin type 61 account at `m/44'/61'/0'/0/0` and its Blockscout history in both tools), the account coins' candidate scan and Viewer lookup (Cosmos, Hedera, Injective, NEAR, Solana, Stellar, TON, Tron and XRP from their own providers' answers, in their own units, Mainnet and seed scans only, Hedera's accounts named by number, TON's requests paced, another account's answer refused, Hedera's and NEAR's secret keys refused before any request), every combination of the Deriver's generation options (`generation-matrix`: for each state of the wallet check, TON's check and a chosen word, the start line within 500 ms of the click and screenshots of the running and the finished draw; the long draws also run on the browser's own randomness for their count, estimate, warning and Stop, and complete on public vectors after seconds of all-zero draws that miss), unsafe custom Tapscript rejection, CoinJoin visibility, BIP38 round trips, BIP85 child wallets, and commands issued immediately while the derivation Worker is booting. The Worker case confirms that Clear, Cancel, and protocol-tab changes neither expose inputs nor terminate the Blob Worker before its shared `ready` handshake. Run it after functional changes. A failed case can be repeated with
`BROWSER_CASES`, `BROWSER_ENGINES`, and `BROWSER_PROFILE` rather than repeating the
entire matrix. Deliberately injected CSP violations are retained in console/probe records. Chromium’s extra undefined pageerror from an explicitly denied opaque-frame IndexedDB probe is recorded separately; other application errors still fail the run. The script-execution/network/storage assertions remain enforced.

MnemoCode parity acceptance also checks the offered modes, representations, share forms, phrase lengths, card templates, page sizes, orientations, document formats and heir-sheet sizes. The date fields accept local text files, including multiline date lists; Re-encode accepts a final-word text file. Repeated share-file imports append records, with a combined UTF-8 text limit of 1 MiB, so a quorum can be assembled from separate files. Edits, Clear, page departure and a change away from a dates operation revoke pending imports. The native parity cases exercise the built controls; source inventories and option presence alone do not establish that every combination renders or restores correctly.
