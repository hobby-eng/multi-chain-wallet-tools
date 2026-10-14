// Known answers of the Inspector's features for Dash, from public vectors: the Dash Core
// documentation PSBT, Dash Core's BIP67 sortedmulti vector, BIP380's descriptor checksum, a compact
// message signature of the public test key 1 computed with an independent implementation, and a
// BIP38 key encrypted for a Dash address by an independent implementation that reproduces BIP38's
// official vector.
import { decryptBip38Key } from "./bip38-decryptor.js";
import { decodeDescriptor } from "./descriptor.js";
import { verifySignedMessage } from "./message-verifier.js";
import { buildConcreteMultisigWallet } from "./multisig-wallet.js";
import { buildPolicy, policyHex } from "./policy.js";
import { parsePsbt } from "./psbt.js";
import { decodeScript } from "./script.js";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { readTransaction } from "./transaction.js";
import { analyzeInputSigning } from "./signing-commitments.js";
import {
  DASH_MINIMAL_PSBT,
  DASH_SPECIAL_PAYLOAD,
  DASH_SPECIAL_WIRE,
} from "./self-test-vectors-dash.js";
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

/** Dash Core's documentation PSBT (doc/psbt.md): one input, one OP_RETURN output. */
const DASH_CORE_DOCS_PSBT =
  "cHNidP8BAEICAAAAAXgRxzbShUlivVFKgoLyhk0RCCYLZKCYTl/tYRd+yGImAAAAAAD/////AQAAAAAAAAAABmoEAAECAwAAAAAAAAA=";
/** The testnet P2SH address of the BIP67 vector in Dash Core's sortedmulti tests. */
const BIP67_ADDRESS = "8nL86iHTC8K4eVZ6YwyhRWMLhSauj8XQAK";

export const dashPsbtDecoder: InspectorCheck = {
  name: "Dash PSBT decoding",
  run() {
    const parsed = parsePsbt(DASH_CORE_DOCS_PSBT, "dash");
    expectSame("Dash PSBT version", parsed.version, 0);
    expectSame("Dash transaction version", parsed.transaction?.version, 2);
    expectSame("Dash transaction type", parsed.transaction?.dashType, 0);
    expectSame("Dash PSBT inputs", parsed.inputs.length, 1);
    expectSame("Dash PSBT outputs", parsed.outputs.length, 1);
    const wire = hexToBytes(DASH_SPECIAL_WIRE);
    const special = readTransaction(wire, "dash");
    expectSame("Dash wire payload", bytesToHex(special.extraPayload!), DASH_SPECIAL_PAYLOAD);
    expectSame("Dash wire output", special.outputs[0]?.value, 1n);
    expectRefused("Dash wire truncation refusal", () =>
      readTransaction(wire.subarray(0, -1), "dash"),
    );
    const baseline = parsePsbt(DASH_MINIMAL_PSBT, "dash");
    expectSame(
      "Dash unsigned baseline",
      analyzeInputSigning(baseline, 0).signature,
      "No signature or final-script fields supplied",
    );
    // Remove the two empty input/output maps, then insert one unknown input
    // field (single-byte key, empty value) and restore both map terminators.
    for (const field of ["011100", "011300"]) {
      const unknown = parsePsbt(`${DASH_MINIMAL_PSBT.slice(0, -4)}${field}0000`, "dash");
      expectSame("Dash unknown raw field", unknown.inputs[0]?.length, 1);
      expectSame(
        "Dash unknown verification isolation",
        JSON.stringify(unknown.inputVerification),
        JSON.stringify(baseline.inputVerification),
      );
      expectSame(
        "Dash unknown signing isolation",
        JSON.stringify(analyzeInputSigning(unknown, 0)),
        JSON.stringify(analyzeInputSigning(baseline, 0)),
      );
    }
  },
};

export const dashScriptDecoder: InspectorCheck = {
  name: "Dash Script decoding",
  run() {
    const decoded = decodeScript(BIP67_SCRIPT, "dash", "testnet", "spending");
    expectSame(
      "Dash Script assembly",
      decoded.asm,
      `OP_2 ${BIP67_KEYS[1]} ${BIP67_KEYS[0]} OP_2 OP_CHECKMULTISIG`,
    );
    expectSame("Dash P2SH address of a Script", decoded.wrappers[0]?.address, BIP67_ADDRESS);
  },
};

export const dashDescriptorDecoder: InspectorCheck = {
  name: "Descriptor checksum",
  run() {
    expectSame(
      "descriptor checksum",
      decodeDescriptor(DESCRIPTOR_VECTOR.text, { chain: "dash" }).checksum,
      DESCRIPTOR_VECTOR.checksum,
    );
    expectRefused("descriptor checksum refusal", () =>
      decodeDescriptor(DESCRIPTOR_VECTOR.refused, { chain: "dash" }),
    );
  },
};

export const dashPolicyBuilder: InspectorCheck = {
  name: "Dash BIP67 multisig policy",
  run() {
    const policy = buildPolicy({
      chain: "dash",
      network: "testnet",
      required: 2,
      publicKeys: BIP67_KEYS,
      keyOrder: "bip67",
      lockKind: "none",
      lockValue: 0,
      bitcoinWrapper: "p2sh",
    });
    expectSame("Dash BIP67 address", policy.address, BIP67_ADDRESS);
    expectSame("Dash BIP67 redeem script", policyHex(policy).redeemScript, BIP67_SCRIPT);
  },
};

export const dashMultisigWallet: InspectorCheck = {
  name: "Dash BIP67 multisig wallet",
  run() {
    const wallet = buildConcreteMultisigWallet({
      chain: "dash",
      network: "testnet",
      required: 2,
      publicKeys: BIP67_KEYS,
      keyOrder: "bip67",
      wrapper: "p2sh",
    });
    expectSame("Dash multisig wallet address", wallet.address, BIP67_ADDRESS);
  },
};

export const dashMessageVerification: InspectorCheck = {
  name: "Dash compact message verification",
  async run() {
    const address = "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE";
    const signature =
      "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nkadAXIRsCL4X8sJWAH9iwOpV5w6N8mS1jxrRp+8Nxapc=";
    const verify = (message: string) =>
      verifySignedMessage(address, message, signature, "dash", "mainnet");
    expectSame("Dash compact signature", (await verify(SIGNED_MESSAGE)).valid, true);
    // The check must also refuse: the same signature of another message is not valid.
    expectSame("Dash compact refusal", (await verify(`${SIGNED_MESSAGE}!`)).valid, false);
  },
};

export const dashBip38Decrypt: InspectorCheck = {
  name: "Dash BIP38 decryption",
  async run() {
    const decrypted = await decryptBip38Key(
      "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
      BIP38_PASSPHRASE,
      "dash",
      "mainnet",
    );
    expectSame("Dash BIP38 key", decrypted.privateKeyHex, BIP38_KEY);
    expectSame("Dash BIP38 address", decrypted.address, "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVh");
  },
};
