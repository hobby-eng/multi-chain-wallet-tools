import { requirePublic } from "@ckd/core/bip32.js";
import { watchOnlyPublicKey } from "@ckd/recovery/watch-only.js";
import { verifyFundsWarning, WalletScan } from "../../wallet-result.js";
import { BITCOIN_COIN } from "./coin.js";
import { ScanSecrets } from "../../scan-secrets.js";
import { assertWatchOnlyMinimum } from "@ckd/recovery/watch-only.js";
import { HDKey } from "@scure/bip32";
import { bytesToHex, wipe } from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import {
  parseBitcoinSlip132,
  parseBitcoinWatchDescriptor,
} from "@ckd/recovery/watch-only/bitcoin-formats.js";
import {
  RECOVERY_UTXO_ADDRESS_BATCH,
  type UtxoAddressView,
} from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryFinding,
  RecoveryScanContext,
  RecoverySection,
  RecoveryWalletResult,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from "../../types.js";
import { AddressBook, scanBranches } from "../../address-book.js";
import {
  addressFor,
  bitcoinAddressSource,
  BITCOIN_MODES,
  BITCOIN_PROOF,
  BITCOIN_SOURCES,
  formatBitcoin,
  type BitcoinMode,
} from "./shared.js";

interface CandidateProfile {
  id: string;
  label: string;
  mode: BitcoinMode;
  path: string;
  deriveChild(index: number): HDKey;
}

interface DerivedCandidate {
  address: string;
  path: string;
  index: number;
  profile: CandidateProfile;
}

function parseDescriptor(
  value: string,
  network: ReturnType<typeof getBitcoinNetwork>,
): {
  mode: BitcoinMode;
  fingerprint: string;
  branch: number;
  account: HDKey;
  originPath: string;
} {
  const parsed = parseBitcoinWatchDescriptor(value);
  if (parsed !== null) {
    const { mode, fingerprint, originSuffix, xpub, branch } = parsed;
    let account: HDKey;
    try {
      account = HDKey.fromExtendedKey(xpub, network.versions);
    } catch {
      throw new Error(
        `The descriptor's xpub does not match the selected ${network.label} version bytes. Select the matching network.`,
      );
    }
    if (account.depth !== 3) {
      throw new Error(
        `The descriptor's embedded xpub has depth ${account.depth}, but a standard account xpub has depth 3.`,
      );
    }
    return { mode, fingerprint, branch, account, originPath: `[${fingerprint}${originSuffix}]` };
  }
  throw new Error(
    "This descriptor did not match a supported pkh(), sh(wpkh()), wpkh(), or tr() shape with a checksummed [fingerprint/path]xpub/branch/* body.",
  );
}

function parseBareXpub(
  value: string,
  network: ReturnType<typeof getBitcoinNetwork>,
): { node: HDKey; encodedMode: BitcoinMode | null } {
  const slip132 = parseBitcoinSlip132(value);
  if (slip132 !== null) {
    if (slip132.network !== network.name) {
      throw new Error(
        `This ${value.slice(0, 4)} key encodes ${slip132.network}, but ${network.name} is selected.`,
      );
    }
    if (slip132.node.depth === 0) {
      throw new Error(
        "This is a root/master extended public key and cannot derive a standard wallet account.",
      );
    }
    if (slip132.node.depth !== 3 && slip132.node.depth !== 4) {
      throw new Error(
        `This extended public key has depth ${slip132.node.depth}. Only an account key (depth 3) or branch key (depth 4) can be scanned.`,
      );
    }
    return { node: slip132.node, encodedMode: slip132.mode };
  }
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(value, network.versions);
  } catch {
    throw new Error(
      `This extended public key does not match the selected ${network.label} version bytes, or is malformed. Select the matching network, or check the value.`,
    );
  }
  if (node.depth === 0) {
    throw new Error(
      "This is the root/master extended public key. It sits above every hardened BIP44/49/84/86 account level and cannot derive standard wallet addresses. Copy the Account xpub for the address format you want to scan instead.",
    );
  }
  if (node.depth !== 3 && node.depth !== 4) {
    throw new Error(
      `This extended public key has depth ${node.depth}. Only an account xpub (depth 3) or a branch xpub (depth 4) can be scanned for descendant addresses.`,
    );
  }
  return { node, encodedMode: null };
}

