// The account and branch of a BIP32 derivation request, as every single-key coin derives them:
// the request checked (an ordinary account, branch 0 or 1, a batch the worker takes), the account
// at the coin's path with the root's summary, and each child of the branch lent to the row that
// shows it. The keys of the root, the account, the branch and every child are wiped afterwards,
// whatever the coin's code does with them, so that no adapter repeats or forgets that cleanup.
import type { HDKey } from "@scure/bip32";
import { assertBatch, requirePrivate, requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { wipe } from "@ckd/core/crypto.js";
import type { Bip32Versions } from "@ckd/core/networks.js";
import type { Bip32BatchOptions, ResultField } from "@ckd/core/types.js";
import { bip32SummaryFields, type Bip32SummaryLabels } from "./bip32-summary.js";
import type { DerivationPathProfile } from "./derivation-path.js";

/** One child key of the branch, held only while its row is built. */
export interface BranchChild {
  readonly index: number;
  readonly path: string;
  readonly node: HDKey;
  readonly privateKey: Uint8Array;
  /** The compressed public key. */
  readonly publicKey: Uint8Array;
}

/** The account and branch of one request, with the root's summary. */
export interface AccountBranch {
  readonly account: HDKey;
  readonly branch: HDKey;
  readonly accountPath: string;
  readonly branchPath: string;
  readonly summary: ResultField[];
  readonly masterFingerprint: string;
  /** The row of every requested child, from `options.start` on, each built while its keys are held. */
  rows<Row>(row: (child: BranchChild) => Row): Row[];
}

/** Where a coin keeps its accounts. */
export interface AccountLayout {
  readonly versions: Bip32Versions;
  readonly paths: DerivationPathProfile;
  readonly summaryLabels?: Partial<Bip32SummaryLabels>;
}

/** Records each returned node before another derivation can fail. */
class AccountBranchNodes {
  #root: HDKey | undefined;
  #account: HDKey | undefined;
  #branch: HDKey | undefined;

  createRoot(seed: Uint8Array, versions: Bip32Versions): HDKey {
    this.#root = rootFromSeed(seed, versions);
    return this.#root;
  }

  deriveAccount(path: string): HDKey {
    if (this.#root === undefined) throw new Error("The derivation root is not available.");
    this.#account = this.#root.derive(path);
    return this.#account;
  }

  deriveBranch(index: number): HDKey {
    if (this.#account === undefined) throw new Error("The derivation account is not available.");
    this.#branch = this.#account.deriveChild(index);
    return this.#branch;
  }

  dispose(): void {
    try {
      this.#branch?.wipePrivateData();
    } finally {
      try {
        this.#account?.wipePrivateData();
      } finally {
        this.#root?.wipePrivateData();
      }
    }
  }
}

/** Hands the checked request's account and branch to `build`; every key is wiped afterwards. */
export function withAccountBranch<T>(
  options: Bip32BatchOptions,
  layout: AccountLayout,
  build: (chain: AccountBranch) => T,
): T {
  const accountPath = layout.paths.accountPath(options);
  const branchPath = layout.paths.branchPath(options);
  assertBatch(options.start, options.count);
  const nodes = new AccountBranchNodes();
  try {
    const root = nodes.createRoot(options.seed, layout.versions);
    const account = nodes.deriveAccount(accountPath);
    const branch = nodes.deriveBranch(layout.paths.branchIndex(options.branch));
    const { fields: summary, masterFingerprint } = bip32SummaryFields(
      root,
      account,
      accountPath,
      layout.summaryLabels,
    );
    return build({
      account,
      branch,
      accountPath,
      branchPath,
      summary,
      masterFingerprint,
      rows<Row>(row: (child: BranchChild) => Row): Row[] {
        const rows: Row[] = [];
        for (let offset = 0; offset < options.count; offset += 1) {
          const index = options.start + offset;
          const path = layout.paths.addressPath(options, index);
          const node = branch.deriveChild(index);
          try {
            const privateKey = requirePrivate(node, path);
            let publicKey: Uint8Array | null = null;
            try {
              // HDKey getters return copies; wiping the node cannot clear this private copy.
              publicKey = requirePublic(node, path);
              rows.push(row({ index, path, node, privateKey, publicKey }));
            } finally {
              wipe(privateKey, publicKey);
            }
          } finally {
            node.wipePrivateData();
          }
        }
        return rows;
      },
    });
  } finally {
    nodes.dispose();
  }
}
