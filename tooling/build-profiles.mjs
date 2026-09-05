const toolDefinitions = {
  'key-derivation': {
    multiChain: {
      artifactDirectory: 'key-derivation',
      artifactName: 'Wallet_Key_Derivation_Tool.html',
      documentTitle: 'Offline Wallet Key Derivation Tool',
      entryPoint: 'apps/key-derivation/src/ui/app.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker.ts',
      eyebrow: 'MULTI-CHAIN WALLET TOOLS · OFFLINE',
      introduction: 'Derive standard Bitcoin, Ethereum, and Dash wallet keys from a 12- or 24-word English BIP39 recovery phrase.',
      footerProtocols: 'BIP39 · BIP32 · Bitcoin · Ethereum · Dash Core · Platform · Identity · Shielded',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community/key-derivation',
      artifactName: 'Dash_Community_Key_Derivation_Tool.html',
      documentTitle: 'Dash Community Edition — Wallet Key Derivation Tool',
      entryPoint: 'apps/key-derivation/src/ui/app-dash-community.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker-dash-community.ts',
      eyebrow: 'DASH COMMUNITY EDITION · OFFLINE',
      introduction: 'Derive Dash Core, Platform, Identity, and Orchard wallet keys from a 12- or 24-word English BIP39 recovery phrase.',
      footerProtocols: 'BIP39 · BIP32 · Dash Core · Platform · Identity · Orchard',
    },
  },
  'activity-viewer': {
    multiChain: {
      artifactDirectory: 'activity-viewer',
      artifactName: 'Wallet_Activity_Viewer.html',
      documentTitle: 'Wallet Activity Viewer',
      entryPoint: 'apps/activity-viewer/src/app.ts',
      eyebrow: 'WALLET ACTIVITY VIEWER · DASH',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community/activity-viewer',
      artifactName: 'Dash_Community_Activity_Viewer.html',
      documentTitle: 'Dash Community Edition — Wallet Activity Viewer',
      entryPoint: 'apps/activity-viewer/src/app-dash-community.ts',
      eyebrow: 'DASH COMMUNITY EDITION · ACTIVITY VIEWER',
    },
  },
  'discovery-scanner': {
    multiChain: {
      artifactDirectory: 'discovery-scanner',
      artifactName: 'Wallet_Discovery_Scanner.html',
      documentTitle: 'Wallet Discovery Scanner',
      entryPoint: 'apps/discovery-scanner/src/app.ts',
      eyebrow: 'WALLET DISCOVERY SCANNER · DASH',
    },
    dashCommunity: {
      artifactDirectory: 'dash-community/discovery-scanner',
      artifactName: 'Dash_Community_Discovery_Scanner.html',
      documentTitle: 'Dash Community Edition — Wallet Discovery Scanner',
      entryPoint: 'apps/discovery-scanner/src/app-dash-community.ts',
      eyebrow: 'DASH COMMUNITY EDITION · DISCOVERY SCANNER',
    },
  },
};

export const BUILD_PROFILES = {
  'multi-chain': {
    id: 'multi-chain',
    editionName: 'Multi-Chain Edition',
    brandName: 'Multi-Chain Wallet Tools',
    themeStylesheet: undefined,
    manifestPath: 'dist/SHA256SUMS',
    releaseDirectory: 'dist/release',
  },
  'dash-community': {
    id: 'dash-community',
    editionName: 'Dash Community Edition',
    brandName: 'Dash Community Edition',
    themeStylesheet: 'packages/shared-ui/styles/dash-community.css',
    manifestPath: 'dist/dash-community/SHA256SUMS',
    releaseDirectory: 'dist/dash-community/release',
  },
};

export function parseBuildProfile(args = process.argv.slice(2)) {
  const inline = args.find((arg) => arg.startsWith('--profile='));
  const index = args.indexOf('--profile');
  const id = inline?.slice('--profile='.length) ?? (index >= 0 ? args[index + 1] : undefined) ?? 'multi-chain';
  const profile = BUILD_PROFILES[id];
  if (profile === undefined) {
    throw new Error(`Unknown build profile "${id}". Expected multi-chain or dash-community.`);
  }
  return profile;
}

export function getToolBuild(profile, toolId) {
  const definitions = toolDefinitions[toolId];
  if (definitions === undefined) throw new Error(`Unknown standalone tool: ${toolId}.`);
  const tool = profile.id === 'dash-community' ? definitions.dashCommunity : definitions.multiChain;
  return {
    ...tool,
    artifactRelativePath: `${tool.artifactDirectory}/${tool.artifactName}`,
    checksumFile: `${tool.artifactName}.sha256`,
  };
}

export function applyProfileTemplate(template, profile, tool) {
  const replacements = {
    '__DOCUMENT_TITLE__': tool.documentTitle,
    '__EDITION_NAME__': profile.editionName,
    '__BUILD_PROFILE__': profile.id,
    '__BRAND_NAME__': profile.brandName,
    '__EDITION_EYEBROW__': tool.eyebrow,
    '__KEY_DERIVATION_INTRODUCTION__': tool.introduction,
    '__KEY_DERIVATION_FOOTER_PROTOCOLS__': tool.footerProtocols,
  };
  let rendered = template;
  for (const [marker, value] of Object.entries(replacements)) {
    if (value !== undefined) rendered = rendered.replaceAll(marker, value);
  }
  const remaining = rendered.match(/__(?:DOCUMENT_TITLE|EDITION_NAME|BUILD_PROFILE|BRAND_NAME|EDITION_EYEBROW|KEY_DERIVATION_[A-Z_]+)__/gu);
  if (remaining !== null) throw new Error(`Unexpanded build-profile marker: ${remaining.join(', ')}`);
  return rendered;
}

export function profileArtifacts(profile) {
  return Object.keys(toolDefinitions)
    .map((toolId) => getToolBuild(profile, toolId).artifactRelativePath)
    .sort();
}

export function assertDashOnlyGraph(inputs, label) {
  const normalized = inputs.map((input) => input.replaceAll('\\', '/'));
  const unexpected = normalized.filter((input) => {
    const packageMarker = 'packages/coin-protocols/src/coins/';
    const packageIndex = input.indexOf(packageMarker);
    if (packageIndex >= 0) {
      const relative = input.slice(packageIndex + packageMarker.length);
      return !(
        relative === 'registry-base.ts'
        || relative === 'dash-registry.ts'
        || relative === 'dash-runtime-registry.ts'
        || relative === 'adapters/dash.ts'
        || relative.startsWith('dash/')
      );
    }
    const appMarker = 'apps/discovery-scanner/src/coins/';
    const appIndex = input.indexOf(appMarker);
    if (appIndex >= 0) {
      const relative = input.slice(appIndex + appMarker.length);
      return !(
        relative === 'registry.ts'
        || relative === 'dash-community.ts'
        || relative.startsWith('dash/')
      );
    }
    return input.endsWith('packages/verification/src/derivation-self-test.ts')
      || input.endsWith('apps/discovery-scanner/src/self-test.ts');
  });
  if (unexpected.length > 0) {
    throw new Error(`${label} graph contains inputs outside the Dash allowlist: ${unexpected.join(', ')}`);
  }
}
