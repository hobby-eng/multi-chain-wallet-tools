declare const sdk: any;
(sdk as any).addresses.getManyWithProof([]);
(<any>sdk).identities.getWithProof("public-id");
(sdk satisfies any).tokens.getBalance("public-id");
const addresses = (sdk as any).addresses;
addresses.getManyWithProof?.([]);
