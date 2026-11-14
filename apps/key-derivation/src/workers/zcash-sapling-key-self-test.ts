// Zcash Sapling's known answers for the full self-test, beyond the startup ones
// (packages/verification/src/derivation-self-test-zcash.ts), each from a published file:
// - zcash/zcash-test-vectors @78321be test-vectors/json/ (test/fixtures/zcash-test-vectors):
//   sapling_zip32_hard.json (the extended keys and diversifiers d0, d1, d2 and dmax of its four
//   rows), sapling_key_components.json (its first two rows), unified_address.json (account 0 at
//   j = 0 and 3 with P2PKH and Sapling receivers, account 15 at j = 0 with Sapling alone),
//   unified_full_viewing_keys.json and unified_incoming_viewing_keys.json (accounts 2 and 3) and
//   f4jumble.json (its 48- and 64-byte messages).
// - zcash-swift-wallet-sdk @01eb750 Tests/OfflineTests/DerivationToolTests/
//   DerivationToolMainnetTests.swift: the Sapling and P2PKH items of the UFVK it asserts for its
//   seedData (L14, L32-38), and the zxviews text it declares for that account (L41-46).
// - zcash-android-wallet-sdk @1aaf2c4 sdk-lib/src/androidTest/java/cash/z/ecc/android/sdk/jni/
//   TransparentTest.kt: the Sapling and P2PKH receivers of the unified address it asserts for its
//   PHRASE (L49-51, L59), at j = 1, the diversifier of that Sapling receiver, and so no address at
//   j = 0. The phrase is given as its BIP39 seed, an own value of
//   test/oracles/zcash_sapling_oracle.py, so that the worker needs no word list.
// - The extended spending key text of "abandon … about"'s account 0, an own value of the same
//   oracle, which first reproduces every published value above.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import type { DerivationResult } from "@ckd/core/types.js";
import { bytesToHex, hexToBytes, wipe } from "@ckd/core/crypto.js";
import { decodeUnified, f4Jumble, f4JumbleInverse } from "@ckd/coins/zcash/unified.js";
import {
  SaplingExpandedSpendingKey,
  SaplingExtendedSpendingKey,
} from "../../../../packages/coin-protocols/src/zip32-sapling.js";
import {
  ZCASH_VECTOR_SEED,
  zcashSaplingValue,
} from "../../../../packages/verification/src/derivation-self-test-zcash.js";
import {
  ABANDON_ABOUT_SEED_HEX,
  expectEqual,
  now,
  resultValue,
} from "../../../../packages/verification/src/helpers.js";

const CHECKS = Object.freeze({
  keys: "Zcash ZIP-32 Sapling keys of four hardened paths · zcash-test-vectors",
  components: "Zcash Sapling key components · zcash-test-vectors",
  unified: "Zcash unified addresses and viewing keys of Sapling accounts · ZIP-316 vectors",
  jumble: "Zcash F4Jumble · ZIP-316 vectors",
  wallets: "Zcash viewing keys of the Swift SDK and addresses of the Android SDK's phrase",
  spendingKey: "Zcash Sapling extended spending key text · own value",
});

