import { validateMnemonic as validateBip39Mnemonic } from '@scure/bip39';

function validateMnemonic(value: string): boolean {
  return value.length > 0;
}

validateMnemonic('public input');
validateBip39Mnemonic('public input', []);
