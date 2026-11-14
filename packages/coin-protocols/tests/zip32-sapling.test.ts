// ZIP-32's Sapling keys against the published vectors of zcash/zcash-test-vectors
// @78321beacb0e0477e33cd002b56585a107c2708c, test-vectors/json/: sapling_generators.json,
// sapling_zip32_hard.json, sapling_key_components.json and the Sapling receivers of
// unified_address.json, each made by the generator of the same name in zcash_test_vectors/
// (sapling/generators.py, sapling/zip32.py, sapling/key_components.py, unified_address.py). Each
// value is copied from the file named beside it. Public test data only.
import { BinaryFF1 } from "@noble/ciphers/ff1.js";
import { jubjub, jubjub_groupHash } from "@noble/curves/misc.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToHex, concatBytes, hexToBytes } from "@ckd/core/crypto.js";
import {
  isSaplingAddressEncoding,
  isSaplingFullViewingKeyEncoding,
  isSaplingIncomingViewingKeyEncoding,
  SAPLING_MAX_DIVERSIFIER_INDEX,
  SaplingExpandedSpendingKey,
  SaplingExtendedSpendingKey,
} from "../src/zip32-sapling.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** The seed of every generator here: bytes(range(32)) (zip32.py, unified_address.py). */
const SEED = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
/** ZIP-32's encodings: depth (1), parent tag (4) and child number (4), then 32-byte parts. */
const PART = (index: number): [number, number] => [9 + 32 * index, 9 + 32 * (index + 1)];
/** r_J, Jubjub's prime-order subgroup order. */
const ORDER = jubjub.Point.Fn.ORDER;
/** DiversifyHash^Sapling's personalization. */
const DIVERSIFY = new TextEncoder().encode("Zcash_gd");

/** The key at a hardened path such as m/1'/2' below the master of SEED; the caller wipes it. */
function keyAt(path: string): SaplingExtendedSpendingKey {
  const master = SaplingExtendedSpendingKey.fromSeed(SEED);
  try {
    return master.deriveHardened(
      path
        .split("/")
        .slice(1)
        .map((level) => Number(level.replace("'", ""))),
    );
  } finally {
    master.wipe();
  }
}

/** An expanded key of the scalars `ask` and `nsk` with a zero ovk; the caller wipes it. */
function expandedOf(ask: bigint, nsk: bigint): SaplingExpandedSpendingKey {
  return SaplingExpandedSpendingKey.fromBytes(
    concatBytes(numberToBytesLE(ask, 32), numberToBytesLE(nsk, 32), new Uint8Array(32)),
  );
}

// sapling_generators.json, columns skb and pkb.
const SKB = "30b5f2aaad325630bcdddbce4d67656d05fd1cc2d037bb5375b6e96d9e01a1d7";
const PKB = "e7e85de0f7f97a46d249a1f5ea51df50cc48490f8401c9de7a2adf1807d1b6d4";

