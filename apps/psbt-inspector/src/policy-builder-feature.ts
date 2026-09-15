import { isRangedDescriptorKey, materializeDescriptorKey } from '@ckd/core/descriptor-key.js';
import { buildDashCoreImport, type DashCoreImportArtifacts } from './dash-import.js';
import { buildPolicy, policyHex, type LockKind } from './policy.js';
import { calculatePhrasePreimage, type HashlockKind } from './preimage.js';
import { required, selectedNetwork, syncNetworkChoice } from './ui-common.js';

export function installPolicyBuilderFeature(): void {
  let dashImportArtifacts: DashCoreImportArtifacts | null = null;
  const preimagePhrase = required<HTMLInputElement>('preimage-phrase');
  const togglePreimageVisibilityButton = required<HTMLButtonElement>('toggle-preimage-visibility');
  const calculatePreimageButton = required<HTMLButtonElement>('calculate-preimage');
  const clearPreimageButton = required<HTMLButtonElement>('clear-preimage');
  const usePreimageBuilderButton = required<HTMLButtonElement>('use-preimage-builder');
  const preimageError = required<HTMLDivElement>('preimage-error');
  const preimageResults = required<HTMLElement>('preimage-results');
  const preimageRaw = required<HTMLElement>('preimage-raw');
  const preimageNormalized = required<HTMLElement>('preimage-normalized');
  const preimageNormalization = required<HTMLElement>('preimage-normalization');
  const preimageSha256 = required<HTMLElement>('preimage-sha256');
  const preimageHash256 = required<HTMLElement>('preimage-hash256');
  const preimageRipemd160 = required<HTMLElement>('preimage-ripemd160');
  const preimageHash160 = required<HTMLElement>('preimage-hash160');
  const builderChain = required<HTMLSelectElement>('builder-chain');
  const builderNetwork = required<HTMLSelectElement>('builder-network');
  const builderWrapper = required<HTMLSelectElement>('builder-wrapper');
  const builderKeyOrder = required<HTMLSelectElement>('builder-key-order');
  const policyMode = required<HTMLSelectElement>('policy-mode');
  const requiredSignatures = required<HTMLInputElement>('required-signatures');
  const publicKeys = required<HTMLTextAreaElement>('public-keys');
  const publicKeysLabel = required<HTMLLabelElement>('public-keys-label');
  const lockKind = required<HTMLSelectElement>('lock-kind');
  const lockValueField = required<HTMLElement>('lock-value-field');
  const lockValue = required<HTMLInputElement>('lock-value');
  const timeUnitField = required<HTMLElement>('time-unit-field');
  const timeUnit = required<HTMLSelectElement>('time-unit');
  const recoveryKeyField = required<HTMLElement>('recovery-key-field');
  const recoveryPublicKey = required<HTMLTextAreaElement>('recovery-public-key');
  const recoveryRequiredField = required<HTMLElement>('recovery-required-field');
  const recoveryRequired = required<HTMLInputElement>('recovery-required');
  const secondLockField = required<HTMLElement>('second-lock-field');
  const secondLockKind = required<HTMLSelectElement>('second-lock-kind');
  const secondLockValue = required<HTMLInputElement>('second-lock-value');
  const secondLockValueLabel = required<HTMLLabelElement>('second-lock-value-label');
  const secondTimeUnit = required<HTMLSelectElement>('second-time-unit');
  const emergencyKeyField = required<HTMLElement>('emergency-key-field');
  const emergencyRequiredControl = required<HTMLElement>('emergency-required-control');
  const emergencyPublicKeys = required<HTMLTextAreaElement>('emergency-public-keys');
  const emergencyRequired = required<HTMLInputElement>('emergency-required');
  const htlcHashField = required<HTMLElement>('htlc-hash-field');
  const htlcHashKind = required<HTMLSelectElement>('htlc-hash-kind');
  const htlcHashDigest = required<HTMLInputElement>('htlc-hash-digest');
  const stagedDerivationField = required<HTMLElement>('staged-derivation-field');
  const stagedMultipathChoice = required<HTMLSelectElement>('staged-multipath-choice');
  const stagedWildcardIndex = required<HTMLInputElement>('staged-wildcard-index');
  const customMiniscriptField = document.querySelector<HTMLElement>('#custom-miniscript-field');
  const customMiniscriptContext = document.querySelector<HTMLSelectElement>('#custom-miniscript-context');
  const customMiniscript = document.querySelector<HTMLTextAreaElement>('#custom-miniscript');
  const presetPolicyFields = [...document.querySelectorAll<HTMLElement>('.preset-policy-field')];
  const buildButton = required<HTMLButtonElement>('build-policy');
  const builderCardinalityNote = required<HTMLElement>('builder-cardinality-note');
  const builderError = required<HTMLDivElement>('builder-error');
  const policyResults = required<HTMLElement>('policy-results');
  const policyAddress = required<HTMLElement>('policy-address');
  const policyThresholdRow = required<HTMLElement>('policy-threshold-row');
  const policyThreshold = required<HTMLElement>('policy-threshold');
  const policyRequirement = required<HTMLElement>('policy-requirement');
  const policyCompatibility = required<HTMLElement>('policy-compatibility');
  const policyDescriptor = required<HTMLElement>('policy-descriptor');
  const policyMiniscript = required<HTMLElement>('policy-miniscript');
  const policyMiniscriptAsm = required<HTMLElement>('policy-miniscript-asm');
  const policyMiniscriptAnalysis = required<HTMLElement>('policy-miniscript-analysis');
  const policyExpression = required<HTMLElement>('policy-expression');
  const redeemScript = required<HTMLElement>('redeem-script');
  const policyScriptPubKey = required<HTMLElement>('policy-script-pubkey');
  const dashImportRow = required<HTMLElement>('dash-import-row');
  const dashImportCommand = required<HTMLElement>('dash-import-command');
  const dashGuiRow = required<HTMLElement>('dash-gui-row');
  const dashGuiCommand = required<HTMLElement>('dash-gui-command');
  const dashDescriptorRow = required<HTMLElement>('dash-descriptor-row');
  const dashDescriptorCommand = required<HTMLElement>('dash-descriptor-command');
  const dashImportWarning = required<HTMLElement>('dash-import-warning');
  const downloadDashJson = required<HTMLButtonElement>('download-dash-json');
  function syncBuilderControls(): void {
    const custom = policyMode.value === 'custom-miniscript';
    if (custom) builderChain.value = 'bitcoin';
    builderChain.disabled = custom;
    builderWrapper.disabled = builderChain.value === 'dash';
    if (builderChain.value === 'dash') builderWrapper.value = 'p2sh';
    const primaryCount = publicKeys.value
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean).length;
    const musig2 = !custom && builderWrapper.value === 'p2tr-musig2';
    if (musig2) {
      policyMode.value = 'locked-multisig';
      lockKind.value = 'none';
    }
    policyMode.disabled = musig2;
    lockKind.disabled = musig2;
    builderKeyOrder.disabled = musig2;
    const sortedOption = builderKeyOrder.querySelector<HTMLOptionElement>('option[value="bip67"]');
    const suppliedOption = builderKeyOrder.querySelector<HTMLOptionElement>('option[value="supplied"]');
    if (sortedOption !== null)
      sortedOption.textContent =
        builderWrapper.value === 'p2tr'
          ? 'Lexicographic x-only order · multi_a()'
          : builderWrapper.value === 'p2tr-musig2'
            ? 'BIP327 KeySort · required'
            : 'BIP67 sorted · sortedmulti()';
    if (suppliedOption !== null)
      suppliedOption.textContent =
        builderWrapper.value === 'p2tr' ? 'Supplied x-only order · multi_a()' : 'Supplied order · multi()';
    if (musig2) builderKeyOrder.value = 'bip67';
    presetPolicyFields.forEach((field) => {
      field.hidden = custom;
    });
    if (customMiniscriptField !== null) customMiniscriptField.hidden = !custom;
    const selectedMode = policyMode.value;
    const noLock = lockKind.value === 'none';
    lockValueField.hidden = noLock;
    timeUnitField.hidden = lockKind.value !== 'relative-time';
    recoveryKeyField.hidden = selectedMode === 'locked-multisig';
    recoveryRequiredField.hidden =
      selectedMode !== 'delayed-recovery-multisig' &&
      selectedMode !== 'backup-committee' &&
      selectedMode !== 'escalating-recovery';
    recoveryRequiredField.hidden = ![
      'htlc',
      'delayed-recovery-multisig',
      'backup-committee',
      'escalating-recovery',
      'decaying-multisig',
      'expanding-multisig',
    ].includes(selectedMode);
    secondLockField.hidden = selectedMode !== 'escalating-recovery' && selectedMode !== 'staged-recovery';
    emergencyKeyField.hidden = selectedMode !== 'escalating-recovery' && selectedMode !== 'staged-recovery';
    emergencyRequiredControl.hidden = selectedMode === 'staged-recovery';
    const stagedRecovery = selectedMode === 'staged-recovery';
    requiredSignatures.disabled = stagedRecovery || musig2;
    if (stagedRecovery) requiredSignatures.value = '1';
    if (musig2) requiredSignatures.value = String(Math.max(1, primaryCount));
    publicKeysLabel.textContent = stagedRecovery
      ? 'Primary compressed public key · exactly one'
      : musig2
        ? 'MuSig2 participant compressed public keys · one per line, all must sign'
        : builderWrapper.value === 'p2tr'
          ? 'Compressed public keys · converted to x-only for Tapscript'
          : 'Compressed public keys · one per line, in committed order';
    required<HTMLLabelElement>('emergency-public-keys-label').textContent =
      selectedMode === 'staged-recovery'
        ? 'Second delayed recovery compressed public key'
        : 'Emergency compressed public keys · one per line';
    required<HTMLLabelElement>('emergency-required-label').textContent =
      selectedMode === 'staged-recovery' ? 'Second recovery required signatures' : 'Emergency required signatures';
    htlcHashField.hidden = selectedMode !== 'htlc';
    stagedDerivationField.hidden = selectedMode !== 'staged-recovery';
    if (custom) {
      lockValueField.hidden = true;
      timeUnitField.hidden = true;
      recoveryKeyField.hidden = true;
      recoveryRequiredField.hidden = true;
      secondLockField.hidden = true;
      emergencyKeyField.hidden = true;
      htlcHashField.hidden = true;
      stagedDerivationField.hidden = true;
    }
    required<HTMLLabelElement>('recovery-public-key-label').textContent =
      selectedMode === 'staged-recovery'
        ? 'First delayed recovery compressed public key'
        : selectedMode === 'htlc'
          ? 'Timelocked fallback compressed public keys · one per line'
          : selectedMode === 'delayed-recovery'
            ? 'Recovery compressed public key'
            : selectedMode === 'backup-committee'
              ? 'Backup committee compressed public keys · one per line'
              : selectedMode === 'expanding-multisig'
                ? 'Additional expansion compressed public keys · one per line'
                : 'Recovery compressed public keys · one per line';
    if (selectedMode === 'decaying-multisig') recoveryKeyField.hidden = true;
    const labels: Record<string, string> = {
      height: 'Absolute block height',
      time: 'Unix locktime',
      'relative-blocks': 'Delay in blocks',
      'relative-time': 'Delay amount',
      none: 'Lock value',
    };
    required<HTMLLabelElement>('lock-value-label').textContent = labels[lockKind.value] ?? 'Lock value';
    secondLockValueLabel.textContent = `Second ${labels[secondLockKind.value]?.toLowerCase() ?? 'lock value'}`;
    secondTimeUnit.hidden = secondLockKind.value !== 'relative-time';
    const singleRecovery = selectedMode === 'delayed-recovery' || stagedRecovery;
    const recoveryCount = recoveryPublicKey.value
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean).length;
    const emergencyCount = emergencyPublicKeys.value
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean).length;
    publicKeys.setCustomValidity(
      stagedRecovery && primaryCount > 1 ? 'Staged recovery accepts exactly one primary key.' : '',
    );
    recoveryPublicKey.setCustomValidity(
      singleRecovery && recoveryCount > 1 ? 'This recovery branch accepts exactly one key.' : '',
    );
    emergencyPublicKeys.setCustomValidity(
      stagedRecovery && emergencyCount > 1 ? 'Staged recovery accepts exactly one second recovery key.' : '',
    );
    const tooManyKeys =
      (stagedRecovery && (primaryCount > 1 || emergencyCount > 1)) || (singleRecovery && recoveryCount > 1);
    buildButton.disabled = tooManyKeys;
    builderCardinalityNote.textContent = musig2
      ? 'MuSig2 creates one aggregate Taproot key and one cooperative Schnorr signature. Every listed participant must sign; this is N-of-N and has no Tapscript fallback.'
      : stagedRecovery
        ? 'Staged recovery is fixed to three 1-of-1 branches: one primary key, one first recovery key, and one second recovery key. Additional key lines are not accepted.'
        : selectedMode === 'delayed-recovery'
          ? 'The delayed recovery branch accepts exactly one recovery key; the immediate primary branch may remain M-of-N.'
          : selectedMode === 'decaying-multisig'
            ? 'Both branches use the same primary key set; only the required signature count decreases after the lock.'
            : 'Thresholds are validated against the number of keys supplied for each branch.';
  }

  function normalizedLockValue(): number {
    const value = Number(lockValue.value);
    if (lockKind.value !== 'relative-time') return value;
    const multipliers: Record<string, number> = {
      seconds: 1,
      minutes: 60,
      hours: 3_600,
      days: 86_400,
      months: 2_592_000,
    };
    return value * (multipliers[timeUnit.value] ?? 1);
  }

  function normalizedSecondLockValue(): number {
    const value = Number(secondLockValue.value);
    if (secondLockKind.value !== 'relative-time') return value;
    const multipliers: Record<string, number> = {
      seconds: 1,
      minutes: 60,
      hours: 3_600,
      days: 86_400,
      months: 2_592_000,
    };
    return value * (multipliers[secondTimeUnit.value] ?? 1);
  }

  function downloadText(filename: string, value: string, type: string): void {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function calculatePreimage(): void {
    preimageError.hidden = true;
    preimageResults.hidden = true;
    usePreimageBuilderButton.hidden = true;
    try {
      const result = calculatePhrasePreimage(preimagePhrase.value);
      preimageRaw.textContent = `${result.rawByteLength} bytes · ${result.rawUtf8Hex}`;
      preimageNormalized.textContent = result.preimageHex;
      preimageNormalization.textContent = result.normalization;
      preimageSha256.textContent = result.commitments.sha256;
      preimageHash256.textContent = result.commitments.hash256;
      preimageRipemd160.textContent = result.commitments.ripemd160;
      preimageHash160.textContent = result.commitments.hash160;
      preimageResults.hidden = false;
      usePreimageBuilderButton.hidden = false;
    } catch (error) {
      preimageError.textContent = error instanceof Error ? error.message : String(error);
      preimageError.hidden = false;
    }
  }

  function buildSelectedPolicy(): void {
    builderError.hidden = true;
    policyResults.hidden = true;
    try {
      const enteredKeys = publicKeys.value
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
      const enteredRecoveryKeys = recoveryPublicKey.value
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
      const enteredEmergencyKeys = emergencyPublicKeys.value
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
      const network = selectedNetwork(builderNetwork, builderChain.value === 'dash' ? 'dash' : 'bitcoin');
      const stagedRanged =
        policyMode.value === 'staged-recovery' &&
        [...enteredKeys, ...enteredRecoveryKeys, ...enteredEmergencyKeys].some(isRangedDescriptorKey);
      const materialize = (value: string): string =>
        materializeDescriptorKey(
          value,
          network,
          stagedMultipathChoice.value === '1' ? 1 : 0,
          Number(stagedWildcardIndex.value),
        );
      const keys = stagedRanged ? enteredKeys.map(materialize) : enteredKeys;
      const recoveryKeys = stagedRanged ? enteredRecoveryKeys.map(materialize) : enteredRecoveryKeys;
      const emergencyKeys = stagedRanged ? enteredEmergencyKeys.map(materialize) : enteredEmergencyKeys;
      const stagedDescriptorKeys = stagedRanged
        ? {
            primary: enteredKeys[0] ?? '',
            recovery: enteredRecoveryKeys[0] ?? '',
            emergency: enteredEmergencyKeys[0] ?? '',
          }
        : null;
      const policy = buildPolicy({
        chain: builderChain.value === 'dash' ? 'dash' : 'bitcoin',
        network,
        required: Number(requiredSignatures.value),
        publicKeys: keys,
        keyOrder: builderKeyOrder.value === 'bip67' ? 'bip67' : 'supplied',
        lockKind: lockKind.value as LockKind,
        lockValue: normalizedLockValue(),
        bitcoinWrapper:
          builderWrapper.value === 'p2sh'
            ? 'p2sh'
            : builderWrapper.value === 'p2tr'
              ? 'p2tr'
              : builderWrapper.value === 'p2tr-musig2'
                ? 'p2tr-musig2'
                : 'p2wsh',
        mode:
          policyMode.value === 'delayed-recovery'
            ? 'delayed-recovery'
            : policyMode.value === 'delayed-recovery-multisig'
              ? 'delayed-recovery-multisig'
              : policyMode.value === 'backup-committee'
                ? 'backup-committee'
                : policyMode.value === 'decaying-multisig'
                  ? 'decaying-multisig'
                  : policyMode.value === 'expanding-multisig'
                    ? 'expanding-multisig'
                    : policyMode.value === 'escalating-recovery'
                      ? 'escalating-recovery'
                      : policyMode.value === 'staged-recovery'
                        ? 'staged-recovery'
                        : policyMode.value === 'htlc'
                          ? 'htlc'
                          : policyMode.value === 'custom-miniscript'
                            ? 'custom-miniscript'
                            : 'locked-multisig',
        recoveryPublicKey: recoveryKeys[0] ?? '',
        recoveryPublicKeys: recoveryKeys,
        recoveryRequired: Number(recoveryRequired.value),
        secondLockKind: secondLockKind.value as LockKind,
        secondLockValue: normalizedSecondLockValue(),
        emergencyPublicKeys: emergencyKeys,
        emergencyRequired: Number(emergencyRequired.value),
        hashKind: htlcHashKind.value as HashlockKind,
        hashDigest: htlcHashDigest.value,
        customMiniscript: customMiniscript?.value ?? '',
        customContext: customMiniscriptContext?.value === 'tapscript' ? 'tapscript' : 'p2wsh',
        ...(stagedDescriptorKeys === null ? {} : { stagedDescriptorKeys }),
      });
      const hex = policyHex(policy);
      policyAddress.textContent = policy.address;
      policyThresholdRow.hidden = policyMode.value === 'custom-miniscript';
      const thresholds = [`Primary: ${requiredSignatures.value} of ${keys.length}`];
      const modeHasRecovery = [
        'delayed-recovery',
        'delayed-recovery-multisig',
        'backup-committee',
        'decaying-multisig',
        'expanding-multisig',
        'escalating-recovery',
        'staged-recovery',
        'htlc',
      ].includes(policyMode.value);
      if (modeHasRecovery && recoveryKeys.length > 0) {
        const recoveryThreshold = [
          'delayed-recovery-multisig',
          'backup-committee',
          'decaying-multisig',
          'expanding-multisig',
          'escalating-recovery',
        ].includes(policyMode.value)
          ? recoveryRequired.value
          : '1';
        thresholds.push(`Recovery: ${recoveryThreshold} of ${recoveryKeys.length}`);
      }
      if (emergencyKeys.length > 0) thresholds.push(`Emergency: ${emergencyRequired.value} of ${emergencyKeys.length}`);
      policyThreshold.textContent =
        thresholds.length === 1 ? `${requiredSignatures.value} of ${keys.length}` : thresholds.join('\n');
      policyRequirement.textContent = policy.spendingRequirement;
      policyCompatibility.textContent = policy.compatibility;
      policyDescriptor.textContent = policy.descriptor;
      policyMiniscript.textContent = policy.miniscript;
      policyMiniscriptAsm.textContent = policy.miniscriptAsm;
      policyMiniscriptAnalysis.textContent = policy.miniscriptAnalysis;
      policyExpression.textContent = policy.policyExpression;
      redeemScript.textContent = hex.redeemScript;
      policyScriptPubKey.textContent = hex.scriptPubKey;
      dashImportRow.hidden = builderChain.value !== 'dash';
      dashImportArtifacts =
        builderChain.value === 'dash' ? buildDashCoreImport(policy.address, hex.redeemScript, policy.descriptor) : null;
      dashGuiRow.hidden = builderChain.value !== 'dash' || dashImportArtifacts?.fullPolicyGuiCommand === null;
      dashDescriptorRow.hidden = builderChain.value !== 'dash';
      dashImportWarning.hidden = builderChain.value !== 'dash';
      dashImportCommand.textContent = dashImportArtifacts?.legacyCommand ?? '';
      dashGuiCommand.textContent = dashImportArtifacts?.fullPolicyGuiCommand ?? '';
      dashDescriptorCommand.textContent = dashImportArtifacts?.addressFallbackGuiCommand ?? '';
      policyResults.hidden = false;
    } catch (error) {
      builderError.textContent = error instanceof Error ? error.message : String(error);
      builderError.hidden = false;
    }
  }

  calculatePreimageButton.addEventListener('click', calculatePreimage);
  togglePreimageVisibilityButton.addEventListener('click', () => {
    const visible = preimagePhrase.type === 'password';
    preimagePhrase.type = visible ? 'text' : 'password';
    togglePreimageVisibilityButton.textContent = visible ? 'Hide' : 'Show';
    togglePreimageVisibilityButton.setAttribute('aria-pressed', String(visible));
  });
  clearPreimageButton.addEventListener('click', () => {
    preimagePhrase.value = '';
    preimagePhrase.type = 'password';
    togglePreimageVisibilityButton.textContent = 'Show';
    togglePreimageVisibilityButton.setAttribute('aria-pressed', 'false');
    for (const output of [
      preimageRaw,
      preimageNormalized,
      preimageNormalization,
      preimageSha256,
      preimageHash256,
      preimageRipemd160,
      preimageHash160,
    ])
      output.textContent = '';
    preimageResults.hidden = true;
    preimageError.hidden = true;
    usePreimageBuilderButton.hidden = true;
  });
  usePreimageBuilderButton.addEventListener('click', () => {
    htlcHashKind.value = 'sha256';
    htlcHashDigest.value = preimageSha256.textContent ?? '';
    policyMode.value = 'htlc';
    if (lockKind.value === 'none') {
      lockKind.value = 'relative-blocks';
      lockValue.value = '144';
    }
    syncBuilderControls();
    document.querySelector<HTMLButtonElement>('[data-mode="builder"]')?.click();
  });
  builderChain.addEventListener('change', syncBuilderControls);
  builderWrapper.addEventListener('change', syncBuilderControls);
  lockKind.addEventListener('change', syncBuilderControls);
  secondLockKind.addEventListener('change', syncBuilderControls);
  policyMode.addEventListener('change', syncBuilderControls);
  for (const keyField of [publicKeys, recoveryPublicKey, emergencyPublicKeys])
    keyField.addEventListener('input', syncBuilderControls);
  buildButton.addEventListener('click', buildSelectedPolicy);
  builderChain.addEventListener('change', () => syncNetworkChoice(builderChain, builderNetwork));
  syncNetworkChoice(builderChain, builderNetwork);
  downloadDashJson.addEventListener('click', () => {
    if (dashImportArtifacts !== null)
      downloadText('dash-core-import.json', dashImportArtifacts.rpcJson, 'application/json;charset=utf-8');
  });
  document.querySelectorAll<HTMLButtonElement>('#builder-panel [data-copy]').forEach((button) =>
    button.addEventListener('click', async () => {
      const source = required<HTMLElement>(button.dataset.copy ?? '');
      await navigator.clipboard.writeText(source.textContent ?? '');
      const old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = old;
      }, 900);
    }),
  );

  syncBuilderControls();
}