/** sapling_zip32_hard.json: each row's hardened path below m, extended keys and d0, d1, d2, dmax. */
const HARD_ROWS = [
  {
    path: [],
    xsk: "000000000000000000d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668eb6c00c93d36032b9a268e99e86a860776560bf0e83c1a10b51f607c9547425068204ede83b2f1fbd84f9b45d7f996e2ebd0a030ad243b48ed39f748a8821ea06395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb2177c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
    xfvk: "000000000000000000d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668e93442e5feffbff16e7217202dc7306729ffffe85af5683bce2642e3eeb5d3871dce8e7edece04b8950417f85ba57691b783c45b1a27422db1693dceb67b10106395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb2177c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
    diversifiers: ["d8621b981cf300e9d4cc89", "48ea17a199c84bd1baa5d4", null, null],
  },
  {
    path: [1],
    xsk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbd5f7e92efb7abe04dc8c148b0b3b0fc23e0429f00208ff93b68d21a6e131bd04372a7c6822cbe603f3465c4b9b6558f3a3512decd434012e67bffcf657e5750a2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
    xfvk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbcfca79d337bc689813e409a54e3e72ad8e2f703ae6f8223c9becbde9a8a35f53513de64085d35a3adf23d89d5a21cdee4db4c625bd6a3c3c624bef4344141deb2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
    diversifiers: [null, "bcc323e8da39b496c05051", null, "2514320d339c666a254c06"],
  },
  {
    path: [1, 2],
    xsk: "02768423cb020000804479086c75d080796020f500c1e30a54cfe29dda36f2144fb33a50806fbef7da7ff35db69e13c36f59ad9c08d32d5227378da0cff971fd424baef9a6332f5106779c6ee4a03944eba28bc9bdc1329a391407f48c410d5ae0a364f59959bfde00d9fc7101bf907f41886a7330a5d6a7bd23535e305eb7679bc23d7605936185ace4699e9a86e031c54b21cdd0960ac18ddd61ec9f7ae98d5582a6faf65f3248d1",
    xfvk: "02768423cb020000804479086c75d080796020f500c1e30a54cfe29dda36f2144fb33a50806fbef7da9a853f9544713797e0851764da392e68534b1d948dae4742ee765c727572ab4ef166a28a4f88cec12141a82d2120bd6d8caf879c9a1b3ad2118501364f5d4fbed9fc7101bf907f41886a7330a5d6a7bd23535e305eb7679bc23d7605936185ace4699e9a86e031c54b21cdd0960ac18ddd61ec9f7ae98d5582a6faf65f3248d1",
    diversifiers: [null, null, null, null],
  },
  {
    path: [1, 2, 3],
    xsk: "030bdc2d2b0300008033dc012d7690ced2cd2bcb2cc3e463e28d8c29ef3b01be59b2bdfc385bbdc74b4593d24d21e35937f152cf90461c332f69503c104581d683e0ac29f84decaf071ac87ec2123f5057e3c0f858e80dfa0ee4553ded27b7b5abfbb6fa6effa7bb0b1e36ea0cf2be2e9d6ce380a8af18e75da9225551fbef8b98311b5c9c1b4b9ee357fc6c59a4f3ad5a6f609db671d28cbf703f0d14dc363aaaed70729c107bbb6a",
    xfvk: "030bdc2d2b0300008033dc012d7690ced2cd2bcb2cc3e463e28d8c29ef3b01be59b2bdfc385bbdc74b9c6d859a752c305d6263de95f2fcf734b126df2456c7d31bc601c8ddec409112d3ee41f84b5a9508b61d29b2fb45636d19aa10d782cd978cfe6715492fcd224e1e36ea0cf2be2e9d6ce380a8af18e75da9225551fbef8b98311b5c9c1b4b9ee357fc6c59a4f3ad5a6f609db671d28cbf703f0d14dc363aaaed70729c107bbb6a",
    diversifiers: [null, null, null, "b831c2965a860ad760ec2a"],
  },
] as const;
/** The diversifier indexes of the diversifier columns: 0, 1, 2 and 2^88 - 1. */
const DIVERSIFIER_INDEXES = [0n, 1n, 2n, 2n ** 88n - 1n] as const;