function candidateProfiles(
  node: HDKey,
  encodedMode: BitcoinMode | null = null,
): CandidateProfile[] {
  const modes =
    encodedMode === null ? BITCOIN_MODES : BITCOIN_MODES.filter(({ mode }) => mode === encodedMode);
  if (node.depth === 4) {
    return modes.map(({ mode, label }) => ({
      id: `${mode}:branch`,
      label: `${label}${encodedMode === null ? " · candidate format" : " · encoded format"}`,
      mode,
      path: "<branch xpub>/i",
      deriveChild: (index: number) => node.deriveChild(index),
    }));
  }
  return modes.flatMap(({ mode, label }) =>
    ([0, 1] as const).map((branch) => ({
      id: `${mode}:${branch}`,
      label: `${label} · ${encodedMode === null ? "candidate" : "encoded"} format · ${branch === 0 ? "receive/external" : "change/internal"}`,
      mode,
      path: `<account xpub>/${branch}/i`,
      deriveChild: (index: number) => node.deriveChild(branch).deriveChild(index),
    })),
  );
}

function buildResult(
  description: string,
  findings: RecoveryFinding[],
  book: AddressBook<UtxoAddressView>,
  scanned: number,
  config: RecoveryWatchOnlyScanConfig,
  warning: string | undefined,
  walletScan: WalletScan,
): RecoveryWalletResult {
  const section: RecoverySection = {
    id: "core",
    title: "Bitcoin watch-only addresses",
    description,
    state: "complete",
    metrics: [
      ...book.metrics(formatBitcoin),
      { label: "Unique addresses queried", value: String(book.queried) },
      { label: "Derivation candidates", value: String(scanned) },
    ],
    findings,
    scanned,
    source: BITCOIN_SOURCES[config.network],
    proof: BITCOIN_PROOF,
    ...(warning === undefined ? {} : { warning }),
  };
  return walletScan.result({
    overview: [
      ...book.overview(formatBitcoin),
      { label: "Unique addresses queried", value: String(book.queried) },
    ],
    sections: [section],
    warnings: [verifyFundsWarning(BITCOIN_COIN.label)],
  });
}

