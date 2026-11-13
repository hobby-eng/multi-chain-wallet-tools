// BIP32-Ed25519 (V2) and CIP-3's roots against published vectors: CIP-3's Ledger roots, CIP-11's
// stake key, the goldens of cardano-addresses, Trezor's firmware fixtures, cardano-serialization-lib,
// Trust Wallet's wallet-core and cardano-signer. Each value is copied from the file named beside it,
// at the commit named there. Public test data only.
import { ed25519 } from "@noble/curves/ed25519.js";
import { bech32 } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { cardanoIcarusRoot, type CardanoIcarusMaster } from "@ckd/core/cardano-icarus.js";
import { bytesToHex, concatBytes, hexToBytes } from "@ckd/core/crypto.js";
import {
  BIP32_ED25519_MAX_DEPTH,
  Bip32Ed25519Key,
  type Bip32Ed25519Level,
} from "../src/bip32-ed25519.js";

/** CIP-3's three master keys of a BIP39 phrase. */
type Master = CardanoIcarusMaster | "ledger";

/** The root key of `phrase` under `master`; the root bytes and the seed are wiped. */
function rootKey(phrase: string, master: Master, passphrase = ""): Bip32Ed25519Key {
  if (master === "ledger") {
    const seed = mnemonicToSeed(phrase, passphrase);
    try {
      return Bip32Ed25519Key.fromLedgerSeed(seed);
    } finally {
      seed.fill(0);
    }
  }
  const root = cardanoIcarusRoot(phrase, passphrase, master);
  try {
    return Bip32Ed25519Key.fromRoot(root);
  } finally {
    root.fill(0);
  }
}

/** The levels of a path such as m/1852'/1815'/0'/0/0. */
function levels(path: string): Bip32Ed25519Level[] {
  return path
    .split("/")
    .slice(1)
    .map((level) => ({
      index: Number(level.replace("'", "")),
      hardened: level.endsWith("'"),
    }));
}

/** The key at `path` of `phrase` under `master`; the caller wipes it. */
function keyAt(phrase: string, master: Master, path: string, passphrase = ""): Bip32Ed25519Key {
  const root = rootKey(phrase, master, passphrase);
  try {
    return root.derive(levels(path));
  } finally {
    root.wipe();
  }
}

/** A key's forms in hex, the key wiped: xsk (kL ‖ kR ‖ chain code), xvk, and cardano-cli's 128 bytes. */
function formsOf(key: Bip32Ed25519Key): { xsk: string; xvk: string; signingKey: string } {
  const privateKey = key.privateKey();
  const chainCode = key.chainCode();
  try {
    return {
      xsk: bytesToHex(concatBytes(privateKey, chainCode)),
      xvk: bytesToHex(key.extendedPublicKey()),
      signingKey: bytesToHex(concatBytes(privateKey, key.publicKey(), chainCode)),
    };
  } finally {
    privateKey.fill(0);
    chainCode.fill(0);
    key.wipe();
  }
}

/** The bytes of a CIP-5 bech32 key, such as acct_xsk1…, longer than BIP-173's 90 characters. */
function bech32Hex(text: string): string {
  return bytesToHex(bech32.decodeToBytes(text, false).bytes);
}

describe("CIP-3's Ledger and BitBox02 root", () => {
  // https://github.com/cardano-foundation/CIPs/blob/7720fed633e63df51d8102f251f6ed01e9104261/CIP-0003/Ledger_BitBox02.md,
  // "Test vectors": the second phrase's first HMAC has the third highest bit set, so CIP-3 hashes
  // again; the third uses the passphrase "foo".
  it.each([
    {
      phrase:
        "recall grace sport punch exhibit mad harbor stand obey short width stem awkward used stairs wool ugly trap season stove worth toward congress jaguar",
      passphrase: "",
      root: "a08cf85b564ecf3b947d8d4321fb96d70ee7bb760877e371899b14e2ccf88658104b884682b57efd97decbb318a45c05a527b9cc5c2f64f7352935a049ceea60680d52308194ccef2a18e6812b452a5815fbd7f5babc083856919aaf668fe7e4",
    },
    {
      phrase:
        "correct cherry mammal bubble want mandate polar hazard crater better craft exotic choice fun tourist census gap lottery neglect address glow carry old business",
      passphrase: "",
      root: "587c6774357ecbf840d4db6404ff7af016dace0400769751ad2abfc77b9a3844cc71702520ef1a4d1b68b91187787a9b8faab0a9bb6b160de541b6ee62469901fc0beda0975fe4763beabd83b7051a5fd5cbce5b88e82c4bbaca265014e524bd",
    },
    {
      phrase: `${"abandon ".repeat(23)}art`,
      passphrase: "foo",
      root: "f053a1e752de5c26197b60f032a4809f08bb3e5d90484fe42024be31efcba7578d914d3ff992e21652fee6a4d99f6091006938fac2c0c0f9d2de0ba64b754e92a4f3723f23472077aa4cd4dd8a8a175dba07ea1852dad1cf268c61a2679c3890",
    },
  ])("gives CIP-3's root of $phrase", ({ phrase, passphrase, root }) => {
    expect(formsOf(rootKey(phrase, "ledger", passphrase)).xsk).toBe(root);
  });
});

