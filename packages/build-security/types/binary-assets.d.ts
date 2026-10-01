// The build embeds these files with esbuild's binary loader.
declare module "*.ttf" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "*.png" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "*.jpg" {
  const bytes: Uint8Array;
  export default bytes;
}
