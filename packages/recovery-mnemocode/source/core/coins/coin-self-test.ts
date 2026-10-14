// The self-test of the addresses of one coin family (core/coins/), which each family's module
// builds from its own vectors (dash-self-test.ts and the others beside it), so that a host that
// builds in one family, such as the Dash edition of the Deriver, carries the code, vectors and
// words of no other: every address of the public phrase found where its wallets put it, an address
// of the wallet given at another place not found, a second address found among the first two and
// not at the first alone, and addresses that no wallet can match refused, naming why.
//
// It derives every key from the published seeds of the public phrase (master-fingerprint-
// self-test.ts), so it needs nothing from the host. It holds public test data, no secret.
//
// The vectors: the Bitcoin mainnet values at index 0 are the published vectors of BIP84 and BIP86
// and, computed independently with Python's hashlib, of BIP44 and BIP49; the Dash Platform ones
// are the official DIP17/DIP18 vectors. The others were first computed with @scure/bip32,
// @noble/hashes, @noble/curves and @scure/base, and ethers for EIP-55, the libraries this code
// uses too; all of them were then recomputed with a pure Python implementation that shares no
// library with it (its own Keccak, Bech32 and Bech32m, CashAddr, Base58 and XRP's alphabet) and
// first reproduces the published vectors, and they agree.
//
// Host-neutral: it imports only core/coin-address-evidence.ts and other self-test modules.

import { CoinAddressCheck } from "../coin-address-evidence.js";
import { PUBLIC_MNEMONIC, PUBLIC_PHRASE_SEEDS } from "../master-fingerprint-self-test.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "../self-test-check.js";
import type { AddressLocation, Coin } from "./coin.js";

/** Where the wallet of the public phrase has an address of a coin, with its BIP39 passphrase. */
export interface CoinVector {
  readonly coin: Coin;
  readonly passphrase: string;
  readonly path: string;
  readonly address: string;
}

/** An address that no wallet can match, and why it is refused. */
export interface CoinRefusal {
  readonly coin: Coin;
  readonly address: string;
  readonly because: RegExp;
}

/** The known answers of a coin family. */
export interface CoinFamilyAnswers {
  /** The row of the full self-test, such as "Dash addresses". */
  readonly name: string;
  readonly vectors: readonly CoinVector[];
  /** The places in `vectors` checked at every start; the full self-test checks them all. */
  readonly startup: readonly number[];
  /** The place of a vector away from the first address, given at the first: not found there. */
  readonly elsewhere: number;
  /** The place of a vector at index 1 of its branch: found among two from 0, not at 0 alone. */
  readonly scanned?: number;
  readonly refused: readonly CoinRefusal[];
}

const checks = new CoinAddressCheck(PUBLIC_PHRASE_SEEDS);

/**
 * The account, branch and index of a path: its last three steps, DIP17's hardened ones too. Its
 * own simple reading, not address-scan's, so that the self-test stays independent; the unit tests
 * read their vectors' paths with it too.
 */
export function locationOf(path: string): AddressLocation {
  const [account, branch, index] = path
    .split("/")
    .slice(-3)
    .map((step) => Number.parseInt(step, 10));
  return { account: account!, branch: branch!, index: index! };
}

/** Where the wallet has `vector`'s address when it is given at `location`, among `addresses`. */
function foundAt(vector: CoinVector, location: AddressLocation, addresses?: number): string {
  const match = checks.match(
    PUBLIC_MNEMONIC,
    { coin: vector.coin, value: vector.address, location, addresses },
    vector.passphrase,
  );
  return match.matched ? `${match.path} ${match.derived}` : "not matched";
}

function checkVector(vector: CoinVector): void {
  expectSame(
    foundAt(vector, locationOf(vector.path)),
    `${vector.path} ${vector.address}`,
    `${vector.coin.name} ${vector.path}`,
  );
}

/** The checks of a coin family, at every start and in the full self-test. */
export function coinFamilySelfTest(answers: CoinFamilyAnswers): SelfTestFeature {
  const vector = (place: number): CoinVector => answers.vectors[place]!;
  const startup = (): void => {
    for (const place of answers.startup) checkVector(vector(place));
    const away = vector(answers.elsewhere);
    expectSame(
      foundAt(away, { account: 0, branch: 0, index: 0 }),
      "not matched",
      `${away.coin.name} address at another place`,
    );
    if (answers.scanned === undefined) return;
    const second = vector(answers.scanned);
    const first = { ...locationOf(second.path), index: 0 };
    expectSame(
      foundAt(second, first, 2),
      `${second.path} ${second.address}`,
      `${second.coin.name} second address among two`,
    );
    expectSame(foundAt(second, first, 1), "not matched", `${second.coin.name} first address`);
  };
  const run = (): void => {
    startup();
    answers.vectors.forEach(checkVector);
    for (const { coin, address, because } of answers.refused)
      expectRefused(() => coin.parse(address), because, `A refused ${coin.name} address`);
  };
  return selfTestFeature({
    name: answers.name,
    detail: `${answers.vectors.length} addresses, another place, ${answers.scanned === undefined ? "" : "a scan, "}refusals`,
    startup,
    run,
  });
}