// IntersectMBO/cardano-addresses @27a2776f232f919c28b969a0c9b5f5b7e43586fd
// test/golden/addresses_<id>/golden, Shelley style (the Icarus root): the root, accounts 0 and 1,
// address key m/1852'/1815'/0'/0/0, and the public keys of addresses 0, 1 and 1442, for one
// phrase of each BIP39 word count. Golden 15e10657 has 9 words, which BIP39 has not.
const GOLDENS = [
  {
    golden: "addresses_5574d91d",
    phrase: "test walk nut penalty hip pave soap entry language right filter choice",
    root: "root_xsk1vzrzr76vqyqlavclduhawqvtae2pq8lk0424q7t8rzfjyhhp530zxv2fwq5a3pd4vdzqtu6s2zxdjhww8xg4qwcs7y5dqne5k7mz27p6rcaath83rl20nz0v9nwdaga9fkufjuucza8vmny8qpkzwstk5qh7s88m",
    account0:
      "acct_xsk12phl7y4uv58mne08me5szrwly2gn6jasqmkvcrndq762q68p5302z24gdf365klhll2a5f357k7nc4kpaq7j6agr5m22jq4jwlfv6l505h7dg64an4rdfk9f028nge0zcn508jw6m8lkdq36zc0v4h9xqsm27syf",
    account1:
      "acct_xsk1ppjrs9d7yh6qzmzng34nyh5ysx4uzewz09ndyjudgep0x6lp530vzh0gmwrt53p3h55l8ect5cw95ejpgj667eawewrcmrf2ajda4mzxlzpf2w63cwazlp9226pr4m6s35lawkmrqv8gf8ycl0ernjf69vyva4mc",
    address0:
      "addr_xsk1hqf6v2lvhfn5mr3fe6g8ac6n8a3z6s0p24mg6kre8jadxulp530y07wjp2ml0zcz8gk0xc7zy96qp2xxtr0arjq9038k9dhkw3k3cswawhs4fkjp00kwc4wd6fynyaz5zw8ssggs9974apatyhs4ltg4puw0nn7y",
    address0Public:
      "addr_xvk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7a6a0p2ndyz7lva32um5jfxf69gyu0pqs3q2tat6r6kf0pt7k32rcuhjq9l",
    address1Public:
      "addr_xvk17cn2hzr7kh6qk5pyv0x09mz6wvgkwmhfuh24cjfqtx3kds956jsl02cjdu5gfkust8aqnj5rhe4ch5p9qsn2ad3pjx7anps527uteygezrt4z",
    address1442Public:
      "addr_xvk1l7vftt4ayg29thue83m2crav65wqzak2v9v7lryjnnphq88rsrr3jz8rnt8t367z4zhhfu6ava2apt4sy4hk6dr9xvkvgwyqgnnvjkcyq26mk",
  },
  {
    golden: "addresses_341c2604",
    phrase:
      "art forum devote street sure rather head chuckle guard poverty release quote oak craft enemy",
    root: "root_xsk1hretan5mml3tq2p0twkhq4tz4jvka7m2l94kfr6yghkyfar6m9wppc7h9unw6p65y23kakzct3695rs32z7vaw3r2lg9scmfj8ec5du3ufydu5yuquxcz24jlkjhsc9vsa4ufzge9s00fn398svhacse5sh85djs",
    account0:
      "acct_xsk1crpfhmtv5vdjx9rsqre7z025gartudsanenhart5nh3muqnmm9wvu7jr0c2neykydr3r85rw6vht8sg0u4dffts2klnadgk9rt8zh23kfqwxrlk3feq0dvvfvd8htlpnhmpu2fpklpl09th296pm7sdc6qce0442",
    account1:
      "acct_xsk1jpfm7zhl6cwr4gkeuhtau603xv898ydam77d7c64xatjcptmm9wr5sn95u3a9vudl08q9lwzl4qltal70ddl9qvl3nhcmjkxlan652vgppy8uf42h4y279nxfazumh0hd8hdhkdrlp06qcwe6t69qt236qnnnyaq",
    address0:
      "addr_xsk1fzgcl9km0mve2jwe8qxve364w6te9vpddhwpw5g8wnjlupmmm9wxpdda6jaglx7smwl6qd5xuzjcweeq8ykp0wg9hng4pg6eumwx2t90swaed7ehsa6j86qsw3fnl4thtemsng6vukmz6ddf3cnd4sfkzu74xjqg",
    address0Public:
      "addr_xvk1fz009r4f0aceaemksezlca9cz8p8rewhaurvyvgg2ndnq9vwj3w6lqamjman0pm4y05pqazn8l2hwhnhpx35eedk9566nr3xmtqnv9ccm4zyu",
    address1Public:
      "addr_xvk1y3r70ejyadsaplez83p7uhy8p6l08a5sjl860kszevxu0jaxcwmx6avghwwqluj3eqg8zn7m0847smgh6hf3hs6ycj9wk6lsrplncvsxqj6wd",
    address1442Public:
      "addr_xvk1fqtu4wksrftpdxg5ayacthraykm8eflvnym7lgc4xlzz479dve5csvpdnywywdvkl53cp9uuh6jqs8qkmnevmgr8x06yewrk5hmsyystu0g5g",
  },
  {
    golden: "addresses_f30c9813",
    phrase:
      "churn shaft spoon second erode useless thrive burst group seed element sign scrub buffalo jelly grace neck useless",
    root: "root_xsk1az4qjp85qunj75m8krdvdygmv6u4ceqj8vnwaf38wfd69ycksa0fwt7n0cfp5zwmht9u0j9dzxxnfssjmkh4vn3dwxvddsle6m2vkm8q8p7addwq8y7q3s3eekd3ate40rfr6rpjakctcn2p54cpr3kjmy2hdej2",
    account0:
      "acct_xsk1vzjuw65sf27s478y8ndz2jpan4rev52h0fdh9z3tdwcplgqksa0wa9wntpw4d74rhj8rs2unf6rfujxu90mstt8ztnjrn80r8sz0edzf22jznx2n63qdalqm2tphlfn7k6qxtm0pg85z4ptk639vyjjufcagrnw9",
    account1:
      "acct_xsk1uq5jz089v7pjc76lqcac9lkl9d8fntc53h00ajlhr7msm8sksa0xljllgc5c2n5ruklwnkauxvlxsmcwat223rakj5dmfz2j9xxzvmpcqc0z9ekuywfhkm8w4k507caj4rv4qjhmnhafs8tkmsx6vtstduh0grq4",
    address0:
      "addr_xsk17zj2lhjk379klp40xfzsad0yzygqe45uaggnkzf4ld3emgsksa00ftq88fnfjxg245kjjqcukyjfg4lwmf3r2qqymyyqennch3y8llyg0d629pdx0pp0l69lerjz75kxmk5e6cr2d82kafp7a25y0qy5fvj06w0u",
    address0Public:
      "addr_xvk1fwgdh5vv6akdc3rjpeq57xxq4lc9m84xcrt6q827mq7u20wuw54gs7m552z6v7zzll5tlj8y9afvdhdfn4sx56w4d6jra64gg7qfgjc8e8sau",
    address1Public:
      "addr_xvk135hqmkaqydnxnq6wmjkkhasvwjprpnqnzsrwwes6mql45enlcsqs0vz4xasvja4qsvrw93v3gc7mmep76cf67a4yffdrsvuxqm9qhwqlvnay5",
    address1442Public:
      "addr_xvk1kvsa8pjxlg93nk87tdp08tauy2uc4hdy36xufkjlgdz2dm7p6pxx7lftf4zygku3sm5dgswyeqxdvsf768fg2g6ky20pzrgh6ck6f5grmcsny",
  },
  {
    golden: "addresses_0d256c78",
    phrase:
      "draft ability female child jump maid roof hurt below live topple paper exclude ordinary coach churn sunset emerge blame ketchup much",
    root: "root_xsk17zqw352yj02seytp9apunec55722k93crtplq8chgpfh7cx33dg4v2x3wpyhd9chhkknzhprztumrystkpfl5nyhyeuq0gnwf76r39u9l9q3z40hgf5jv6xn8unr5acs3yy8fxg35v5xjsw4kwvf5zfkvcn57fle",
    account0:
      "acct_xsk13rkczfa4xzrax4x0unqnesaasr8s3qnyr2mmjcwga6lrue733dg6at2stlqft9jtz0kk50xsp4yrqnrf9gl78npu50r7e38kpu0f744af46s2r37d7m6sh0uyj9szp86s546k43t2thfw4nzd7zsxckx6gd7zxnq",
    account1:
      "acct_xsk1rrd6a79s9gktygfmp4gxhme3jxvnxazk45u2twrwfnfg2c733dg323eaegqrxe7lt0zepz3aq3ydgdse8vjs7qks4c4yh0q39pdf4fsv4ql5tv5tny3mxzn20r792nl9nk904y0ztqgclyxuxzl56p6fsydppkqk",
    address0:
      "addr_xsk1fz8tz0pdda8la0aqhadnzctw0p48zwygkgf4xyar2jjljm733dgkprs4sj8cxfwv9xtfddpdfvjlap0hhg9gd37pr0tp7ue48mh9cnfyy68k52f88z5vghezam30c3pcue6aewl4mqul6nvassxlenh3eqh822k2",
    address0Public:
      "addr_xvk1x4dme9s2f5xxn77wgjhggqh73r6syy4nvjcdjklnaqrh48f6desjgf50dg5jww9gc30j9mhzl3zr3en4mjaltkpel4xempqdln80rjq5grmc7",
    address1Public:
      "addr_xvk1ndtepmpg06x9nskfasvr50mue356e4rqlvuzf8jjcj6n48feexsg7nsjyplmsky60snfh2kreugf8gdgw6d5q77mr5494jl5swwr0ysprauul",
    address1442Public:
      "addr_xvk1vagd70p45qd774cdna2qe2t3t9200hx3jcfvp39w3r9ruscjapdncx7hc2mcpjk5ydjqnkt97h532unrm7k8czquss8x7ly7nr5c06q2am4uq",
  },
  {
    golden: "addresses_775fd04c",
    phrase:
      "excess behave track soul table wear ocean cash stay nature item turtle palm soccer lunch horror start stumble month panic right must lock dress",
    root: "root_xsk1nzwq05qw3573slqc2he9g68qz0a3hjkexsc0ck3f3gjesqs33az3aprtwwnz0322ky75navetwzk8ve2mpsvqxdz3v9e2vsfe5gmcxzr2j9pn432xnghzjc6cgvsx5jwllat5qxy7n7tyqmyjesmv83v5cg2v2tz",
    account0:
      "acct_xsk1grmww8c9yftkd6nlmuh7wypx46duh8az7sxyg88fr4k3qpc33azk8gc5ntllturxzee5gj2zd5dy48f0ehp6lqudkwvacxjznz8j0mzd2ad0t2fmmaystgms97k7maz3afvy0ywjxwk7jzt96cyt43tnqsr5dmk0",
    account1:
      "acct_xsk13p9klhdduza8djyvfvwkvz92hnq4sa372kaz60j2a7fjgzg33azlmcm0zv26uldtrl7war6l2cm5ynkplnfqtuylmp52kt9j5yy3ck5vxvhqkh9g2xmgnxqay9l58pe683ey4c4tpxq27j75t9wuar224uley9fx",
    address0:
      "addr_xsk1zq578drze4tp8fq43gur62v2j57vd5nvg862jc8hz5f959g33azuy3hl7ce8cjrxua5nyarqr9f4aatqecjsq9gturmqrcpkwuhu5rchassddgsr6uaa5vzk80fq72wg8fejl9fyc94f8vvp0x904augp5d9xhd2",
    address0Public:
      "addr_xvk1lytzhygjvgftw9gqazwu0k33zywlc9rx48ey7j9rfel222wj6vup0mpq663q84emmgc9vw7jpu5uswnn972jfst2jwccz7v2ltmcsrgmnsayh",
    address1Public:
      "addr_xvk1vh7dfgcpejhgsvf3h9splavunc2lktzq6pywvhd77amer2etywa8ktf9h9n8p6j3cg4r3jl75xprsdfter3pkd35zman3letmfygp9qp77uvd",
    address1442Public:
      "addr_xvk1qlsdp05jtlsyqrxft7cmyjuww0f85ppaknzkszh8q3dh9cwqspmqk0pahrhvvjy3eyvntq7ldrv2p8rn5xjmr2vftmxcvma24n29z7q3xv97j",
  },
];

