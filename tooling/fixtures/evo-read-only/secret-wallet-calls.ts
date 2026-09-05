declare const sdk: any;
sdk.wallet.generateMnemonic();
sdk.wallet['mnemonicToSeed'](phrase);
const method = 'deriveKeyFromSeedPhrase';
sdk.wallet?.[method]?.(params);
const { validateMnemonic: validate } = sdk.wallet;
validate(phrase);
