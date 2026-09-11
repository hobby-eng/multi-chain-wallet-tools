import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { encodeP2pkh, hash160 } from '@ckd/core/crypto.js';
import { customScanPaths, parseCustomAccountRange } from '../src/coins/custom-path.js';
import { describeCustomPath, editCustomPath } from '../src/custom-path-editor.js';
import { BITCOIN_RECOVERY_ADAPTER } from '../src/coins/bitcoin/index.js';
import { ETHEREUM_RECOVERY_ADAPTER } from '../src/coins/ethereum/index.js';
import { scanDashCore } from '../src/coins/dash/core-scanner.js';
import { RecoveryNetworkGateway } from '../src/network-gateway.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import type { RecoveryScanConfig } from '../src/types.js';
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Unexpected network operation.'));
}

function api(overrides: Partial<RecoveryNetworkApi>): RecoveryNetworkApi {
  return {
    ping: async () => 'isolated-network-worker-v1',
    coreStatus: unavailable,
    coreTip: unavailable,
    coreAddressInfo: unavailable,
    coreAddressHistory: unavailable,
    coreTransaction: unavailable,
    platformAddresses: unavailable,
    platformAddressHistory: unavailable,
    platformIdentityByPublicKeyHash: unavailable,
    platformIdentityHistory: unavailable,
    shieldedPage: unavailable,
    addressHistory: unavailable, utxoAddresses: unavailable,
    evmAccounts: unavailable,
    ...overrides,
  };
}

const config: RecoveryScanConfig = {
  network: 'mainnet',
  account: 0,
  scanCore: true,
  coreReceiveCount: 1,
  coreChangeCount: 0,
  scanLegacyCore: false,
  legacyCoreCount: 0,
  scanCoinJoin: false,
  coinJoinExternalCount: 0,
  coinJoinInternalCount: 0,
  scanIdentityFunding: false,
  identityFundingCount: 0,
  identityTopUpIdentityCount: 0,
  identityTopUpCount: 0,
  scanProviderCollateral: false,
  providerCollateralCount: 0,
  scanPlatformAddresses: false,
  platformAddressCount: 0,
  scanPlatformIdentities: false,
  identityStartIndex: 0,
  identityGapLimit: 1,
  identityScanLimit: 1,
  includeUsedZeroBalance: false,
  scanShieldedPool: false,
};


const range = { ...config, scanCustomPath: true, customPathTemplate: "m/44'/5'/7'/0/{index}", customPathRangeEnd: "m/44'/5'/8'/0/{index}", customPathCount: 1 };

