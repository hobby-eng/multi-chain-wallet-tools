# Zcash test vectors

Published test vectors of ZIP-316's unified encodings, byte for byte as zcash/zcash-test-vectors
publishes them at commit `78321beacb0e0477e33cd002b56585a107c2708c`, in its folder
`test-vectors/json/`. Each file is made by the generator of the same name in `zcash_test_vectors/`.

| File                                 | What it holds                                                         |
| ------------------------------------ | --------------------------------------------------------------------- |
| `f4jumble.json`                      | F4Jumble of eight messages of 48 to 16449 bytes                       |
| `f4jumble_long.json`                 | The BLAKE2b-512 of F4Jumble of two long messages, up to 4194368 bytes |
| `unified_address.json`               | 60 unified addresses with their receivers                             |
| `unified_full_viewing_keys.json`     | 20 unified full viewing keys with their items                         |
| `unified_incoming_viewing_keys.json` | 20 unified incoming viewing keys with their items                     |

`SHA256SUMS` holds the SHA-256 of each file. `packages/coin-protocols/tests/zcash-unified.test.ts`
and `test/oracles/zcash_unified_oracle.py` read them.

Copyright (c) 2018-2021 The Electric Coin Company. The files are published under the MIT license or
the Apache License 2.0, at the reader's option, and are used here under the MIT license, whose text
is in `THIRD_PARTY_NOTICES.md` ("MIT notices"): https://github.com/zcash/zcash-test-vectors.