/** sapling_key_components.json's first two rows: sk, ask ‖ nsk ‖ ovk, ak ‖ nk ‖ ovk, ivk, d, pk_d. */
const KEY_COMPONENTS = [
  {
    sk: "0000000000000000000000000000000000000000000000000000000000000000",
    expanded:
      "8548a14a473ea547aa2378402044f818cf1911cf5dd2054f678345f00d0e880630114ea0dd0bb61cf0eaeab6ec3331f581b0425e27338501262d7eac745e6e0598d16913d99b04177caba44f6e4d224e03b5ac031d7ce45e865138e1b996d63b",
    viewing:
      "f344ec380fe1273e3098c2588c5d3a791fd7ba958032760777fd0efa8ef11620f7cf9e77f2e58683383c1519ac7b062d30040e27a725fb88fb19a978bd3fd6ba98d16913d99b04177caba44f6e4d224e03b5ac031d7ce45e865138e1b996d63b",
    ivk: "b70b7cd0ed03cbdfd7ada9502ee245b13e569d54a5719d2daa0f5f1451479204",
    d: "f19d9b797e39f337445839",
    pkD: "db4cd2b0aac4f7eb8ca131f16567c445a9555126d3c29f14e3d776e841ae7415",
  },
  {
    sk: "0101010101010101010101010101010101010101010101010101010101010101",
    expanded:
      "c9435629bf8bffe55e7335ec077718ba60ba28d7ac3794b74f512c31af0a530411acc2ead07b5f008c1f0f090cc8ddf335236ff4b253c6495695e9d639dacd083b946210ce6d1b1692d7392ac84a8bc8f03b72723c7d36721b809a79c9d6e45b",
    viewing:
      "82ff5effc527ae84020bf2d35201c10219131947ff4b96f881a45f2e8ae30518c4534d848bb918cf4a7f8b98740ab3ccee586795ff4df64547a8888a6c7415d23b946210ce6d1b1692d7392ac84a8bc8f03b72723c7d36721b809a79c9d6e45b",
    ivk: "c518384466b26988b5109067418d192d9d6bd0d9232205d77418c240fc68a406",
    d: "aef180f6e34e354b888f81",
    pkD: "a6b13ea336ddb7a67bb09a0e68e9d3cfb39210831ea3a296ba09a922060fd38b",
  },
] as const;

/** unified_address.json: the Sapling row field of each account and j that holds its text. */
const UNIFIED_ADDRESSES = [
  {
    account: 0,
    j: 0,
    field: "unifiedTransparentAddress",
    text: "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf",
  },
  {
    account: 0,
    j: 3,
    field: "unifiedTransparentAddress",
    text: "u1fl5mprj0t9p4jg92hjjy8q5myvwc60c9wv0xachauqpn3c3k4xwzlaueafq27dcg7tzzzaz5jl8tyj93wgs983y0jq0qfhzu6n4r8rakpv5f4gg2lrw4z6pyqqcrcqx04d38yunc6je",
  },
  {
    account: 15,
    j: 0,
    field: "unifiedAddress",
    text: "u187vrwl4ampyxd5m6aj38n4ndkmj8v6gs97hkt23aps3sn5k89a0gk2smluexgdprcrtm56ezc5c7tjwlrnnl79tjtrxmqd42c5mpyz7g",
  },
] as const;

/** unified_full_viewing_keys.json and unified_incoming_viewing_keys.json: P2PKH and Sapling items. */
const VIEWING_KEYS = [
  {
    account: 2,
    field: "unifiedFullViewingKey",
    text: "uview18jpf4cjyt5nfa747ua4sawtv9cppl8g576a4utmtslvenzm2ajyefz2fye2w7ljjm63f6r903fuhdm6fmvg3dnpgxw07tllfq7hcede8qyl2fanaarvsm8d0trz5ckc7k47dne78mfw5lrkgc883akkaw2vt37cdmvy6snapxufr857r5p9vmf9jx3s00w73we6fz4w49yy9wdc3u92krx0vs05t3c4r6favdtg9uj2tqs94skm5xdn9q4vpwgfmkcgwl3c8sj4epph8f69839q8p7pt86xvd5ejs7k87dn3tlwfenzqzlhalm7vwwaqy56mmdysdnqemmses6s653n6xq4",
  },
  {
    account: 3,
    field: "unifiedFullViewingKey",
    text: "uview1aqjrk6swt0f8w23ev5gumkz3dn99097fa2ne8gpmtra7z0lt2xv8qp7vzvfgfxmcdzy8jtpftdujuvm7plle92476vws0m95zlffyp7rr0v2rzv6nyhrvh60at9qqswtj8yl44vt9gdwusz5l6p2dzczrm5zml3uqcudg9eeac4rg0v9yehquzh4x4l3wrc67mqu2uvqwt044jsvhv78hu5ghxtd7reycf3lwurxgyr5r872sssj8h6mr4crwc09n0d68c0ylswhxwy6k05vrk0t63k6ydcv578v8y4znastxpnrgwh0pa2hx7g9pr2z7dmwwwtfgcv3lyraxyt9s3eag3h",
  },
  {
    account: 2,
    field: "unifiedIncomingViewingKey",
    text: "uivk1dtzc2ay3jnzjtk93tsqxqn0fnef75lvpv3qc2zdtn6fxvjh3q2pz5r9ehd2c3mycen6mjh55kag3u936y8qzsr2wnvm4gtc76tg3s93cmre204ttjeunpc8ud9zq6w7z4kz27xhf2lwsu4cllk2me9ux84rtswhqstue8garyxz4x7fxmtye26udl34qexn9ykjpdd25mxgsvlj57yjljhaz8eurdf6umkc6mk6780m8y8qnnj683",
  },
  {
    account: 3,
    field: "unifiedIncomingViewingKey",
    text: "uivk1uldmvh8ggsqj50kncwmzf5g9wtawtxz2ylpnj32dv4cfwg7329ae39fxw9fqvtuhr3h0newvr3lajq6rwdspv4fd3xq7swhhyfm52kmctndn3wpgsxse7cx2acta75tvlzzv58hx52um2qe0p8hywml4geklwg2kf23wavakrlqa9sgwzc37ej2krs6c5j5x2athd2aevywdg2gkpugts5n0f7yn579gedr42p96jut69aqtu3hyh",
  },
] as const;

