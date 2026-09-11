import { expect, it } from 'vitest';
import { coreImportCommand } from '../src/ui/descriptor-export.js';
it('wraps both descriptors in one console argument with historical scan and correct branch roles', () => {
  const lines = 'pkh([12345678/44h/5h/0h]xpub/0/*)#checksum\npkh([12345678/44h/5h/0h]xpub/1/*)#checksum';
  const command = coreImportCommand(lines, 1999);
  expect(command.startsWith("importdescriptors '[")).toBe(true);
  const requests = JSON.parse(command.slice("importdescriptors '".length, -1));
  expect(requests).toEqual(lines.split('\n').map((desc, i) => ({desc, timestamp:0, range:[0,1999], internal:i===1})));
});
it('rejects invalid ranges and quote injection', () => {
  for (const end of [-1, 1.5, NaN, 2147483648]) expect(() => coreImportCommand('', end)).toThrow();
  expect(() => coreImportCommand("bad'/0/*\nother/1/*", 999)).toThrow();
});