// sapling_zip32_hard.json: its four rows, m, m/1', m/1'/2' and m/1'/2'/3' (sapling/zip32.py,
// hard()), with the columns ask to dmax; the internal_* columns, ZIP-32's internal (change) keys,
// are not derived here.
const HARD_ROWS = [
  {
    path: "m",
    ask: "b6c00c93d36032b9a268e99e86a860776560bf0e83c1a10b51f607c954742506",
    nsk: "8204ede83b2f1fbd84f9b45d7f996e2ebd0a030ad243b48ed39f748a8821ea06",
    ovk: "395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb21",
    dk: "77c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
    c: "d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668e",
    ak: "93442e5feffbff16e7217202dc7306729ffffe85af5683bce2642e3eeb5d3871",
    nk: "dce8e7edece04b8950417f85ba57691b783c45b1a27422db1693dceb67b10106",
    ivk: "4847a130e799d3dbea36a1c16467d621fb2d80e30b3b1d1a426893415dad6601",
    xsk: "000000000000000000d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668eb6c00c93d36032b9a268e99e86a860776560bf0e83c1a10b51f607c9547425068204ede83b2f1fbd84f9b45d7f996e2ebd0a030ad243b48ed39f748a8821ea06395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb2177c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
    xfvk: "000000000000000000d0947c4b03bf72a37ab44f72276d1cf3fdcd7ebf3e73348b7e550d752018668e93442e5feffbff16e7217202dc7306729ffffe85af5683bce2642e3eeb5d3871dce8e7edece04b8950417f85ba57691b783c45b1a27422db1693dceb67b10106395884890323b9d4933c021db89bcf767df21977b2ff0683848321a4df4afb2177c17cb75b7796afb39f0f3e91c924607da56fa9a20e283509bc8a3ef996a172",
    fp: "14c2713adce93a830ea83a051908b7447783f5d106c0985e02550e426f27597c",
    d0: "d8621b981cf300e9d4cc89",
    d1: "48ea17a199c84bd1baa5d4",
    d2: null,
    dmax: null,
  },
  {
    path: "m/1'",
    ask: "d5f7e92efb7abe04dc8c148b0b3b0fc23e0429f00208ff93b68d21a6e131bd04",
    nsk: "372a7c6822cbe603f3465c4b9b6558f3a3512decd434012e67bffcf657e5750a",
    ovk: "2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69",
    dk: "f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
    c: "6fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedb",
    ak: "cfca79d337bc689813e409a54e3e72ad8e2f703ae6f8223c9becbde9a8a35f53",
    nk: "513de64085d35a3adf23d89d5a21cdee4db4c625bd6a3c3c624bef4344141deb",
    ivk: "f6e75cd980c30eabc61f49ac68f488573ab3e6afe15376375d34e406702ffd02",
    xsk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbd5f7e92efb7abe04dc8c148b0b3b0fc23e0429f00208ff93b68d21a6e131bd04372a7c6822cbe603f3465c4b9b6558f3a3512decd434012e67bffcf657e5750a2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
    xfvk: "0114c2713a010000806fccaa45a8206b063ebb68c610e05927aa94d61be93ec25eb4f82efd68caaedbcfca79d337bc689813e409a54e3e72ad8e2f703ae6f8223c9becbde9a8a35f53513de64085d35a3adf23d89d5a21cdee4db4c625bd6a3c3c624bef4344141deb2530761933348c1fcf14355433a8d291167fbb37b2ce37ca97160a47ec331c69f288400fd65f9adfe3a7c3720aceee0dae050d0a819d619f92e9e2cb4434d526",
    fp: "768423cb88d22dee91b5b7661e72ed009557eba144c78d1aa71a3e88b6910696",
    d0: null,
    d1: "bcc323e8da39b496c05051",
    d2: null,
    dmax: "2514320d339c666a254c06",
  },
  {
    path: "m/1'/2'",
    ask: "7ff35db69e13c36f59ad9c08d32d5227378da0cff971fd424baef9a6332f5106",
    nsk: "779c6ee4a03944eba28bc9bdc1329a391407f48c410d5ae0a364f59959bfde00",
    ovk: "d9fc7101bf907f41886a7330a5d6a7bd23535e305eb7679bc23d7605936185ac",
    dk: "e4699e9a86e031c54b21cdd0960ac18ddd61ec9f7ae98d5582a6faf65f3248d1",
    c: "4479086c75d080796020f500c1e30a54cfe29dda36f2144fb33a50806fbef7da",
    ak: "9a853f9544713797e0851764da392e68534b1d948dae4742ee765c727572ab4e",
    nk: "f166a28a4f88cec12141a82d2120bd6d8caf879c9a1b3ad2118501364f5d4fbe",
    ivk: "33bd46015a2cad17d6e015eb88861b0c917796246570521c9e1ae4b1c8311d06",
    xsk: "02768423cb020000804479086c75d080796020f500c1e30a54cfe29dda36f2144fb33a50806fbef7da7ff35db69e13c36f59ad9c08d32d5227378da0cff971fd424baef9a6332f5106779c6ee4a03944eba28bc9bdc1329a391407f48c410d5ae0a364f59959bfde00d9fc7101bf907f41886a7330a5d6a7bd23535e305eb7679bc23d7605936185ace4699e9a86e031c54b21cdd0960ac18ddd61ec9f7ae98d5582a6faf65f3248d1",
    xfvk: "02768423cb020000804479086c75d080796020f500c1e30a54cfe29dda36f2144fb33a50806fbef7da9a853f9544713797e0851764da392e68534b1d948dae4742ee765c727572ab4ef166a28a4f88cec12141a82d2120bd6d8caf879c9a1b3ad2118501364f5d4fbed9fc7101bf907f41886a7330a5d6a7bd23535e305eb7679bc23d7605936185ace4699e9a86e031c54b21cdd0960ac18ddd61ec9f7ae98d5582a6faf65f3248d1",
    fp: "0bdc2d2b6eb1f927cbabdbb9d43db8de857bb716df86cecf081e1a2b74fcad55",
    d0: null,
    d1: null,
    d2: null,
    dmax: null,
  },
  {
    path: "m/1'/2'/3'",
    ask: "4593d24d21e35937f152cf90461c332f69503c104581d683e0ac29f84decaf07",
    nsk: "1ac87ec2123f5057e3c0f858e80dfa0ee4553ded27b7b5abfbb6fa6effa7bb0b",
    ovk: "1e36ea0cf2be2e9d6ce380a8af18e75da9225551fbef8b98311b5c9c1b4b9ee3",
    dk: "57fc6c59a4f3ad5a6f609db671d28cbf703f0d14dc363aaaed70729c107bbb6a",
    c: "33dc012d7690ced2cd2bcb2cc3e463e28d8c29ef3b01be59b2bdfc385bbdc74b",
    ak: "9c6d859a752c305d6263de95f2fcf734b126df2456c7d31bc601c8ddec409112",
    nk: "d3ee41f84b5a9508b61d29b2fb45636d19aa10d782cd978cfe6715492fcd224e",
    ivk: "d138e137c6671de782fb01ba911d9864bebc4436ccb388b4c1ce0256a8db7401",
    xsk: "030bdc2d2b0300008033dc012d7690ced2cd2bcb2cc3e463e28d8c29ef3b01be59b2bdfc385bbdc74b4593d24d21e35937f152cf90461c332f69503c104581d683e0ac29f84decaf071ac87ec2123f5057e3c0f858e80dfa0ee4553ded27b7b5abfbb6fa6effa7bb0b1e36ea0cf2be2e9d6ce380a8af18e75da9225551fbef8b98311b5c9c1b4b9ee357fc6c59a4f3ad5a6f609db671d28cbf703f0d14dc363aaaed70729c107bbb6a",
    xfvk: "030bdc2d2b0300008033dc012d7690ced2cd2bcb2cc3e463e28d8c29ef3b01be59b2bdfc385bbdc74b9c6d859a752c305d6263de95f2fcf734b126df2456c7d31bc601c8ddec409112d3ee41f84b5a9508b61d29b2fb45636d19aa10d782cd978cfe6715492fcd224e1e36ea0cf2be2e9d6ce380a8af18e75da9225551fbef8b98311b5c9c1b4b9ee357fc6c59a4f3ad5a6f609db671d28cbf703f0d14dc363aaaed70729c107bbb6a",
    fp: "df0a89bd883539c07b89e04c92764ec2d159690f5ad5dd3d0ad8ac2969de22c8",
    d0: null,
    d1: null,
    d2: null,
    dmax: "b831c2965a860ad760ec2a",
  },
] as const;

