import { expect, it } from 'vitest';
import { coreImportCommand } from '../src/ui/descriptor-export.js';
it('wraps both descriptors in one console argument with historical scan and correct branch roles', () => {
  const lines = 'pkh([12345678/44h/5h/0h]xpub/0/*)#checksum\npkh([12345678/44h/5h/0h]xpub/1/*)#checksum';
  const command = coreImportCommand(lines);
  expect(command.startsWith("importdescriptors '[")).toBe(true);
  const requests = JSON.parse(command.slice("importdescriptors '".length, -1));
  expect(requests).toEqual(lines.split('\n').map((desc, i) => ({desc, timestamp:0, active:true, internal:i===1})));
});
it('rejects malformed descriptors and quote injection', () => {
  expect(() => coreImportCommand("bad'/0/*\nother/1/*")).toThrow();
});
