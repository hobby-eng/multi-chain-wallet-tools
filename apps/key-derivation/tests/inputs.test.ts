import { describe, expect, it } from 'vitest';
import { getCoinAdapter } from '@ckd/coins/registry.js';
import { readControls, standardPathDetails, type DerivationControls } from '../src/ui/inputs.js';

function controls(count: string, start = '0', includeChange = false, branch = '0'): DerivationControls {
  return {
    network: { value: 'mainnet' },
    account: { value: '0' },
    branchInput: { value: branch },
    branchSelect: { value: branch },
    includeChange: { checked: includeChange },
    includeCoinJoin: { checked: false },
    start: { value: start },
    count: { value: count },
  } as unknown as DerivationControls;
}

describe('user-visible derivation count', () => {
  it('accepts 10,000 results and leaves batching to the adapter orchestrator', () => {
    const input = readControls(getCoinAdapter('bitcoin-native-segwit'), controls('10000'));
    expect(input.count).toBe(10_000);
    expect(input.includeChange).toBe(false);
  });

  it('retains only protocol index-space bounds, not the former 50-result limit', () => {
    expect(() => readControls(getCoinAdapter('bitcoin-native-segwit'), controls('2147483649'))).toThrow(/1 to 2147483648/u);
    expect(() => readControls(getCoinAdapter('bitcoin-native-segwit'), controls('2', '2147483647'))).toThrow(/range exceeds/u);
  });

  it('exposes the optional change branch only for adapters that declare it', () => {
    const bitcoin = readControls(getCoinAdapter('bitcoin-taproot'), controls('20', '0', true));
    const dash = readControls(getCoinAdapter('dash-core'), controls('20', '0', true));
    const platform = readControls(getCoinAdapter('dash-platform'), controls('20', '0', true, '7'));
    const ethereum = readControls(getCoinAdapter('ethereum'), controls('20', '0', true, '1'));

    expect(bitcoin).toMatchObject({ branch: 0, includeChange: true });
    expect(dash).toMatchObject({ branch: 0, includeChange: true });
    expect(platform).toMatchObject({ branch: 0, includeChange: true });
    expect(getCoinAdapter('dash-platform').branchControl).toBeUndefined();
    expect(ethereum).toMatchObject({ branch: 1, includeChange: false });
  });
  it('reads a legacy account and keeps receive/change controls available', () => {
    const form = controls('3', '2', true);
    form.account.value = '7';
    const adapter = getCoinAdapter('dash-legacy-mobile');
    const input = readControls(adapter, form);
    expect(input).toMatchObject({ account: 7, start: 2, count: 3, includeChange: true });
    expect(adapter.pathPreview(input)).toBe("m/7'/0/2…4");
    expect(adapter.pathPreview({ ...input, branch: 1 })).toBe("m/7'/1/2…4");
  });



});


describe('standard path presentation', () => {
  for (const [id, purpose] of [['bitcoin-legacy',44],['bitcoin-nested-segwit',49],['bitcoin-native-segwit',84],['bitcoin-taproot',86]] as const) {
    it(`keeps ${id} purpose and scheme coupled across accounts and networks`, () => {
      const adapter=getCoinAdapter(id);
      const input={...adapter.defaults,network:'testnet' as const,account:7,includeChange:true,includeCoinJoin:false};
      expect(standardPathDetails(adapter,input)).toEqual([
        {label:'Purpose',value:`${purpose}'`},{label:'Coin type',value:"1'"},
        {label:'Selected scheme',value:adapter.label},{label:'Address branch',value:'0 · Receive / 1 · Change'},
      ]);
      expect(adapter.pathPreview(input)).toContain(`m/${purpose}'/1'/7'/0/`);
    });
  }
  it('does not invent purpose or coin levels for legacy mobile, or an account for Identity', () => {
    const legacy=getCoinAdapter('dash-legacy-mobile');
    expect(standardPathDetails(legacy,{...legacy.defaults,includeChange:false,includeCoinJoin:false}).map(f=>f.label)).toEqual(['Selected scheme','Address branch']);
    const c=controls('1');c.account.value='invalid hidden field';
    expect(readControls(getCoinAdapter('dash-identity'),c).account).toBe(0);
  });
  it('shows hardened Platform branches and the distinct Orchard purpose', () => {
    const platform=getCoinAdapter('dash-platform');
    expect(standardPathDetails(platform,{...platform.defaults,includeChange:true,includeCoinJoin:false})).toContainEqual({label:'Address branch',value:"0' · Receive / 1' · Change"});
    const orchard=getCoinAdapter('dash-shielded');
    const details=standardPathDetails(orchard,{...orchard.defaults,includeChange:false,includeCoinJoin:false});
    expect(details).toContainEqual({label:'ZIP-32 purpose',value:"32'"});
    expect(details.some(f=>f.label==='Address branch')).toBe(false);
  });
});