// sapling_key_components.json: all ten rows, sk = [i] * 32, without the note_* columns.
const KEY_COMPONENTS = [
  {
    sk: "0000000000000000000000000000000000000000000000000000000000000000",
    ask: "8548a14a473ea547aa2378402044f818cf1911cf5dd2054f678345f00d0e8806",
    nsk: "30114ea0dd0bb61cf0eaeab6ec3331f581b0425e27338501262d7eac745e6e05",
    ovk: "98d16913d99b04177caba44f6e4d224e03b5ac031d7ce45e865138e1b996d63b",
    ak: "f344ec380fe1273e3098c2588c5d3a791fd7ba958032760777fd0efa8ef11620",
    nk: "f7cf9e77f2e58683383c1519ac7b062d30040e27a725fb88fb19a978bd3fd6ba",
    ivk: "b70b7cd0ed03cbdfd7ada9502ee245b13e569d54a5719d2daa0f5f1451479204",
    defaultD: "f19d9b797e39f337445839",
    defaultPkD: "db4cd2b0aac4f7eb8ca131f16567c445a9555126d3c29f14e3d776e841ae7415",
  },
  {
    sk: "0101010101010101010101010101010101010101010101010101010101010101",
    ask: "c9435629bf8bffe55e7335ec077718ba60ba28d7ac3794b74f512c31af0a5304",
    nsk: "11acc2ead07b5f008c1f0f090cc8ddf335236ff4b253c6495695e9d639dacd08",
    ovk: "3b946210ce6d1b1692d7392ac84a8bc8f03b72723c7d36721b809a79c9d6e45b",
    ak: "82ff5effc527ae84020bf2d35201c10219131947ff4b96f881a45f2e8ae30518",
    nk: "c4534d848bb918cf4a7f8b98740ab3ccee586795ff4df64547a8888a6c7415d2",
    ivk: "c518384466b26988b5109067418d192d9d6bd0d9232205d77418c240fc68a406",
    defaultD: "aef180f6e34e354b888f81",
    defaultPkD: "a6b13ea336ddb7a67bb09a0e68e9d3cfb39210831ea3a296ba09a922060fd38b",
  },
  {
    sk: "0202020202020202020202020202020202020202020202020202020202020202",
    ask: "ee1c3d7efe0a78063d6af3d9d81212af47b7c1b761f85ccb066fc11a6a421703",
    nsk: "1d3b713755d74875e8ea38fd166e76c62a4250216e6bbfe48a5e2eabad117f0b",
    ovk: "8bf4390e28ddc95b8302c381d5810b84ba8e6096e5a76822774fd49f491e8f49",
    ak: "ab83574eb5de859a0ab8629dec34c7bee8c3fc74dfa0b19a3a7468d15dca64c6",
    nk: "95d58053e0592e4a169cc0b7928aaac3de24ef1531aa9eb6f4ab93914da8a06e",
    ivk: "471c24a3dc8730e75036c0a95f3e2f7dd1be6fb93ad29592203def3041954505",
    defaultD: "7599f0bf9b57cd2dc299b6",
    defaultPkD: "66141739514b28f05def8a18eeee5eed4d44c6225c3c65d88dd9907708012f5a",
  },
  {
    sk: "0303030303030303030303030303030303030303030303030303030303030303",
    ask: "00c3a1e1ca8f4e0480ee1ee90ca7517879d3fc5c815c0903e5eebc94bb809503",
    nsk: "e66285a5e9b65e157ad2fcd543dad98c67a58abdf287e05506bd1c2e59b0720b",
    ovk: "147678e0553b97829347647c5bc7dab4cc2202b54ec29fd31a3de6be0825fc5e",
    ak: "3c9cde7e5d0d38a8610faadbcf4c343f5d3cfa3155a5b94661a6753e96e884ea",
    nk: "b77d36f508941dbd61cfd0f159ee05cfaa78a26c9492903806d83b598d3c1c2a",
    ivk: "636aa964bfc23ce4b1fcf7dfc99179ddc406ff55400c9295acfc14f031c72600",
    defaultD: "1b81614f1dadea0f8d0a58",
    defaultPkD: "25eb55fccf761fc64e85a588efe6ead7832fb1f0f7a83165895bdff942925f5c",
  },
  {
    sk: "0404040404040404040404040404040404040404040404040404040404040404",
    ask: "8236d19d3205d85543a06811343f827b6563770a49aa4d0ca0081805d4c8ea0d",
    nsk: "7ec1ef0bed82718272f0f44f017c484174513d661dd168af02d2092a1d8a0507",
    ovk: "1b6e75ece3ace8dba6a5410d9ad4755668e4b39585d635ec1da7c8dcfd5fc4ed",
    ak: "55e88389bb7e41de130cfa51a8715fde01ff9c6876647f0175ad34f058dde01a",
    nk: "725d4ad6a15021cd1c48c5ee19de6c1e768a2cc0a9a730a01bb21c95e3d9e43c",
    ivk: "67fa2bf7c67d4658243c317c0cb41fd32064dfd3709fe0dcb724f14bb01a1d04",
    defaultD: "fcfb68a40d4bc6a04b09c4",
    defaultPkD: "8b2a337f03622c24ff381d4c546f6977f90522e92fde44c9d1bb099714b9db2b",
  },
  {
    sk: "0505050505050505050505050505050505050505050505050505050505050505",
    ask: "eae6884d764a054061a8f1c0076c624dcb738789f7ad1e7408e31f24dfc82607",
    nsk: "fbe610f42a41749f9b6e6e4a54b5a32ebfe8f43800881ba6cd13ed0b05294601",
    ovk: "c6bc1f39f0d786314cb20bf9ab228540913555f970696b6d7c77bb332328372a",
    ak: "e682765914e3864c339e5782b855c0fdf40e0dfcedb9e7b47bc94b90b3a4c988",
    nk: "82256b95623c67024b4424d91400a370e7ac8e4d15482a3759e00d219749daee",
    ivk: "ea3f1d80e4307ca73b9f37801f91fba810cc41d279fc29f564235654a2178e03",
    defaultD: "eb519882ad1e5cc654cd59",
    defaultPkD: "6b27daccb5a8207f532d10ca238f9786648a11b5966e51a2f7d89e15d29b8fdf",
  },
  {
    sk: "0606060606060606060606060606060606060606060606060606060606060606",
    ask: "e8f816b4bc08a7e566750cc28afe82a4cea9c2bef244fa4b13c4739b28074c0d",
    nsk: "32615b137f2801ed446e48781ab0634572e18cfb0693721b8803c05b8227d107",
    ovk: "f62c05e848a873ef885e12b08c5e7ca2f32424bacc754cb69750444d355f5106",
    ak: "ff27db0751945d3ee4be9cf15c2ea211b24b164d5f2d7ddff5e4a0708f10b95e",
    nk: "943885959d4ef8a9cfca07c457f09ec74b96f993d8e0fa32b19c03e3b07a420f",
    ivk: "b5c5894943956933c0e5c12d311fc12cba58354b5c389edc03da55084f74c205",
    defaultD: "bebb0fb46b8aaff89040f6",
    defaultPkD: "d11da01f0b43bdd5288d32385b8771d223493c69802544043f77cf1d71c1cb8c",
  },
  {
    sk: "0707070707070707070707070707070707070707070707070707070707070707",
    ask: "74b44a37f15023c060427e1daea3f64312dd8feb7b2cedf0dd5544493f872c06",
    nsk: "075c35db8b1b25754223ecee34ab730dddd1f14a6a54f4c6f468453c3c6ed60b",
    ovk: "e9e0dc1ed311daed64bd74da5d94fe88a6ea414b7312de3d2a78f64632bbe373",
    ak: "283f9aafa9bcb3e6ce17e63212634cb3ee550c476b676bd356a6df8adf51d25e",
    nk: "dc4c67b10d4b0a218dc6e1487066740a409317866c32e664b50e397aa80389d4",
    ivk: "8716c82880e13683e1bb059dd06c80c90134a96d5afca8aac2bbf68bb05f8402",
    defaultD: "ad6e2e185a3100e3a6a8b3",
    defaultPkD: "32cb2806b882f1368b0d4a898f72c4c8f728132cc12456946e7f4cb0fb058da9",
  },
  {
    sk: "0808080808080808080808080808080808080808080808080808080808080808",
    ask: "039dd93df311ff8fbab3fe230219cd42ac879484f30b903a3c1e67ccca5a7b0d",
    nsk: "049fa14f486c75b9fad7e3b673a443dd074eaa96edcb2a53eaaabdaf70ffbb08",
    ovk: "147dd11d77eba1b1636fd6190c62b9a5d0481bee7e917fab02e21858063ab504",
    ak: "364048eedbe8ca205eb7e7ba0a9012166c7c7bd9eb228e08481448c488aa21d2",
    nk: "ed60af1ce7df38070d3851432a96480db0b417c3682a1d68e3e89334235c0bdf",
    ivk: "99c9b4b84f4b4e350f787d1cf7051d50ecc34b1a5b20d2d2139b4af1f160e001",
    defaultD: "21c90e1c658b3efe86af58",
    defaultPkD: "9e64174b4ab981405c323b5e12475945a46d4fedf8060828041cd20e62fd2cef",
  },
  {
    sk: "0909090909090909090909090909090909090909090909090909090909090909",
    ask: "ebbb40a980ba3b8860948d011e1bfb4affe16c652e90e98258302f4464c91e0c",
    nsk: "68431b199104215200b95ee5cb71bf8b883a3e95b7989cad197063141ebbfd00",
    ovk: "573467a7b30ead6ccc504744ca9e1a281a0d1a08738b06a0684feacd1e9d126d",
    ak: "71c3523eeca35311fbd5d7e7d70b709d6c35a24f262b34bf64059bf2c02e0ba8",
    nk: "624400103b6569b7358fe80f6f6cad4325defda9d9499c2b8f886a6269a2aa52",
    ivk: "db95ea8bd9f93d41b5ab2bebc91a38edd527083e2a6ef9f3c29702d5ff89ed00",
    defaultD: "233c4ab886a55e3ba374c0",
    defaultPkD: "b68e9ee0c0678d7b3036931c831a25255f7ee487385a30316e15f6482b874fda",
  },
] as const;