/** f4jumble.json's 48- and 64-byte messages. */
const JUMBLES = [
  {
    normal:
      "5d7a8f739a2d9e945b0ce152a8049e294c4d6e66b164939daffa2ef6ee6921481cdd86b3cc4318d9614fc820905d042b",
    jumbled:
      "0304d029141b995da5387c125970673504d6c764d91ea6c082123770c7139ccd88ee27368cd0c0921a0444c8e5858d22",
  },
  {
    normal:
      "b1ef9ca3f24988c7b3534201cfb1cd8dbf69b8250c18ef41294ca97993db546c1fe01f7e9c8e36d6a5e29d4e30a73594bf5098421c69378af1e40f64e125946f",
    jumbled:
      "5271fa3321f3adbcfb075196883d542b438ec6339176537daf859841fe6a56222bff76d1662b5509a9e1079e446eeedd2e683c31aae3ee1851d7954328526be1",
  },
] as const;

const SWIFT_SEED =
  "f550d5399659396587a59b6ad446eb89da7741ebb1e42f87c22451d20ece8bb1e09ccb3c19f967f37fbf435367bc295c692c0ce000c52f5b991f1ca91169565e";
const SWIFT_UFVK =
  "uview17fme6ux853km45g9ep07djpfzeydxxgm22xpmr7arzxyutlusalgpqlx7suga4ahzywfuwz4jclm00u7g8u65qvvdt45kttnfunvschssg3h3g06txs9ja32vx3xa8dej3unnatgzjvd0vumk37t8es3ludldrtse3q6226ws7eq4q0ywz78nudwpepgdn7jmxz8yvp7k6gxkeynkam0f8aqf9qpeaej55zhkw39x7epayhndul0j4xjttdxxlnwcd09nr8svyx8j0zng0w6scx3m5unpkaqxcm3hslhlfg4caz7r8d4xy9wm7klkg79w7j0uyzec5s3yje20eg946r6rmkf532nfydu26s8q9ua7mwxw2j2ag7hfcuu652gw6uta03vlm05zju3a9rwc4h367kqzfqrcz35pdwdk2a7yqnk850un3ujxcvve45ueajgvtr6dj4ufszgqwdy0aedgmkalx2p7qed2suarwkr35dl0c8dnqp3";
const SWIFT_ZXVIEWS =
  "zxviews1qw28psv0qqqqpqr2ru0kss5equx6h0xjsuk5299xrsgdqnhe0cknkl8uqff34prwkysswfhjk79n8l99f2grd26dqg6dy3jcmxsaypxfsu6ara6vsk3x8l544uaksstx9zre879mdg7s9a7zurrx6pf5qg2n323js2s3zlu8tn3848yyvlg4w38gx75cyv9jdpve77x9eq6rtl6d9qyh8det4edevlnc70tg5kse670x50764gzhy60dta0yv3wsd4fsuaz686lgszcq7kwxy";
