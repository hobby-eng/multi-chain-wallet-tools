// Cardano's known answers for the full self-test, beyond the startup ones
// (packages/verification/src/derivation-self-test-cardano.ts), each from a published file:
// - Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/address.rs bip32_15_base,
//   bip32_15_enterprise, bip32_24_base and bip32_24_enterprise: the mainnet addresses of two
//   Icarus roots given by their entropy.
// - trezor-firmware @433075c common/tests/fixtures/cardano/get_base_address.derivations.json: the
//   base addresses of one 24-word phrase under Icarus, Icarus-Trezor and Ledger.
// - cardano-foundation/CIPs @7720fed CIP-0019/README.md "Test Vectors": the mainnet base,
//   enterprise and reward addresses of a payment key and a stake key.
// - IntersectMBO/cardano-addresses @27a2776 test/golden/addresses_775fd04c/golden: the account
//   private key and the first address's public key below a 24-word phrase's root.
// - cardano-foundation/CIPs @7720fed CIP-0011/README.md "Test vectors": the reward address of a
//   15-word phrase's stake key.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { hexToBytes, wipe } from "@ckd/core/crypto.js";
import {
  cardanoBaseAddress,
  cardanoEnterpriseAddress,
  cardanoRewardAddress,
} from "@ckd/coins/cardano/address.js";
import { CARDANO_ROLES } from "@ckd/coins/cardano/profiles.js";
import {
  bech32Bytes,
  cardanoValue,
  icarusRoot,
  TREZOR_PHRASE,
} from "../../../../packages/verification/src/derivation-self-test-cardano.js";
import { expectEqual, now, resultValue } from "../../../../packages/verification/src/helpers.js";

const CHECKS = Object.freeze({
  addresses: "Cardano addresses of 15- and 24-word Icarus roots · cardano-serialization-lib",
  trezor: "Cardano base addresses under Icarus, Icarus-Trezor and Ledger · Trezor",
  cip19: "Cardano address encodings · CIP-19",
  keys: "Cardano account and address keys · cardano-addresses",
  reward: "Cardano stake address · CIP-11",
});

/** The base and enterprise addresses of the first receive key below `root` (Icarus). */
function receiveAddresses(root: Uint8Array): readonly [string, string] {
  return cardanoValue(
    "cardano",
    root,
    CARDANO_ROLES.external,
    (result) => [resultValue(result, "address"), resultValue(result, "enterpriseAddress")] as const,
  );
}

/** cardano-serialization-lib's addresses of its 15- and 24-word entropies. */
function checkSerializationLib(): void {
  const vectors = [
    {
      entropy: "0ccb74f36b7da1649a8144675522d4d8097c6412",
      base: "addr1q9u5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qld6xc3",
      enterprise: "addr1v9u5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5eg0kvk0f",
    },
    {
      entropy: "4e828f9a67ddcff0e6391ad4f26ddb7579f59ba14b6dd4baf63dcfdb9d2420da",
      base: "addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmn8k8ttq8f3gag0h89aepvx3xf69g0l9pf80tqv7cve0l33sdn8p3d",
      enterprise: "addr1vyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmnqs6l44z",
    },
  ];
  for (const { entropy, base, enterprise } of vectors) {
    const root = icarusRoot(entropy, "icarus");
    try {
      const [derivedBase, derivedEnterprise] = receiveAddresses(root);
      expectEqual(`${CHECKS.addresses}: base`, derivedBase, base);
      expectEqual(`${CHECKS.addresses}: enterprise`, derivedEnterprise, enterprise);
    } finally {
      wipe(root);
    }
  }
}