// unified_address.json: account, diversifier_index and sapling_raw_addr of every row with a Sapling
// receiver, in the file's order (root_seed is SEED in all of them).
const RECEIVERS = [
  [0, 0, "d8ef8293d26de832e7193f296ba1922d90f122c6135bc231eebd91efdb03b1a8606771cd4fd6480574d43e"],
  [0, 3, "435b0bbc95b5b7d52531a3944f2b85603ee22aaf850963bc156eb561edf2cbe7cf0e770e393ae5d7049026"],
  [0, 4, "69a25a38699708e5f6e76e54e6a7a2ab84dcf288df0d1f2563670168d6c44ace0ef11155c60d5c225e9dec"],
  [1, 3, "9f6e0bf90a18fc0b9b83ae9f23ad4358648638482b5def8975635b66fd8a708335f9235a3186ec0f033f84"],
  [1, 7, "e1adf156a07d56bcac91bdb2f7bb3ea7c44569dcfee54273c09e8065807b6823faa94a77219554d0f6e017"],
  [1, 8, "60ba572f8e379312d86897025decdd64b4b95e2c4afa9d13726b8cc393edb4988c51b976028f890f108bd2"],
  [2, 0, "88533c398a49c2513dc85162bf220abaf47dc983f14e908ddaaa7322dba16531bc62efe750fe575c8d149b"],
  [2, 5, "616fe1a9d887148d6ca10f48ccd92d0dcad24f7c4c9d73ee8122b1766459b04dac4dc07e80edb9d229bbbc"],
  [2, 6, "9304f6e3c889829a0a48f2ebdc0803bbbd393ebf4264e45cb7db793e9376fa85ddf31f5024e0bf796672be"],
  [4, 0, "6493348e8aee112a87f5fa65e1c57065aad369401e05d0daa96e0bcd89e67bf19beb3ac74d599d94585a68"],
  [4, 1, "65b6b03f7b27189cc0ed54bcf6bd938e39bfd1bf66b8a038c0a967fbc50e48c18da3de20d671858b8f7fbf"],
  [4, 2, "e987a4f50c94ba88e048638ecec706ef8a162674c9bef8caedfdf4b2131b451559090488ffe29ec02abac1"],
  [7, 1, "da2672c010f7364df6fad49dd39be0e4d4be73c45e239448fcc385cc68094bf36ddbc4ec0219b567955556"],
  [7, 5, "9b728ad6f50371e961236630b3c8cdd8149ca22cdb87a62cc0ba3e3cfd2b0adcc82930e447f8dcf54b450b"],
  [7, 10, "9dd77ff5af4c80c25114e83758cbe1b535cfe9413017994163a12b0de522cdd1b5d4be299c0788ccb1541e"],
  [10, 0, "99ae333db1074fca1a6a94bed3ea548c1db2512dfbe75af9e84c162260b4813bb6bdb4443969daa5713ff1"],
  [10, 2, "52d58f91376aa980f2b9a6283ff357e84246d6942352184886449ffea8fad7e7ca5b490d090a96e0323392"],
  [10, 4, "7a53f581d15985d0aafe134adb9540ffd19d965a43977ed4cb552cac5740a907ea24a9152b52268fe8cc3f"],
  [15, 0, "eee19641bc6b802f353eb793f728b17a277ef0358696a24a7122bc56537b229647f3810d27ce45227c6f39"],
  [15, 2, "50ca46f825f7f423007aa4147169b529f07f1c8ed634fafc8145a4813177dd1257ee8d8fc5f44e9b564f6a"],
  [15, 3, "c412c8ff78f28d9b3391f4ab15d06acf46ac052821ee096a51524813f2adf9a4065cc6c45feba2c052df9e"],
  [17, 0, "d3a803803feee7a032a24adfaa8f6a94cecb9671c1333d0d5d1a3d79d82bc310727c665364d71022559c50"],
  [17, 1, "25c25d58c50533dfb55d29f9a8864f58f02ea4fed44369352c43538cdf9545b905bb2ef0961bd2daf25883"],
  [17, 2, "54b7fc0c85d378f375be48218a85424bb9e7a304830e9eb7255a12a09c961cca1f629b867e13242ed90d92"],
  [19, 5, "8660070e3757ff6507060791fd694f6a631b8495a2b74ffa39236cf653caea5575b86af3200b010e513bab"],
  [
    19,
    11,
    "6d75a1a948a4e730db3b4b816dbc7d80b4eb1bc68de9ac87b0cd1f1b3e6068e677888e105ac727c0d14b49",
  ],
  [
    19,
    15,
    "38b14b44ed6f4a3ae8c5c3923e5770b786f9b41d46c65a149b13910f4a0a64e83bb9bc98e80d9576fbf76e",
  ],
] as const;

