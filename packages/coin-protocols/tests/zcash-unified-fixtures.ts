// The published vectors of ZIP-316's unified encodings (test/fixtures/zcash-test-vectors, byte for
// byte from zcash/zcash-test-vectors @78321beacb0e0477e33cd002b56585a107c2708c) and the own fixtures
// that test/oracles/zcash_unified_oracle.py builds and checks, for the unit tests of
// coins/zcash/unified.ts. Public test data only.
import { readFileSync } from "node:fs";
import { hexToBytes } from "@ckd/core/crypto.js";
import type { UnifiedKind } from "../src/coins/zcash/unified.js";

/** The folder of the published vector files. */
export const FIXTURES = new URL("../../../test/fixtures/zcash-test-vectors/", import.meta.url);

/** A cell of a published vector file. */
export type Cell = string | number | null;

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isCell = (value: unknown): value is Cell =>
  value === null || typeof value === "string" || typeof value === "number";

/** The rows of a published vector file: a source line, a line of column names, then the rows. */
export function rows(name: string): Record<string, Cell>[] {
  const table: unknown = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), "utf8"));
  if (!isList(table)) throw new Error(`${name}.json is not a table.`);
  const [, header, ...body] = table;
  if (!isList(header) || typeof header[0] !== "string")
    throw new Error(`${name}.json has no column names.`);
  const columns = header[0].split(", ");
  return body.map((row) => {
    if (!isList(row) || !row.every(isCell)) throw new Error(`${name}.json has a bad row.`);
    return Object.fromEntries(columns.map((column, at) => [column, row[at] ?? null]));
  });
}

/** The bytes of a hex column, or undefined where it is null. */
export function bytesOf(row: Record<string, Cell>, column: string): Uint8Array | undefined {
  const value = row[column];
  return typeof value === "string" ? hexToBytes(value) : undefined;
}

/** The text of a column. */
export function textOf(row: Record<string, Cell>, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new Error(`Column ${column} holds no text.`);
  return value;
}