// trezor-firmware @433075c0a0e643d3a07364226fed40a7bbc717a8 common/tests/fixtures/cardano/
// get_public_key.derivations.json (one 24-word phrase under all three master keys) and
// get_public_key.json (the "all" phrase, whose fixtures run Icarus-Trezor, the same as Icarus at
// 12 words): each account's public key and chain code.
const TREZOR_ACCOUNTS: readonly {
  id: string;
  master: Master;
  phrase: string;
  path: string;
  xvk: string;
}[] = [
  {
    id: "trezor-acct-xvk-icarus-derivation",
    master: "icarus",
    phrase:
      "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north",
    path: "m/1852'/1815'/0'",
    xvk: "8946b80aaa2ab0839276ca373d0b7845803ae39e452ac2469986bf8b360b217f85e096c7789c5aa29012633044750b1a79ab5ac2eb7189c91113e8ffbadd550f",
  },
  {
    id: "trezor-acct-xvk-icarus-trezor-derivation",
    master: "icarus-trezor",
    phrase:
      "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north",
    path: "m/1852'/1815'/0'",
    xvk: "8a97a956fadbc79e09a867ed1e829af4f66a34903c9194de44c87262dfe19111dd97903ff01f4fcb6375c8252b31a59d9b170c1b61f5786304dc676270f44a90",
  },
  {
    id: "trezor-acct-xvk-ledger-derivation",
    master: "ledger",
    phrase:
      "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north",
    path: "m/1852'/1815'/0'",
    xvk: "09a48c3390586bf1b5141e141fd2045b54f0a100af4254abb9bcf124eb82b078abb4f1731e9bb4151fb8bbe4a63c64b84a6e6193ef2b97edd4176136d55c235f",
  },
  {
    id: "trezor-acct-xvk-all-0",
    master: "icarus-trezor",
    phrase: "all all all all all all all all all all all all",
    path: "m/1852'/1815'/0'",
    xvk: "d507c8f866691bd96e131334c355188b1a1d0b2fa0ab11545075aab332d77d9eb19657ad13ee581b56b0f8d744d66ca356b93d42fe176b3de007d53e9c4c4e7a",
  },
  {
    id: "trezor-acct-xvk-all-1",
    master: "icarus-trezor",
    phrase: "all all all all all all all all all all all all",
    path: "m/1852'/1815'/1'",
    xvk: "140791584001446365f169c82241c7c214475000180dab39fa0588fc9c3d6d807f9f812d49816844b52e319857aa75961724ad1a146701679d02d7168622233d",
  },
  {
    id: "trezor-acct-xvk-all-2",
    master: "icarus-trezor",
    phrase: "all all all all all all all all all all all all",
    path: "m/1852'/1815'/2'",
    xvk: "ff6ccc3097ca79fc29fe92a9639c47644746780c63acae10a9e6f03bf5c919dd27d985feabf40d83a30aa4645ff008c068187559dd224ba59e26d0d2dc3598ce",
  },
  {
    id: "trezor-acct-xvk-all-3",
    master: "icarus-trezor",
    phrase: "all all all all all all all all all all all all",
    path: "m/1852'/1815'/3'",
    xvk: "be81ace1f63f4f0cae74dd274a72d7818f238bc764ab3e0dc0beb1945b756dca29034f036a162ac4f9f9f397b2d1f289754bb6633915f26b199e156f81d05c88",
  },
];

