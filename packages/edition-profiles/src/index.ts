import profileCapabilities from '../profile-capabilities.json';

type EditionId = 'multi-chain' | 'dash-community';

interface EditionCapabilities {
  readonly bip85: boolean;
  readonly bitcoinSilentPayments: boolean;
  readonly bitcoinMessageSigning: boolean;
  readonly advancedPsbt: boolean;
}

interface EditionProfile {
  readonly id: EditionId;
  readonly chains: readonly ('bitcoin' | 'dash' | 'ethereum')[];
  readonly capabilities: EditionCapabilities;
}

const PROFILE_DATA = profileCapabilities as unknown as Readonly<Record<EditionId, EditionProfile>>;

export const MULTI_CHAIN_EDITION: EditionProfile = PROFILE_DATA['multi-chain'];

export const DASH_COMMUNITY_EDITION: EditionProfile = PROFILE_DATA['dash-community'];
