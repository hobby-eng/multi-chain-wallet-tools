# Standalone-file browser acceptance

Run this check locally after building all six HTML artifacts. It opens the real `file://` files in Chromium and Firefox. It does not serve replacement HTTP pages or disable browser security, CSP or the Secret Vault sandbox.

Playwright is an optional local test dependency, not a runtime dependency of the HTML tools. Use an existing installation by setting `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. Install its matching Chromium and Firefox binaries with that installation's CLI if necessary:

```sh
node /absolute/path/to/playwright/cli.js install chromium firefox
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs pnpm test:browser:files
```

An ordinary locally resolvable `playwright` package also works without the environment variable. `HEADED=1` shows the browsers. `BROWSER_ENGINES=chromium` selects a single engine for diagnosis; it is not evidence that Firefox passed.

The runner saves `report.json`, console/page errors, request URLs and synthetic request bodies, artifact SHA-256 hashes, Git commit/dirty status, browser versions and desktop/mobile screenshots under `test-results/browser-files/<timestamp>/`. Its process fails if any requested browser cannot start or any check fails. Review the screenshots manually as well as the machine-readable status.

Covered checks:

- Startup self-tests for all three tools in both editions, opening the built files directly.
- Bitcoin default selection in Multi-Chain tools and the Dash-only Activity Viewer control surface.
- Offline derivation from the public BIP39 test phrase, Clear, and absence of HTTP during derivation.
- Scanner seed-batch and public-key-batch controls, scope warning, testnet selection and Clear.
- Secret Vault `allow-scripts` sandbox and rejection of parent-DOM access.
- Deterministic provider fixtures for basic Bitcoin/Ethereum viewing and 150-row Dash Core history.
- Footer scrolling, bounded whitespace and horizontal overflow at 1280- and 390-pixel viewport widths.
- Uncaught page errors, unexpected HTTP requests and the previously reported local-file origin error.

This is bounded UI acceptance, not a full end-to-end wallet-discovery or network compatibility suite. It does not submit Scanner seed/public-key scans, exercise every export/clipboard path, verify real DAPI proofs, or cover every mainnet/testnet provider. Run the existing live smoke commands separately with public test fixtures. Never replace the bundled synthetic test phrase/addresses with a real wallet: request logs and screenshots are deliberately retained.

The runner was syntax-checked when introduced. Its first real-browser execution remains pending; fixture or browser-environment failures must be inspected rather than treated as application success or automatically waived.