// gitmachtl/cardano-signer @3cc4a7448d57f87dc01227f56ecbe04ea4c72a94 README.md, keygen with
// --path 1852H/1815H/0H/0/0 and the derivation types icarus and ledger: the account's public key
// with its chain code, and the address key as cardano-cli's 128 bytes (kL ‖ kR ‖ public key ‖ chain code).
const SIGNER_KEYS: readonly {
  id: string;
  master: Master;
  phrase: string;
  account: string;
  signingKey: string;
}[] = [
  {
    id: "cardano-signer-keygen-icarus",
    master: "icarus",
    phrase:
      "snap siege fatal leopard label thunder rely trap robot identify someone exclude glance spring right rude tower pluck explain mouse scheme sister onion include",
    account:
      "f1d184dc020c90ed0ab318f98b2bbf0b215723d3e68121fba9b12bd5389fa9a3cb01f7d31f63fd73c7406a4381066c747b2cc6eafccbc1f85eb24f664238216a",
    signingKey:
      "60f0a79e0776b4063d7bff8ada6a37b5fb79168d5e844b51e45fa5088eac6558f858251fdfd2fc55488fceb448c5d8f5d1c93cea5505df05efed86efd90ded6d4db6843876f0154e7d5ab14ddec3dacb353b44d38b9a5a03bde142b5cedf52479eeb435bd154d50e80b2980900ac2d8237408ae373daf68d19b6013f5fcd2ef2",
  },
  {
    id: "cardano-signer-keygen-ledger",
    master: "ledger",
    phrase:
      "snap siege fatal leopard label thunder rely trap robot identify someone exclude glance spring right rude tower pluck explain mouse scheme sister onion include",
    account:
      "58c80020cc2e6c99e801f6caaa296381673c7ea8aed92cb14b5229dc7434acc97c04b33d3aa811847957f4f82965e7d4e2a7273b67f251c22bfca5dcdfd44c03",
    signingKey:
      "f80ad0a24e08aaa39136ae52ab007b0e3b9d1d593b3d170fcaa61a322fcdb95d5e3a846ea94ebbf22ac5ab64abd7583404762bb3850f4c3362a46226ee92eec94c0ffded554c9a6eda379450af9f38640f87aff455129f679996e056697d4190a00c5bcb331ad60daf8b5b0a3fe6dfa2ec48c546f6290a9787cadd566807eb91",
  },
];

