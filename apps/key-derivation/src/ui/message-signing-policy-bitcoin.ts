import type { MessageSigningPolicy } from './message-signing-policy.js';

export const BITCOIN_MESSAGE_SIGNING_POLICY: MessageSigningPolicy = {
  format(resultId) {
    if (resultId === 'bitcoin-legacy') return 'bitcoin-bip322-legacy';
    if (resultId === 'bitcoin-nested-segwit') return 'bitcoin-bip322-nested';
    if (resultId === 'bitcoin-native-segwit') return 'bitcoin-bip322-native';
    if (resultId === 'bitcoin-taproot') return 'bitcoin-bip322-taproot';
    return null;
  },
  label(format) {
    if (format === 'bitcoin-compact') return 'Bitcoin compact P2PKH (BIP137)';
    if (format === 'bitcoin-bip322-legacy') return 'Bitcoin BIP-322 full · P2PKH';
    if (format === 'bitcoin-bip322-nested') return 'Bitcoin BIP-322 full · P2SH-P2WPKH';
    if (format === 'bitcoin-bip322-native') return 'Bitcoin BIP-322 simple · P2WPKH';
    if (format === 'bitcoin-bip322-taproot') return 'Bitcoin BIP-322 simple · P2TR';
    return '';
  },
  allowsLegacyChoice: (resultId) => resultId === 'bitcoin-legacy',
};
