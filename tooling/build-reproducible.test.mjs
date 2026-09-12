import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const temporary = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
describe('Docker copy-out and failure cleanup without a Docker daemon', () => {
  for (const mode of ['complete','incomplete','copy-failure','build-failure']) it(mode, () => {
    const root = mkdtempSync(join(tmpdir(),'wallet-build-regression-')); temporary.push(root);
    for (const dir of ['tooling','bin','dist','tmp']) mkdirSync(join(root,dir));
    writeFileSync(join(root,'dist/keep.txt'),'previous output');
    writeFileSync(join(root,'package.json'),'{"type":"module","version":"1.2.3"}');
    for (const file of ['build-reproducible.mjs','build-profiles.mjs']) cpSync(fileURLToPath(new URL(file,import.meta.url)),join(root,'tooling',file));
    writeFileSync(join(root,'bin/docker'), `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const a=process.argv.slice(2), mode=process.env.FIXTURE_MODE;
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(a)+'\\n');
if(a[0]==='build'&&mode==='build-failure') process.exit(7);
if(a[0]==='create') console.log('fixture-container');
if(a[0]==='cp') {
 if(mode==='copy-failure') process.exit(9);
 for(const edition of mode==='incomplete'?['multi-chain-edition']:['multi-chain-edition','dash-community-edition']) {
  const p=path.join(a[2],edition,'release');fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'SHA256SUMS'),'fixture\\n');
 }
}
`,{mode:0o755});
    const log=join(root,'calls.jsonl');
    const r=spawnSync(process.execPath,[join(root,'tooling/build-reproducible.mjs')],{encoding:'utf8',env:{...process.env,PATH:`${join(root,'bin')}:${dirname(process.execPath)}:${process.env.PATH}`,TMPDIR:join(root,'tmp'),FIXTURE_MODE:mode,FIXTURE_LOG:log}});
    expect(r.status,r.stderr).toBe(mode==='complete'?0:mode==='copy-failure'?9:mode==='build-failure'?7:1);
    const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
    expect(calls.some(a=>a[0]==='rm'&&a[1]==='--force'&&a[2]==='fixture-container')).toBe(mode!=='build-failure');
    expect(readdirSync(join(root,'tmp'))).toEqual([]);
    if(mode==='complete') {
      expect(existsSync(join(root,'dist/keep.txt'))).toBe(false);
      for(const edition of ['multi-chain-edition','dash-community-edition']) expect(readFileSync(join(root,'dist',edition,'release/SHA256SUMS'),'utf8')).toBe('fixture\n');
    } else expect(readFileSync(join(root,'dist/keep.txt'),'utf8')).toBe('previous output');
  });
});
