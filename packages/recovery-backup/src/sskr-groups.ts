export interface SskrGroupSpec {
  readonly threshold: number;
  readonly count: number;
}

interface SskrGroupValidationOptions {
  readonly label: 'SSKR' | 'Envelope SSKR';
  readonly allowEmpty: boolean;
}

/** Validates a two-level SSKR policy and returns the packed WASM representation. */
export function validateSskrGroups(
  groupThreshold: number | undefined,
  groups: readonly SskrGroupSpec[],
  options: SskrGroupValidationOptions,
): Uint8Array {
  if (groups.length === 0 && options.allowEmpty && (groupThreshold === undefined || groupThreshold === 0)) {
    return new Uint8Array();
  }
  if (
    !Number.isSafeInteger(groupThreshold) ||
    groupThreshold === undefined ||
    groupThreshold < 1 ||
    groupThreshold > groups.length
  ) {
    throw new Error(`${options.label} groups required must be an integer from 1 through the number of groups.`);
  }
  if (groups.length < 1 || groups.length > 16) {
    throw new Error(
      options.label === 'SSKR' ? 'SSKR requires from 1 to 16 groups.' : 'Envelope SSKR supports at most 16 groups.',
    );
  }
  for (const [index, group] of groups.entries()) {
    if (
      !Number.isSafeInteger(group.threshold) ||
      !Number.isSafeInteger(group.count) ||
      group.threshold < 1 ||
      group.count < 1 ||
      group.threshold > group.count ||
      group.count > 16
    ) {
      throw new Error(`${options.label} group ${index + 1} must use an integer threshold/count from 1 to 16.`);
    }
  }
  return Uint8Array.from(groups.flatMap((group) => [group.threshold, group.count]));
}
