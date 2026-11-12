import { MnemoCodeStegoFilesCase } from "./browser-cases/mnemocode-stego-files.mjs";
import { MnemoCodePrintSettingsCase } from "./browser-cases/mnemocode-print-settings.mjs";
import { MnemoCodeFileInputsCase } from "./browser-cases/mnemocode-file-inputs.mjs";
import { MnemoCodeReEncodingCase } from "./browser-cases/mnemocode-reencoding.mjs";
import { MnemoCodeShareFormsCase } from "./browser-cases/mnemocode-share-forms.mjs";
import { MnemoCodeSelfTestCase } from "./browser-cases/mnemocode-self-test.mjs";
import { MnemoCodeCrossStitchCase } from "./browser-cases/mnemocode-cross-stitch.mjs";
import { MhfeSeveralPasswordsCase } from "./browser-cases/mhfe-several-passwords.mjs";
import { DashKeysAndMultisigCase } from "./browser-cases/dash-keys-and-multisig.mjs";
import { MnemoCodeShareHintsCase } from "./browser-cases/mnemocode-share-hints.mjs";
import { MnemoCodeSourceHintsCase } from "./browser-cases/mnemocode-source-hints.mjs";
import { SeedQrHiddenCase } from "./browser-cases/seedqr-hidden.mjs";
import { GenerationMatrixCase } from "./browser-cases/generation-matrix.mjs";
// Synthetic, direct-file integration tests. Never point this at a live browser profile.
import { CopyFeedbackCase } from "./browser-cases/copy-feedback.mjs";
import { Bip85ManualStartCase } from "./browser-cases/bip85-manual-start.mjs";
import { SingleKeyCoinsCase } from "./browser-cases/single-key-coins.mjs";
import { EvmNetworkCandidatesCase } from "./browser-cases/evm-network-candidates.mjs";
import { AccountCoinCandidatesCase } from "./browser-cases/account-coin-candidates.mjs";
import { CoinJoinPartialCase } from "./browser-cases/coinjoin-partial.mjs";
import { ProtocolNavigationCase } from "./browser-cases/protocol-navigation.mjs";
import { RecoverySourceRoutingCase } from "./browser-cases/recovery-source-routing.mjs";
import { MnemonicDiagnosticLifetimeCase } from "./browser-cases/mnemonic-diagnostic-lifetime.mjs";
import assert from "node:assert/strict";
import { ExactKeyIndexCase } from "./browser-cases/exact-key-index.mjs";
import { SeedHistoryCancellationCase } from "./browser-cases/seed-history-cancellation.mjs";
import { SilentPaymentLifecycleCase } from "./browser-cases/silent-payment-lifecycle.mjs";
import { ResultExportLifecycleCase } from "./browser-cases/result-export-lifecycle.mjs";
import { ChildWalletLifecycleCase } from "./browser-cases/child-wallet-lifecycle.mjs";
import { SourceClipboardLifecycleCase } from "./browser-cases/source-clipboard-lifecycle.mjs";
import { CoreFlowAdmissionCase } from "./browser-cases/core-flow-admission.mjs";
import { MnemoCodeDisclosureCase } from "./browser-cases/mnemocode-disclosure.mjs";
import { RecoveryDiagnosticRetirementCase } from "./browser-cases/recovery-diagnostic-retirement.mjs";
import { MnemoCodeCapabilityCatalogsCase } from "./browser-cases/mnemocode-capability-catalogs.mjs";
import { MnemoCodeModeFormatLengthsCase } from "./browser-cases/mnemocode-mode-format-lengths.mjs";
import { MnemoCodeCardTextLengthsCase } from "./browser-cases/mnemocode-card-text-lengths.mjs";
import { MnemoCodePublicReferencesCase } from "./browser-cases/mnemocode-public-references.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchForReport, loadPlaywright } from "./playwright-loader.mjs";
import { browserSuiteProfiles, profileToolIds } from "./build-profiles.mjs";
import { BrowserHarness } from "./browser-regressions/host.mjs";
const { output, open, openWithLinkedPhrase, waitText } = BrowserHarness;
import { BrowserBoundaryCases } from "./browser-regressions/boundaries.mjs";
const { boundaries, selfTests, selfTestFailure } = BrowserBoundaryCases;
import { InspectorBrowserCases } from "./browser-regressions/inspector.mjs";
const { descriptorFollowup, verifierRevision, bip38Lifecycle } = InspectorBrowserCases;
import { DeriverBrowserCases } from "./browser-regressions/deriver.mjs";
const { workerReadiness, coinJoin, bip38, childWallet } = DeriverBrowserCases;
import { BrowserFixtures } from "./browser-regressions/fixtures.mjs";
const { mnemonic } = BrowserFixtures;
import { MhfeBrowserCases } from "./browser-regressions/mhfe.mjs";
const {
  checkedMnemonic,
  mhfeMissingWords,
  mhfeCustomPath,
  mhfeMadePassword,
  mhfeInputLifecycle,
  mhfeEncryptCommand,
  mhfePendingInputs,
  mhfeContainerPreviews,
} = MhfeBrowserCases;
import { BackupBrowserCases } from "./browser-regressions/backups.mjs";
const { recoveryBackupRoundTrips } = BackupBrowserCases;
import { MnemoCodeBrowserCases } from "./browser-regressions/mnemocode.mjs";
const {
  mnemocodeRoundTrip,
  mnemocodeShares,
  mnemocodeLateCards,
  mnemocodeShareList,
  mnemocodeCoinEvidence,
} = MnemoCodeBrowserCases;
import { MnemoCodeCardBrowserCases } from "./browser-regressions/cards.mjs";
const { mnemocodeCards } = MnemoCodeCardBrowserCases;

