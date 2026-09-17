import profileCapabilities from '../packages/edition-profiles/profile-capabilities.json' with { type: 'json' };

export const TOOL_DEFINITIONS = {
  'key-derivation': {
    multiChain: {
      artifactDirectory: 'multi-chain-edition/key-derivation',
      artifactName: 'Wallet_Key_Derivation_Tool.html',
      documentTitle: 'Offline Wallet Key Derivation Tool',
      entryPoint: 'apps/key-derivation/src/ui/app.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker.ts',
      eyebrow: 'KEY DERIVATION TOOL',
      introduction:
        'Derive wallet keys from a 12-, 15-, 18-, 21-, or 24-word English BIP39 recovery phrase using the protocols available in this build.',
      footerProtocols: 'BIP39 · BIP32 · Bitcoin · Ethereum · Dash Core · Platform · Identity · Shielded',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community-edition/key-derivation',
      artifactName: 'Dash_Community_Key_Derivation_Tool.html',
      documentTitle: 'Dash Community Edition — Wallet Key Derivation Tool',
      entryPoint: 'apps/key-derivation/src/ui/app-dash-community.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker-dash-community.ts',
      eyebrow: 'KEY DERIVATION TOOL',
      introduction:
        'Derive Dash Core, Platform, Identity, and Orchard wallet keys from a 12-, 15-, 18-, 21-, or 24-word English BIP39 recovery phrase.',
      footerProtocols: 'BIP39 · BIP32 · Dash Core · Platform · Identity · Orchard',
    },
  },
  'activity-viewer': {
    multiChain: {
      artifactDirectory: 'multi-chain-edition/activity-viewer',
      artifactName: 'Wallet_Activity_Viewer.html',
      documentTitle: 'Wallet Activity Viewer',
      entryPoint: 'apps/activity-viewer/src/app.ts',
      eyebrow: 'ACTIVITY VIEWER',
      introduction:
        'Inspect supported public addresses, identities, and privacy-preserving activity with local validation and proof-aware network queries.',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community-edition/activity-viewer',
      artifactName: 'Dash_Community_Activity_Viewer.html',
      documentTitle: 'Dash Community Edition — Wallet Activity Viewer',
      entryPoint: 'apps/activity-viewer/src/app-dash-community.ts',
      eyebrow: 'ACTIVITY VIEWER',
      introduction:
        'Scan Orchard activity locally, inspect public Core and Platform addresses, or resolve a Dash Platform Identity with proof-verified keys and state.',
    },
  },
  'discovery-scanner': {
    multiChain: {
      artifactDirectory: 'multi-chain-edition/discovery-scanner',
      artifactName: 'Wallet_Discovery_Scanner.html',
      documentTitle: 'Wallet Discovery Scanner',
      entryPoint: 'apps/discovery-scanner/src/app.ts',
      eyebrow: 'DISCOVERY SCANNER',
      introduction:
        'Search supported wallet account structures from one or several BIP39 recovery phrases, then review and export discovery findings.',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community-edition/discovery-scanner',
      artifactName: 'Dash_Community_Discovery_Scanner.html',
      documentTitle: 'Dash Community Edition — Wallet Discovery Scanner',
      entryPoint: 'apps/discovery-scanner/src/app-dash-community.ts',
      eyebrow: 'DISCOVERY SCANNER',
      introduction:
        'Scan Dash Core receive and change chains, Platform payment addresses, identities, and the complete Orchard pool from one or several BIP39 phrases.',
    },
  },
  'psbt-inspector': {
    multiChain: {
      artifactDirectory: 'multi-chain-edition/psbt-inspector',
      artifactName: 'PSBT_Multisig_Inspector.html',
      documentTitle: 'PSBT & Multisig Inspector',
      entryPoint: 'apps/psbt-inspector/src/app.ts',
      eyebrow: 'PSBT & MULTISIG INSPECTOR',
      introduction:
        'Decode PSBT and Script hex locally, then build auditable multisig or timelocked output policies without a network connection.',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community-edition/psbt-inspector',
      artifactName: 'Dash_Community_PSBT_Multisig_Inspector.html',
      documentTitle: 'Dash Community Edition — PSBT & Multisig Inspector',
      entryPoint: 'apps/psbt-inspector/src/app.ts',
      eyebrow: 'DASH PSBT & MULTISIG INSPECTOR',
      introduction:
        'Decode Dash Core PSBT v0 and legacy Script locally, then build Dash P2SH multisig, hashlock, and timelocked recovery policies without a network connection.',
    },
  },
};

export const BUILD_PROFILES = {
  'multi-chain': {
    id: 'multi-chain',
    editionName: 'Multi-Chain Edition',
    brandName: 'Multi-Chain Wallet Tools',
    capabilities: profileCapabilities['multi-chain'].capabilities,
    themeStylesheet: undefined,
    outputDirectory: 'multi-chain-edition',
    manifestPath: 'dist/multi-chain-edition/SHA256SUMS',
    releaseDirectory: 'dist/multi-chain-edition/release',
  },
  'dash-community': {
    id: 'dash-community',
    editionName: 'Dash Community Edition',
    brandName: 'Dash Community Edition',
    capabilities: profileCapabilities['dash-community'].capabilities,
    themeStylesheet: 'packages/shared-ui/styles/dash-community.css',
    outputDirectory: 'dash-community-edition',
    manifestPath: 'dist/dash-community-edition/SHA256SUMS',
    releaseDirectory: 'dist/dash-community-edition/release',
  },
};
