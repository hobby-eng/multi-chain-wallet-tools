export interface BuildInfo {
  version: string;
  releaseDate: string;
  fingerprint: string;
  checksumFile: string;
}

declare const __BUILD_INFO__: BuildInfo;

export const BUILD_INFO: BuildInfo = __BUILD_INFO__;
