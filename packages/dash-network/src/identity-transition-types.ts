const CREATION_KINDS = [
  ["IdentityCreate", "IDENTITY_CREATE"],
  ["IdentityCreateFromAddresses", "IDENTITY_CREATE_FROM_ADDRESSES"],
  ["IdentityCreateFromShieldedPool", "IDENTITY_CREATE_FROM_SHIELDED_POOL"],
] as const;

/** One identity-creation vocabulary for SDK actions and explorer transition names. */
export class IdentityCreationKinds {
  readonly #actions = new Set<string>(CREATION_KINDS.map(([action]) => action));
  readonly #explorerTypes = new Set<string>(CREATION_KINDS.map(([, type]) => type));

  isAction(action: string): boolean {
    return this.#actions.has(action);
  }

  isExplorerType(type: string): boolean {
    return this.#explorerTypes.has(type);
  }
}

export const IDENTITY_CREATION_KINDS = new IdentityCreationKinds();
