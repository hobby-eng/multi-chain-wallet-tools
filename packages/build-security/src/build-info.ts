export interface BuildInfo {
  version: string;
  releaseDate: string;
  fingerprint: string;
  checksumFile: string;
  profile: 'multi-chain' | 'dash-community';
  edition: 'Multi-Chain Edition' | 'Dash Community Edition';
}

declare const __BUILD_INFO__: BuildInfo;

export const BUILD_INFO: BuildInfo = __BUILD_INFO__;