/** Trezor's base addresses of its 24-word phrase under its three master keys. */
function checkTrezor(): void {
  const icarus = icarusRoot(TREZOR_PHRASE.entropy, "icarus");
  const trezor = icarusRoot(TREZOR_PHRASE.entropy, "icarus-trezor");
  const seed = hexToBytes(TREZOR_PHRASE.seed);
  const base = (id: string, from: Uint8Array) =>
    cardanoValue(id, from, CARDANO_ROLES.external, (result) => resultValue(result, "address"));
  try {
    expectEqual(
      `${CHECKS.trezor}: Icarus`,
      base("cardano", icarus),
      "addr1q996av5n0379tp8yllaxtgj3ffntmlrsl9sah237h65x6yt76a24dxtkgy59n8tvk00jf5dwfp8cz50g0uheuzfddcnqxp4njq",
    );
    expectEqual(
      `${CHECKS.trezor}: Icarus-Trezor`,
      base("cardano-icarus-trezor", trezor),
      "addr1q8g9th06vccxzl96nr905al0vgg2t0fqfxrxmv7ecye3x2e66sl9kvzd905ad5natzd5wghy2w3a9lm0y7u7c5sv0c2snql3c4",
    );
    expectEqual(
      `${CHECKS.trezor}: Ledger`,
      base("cardano-ledger", seed),
      "addr1q8afdsv8q9hr4z8qljl3qz3rvm048g8j506j6umrpg63nytg4txp8fd25x5lnmkdh5p9wudkh4llu4dxyc3jyjef0gwqa5dzfd",
    );
  } finally {
    wipe(icarus, trezor, seed);
  }
}

/** CIP-19's addresses of its published payment key and stake key. */
function checkCip19(): void {
  const payment = bech32Bytes("addr_vk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7st80zhd");
  const stake = bech32Bytes("stake_vk1px4j0r2fk7ux5p23shz8f3y5y2qam7s954rgf3lg5merqcj6aetsft99wu");
  expectEqual(
    `${CHECKS.cip19}: type 0`,
    cardanoBaseAddress(payment, stake),
    "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
  );
  expectEqual(
    `${CHECKS.cip19}: type 6`,
    cardanoEnterpriseAddress(payment),
    "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
  );
  expectEqual(
    `${CHECKS.cip19}: type 14`,
    cardanoRewardAddress(stake),
    "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw",
  );
}

/** cardano-addresses' account private key and first address public key of its 24-word golden. */
function checkCardanoAddresses(): void {
  const root = bech32Bytes(
    "root_xsk1nzwq05qw3573slqc2he9g68qz0a3hjkexsc0ck3f3gjesqs33az3aprtwwnz0322ky75navetwzk8ve2mpsvqxdz3v9e2vsfe5gmcxzr2j9pn432xnghzjc6cgvsx5jwllat5qxy7n7tyqmyjesmv83v5cg2v2tz",
  );
  try {
    const [account, address] = cardanoValue(
      "cardano",
      root,
      CARDANO_ROLES.external,
      (result) =>
        [
          resultValue(result, "accountPrivateKey"),
          resultValue(result, "extendedPublicKey"),
        ] as const,
    );
    expectEqual(
      `${CHECKS.keys}: account`,
      account,
      "acct_xsk1grmww8c9yftkd6nlmuh7wypx46duh8az7sxyg88fr4k3qpc33azk8gc5ntllturxzee5gj2zd5dy48f0ehp6lqudkwvacxjznz8j0mzd2ad0t2fmmaystgms97k7maz3afvy0ywjxwk7jzt96cyt43tnqsr5dmk0",
    );
    expectEqual(
      `${CHECKS.keys}: address`,
      address,
      "addr_xvk1lytzhygjvgftw9gqazwu0k33zywlc9rx48ey7j9rfel222wj6vup0mpq663q84emmgc9vw7jpu5uswnn972jfst2jwccz7v2ltmcsrgmnsayh",
    );
  } finally {
    wipe(root);
  }
}

/** CIP-11's reward address of the stake key of its 15-word phrase, given by its entropy. */
function checkCip11(): void {
  const root = icarusRoot("aa45d157b32cc113c9f35a0abbc1146cc49c8570", "icarus");
  try {
    expectEqual(
      CHECKS.reward,
      cardanoValue("cardano", root, CARDANO_ROLES.staking, (result) =>
        resultValue(result, "address"),
      ),
      "stake1uy8ykk8dzmeqxm05znz65nhr80m0k3gxnjvdngf8azh6sjc6hyh36",
    );
  } finally {
    wipe(root);
  }
}

/** The full self-test's Cardano known answers. */
export function runCardanoKeyFullSelfTest(): CryptoSelfTestReport {
  const started = now();
  checkSerializationLib();
  checkTrezor();
  checkCip19();
  checkCardanoAddresses();
  checkCip11();
  return {
    passed: true,
    checks: Object.values(CHECKS),
    durationMs: Math.round(now() - started),
  };
}