describe("Sapling's generators", () => {
  it("makes ak and nk of ask = nsk = 1 the skb and pkb of sapling_generators.json", () => {
    // skb is G = FindGroupHash("Zcash_G_", ""), pkb is H = FindGroupHash("Zcash_H_", "")
    // (sapling/generators.py), the bases of ak = [ask]G and nk = [nsk]H.
    const key = expandedOf(1n, 1n);
    try {
      const viewing = key.fullViewingKey();
      expect(bytesToHex(viewing.subarray(0, 32))).toBe(SKB);
      expect(bytesToHex(viewing.subarray(32, 64))).toBe(PKB);
    } finally {
      key.wipe();
    }
  });
});

describe("ZIP-32 hardened Sapling keys", () => {
  it.each(HARD_ROWS)("gives every column of sapling_zip32_hard.json at $path", (row) => {
    const key = keyAt(row.path);
    try {
      const xsk = key.bytes();
      const xfvk = key.extendedFullViewingKey();
      expect(bytesToHex(xsk)).toBe(row.xsk);
      expect(bytesToHex(xfvk)).toBe(row.xfvk);
      // The columns one by one, at their places in ZIP-32's encodings.
      const columns = {
        c: xsk.subarray(...PART(0)),
        ask: xsk.subarray(...PART(1)),
        nsk: xsk.subarray(...PART(2)),
        ovk: xsk.subarray(...PART(3)),
        dk: xsk.subarray(...PART(4)),
        ak: xfvk.subarray(...PART(1)),
        nk: xfvk.subarray(...PART(2)),
      };
      for (const name of ["c", "ask", "nsk", "ovk", "dk", "ak", "nk"] as const)
        expect([name, bytesToHex(columns[name])]).toEqual([name, row[name]]);
      expect(bytesToHex(key.incomingViewingKey())).toBe(row.ivk);
      expect(bytesToHex(key.fingerprint())).toBe(row.fp);
      // d0, d1, d2 and dmax are d_j for j = 0, 1, 2 and 2^88 - 1; null marks an invalid one.
      const diversifiers = [0n, 1n, 2n, SAPLING_MAX_DIVERSIFIER_INDEX].map((index) => {
        const address = key.addressAt(index);
        return address === null ? null : bytesToHex(address.diversifier);
      });
      expect(diversifiers).toEqual([row.d0, row.d1, row.d2, row.dmax]);
    } finally {
      key.wipe();
    }
  });
});

describe("Sapling key components", () => {
  it.each(KEY_COMPONENTS)("gives sapling_key_components.json's keys of sk $sk", (row) => {
    const sk = hexToBytes(row.sk);
    const key = SaplingExpandedSpendingKey.fromSpendingKey(sk);
    try {
      expect(bytesToHex(key.bytes())).toBe(row.ask + row.nsk + row.ovk);
      expect(bytesToHex(key.fullViewingKey())).toBe(row.ak + row.nk + row.ovk);
      expect(bytesToHex(key.incomingViewingKey())).toBe(row.ivk);
      // default_d is the specification's DefaultDiversifier, not ZIP-32's, given here as input.
      expect(bytesToHex(key.transmissionKey(hexToBytes(row.defaultD)))).toBe(row.defaultPkD);
    } finally {
      key.wipe();
    }
  });
});