/** The BIP39 seed of the Android SDK's PHRASE "deputy visa gentle …" (own value, see above). */
export const ZCASH_ANDROID_SEED =
  "6ef5f84def6f4b9d38f466586a8380a38593bd47c8cda77f091856176da47f26b5bd1c8d097486e5635df5a66e820d28e1d73346f499801c86228d43f390304f";
const ANDROID_UA =
  "u1t23erzgkn7c6c2jn66rspl4m45lg8rn3f7mn7le4yxk7693wr7sgx472jn95s00x8kx3hct5ej4tf76k59dfhsd809t7mzt9ldzw8f5083fw4xqvxfshl9u7ed2wyv6ypmzny0px0nvszslr5kr7fgk2zgfnlycddzqak4adsqjdzp76y7fl0k4ygamjr43t6rpxsf6xql8g20rdk0h";
/** The bytes of a Sapling diversifier, which lead a Sapling receiver (d ‖ pk_d). */
const DIVERSIFIER_BYTES = 11;
/** The fields of the row of an index without an address: no address, only where it is. */
const NO_ADDRESS_FIELDS = "path,diversifierIndex";
/** "abandon … about"'s extended spending key of account 0 (own value, see above). */
const ABANDON_SPENDING_KEY =
  "secret-extended-key-main1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjdhc9v7jnk3utf4g66ddp6cll6fw0vqthr9vnczdjqkxyelkjxgtq2a5g5w6ngqj4rnewvnf3ehh7fzftv4jpkgzrtv4jqjej6zdge4gr0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qdtz6vv";

/** `bytes` as hex, compared with `expected` under `check` and wiped. */
function expectBytes(check: string, bytes: Uint8Array, expected: string): void {
  try {
    expectEqual(check, bytesToHex(bytes), expected);
  } finally {
    wipe(bytes);
  }
}

/** sapling_zip32_hard.json's four rows: extended keys and diversifiers. */
function checkKeys(): void {
  const master = SaplingExtendedSpendingKey.fromSeed(hexToBytes(ZCASH_VECTOR_SEED));
  try {
    for (const row of HARD_ROWS) {
      const key = master.deriveHardened(row.path);
      try {
        expectBytes(CHECKS.keys, key.bytes(), row.xsk);
        expectBytes(CHECKS.keys, key.extendedFullViewingKey(), row.xfvk);
        DIVERSIFIER_INDEXES.forEach((index, at) => {
          const address = key.addressAt(index);
          const diversifier = address === null ? null : bytesToHex(address.diversifier);
          if (diversifier !== row.diversifiers[at])
            throw new Error(`Cryptographic self-test failed: ${CHECKS.keys}.`);
        });
      } finally {
        key.wipe();
      }
    }
  } finally {
    master.wipe();
  }
}

/** sapling_key_components.json's first two rows. */
function checkComponents(): void {
  for (const row of KEY_COMPONENTS) {
    const spendingKey = hexToBytes(row.sk);
    const key = SaplingExpandedSpendingKey.fromSpendingKey(spendingKey);
    try {
      expectBytes(CHECKS.components, key.bytes(), row.expanded);
      expectBytes(CHECKS.components, key.fullViewingKey(), row.viewing);
      expectBytes(CHECKS.components, key.incomingViewingKey(), row.ivk);
      expectBytes(CHECKS.components, key.transmissionKey(hexToBytes(row.d)), row.pkD);
    } finally {
      key.wipe();
      wipe(spendingKey);
    }
  }
}

/** The unified addresses of Sapling rows, and the viewing keys of their accounts' summaries. */
function checkUnified(): void {
  for (const { account, j, field, text } of UNIFIED_ADDRESSES)
    expectEqual(
      CHECKS.unified,
      zcashSaplingValue(ZCASH_VECTOR_SEED, { account, start: j, count: 1 }, (result) =>
        resultValue(result, field),
      ),
      text,
    );
  for (const { account, field, text } of VIEWING_KEYS)
    expectEqual(
      CHECKS.unified,
      zcashSaplingValue(ZCASH_VECTOR_SEED, { account, start: 0, count: 1 }, (result) =>
        resultValue(result, field),
      ),
      text,
    );
}

