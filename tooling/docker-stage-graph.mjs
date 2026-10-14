/** Read the build-stage dependency graph, including COPY --from edges. */
export class DockerStageGraph {
  #stages = new Map();

  constructor(source) {
    const headers = [...source.matchAll(/^FROM\s+(\S+)\s+AS\s+(\S+)\s*$/gimu)];
    for (const [index, header] of headers.entries()) {
      const name = header[2].toLowerCase();
      if (this.#stages.has(name)) throw new Error(`Repeated Docker stage: ${name}`);
      const body = source.slice(header.index + header[0].length, headers[index + 1]?.index);
      const instructions = body.replace(/\\\r?\n/gu, " ").split(/\r?\n/u);
      const copies = instructions.filter((line) => /^\s*COPY\b/iu.test(line)).join("\n");
      this.#stages.set(name, {
        dependencies: [
          header[1].toLowerCase(),
          ...[...copies.matchAll(/--from=(\S+)/gu)].map((match) => match[1].toLowerCase()),
        ],
        commands: instructions.filter((line) => /^\s*RUN\b/iu.test(line)),
      });
    }
  }

  runCommands(target) {
    if (!this.#stages.has(target)) throw new Error(`Unknown Docker stage: ${target}`);
    const active = new Set();
    const complete = new Set();
    const commands = [];
    const visit = (name) => {
      if (active.has(name)) throw new Error(`Docker stage cycle: ${name}`);
      if (complete.has(name) || !this.#stages.has(name)) return;
      active.add(name);
      const stage = this.#stages.get(name);
      for (const dependency of stage.dependencies) visit(dependency);
      commands.push(...stage.commands);
      active.delete(name);
      complete.add(name);
    };
    visit(target);
    return commands;
  }
}