describe("Sapling addresses of an account", () => {
  // unified_address.py L52-60 and L122-125: for each account m/32'/133'/account', three addresses in
  // turn, from j = 0, each at the least valid j (find_j) after the one before; the JSON's
  // diversifier_index is that j, and its sapling_raw_addr is d ‖ pk_d.
  const accounts = [...new Set(RECEIVERS.map(([account]) => account))];

  it.each(accounts)("finds unified_address.json's Sapling receivers of account %i", (account) => {
    const key = keyAt(`m/32'/133'/${account}'`);
    try {
      let start = 0n;
      for (const [, index, raw] of RECEIVERS.filter(([owner]) => owner === account)) {
        const address = key.nextAddress(start, 64);
        expect(address?.index).toBe(BigInt(index));
        expect(bytesToHex(concatBytes(address!.diversifier, address!.transmissionKey))).toBe(raw);
        expect(key.addressAt(BigInt(index))).toEqual(address);
        start = BigInt(index) + 1n;
      }
    } finally {
      key.wipe();
    }
  });

  it("gives no address at an index whose diversifier is invalid", () => {
    // Account 1's first receiver is at j = 3, so j = 0, 1 and 2 have none.
    const key = keyAt("m/32'/133'/1'");
    try {
      expect([0n, 1n, 2n].map((index) => key.addressAt(index))).toEqual([null, null, null]);
      expect(key.nextAddress(0n, 3)).toBeNull();
    } finally {
      key.wipe();
    }
  });

  it("stops a search at the last diversifier index", () => {
    // sapling_zip32_hard.json: dmax of m/1'/2' is invalid, dmax of m/1' valid.
    const none = keyAt("m/1'/2'");
    const some = keyAt("m/1'");
    try {
      expect(none.nextAddress(SAPLING_MAX_DIVERSIFIER_INDEX, 10)).toBeNull();
      expect(some.nextAddress(SAPLING_MAX_DIVERSIFIER_INDEX, 10)?.index).toBe(
        SAPLING_MAX_DIVERSIFIER_INDEX,
      );
    } finally {
      none.wipe();
      some.wipe();
    }
  });
});

describe("ownership of an address", () => {
  // The receivers of unified_address.json against their accounts' keys: each is owned by its own
  // account at its own j, which FF1's decryption gives back, and by no other account.
  const accounts = [...new Set(RECEIVERS.map(([account]) => account))];

  it.each(accounts)(
    "finds account %i's receivers by its keys alone, at their indexes",
    (account) => {
      const key = keyAt(`m/32'/133'/${account}'`);
      const other = keyAt(`m/32'/133'/${account + 1}'`);
      try {
        for (const [owner, index, hex] of RECEIVERS) {
          const raw = hexToBytes(hex);
          expect([owner, index, key.ownsAddress(raw)]).toEqual([owner, index, owner === account]);
          if (owner === account)
            expect(key.diversifierIndexOf(raw.subarray(0, 11))).toBe(BigInt(index));
          if (owner === account) expect(other.ownsAddress(raw)).toBe(false);
        }
      } finally {
        key.wipe();
        other.wipe();
      }
    },
  );

  it("decrypts the diversifier of the last index, and of an index past the rows' 2^31", () => {
    // sapling_zip32_hard.json: dmax of m/1' is the valid d of j = 2^88 - 1.
    const key = keyAt("m/1'");
    try {
      for (const index of [SAPLING_MAX_DIVERSIFIER_INDEX, 2n ** 31n + 11n]) {
        const address = key.nextAddress(index, 64);
        if (address === null) throw new Error("No address within 64 indexes.");
        expect(key.diversifierIndexOf(address.diversifier)).toBe(address.index);
        expect(key.ownsAddress(concatBytes(address.diversifier, address.transmissionKey))).toBe(
          true,
        );
      }
    } finally {
      key.wipe();
    }
  });

  it("refuses a diversifier that hashes to no point, and an address or a diversifier of another length", () => {
    // d2 of m is invalid (sapling_zip32_hard.json): FF1-AES256 of the row's dk at j = 2.
    const invalid = BinaryFF1(hexToBytes(HARD_ROWS[0].dk)).encrypt(numberToBytesLE(2n, 11));
    const valid = hexToBytes(RECEIVERS[0][2]);
    const key = keyAt("m/32'/133'/0'");
    try {
      for (const use of [
        () => key.diversifierIndexOf(invalid),
        () => key.diversifierIndexOf(valid.subarray(0, 10)),
        () => key.diversifierIndexOf(valid.subarray(0, 12)),
        () => key.ownsAddress(concatBytes(invalid, valid.subarray(11))),
        () => key.ownsAddress(valid.subarray(0, 42)),
        () => key.ownsAddress(concatBytes(valid, Uint8Array.of(0))),
      ])
        expect(use).toThrow(expect.objectContaining({ code: "sapling.key.diversifier" }));
      // A transmission key that is not the account's, on a valid diversifier: not owned.
      const flipped = valid.slice();
      flipped[20] = (flipped[20] ?? 0) ^ 1;
      expect(key.ownsAddress(flipped)).toBe(false);
    } finally {
      key.wipe();
    }
  });
});