describe("BIP32-Ed25519 children (V2)", () => {
  it.each(GOLDENS)("gives cardano-addresses' keys of golden $golden", (golden) => {
    const at = (path: string) => formsOf(keyAt(golden.phrase, "icarus", path));
    expect(formsOf(rootKey(golden.phrase, "icarus")).xsk).toBe(bech32Hex(golden.root));
    expect(at("m/1852'/1815'/0'").xsk).toBe(bech32Hex(golden.account0));
    expect(at("m/1852'/1815'/1'").xsk).toBe(bech32Hex(golden.account1));
    expect(at("m/1852'/1815'/0'/0/0").xsk).toBe(bech32Hex(golden.address0));
    expect(at("m/1852'/1815'/0'/0/0").xvk).toBe(bech32Hex(golden.address0Public));
    expect(at("m/1852'/1815'/0'/0/1").xvk).toBe(bech32Hex(golden.address1Public));
    expect(at("m/1852'/1815'/0'/0/1442").xvk).toBe(bech32Hex(golden.address1442Public));
  });

  it.each(TREZOR_ACCOUNTS)("gives Trezor's account key $id", ({ master, phrase, path, xvk }) => {
    expect(formsOf(keyAt(phrase, master, path)).xvk).toBe(xvk);
  });

  it("gives CIP-11's stake key", () => {
    // https://github.com/cardano-foundation/CIPs/blob/7720fed633e63df51d8102f251f6ed01e9104261/CIP-0011/README.md,
    // "Test vectors": the stake key m/1852'/1815'/0'/2/0, kL ‖ kR ‖ chain code.
    const phrase =
      "prevent company field green slot measure chief hero apple task eagle sunset endorse dress seed";
    expect(formsOf(keyAt(phrase, "icarus", "m/1852'/1815'/0'/2/0")).xsk).toBe(
      "b8ab42f1aacbcdb3ae858e3a3df88142b3ed27a2d3f432024e0d943fc1e597442d57545d84c8db2820b11509d944093bc605350e60c533b8886a405bd59eed6dcf356648fe9e9219d83e989c8ff5b5b337e2897b6554c1ab4e636de791fe5427",
    );
  });

  it("gives Trust Wallet's payment and stake keys", () => {
    // trustwallet/wallet-core @7a21615fad32edd8dc0b040d845de3973cde2c5a
    // tests/chains/Cardano/AddressTests.cpp, MnemonicToAddressV3: getKey of m/1852'/1815'/0'/0/0
    // (kL ‖ kR ‖ chain code, then the stake key's) and its public keys with chain codes.
    const phrase =
      "cost dash dress stove morning robust group affair stomach vacant route volume yellow salute laugh";
    const payment = formsOf(keyAt(phrase, "icarus", "m/1852'/1815'/0'/0/0"));
    const stake = formsOf(keyAt(phrase, "icarus", "m/1852'/1815'/0'/2/0"));
    expect(payment.xsk + stake.xsk).toBe(
      "e8c8c5b2df13f3abed4e6b1609c808e08ff959d7e6fc3d849e3f2880550b574437aa559095324d78459b9bb2da069da32337e1cc5da78f48e1bd084670107f3110f3245ddf9132ecef98c670272ef39c03a232107733d4a1d28cb53318df26fae0d152bb611cb9ff34e945e4ff627e6fba81da687a601a879759cd76530b5744424db69a75edd4780a5fbc05d1a3c84ac4166ff8e424808481dd8e77627ce5f5bf2eea84515a4e16c4ff06c92381822d910b5cbf9e9c144e1fb76a6291af7276",
    );
    expect(payment.xvk + stake.xvk).toBe(
      "fafa7eb4146220db67156a03a5f7a79c666df83eb31abbfbe77c85e06d40da3110f3245ddf9132ecef98c670272ef39c03a232107733d4a1d28cb53318df26faf4b8d5201961e68f2e177ba594101f513ee70fe70a41324e8ea8eb787ffda6f4bf2eea84515a4e16c4ff06c92381822d910b5cbf9e9c144e1fb76a6291af7276",
    );
  });

  it.each(SIGNER_KEYS)(
    "gives cardano-signer's keys of $id",
    ({ master, phrase, account, signingKey }) => {
      expect(formsOf(keyAt(phrase, master, "m/1852'/1815'/0'")).xvk).toBe(account);
      expect(formsOf(keyAt(phrase, master, "m/1852'/1815'/0'/0/0")).signingKey).toBe(signingKey);
    },
  );

  it("gives cardano-serialization-lib's 128-byte root", () => {
    // Emurgo/cardano-serialization-lib @6b4253814f1831fee06cda2718fd47174960ace1
    // rust/src/tests/crypto.rs, xprv_128_test: to_128_xprv of the root.
    const phrase =
      "art forum devote street sure rather head chuckle guard poverty release quote oak craft enemy";
    expect(formsOf(rootKey(phrase, "icarus")).signingKey).toBe(
      "b8f2bece9bdfe2b0282f5bad705562ac996efb6af96b648f4445ec44f47ad95c10e3d72f26ed075422a36ed8585c745a0e1150bcceba2357d058636991f38a37cf76399a210de8720e9fa894e45e41e29ab525e30bc402801c076250d1585bcd91e248de509c070d812ab2fda57860ac876bc489192c1ef4ce253c197ee219a4",
    );
  });
});

