# Unicode 18.0.0 data

The Unicode Character Database files from which `tooling/generate-unicode-nfkd.mjs` writes the
Deriver's own NFKD tables (`packages/crypto-core/src/unicode-nfkd-data.ts`), and the normalization
test data its unit test reads, compressed with `gzip -9 -n`:

| File                       | Source                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `UnicodeData.txt.gz`       | https://www.unicode.org/Public/18.0.0/ucd/UnicodeData.txt       |
| `NormalizationTest.txt.gz` | https://www.unicode.org/Public/18.0.0/ucd/NormalizationTest.txt |

`SHA256SUMS` holds the SHA-256 of each file uncompressed, as published. The normalization test data
is byte for byte the one MHFE's core keeps (`mhfe_core/tests/fixtures/unicode18-ucd/`), so that the
Deriver and MHFE normalize a BIP39 passphrase alike.

© 2026 Unicode®, Inc. These files are distributed under the Unicode License v3:
https://www.unicode.org/license.txt.