describe("refusals", () => {
  it("takes a seed of 32 to 252 bytes, as ZIP-32's wallet seeds are, and refuses any other", () => {
    for (const length of [0, 16, 31, 253, 512])
      expect(() => SaplingExtendedSpendingKey.fromSeed(new Uint8Array(length))).toThrow(
        expect.objectContaining({ code: "sapling.key.seed" }),
      );
    for (const length of [32, 64, 252])
      expect(() =>
        SaplingExtendedSpendingKey.fromSeed(new Uint8Array(length)).wipe(),
      ).not.toThrow();
  });

  it("refuses a spending key that is not 32 bytes", () => {
    for (const length of [0, 31, 33])
      expect(() => SaplingExpandedSpendingKey.fromSpendingKey(new Uint8Array(length))).toThrow(
        expect.objectContaining({ code: "sapling.key.spending-key" }),
      );
  });

  it("refuses an expanded key of another length or with a scalar from r_J on", () => {
    for (const length of [0, 95, 97])
      expect(() => SaplingExpandedSpendingKey.fromBytes(new Uint8Array(length))).toThrow(
        expect.objectContaining({ code: "sapling.key.expanded-key" }),
      );
    expect(() => expandedOf(ORDER, 1n)).toThrow(
      expect.objectContaining({ code: "sapling.key.expanded-key" }),
    );
    expect(() => expandedOf(1n, ORDER)).toThrow(
      expect.objectContaining({ code: "sapling.key.expanded-key" }),
    );
    expect(() => expandedOf(ORDER - 1n, ORDER - 1n).wipe()).not.toThrow();
  });

  it("refuses a key whose ask is zero, which ZIP-32 makes invalid", () => {
    expect(() => expandedOf(0n, 1n)).toThrow(
      expect.objectContaining({ code: "sapling.key.invalid" }),
    );
  });

  it("gives an nsk of zero the identity as nk", () => {
    // repr_J of the identity (0, 1): v = 1 little-endian and the sign bit of u = 0 clear (the
    // specification's "Jubjub").
    const key = expandedOf(1n, 0n);
    try {
      expect(bytesToHex(key.fullViewingKey().subarray(32, 64))).toBe(`01${"00".repeat(31)}`);
    } finally {
      key.wipe();
    }
  });

  it("refuses an index outside 0 to 2^31 - 1 before deriving any level", () => {
    const master = SaplingExtendedSpendingKey.fromSeed(SEED);
    const wipe = vi.spyOn(SaplingExtendedSpendingKey.prototype, "wipe");
    try {
      for (const index of [-1, 2 ** 31, 1.5, Number.NaN])
        expect(() => master.deriveHardened([32, 133, index])).toThrow(/Child index/u);
      expect(wipe).not.toHaveBeenCalled();
    } finally {
      master.wipe();
    }
  });

  it("refuses a path more than 255 levels below the master, counting earlier levels", () => {
    const master = SaplingExtendedSpendingKey.fromSeed(SEED);
    const child = master.deriveHardened([1]);
    try {
      expect(() => master.deriveHardened(Array.from({ length: 256 }, () => 0))).toThrow(
        expect.objectContaining({ code: "sapling.key.depth" }),
      );
      expect(() => child.deriveHardened(Array.from({ length: 255 }, () => 0))).toThrow(
        expect.objectContaining({ code: "sapling.key.depth" }),
      );
    } finally {
      child.wipe();
      master.wipe();
    }
  });

  it("derives down to depth 255, the most that ZIP-32's depth byte holds", () => {
    const key = keyAt(`m${"/0'".repeat(255)}`);
    try {
      expect(key.bytes()[0]).toBe(255);
    } finally {
      key.wipe();
    }
  });

  it("refuses a diversifier index outside 0 to 2^88 - 1 and a count below one", () => {
    const key = keyAt("m");
    try {
      for (const index of [-1n, SAPLING_MAX_DIVERSIFIER_INDEX + 1n]) {
        expect(() => key.addressAt(index)).toThrow(
          expect.objectContaining({ code: "sapling.key.diversifier-index" }),
        );
        expect(() => key.nextAddress(index, 1)).toThrow(
          expect.objectContaining({ code: "sapling.key.diversifier-index" }),
        );
      }
      for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
        expect(() => key.nextAddress(0n, count)).toThrow(
          expect.objectContaining({ code: "sapling.key.count" }),
        );
    } finally {
      key.wipe();
    }
  });

  it("refuses a diversifier that hashes to no point, and one that is not 11 bytes", () => {
    // d2 of m is invalid (sapling_zip32_hard.json): FF1-AES256 of the row's dk at j = 2, computed
    // by @noble/ciphers.
    const m = HARD_ROWS[0];
    const invalid = BinaryFF1(hexToBytes(m.dk)).encrypt(numberToBytesLE(2n, 11));
    const key = SaplingExpandedSpendingKey.fromBytes(hexToBytes(m.ask + m.nsk + m.ovk));
    try {
      expect(() => key.transmissionKey(invalid)).toThrow(
        expect.objectContaining({ code: "sapling.key.diversifier" }),
      );
      // 10 and 12 bytes that do hash to a point, so that only the length refuses them: the first 9
      // bytes of d0 then 01, and d0 then 01.
      for (const wrong of [`${m.d0.slice(0, 18)}01`, `${m.d0}01`]) {
        expect(() => jubjub_groupHash(hexToBytes(wrong), DIVERSIFY)).not.toThrow();
        expect(() => key.transmissionKey(hexToBytes(wrong))).toThrow(
          expect.objectContaining({ code: "sapling.key.diversifier" }),
        );
      }
    } finally {
      key.wipe();
    }
  });
});

