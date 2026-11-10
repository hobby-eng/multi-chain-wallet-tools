import { balanceOnlyHistory } from "@ckd/network-boundary/recovery-history.js";
import {
  ACCOUNT_COIN_ERRORS,
  accountAmountUnit,
} from "@ckd/public-data-providers/account-coin-facts.js";
import type {
  AccountStatesReader,
  AccountStatesService,
} from "@ckd/public-data-providers/account-states-service.js";
import type { ExternalActivityAdapter } from "./external-activity.js";

type AccountStatesLookup = Pick<AccountStatesService, "states">;

/** The known answers of the reader's typed form: its vectors read and refused as stated. */
function addressFormSelfTest(reader: AccountStatesReader): readonly string[] {
  const { name, typed, canonical, refused } = reader.addressVectors;
  if (reader.account(typed) !== canonical) throw new Error(`Self-test failed: ${name}.`);
  if (reader.account(refused) !== null) throw new Error(`Self-test failed: ${name} refusal.`);
  return [name];
}

/** The line of an account coin's sequence, which XRP's and Stellar's accounts have. */
const SEQUENCE_LABEL = "Account sequence";

/**
 * The public-address activity of an account coin (a row of the account coin table, read by
 * `reader`): its balance, its account sequence where the coin has one and the height the provider
 * read, from `accounts`; Mainnet only, its history unsupported. A person types the coin's typed
 * form (NEAR's public key), and the account it names is read.
 */
export function createAccountActivityAdapter(
  reader: AccountStatesReader,
  accounts: AccountStatesLookup,
): ExternalActivityAdapter {
  const { facts, addressForm, inputNote, typedName } = reader;
  const { label } = facts;
  // Where a person types something else than the address (NEAR's public key), the input names it.
  const typed = typedName ?? "address";
  return {
    id: facts.id,
    label,
    asset: facts.asset,
    decimals: facts.decimals,
    networks: ["mainnet"],
    readsHistory: false,
    ...(reader.sequence ? { nonceLabel: SEQUENCE_LABEL } : {}),
    ...(typedName === undefined ? {} : { inputName: typedName }),
    ...(inputNote === undefined ? {} : { privateMaterialHint: inputNote }),
    singlePlaceholder: `Paste one ${label} ${typed} (${addressForm})`,
    batchPlaceholder: `One ${label} ${typed} (${addressForm}) per line`,
    normalize: (value) => {
      const account = reader.account(value);
      if (account === null)
        throw new Error(`Enter ${label} ${typed}s only (${addressForm}, with a valid form).`);
      return account;
    },
    selfTest: () => addressFormSelfTest(reader),
    // The canonical form names one account.
    dedupeKey: (value) => value,
    async query(address, network, signal) {
      const view = await accounts.states(facts.id, network, [address], signal);
      const [state] = view.entries;
      if (state === undefined) throw ACCOUNT_COIN_ERRORS.response(label, "no account state");
      return {
        coin: facts.id,
        address: state.address,
        balanceAtomic: BigInt(state.balance),
        nonce: state.sequence === null ? null : BigInt(state.sequence),
        blockHeight: view.height === null ? null : BigInt(view.height),
        history: balanceOnlyHistory(
          accountAmountUnit(facts),
          label,
          facts.endpoint,
          reader.sequence ? "balance and account sequence" : "balance",
        ),
      };
    },
  };
}