// trezor-firmware @433075c0a0e643d3a07364226fed40a7bbc717a8 common/tests/fixtures/cardano/
// sign_message.json, the "all" phrase: the signing key, the "address" its header holds (a key
// hash without address parameters, the base address of fixture 1), the payload, and the
// signature. Fixtures 2 and 3 have the same values here; the fixture file runs both.
const TREZOR_SIGNATURES = [
  {
    fixture: 0,
    path: "m/1852'/1815'/4'/0/0",
    address: "d9553a4de9c7ad8532abdb1d0a7f425b8007d25c9f1edcf0b5f5c3ba",
    payload: "ff00",
    publicKey: "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    signature:
      "5ad6ba670e65353b2c1ad4053a1ed4a9348a73fe965ffa0afafa24bad06e3eb3e325d49029604c09bf665c3c43a750ec81a43b1f8b746b07e999b913b980d006",
  },
  {
    fixture: 1,
    path: "m/1852'/1815'/4'/0/0",
    address:
      "0180f9e2c88e6c817008f3a812ed889b4a4da8e0bd103f86e7335422aa122a946b9ad3d2ddf029d3a828f0468aece76895f15c9efbd69b4277",
    payload: "ff00",
    publicKey: "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    signature:
      "9efaff0b74c0beb2cadd727d8bafe13b31107235c5fc46c6c33e596e024d391c9fbe37072e43965add6ee0a4788562382031486b74fd59d636aa1ca3b1ddfe06",
  },
  {
    fixture: 2,
    path: "m/1852'/1815'/4'/0/0",
    address: "d9553a4de9c7ad8532abdb1d0a7f425b8007d25c9f1edcf0b5f5c3ba",
    payload: "54657374",
    publicKey: "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    signature:
      "2201b8e7fa9ea919935e06ecc3e845433855066acaaf61cb8e624a2eb7139b73a9d126e7ee04548fff06ac933bd5419fc78c5aebee9b536cbee1481b52ec3e03",
  },
  {
    fixture: 3,
    path: "m/1852'/1815'/4'/0/0",
    address: "d9553a4de9c7ad8532abdb1d0a7f425b8007d25c9f1edcf0b5f5c3ba",
    payload: "54657374",
    publicKey: "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    signature:
      "2201b8e7fa9ea919935e06ecc3e845433855066acaaf61cb8e624a2eb7139b73a9d126e7ee04548fff06ac933bd5419fc78c5aebee9b536cbee1481b52ec3e03",
  },
  {
    fixture: 4,
    path: "m/1852'/1815'/4'/0/0",
    address: "d9553a4de9c7ad8532abdb1d0a7f425b8007d25c9f1edcf0b5f5c3ba",
    payload: "",
    publicKey: "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c",
    signature:
      "b09177a06cb2deba7ada89fec96fc4380e746f67c6b16a9ef9ae6b7cbbe941fdad8a8a573b809cd88db296b91b476c436033a29d86a63959e270047e47cd5d0d",
  },
];

