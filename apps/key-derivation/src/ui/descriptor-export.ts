/** Core console syntax; only generated descriptor text is accepted. */
export function coreImportCommand(descriptors: string, rangeEnd: number): string {
  if (!Number.isSafeInteger(rangeEnd) || rangeEnd < 0 || rangeEnd > 2147483647) {
    throw new Error('Last address index must be an integer from 0 to 2147483647.');
  }
  const lines = descriptors.split('\n');
  if (lines.length !== 2 || lines.some((line, branch) => !line.includes(`/${branch}/*`) || /['"\\\r\n]/.test(line))) {
    throw new Error('Expected generated receive and change descriptors.');
  }
  const requests = lines.map((desc, branch) => ({ desc, timestamp: 0, range: [0, rangeEnd], internal: branch === 1 }));
  return `importdescriptors '${JSON.stringify(requests)}'`;
}
