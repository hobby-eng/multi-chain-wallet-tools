// Known answers of the Inspector's features for Bitcoin, from public vectors: BIP174's creator
// vector, BIP67's sortedmulti vector, BIP380's descriptor checksum, BIP-322's "Hello World"
// signature, BIP38's official compressed vector, and a compact message signature of the public test
// key 1 computed with an independent implementation (ethers' SigningKey and RFC 6979).
import { decryptBip38Key } from "./bip38-decryptor.js";
import { decodeDescriptor } from "./descriptor.js";
import { verifySignedMessage } from "./message-verifier.js";
import { buildConcreteMultisigWallet } from "./multisig-wallet.js";
import { buildPolicy, policyHex } from "./policy.js";
import { parsePsbt, transactionId } from "./psbt.js";
import { decodeScript } from "./script.js";
import { BITCOIN_ADDRESS_VECTORS } from "./self-test-vectors-bitcoin.js";
import { bech32 } from "@scure/base";
import { hexToBytes } from "@ckd/core/crypto.js";
import {
  BIP38_KEY,
  BIP38_PASSPHRASE,
  BIP67_KEYS,
  BIP67_SCRIPT,
  DESCRIPTOR_VECTOR,
  SIGNED_MESSAGE,
  expectRefused,
  expectSame,
  type InspectorCheck,
} from "./self-test-checks.js";

/** BIP174's creator vector: the unsigned PSBT of two inputs and two outputs. */
const BIP174_CREATOR =
  "70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd75" +
  "0000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d01000000" +
  "00ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f50500000000" +
  "16001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000";
/** The mainnet P2SH address of BIP67's first vector. */
const BIP67_ADDRESS = "39bgKC7RFbpoCRbtD5KEdkYKtNyhpsNa3Z";

export const bitcoinPsbtDecoder: InspectorCheck = {
  name: "Bitcoin PSBT decoding (BIP174)",
  run() {
    const parsed = parsePsbt(BIP174_CREATOR, "bitcoin");
    expectSame("BIP174 inputs", parsed.inputs.length, 2);
    expectSame("BIP174 outputs", parsed.outputs.length, 2);
    expectSame("BIP174 first output", parsed.outputValues[0], 149_990_000n);
    expectSame(
      "BIP174 transaction id",
      parsed.transaction === null ? "" : transactionId(parsed.transaction.raw),
      "82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617b",
    );
  },
};

export const bitcoinScriptDecoder: InspectorCheck = {
  name: "Bitcoin Script decoding",
  run() {
    const decoded = decodeScript(BIP67_SCRIPT, "bitcoin", "mainnet", "spending");
    expectSame(
      "Script assembly",
      decoded.asm,
      `OP_2 ${BIP67_KEYS[1]} ${BIP67_KEYS[0]} OP_2 OP_CHECKMULTISIG`,
    );
    expectSame("P2SH address of a Script", decoded.wrappers[0]?.address, BIP67_ADDRESS);
  },
};

export const bitcoinDescriptorDecoder: InspectorCheck = {
  name: "Descriptor checksum (BIP380)",
  run() {
    expectSame(
      "descriptor checksum",
      decodeDescriptor(DESCRIPTOR_VECTOR.text, { chain: "bitcoin" }).checksum,
      DESCRIPTOR_VECTOR.checksum,
    );
    expectRefused("descriptor checksum refusal", () =>
      decodeDescriptor(DESCRIPTOR_VECTOR.refused, { chain: "bitcoin" }),
    );
    for (const vector of Object.values(BITCOIN_ADDRESS_VECTORS)) {
      const decoded = decodeDescriptor(`addr(${vector.address})`, { chain: "bitcoin" });
      expectSame(
        "address descriptor script",
        decoded.compiledOutput?.rows.find(({ label }) => label === "scriptPubKey")?.value,
        vector.script,
      );
      expectSame(
        "address descriptor address",
        decoded.compiledOutput?.rows.find(({ label }) => label === "Address")?.value,
        vector.address,
      );
      expectRefused("address descriptor network refusal", () =>
        decodeDescriptor(`addr(${vector.address})`, { chain: "bitcoin", network: "testnet" }),
      );
    }
    const corrupted = `${BITCOIN_ADDRESS_VECTORS.taproot.address.slice(0, -1)}q`;
    expectRefused("address checksum refusal", () =>
      decodeDescriptor(`addr(${corrupted})`, { chain: "bitcoin" }),
    );
    // BIP350 assigns witness version 1 to Bech32m, even when a Bech32 checksum is valid.
    // Skip the witness version opcode and the direct-push length.
    const program = hexToBytes(BITCOIN_ADDRESS_VECTORS.taproot.script).slice(2);
    const wrongFamily = bech32.encode("bc", [1, ...bech32.toWords(program)]);
    expectRefused("witness checksum family refusal", () =>
      decodeDescriptor(`addr(${wrongFamily})`, { chain: "bitcoin" }),
    );
  },
};

