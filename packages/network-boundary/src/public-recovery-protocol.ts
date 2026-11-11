import type { NetworkName } from "@ckd/core/types.js";

export type PublicRecoveryRequestInput =
  | {
      operation: "address.history";
      /** `coin` is "bitcoin" or the id of an EVM network whose row names a history endpoint. */
      payload: { coin: string; network: NetworkName; address: string };
    }
  | { operation: "utxo.addresses"; payload: { network: NetworkName; addresses: string[] } }
  | {
      operation: "evm.accounts";
      /** `coin` is the id of an EVM network of the EVM network table, such as "base". */
      payload: { network: NetworkName; coin: string; addresses: string[] };
    }
  | {
      operation: "account.states";
      /** `coin` is the id of an account coin of the account coin table, such as "solana". */
      payload: { network: NetworkName; coin: string; addresses: string[] };
    };