/** F4Jumble of f4jumble.json's two shortest messages, both ways. */
function checkJumble(): void {
  for (const { normal, jumbled } of JUMBLES) {
    expectEqual(CHECKS.jumble, bytesToHex(f4Jumble(hexToBytes(normal))), jumbled);
    expectEqual(CHECKS.jumble, bytesToHex(f4JumbleInverse(hexToBytes(jumbled))), normal);
  }
}

/** Whether the P2PKH and Sapling items of two decoded unified texts are equal; both are wiped. */
function sameItems(kind: "address" | "full-viewing-key", ours: string, theirs: string): boolean {
  const left = decodeUnified(kind, ours);
  const right = decodeUnified(kind, theirs);
  try {
    const hex = (bytes: Uint8Array | undefined) => (bytes === undefined ? "" : bytesToHex(bytes));
    return (
      hex(left.p2pkh) === hex(right.p2pkh) &&
      hex(left.sapling) === hex(right.sapling) &&
      hex(left.sapling) !== ""
    );
  } finally {
    left.wipe();
    right.wipe();
  }
}

/** The diversifier of the Sapling receiver of a unified address, in hex. */
function diversifierOf(address: string): string {
  const decoded = decodeUnified("address", address);
  try {
    return bytesToHex(decoded.sapling?.subarray(0, DIVERSIFIER_BYTES) ?? new Uint8Array(0));
  } finally {
    decoded.wipe();
  }
}

/** The note and the public fields, by key, of the row of diversifier index `index`. */
function rowOf(
  result: DerivationResult,
  index: number,
): { note: string | undefined; fields: Map<string, string> } {
  const row = result.rows.find((candidate) => candidate.index === index);
  if (row === undefined) throw new Error(`Cryptographic self-test failed: ${CHECKS.wallets}.`);
  return {
    note: row.note,
    fields: new Map([...row.basic, ...row.advanced].map(({ key, value }) => [key, value])),
  };
}

/**
 * The wallet SDKs' UFVK, zxviews and unified address, the UFVK and the address compared item by
 * item (theirs add Orchard), and the Android phrase's index 0, which has no Sapling address.
 */
function checkWallets(): void {
  const swift = zcashSaplingValue(SWIFT_SEED, { account: 0, start: 0, count: 1 }, (result) => ({
    ufvk: resultValue(result, "unifiedFullViewingKey"),
    zxviews: resultValue(result, "saplingFullViewingKey"),
  }));
  expectEqual(CHECKS.wallets, swift.zxviews, SWIFT_ZXVIEWS);
  const [none, first] = zcashSaplingValue(
    ZCASH_ANDROID_SEED,
    { account: 0, start: 0, count: 2 },
    (result) => [rowOf(result, 0), rowOf(result, 1)] as const,
  );
  if (
    none.note === undefined ||
    [...none.fields.keys()].join(",") !== NO_ADDRESS_FIELDS ||
    first.fields.get("diversifier") !== diversifierOf(ANDROID_UA) ||
    !sameItems("full-viewing-key", swift.ufvk, SWIFT_UFVK) ||
    !sameItems("address", first.fields.get("unifiedTransparentAddress") ?? "", ANDROID_UA)
  )
    throw new Error(`Cryptographic self-test failed: ${CHECKS.wallets}.`);
}

/** The text of an account's extended spending key: its HRP and its 169 bytes (ZIP-32). */
function checkSpendingKey(): void {
  expectEqual(
    CHECKS.spendingKey,
    zcashSaplingValue(ABANDON_ABOUT_SEED_HEX, { account: 0, start: 0, count: 1 }, (result) =>
      resultValue(result, "saplingSpendingKey"),
    ),
    ABANDON_SPENDING_KEY,
  );
}

/** The full self-test's Zcash Sapling known answers. */
export function runZcashSaplingKeyFullSelfTest(): CryptoSelfTestReport {
  const started = now();
  checkKeys();
  checkComponents();
  checkUnified();
  checkJumble();
  checkWallets();
  checkSpendingKey();
  return {
    passed: true,
    checks: Object.values(CHECKS),
    durationMs: Math.round(now() - started),
  };
}
