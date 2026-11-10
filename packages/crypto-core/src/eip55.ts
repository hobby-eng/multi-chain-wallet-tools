import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** The shape of an EVM account address: 0x and 40 hexadecimal digits, in any case. */
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;

/** One checksum implementation, with separate formatting and public-input admission contracts. */
export class EthereumAddress {
  readonly #body: string;

  private constructor(body: string) {
    this.#body = body;
  }

  /** Formatting accepts bare or prefixed hex and deliberately replaces any input casing. */
  static fromHex(value: string): EthereumAddress {
    const body = value.toLowerCase().replace(/^0x/u, "");
    if (!/^[0-9a-f]{40}$/u.test(body))
      throw new Error("Ethereum address must contain 40 hex characters.");
    return new EthereumAddress(body);
  }

  /** Connected input requires 0x and rejects a mixed-case value with an incorrect checksum. */
  static parse(value: unknown): EthereumAddress {
    if (typeof value !== "string" || !EVM_ADDRESS_PATTERN.test(value))
      throw new Error("Invalid Ethereum address.");
    if (!EthereumAddress.accepts(value)) throw new Error("Invalid Ethereum address checksum.");
    return new EthereumAddress(value.slice(2).toLowerCase());
  }

  /**
   * Whether `value` is an address a person may paste: the EVM shape, all in one case or with a
   * correct EIP-55 checksum, so that one mistyped character of a checksummed address is refused.
   */
  static accepts(value: string): boolean {
    if (!EVM_ADDRESS_PATTERN.test(value)) return false;
    const body = value.slice(2);
    if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
    return EthereumAddress.fromHex(body).checksummed === value;
  }

  get checksummed(): string {
    // EIP55 hashes the ASCII lowercase hex body, without its 0x prefix.
    const hash = bytesToHex(keccak_256(utf8ToBytes(this.#body)));
    const body = [...this.#body]
      .map((character, index) =>
        Number.parseInt(hash.charAt(index), 16) >= 8 ? character.toUpperCase() : character,
      )
      .join("");
    return `0x${body}`;
  }
}
