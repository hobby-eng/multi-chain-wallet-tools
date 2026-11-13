// The compact message signatures of the BIP44 coins that took Bitcoin Core's signmessage over:
// Litecoin, Dogecoin, Bitcoin Cash and Zcash's transparent addresses. A coin brings its magic, the
// headers its wallets read and, per format, the script type it signs; the addresses a signature
// proves come from the coin's own encoders, so nothing is encoded twice: the row's address, and
// only the other forms the coin names, such as Bitcoin Cash's legacy address.
import type { CompactHeaders, CompactScriptType } from "@ckd/core/compact-message-headers.js";
import {
  signCompactMessage,
  verifyCompactMessage,
  type CompactMessageParameters,
} from "@ckd/core/compact-message-internal.js";
import type { Bip44CoinKeys } from "./bip44-coin.js";
import {
  ownFormat,
  type CoinMessageSigning,
  type MessageSigningRequest,
} from "./message-signing.js";

/** One compact format of a coin: its name and the script type of the rows it signs. */
interface CompactFormat {
  readonly name: string;
  readonly signingType: CompactScriptType;
}

/** A coin's compact message signing, as its wallets and nodes write it. */
export interface CompactCoinFacts {
  /** The coin's message magic, such as "Litecoin Signed Message:\n". */
  readonly magic: string;
  readonly headers: CompactHeaders;
  /** The encoders of each script type the coin's rows use; undefined for one they do not. */
  keys(type: CompactScriptType): Bip44CoinKeys | undefined;
  /** The coin's formats, by the format id its page policy offers. */
  readonly formats: Readonly<Record<string, CompactFormat>>;
  /**
   * The adapter ids of the coin's rows whose addresses have the script type `type`, which its
   * formats sign (CoinMessageSigning.formats).
   */
  adapters(type: CompactScriptType): readonly string[];
  /**
   * The keys of the other address forms a signature proves, among the encoders' payment details
   * (Bitcoin Cash's "legacyAddress"); none by default, so that, for example, Litecoin's old 3… form
   * of a nested address is never signed.
   */
  readonly otherForms?: readonly string[];
}

/** The address forms of `publicKey` under `keys` that a signature proves. */
function provenAddresses(
  keys: Bip44CoinKeys | undefined,
  publicKey: Uint8Array,
  otherForms: readonly string[],
): string[] {
  if (keys === undefined) return [];
  const { address, details = [] } = keys.address(publicKey);
  return [
    address,
    ...details
      .filter(
        (field) =>
          otherForms.includes(field.key) && field.role === "paymentAddress" && !field.secret,
      )
      .map((field) => field.value),
  ];
}

/** The compact message signing of one coin, for its derivation worker. */
export function compactCoinSigning(facts: CompactCoinFacts): CoinMessageSigning {
  const parameters = (format: string): CompactMessageParameters => {
    const own = ownFormat(facts.formats, format);
    return {
      magic: facts.magic,
      format: own.name,
      headers: facts.headers,
      signingType: own.signingType,
      addresses: (publicKey, type) =>
        provenAddresses(facts.keys(type), publicKey, facts.otherForms ?? []),
    };
  };
  return Object.freeze({
    formats: Object.freeze(
      Object.fromEntries(
        Object.entries(facts.formats).map(([format, { signingType }]) => [
          format,
          Object.freeze([...facts.adapters(signingType)]),
        ]),
      ),
    ),
    sign: (privateKey: Uint8Array, request: MessageSigningRequest) =>
      signCompactMessage(privateKey, request.address, request.message, parameters(request.format)),
    verify: (request: MessageSigningRequest, signature: string) =>
      verifyCompactMessage(request.address, request.message, signature, parameters(request.format)),
  });
}
