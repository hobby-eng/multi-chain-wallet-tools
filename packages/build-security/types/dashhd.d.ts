declare module 'dashhd' {
  interface DashHdKey {
    privateKey?: Uint8Array;
    publicKey: Uint8Array;
  }

  interface DashHd {
    fromSeed(seed: Uint8Array, options?: { purpose?: number; coinType?: number }): Promise<DashHdKey>;
    derivePath(root: DashHdKey, path: string): Promise<DashHdKey>;
    toAddr(publicKey: Uint8Array): Promise<string>;
    toWif(privateKey: Uint8Array): Promise<string>;
    wipePrivateData(key: DashHdKey): void;
  }

  const dashHd: DashHd;
  export default dashHd;
}
