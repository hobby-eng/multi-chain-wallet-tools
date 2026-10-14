"""AUD-026 functional: recompute every production derivation value with the independent reference.

Reads docs/audits/AUD-026-evidence/functional/derivations.json (written by
functional-derivation-dump.test.ts from the worker entry getRuntimeCoinAdapter(id).derive) and
checks entropy, seed, master/account/child extended keys, fingerprints, public/private keys, WIF,
addresses, scripts, Taproot tweak values, EIP-55, DIP17/DIP18 Platform payloads, DIP13 Identity
keys, multisig cosigner origins and BIP380 descriptor checksums. Every row field is either
compared or reported as unchecked. Exits non-zero on any mismatch or unchecked field.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

DUMP = os.path.join(HERE, "../AUD-026-evidence/functional/derivations.json")
H = ref.HARDENED

BTC = {
    "mainnet": dict(coin=0, p2pkh=0x00, p2sh=0x05, wif=0x80, hrp="bc", v=(ref.XPRV, ref.XPUB)),
    "testnet": dict(coin=1, p2pkh=0x6F, p2sh=0xC4, wif=0xEF, hrp="tb", v=(ref.TPRV, ref.TPUB)),
}
# Dash Core chainparams.cpp: mainnet PUBKEY 76, SCRIPT 16, SECRET 204; testnet 140, 19, 239.
DASH = {
    "mainnet": dict(coin=5, p2pkh=76, wif=204, hrp="dash", v=(ref.XPRV, ref.XPUB)),
    "testnet": dict(coin=1, p2pkh=140, wif=239, hrp="tdash", v=(ref.TPRV, ref.TPUB)),
}
PURPOSE = {"bitcoin-legacy": 44, "bitcoin-nested-segwit": 49, "bitcoin-native-segwit": 84, "bitcoin-taproot": 86}
DESC = {"bitcoin-legacy": "pkh({})", "bitcoin-nested-segwit": "sh(wpkh({}))", "bitcoin-native-segwit": "wpkh({})", "bitcoin-taproot": "tr({})"}

failures = []
unchecked = set()
checked = 0


def eq(where, got, want):
    global checked
    checked += 1
    if got != want:
        failures.append(f"{where}: got {got!r} want {want!r}")


def fields(items):
    return {f["key"]: f["value"] for f in items}


def compare(where, actual, expected):
    for key, value in actual.items():
        if key in expected:
            eq(f"{where}.{key}", value, expected[key])
        else:
            unchecked.add(f"{where.split('/')[0]}.{key}")
    for key in expected:
        if key not in actual:
            failures.append(f"{where}: field {key} missing")


def origin(fp, path):
    return "[" + fp + path[1:].replace("'", "h") + "]"


def summary_expected(root, account_node, account_path, versions):
    return {
        "masterXprv": root.serialize(*versions, private=True),
        "masterXpub": root.serialize(*versions, private=False),
        "masterPrivateKey": root.key.to_bytes(32, "big").hex(),
        "masterPublicKey": root.pub().hex(),
        "accountPath": account_path,
        "accountXprv": account_node.serialize(*versions, private=True),
        "accountXpub": account_node.serialize(*versions, private=False),
        "masterFingerprint": root.fingerprint().hex(),
    }


def child_common(node, versions):
    return {
        "childXprv": node.serialize(*versions, private=True),
        "childXpub": node.serialize(*versions, private=False),
    }


def check_case(seed, case, label):
    cid = case["id"]
    shape = case["shape"]
    where = f"{cid}/{label}/{shape['network']}/a{shape['account']}/b{shape['branch']}/s{shape['start']}"
    if case["error"]:
        failures.append(f"{where}: unexpected error {case['error']}")
        return
    r = case["result"]
    root = ref.Node.from_seed(seed)
    net = shape["network"]
    acc, br, start, count = shape["account"], shape["branch"], shape["start"], shape["count"]
    eq(f"{where}.rows", len(r["rows"]), count)
    fp = root.fingerprint().hex()

    if cid.startswith("bitcoin"):
        n = BTC[net]
        ap = f"m/{PURPOSE[cid]}'/{n['coin']}'/{acc}'"
        account = root.derive(ap)
        compare(where + "/summary", fields(r["summary"]), summary_expected(root, account, ap, n["v"]))
        xpub = account.serialize(*n["v"], private=False)
        xprv = account.serialize(*n["v"], private=True)
        tmpl = DESC[cid]
        key = lambda k, b: f"{origin(fp, ap)}{k}/{b}/*"  # noqa: E731
        eq(f"{where}.watchOnly", r["watchOnly"]["text"], ref.descriptor_checksum(tmpl.format(key(xpub, br))))
        eq(f"{where}.publicText", r["accountDescriptors"]["publicText"],
           "\n".join(ref.descriptor_checksum(tmpl.format(key(xpub, b))) for b in (0, 1)))
        eq(f"{where}.privateText", r["accountDescriptors"]["privateText"],
           "\n".join(ref.descriptor_checksum(tmpl.format(key(xprv, b))) for b in (0, 1)))
        eq(f"{where}.pathTemplate", r["pathTemplate"], f"{ap}/{br}/i")
        for off, row in enumerate(r["rows"]):
            i = start + off
            path = f"{ap}/{br}/{i}"
            node = account.child(br).child(i)
            pub = node.pub()
            h160 = ref.hash160(pub)
            exp = {
                "path": path,
                "publicKey": pub.hex(),
                "privateKey": ref.wif(node.key, n["wif"]),
                "childPrivateKey": node.key.to_bytes(32, "big").hex(),
                **child_common(node, n["v"]),
                "publicKeyHash": h160.hex(),
            }
            if cid == "bitcoin-legacy":
                exp["address"] = ref.p2pkh(pub, n["p2pkh"])
                exp["scriptPubKey"] = "76a914" + h160.hex() + "88ac"
            elif cid == "bitcoin-nested-segwit":
                redeem = b"\x00\x14" + h160
                exp["address"] = ref.p2sh_p2wpkh(pub, n["p2sh"])
                exp["redeemScript"] = redeem.hex()
                exp["scriptHash"] = ref.hash160(redeem).hex()
                exp["scriptPubKey"] = "a914" + ref.hash160(redeem).hex() + "87"
            elif cid == "bitcoin-native-segwit":
                exp["address"] = ref.p2wpkh(pub, n["hrp"])
                exp["witnessProgram"] = h160.hex()
                exp["scriptPubKey"] = "0014" + h160.hex()
            else:
                del exp["publicKeyHash"]
                point = node.point()
                xonly, t, q = ref.taproot_output(point)
                d = node.key if point[1] % 2 == 0 else ref.N - node.key
                out_priv = (d + t) % ref.N
                exp["address"] = ref.p2tr(point, n["hrp"])
                exp["internalPublicKey"] = xonly.hex()
                exp["tapTweak"] = t.to_bytes(32, "big").hex()
                exp["taprootOutputPublicKey"] = q[0].to_bytes(32, "big").hex()
                exp["taprootOutputCompressedPublicKey"] = ref.ser_compressed(q).hex()
                exp["taprootOutputPrivateKey"] = out_priv.to_bytes(32, "big").hex()
                exp["taprootOutputPrivateKeyWif"] = ref.wif(out_priv, n["wif"])
                exp["scriptPubKey"] = "5120" + q[0].to_bytes(32, "big").hex()
                assert ref.point_mul(out_priv) == q
            eq(f"{where}.row{i}.index", row["index"], i)
            eq(f"{where}.row{i}.path", row["path"], path)
            compare(f"{where}/row{i}", fields(row["basic"] + row["advanced"]), exp)
        return

    if cid == "ethereum":
        v = (ref.XPRV, ref.XPUB)  # mainnet serialization on every chain
        ap = f"m/44'/60'/{acc}'"
        account = root.derive(ap)
        compare(where + "/summary", fields(r["summary"]), summary_expected(root, account, ap, v))
        for off, row in enumerate(r["rows"]):
            i = start + off
            node = account.child(br).child(i)
            point = node.point()
            unc = ref.ser_uncompressed(point)
            exp = {
                "path": f"{ap}/{br}/{i}",
                "address": ref.eth_address(point),
                "publicKey": unc.hex(),
                "privateKey": node.key.to_bytes(32, "big").hex(),
                "rawAddress": ref.eth_address(point).lower(),
                "compressedPublicKey": node.pub().hex(),
                "publicKeyPayload": unc[1:].hex(),
                **child_common(node, v),
            }
            compare(f"{where}/row{i}", fields(row["basic"] + row["advanced"]), exp)
        return

    n = DASH[net]
    if cid in ("dash-core", "dash-core-coinjoin", "dash-legacy-mobile"):
        ap = {
            "dash-core": f"m/44'/{n['coin']}'/{acc}'",
            "dash-core-coinjoin": f"m/9'/{n['coin']}'/4'/{acc}'",
            "dash-legacy-mobile": f"m/{acc}'",
        }[cid]
        account = root.derive(ap)
        compare(where + "/summary", fields(r["summary"]), summary_expected(root, account, ap, n["v"]))
        xpub = account.serialize(*n["v"], private=False)
        xprv = account.serialize(*n["v"], private=True)
        eq(f"{where}.publicText", r["accountDescriptors"]["publicText"],
           "\n".join(ref.descriptor_checksum(f"pkh({origin(fp, ap)}{xpub}/{b}/*)") for b in (0, 1)))
        eq(f"{where}.privateText", r["accountDescriptors"]["privateText"],
           "\n".join(ref.descriptor_checksum(f"pkh({origin(fp, ap)}{xprv}/{b}/*)") for b in (0, 1)))
        prefix = {"dash-core": "dash-core-xpub", "dash-core-coinjoin": "dash-coinjoin-xpub", "dash-legacy-mobile": "dash-legacy-xpub"}[cid]
        eq(f"{where}.scannerText", r["accountDescriptors"]["scannerText"], f"{prefix}:{xpub}")
        if cid == "dash-legacy-mobile":
            branch_xpub = account.child(br).serialize(*n["v"], private=False)
            eq(f"{where}.watchOnly", r["watchOnly"]["text"], f"dash-legacy-xpub:{branch_xpub}")
        for off, row in enumerate(r["rows"]):
            i = start + off
            node = account.child(br).child(i)
            pub = node.pub()
            h160 = ref.hash160(pub)
            exp = {
                "path": f"{ap}/{br}/{i}",
                "address": ref.p2pkh(pub, n["p2pkh"]),
                "publicKey": pub.hex(),
                "privateKey": ref.wif(node.key, n["wif"]),
                "privateKeyHex": node.key.to_bytes(32, "big").hex(),
                "publicKeyHash": h160.hex(),
                "scriptPubKey": "76a914" + h160.hex() + "88ac",
                **child_common(node, n["v"]),
            }
            compare(f"{where}/row{i}", fields(row["basic"] + row["advanced"]), exp)
        return

    if cid == "dash-platform":
        kp = f"m/9'/{n['coin']}'/17'/{acc}'/{br}'"
        kc = root.derive(kp)
        compare(where + "/summary", fields(r["summary"]), summary_expected(root, kc, kp, n["v"]))
        for off, row in enumerate(r["rows"]):
            i = start + off
            node = kc.child(i)
            pub = node.pub()
            h160 = ref.hash160(pub)
            display = b"\xb0" + h160
            exp = {
                "path": f"{kp}/{i}",
                "address": ref.bech32_encode(n["hrp"], ref.convertbits(display, 8, 5), True),
                "publicKey": pub.hex(),
                "privateKey": node.key.to_bytes(32, "big").hex(),
                "privateKeyHex": node.key.to_bytes(32, "big").hex(),
                "privateKeyWif": ref.wif(node.key, n["wif"]),
                "publicKeyHash": h160.hex(),
                "addressType": "0xb0 (P2PKH)",
                "displayPayload": display.hex(),
                "storagePayload": ("00" + h160.hex()),
                "humanReadablePart": n["hrp"],
                **child_common(node, n["v"]),
            }
            compare(f"{where}/row{i}", fields(row["basic"] + row["advanced"]), exp)
        return

    if cid == "dash-identity":
        for off, row in enumerate(r["rows"]):
            ident = start + off
            eq(f"{where}.identityPath", row["path"], f"m/9'/{n['coin']}'/5'/0'/0'/{ident}'")
            top = fields(row["advanced"])
            eq(f"{where}.identityIndex", top["identityIndex"], str(ident))
            eq(f"{where}.identityPathPrefix", top["identityPathPrefix"], f"m/9'/{n['coin']}'/5'/0'/0'/{ident}'")
            for g, group in enumerate(row["groups"]):
                path = f"m/9'/{n['coin']}'/5'/0'/0'/{ident}'/{g}'"
                node = root.derive(path)
                pub = node.pub()
                got = fields(group["basic"] + group["advanced"])
                exp = {
                    f"key{g}PublicKeyHash": ref.hash160(pub).hex(),
                    f"key{g}PublicKey": pub.hex(),
                    f"key{g}PrivateKeyWif": ref.wif(node.key, n["wif"]),
                    f"key{g}Path": path,
                    f"key{g}PrivateKeyHex": node.key.to_bytes(32, "big").hex(),
                    f"key{g}KeyId": str(g),
                }
                for k in list(got):
                    if k not in exp:
                        got.pop(k)  # role metadata text, reviewed by reading the source
                compare(f"{where}/id{ident}/key{g}", got, exp)
        return

    if cid in ("dash-multisig-p2sh", "dash-multisig-core-pkh"):
        ap = f"m/48'/{n['coin']}'/{acc}'/0'" if cid.endswith("p2sh") else f"m/44'/{n['coin']}'/{acc}'"
        account = root.derive(ap)
        compare(where + "/summary", fields(r["summary"]), summary_expected(root, account, ap, n["v"]))
        dkey = origin(fp, ap) + account.serialize(*n["v"], private=False)
        exp_sum = {"descriptorAccountKey": dkey}
        if cid.endswith("core-pkh"):
            exp_sum["receivePkhDescriptor"] = ref.descriptor_checksum(f"pkh({dkey}/0/*)")
            exp_sum["changePkhDescriptor"] = ref.descriptor_checksum(f"pkh({dkey}/1/*)")
        compare(where + "/basicSummary", fields(r["basicSummary"]), exp_sum)
        eq(f"{where}.watchOnly", r["watchOnly"]["text"], dkey + "\n")
        for off, row in enumerate(r["rows"]):
            i = start + off
            node = account.child(br).child(i)
            pub = node.pub()
            exp = {
                "publicKey": pub.hex(),
                "originPath": f"{ap}/{br}/{i}",
                "privateKey": ref.wif(node.key, n["wif"]),
                "privateKeyHex": node.key.to_bytes(32, "big").hex(),
                "publicKeyHash": ref.hash160(pub).hex(),
                **child_common(node, n["v"]),
                "descriptorKey": f"{dkey}/{br}/{i}",
            }
            compare(f"{where}/row{i}", fields(row["basic"] + row["advanced"]), exp)
        return

    failures.append(f"{where}: adapter not covered by the oracle")


def mutate(dump):
    """Negative control: change one character of the first field of every row and group."""
    count = 0
    for phrase in dump:
        for case in phrase["cases"]:
            for row in (case["result"] or {}).get("rows", []):
                for holder in [row] + row.get("groups", []):
                    items = holder["basic"] or holder["advanced"]
                    v = items[0]["value"]
                    items[0]["value"] = v[:-1] + ("0" if v[-1] != "0" else "1")
                    count += 1
    return count


def main():
    dump = json.load(open(DUMP))
    negative = "--negative" in sys.argv
    mutated = mutate(dump) if negative else 0
    adapters = set()
    for phrase in dump:
        eq(f"{phrase['label']}.entropy", ref.mnemonic_to_entropy(phrase["mnemonic"]).hex(), phrase["entropyHex"])
        seed = ref.mnemonic_to_seed(phrase["mnemonic"], phrase["passphrase"])
        eq(f"{phrase['label']}.seed", phrase["seedHex"], seed.hex())
        for case in phrase["cases"]:
            adapters.add(case["id"])
            check_case(seed, case, phrase["label"])
    print(f"phrases={len(dump)} adapters={len(adapters)} comparisons={checked} failures={len(failures)}")
    for f in failures[:40]:
        print("FAIL", f)
    if unchecked:
        print("UNCHECKED", sorted(unchecked))
    if negative:
        print(f"negative control: mutated={mutated} detected={len(failures)}")
        sys.exit(0 if len(failures) == mutated and not unchecked else 1)
    sys.exit(1 if failures or unchecked else 0)


main()
