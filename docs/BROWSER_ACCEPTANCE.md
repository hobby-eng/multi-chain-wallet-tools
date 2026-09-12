# Standalone-file browser acceptance

Run this check locally after building all eight HTML artifacts. It opens the real `file://` files in Chromium and Firefox. It does not serve replacement HTTP pages or disable browser security, CSP or the Secret Vault sandbox.

Playwright is an optional local test dependency, not a runtime dependency of the HTML tools. Use an existing installation by setting `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. Install its matching Chromium and Firefox binaries with that installation's CLI if necessary:

```sh
node /absolute/path/to/playwright/cli.js install chromium firefox
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs pnpm test:browser:files
```

An ordinary locally resolvable `playwright` package also works without the environment variable. `HEADED=1` shows the browsers. `BROWSER_ENGINES=chromium` selects a single engine for diagnosis; it is not evidence that Firefox passed.

The runner saves `report.json`, console/page errors, request URLs and synthetic request bodies, artifact SHA-256 hashes, Git commit/dirty status, browser versions and desktop/mobile screenshots under `test-results/browser-files/<timestamp>/`. Its process fails if any requested browser cannot start or any check fails. Review the screenshots manually as well as the machine-readable status.

Covered checks:

- Startup self-tests for all available tools in both editions, opening the built files directly.
- Bitcoin default selection in Multi-Chain tools and Dash-only control surfaces in every Dash Community artifact, including the P2SH-only PSBT Inspector.
- Offline derivation from the public BIP39 test phrase, Clear, and absence of HTTP during derivation.
- Scanner seed-batch and public-key-batch controls, scope warning, testnet selection and Clear; synthetic public-key scan, cancel/restart, JSON export and two-seed batch execution.
- Secret Vault `allow-scripts` sandbox and rejection of parent-DOM access.
- Deterministic provider fixtures for basic Bitcoin/Ethereum viewing and 150-row Dash Core history.
- Footer scrolling, bounded whitespace and horizontal overflow at 1280- and 390-pixel viewport widths.
- Uncaught page errors, unexpected HTTP requests and the previously reported local-file origin error.

This is bounded UI acceptance, not a full end-to-end wallet-discovery or network compatibility suite. It does not exercise every export/clipboard path, verify real DAPI proofs, or cover every mainnet/testnet provider. Scanner execution uses deterministic provider fixtures. Run the existing live smoke commands separately with public test fixtures. Never replace the bundled synthetic test phrase/addresses with a real wallet: request logs and screenshots are deliberately retained.

The user-run report `test-results/browser-files/2026-09-08T21-41-48.962Z/report.json` records **12/12 passing cases** for clean commit `94eb3374cc6d3e67a578d459891d0f1e7d65ecab`, using Chromium 151.0.7922.34 and Firefox 153.0. Its recorded hashes matched that revision's six HTML artifacts. This is historical acceptance evidence: later changes require a new build and browser run. Fixture or browser-environment failures must be inspected rather than treated as application success or automatically waived.


The extended regression runner is `node tooling/verify-browser-regressions.mjs`.
It covers all four tools in both editions, including verification revision binding,
unsafe custom Tapscript rejection, CoinJoin visibility, BIP38 round trips and BIP85
child wallets. Run it after functional changes. A failed case can be repeated with
`BROWSER_CASES`, `BROWSER_ENGINES`, and `BROWSER_PROFILE` rather than repeating the
entire matrix. Deliberately injected CSP violations are retained in console/probe records. Chromium’s extra undefined pageerror from an explicitly denied opaque-frame IndexedDB probe is recorded separately; other application errors still fail the run. The script-execution/network/storage assertions remain enforced.