export const bitcoinPolicyBuilder: InspectorCheck = {
  name: "Bitcoin BIP67 multisig policy",
  run() {
    const policy = buildPolicy({
      chain: "bitcoin",
      network: "mainnet",
      required: 2,
      publicKeys: BIP67_KEYS,
      keyOrder: "bip67",
      lockKind: "none",
      lockValue: 0,
      bitcoinWrapper: "p2sh",
    });
    expectSame("BIP67 address", policy.address, BIP67_ADDRESS);
    expectSame("BIP67 redeem script", policyHex(policy).redeemScript, BIP67_SCRIPT);
  },
};

export const bitcoinMultisigWallet: InspectorCheck = {
  name: "Bitcoin BIP67 multisig wallet",
  run() {
    const wallet = buildConcreteMultisigWallet({
      chain: "bitcoin",
      network: "mainnet",
      required: 2,
      publicKeys: BIP67_KEYS,
      keyOrder: "bip67",
      wrapper: "p2sh",
    });
    expectSame("multisig wallet address", wallet.address, BIP67_ADDRESS);
  },
};

export const bitcoinMessageVerification: InspectorCheck = {
  name: "Bitcoin compact message verification (BIP137)",
  async run() {
    const address = "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH";
    const signature =
      "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=";
    const verify = (message: string) =>
      verifySignedMessage(address, message, signature, "bitcoin", "mainnet");
    expectSame("compact signature", (await verify(SIGNED_MESSAGE)).valid, true);
    // The check must also refuse: the same signature of another message is not valid.
    expectSame("compact refusal", (await verify(`${SIGNED_MESSAGE}!`)).valid, false);
  },
};

/** BIP-322 verification loads its own library, so it runs in the full self-test only. */
export const bitcoinBip322Verification: InspectorCheck = {
  name: "BIP-322 message verification vector",
  async run() {
    const verify = (message: string) =>
      verifySignedMessage(
        "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
        message,
        "smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=",
        "bitcoin",
        "mainnet",
      );
    expectSame("BIP-322 vector", (await verify("Hello World")).valid, true);
    // The check must also refuse: the vector's signature of another message is not valid. The
    // BIP-322 library reports a failed script check by throwing, which counts as a refusal.
    const refused = await verify("Hello World!").then(
      (result) => !result.valid,
      () => true,
    );
    expectSame("BIP-322 refusal", refused, true);
  },
};

/** BIP38's scrypt takes a noticeable moment, so it runs in the full self-test only. */
export const bitcoinBip38Decrypt: InspectorCheck = {
  name: "BIP38 decryption vector",
  async run() {
    const decrypted = await decryptBip38Key(
      "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
      BIP38_PASSPHRASE,
      "bitcoin",
      "mainnet",
    );
    expectSame("BIP38 key", decrypted.privateKeyHex, BIP38_KEY);
    expectSame("BIP38 address", decrypted.address, "1HmPbwsvG5qJ3KJfxzsZRZWhbm1xBMuS8B");
  },
};