describe("signatures with an extended key", () => {
  /** CBOR's head of a byte or text string shorter than 256 bytes, as these vectors need. */
  const head = (major: number, length: number): number[] =>
    length < 24 ? [(major << 5) | length] : [(major << 5) | 24, length];
  const bytes = (value: Uint8Array): number[] => [...head(2, value.length), ...value];
  const text = (value: string): number[] => [
    ...head(3, value.length),
    ...new TextEncoder().encode(value),
  ];

  /**
   * The bytes Trezor signs (core/src/apps/cardano/sign_message.py L124-151, CIP-8's Sig_structure):
   * ["Signature1", bstr({1: -8, "address": address}), h'', payload], in CBOR.
   */
  function sigStructure(address: Uint8Array, payload: Uint8Array): Uint8Array {
    const header = [0xa2, 0x01, 0x27, ...text("address"), ...bytes(address)];
    return Uint8Array.from([
      0x84,
      ...text("Signature1"),
      ...bytes(Uint8Array.from(header)),
      ...bytes(new Uint8Array(0)),
      ...bytes(payload),
    ]);
  }

  it.each(TREZOR_SIGNATURES)(
    "gives Trezor's signature of fixture $fixture, which RFC 8032 verifies",
    ({ path, address, payload, publicKey, signature }) => {
      const key = keyAt("all all all all all all all all all all all all", "icarus", path);
      try {
        const message = sigStructure(hexToBytes(address), hexToBytes(payload));
        const signed = key.sign(message);
        expect(bytesToHex(key.publicKey())).toBe(publicKey);
        expect(bytesToHex(signed)).toBe(signature);
        expect(ed25519.verify(signed, message, key.publicKey(), { zip215: false })).toBe(true);
        const other = Uint8Array.from(message);
        other[other.length - 1] = (other.at(-1) ?? 0) ^ 1;
        expect(ed25519.verify(signed, other, key.publicKey(), { zip215: false })).toBe(false);
      } finally {
        key.wipe();
      }
    },
  );
});

