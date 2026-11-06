import { Bip38Feature } from "../src/bip38-feature.js";
import { CompleteIdPage } from "../../../test/support/complete-id-page.js";

/** Published BIP38 compressed vector and its independently encoded compressed mainnet WIF. */
export const BIP38_PUBLIC_ANSWER = {
  encryptedKey: "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
  password: "Satoshi",
  privateKeyHex: "09c2686880095b1a4c249ee3ac4eea8a014f11e6f986d0b5025ac1f39afbd9ae",
  wif: "KwYgW8gcxj1JWJXhPSu4Fqwzfhp5Yfi42mdYmMa4XqK7NJxXUSK7",
} as const;

/** Real feature and decryptor, with only the native DOM supplied by this test boundary. */
export class Bip38TestPage extends CompleteIdPage {
  readonly feature: Bip38Feature;
  constructor() {
    super();
    this.require("bip38-chain").value = "bitcoin";
    this.require("bip38-network").value = "mainnet";
    this.feature = new Bip38Feature();
  }

  start(
    password: string = BIP38_PUBLIC_ANSWER.password,
    key: string = BIP38_PUBLIC_ANSWER.encryptedKey,
  ): void {
    this.require("bip38-encrypted-key").value = key;
    this.require("bip38-password").value = password;
    this.require("decrypt-bip38").click();
  }

  secrets(): number {
    return this.require("bip38-result-list").querySelectorAll("[data-bip38-secret]").length;
  }
  dispose(): void {
    this.window.dispatchEvent(new Event("pagehide"));
  }
}
