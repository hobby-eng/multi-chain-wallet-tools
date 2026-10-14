declare module "*.wasm" {
  // esbuild's binary loader gives a Uint8Array over its own ArrayBuffer, never a shared one.
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
