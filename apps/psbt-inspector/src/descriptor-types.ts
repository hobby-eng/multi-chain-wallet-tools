import type { DescriptorPathCard } from './descriptor-policy.js';

export interface DescriptorRow {
  readonly label: string;
  readonly value: string;
}

export interface DescriptorCompiledOutput {
  readonly asm: string;
  readonly rows: readonly DescriptorRow[];
}

export interface DecodedDescriptor {
  readonly classification: string;
  readonly summary: string;
  readonly checksum: string;
  readonly ranged: boolean;
  readonly spendingPaths: readonly string[];
  readonly pathCards: readonly DescriptorPathCard[];
  readonly policyTree: readonly string[];
  readonly rows: readonly DescriptorRow[];
  readonly compiledOutput: DescriptorCompiledOutput | null;
}
