// Canonical public instructions are embedded by the build's text loader, without network reads.
declare module "*.md" {
  const text: string;
  export default text;
}
