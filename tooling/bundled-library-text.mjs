import { readFileSync } from "node:fs";

/**
 * Removes web addresses from message strings of bundled libraries.
 *
 * The artifact gate rejects every web address outside the reviewed links. The PDF
 * libraries carry three in text that is never sent anywhere: a producer label and two
 * console notices. Each replacement must match exactly once, so a library update
 * that changes the text stops the build instead of passing unnoticed.
 */
// The patterns have no flags because esbuild compiles load filters as Go regular expressions.
export const BUNDLED_LIBRARY_TEXT = Object.freeze([
  {
    file: /[\\/]node_modules[\\/]pdf-lib[\\/]es[\\/]api[\\/]PDFDocument\.js$/,
    replacements: [['"pdf-lib (https://github.com/Hopding/pdf-lib)"', '"pdf-lib"']],
  },
  {
    file: /[\\/]node_modules[\\/]@pdf-lib[\\/]fontkit[\\/]dist[\\/]fontkit\.es\.js$/,
    replacements: [
      [
        "See more info at https://github.com/ashtuchkin/iconv-lite/wiki/Node-v4-compatibility",
        "See the iconv-lite documentation on Node v4 compatibility",
      ],
      [
        "Refer to https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding",
        "Refer to the iconv-lite documentation on decoding buffers",
      ],
    ],
  },
]);

export function rewriteBundledLibraryText(path, source) {
  const rule = BUNDLED_LIBRARY_TEXT.find(({ file }) => file.test(path));
  if (rule === undefined) return source;
  let text = source;
  for (const [from, to] of rule.replacements) {
    const parts = text.split(from);
    if (parts.length !== 2)
      throw new Error(
        `Expected exactly one occurrence of reviewed library text in ${path}: ${from}`,
      );
    text = parts.join(to);
  }
  return text;
}

export function createBundledLibraryTextPlugin() {
  return {
    name: "bundled-library-text",
    setup(build) {
      for (const { file } of BUNDLED_LIBRARY_TEXT) {
        build.onLoad({ filter: file }, ({ path }) => ({
          contents: rewriteBundledLibraryText(path, readFileSync(path, "utf8")),
          loader: "js",
        }));
      }
    },
  };
}