// The own fixtures: name, kind, the code of the refusal (null where it is read) and the text.
// Each is built from published items by test/oracles/zcash_unified_oracle.py, which checks it.
export const OWN_FIXTURES: readonly (readonly [string, UnifiedKind, string | null, string])[] = [
  [
    "unordered",
    "address",
    "order",
    "u1rans3uu7cj0xyc7t7wfwqh65pau3aslpksy8jxpay5jf0q4cak9p4masfgl88tsnkh5nr9ly8cp29kv6q2qsdvxcjkc4x78540my82enpg4xv7zpwqeycwvcru38fq4eeqlv5dsfuz6",
  ],
  [
    "duplicate",
    "address",
    "duplicate",
    "u1kdqxafj5ev2hln8y7wr9k77gd4jg4gjhnjnsa3vxs4eylz6xpsksf20638ed0uqs3f2wzcfl8vq90h25t0p75t009ljt4k3g7j5rwc6rnmk6gl87zv3vkz3tgp23274kgzwmvhl3sqgeak45wskyhky90ue333ya4s4ul53zhuzjy83g",
  ],
  [
    "Orchard before Sapling",
    "address",
    "order",
    "u1hyc9pxt3kjr7a0e2a2faays9x07ze75zfjaqruz9f82at7w6fmxzxkuq8sgzdw54vrdzafkzge3yccu03upjpjah4nrk8d96qmsx08gfj3rqxqweg3u0p43vhfwwq3p00ku4p28rqwjpn804hhdql9mgxp8tgsm764mau0l0ly6t242s",
  ],
  [
    "both transparent",
    "address",
    "transparent",
    "u1seencrsknk7cr82rkjnz4zzjp7ztmamshe0z8rlnegfcn0lvh3ht8lsel77m8xday9esv3g3snky454k0rfaygdqd6kxvlmtr7relgv99qdwzw6v3ftq658j9le9nemgxmz83cjv8u38c4k3ar06vpqkc4pcnkpka7p94tt644q8pk",
  ],
  [
    "transparent only",
    "address",
    "shielded",
    "u1uptfvk09nqmf26h3vtved67enyxqezeknsa43cvafpmyfk5gkmszm36m8jpd2nvzu3u",
  ],
  [
    "must-understand",
    "address",
    "must-understand",
    "u14jrf0w38qn8nfe6mc9at8tn5c6gu3zvk5gsr7l7s45vm96plrsh23uqsa0h7ehpqne5ufsmm3xwan85cttrudpk4vyhs52c5z27nn7ctpc0s25w5rd",
  ],
  [
    "must-understand 0xFC",
    "address",
    "must-understand",
    "u1htc26ef386l3gdhmlmfsxpy6nee245jgugtsh3ql3u050wc5wyfzh24eqzzrs9hz5lga7yvp33v77scq538y87ykeqzsy0702wccq6ka4qz",
  ],
  [
    "typecodes 0xDF and 0xFD",
    "address",
    null,
    "u10xr7r7atxwtd03j3km3gl6cy989pce2npayk3rpja0uezwwsudrksy2jd9uwz7yyzeqv8rgzmdr50pe8sy6wjldh9xugmkml48mnj2telfaslv6v5w",
  ],
  [
    "birthday metadata",
    "address",
    null,
    "u1tnc89yss69ke5n738gdgl2emtwrudz58fwk8hdz48qfzdljk3rnxqrh66fp9j4vrxfnfn68s22gm5z25rfq09zwnv7jzfqnr2nfevcl672csyvv5sv",
  ],
  [
    "padding of uview",
    "address",
    "padding",
    "u1h2nngdf6et5s5g6fhe3kguft3558qjq84u6xae0sldkgesynl3scw2894wkytsz66m7p75sry3n7v4ldz3hefmz8qw8rtnfqt50fvf6x",
  ],
  [
    "long CompactSize",
    "address",
    "encoding",
    "u1ev68fjgq3p0eupkhl2qz7v4ntxesf209hk7ywtdnfv4jv0pkv4ckv6jwlnclt54pcuplwd7wmdtvua6t52zar0mnkqjzmgvh00a4j78f60j",
  ],
  [
    "truncated item",
    "address",
    "encoding",
    "u18nlqsj4utjsz5zxjwp7mdjp6eqynacwaqmvxc894ln9pkjajashpxxypt6jn9mr9xnh469dtawep9am2yau2c03g2cq8chm697wvnz",
  ],
  [
    "typecode above 0x2000000",
    "address",
    "encoding",
    "u1jg7ny7vxxddwz6n24yy8ym8t3as2v6r7jylxcus7qs8xyyhm6c2zhcww0gq4srwdg0xrwndy6ssyp797e99y05seevs0w299cm36l3zcnmep98",
  ],
  [
    "typecode 0x2000000",
    "address",
    null,
    "u1ur8w0n4gr9sjes8jrnze8q4h4d2ywwapc4um92jzpu5k0rmjekse5xve783pc7m4r0yk3u8twnk5ygt0mzv3rl4ze7yz72rnps2ehvnct79smfk0t0",
  ],
  [
    "short Sapling receiver",
    "address",
    "item",
    "u1nnn8g5tayk45259wg2h78gzqrkv57p8fj6x50l4hdnu4kwecf2g3fs5re7qsm3c84z446x048as6pw9pk7eyl2h32mw6s0l5e92l4m",
  ],
  [
    "pk_d plus q",
    "address",
    "item",
    "u1yudmu9fz5xt7myrwr9pwqs9sy4ztnyqvhlmkjhk7pn8hs4januacez9kkqxnhm2tjpy38nzrzs5nl0e4kdhejac46g6m5wcdjux7afz7",
  ],
  [
    "P2PKH receiver of 21 bytes",
    "address",
    "item",
    "u14z6ed3r9wjkm4rcnkpe8v4vgfxzdhqqmrrl08ceqcg0kzxrxnkjthtc0cn0mzfzpw8jh9x0kh2fd58pmx7gn2t7dsn0r6csqfqpe67d2am3fxgn99f6cnmhn3txfpxjjyyexd4cpqpp73",
  ],
  [
    "Orchard item of 5 bytes",
    "address",
    "item",
    "u1mx0ck0qhnahl2drvhpvkd3d36tw9c48k8a2mthvg8hq4vkj5wc89ykfme9vcvp3qsp4ysulz5zz2jx7ktxkgl6j9pcj26kqspjrgjny6nrg0jqe6dlx",
  ],
  [
    "Orchard item of 22 bytes alone",
    "address",
    "item",
    "u104pppykulu0f7xrxk7sj0ytmfykx7pmc73hvds9lr7xsul2f2gtrtj99mgu620z9w8pqze",
  ],
  [
    "37 bytes",
    "address",
    "length",
    "u1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0jqgfzyvjqfxlp5c",
  ],
  [
    "testnet",
    "address",
    "network",
    "utest1eg8xn8elv57zj668gquxekx0hp9j66mczqunfnct6wptr7qc5hgydzzea89sftc9zqw08akv8a85l2jsyfshdgnquyclkadely0zta30",
  ],
  [
    "Revision 2",
    "address",
    "revision",
    "zu1f6j724maqljlkjmhrs2l5rwwm9lede59ltmgqg706p8axyh25gccjl2k37ywskgu07rlhclqd2swwn02vyxa7yzwvhq68mwkgu4uw2hw",
  ],
  [
    "Revision 2 testnet",
    "address",
    "revision",
    "zutest1v8s2lnn3pjafxph4fm3p0r7yxnsvsdsada4uzlxvc3s3jan4wh736slserd8uaa3hyrd987u8tr9k6mfa0tlgg3q29kklfzksqsv5s7l",
  ],
  [
    "padding bits set",
    "address",
    "bech32m",
    "u1eu3dyegpyue9fkk6e0ac8x3jdylk90uu8uxfvwshwd4xylgfc9h8x2wfxvrttgf5xrfr2je9w8ur8qgrc29cex2ddd6gwhfxg0993xvk",
  ],
  [
    "identity ak",
    "full-viewing-key",
    "item",
    "uview1uaeulq98v3mjwvxq5np3qe5s0snftp0plxxpqcn88ue45e5eeuqmptel5xflqax2wnyeennyst5pejw3nj60phpknsggyfwm4zsannzeuw00yg7xssamwcz3yc6tffadpxkt542e6q0vp7x8wwlkr8yguu8cjaak4hg0wk0n2cnjydhz5fqr5jnt675pjfcaf9uvmwejd89znk8ftwxskhq5v0phg8rxvh9v7ymzevlh30t3",
  ],
  [
    "P2PKH key, then identity ak",
    "full-viewing-key",
    "item",
    "uview18c7zj697v597dtftqwquevl4tm07e20au48yq043c667raz39k72vrjgsgw0wpzc4yvl9nf6htk9rhe4fdlr2nj4g9fprtzru0de2l0dlzj5paesz9cf92y6rujrvspwxs5vyc4p6kn3m8gy2jstsp4ll7ljedzdej847xp44ffc6nm82jcz2c4gc53evlkawmwuvydaf8zvq6tmtw7jtv6r8j5egtjt99wpvujdyz07wsdh4j578z9rlna3z4wjtq3nhke5s6hxukuhk5fc8cqd9xzpn7ucyvdp694mzpme9j35y3r5ma9qd6vqnh6rxm08fpwcp4h8kmy6jr6zwr4tjsc",
  ],
  [
    "invalid P2PKH key",
    "full-viewing-key",
    "item",
    "uview1p4svflm7f76ug4nf4e4smfjrqh2vnrrz4k4rllhmstf3dsy9xftcyqk2g773gappe6j2azdm47zn29ftu6s9phg9jcfd9rhwu7n50vs8a49v3s5gq0mmd9yn9ke7ml338f5ax5pt3hmcnuv6g2xca9dxws0da79fqsktjunr90xd4lcm07u2dwapn38f6rgdwak78n9plazall9vxm3lpe5ut4nvx0mqzm9u55n9l79e8h9msvcelqecgttmpdzckmlfs84cc3430szhmyaql9svdexs4me3tygs84d9wpkvcswll2ly2946fnug4rjlqdk8l7fx3kr3e56vn7eqsycamwh",
  ],
  [
    "P2SH in a viewing key",
    "full-viewing-key",
    null,
    "uview1m4wpnaqnxnx2p5xt067mjl5yywhv5ypgvtlvr4he4ayug60uahf9hsua7nlm55uqr0nyuuaw8w4ytenhn6ffv389mkrr3p02h42dcnvud89jtvkwjrkjapsm60quf5rlczjjcghv2c8uaaslt0nthes5xm4349nwqxsdz82cus3udp9rxpefs3m5k4qtv4v39yh476gkqazezw25gxknmc9zztkl7ahg7y9zek4rq6knp29mmrypamfnx78cd7rsv8ygrkkuame3df6v72zw5ha3lufhrl7jg86v55tyak6v4kzplulekr69dy2csmuxj9q3plgymrv7kyyunr8j3ekqmnvtmsujcpr6rxfdcpzn66lp29pnqvh87s2aft",
  ],
  [
    "zero ivk",
    "incoming-viewing-key",
    "item",
    "uivk1s8vsdlnr3rkvkp2evq2p7cmcrgvkhugp272lmhq6jp860m2sj24mjs9tg42splfk2j85af0jp3qlzcye9pnjymdnucxrkhljaemw0hlls6ewdhpur8plw5tv24kk3dgpse3s0fuy6z",
  ],
  [
    "ivk of 2^251",
    "incoming-viewing-key",
    "item",
    "uivk1mesu8kz89d5nx46glghk7tejfa3gqez3q7hm4y4vneu5d4wp7p6vs0m6n9z3y2ruulcf049ymyv6c4q46yl3hejrks80wv3l4422x4zpkvj6h2dv8au3xsgpd0jsgs4a30psnserq5",
  ],
  [
    "P2PKH key only",
    "incoming-viewing-key",
    "shielded",
    "uivk16lp2p7txn4wgerc25v9eycgwt0g05nf8lrf0jvt9apha2lpw94nkge8zhngq99pu3hqf9y287wzgud6ttr388tgwj9st3hegwc2u6ttcrwpmg6frml7sd9slde46d56n2m7tu78wy7c",
  ],
];

/** Each own fixture by name. */
export const own = (name: string): string => {
  const fixture = OWN_FIXTURES.find(([fixtureName]) => fixtureName === name);
  if (fixture === undefined) throw new Error(`No fixture ${name}.`);
  return fixture[3];
};
