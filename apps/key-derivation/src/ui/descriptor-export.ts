/** Core console syntax; only generated descriptor text is accepted. */
export function coreImportCommand(descriptors: string): string {
  const lines = descriptors.split('\n');
  if (lines.length !== 2 || lines.some((line, branch) => !line.includes(`/${branch}/*`) || /['"\\\r\n]/.test(line))) {
    throw new Error('Expected generated receive and change descriptors.');
  }
  const requests = lines.map((desc, branch) => ({ desc, timestamp: 0, active: true, internal: branch === 1 }));
  return `importdescriptors '${JSON.stringify(requests)}'`;
}
