declare const sdk: any;
const facade = sdk['addresses'];
facade?.['withdraw']?.(amount);
const method = 'creditTransfer';
sdk.identities[method](identity);
const { topUp: mutate } = sdk.identities;
mutate(identity);
const lowLevel = sdk.addressFundsTransfer;
lowLevel(request);