describe('custom account range and free-form editor', () => {
  it('keeps arbitrary single paths and ignores an inactive custom range', () => {
    const paths = [...customScanPaths({ scanCustomPath: true, customPathTemplate: "m/123'/4/{index}'/8", customPathCount: 2 })];
    expect(paths[0]!.path(9)).toBe("m/123'/4/9'/8");
    expect(paths[0]!.minimum).toBe(2);
    expect(describeCustomPath(paths[0]!.template)).toBeNull();
    expect([...customScanPaths({ ...range, scanCustomPath: false, customPathRangeEnd: 'bad' })]).toEqual([]);
  });
  it('varies only accounts, starts address indices from zero, and pads each account independently', () => {
    const paths = [...customScanPaths(range)];
    expect(paths.map(p => [p.path(0), p.minimum])).toEqual([["m/44'/5'/7'/0/0",21],["m/44'/5'/8'/0/0",21]]);
    expect(new Set(paths.map(p => p.id)).size).toBe(2);
    expect(customScanPaths({ ...range, customPathRangeEnd: "m/44'/5'/2147483647'/0/{index}" }).length).toBe(2147483641);
  });
  it('rejects different branches, coin types, purposes, reversed accounts and invalid indices', () => {
    for (const end of ["m/44'/5'/8'/1/{index}","m/44'/1'/8'/0/{index}","m/84'/5'/8'/0/{index}","m/44'/5'/6'/0/{index}","m/44'/5'/2147483648'/0/{index}","m/44'/5'/8/0/{index}",'']) {
      expect(() => parseCustomAccountRange(range.customPathTemplate, end)).toThrow();
    }
    expect(() => customScanPaths({ ...range, customPathCount: 2147483640 })).toThrow(/margin/);
  });
  it('links the visual account and branch fields to the correct path segments', () => {
    expect(describeCustomPath(range.customPathTemplate)).toEqual({ purpose:44, coin:5, account:7, branch:0 });
    expect(editCustomPath(range.customPathTemplate, 'account', '9')).toBe("m/44'/5'/9'/0/{index}");
    expect(editCustomPath(range.customPathTemplate, 'branch', '1')).toBe("m/44'/5'/7'/1/{index}");
    expect(editCustomPath(range.customPathTemplate, 'account', '-1')).toBe(range.customPathTemplate);
    expect(editCustomPath("m/123'/4/{index}'", 'account', '2')).toBe("m/123'/4/{index}'");
  });
  for (const network of ['mainnet', 'testnet'] as const) {
    it(`runs standard Bitcoin discovery once, plus exactly two custom accounts (${network})`, async () => {
      const queried: string[] = [];
      const coin = network === 'mainnet' ? 0 : 1;
      const result = await BITCOIN_RECOVERY_ADAPTER.scan({ id:'fixture',label:'Fixture',mnemonic:MNEMONIC,passphrase:'' }, {
        ...range, network, customPathTemplate:`m/44'/${coin}'/7'/0/{index}`,customPathRangeEnd:`m/44'/${coin}'/8'/0/{index}`,customPathFormat:'legacy',
      }, { signal:new AbortController().signal,onProgress:()=>{},onFinding:()=>{},networkApi:api({utxoAddresses:async(_network,addresses)=>{
        queried.push(...addresses); return addresses.map(address=>({address,balance:'0',transactionCount:0}));
      }}) });
      expect(queried).toHaveLength(4+42);
      expect(new Set(queried).size).toBe(46);
      expect(result.overview).toContainEqual({label:'Path profiles',value:'6'});
    });
    it(`runs standard Ethereum profiles once without changing their accounts (${network})`, async () => {
      const queried: string[] = [];
      await ETHEREUM_RECOVERY_ADAPTER.scan({ id:'fixture',label:'Fixture',mnemonic:MNEMONIC,passphrase:'' }, {
        ...range,network,customPathTemplate:"m/44'/60'/7'/0/{index}",customPathRangeEnd:"m/44'/60'/8'/0/{index}",customPathFormat:'eoa',
      }, {signal:new AbortController().signal,onProgress:()=>{},onFinding:()=>{},networkApi:api({evmAccounts:async(_network,addresses)=>{
        queried.push(...addresses);return {blockNumber:'10',entries:addresses.map(address=>({address,balance:'0',nonce:'0'}))};
      }})});
      expect(queried).toHaveLength(44); // Two unique standard addresses plus 21 per custom account.
      expect(new Set(queried).size).toBe(44);
    });
    it(`scans explicit Dash paths, extends a used boundary, and resets the next account (${network})`, async () => {
      const seed = mnemonicToSeed(MNEMONIC); const root = HDKey.fromMasterSeed(seed);
      const coin = network === 'mainnet' ? 5 : 1;
      const address = (account:number,index:number) => {
        const child=root.derive(`m/44'/${coin}'/${account}'/0/${index}`);
        try {return encodeP2pkh(hash160(child.publicKey!),network==='mainnet'?76:140);} finally {child.wipePrivateData();}
      };
      const used=address(7,20); const queried:string[]=[];
      try {
        const gateway=new RecoveryNetworkGateway(new SecretEgressGuard(),api({coreStatus:async()=>({status:'ok'}),coreTip:async()=>({resultSet:[{height:10}]}),coreAddressInfo:async(_network,addresses)=>{
          queried.push(...addresses);return addresses.map(address=>({address,balance:'0',txCount:address===used?1:0}));
        }}));
        const result=await scanDashCore('fixture',seed,{...range,network,scanCore:false,customPathFormat:'p2pkh',customPathTemplate:`m/44'/${coin}'/7'/0/{index}`,customPathRangeEnd:`m/44'/${coin}'/8'/0/{index}`},gateway,new AbortController().signal,()=>{},()=>{});
        expect(result.state).toBe('complete');
        expect(queried).toEqual([...Array.from({length:41},(_,i)=>address(7,i)),...Array.from({length:21},(_,i)=>address(8,i))]);
      } finally {root.wipePrivateData();seed.fill(0);}
    });
  }
});
