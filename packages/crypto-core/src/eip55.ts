import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

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
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value))
      throw new Error("Invalid Ethereum address.");
    const body = value.slice(2);
    const address = new EthereumAddress(body.toLowerCase());
    if (body !== address.#body && body !== body.toUpperCase() && value !== address.checksummed)
      throw new Error("Invalid Ethereum address checksum.");
    return address;
  }

  get checksummed(): string {
    // EIP55 hashes the ASCII lowercase hex body, without its 0x prefix.
    const hash = bytesToHex(keccak_256(utf8ToBytes(this.#body)));
    const body = [...this.#body]
      .map((character, index) =>
        Number.parseInt(hash[index]!, 16) >= 8 ? character.toUpperCase() : character,
      )
      .join("");
    return `0x${body}`;
  }
}
