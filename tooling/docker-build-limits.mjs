/** Optional per-build limits, without changing a Docker daemon or selected builder. */
export class DockerBuildLimits {
  #memoryMiB;
  #cpus;
  static #cpuPeriod = 100_000; // Docker's CPU CFS period, in microseconds.

  constructor(environment = process.env) {
    this.#memoryMiB = this.#integer(environment.WALLET_TOOLS_BUILD_MEMORY_MIB, "build memory");
    this.#cpus = this.#integer(environment.WALLET_TOOLS_BUILD_CPUS, "build CPUs");
    if (
      this.#cpus !== undefined &&
      !Number.isSafeInteger(this.#cpus * DockerBuildLimits.#cpuPeriod)
    )
      throw new Error("Build CPU quota exceeds the safe integer range.");
  }

  #integer(value, label) {
    if (value === undefined) return undefined;
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
      throw new Error(`${label} must be a positive safe integer.`);
    return Number(value);
  }

  arguments() {
    const resources = [];
    if (this.#memoryMiB !== undefined)
      resources.push(`memory=${this.#memoryMiB}m`, `memory-swap=${this.#memoryMiB}m`);
    if (this.#cpus !== undefined)
      resources.push(
        `cpu-period=${DockerBuildLimits.#cpuPeriod}`,
        `cpu-quota=${this.#cpus * DockerBuildLimits.#cpuPeriod}`,
      );
    return resources.flatMap((value) => ["--resource", value]);
  }
}
