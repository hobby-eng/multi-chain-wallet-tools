import { watchOnlyPublicKey } from "@ckd/recovery/watch-only.js";
import { bytesToHex, encodeP2pkh, hash160, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { encodePlatformP2pkh } from "@ckd/coins/dash/platform.js";
import { DASHSCAN_ENDPOINTS } from "@ckd/dash-network/public-address.js";
import { WalletScan } from "../../wallet-result.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";
import type {
  RecoveryFinding,
  RecoveryScanContext,
  RecoverySection,
  RecoveryWalletResult,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from "../../types.js";
import { DASH_COIN } from "./coin.js";
import type { DashPlatformClient } from "./platform-client.js";
import { validatePlatformAddressBatch } from "./platform-scanner.js";
import { validateIdentityLookup } from "./identity-scanner.js";
import { summarizeDashSections } from "./summary.js";
import {
  fetchDashScanIndexedHeight,
  formatDashFromCredits,
  formatDashFromDuffs,
  StoppedScanSection,
  validateDashScanAddressBatch,
} from "./util.js";

type ExactKeyContext = Pick<RecoveryScanContext, "signal" | "onProgress" | "onFinding">;
type ExactKeyConfig = Pick<RecoveryWatchOnlyScanConfig, "network" | "includeUsedZeroBalance">;
const REFUSALS = {
  batch: "The Core response omitted an admitted public address.",
  used: "This exact public-key scan has already started.",
} as const;
/** Stable input-free refusal of an invalid operation or an incomplete admitted batch. */
export class ExactKeyScanError extends Error {
  readonly code: `dash.exact-key.${keyof typeof REFUSALS}`;
  constructor(reason: keyof typeof REFUSALS) {
    super(REFUSALS[reason]);
    this.name = "ExactKeyScanError";
    this.code = `dash.exact-key.${reason}`;
  }
}

/** One public key's Core/Platform/Identity lookups, with independent section outcomes. */
export class ExactPublicKeyScan {
  readonly #inputId: string;
  readonly #config: ExactKeyConfig;
  readonly #context: ExactKeyContext;
  readonly #gateway: RecoveryNetworkGateway;
  readonly #client: DashPlatformClient;
  readonly #wallet: WalletScan;
  readonly #hash: string;
  readonly #platformAddress: string;
  readonly #core: readonly { readonly address: string; readonly subtitle: string }[];
  readonly #sections: RecoverySection[] = [];
  #used = false;

  /** Uses an admitted network and public point; only public queries and callbacks are retained. */
  constructor(
    input: Pick<RecoveryWatchOnlyInput, "id" | "label" | "value">,
    config: ExactKeyConfig,
    context: ExactKeyContext,
    gateway: RecoveryNetworkGateway,
    client: DashPlatformClient,
  ) {
    this.#inputId = input.id;
    this.#config = { ...config };
    this.#context = context;
    this.#gateway = gateway;
    this.#client = client;
    this.#wallet = new WalletScan({ id: input.id, label: input.label }, DASH_COIN, config.network);
    const network = getDashNetwork(config.network);
    const { compressed, uncompressed } = watchOnlyPublicKey(input.value);
    try {
      const digest = hash160(compressed);
      this.#hash = bytesToHex(digest);
      this.#core = [
        {
          address: encodeP2pkh(digest, network.p2pkh),
          subtitle: "Exact Core P2PKH · compressed key",
        },
        {
          address: encodeP2pkh(hash160(uncompressed), network.p2pkh),
          subtitle: "Exact Core P2PKH · uncompressed key",
        },
      ];
      this.#platformAddress = encodePlatformP2pkh(digest, network.platformHrp);
    } finally {
      wipe(compressed, uncompressed);
    }
  }

  async #check(
    id: RecoverySection["id"],
    title: string,
    action: () => Promise<RecoverySection>,
  ): Promise<void> {
    const stopped = new StoppedScanSection(id, title, "Exact public-key lookup");
    if (this.#context.signal.aborted) {
      this.#sections.push(stopped.cancelled());
      return;
    }
    this.#context.onProgress({
      inputId: this.#inputId,
      section: id,
      message: title,
      completed: 0,
      total: null,
    });
    let section: RecoverySection;
    try {
      section = await action();
    } catch (cause) {
      this.#sections.push(
        this.#context.signal.aborted ? stopped.cancelled() : stopped.failed(cause),
      );
      return;
    }
    if (this.#context.signal.aborted) {
      this.#sections.push(stopped.cancelled());
      return;
    }
    this.#sections.push(section);
    for (const finding of section.findings) this.#context.onFinding(this.#inputId, id, finding);
  }

  async #coreSection(): Promise<RecoverySection> {
    const { network, includeUsedZeroBalance } = this.#config;
    const { signal } = this.#context;
    const height = await fetchDashScanIndexedHeight(this.#gateway, network, signal);
    const addresses = this.#core.map(({ address }) => address);
    const infos = validateDashScanAddressBatch(
      await this.#gateway.runPublic(
        { network, addresses },
        "core.address-info",
        () => this.#gateway.networkApi.coreAddressInfo(network, addresses, signal),
        signal,
      ),
      addresses,
    );
    const findings: RecoveryFinding[] = this.#core.flatMap((form, index) => {
      const info = infos[index];
      if (info === undefined) throw new ExactKeyScanError("batch");
      if (info.balance === 0n && !(includeUsedZeroBalance && info.txCount > 0)) return [];
      return [
        {
          id: `dash-public-key:core:${form.address}`,
          title: form.address,
          subtitle: form.subtitle,
          balanceAtomic: info.balance,
          balanceLabel: formatDashFromDuffs(info.balance),
          fields: [{ label: "Transactions reported", value: String(info.txCount) }],
        },
      ];
    });
    return {
      id: "core",
      title: "Dash Core · exact public key",
      description: "Check the compressed and uncompressed P2PKH addresses of this exact key.",
      state: "complete",
      metrics: [{ label: "Addresses checked", value: String(addresses.length) }],
      findings,
      scanned: addresses.length,
      source: DASHSCAN_ENDPOINTS[network],
      proof: `DashScan synchronized · indexed Core height ${height} · single exact-key lookup`,
    };
  }

  async #platformSection(): Promise<RecoverySection> {
    const { signal } = this.#context;
    const expected = `00${this.#hash}`;
    const response = validatePlatformAddressBatch(
      await this.#client.addresses([this.#platformAddress], signal),
      [expected],
    );
    const info = response.data.get(expected);
    const findings: RecoveryFinding[] =
      info !== undefined &&
      info !== null &&
      (info.balance > 0n || (this.#config.includeUsedZeroBalance && info.nonce > 0n))
        ? [
            {
              id: `dash-public-key:platform:${this.#platformAddress}`,
              title: this.#platformAddress,
              subtitle: "Exact Platform P2PKH · compressed key",
              balanceAtomic: info.balance,
              balanceLabel: formatDashFromCredits(info.balance),
              fields: [{ label: "Outgoing nonce", value: info.nonce.toString() }],
            },
          ]
        : [];
    return {
      id: "platform",
      title: "Dash Platform · exact public key",
      description: "Check the compressed-key Platform P2PKH address.",
      state: "complete",
      metrics: [{ label: "Addresses checked", value: "1" }],
      findings,
      scanned: 1,
      source: "Dash Platform DAPI · trusted quorum discovery",
      proof: `Balance proof verified at Platform height ${response.height} · protocol ${response.protocolVersion}`,
    };
  }

  async #identitySection(): Promise<RecoverySection> {
    const response = validateIdentityLookup(
      await this.#client.identity(this.#hash, this.#context.signal),
    );
    const findings: RecoveryFinding[] = response.identities.map((identity) => ({
      id: `dash-public-key:identity:${identity.identifier}`,
      title: identity.identifier,
      subtitle: "Identity matched by unique compressed-key HASH160",
      balanceAtomic: identity.balance,
      balanceLabel: formatDashFromCredits(identity.balance),
      fields: [
        { label: "Public-key hash", value: this.#hash, copyable: true },
        { label: "Identity revision", value: identity.revision.toString() },
      ],
    }));
    return {
      id: "identity",
      title: "Dash Platform · exact identity lookup",
      description: "Proof-verified lookup by the compressed public key hash.",
      state: "complete",
      metrics: [{ label: "Identities found", value: String(findings.length) }],
      findings,
      scanned: 1,
      source: "Dash Platform DAPI · trusted quorum discovery",
      proof: `Balance proof verified at Platform height ${response.proofHeight} · protocol ${response.protocolVersion}`,
    };
  }

  /** Queries each public section once; cancellation is partial, and late responses never publish. */
  async run(): Promise<RecoveryWalletResult> {
    if (this.#used) throw new ExactKeyScanError("used");
    this.#used = true;
    await this.#check("core", "Dash Core · exact public key", () => this.#coreSection());
    await this.#check("platform", "Dash Platform · exact public key", () =>
      this.#platformSection(),
    );
    await this.#check("identity", "Dash Platform · exact identity lookup", () =>
      this.#identitySection(),
    );
    return this.#wallet.result({
      overview: summarizeDashSections(this.#sections),
      sections: this.#sections,
      warnings: [
        "A single public key is checked exactly; it does not derive standard wallet descendants.",
        ...this.#sections
          .filter(({ state }) => state !== "complete")
          .map(({ title, warning }) => `${title} was not checked: ${warning}`),
      ],
    });
  }
}
