import { historyGateway } from "../../history.js";
import type { RecoveryCoinAdapter } from "../../types.js";

/**
 * The history of a finding of the EVM network `coin` (its id in the EVM network table), read through
 * the network boundary's address.history from the Blockscout root of the network's row. Only a
 * network whose row names a history endpoint is given one (Ethereum's and Ethereum Classic's).
 */
export function evmHistory(coin: string): NonNullable<RecoveryCoinAdapter["getHistory"]> {
  return async (finding, _section, network, context) => {
    const gateway = historyGateway(context);
    return gateway.runPublic(
      { coin, network, address: finding.title },
      "address.history",
      () => context.networkApi.addressHistory(coin, network, finding.title, context.signal),
      context.signal,
    );
  };
}
