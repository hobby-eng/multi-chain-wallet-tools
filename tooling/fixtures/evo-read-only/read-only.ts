const addresses = sdk.addresses;
await addresses.getManyWithProof(values);
await sdk.identities?.byPublicKeyHashWithProof(hash);
