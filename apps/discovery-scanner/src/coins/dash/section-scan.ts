// The shape every Dash section scan shares, so that the seed adapter starts each one the same way.
import type {
  RecoveryFinding,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoverySection,
} from "../../types.js";

/**
 * The scan of one Dash section from a seed: `source` is what the section asks, the DashScan
 * gateway for Core-chain sections and the Platform client for Platform ones.
 */
export type DashSectionScan<Source> = (
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  source: Source,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
) => Promise<RecoverySection>;