describe("refusals, limits and lifetime", () => {
  const PHRASE = "test walk nut penalty hip pave soap entry language right filter choice";

  /** The Icarus root bytes of PHRASE, which the caller wipes. */
  const rootBytes = () => cardanoIcarusRoot(PHRASE, "", "icarus");

  it("refuses a root of another length, and one without CIP-3's bits", () => {
    const root = rootBytes();
    try {
      for (const length of [0, 64, 95])
        expect(() => Bip32Ed25519Key.fromRoot(root.slice(0, length))).toThrow(/96 bytes/u);
      expect(() => Bip32Ed25519Key.fromRoot(concatBytes(root, Uint8Array.of(0)))).toThrow(
        /96 bytes/u,
      );
      // Each of kL's root bits flipped in turn: the three low bits, then the top three of byte 31.
      for (const [at, bit] of [
        [0, 0],
        [0, 1],
        [0, 2],
        [31, 5],
        [31, 6],
        [31, 7],
      ] as const) {
        const flipped = Uint8Array.from(root);
        flipped[at] = (flipped[at] ?? 0) ^ (1 << bit);
        expect(() => Bip32Ed25519Key.fromRoot(flipped)).toThrow(/96 bytes/u);
        flipped.fill(0);
      }
    } finally {
      root.fill(0);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses an index outside 0 to 2^31 - 1", () => {
    const root = rootKey(PHRASE, "icarus");
    try {
      for (const index of [-1, 2 ** 31, 0.5, Number.NaN])
        for (const hardened of [false, true])
          expect(() => root.derive([{ index, hardened }])).toThrow(/Child index/u);
    } finally {
      root.wipe();
    }
  });

  it("refuses a bad index at any level before deriving the levels above it", () => {
    const root = rootKey(PHRASE, "icarus");
    // A normal level reads its parent's public key, so a derived level would call publicKey().
    const publicKeys = vi.spyOn(Bip32Ed25519Key.prototype, "publicKey");
    const normal = { index: 0, hardened: false };
    try {
      expect(() => root.derive([normal, normal, { index: -1, hardened: false }])).toThrow(
        /Child index/u,
      );
      expect(publicKeys).not.toHaveBeenCalled();
    } finally {
      root.wipe();
    }
  });

  it("refuses a Ledger seed that is not a 64-byte BIP39 seed", () => {
    for (const length of [0, 32, 63, 65, 96])
      expect(() => Bip32Ed25519Key.fromLedgerSeed(new Uint8Array(length))).toThrow(
        /64-byte BIP39 seed/u,
      );
  });

  it("refuses a path deeper than 2^20 levels before deriving any of it", () => {
    const root = rootKey(PHRASE, "icarus");
    const level = { index: 0, hardened: false };
    try {
      const deeper = Array.from({ length: BIP32_ED25519_MAX_DEPTH + 1 }, () => level);
      expect(() => root.derive(deeper)).toThrow(/levels below its root/u);
    } finally {
      root.wipe();
    }
  });

  it("counts the levels of an earlier derive toward the limit", () => {
    // From the review of C1 (tmp/coins-wave3-2026-11-13/review-c1/mutants/extra.test.ts): a key one
    // level down has 2^20 - 1 levels left, so 2^20 more are refused before any is derived.
    const root = rootKey(PHRASE, "icarus");
    const level = { index: 0, hardened: true };
    const child = root.derive([level]);
    try {
      const rest = Array.from({ length: BIP32_ED25519_MAX_DEPTH }, () => level);
      expect(() => child.derive(rest)).toThrow(/levels below its root/u);
    } finally {
      child.wipe();
      root.wipe();
    }
  });

  it("copies its root, leaves a parent as it was and wipes on request", () => {
    const root = rootBytes();
    const copy = Uint8Array.from(root);
    const key = Bip32Ed25519Key.fromRoot(root);
    root.fill(0);
    try {
      expect(formsOf(key.derive([])).xsk).toBe(bytesToHex(copy));
      const child = key.derive(levels("m/1852'/1815'/0'"));
      expect(formsOf(key.derive([])).xsk).toBe(bytesToHex(copy));
      child.wipe();
      expect(child.privateKey()).toEqual(new Uint8Array(64));
      expect(child.chainCode()).toEqual(new Uint8Array(32));
    } finally {
      key.wipe();
      copy.fill(0);
    }
  });
});
