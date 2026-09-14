import profileCapabilities from '../profile-capabilities.json';

export type EditionId = 'multi-chain' | 'dash-community';

export interface EditionCapabilities {
  readonly derivation: boolean;
  readonly secretBoundary: boolean;
  readonly publicNetwork: boolean;
  readonly recoveryNetwork: boolean;
  readonly offlineOnly: boolean;
  readonly recoveryAddressSearch: boolean;
  readonly bip85: boolean;
  readonly bitcoinSilentPayments: boolean;
  readonly bitcoinMessageSigning: boolean;
  readonly dashMessageSigning: boolean;
  readonly publicActivity: boolean;
  readonly discoveryScanner: boolean;
  readonly advancedPsbt: boolean;
}

export interface EditionProfile {
  readonly id: EditionId;
  readonly chains: readonly ('bitcoin' | 'dash' | 'ethereum')[];
  readonly capabilities: EditionCapabilities;
  readonly tools: Readonly<
    Record<
      'key-derivation' | 'activity-viewer' | 'discovery-scanner' | 'psbt-inspector',
      Pick<EditionCapabilities, 'secretBoundary' | 'publicNetwork' | 'recoveryNetwork' | 'offlineOnly'>
    >
  >;
}

const PROFILE_DATA = profileCapabilities as unknown as Readonly<Record<EditionId, EditionProfile>>;

export const MULTI_CHAIN_EDITION: EditionProfile = PROFILE_DATA['multi-chain'];

export const DASH_COMMUNITY_EDITION: EditionProfile = PROFILE_DATA['dash-community'];

export const EDITION_PROFILES: Readonly<Record<EditionId, EditionProfile>> = {
  'multi-chain': MULTI_CHAIN_EDITION,
  'dash-community': DASH_COMMUNITY_EDITION,
};

export function getEditionProfile(id: EditionId): EditionProfile {
  return EDITION_PROFILES[id];
}