export async function scanBitcoinWatchOnly(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
): Promise<RecoveryWalletResult> {
  assertWatchOnlyMinimum(config.minimumCount);
  const secrets = new ScanSecrets(context);
  secrets.watchOnly(input, "Bitcoin");
  const gateway = secrets.gateway(context);
  const network = getBitcoinNetwork(config.network);
  const book = new AddressBook(bitcoinAddressSource(gateway, config.network, context.signal));
  const walletScan = new WalletScan(input, BITCOIN_COIN, config.network);

  if (input.kind === "public-key") {
    const { compressed, uncompressed } = watchOnlyPublicKey(input.value);
    try {
      const findings: RecoveryFinding[] = [];
      const candidates: Array<{
        address: string;
        label: string;
        fields: Array<{ label: string; value: string; copyable?: boolean }>;
      }> = [];
      candidates.push({
        address: addressFor("legacy", compressed, network),
        label: "Legacy P2PKH · compressed key",
        fields: [{ label: "Public key", value: bytesToHex(compressed), copyable: true }],
      });
      candidates.push({
        address: addressFor("legacy", uncompressed, network),
        label: "Legacy P2PKH · uncompressed key",
        fields: [{ label: "Public key", value: bytesToHex(uncompressed), copyable: true }],
      });
      candidates.push({
        address: addressFor("nested-segwit", compressed, network),
        label: "Nested SegWit · P2SH-P2WPKH",
        fields: [],
      });
      candidates.push({
        address: addressFor("native-segwit", compressed, network),
        label: "Native SegWit · P2WPKH",
        fields: [],
      });
      candidates.push({
        address: addressFor("taproot", compressed, network),
        label: "Taproot · P2TR",
        fields: [],
      });
      const entries = await book.states(candidates.map(({ address }) => address));
      const seenAddress = new Set<string>();
      for (const [position, candidate] of candidates.entries()) {
        if (seenAddress.has(candidate.address)) continue;
        seenAddress.add(candidate.address);
        const entry = entries[position]!;
        const balance = BigInt(entry.balance);
        const used = balance > 0n || entry.transactionCount > 0;
        if (balance === 0n && !(config.includeUsedZeroBalance && used)) continue;
        const finding: RecoveryFinding = {
          id: `bitcoin:public-key:${candidate.address}`,
          title: candidate.address,
          subtitle: candidate.label,
          balanceAtomic: balance,
          balanceLabel: formatBitcoin(balance),
          fields: [
            { label: "Address type", value: candidate.label },
            ...candidate.fields,
            { label: "Transactions reported", value: String(entry.transactionCount) },
          ],
        };
        findings.push(finding);
        context.onFinding(input.id, "core", finding);
      }
      return buildResult(
        "A single public key can only be checked exactly, at every address encoding it maps to; it cannot derive descendant addresses.",
        findings,
        book,
        candidates.length,
        config,
        undefined,
        walletScan,
      );
    } finally {
      wipe(compressed, uncompressed);
    }
  }

  const {
    account,
    branch,
    mode: descriptorMode,
    node,
    description,
  } = (() => {
    if (input.kind === "bitcoin-descriptor") {
      const parsed = parseDescriptor(input.value, network);
      return {
        account: parsed.account,
        branch: parsed.branch,
        mode: parsed.mode,
        node: parsed.account,
        description: `Checksummed BIP380 descriptor · ${parsed.originPath}/${parsed.branch}/* · exact ${BITCOIN_MODES.find(({ mode: candidateMode }) => candidateMode === parsed.mode)?.label ?? parsed.mode} script type.`,
      };
    }
    const parsed = parseBareXpub(input.value, network);
    const encodedLabel =
      parsed.encodedMode === null
        ? null
        : (BITCOIN_MODES.find(({ mode }) => mode === parsed.encodedMode)?.label ??
          parsed.encodedMode);
    return {
      account: parsed.node,
      branch: null,
      mode: parsed.encodedMode,
      node: parsed.node,
      description:
        encodedLabel !== null
          ? `${input.value.slice(0, 4)} encodes the ${encodedLabel} script family; only that family is scanned${parsed.node.depth === 3 ? " on receive and change branches" : " on this branch"}.`
          : parsed.node.depth === 4
            ? "Bare branch (depth-4) extended public key: no purpose metadata is present, so every standard script-type candidate is scanned at each index and clearly labeled as a candidate, not a confirmed format."
            : "Bare account (depth-3) extended public key: no purpose metadata is present, so every standard script-type candidate is scanned on both branches and clearly labeled as a candidate, not a confirmed format.",
    };
  })();
  try {
    const profiles =
      input.kind === "bitcoin-descriptor"
        ? [
            {
              id: `${descriptorMode}:${branch}`,
              label: `${BITCOIN_MODES.find(({ mode: candidateMode }) => candidateMode === descriptorMode)?.label ?? descriptorMode} · branch ${branch}`,
              mode: descriptorMode!,
              path: `descriptor/${branch}/i`,
              deriveChild: (index: number) => account.deriveChild(branch!).deriveChild(index),
            },
          ]
        : candidateProfiles(node, descriptorMode);
    const findings: RecoveryFinding[] = [];
    const scanned = await scanBranches(profiles, (profile, before) => ({
      initial: config.minimumCount,
      batchSize: RECOVERY_UTXO_ADDRESS_BATCH,
      signal: context.signal,
      cancelled: "Bitcoin watch-only scan cancelled.",
      derive: (index): DerivedCandidate => ({
        address: addressFor(
          profile.mode,
          requirePublic(profile.deriveChild(index), "the watch-only key"),
          network,
        ),
        path: profile.path.replace(/\/i$/u, `/${index}`),
        index,
        profile,
      }),
      lookUp: book.lookUpWith({ includeUsedZeroBalance: config.includeUsedZeroBalance }),
      show: ({ derived: item, state: entry }) => {
        const balance = BigInt(entry.balance);
        const finding: RecoveryFinding = {
          id: `bitcoin:watch:${item.profile.id}:${item.index}`,
          title: item.address,
          subtitle: `${item.profile.label} · index ${item.index}`,
          balanceAtomic: balance,
          balanceLabel: formatBitcoin(balance),
          fields: [
            { label: "Scan family", value: item.profile.label },
            { label: "Relative derivation path", value: item.path, copyable: true },
            { label: "Transactions reported", value: String(entry.transactionCount) },
          ],
        };
        findings.push(finding);
        context.onFinding(input.id, "core", finding);
      },
      progress: (checked, target) =>
        context.onProgress({
          inputId: input.id,
          section: "core",
          message: `${profile.label}: checked ${checked} of ${target}`,
          completed: before + checked,
          total: null,
        }),
    }));
    return buildResult(description, findings, book, scanned, config, book.gap.warning, walletScan);
  } finally {
    // Watch-only nodes hold no private data; nothing to wipe on the HDKey itself.
  }
}