const { chromium, firefox } = await loadPlaywright();

mkdirSync(output, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Fresh isolated file:// contexts; public synthetic fixtures; no live providers, broadcasts, or real wallet data.",
  runs: [],
};

const save = () =>
  writeFileSync(
    resolve(output, process.env.BROWSER_REPORT_NAME ?? "report.json"),
    JSON.stringify(report, null, 2),
  );

for (const browserName of (process.env.BROWSER_ENGINES ?? "chromium,firefox").split(",")) {
  const browser = await launchForReport(
    { chromium, firefox },
    browserName,
    process.env[`${browserName.toUpperCase()}_EXECUTABLE_PATH`],
    report,
    save,
  );
  if (browser === undefined) continue;
  try {
    for (const profile of browserSuiteProfiles()) {
      const cases = profileToolIds(profile).map((tool) => ({
        name: `${tool}-boundaries`,
        execute: (context, run) => boundaries(context, profile, tool, run),
      }));
      cases.push({
        name: "exact-key-index",
        execute: async (context, run) => {
          const page = await open(context, profile, "discovery-scanner", run);
          const probe = new ExactKeyIndexCase(context, page, run.requests);
          run.checks.push(await probe.run());
          run.checks.push(await probe.fundedCancellation());
        },
      });
      cases.push({
        name: "seed-history-cancellation",
        execute: async (context, run) => {
          for (const batch of [false, true]) {
            const page = await open(context, profile, "discovery-scanner", run);
            try {
              run.checks.push(
                await new SeedHistoryCancellationCase(context, page, run.requests).run(batch),
              );
            } finally {
              await page.close();
            }
          }
        },
      });
      cases.push({
        name: "descriptor-followup",
        execute: (context, run) => descriptorFollowup(context, profile, run),
      });
      cases.push({
        name: "verifier-revision",
        execute: (context, run) => verifierRevision(context, profile, run),
      });
      cases.push({
        name: "core-flow-admission",
        execute: async (context, run) => {
          const page = await open(context, profile, "activity-viewer", run);
          await new CoreFlowAdmissionCase(page).run();
          run.checks.push(
            "Core exact flow and zero; malformed confirmed/pending amounts refuse display and export",
          );
        },
      });
      for (const [name, operation] of [
        ["bip85-manual-start", Bip85ManualStartCase],
        ["coinjoin-partial", CoinJoinPartialCase],
        ["recovery-source-routing", RecoverySourceRoutingCase],
        ["mnemonic-diagnostic-lifetime", MnemonicDiagnosticLifetimeCase],
      ]) {
        cases.push({
          name,
          execute: async (context, run) => {
            const page = await open(context, profile, "key-derivation", run);
            run.checks.push(await operation.run(page));
          },
        });
      }
      // The single-key coins are the Multi-Chain Edition's only.
      if (profile.id === "multi-chain")
        cases.push({
          name: "single-key-coins",
          execute: async (context, run) => {
            const page = await open(context, profile, "key-derivation", run);
            run.checks.push(await SingleKeyCoinsCase.run(page));
          },
        });
      // The EVM networks besides Ethereum and the account coins are the Multi-Chain Edition's only.
      if (profile.id === "multi-chain") {
        cases.push({
          name: "evm-network-candidates",
          execute: async (context, run) => {
            const page = await open(context, profile, "discovery-scanner", run);
            run.checks.push(await EvmNetworkCandidatesCase.scanner(context, page, run.requests));
          },
        });
        cases.push({
          name: "evm-network-activity",
          execute: async (context, run) => {
            const page = await open(context, profile, "activity-viewer", run);
            run.checks.push(await EvmNetworkCandidatesCase.viewer(context, page, run.requests));
          },
        });
        cases.push({
          name: "account-coin-candidates",
          execute: async (context, run) => {
            const page = await open(context, profile, "discovery-scanner", run);
            run.checks.push(await AccountCoinCandidatesCase.scanner(context, page, run.requests));
          },
        });
        cases.push({
          name: "account-coin-activity",
          execute: async (context, run) => {
            const page = await open(context, profile, "activity-viewer", run);
            run.checks.push(await AccountCoinCandidatesCase.viewer(context, page, run.requests));
          },
        });
      }
      cases.push({
        name: "copy-feedback",
        execute: async (context, run) => {
          const page = await open(context, profile, "key-derivation", run);
          run.checks.push(await CopyFeedbackCase.run(page));
        },
      });
      cases.push({
        name: "protocol-navigation",
        execute: async (context, run) => {
          const page = await open(context, profile, "key-derivation", run);
          run.checks.push(await ProtocolNavigationCase.run(page));
        },
      });
      cases.push({
        name: "worker-readiness",
        execute: (context, run) => workerReadiness(context, profile, run),
      });
      cases.push({
        name: "silent-payment-lifecycle",
        execute: async (context, run) => {
          const page = await open(context, profile, "key-derivation", run);
          await SilentPaymentLifecycleCase.run(page, profile.id === "multi-chain");
          await ResultExportLifecycleCase.run(page);
          await ChildWalletLifecycleCase.run(
            page,
            profile.id === "multi-chain" ? "bitcoin" : "dash",
          );
          await SourceClipboardLifecycleCase.run(page, mnemonic);
          run.checks.push(
            "Silent Payments exact base address, labels, refusals and Clear; absent in Dash",
          );
        },
      });
      cases.push({
        name: "checked-mnemonic",
        execute: (context, run) => checkedMnemonic(context, profile, run),
      });
      // Every combination of the generation options, with screenshots of each running and done.
      cases.push({
        name: "generation-matrix",
        execute: async (context, run) => {
          run.checks.push(
            ...(await GenerationMatrixCase.run(
              context,
              profile,
              run,
              open,
              BrowserHarness.storageSnapshot,
              output,
            )),
          );
        },
      });
      cases.push({
        name: "mhfe-input-lifecycle",
        execute: (context, run) => mhfeInputLifecycle(context, profile, run),
      });
      cases.push({
        name: "mhfe-encrypt-command",
        execute: (context, run) => mhfeEncryptCommand(context, profile, run),
      });
      cases.push({
        name: "mhfe-pending-inputs",
        execute: (context, run) => mhfePendingInputs(context, profile, run),
      });
      cases.push({
        name: "mhfe-several-passwords",
        execute: (context, run) =>
          MhfeSeveralPasswordsCase.run(
            context,
            profile,
            run,
            BrowserHarness.openBackupPanel,
            BrowserHarness.storageSnapshot,
          ),
      });
      cases.push({
        name: "mhfe-container-previews",
        execute: (context, run) => mhfeContainerPreviews(context, profile, run),
      });
      cases.push({
        name: "self-tests",
        execute: (context, run) => selfTests(context, profile, run),
      });
      cases.push({
        name: "self-test-failure",
        execute: (context, run) => selfTestFailure(context, profile, run),
      });
      cases.push({ name: "coinjoin", execute: (context, run) => coinJoin(context, profile, run) });
      cases.push({
        name: "dash-keys-and-multisig",
        execute: (context, run) =>
          DashKeysAndMultisigCase.run(context, profile, run, open, BrowserHarness.storageSnapshot),
      });
      cases.push({
        name: "bip38-lifecycle",
        execute: (context, run) => bip38Lifecycle(context, profile, run),
      });
      cases.push({
        name: "bip38-message",
        execute: (context, run) => bip38(context, profile, run),
      });
      cases.push({
        name: "recovery-backup-roundtrips",
        execute: (context, run) => recoveryBackupRoundTrips(context, profile, run),
      });
      cases.push({
        name: "seedqr-hidden",
        execute: (context, run) =>
          SeedQrHiddenCase.run(
            context,
            profile,
            run,
            openWithLinkedPhrase,
            waitText,
            BrowserHarness.storageSnapshot,
          ),
      });
      cases.push({
        name: "mnemocode-stego-files",
        execute: (context, run) =>
          MnemoCodeStegoFilesCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      cases.push({
        name: "mnemocode-roundtrip",
        execute: (context, run) => mnemocodeRoundTrip(context, profile, run),
      });
      cases.push({
        name: "mnemocode-source-hints",
        execute: (context, run) =>
          MnemoCodeSourceHintsCase.run(
            context,
            profile,
            run,
            BrowserHarness.openBackupPanel,
            waitText,
          ),
      });
      cases.push({
        name: "mnemocode-encoded-retirement",
        execute: (context, run) =>
          MnemoCodeSourceHintsCase.retirement(
            context,
            profile,
            run,
            BrowserHarness.openBackupPanel,
          ),
      });
      for (const format of ["unicode", "colors-unicode"]) {
        cases.push({
          name: `mnemocode-${format}-retirement`,
          execute: (context, run) =>
            MnemoCodeSourceHintsCase.retirement(
              context,
              profile,
              run,
              BrowserHarness.openBackupPanel,
              format,
            ),
        });
      }
      cases.push({
        name: "mnemocode-reencoding",
        execute: (context, run) =>
          MnemoCodeReEncodingCase.run(context, profile, run, openWithLinkedPhrase),
      });
      cases.push({
        name: "mnemocode-self-test",
        execute: (context, run) =>
          MnemoCodeSelfTestCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      cases.push({
        name: "mnemocode-cross-stitch",
        execute: (context, run) =>
          MnemoCodeCrossStitchCase.run(
            context,
            profile,
            run,
            BrowserHarness.openSeedShiftEncoding,
            waitText,
          ),
      });
      cases.push({
        name: "mnemocode-share-forms",
        execute: (context, run) =>
          MnemoCodeShareFormsCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      for (const operation of ["restore", "repair"])
        cases.push({
          name: `mnemocode-share-hints-${operation}`,
          execute: (context, run) =>
            MnemoCodeShareHintsCase.run(
              context,
              profile,
              run,
              openWithLinkedPhrase,
              waitText,
              operation,
            ),
        });
      cases.push({
        name: "mnemocode-shares",
        execute: (context, run) => mnemocodeShares(context, profile, run),
      });
      cases.push({
        name: "mnemocode-public-references",
        execute: (context, run) =>
          MnemoCodePublicReferencesCase.run(context, profile, run, openWithLinkedPhrase),
      });
      cases.push({
        name: "mnemocode-disclosure",
        execute: (context, run) =>
          MnemoCodeDisclosureCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      cases.push({
        name: "recovery-diagnostic-retirement",
        execute: (context, run) =>
          RecoveryDiagnosticRetirementCase.run(context, profile, run, openWithLinkedPhrase),
      });
      cases.push({
        name: "mnemocode-capability-catalogs",
        execute: (context, run) =>
          MnemoCodeCapabilityCatalogsCase.run(context, profile, run, openWithLinkedPhrase),
      });
      cases.push({
        name: "mnemocode-mode-format-lengths",
        execute: (context, run) => MnemoCodeModeFormatLengthsCase.run(context, profile, run, open),
      });
      cases.push({
        name: "mnemocode-print-settings",
        execute: (context, run) =>
          MnemoCodePrintSettingsCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      cases.push({
        name: "mnemocode-raster-settings",
        execute: (context, run) =>
          MnemoCodePrintSettingsCase.rasterSettings(
            context,
            profile,
            run,
            openWithLinkedPhrase,
            waitText,
          ),
      });
      cases.push({
        name: "mnemocode-file-inputs",
        execute: (context, run) =>
          MnemoCodeFileInputsCase.run(context, profile, run, openWithLinkedPhrase, waitText),
      });
      cases.push({
        name: "mnemocode-card-text-lengths",
        execute: (context, run) =>
          MnemoCodeCardTextLengthsCase.run(context, profile, run, openWithLinkedPhrase),
      });
      cases.push({
        name: "mnemocode-cards",
        execute: (context, run) => mnemocodeCards(context, profile, run),
      });
      cases.push({
        name: "mnemocode-late-cards",
        execute: (context, run) => mnemocodeLateCards(context, profile, run),
      });
      cases.push({
        name: "mnemocode-share-list",
        execute: (context, run) => mnemocodeShareList(context, profile, run),
      });
      cases.push({
        name: "mnemocode-coin-evidence",
        execute: (context, run) => mnemocodeCoinEvidence(context, profile, run),
      });
      cases.push({
        name: "mhfe-missing-words",
        execute: (context, run) => mhfeMissingWords(context, profile, run),
      });
      cases.push({
        name: "mhfe-custom-path",
        execute: (context, run) => mhfeCustomPath(context, profile, run),
      });
      cases.push({
        name: "mhfe-made-password",
        execute: (context, run) => mhfeMadePassword(context, profile, run),
      });
      if (profile.id === "multi-chain")
        cases.push({
          name: "bip85-child-signer",
          execute: (context, run) => childWallet(context, profile, run),
        });
      for (const { name, execute: test } of cases) {
        if (process.env.BROWSER_CASES && !process.env.BROWSER_CASES.split(",").includes(name))
          continue;
        const run = {
          browser: browserName,
          version: browser.version(),
          profile: profile.id,
          name,
          passed: false,
          artifacts: {},
          checks: [],
          requests: [],
          pageErrors: [],
          console: [],
        };
        report.runs.push(run);
        const context = await browser.newContext();
        await context.route(/^https?:\/\//, async (route) => {
          run.requests.push({ url: route.request().url(), body: route.request().postData() });
          if (route.request().url() === "https://browser-regression.invalid/probe") {
            await route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } });
          } else await route.abort();
        });
        try {
          await test(context, run);
          assert.deepEqual(run.pageErrors, []);
          assert.deepEqual(await context.cookies(), []);
          run.passed = true;
        } catch (error) {
          run.error = String(error.stack ?? error);
          for (const [index, page] of context.pages().entries()) {
            await page
              .screenshot({
                path: resolve(output, `${browserName}-${profile.id}-${name}-${index}.png`),
                fullPage: true,
              })
              .catch(() => {});
          }
        } finally {
          await context.close();
          save();
        }
        console.log(
          `${run.passed ? "PASS" : "FAIL"} ${browserName} ${profile.id} ${name}${run.error ? `: ${run.error.split("\n")[0]}` : ""}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

save();

console.log(`Regression report: ${output}`);

if (report.runs.length === 0 || report.runs.some((run) => !run.passed)) process.exitCode = 1;
