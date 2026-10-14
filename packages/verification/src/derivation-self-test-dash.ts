import { deriveDashCore } from "@ckd/coins/dash/core.js";
import { DASH_COIN_ADAPTERS } from "@ckd/coins/adapters/dash.js";
import { runDashPathSelfTest } from "@ckd/coins/dash/path-self-test.js";
import { deriveDashIdentityAuthenticationKey } from "@ckd/coins/dash/identity.js";
import { deriveDashPlatform } from "@ckd/coins/dash/platform.js";
import { requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { bytesToHex, encodeP2pkh, hash160, hexToBytes, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import {
  ABANDON_ABOUT_SEED_HEX,
  checkDerivationVectors,
  expectEqual,
  firstAddressOf,
  now,
  resultValue,
} from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

// The canonical upstream BIP39 test vector "abandon x11 about" + passphrase
// "TREZOR", already independently pinned by bip39-self-test.ts. Reusing the
// raw seed hex here (rather than re-deriving from the mnemonic) keeps this
// module's dependency surface unchanged while letting the DIP9 CoinJoin
// vectors below cite the exact same, separately verifiable seed value.
const COINJOIN_SEED_HEX =
  "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553" +
  "1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04";

/** Dash-only worker vectors. This module has no non-Dash protocol imports. */
export async function runDashDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const pathChecks = runDashPathSelfTest({ COIN_ADAPTERS: DASH_COIN_ADAPTERS });
  const checks = checkDerivationVectors(
    [
      {
        name: "Dash Core / BIP44",
        derive: (seed) => deriveDashCore(firstAddressOf(seed, "mainnet")),
        address: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
        accountXpub:
          "xpub6CYEjsU6zPM3sADS2ubu2aZeGxCm3C5KabkCpo4rkNbXGAH9M7rRUJ4E5CKiyUddmRzrSCopPzisTBrXkfCD4o577XKM9mzyZtP1Xdbizyk",
      },
      {
        name: "Dash Core testnet / BIP44",
        derive: (seed) => deriveDashCore(firstAddressOf(seed, "testnet")),
        address: "yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt",
      },
      {
        name: "Dash Platform / DIP17",
        derive: (seed) => deriveDashPlatform(firstAddressOf(seed, "mainnet")),
        address: "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs",
        accountXpub:
          "xpub6FevKUTsHuMwZmumCETpZSSiK2bfW8gyb7kUAPs9Gep7SeskR2DPuaYoKo7vhLC99TMyfnUuyDjsWawjMvfbHvLLG6g9JLf1mjozFk9PUYz",
      },
      {
        name: "Dash Platform testnet / DIP17",
        derive: (seed) => deriveDashPlatform(firstAddressOf(seed, "testnet")),
        address: "tdash1kzfj6fvrpza60u6m9u2nhzkthey68v7cqg2u9ymk",
      },
    ],
    "Dash master/account extended-key integrity",
  );

  const identitySeed = hexToBytes(ABANDON_ABOUT_SEED_HEX);
  try {
    for (const vector of [
      {
        name: "Dash Identity mainnet / DIP13",
        network: "mainnet",
        path: "m/9'/5'/5'/0'/0'/0'/0'",
        privateKey: "5d6d4d9ef3092e2c63c5e7c436e3068efa58cbe4f32eb406ecbceecebf127f0f",
        publicKey: "03de6e4f0a455c1f089e51c53ed937b172d46e5cec4a98e2d9977ea4638129d252",
        publicKeyHash: "d0559a724d640d22df8a04665308ffd0b7fe9b77",
      },
      {
        name: "Dash Identity testnet / DIP13",
        network: "testnet",
        path: "m/9'/1'/5'/0'/0'/0'/0'",
        privateKey: "e560f452db267372375f218a22d57c0937070faffe66f0b7f908c21c8772ee3e",
        publicKey: "03a00f4853081aeb8c9debe37267303fa133bd7f6678bfb3299dfa001bfd0341db",
        publicKeyHash: "35891d57608f93cfe630e70bee9ae863f403f50f",
      },
    ] as const) {
      const root = rootFromSeed(identitySeed, getDashNetwork(vector.network).versions);
      const derived = deriveDashIdentityAuthenticationKey(root, vector.network, 0);
      try {
        expectEqual(`${vector.name} path`, derived.path, vector.path);
        expectEqual(
          `${vector.name} private key`,
          bytesToHex(derived.privateKey),
          vector.privateKey,
        );
        expectEqual(`${vector.name} public key`, bytesToHex(derived.publicKey), vector.publicKey);
        expectEqual(
          `${vector.name} HASH160`,
          bytesToHex(derived.publicKeyHash),
          vector.publicKeyHash,
        );
        checks.push(vector.name);
      } finally {
        wipe(derived.privateKey, derived.publicKey, derived.publicKeyHash);
        root.wipePrivateData();
      }
    }
  } finally {
    identitySeed.fill(0);
  }

  // DIP-0009 CoinJoin external-chain vectors: m/9'/coin_type'/4'/0'/0/0.
  // Independently derived from the canonical upstream BIP39 vector above and
  // cross-checked against Dash Core v23.1.8 GetPathTemplate()/CHDChain
  // semantics (src/wallet/scriptpubkeyman.cpp, src/wallet/hdchain.h) and
  // DIP-0009 §"Address Generation and Assignment" (account 0', external
  // chain 0 only; no DIP9 change chain in current Dash Core).
  const coinJoinSeed = hexToBytes(COINJOIN_SEED_HEX);
  try {
    for (const vector of [
      {
        name: "Dash Mobile CoinJoin · DIP9 · mainnet",
        network: "mainnet",
        path: "m/9'/5'/4'/0'/0/0",
        publicKey: "02fb4b00c2a6cf2cf7e1f80b3ca6be04e5c99ce53ae1ebb31a7e2fde1dd1e82b01",
        publicKeyHash: "bab467926a71dc2aa47d528cc165fb469aa65914",
        address: "Xsi3dfT53GpKNG7T8qe1t1ez7rxM6xiQis",
      },
      {
        name: "Dash Mobile CoinJoin · DIP9 · testnet",
        network: "testnet",
        path: "m/9'/1'/4'/0'/0/0",
        publicKey: "0210abacaec7e80e1528390c6ad997fd245ab039a969550ab1a5218bb9d39fad73",
        publicKeyHash: "bff329c72e0a5509028f5b491dd4216a21c880bf",
        address: "ydpPD7n983b32qM6oVwmQdHPwijhfYR8EB",
      },
    ] as const) {
      const network = getDashNetwork(vector.network);
      const root = rootFromSeed(coinJoinSeed.slice(), network.versions);
      const node = root.derive(vector.path);
      try {
        const publicKey = requirePublic(node, vector.path);
        const publicKeyHash = hash160(publicKey);
        const address = encodeP2pkh(publicKeyHash, network.p2pkh);
        expectEqual(`${vector.name} public key`, bytesToHex(publicKey), vector.publicKey);
        expectEqual(`${vector.name} HASH160`, bytesToHex(publicKeyHash), vector.publicKeyHash);
        expectEqual(`${vector.name} address`, address, vector.address);
        checks.push(vector.name);
        wipe(publicKey, publicKeyHash);
      } finally {
        node.wipePrivateData();
        root.wipePrivateData();
      }
    }
  } finally {
    coinJoinSeed.fill(0);
  }

  const shieldedSeed = new Uint8Array(64).fill(0x42);
  const { deriveDashShielded } = await import("@ckd/coins/dash/shielded.js");
  try {
    for (const [name, network, expectedAddress] of [
      [
        "Dash Orchard testnet / ZIP32",
        "testnet",
        "tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq",
      ],
      [
        "Dash Orchard mainnet / ZIP32",
        "mainnet",
        "dash1zzx0rfu42k85qwywhx44023erxgcelv7xkqu3lr58t2t46arh392ch3ct0ke9qal6w57f2qlhxuxd",
      ],
    ] as const) {
      const result = deriveDashShielded({
        seed: shieldedSeed.slice(),
        network,
        account: 0,
        start: 0,
        count: 1,
      });
      try {
        expectEqual(name, resultValue(result, "address"), expectedAddress);
        checks.push(name);
      } finally {
        clearDerivationResult(result);
      }
    }
  } finally {
    shieldedSeed.fill(0);
  }

  checks.unshift(...pathChecks);
  return { passed: true, checks, durationMs: Math.round(now() - started) };
}