describe("ZIP-316's Sapling items", () => {
  // Encodings that are not points of the prime-order subgroup by definition ("Jubjub"): the identity
  // (0, 1); (0, -1), of order 2; and v = 2^255 - 1, above q, so no encoding at all.
  const FIELD = jubjub.Point.Fp.ORDER;
  const IDENTITY = numberToBytesLE(1n, 32);
  const ORDER_TWO = numberToBytesLE(FIELD - 1n, 32);
  const ABOVE_FIELD = new Uint8Array(32).fill(0xff);
  const encoding = (row: (typeof HARD_ROWS)[number]) => hexToBytes(row.xfvk).subarray(PART(1)[0]);

  it.each(HARD_ROWS)("gives sapling_zip32_hard.json's FVK and IVK items of $path", (row) => {
    const key = keyAt(row.path);
    try {
      expect(bytesToHex(key.fullViewingKeyEncoding())).toBe(row.ak + row.nk + row.ovk + row.dk);
      expect(bytesToHex(key.incomingViewingKeyEncoding())).toBe(row.dk + row.ivk);
      expect(isSaplingFullViewingKeyEncoding(encoding(row))).toBe(true);
      expect(isSaplingIncomingViewingKeyEncoding(hexToBytes(row.dk + row.ivk))).toBe(true);
    } finally {
      key.wipe();
    }
  });

  it("refuses to give the items of a wiped key", () => {
    const key = keyAt("m");
    key.wipe();
    for (const use of [() => key.fullViewingKeyEncoding(), () => key.incomingViewingKeyEncoding()])
      expect(use).toThrow(expect.objectContaining({ code: "sapling.key.wiped" }));
  });

  it("takes every published receiver as a raw address, and refuses what is not one", () => {
    for (const [, , raw] of RECEIVERS) expect(isSaplingAddressEncoding(hexToBytes(raw))).toBe(true);
    const valid = hexToBytes(RECEIVERS[0][2]);
    const diversifier = valid.subarray(0, 11);
    // d2 of m is invalid (sapling_zip32_hard.json): FF1-AES256 of the row's dk at j = 2.
    const invalid = BinaryFF1(hexToBytes(HARD_ROWS[0].dk)).encrypt(numberToBytesLE(2n, 11));
    // The same pk_d written a second way, its v plus q, which stays below 2^255 for this receiver.
    const other = hexToBytes(RECEIVERS.find(([, , raw]) => raw.startsWith("9f6e0bf9"))?.[2] ?? "");
    const v = bytesToNumberLE(other.subarray(11));
    const second = numberToBytesLE((v & (2n ** 255n - 1n)) + FIELD + (v >> 255n) * 2n ** 255n, 32);
    expect(isSaplingAddressEncoding(other)).toBe(true);
    for (const refused of [
      concatBytes(other.subarray(0, 11), second),
      valid.subarray(1),
      concatBytes(valid, Uint8Array.of(0)),
      concatBytes(invalid, valid.subarray(11)),
      concatBytes(diversifier, IDENTITY),
      concatBytes(diversifier, ORDER_TWO),
      concatBytes(diversifier, ABOVE_FIELD),
    ])
      expect(isSaplingAddressEncoding(refused)).toBe(false);
  });

  it("refuses an FVK item whose ak is the identity or not in the subgroup, and an nk not in it", () => {
    const valid = encoding(HARD_ROWS[1]);
    const withPart = (at: number, part: Uint8Array): Uint8Array => {
      const changed = valid.slice();
      changed.set(part, at);
      return changed;
    };
    // nk may be the identity: its type is the subgroup J^(r), ak's the subgroup without it.
    expect(isSaplingFullViewingKeyEncoding(withPart(32, IDENTITY))).toBe(true);
    for (const refused of [
      withPart(0, IDENTITY),
      withPart(0, ORDER_TWO),
      withPart(0, ABOVE_FIELD),
      withPart(32, ORDER_TWO),
      withPart(32, ABOVE_FIELD),
      valid.subarray(1),
    ])
      expect(isSaplingFullViewingKeyEncoding(refused)).toBe(false);
  });

  it("takes an IVK item whose ivk is from 1 to 2^251 - 1, and refuses any other", () => {
    const dk = hexToBytes(HARD_ROWS[0].dk);
    const item = (ivk: bigint): Uint8Array => concatBytes(dk, numberToBytesLE(ivk, 32));
    for (const ivk of [1n, 2n ** 251n - 1n])
      expect(isSaplingIncomingViewingKeyEncoding(item(ivk))).toBe(true);
    for (const ivk of [0n, 2n ** 251n, 2n ** 256n - 1n])
      expect(isSaplingIncomingViewingKeyEncoding(item(ivk))).toBe(false);
    expect(isSaplingIncomingViewingKeyEncoding(item(1n).subarray(1))).toBe(false);
  });
});

describe("the keys' lifetime", () => {
  it("wipes every key between the master and the derived one, and leaves the master as it was", () => {
    const master = SaplingExtendedSpendingKey.fromSeed(SEED);
    const before = master.bytes();
    const wipe = vi.spyOn(SaplingExtendedSpendingKey.prototype, "wipe");
    const key = master.deriveHardened([1, 2, 3]);
    try {
      // m/1' and m/1'/2' are wiped; the master and m/1'/2'/3' are not.
      expect(wipe).toHaveBeenCalledTimes(2);
      expect(bytesToHex(key.bytes())).toBe(HARD_ROWS[3].xsk);
      expect(master.bytes()).toEqual(before);
    } finally {
      key.wipe();
      master.wipe();
      before.fill(0);
    }
  });

  it("gives a copy for an empty path, which is wiped apart from its original", () => {
    const master = SaplingExtendedSpendingKey.fromSeed(SEED);
    const copy = master.deriveHardened([]);
    try {
      expect(bytesToHex(copy.bytes())).toBe(HARD_ROWS[0].xsk);
      copy.wipe();
      expect(bytesToHex(master.bytes())).toBe(HARD_ROWS[0].xsk);
    } finally {
      copy.wipe();
      master.wipe();
    }
  });

  it("refuses every use of an extended key after wipe or dispose, except another wipe", () => {
    // A wiped key's parts are zero, from which anyone could compute the keys it would derive. The
    // refusal comes before any check of the arguments.
    for (const end of ["wipe", "dispose"] as const) {
      const key = SaplingExtendedSpendingKey.fromSeed(SEED);
      if (end === "wipe") key.wipe();
      else key[Symbol.dispose]();
      for (const use of [
        () => key.deriveHardened([]),
        () => key.deriveHardened([32, 133, 0]),
        () => key.deriveHardened([2 ** 31]),
        () => key.bytes(),
        () => key.extendedFullViewingKey(),
        () => key.incomingViewingKey(),
        () => key.fingerprint(),
        () => key.addressAt(0n),
        () => key.addressAt(-1n),
        () => key.nextAddress(0n, 1),
        () => key.nextAddress(0n, 0),
        () => key.diversifierIndexOf(new Uint8Array(11)),
        () => key.ownsAddress(new Uint8Array(43)),
      ])
        expect(use).toThrow(expect.objectContaining({ code: "sapling.key.wiped" }));
      expect(() => key.wipe()).not.toThrow();
    }
  });

  it("copies the bytes of an expanded key, and refuses its use after wipe or dispose", () => {
    const row = KEY_COMPONENTS[1];
    const bytes = hexToBytes(row.ask + row.nsk + row.ovk);
    const key = SaplingExpandedSpendingKey.fromBytes(bytes);
    bytes.fill(0);
    expect(bytesToHex(key.incomingViewingKey())).toBe(row.ivk);
    key[Symbol.dispose]();
    for (const use of [
      () => key.bytes(),
      () => key.fullViewingKey(),
      () => key.incomingViewingKey(),
      () => key.transmissionKey(hexToBytes(row.defaultD)),
      () => key.transmissionKey(new Uint8Array(0)),
    ])
      expect(use).toThrow(expect.objectContaining({ code: "sapling.key.wiped" }));
    expect(() => key.wipe()).not.toThrow();
  });
});
