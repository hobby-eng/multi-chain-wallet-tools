let mhfe = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * A rehearsal check in one worker: the recovery once, then a comparison with the page's
     * reference and, when detection found no length, with the one the page gives next, without the
     * rounds again ([`RecoveredForCheck`]). Only whether each matches comes out; freed or dropped,
     * it wipes the recovered state.
     */
    class CheckSession {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            CheckSessionFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_checksession_free(ptr, 0);
        }
        /**
         * Compares the recovery with a reference given as for [`CheckSession::new`], as JSON
         * `{"matches": bool, "path": string | null, "evidence": {...}}`: only whether it matches
         * comes out, and for a matched address the path where it was found.
         * @param {string} reference_kind
         * @param {string} reference
         * @param {string} coin
         * @param {string} path
         * @param {Uint8Array} passphrase_utf8
         * @returns {string}
         */
        compare(reference_kind, reference, coin, path, passphrase_utf8) {
            let deferred7_0;
            let deferred7_1;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(reference_kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                const ptr3 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len3 = WASM_VECTOR_LEN;
                const ptr4 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
                const len4 = WASM_VECTOR_LEN;
                wasm.checksession_compare(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
                var ptr6 = r0;
                var len6 = r1;
                if (r3) {
                    ptr6 = 0; len6 = 0;
                    throw takeObject(r2);
                }
                deferred7_0 = ptr6;
                deferred7_1 = len6;
                return getStringFromWasm0(ptr6, len6);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                wasm.__wbindgen_export4(deferred7_0, deferred7_1, 1);
            }
        }
        /**
         * Recovers `container` for a check against the reference, which is refused first, before
         * any round, when the container cannot be checked with it. The rounds are reported as
         * "recover", then once "compare". `reference_kind` is "address", "fingerprint", "words" or
         * "walletCheck" (the phrase and passphrase check of a 24-word container); see
         * [`reference_target`].
         * @param {string} container
         * @param {Uint8Array} password_utf8
         * @param {string} choice
         * @param {number} position
         * @param {number} pim
         * @param {number} memory_level
         * @param {string} reference_kind
         * @param {string} reference
         * @param {string} coin
         * @param {string} path
         * @param {Uint8Array} passphrase_utf8
         * @param {any} argon2
         * @param {Function} on_round
         */
        constructor(container, password_utf8, choice, position, pim, memory_level, reference_kind, reference, coin, path, passphrase_utf8, argon2, on_round) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                const ptr3 = passStringToWasm0(reference_kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len3 = WASM_VECTOR_LEN;
                const ptr4 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len4 = WASM_VECTOR_LEN;
                const ptr5 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len5 = WASM_VECTOR_LEN;
                const ptr6 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len6 = WASM_VECTOR_LEN;
                const ptr7 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
                const len7 = WASM_VECTOR_LEN;
                wasm.checksession_new(retptr, ptr0, len0, ptr1, len1, ptr2, len2, position, pim, memory_level, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, addHeapObject(argon2), addBorrowedObject(on_round));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                this.__wbg_ptr = r0;
                CheckSessionFinalization.register(this, this.__wbg_ptr, this);
                return this;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                heap[stack_pointer++] = undefined;
            }
        }
    }
    if (Symbol.dispose) CheckSession.prototype[Symbol.dispose] = CheckSession.prototype.free;
    exports.CheckSession = CheckSession;

    /**
     * A session of hidden wallets in one worker: one container, the main wallet's passphrase, and a
     * wallet for each new password. Nothing is listed or counted. The session ends on `close` or when
     * its worker is terminated.
     */
    class HiddenWalletSession {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            HiddenWalletSessionFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_hiddenwalletsession_free(ptr, 0);
        }
        /**
         * A session on a 24-word container, refused otherwise before any work, with the main
         * wallet's BIP39 passphrase, empty for a wallet without one. The page's Argon2 build gives its
         * known answer first, and the work area is reserved here, so SELF_CHECK_FAILED and
         * MEMORY_ALLOCATION_FAILED come now rather than at the first wallet.
         * @param {string} container
         * @param {number} pim
         * @param {number} memory_level
         * @param {Uint8Array} main_passphrase_utf8
         * @param {any} argon2
         */
        constructor(container, pim, memory_level, main_passphrase_utf8, argon2) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passArray8ToWasm0(main_passphrase_utf8, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                wasm.hiddenwalletsession_new(retptr, ptr0, len0, pim, memory_level, ptr1, len1, addHeapObject(argon2));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                this.__wbg_ptr = r0;
                HiddenWalletSessionFinalization.register(this, this.__wbg_ptr, this);
                return this;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * Opens the wallet of a new password, typed twice, with its review choice: twelve rounds,
         * reported as "recover". A password used already in this session is refused before any work
         * (PASSWORD_ALREADY_USED); one whose wallet would pass a check after it
         * (HIDDEN_WALLET_PASSES_CHECK); the session stays open after both. The page's Argon2 build
         * gives its known answer before and after the rounds (SELF_CHECK_FAILED otherwise). Returns
         * JSON `{ phrase, words, fingerprintWithoutPassphrase }`.
         * @param {Uint8Array} password_utf8
         * @param {Uint8Array} repeat_utf8
         * @param {string} choice
         * @param {number} position
         * @param {Function} on_round
         * @returns {string}
         */
        open(password_utf8, repeat_utf8, choice, position, on_round) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passArray8ToWasm0(repeat_utf8, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                wasm.hiddenwalletsession_open(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, position, addBorrowedObject(on_round));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                return takeObject(r0);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                heap[stack_pointer++] = undefined;
            }
        }
    }
    if (Symbol.dispose) HiddenWalletSession.prototype[Symbol.dispose] = HiddenWalletSession.prototype.free;
    exports.HiddenWalletSession = HiddenWalletSession;

    /**
     * A rekey in one worker: made, given the new password and settings, recovered and confirmed
     * (again on the same recovery after a refusal that allows it, and by the owner's answer where the
     * owner confirms), then sealed. A call out of this order is refused with INVALID_REQUEST, and any
     * other failure ends the rekey.
     */
    class RekeySession {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            RekeySessionFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_rekeysession_free(ptr, 0);
        }
        /**
         * Confirms the phrase again on the same recovery, without its rounds, after a refusal that
         * allows it (AUD-017-UI002): `kind`, `reference`, `coin`, `path` and `passphrase` as for
         * `recover`, with its answer whether the wallet has a BIP39 passphrase. `words` is the length
         * the owner compares, one of `ownerLengths` (INVALID_REQUEST otherwise), and 0 with every
         * other kind. Returns what `recover` returns; a refusal that allows another keeps the
         * recovery again, and any other failure ends the rekey.
         * @param {string} kind
         * @param {string} reference
         * @param {string} coin
         * @param {string} path
         * @param {Uint8Array} passphrase_utf8
         * @param {number} words
         * @param {Function} on_round
         * @returns {string}
         */
        confirmAgain(kind, reference, coin, path, passphrase_utf8, words, on_round) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                const ptr3 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len3 = WASM_VECTOR_LEN;
                const ptr4 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
                const len4 = WASM_VECTOR_LEN;
                wasm.rekeysession_confirmAgain(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, words, addBorrowedObject(on_round));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                return takeObject(r0);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                heap[stack_pointer++] = undefined;
            }
        }
        /**
         * A rekey of `container` with the old password and settings. `words` is the phrase's word
         * count, 0 to detect it (a same-length container's own length). A page tells every user
         * first that wallets other passwords open on the old container do not move to the new one,
         * so the old container, its passwords and settings are kept until their funds are moved.
         * @param {string} container
         * @param {number} words
         * @param {Uint8Array} password_utf8
         * @param {string} choice
         * @param {number} position
         * @param {number} pim
         * @param {number} memory_level
         * @param {any} argon2
         */
        constructor(container, words, password_utf8, choice, position, pim, memory_level, argon2) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                wasm.rekeysession_new(retptr, ptr0, len0, words, ptr1, len1, ptr2, len2, position, pim, memory_level, addHeapObject(argon2));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                this.__wbg_ptr = r0;
                RekeySessionFinalization.register(this, this.__wbg_ptr, this);
                return this;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * The owner's answer after comparing the shown phrase with their backup: anything but yes
         * ends the rekey (NOT_CONFIRMED_BY_OWNER) and drops the phrase.
         * @param {any} confirmed
         */
        ownerAnswer(confirmed) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.rekeysession_ownerAnswer(retptr, this.__wbg_ptr, addHeapObject(confirmed));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                if (r1) {
                    throw takeObject(r0);
                }
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * After a refused confirmation that allows another (the rekey waits for `confirmAgain`), the
         * lengths at which the owner may compare the phrase with their backup, as JSON: empty where
         * only an address or the fingerprint confirms it. After AMBIGUOUS_LENGTH the owner states one
         * of them; after LENGTH_DIFFERS it is the stated length, at which the owner is shown the
         * reading the built-in check found. null when no confirmation may follow.
         * @returns {string}
         */
        ownerLengths() {
            let deferred2_0;
            let deferred2_1;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.rekeysession_ownerLengths(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
                var ptr1 = r0;
                var len1 = r1;
                if (r3) {
                    ptr1 = 0; len1 = 0;
                    throw takeObject(r2);
                }
                deferred2_0 = ptr1;
                deferred2_1 = len1;
                return getStringFromWasm0(ptr1, len1);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
            }
        }
        /**
         * Recovers the phrase with the old password (rounds 1 to 12 of 36), confirmed by `kind`:
         * "builtInCheck", "owner", or a wallet reference as for `check` ("address" or
         * "fingerprint"); `passphrase` belongs only to a reference (INVALID_REQUEST with the others).
         * `wallet_has_passphrase` states whether the wallet has a BIP39 passphrase, for the new
         * container's keep list: true, false, or undefined or null for none given; anything else is
         * INVALID_REQUEST. Only a reference with a non-empty passphrase shows the answer, and there
         * false is refused; everywhere else it is required (see [`Rekey::recover`]). The answer holds
         * for every confirmation of the rekey. These refusals, and REFERENCE_REQUIRED for a
         * confirmation that cannot confirm a phrase of the rekey's length, come before the first
         * round; only the Argon2 build's 1 MiB known answer runs before them. Returns JSON
         * `{ ownerCheck, walletCheck }`: for "owner", the phrase to compare, and the rekey then waits
         * for `ownerAnswer`; `walletCheck` the 16-bit source check of a 24-word reading with the
         * reference's passphrase or the empty one, null for other lengths. A refusal after the
         * rounds that allows another confirmation (AMBIGUOUS_LENGTH, LENGTH_DIFFERS) keeps the
         * recovery for `confirmAgain`; `ownerLengths` then says whether the owner may give it.
         * @param {string} kind
         * @param {string} reference
         * @param {string} coin
         * @param {string} path
         * @param {Uint8Array} passphrase_utf8
         * @param {any} wallet_has_passphrase
         * @param {Function} on_round
         * @returns {string}
         */
        recover(kind, reference, coin, path, passphrase_utf8, wallet_has_passphrase, on_round) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                const ptr3 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len3 = WASM_VECTOR_LEN;
                const ptr4 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
                const len4 = WASM_VECTOR_LEN;
                wasm.rekeysession_recover(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, addHeapObject(wallet_has_passphrase), addBorrowedObject(on_round));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                if (r2) {
                    throw takeObject(r1);
                }
                return takeObject(r0);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                heap[stack_pointer++] = undefined;
            }
        }
        /**
         * Seals the confirmed phrase with the new password and settings (rounds 13 to 36) and returns
         * the result as `encrypt` does. `on_unverified` gets the container before its check.
         * @param {Function} on_round
         * @param {Function} on_unverified
         * @returns {string}
         */
        seal(on_round, on_unverified) {
            let deferred2_0;
            let deferred2_1;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.rekeysession_seal(retptr, this.__wbg_ptr, addBorrowedObject(on_round), addBorrowedObject(on_unverified));
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
                var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
                var ptr1 = r0;
                var len1 = r1;
                if (r3) {
                    ptr1 = 0; len1 = 0;
                    throw takeObject(r2);
                }
                deferred2_0 = ptr1;
                deferred2_1 = len1;
                return getStringFromWasm0(ptr1, len1);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                heap[stack_pointer++] = undefined;
                heap[stack_pointer++] = undefined;
                wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
            }
        }
        /**
         * The new password, typed twice, with its review choice, and the new settings and repair
         * words. Refused before any Argon2 work when they would give the old container again.
         * @param {Uint8Array} password_utf8
         * @param {Uint8Array} repeat_utf8
         * @param {string} choice
         * @param {number} position
         * @param {number} pim
         * @param {number} memory_level
         * @param {number} repair_word_count
         */
        setNew(password_utf8, repeat_utf8, choice, position, pim, memory_level, repair_word_count) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                const ptr0 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
                const len0 = WASM_VECTOR_LEN;
                const ptr1 = passArray8ToWasm0(repeat_utf8, wasm.__wbindgen_export);
                const len1 = WASM_VECTOR_LEN;
                const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len2 = WASM_VECTOR_LEN;
                wasm.rekeysession_setNew(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, position, pim, memory_level, repair_word_count);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                if (r1) {
                    throw takeObject(r0);
                }
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    if (Symbol.dispose) RekeySession.prototype[Symbol.dispose] = RekeySession.prototype.free;
    exports.RekeySession = RekeySession;

    /**
     * Checks a password before anything runs. The bytes are wiped afterwards.
     * @param {Uint8Array} password_utf8
     */
    function checkPassword(password_utf8) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.checkPassword(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.checkPassword = checkPassword;

    /**
     * Recovers the phrase; the container's word count selects the suite. `words` is 0 for automatic
     * detection, otherwise the chosen length, which a same-length container takes only as its own.
     * `passphrase_utf8` is the wallet's BIP39 passphrase, empty for none, for the 16-bit source
     * check, which every recovery evaluates on each 24-word reading; it is wiped afterwards. Returns
     * JSON `{ kind, candidates: [{ words, verified, status, phrase, suiteId,
     * fingerprintWithoutPassphrase, walletCheck, statedWords, otherLengths }] }`. A stated length
     * does not replace detection: a built-in check that passes takes precedence, and
     * `statedWords` then names the length stated; 24 stated words beside a check that passes
     * give "ambiguous", the checked reading first.
     * @param {string} container
     * @param {Uint8Array} password_utf8
     * @param {string} choice
     * @param {number} position
     * @param {number} pim
     * @param {number} memory_level
     * @param {number} words
     * @param {Uint8Array} passphrase_utf8
     * @param {any} argon2
     * @param {Function} on_round
     * @returns {string}
     */
    function decrypt(container, password_utf8, choice, position, pim, memory_level, words, passphrase_utf8, argon2, on_round) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len3 = WASM_VECTOR_LEN;
            wasm.decrypt(retptr, ptr0, len0, ptr1, len1, ptr2, len2, position, pim, memory_level, words, ptr3, len3, addHeapObject(argon2), addBorrowedObject(on_round));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    exports.decrypt = decrypt;

    /**
     * What an address check would search, to show before it runs: JSON `{ type, search, addresses,
     * onlyPath }`. `coin` is one of the ids of `walletParameters().coins` (INVALID_COIN otherwise);
     * `path` is empty for the standard paths. `scan_gap` 0 states the usual search, and any other
     * the first account's first `scan_gap` receiving and change addresses, as the decoy search of two
     * missing words looks for an address. The library states it ([`AddressSearch::describe`]),
     * the same call the self-check part "address-search" compares with its known answers. No coin is
     * named here: the glue carries this text, and a page for one coin carries no other coin's name.
     * @param {string} address
     * @param {string} coin
     * @param {string} path
     * @param {number} scan_gap
     * @returns {string}
     */
    function describeAddress(address, coin, path, scan_gap) {
        let deferred5_0;
        let deferred5_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.describeAddress(retptr, ptr0, len0, ptr1, len1, ptr2, len2, scan_gap);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr4 = r0;
            var len4 = r1;
            if (r3) {
                ptr4 = 0; len4 = 0;
                throw takeObject(r2);
            }
            deferred5_0 = ptr4;
            deferred5_1 = len4;
            return getStringFromWasm0(ptr4, len4);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred5_0, deferred5_1, 1);
        }
    }
    exports.describeAddress = describeAddress;

    /**
     * Reads a container and returns JSON `{ container, words, suiteId, phraseLengths,
     * builtInCheckLengths, confirmationFor, hiddenWallets, offersWalletCheck, containerFingerprint }`.
     * @param {string} container
     * @returns {string}
     */
    function describeContainer(container) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.describeContainer(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr2 = r0;
            var len2 = r1;
            if (r3) {
                ptr2 = 0; len2 = 0;
                throw takeObject(r2);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
        }
    }
    exports.describeContainer = describeContainer;

    /**
     * What a new phrase drawn with these wishes keeps, before it is drawn, as JSON `{ randomBits,
     * randomness, expectedDraws, recognisable, fixedPosition }`: the random bits it keeps, about, with
     * the wallet check's 16 taken when `wallet_check`; "full" for all 256, "ample" from 240,
     * "notRecommended" below, rated without a word never to use; the draws it is expected to take;
     * whether a chosen word lets someone who learns or guesses it rule out almost every wrong password
     * and tell the wallet from a decoy; and whether that word has a fixed position. Wishes that cannot
     * be used are refused (INVALID_WORD_WISH). The chosen words are wiped afterwards.
     * @param {Uint8Array} chosen_words_utf8
     * @param {Uint32Array} places
     * @param {string} never_use
     * @param {boolean} wallet_check
     * @returns {string}
     */
    function describeDraw(chosen_words_utf8, places, never_use, wallet_check) {
        let deferred5_0;
        let deferred5_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(chosen_words_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray32ToWasm0(places, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(never_use, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.describeDraw(retptr, ptr0, len0, ptr1, len1, ptr2, len2, wallet_check);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr4 = r0;
            var len4 = r1;
            if (r3) {
                ptr4 = 0; len4 = 0;
                throw takeObject(r2);
            }
            deferred5_0 = ptr4;
            deferred5_1 = len4;
            return getStringFromWasm0(ptr4, len4);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred5_0, deferred5_1, 1);
        }
    }
    exports.describeDraw = describeDraw;

    /**
     * Reads an original phrase, its UTF-8 bytes as the person may have typed it, and returns JSON
     * `{ phrase, words, otherLengths, containers: [{ sameLength, words, wrongWordPassesOneIn,
     * otherLengths }] }`, the phrase with every word written out, for showing back, and the
     * containers it can be encrypted into with the consequence of each; `otherLengths` at the top is
     * the 24-word container's. The bytes are wiped afterwards.
     * @param {Uint8Array} phrase_utf8
     * @returns {string}
     */
    function describePhrase(phrase_utf8) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(phrase_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.describePhrase(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.describePhrase = describePhrase;

    /**
     * Draws a new 24-word phrase from `random`, which the draw probes first and refuses when it cannot
     * be random (RANDOM_FAILED). A passphrase is typed twice: `passphrase_repeat_utf8` must be the
     * same text (PASSPHRASES_DIFFER). With `wallet_check`, it draws until the phrase passes
     * the wallet check with the passphrase, which must not be empty; that takes about 65,536 BIP39
     * seeds, and `on_draws(draws)` hears the count every 1,024 draws, a throw there stopping it
     * (CANCELLED). The phrase meets the wishes given as for [`describe_draw`], refused as it says. A
     * page may run it in several workers at once and take the first result. Returns JSON `{ phrase,
     * words, walletCheck, fingerprintWithPassphrase }`.
     * @param {Uint8Array} passphrase_utf8
     * @param {Uint8Array} passphrase_repeat_utf8
     * @param {Uint8Array} chosen_words_utf8
     * @param {Uint32Array} places
     * @param {string} never_use
     * @param {boolean} wallet_check
     * @param {any} random
     * @param {Function} on_draws
     * @returns {string}
     */
    function drawPhrase(passphrase_utf8, passphrase_repeat_utf8, chosen_words_utf8, places, never_use, wallet_check, random, on_draws) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(passphrase_repeat_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArray8ToWasm0(chosen_words_utf8, wasm.__wbindgen_export);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passArray32ToWasm0(places, wasm.__wbindgen_export);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(never_use, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len4 = WASM_VECTOR_LEN;
            wasm.drawPhrase(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, wallet_check, addHeapObject(random), addBorrowedObject(on_draws));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    exports.drawPhrase = drawPhrase;

    /**
     * Encrypts the phrase, its UTF-8 bytes `phrase_utf8`, and returns JSON `{ container, suiteId,
     * containerFingerprint, builtInCheck, otherLengths, repairWords, repairProfile, keep: [{ item,
     * ... }] }` once its check has passed: a 24-word container, or with `same_length`, which only the
     * user's own choice may set, a container as long as the 12- to 21-word phrase.
     *
     * The password is typed twice: `repeat_utf8` must be the same text (PASSWORDS_DIFFER), and
     * `choice` with `position` applies a correction or repair of its check word review ("" keeps it
     * as typed). `repair_word_count` is 0 for none, or 2, 4, 6 or 8. `wallet_has_passphrase` is
     * whether the wallet has a BIP39 passphrase, where the page knows it: true adds it to what to
     * keep, since MHFE encrypts only the phrase, and false leaves it out. Undefined or null, not
     * known, adds `{ item: "passphraseIfAny" }` in its place; anything else is INVALID_REQUEST.
     *
     * After the first twelve rounds `on_unverified({ container, containerFingerprint })` receives
     * the container, so that a page can show it, marked as not yet verified, while the check runs.
     * The repair words come only with the result, after the check has passed.
     * @param {Uint8Array} phrase_utf8
     * @param {Uint8Array} password_utf8
     * @param {Uint8Array} repeat_utf8
     * @param {string} choice
     * @param {number} position
     * @param {number} pim
     * @param {number} memory_level
     * @param {boolean} same_length
     * @param {number} repair_word_count
     * @param {any} wallet_has_passphrase
     * @param {any} argon2
     * @param {Function} on_round
     * @param {Function} on_unverified
     * @returns {string}
     */
    function encrypt(phrase_utf8, password_utf8, repeat_utf8, choice, position, pim, memory_level, same_length, repair_word_count, wallet_has_passphrase, argon2, on_round, on_unverified) {
        let deferred6_0;
        let deferred6_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(phrase_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArray8ToWasm0(repeat_utf8, wasm.__wbindgen_export);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len3 = WASM_VECTOR_LEN;
            wasm.encrypt(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, position, pim, memory_level, same_length, repair_word_count, addHeapObject(wallet_has_passphrase), addHeapObject(argon2), addBorrowedObject(on_round), addBorrowedObject(on_unverified));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr5 = r0;
            var len5 = r1;
            if (r3) {
                ptr5 = 0; len5 = 0;
                throw takeObject(r2);
            }
            deferred6_0 = ptr5;
            deferred6_1 = len5;
            return getStringFromWasm0(ptr5, len5);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred6_0, deferred6_1, 1);
        }
    }
    exports.encrypt = encrypt;

    /**
     * What a container phrase as typed is, before it is decrypted, checked or repaired, as JSON
     * `{ reading, wordCount, unreadable }`: "container" as it stands; "marked", words typed as "?"
     * with `unreadable` every word that cannot be read, from 1, for which a page asks for the repair
     * words at once; "notAContainer", a container's length but not a container, for which it offers
     * them; "wrongLength", a length no container has.
     * @param {string} written
     * @returns {string}
     */
    function inspectContainer(written) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(written, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.inspectContainer(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr2 = r0;
            var len2 = r1;
            if (r3) {
                ptr2 = 0; len2 = 0;
                throw takeObject(r2);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
        }
    }
    exports.inspectContainer = inspectContainer;

    /**
     * Makes a password. `kind` is "words", "checkWord" or "characters"; `count` the words or
     * characters, by default as many as the command-line tool makes: 5 words or 16 characters.
     * "checkWord" always makes five words and their check word and takes no count (INVALID_REQUEST),
     * as `mhfe password` refuses `--check-word` with `--words`, rather than give another size than
     * the one asked for. With `rolls_utf8` not empty, the words come from real dice, five digits from
     * 1 to 6 per word; otherwise from `random`, which the recipe probes first and refuses when it
     * cannot be random (RANDOM_FAILED). Returns JSON `{ password, bits, weak, checkWord }`, `bits` a
     * number as `passwordStrength` gives it.
     * @param {string} kind
     * @param {number | null | undefined} count
     * @param {Uint8Array} rolls_utf8
     * @param {any} random
     * @returns {string}
     */
    function makePassword(kind, count, rolls_utf8, random) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(rolls_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.makePassword(retptr, ptr0, len0, !isLikeNone(count), isLikeNone(count) ? 0 : count, ptr1, len1, addHeapObject(random));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.makePassword = makePassword;

    /**
     * The release version of the package, the same in every module: the one identity a page checks.
     * @returns {string}
     */
    function packageVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.packageVersion(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
        }
    }
    exports.packageVersion = packageVersion;

    /**
     * The fixed values of the passwords module.
     * @returns {string}
     */
    function passwordParameters() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.passwordParameters(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
    }
    exports.passwordParameters = passwordParameters;

    /**
     * The rough strength estimate of a password or passphrase, after the review choice the person
     * made (`choice` and `position` as for the long operations), so that it is of the final text.
     * Returns JSON `{ bits, weak }`.
     * @param {Uint8Array} password_utf8
     * @param {string} choice
     * @param {number} position
     * @returns {string}
     */
    function passwordStrength(password_utf8, choice, position) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.passwordStrength(retptr, ptr0, len0, ptr1, len1, position);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.passwordStrength = passwordStrength;

    /**
     * Repairs a container from its container phrase and card words as read, `?` for a word that cannot
     * be read. Returns JSON `{ container, containerFingerprint, unchanged, containerWords, cardWords,
     * changes: [{ onCard, position, read, word }] }`. A repair is never silent, and it does not show
     * that the card belongs to the container phrase, which only a rehearsal against the wallet does.
     * @param {string} written
     * @param {string} card
     * @returns {string}
     */
    function repairContainer(written, card) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(written, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(card, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.repairContainer(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.repairContainer = repairContainer;

    /**
     * The fixed values of the repair module.
     * @returns {string}
     */
    function repairParameters() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.repairParameters(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
    }
    exports.repairParameters = repairParameters;

    /**
     * The repair words of a container, as JSON `{ profile, words, repairsUnreadable, repairsWrong }`.
     * @param {string} container
     * @param {number} count
     * @returns {string}
     */
    function repairWords(container, count) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.repairWords(retptr, ptr0, len0, count);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr2 = r0;
            var len2 = r1;
            if (r3) {
                ptr2 = 0; len2 = 0;
                throw takeObject(r2);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
        }
    }
    exports.repairWords = repairWords;

    /**
     * Reviews a typed password under the check word profile, before any Argon2 work. When
     * `repeated`, `repeat_utf8` is the password typed a second time, and the two entries must be the
     * same, an empty repetition included (PASSWORDS_DIFFER), as they are compared before any
     * review. Returns JSON `{ profile, reading, correction, correctionText, offersCorrection,
     * repairsFirst, repairs: [{ position, word, typed }] }`; `reading` is
     * "notThisShape", "fits", "restorable" or "mismatch". It holds words of the password.
     * @param {Uint8Array} password_utf8
     * @param {Uint8Array} repeat_utf8
     * @param {boolean} repeated
     * @returns {string}
     */
    function reviewPassword(password_utf8, repeat_utf8, repeated) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(repeat_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.reviewPassword(retptr, ptr0, len0, ptr1, len1, repeated);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.reviewPassword = reviewPassword;

    /**
     * The candidates of a container phrase with words typed as "?", before a search: JSON
     * `{ missing, candidates, offersWalletSearch, offersOwnChecks }`, the missing words' positions
     * from 1, how many candidate containers pass the BIP39 checksum, and which searches with the
     * password the library offers for them, as the command-line tool asks it. More than two missing
     * words are refused (`TOO_MANY_MISSING_WORDS`), and words with none marked (`INVALID_REQUEST`).
     * @param {string} written
     * @returns {string}
     */
    function searchCandidates(written) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(written, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.searchCandidates(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr2 = r0;
            var len2 = r1;
            if (r3) {
                ptr2 = 0; len2 = 0;
                throw takeObject(r2);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
        }
    }
    exports.searchCandidates = searchCandidates;

    /**
     * The search for words typed as "?" with the decoy wallet, the container itself as a wallet:
     * every candidate is compared with an address (`reference_kind` "address", `coin`, `path`) or a
     * fingerprint ("fingerprint") with `passphrase_utf8`, the BIP39 passphrase used with the
     * container phrase, empty for none, without the password and without Argon2.
     * Up to two missing words; for two, an address is searched among the first `scan_gap`
     * receiving and as many change addresses of the first account, 20 being the usual gap of a
     * wallet. `on_candidates(done, count)` hears of the progress.
     * Returns JSON `{ found, container, containerFingerprint, words: [{ position, word }], path,
     * candidates }`.
     * @param {string} written
     * @param {string} reference_kind
     * @param {string} reference
     * @param {string} coin
     * @param {string} path
     * @param {Uint8Array} passphrase_utf8
     * @param {number} scan_gap
     * @param {Function} on_candidates
     * @returns {string}
     */
    function searchDecoy(written, reference_kind, reference, coin, path, passphrase_utf8, scan_gap, on_candidates) {
        let deferred8_0;
        let deferred8_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(written, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(reference_kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len4 = WASM_VECTOR_LEN;
            const ptr5 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len5 = WASM_VECTOR_LEN;
            wasm.searchDecoy(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, scan_gap, addBorrowedObject(on_candidates));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr7 = r0;
            var len7 = r1;
            if (r3) {
                ptr7 = 0; len7 = 0;
                throw takeObject(r2);
            }
            deferred8_0 = ptr7;
            deferred8_1 = len7;
            return getStringFromWasm0(ptr7, len7);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred8_0, deferred8_1, 1);
        }
    }
    exports.searchDecoy = searchDecoy;

    /**
     * The search for one word typed as "?" with the owner's wallet: every candidate is recovered
     * with the password at the settings given, a full recovery each, and compared with an address
     * or a fingerprint, or with the original seed phrase's own checks: "builtInCheck" (empty
     * reference), the built-in check of a 12- to 21-word one, and "walletCheck", which adds with its
     * BIP39 passphrase the phrase + passphrase check of a 24-word one made by `mhfe new`.
     * `on_candidates(candidate, count)` hears of each candidate as it starts, `on_round` of its
     * rounds. Returns JSON as [`search_decoy`].
     * @param {string} written
     * @param {Uint8Array} password_utf8
     * @param {string} choice
     * @param {number} position
     * @param {number} pim
     * @param {number} memory_level
     * @param {string} reference_kind
     * @param {string} reference
     * @param {string} coin
     * @param {string} path
     * @param {Uint8Array} passphrase_utf8
     * @param {any} argon2
     * @param {Function} on_candidates
     * @param {Function} on_round
     * @returns {string}
     */
    function searchWallet(written, password_utf8, choice, position, pim, memory_level, reference_kind, reference, coin, path, passphrase_utf8, argon2, on_candidates, on_round) {
        let deferred10_0;
        let deferred10_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(written, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(choice, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(reference_kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len4 = WASM_VECTOR_LEN;
            const ptr5 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len5 = WASM_VECTOR_LEN;
            const ptr6 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len6 = WASM_VECTOR_LEN;
            const ptr7 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len7 = WASM_VECTOR_LEN;
            wasm.searchWallet(retptr, ptr0, len0, ptr1, len1, ptr2, len2, position, pim, memory_level, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, addHeapObject(argon2), addBorrowedObject(on_candidates), addBorrowedObject(on_round));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr9 = r0;
            var len9 = r1;
            if (r3) {
                ptr9 = 0; len9 = 0;
                throw takeObject(r2);
            }
            deferred10_0 = ptr9;
            deferred10_1 = len9;
            return getStringFromWasm0(ptr9, len9);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred10_0, deferred10_1, 1);
        }
    }
    exports.searchWallet = searchWallet;

    /**
     * The self-check of one of the page's Argon2 builds alone at `tier`: its known answer at 1 MiB,
     * and in the full tier at 64 and 256 MiB too, where a browser that cannot give the memory makes
     * that part not available rather than failed. A page runs it for each build in turn, never two at
     * once. `skip_ids` leaves out parts checked already. Returns JSON as described at
     * [`run_self_check`].
     * @param {string} tier
     * @param {string[]} skip_ids
     * @param {any} argon2
     * @param {Function} on_start
     * @param {Function} on_result
     * @returns {string}
     */
    function selfCheckArgon2(tier, skip_ids, argon2, on_start, on_result) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(tier, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(skip_ids, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.selfCheckArgon2(retptr, ptr0, len0, ptr1, len1, addHeapObject(argon2), addBorrowedObject(on_start), addBorrowedObject(on_result));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.selfCheckArgon2 = selfCheckArgon2;

    /**
     * The self-check of the core module's parts at `tier`, "startup" or "full": the cipher's hashes
     * and rounds, the formats, the container facts and what to keep, passwords, the word list, the
     * repair words, the check word, the wallet's hashes, seeds, keys and addresses, the wallet check,
     * hidden wallets, rekey and the rehearsal check, each with a case it must refuse. With `argon2`,
     * the worker's Argon2 build, it also runs Argon2's known answer through it; without, Argon2 is
     * listed as not run. `skip_ids` leaves out parts that another module of the page has passed
     * already. Returns JSON as described at [`run_self_check`].
     * @param {string} tier
     * @param {string[]} skip_ids
     * @param {any | null | undefined} argon2
     * @param {Function} on_start
     * @param {Function} on_result
     * @returns {string}
     */
    function selfCheckCore(tier, skip_ids, argon2, on_start, on_result) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(tier, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(skip_ids, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.selfCheckCore(retptr, ptr0, len0, ptr1, len1, isLikeNone(argon2) ? 0 : addHeapObject(argon2), addBorrowedObject(on_start), addBorrowedObject(on_result));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.selfCheckCore = selfCheckCore;

    /**
     * The self-check of the passwords module at `tier`, "startup" or "full": the Unicode tables of
     * passwords, the check word, the generator and the random source, each with a case it must
     * refuse. The startup tier tries the source checks on scripted sources only; the full tier also
     * tries `random`, the page's `crypto.getRandomValues`. `skip_ids` leaves out parts that another
     * module of the page has passed already. Returns JSON as described at [`run_self_check`].
     * @param {string} tier
     * @param {string[]} skip_ids
     * @param {any} random
     * @param {Function} on_start
     * @param {Function} on_result
     * @returns {string}
     */
    function selfCheckPasswords(tier, skip_ids, random, on_start, on_result) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(tier, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(skip_ids, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.selfCheckPasswords(retptr, ptr0, len0, ptr1, len1, addHeapObject(random), addBorrowedObject(on_start), addBorrowedObject(on_result));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.selfCheckPasswords = selfCheckPasswords;

    /**
     * The self-check of the repair module at `tier`, "startup" or "full": the BIP39 word list and
     * the repair words, each with a case it must refuse. `skip_ids` leaves out parts that another
     * module of the page has passed already. Returns JSON as described at [`run_self_check`].
     * @param {string} tier
     * @param {string[]} skip_ids
     * @param {Function} on_start
     * @param {Function} on_result
     * @returns {string}
     */
    function selfCheckRepair(tier, skip_ids, on_start, on_result) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(tier, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(skip_ids, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.selfCheckRepair(retptr, ptr0, len0, ptr1, len1, addBorrowedObject(on_start), addBorrowedObject(on_result));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.selfCheckRepair = selfCheckRepair;

    /**
     * The self-check of the wallet module at `tier`, "startup" or "full": the BIP39 word list, the
     * wallet hashes, seeds, keys and address encodings, what an address check searches (the
     * statement of [`describe_address`]), the wallet check and the random source, each with a case it
     * must refuse. The startup tier tries the source checks on scripted sources only;
     * the full tier also tries `random`, the page's `crypto.getRandomValues`. `skip_ids` leaves out
     * parts that another module of the page has passed already. Returns JSON as described at
     * [`run_self_check`]; no part names a coin.
     * @param {string} tier
     * @param {string[]} skip_ids
     * @param {any} random
     * @param {Function} on_start
     * @param {Function} on_result
     * @returns {string}
     */
    function selfCheckWallet(tier, skip_ids, random, on_start, on_result) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(tier, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(skip_ids, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.selfCheckWallet(retptr, ptr0, len0, ptr1, len1, addHeapObject(random), addBorrowedObject(on_start), addBorrowedObject(on_result));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.selfCheckWallet = selfCheckWallet;

    /**
     * The self-test with the two published vectors at their full cost, PIM 0 and memory level 0: an
     * encryption of suite 3 ("encrypt", rounds 1 to 12 of 24) and a recovery of suite 4 ("recover",
     * rounds 13 to 24). It takes minutes; a page runs it only when the person asks. Returns JSON
     * `{ passed, suite3: { vector, asPublished }, suite4: { vector, asPublished }, firstWrongRound,
     * fault: { kind, round, message } | null }`.
     * @param {any} argon2
     * @param {Function} on_round
     * @returns {string}
     */
    function selfTest(argon2, on_round) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.selfTest(retptr, addHeapObject(argon2), addBorrowedObject(on_round));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
            wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
    }
    exports.selfTest = selfTest;

    /**
     * The fixed suite values and the limits of the browser build.
     * @returns {string}
     */
    function suiteParameters() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.suiteParameters(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
    }
    exports.suiteParameters = suiteParameters;

    /**
     * Whether a recovered 24-word phrase, its UTF-8 bytes, passes the wallet check with the owner's
     * BIP39 passphrase, which must not be empty (WALLET_CHECK_NEEDS_PASSPHRASE). One BIP39 seed:
     * quick. Both secrets are wiped afterwards.
     * @param {Uint8Array} phrase_utf8
     * @param {Uint8Array} passphrase_utf8
     * @returns {boolean}
     */
    function walletCheck(phrase_utf8, passphrase_utf8) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(phrase_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.walletCheck(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.walletCheck = walletCheck;

    /**
     * The master key fingerprint of a phrase, its UTF-8 bytes, with a BIP39 passphrase, which may be
     * empty, as eight hex digits. It does not reveal the phrase. Both secrets are wiped afterwards.
     * @param {Uint8Array} phrase_utf8
     * @param {Uint8Array} passphrase_utf8
     * @returns {string}
     */
    function walletFingerprint(phrase_utf8, passphrase_utf8) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(phrase_utf8, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.walletFingerprint(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr3 = r0;
            var len3 = r1;
            if (r3) {
                ptr3 = 0; len3 = 0;
                throw takeObject(r2);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.walletFingerprint = walletFingerprint;

    /**
     * The fixed values of the wallet module, with every coin an address check knows.
     * @returns {string}
     */
    function walletParameters() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletParameters(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
        }
    }
    exports.walletParameters = walletParameters;

    /**
     * The hint for `typed_utf8`, a line typed so far from `list`, "bip39" or "eff" (INVALID_REQUEST
     * otherwise), as JSON `{ hint, count, words, completion: { letters, wordEnds } }`: "nothing" when
     * no word is being typed or it is whole with no longer word after it; "count" after one letter,
     * with how many words begin with it; "words" from two letters, with the words that begin with them
     * and their count; "noWord" when none does. `completion` is what Tab adds: the letters every such
     * word has next, and whether one word is left, which then ends with a space. The line may be part
     * of a password or a seed phrase: it is wiped after use, and so is the result's buffer, which
     * tells its last letters.
     * @param {string} list
     * @param {Uint8Array} typed_utf8
     * @returns {string}
     */
    function wordHints(list, typed_utf8) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(list, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(typed_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.wordHints(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.wordHints = wordHints;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return addHeapObject(ret);
            },
            __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
                const v = getObject(arg0);
                const ret = typeof(v) === 'boolean' ? v : undefined;
                return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
            },
            __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
                const ret = getObject(arg0) === null;
                return ret;
            },
            __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
                const ret = getObject(arg0) === undefined;
                return ret;
            },
            __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
                const obj = getObject(arg1);
                const ret = typeof(obj) === 'string' ? obj : undefined;
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_apply_a910804df6e1e433: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = getObject(arg0).apply(getObject(arg1), getObject(arg2));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_call_1875a20c43a36133: function() { return handleError(function (arg0, arg1, arg2, arg3) {
                const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_derive_040190b7b9c88e4a: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
                getObject(arg0).derive(getArrayU8FromWasm0(arg1, arg2), getArrayU8FromWasm0(arg3, arg4), arg5 >>> 0, arg6 >>> 0, getArrayU8FromWasm0(arg7, arg8));
            }, arguments); },
            __wbg_fill_cd4d9542c9f02f2e: function() { return handleError(function (arg0, arg1, arg2) {
                getObject(arg0).fill(getArrayU8FromWasm0(arg1, arg2));
            }, arguments); },
            __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
                const ret = Reflect.get(getObject(arg0), getObject(arg1));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_new_ee2291f50781bf1d: function() {
                const ret = new Array();
                return addHeapObject(ret);
            },
            __wbg_push_2baf45db356cf468: function(arg0, arg1) {
                const ret = getObject(arg0).push(getObject(arg1));
                return ret;
            },
            __wbg_reserve_06f4e471942678b9: function() { return handleError(function (arg0, arg1) {
                getObject(arg0).reserve(arg1 >>> 0);
            }, arguments); },
            __wbindgen_generic_0000000000000001: function(arg0) {
                // Cast intrinsic for `F64 -> Externref`.
                const ret = arg0;
                return addHeapObject(ret);
            },
            __wbindgen_generic_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return addHeapObject(ret);
            },
            __wbindgen_object_clone_ref: function(arg0) {
                const ret = getObject(arg0);
                return addHeapObject(ret);
            },
            __wbindgen_object_drop_ref: function(arg0) {
                takeObject(arg0);
            },
        };
        return {
            __proto__: null,
            "./mhfe_bg.js": import0,
        };
    }

    const CheckSessionFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_checksession_free(ptr, 1));
    const HiddenWalletSessionFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_hiddenwalletsession_free(ptr, 1));
    const RekeySessionFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_rekeysession_free(ptr, 1));

    function addHeapObject(obj) {
        if (heap_next === heap.length) heap.push(heap.length + 1);
        const idx = heap_next;
        heap_next = heap[idx];

        heap[idx] = obj;
        return idx;
    }

    function addBorrowedObject(obj) {
        if (stack_pointer == 1) throw new Error('out of js stack');
        heap[--stack_pointer] = obj;
        return stack_pointer;
    }

    function dropObject(idx) {
        if (idx < 1028) return;
        heap[idx] = heap_next;
        heap_next = idx;
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    let cachedDataViewMemory0 = null;
    function getDataViewMemory0() {
        if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
            cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
        }
        return cachedDataViewMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint32ArrayMemory0 = null;
    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function getObject(idx) { return heap[idx]; }

    function handleError(f, args) {
        try {
            return f.apply(this, args);
        } catch (e) {
            wasm.__wbindgen_export3(addHeapObject(e));
        }
    }

    let heap = new Array(1024).fill(undefined);
    heap.push(undefined, null, true, false);

    let heap_next = heap.length;

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function passArray32ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 4, 4) >>> 0;
        getUint32ArrayMemory0().set(arg, ptr / 4);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArrayJsValueToWasm0(array, malloc) {
        const ptr = malloc(array.length * 4, 4) >>> 0;
        const mem = getDataViewMemory0();
        for (let i = 0; i < array.length; i++) {
            mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
        }
        WASM_VECTOR_LEN = array.length;
        return ptr;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    let stack_pointer = 1024;

    function takeObject(idx) {
        const ret = getObject(idx);
        dropObject(idx);
        return ret;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedDataViewMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        return wasm;
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    // Loading by URL is removed: MHFE passes the module to initSync and fetches nothing.
    function __wbg_init() {
        throw new Error('MHFE loads no files: its WebAssembly is embedded; use initSync');
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
// The bridge from the Rust core to the Emscripten build of the reference Argon2 code. It is
// joined into runtime/worker.js by scripts/build-wasm.sh, and the Node.js tests load the same file.
"use strict";

/** Argon2id output length and lane count of MHFE suite 3. */
const ARGON2_KEY_BYTES = 32;
const ARGON2_LANES = 4;
/** ARGON2_MEMORY_ALLOCATION_ERROR in vendor/phc-winner-argon2/include/argon2.h. */
const ARGON2_MEMORY_ALLOCATION_ERROR = -22;

/**
 * The object the Rust core calls once per round (see src/engine/browser.rs). `password`,
 * `salt` and `key` are views into the Rust core's memory, so the password is never copied into
 * a JavaScript array on the way.
 */
function argon2Engine(module) {
  return {
    derive(password, salt, memoryKib, passes, key) {
      // Copy password and salt into the C heap, run Argon2id, copy the key out, then overwrite
      // and free every C-heap copy. Pointers can lie above 2 GiB, hence the unsigned shift.
      const passwordPointer = module._malloc(password.length) >>> 0;
      const saltPointer = module._malloc(salt.length) >>> 0;
      const keyPointer = module._malloc(ARGON2_KEY_BYTES) >>> 0;
      try {
        if (passwordPointer === 0 || saltPointer === 0 || keyPointer === 0) {
          throw new Error("MEMORY_ALLOCATION_FAILED: the browser could not provide memory");
        }
        module.HEAPU8.set(password, passwordPointer);
        module.HEAPU8.set(salt, saltPointer);
        const code = module._argon2id_hash_raw(
          passes,
          memoryKib,
          ARGON2_LANES,
          passwordPointer,
          password.length,
          saltPointer,
          salt.length,
          keyPointer,
          ARGON2_KEY_BYTES,
        );
        if (code === ARGON2_MEMORY_ALLOCATION_ERROR) {
          throw new Error(
            "MEMORY_ALLOCATION_FAILED: the browser could not provide the Argon2 memory",
          );
        }
        if (code !== 0) {
          throw new Error(`ARGON2_FAILED: the reference code returned error ${code}`);
        }
        key.set(module.HEAPU8.subarray(keyPointer, keyPointer + ARGON2_KEY_BYTES));
      } finally {
        // Read HEAPU8 again: the call may have grown the memory, which replaces the view.
        const heap = module.HEAPU8;
        wipeAndFree(module, heap, passwordPointer, password.length);
        wipeAndFree(module, heap, saltPointer, salt.length);
        wipeAndFree(module, heap, keyPointer, ARGON2_KEY_BYTES);
      }
    },

    /** Grows the C heap to `memoryKib` once and frees it again (src/engine/browser.rs). */
    reserve(memoryKib) {
      const pointer = module._malloc(memoryKib * 1024) >>> 0;
      if (pointer === 0) {
        throw new Error(
          "MEMORY_ALLOCATION_FAILED: the browser could not provide the Argon2 memory",
        );
      }
      module._free(pointer);
    },
  };
}

function wipeAndFree(module, heap, pointer, length) {
  if (pointer !== 0) {
    heap.fill(0, pointer, pointer + length);
    module._free(pointer);
  }
}
// The worker side of the runtime the modules of the mhfe browser package share. The package's one
// worker.js is the wasm-bindgen glue of its one WebAssembly (the global `mhfe`), the Argon2 bridge,
// this file, the table of operations of each module and web/worker-start.js, joined by
// scripts/build-wasm.sh. Under the tools' Content-Security-Policy a worker may not load any further
// script, so everything arrives in that one Blob, the core's Emscripten Argon2 build in front of it
// when an operation needs Argon2.
"use strict";

/**
 * The build of this worker script, which scripts/stamp-build-id.mjs writes here and into
 * runtime/mhfe.wasm, runtime/runtime.js and each class; "development" before the build stamps it.
 */
const WORKER_BUILD_ID = "4f5000f4290fa5eb";
/** The custom section of runtime/mhfe.wasm that names its build (scripts/stamp-build-id.mjs). */
const BUILD_SECTION = "mhfe-build";
/** The detail of a part in which the WebAssembly stopped: a Rust panic or a fault of the computer. */
const STOPPED_DETAIL = "the WebAssembly stopped";

/**
 * The fields of a request or an answer that hold secrets; the worker wipes its copies. The page's
 * runtime lists the same fields (web/runtime.js), as a worker script imports nothing.
 */
const SECRET_FIELDS = [
  "phrase",
  "password",
  "passwordRepeat",
  "passphrase",
  "passphraseRepeat",
  "chosenWords",
  "newPassword",
  "newPasswordRepeat",
  "mainPassphrase",
  "rolls",
  "typed",
];

/**
 * Serves the operations of the modules: the first message initializes `bindings`, the wasm-bindgen
 * glue, with the compiled WebAssembly it carries, once its build is this script's, and the worker
 * tells the page it is ready; each message names a module and an operation, which resolves to the
 * result. An operation talks to the page through `host`: progress, other news, a question whose
 * answer it awaits, the page's random source, and the run of a self-check.
 */
function serveOperations(bindings, modules) {
  let initialized = false;
  let pendingAnswer = null;
  const host = {
    progress(round, rounds, stage) {
      self.postMessage({ type: "progress", value: { stage, round, rounds } });
    },
    post(type, value) {
      self.postMessage({ type, value });
    },
    ask(question, value) {
      return new Promise((resolve) => {
        pendingAnswer = resolve;
        self.postMessage({ type: "ask", question, value });
      });
    },
    // A view of the module's memory: getRandomValues fills it in place (at most 65,536 bytes a
    // call, far more than any draw asks for).
    random: { fill: (bytes) => self.crypto.getRandomValues(bytes) },
    /**
     * Runs a self-check binding, `run(onStart, onResult)`, and tells the page of each part as it
     * starts and ends. `outcomeOf(result)` gives a part's result as the page reads it, such as an
     * Argon2 part whose build did not start (web/core-worker.js); the report's `passed` follows.
     * When the WebAssembly stops inside a part (a trap: a Rust panic or a fault of the computer),
     * that part fails, so that the report names it instead of the worker failing; the WebAssembly
     * is not called again after that.
     */
    selfCheck(tier, run, outcomeOf = (result) => result) {
      const version = bindings.packageVersion();
      const results = [];
      let running = null;
      try {
        const report = JSON.parse(
          run(
            (id, label) => {
              running = { id, label };
              self.postMessage({ type: "componentStart", value: running });
            },
            (json) => {
              const result = outcomeOf(JSON.parse(json));
              running = null;
              results.push(result);
              self.postMessage({ type: "component", value: result });
            },
          ),
        );
        const components = report.components.map(outcomeOf);
        return {
          ...report,
          passed: components.every(({ outcome }) => outcome !== "failed"),
          components,
        };
      } catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError) || running === null) throw error;
        const stopped = { ...running, outcome: "failed", detail: STOPPED_DETAIL };
        self.postMessage({ type: "component", value: stopped });
        return { version, tier, passed: false, components: [...results, stopped] };
      }
    },
  };
  self.onmessage = async (event) => {
    const message = event.data;
    if (message?.type === "answer") {
      const resolve = pendingAnswer;
      pendingAnswer = null;
      resolve?.(message.value);
      return;
    }
    try {
      if (!initialized) {
        requireSameBuild(message.compiled);
        bindings.initSync({ module: message.compiled });
        initialized = true;
        self.postMessage({ type: "ready", buildId: WORKER_BUILD_ID });
      }
      const operation = operationOf(modules, message.module, message.operation);
      if (typeof operation !== "function") {
        throw new Error(
          `INVALID_REQUEST: unknown operation ${String(message.module)}.${String(message.operation)}`,
        );
      }
      const result = await operation(message, host);
      self.postMessage({ type: "result", result });
    } catch (error) {
      self.postMessage({ type: "error", error: describeError(error) });
    } finally {
      wipeSecrets(message);
    }
  };
}

/**
 * The operation `name` of the module `module`, or undefined. Only the tables' own entries are
 * operations: every object inherits names such as "constructor", "toString" and "__proto__" from
 * Object.prototype, which must be refused like any other unknown name, not called with the
 * request.
 */
function operationOf(modules, module, name) {
  const table = Object.hasOwn(modules, module) ? modules[module] : undefined;
  return table !== undefined && Object.hasOwn(table, name) ? table[name] : undefined;
}

/**
 * Refuses a WebAssembly of another build than this script before it runs: parts of different
 * builds may call each other wrongly. One without the section has not been stamped either. The
 * message starts with a word, not the file's path, since the page makes a sentence of it
 * (sentence() in web/runtime.js), which would capitalize the path.
 */
function requireSameBuild(compiled) {
  const sections = WebAssembly.Module.customSections(compiled, BUILD_SECTION);
  const build =
    sections.length === 0
      ? "development"
      : sections.map((bytes) => new TextDecoder().decode(bytes)).join("+");
  if (build !== WORKER_BUILD_ID) {
    throw packageMismatch(
      `the file runtime/mhfe.wasm is of build ${build} and runtime/worker.js of build ` +
        WORKER_BUILD_ID,
    );
  }
}

/**
 * Parts of the package that come from different builds: `what` says which, and the advice follows,
 * in the words of the page's runtime (packageMismatch() in web/runtime.js). It starts with a word,
 * not a file's path, which the page's sentence() would capitalize.
 */
function packageMismatch(what) {
  return new Error(`PACKAGE_MISMATCH: ${what}: take every file of the package from one build.`);
}

/** The Rust core has its own copies, which it wipes; these are the copies in this worker. */
function wipeSecrets(message) {
  for (const field of SECRET_FIELDS) message?.[field]?.fill?.(0);
}

/** Errors from the Rust core read "CODE: message". */
function describeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]+): (.*)$/su.exec(text);
  return match === null
    ? { code: "INTERNAL_ERROR", message: text }
    : { code: match[1], message: match[2] };
}
// The core module's operations in the package's worker: encryption, recovery, the rehearsal check,
// rekey, hidden wallets, the self-test and the self-checks. For an operation that needs Argon2, the
// core places one Emscripten build of the reference Argon2 code (argon2-mt.js or argon2-st.js) in
// front of the worker, and for a self-check on a fast-mode page both, the threaded one first;
// web/argon2-engine.js bridges it to the WebAssembly.
"use strict";

/** The parts of a self-check that run Argon2, as the core names them (src/engine). */
const argon2Parts = () => JSON.parse(mhfe.suiteParameters()).argon2Parts;
/** What an Argon2 part of a self-check adds when the threaded build did not start. */
const FALLBACK_NOTE = "the check ran the single-threaded build of the standard mode instead";

const CORE_OPERATIONS = {
  parameters: () => JSON.parse(mhfe.suiteParameters()),
  packageVersion: () => mhfe.packageVersion(),
  describePhrase: (request) => JSON.parse(mhfe.describePhrase(request.phrase)),
  describeContainer: (request) => JSON.parse(mhfe.describeContainer(request.container)),

  async encrypt(request, host) {
    const argon2 = await argon2For(request);
    return JSON.parse(
      mhfe.encrypt(
        request.phrase,
        request.password,
        request.passwordRepeat,
        request.choice,
        request.position,
        request.pim,
        request.memoryLevel,
        request.sameLength,
        request.repairWordCount,
        request.walletHasPassphrase,
        argon2,
        host.progress,
        (json) => host.post("unverified", JSON.parse(json)),
      ),
    );
  },

  async decrypt(request, host) {
    const argon2 = await argon2For(request);
    return JSON.parse(
      mhfe.decrypt(
        request.container,
        request.password,
        request.choice,
        request.position,
        request.pim,
        request.memoryLevel,
        request.words,
        request.passphrase,
        argon2,
        host.progress,
      ),
    );
  },

  /**
   * The rehearsal check: one recovery, compared with the page's reference and, when detection
   * found no length (`{ words: 0 }`) and the page asks for it, with the reference the page then
   * gives, without the rounds again.
   */
  async check(request, host) {
    const argon2 = await argon2For(request);
    const session = new mhfe.CheckSession(
      request.container,
      request.password,
      request.choice,
      request.position,
      request.pim,
      request.memoryLevel,
      request.referenceKind,
      request.reference,
      request.coin,
      request.path,
      request.passphrase,
      argon2,
      host.progress,
    );
    try {
      const compare = (reference) =>
        JSON.parse(
          session.compare(
            reference.referenceKind,
            reference.reference,
            reference.coin,
            reference.path,
            reference.passphrase,
          ),
        );
      const result = compare(request);
      if (result.matches || !request.asksLength) return result;
      const next = await host.ask("noLength", null);
      if (next === null) return result;
      try {
        return compare(next);
      } finally {
        wipeSecrets(next);
      }
    } finally {
      session.free();
    }
  },

  searchCandidates: (request) => JSON.parse(mhfe.searchCandidates(request.container)),

  searchDecoy: (request, host) =>
    JSON.parse(
      mhfe.searchDecoy(
        request.container,
        request.referenceKind,
        request.reference,
        request.coin,
        request.path,
        request.passphrase,
        request.scanGap,
        (candidate, candidates) =>
          host.post("progress", { stage: "search", candidate, candidates }),
      ),
    ),

  async searchWallet(request, host) {
    const argon2 = await argon2For(request);
    let candidate = 0;
    let candidates = 0;
    return JSON.parse(
      mhfe.searchWallet(
        request.container,
        request.password,
        request.choice,
        request.position,
        request.pim,
        request.memoryLevel,
        request.referenceKind,
        request.reference,
        request.coin,
        request.path,
        request.passphrase,
        argon2,
        (index, count) => {
          candidate = index;
          candidates = count;
        },
        (round, rounds) =>
          host.post("progress", { stage: "search", candidate, candidates, round, rounds }),
      ),
    );
  },

  async selfTest(request, host) {
    const argon2 = await argon2For(request);
    return JSON.parse(mhfe.selfTest(argon2, host.progress));
  },

  /**
   * The core's self-check, through the Argon2 build in front of the worker when `request.argon2`
   * is true (see argon2ForCheck), with the core's fixed values, which the page compares with its
   * own limits.
   */
  async selfCheck(request, host) {
    const start = request.argon2 ? await argon2ForCheck(request) : null;
    const parameters = JSON.parse(mhfe.suiteParameters());
    const report = host.selfCheck(
      request.tier,
      (onStart, onResult) =>
        mhfe.selfCheckCore(request.tier, request.skip, start?.argon2, onStart, onResult),
      (result) => (start === null ? result : start.outcomeOf(result)),
    );
    return { ...report, parameters };
  },

  /** The self-check of the Argon2 build in front of the worker alone. */
  async selfCheckArgon2(request, host) {
    const start = await argon2ForCheck(request);
    return host.selfCheck(
      request.tier,
      (onStart, onResult) =>
        mhfe.selfCheckArgon2(request.tier, request.skip, start.argon2, onStart, onResult),
      (result) => start.outcomeOf(result),
    );
  },

  /**
   * A rekey in its order: the old container and password, the new password and settings, the
   * recovery and its confirmation (again on the same recovery after a refusal that allows it,
   * when the page gives another), the owner's answer where the owner confirms the phrase, then
   * the seal.
   */
  async rekey(request, host) {
    const argon2 = await argon2For(request);
    const session = new mhfe.RekeySession(
      request.container,
      request.words,
      request.password,
      request.choice,
      request.position,
      request.pim,
      request.memoryLevel,
      argon2,
    );
    try {
      session.setNew(
        request.newPassword,
        request.newPasswordRepeat,
        request.newChoice,
        request.newPosition,
        request.newPim,
        request.newMemoryLevel,
        request.repairWordCount,
      );
      const recovered = await recoverConfirmed(session, request, host);
      if (recovered.ownerCheck !== null) {
        const confirmed = await host.ask("ownerCheck", recovered.ownerCheck);
        session.ownerAnswer(confirmed === true);
      }
      const sealed = JSON.parse(
        session.seal(host.progress, (json) => host.post("unverified", JSON.parse(json))),
      );
      // The 16-bit source check of the recovered 24-word reading, reported beside the result.
      return { ...sealed, walletCheck: recovered.walletCheck };
    } finally {
      session.free();
    }
  },

  /**
   * A session of hidden wallets: ready once the Argon2 work area is reserved, then one wallet for
   * each password the page sends, until it sends `{ close: true }`. A documented refusal leaves
   * the session open; any other error ends it.
   */
  async hiddenWallets(request, host) {
    const argon2 = await argon2For(request);
    const session = new mhfe.HiddenWalletSession(
      request.container,
      request.pim,
      request.memoryLevel,
      request.mainPassphrase,
      argon2,
    );
    try {
      const keepsSessionOpen = new Set(JSON.parse(mhfe.suiteParameters()).hiddenWalletRefusals);
      let next = await host.ask("ready", null);
      while (next !== null && next?.close !== true) {
        let reply;
        try {
          const wallet = JSON.parse(
            session.open(
              next.password,
              next.passwordRepeat,
              next.choice,
              next.position,
              host.progress,
            ),
          );
          reply = ["opened", wallet];
        } catch (error) {
          const refusal = describeError(error);
          // The library says which refusals leave the session open for another password.
          if (!keepsSessionOpen.has(refusal.code)) throw error;
          reply = ["refused", refusal];
        } finally {
          wipeSecrets(next);
        }
        next = await host.ask(...reply);
      }
      return { closed: true };
    } finally {
      session.free();
    }
  },
};

/**
 * A rekey's recovery and confirmation. When a confirmation is refused after the rounds and the
 * core allows another on the same recovery (its ownerLengths), the page is asked for one, if it
 * gives them (`request.confirmsAgain`), and it is confirmed without the rounds again; null from
 * the page, or no answer asked for, ends the rekey with the refusal.
 */
async function recoverConfirmed(session, request, host) {
  let confirm = () =>
    session.recover(
      request.confirmKind,
      request.reference,
      request.coin,
      request.path,
      request.passphrase,
      request.walletHasPassphrase,
      host.progress,
    );
  for (;;) {
    let refusal;
    try {
      return JSON.parse(confirm());
    } catch (error) {
      refusal = error;
    }
    const ownerLengths = JSON.parse(session.ownerLengths());
    if (ownerLengths === null || !request.confirmsAgain) throw refusal;
    const next = await host.ask("confirmAgain", { ...describeError(refusal), ownerLengths });
    if (next === null) throw refusal;
    confirm = () => {
      try {
        return session.confirmAgain(
          next.confirmKind,
          next.reference,
          next.coin,
          next.path,
          next.passphrase,
          next.words,
          host.progress,
        );
      } finally {
        wipeSecrets(next);
      }
    };
  }
}

/** The Argon2 bridge over the Emscripten build placed in front of this file; see startArgon2. */
async function argon2For(request) {
  const builds = argon2Builds();
  const build = builds.threaded.create === undefined ? builds.singleThreaded : builds.threaded;
  return argon2Engine(await startArgon2(build, request.argon2Script));
}

/**
 * The Argon2 bridge of a self-check, and how its parts read once the start of the builds is known.
 * A build that does not start gave no wrong answer: a browser may refuse its memory or its lane
 * workers, and an operation then gets its own error. So, on a fast-mode page whose threaded build
 * does not start, the check runs the single-threaded build of the standard mode, which the page
 * placed in front too, and its Argon2 parts say so; when no build starts, the bridge refuses
 * every call with the causes, and those parts are not available rather than failed. A wrong
 * answer of a build that started stays a failure, and parts of different builds stay an error
 * (PACKAGE_MISMATCH).
 */
async function argon2ForCheck(request) {
  const builds = argon2Builds();
  const tried = [builds.threaded, builds.singleThreaded].filter(({ create }) => create);
  if (tried.length === 0) throw noArgon2Build();
  const failures = [];
  for (const build of tried) {
    try {
      const argon2 = argon2Engine(await startArgon2(build, request.argon2Script));
      return { argon2, outcomeOf: (result) => afterFallback(result, failures) };
    } catch (error) {
      const { code, message } = describeError(error);
      if (code === "PACKAGE_MISMATCH") throw error;
      failures.push(`the ${build.name} Argon2 build did not start: ${message}`);
    }
  }
  const refuse = () => {
    throw new Error(failures.join("; "));
  };
  return {
    argon2: { derive: refuse, reserve: refuse },
    outcomeOf: (result) =>
      argon2Parts().includes(result.id) && result.outcome === "failed"
        ? { ...result, outcome: "notAvailable" }
        : result,
  };
}

/**
 * A part of a self-check whose Argon2 build started after the threaded one did not, `failures`
 * naming why: it passes with a warning that says so, and its failure, a wrong answer, says so too.
 */
function afterFallback(result, failures) {
  if (failures.length === 0 || !argon2Parts().includes(result.id)) return result;
  const note = `${failures.join("; ")}; ${FALLBACK_NOTE}`;
  if (result.outcome === "passed") return { ...result, outcome: "warning", detail: note };
  return { ...result, detail: `${note}; ${result.detail}` };
}

/**
 * The Emscripten builds of the reference Argon2 code that may be placed in front of this file:
 * the factory each defines, and its build, which scripts/stamp-build-id.mjs stamps into it. A
 * build that is not in front leaves its names undefined, hence typeof.
 */
function argon2Builds() {
  return {
    threaded: {
      name: "threaded",
      file: "core/argon2-mt.js",
      create: typeof createArgon2Mt === "function" ? createArgon2Mt : undefined,
      buildId:
        typeof ARGON2_THREADED_BUILD_ID === "string" ? ARGON2_THREADED_BUILD_ID : "development",
    },
    singleThreaded: {
      name: "single-threaded",
      file: "core/argon2-st.js",
      create: typeof createArgon2St === "function" ? createArgon2St : undefined,
      buildId:
        typeof ARGON2_SINGLE_THREADED_BUILD_ID === "string"
          ? ARGON2_SINGLE_THREADED_BUILD_ID
          : "development",
    },
  };
}

/**
 * Starts one of the Argon2 builds of argon2Builds(), once it is known to be of this worker's
 * build: an Argon2 build of another build is refused before it runs (PACKAGE_MISMATCH).
 */
function startArgon2(build, threadedScript) {
  if (build.create === undefined) throw noArgon2Build();
  if (build.buildId !== WORKER_BUILD_ID) {
    throw packageMismatch(
      `the file ${build.file} is of build ${build.buildId} and runtime/worker.js of build ` +
        WORKER_BUILD_ID,
    );
  }
  if (build.name === "threaded") {
    // Without cross-origin isolation the threaded build cannot share its memory with its lane
    // workers, and its start-up would wait forever instead of failing, so refuse it here.
    if (self.crossOriginIsolated !== true) {
      throw new Error(
        "INTERNAL_ERROR: the page is not cross-origin isolated, so the build cannot share its " +
          "memory with its lane workers",
      );
    }
    // The lane workers run this same Argon2 script, which the CSP allows only from a Blob.
    return build.create({ mainScriptUrlOrBlob: threadedScript });
  }
  return build.create();
}

function noArgon2Build() {
  return new Error("INTERNAL_ERROR: this operation needs an Argon2 build in front of the worker");
}
// The repair module's operations in the package's worker, with its self-check.
"use strict";

const REPAIR_OPERATIONS = {
  parameters: () => JSON.parse(mhfe.repairParameters()),
  packageVersion: () => mhfe.packageVersion(),
  selfCheck: (request, host) =>
    host.selfCheck(request.tier, (onStart, onResult) =>
      mhfe.selfCheckRepair(request.tier, request.skip, onStart, onResult),
    ),
  repairWords: (request) => JSON.parse(mhfe.repairWords(request.container, request.count)),
  repairContainer: (request) => JSON.parse(mhfe.repairContainer(request.container, request.card)),
  inspectContainer: (request) => JSON.parse(mhfe.inspectContainer(request.container)),
};
// The passwords module's operations in the package's worker, with its self-check, whose full tier
// tries the worker's crypto.getRandomValues too.
"use strict";

const PASSWORD_OPERATIONS = {
  parameters: () => JSON.parse(mhfe.passwordParameters()),
  packageVersion: () => mhfe.packageVersion(),
  selfCheck: (request, host) =>
    host.selfCheck(request.tier, (onStart, onResult) =>
      mhfe.selfCheckPasswords(request.tier, request.skip, host.random, onStart, onResult),
    ),
  review: (request) =>
    JSON.parse(mhfe.reviewPassword(request.password, request.passwordRepeat, request.repeated)),
  strength: (request) =>
    JSON.parse(mhfe.passwordStrength(request.password, request.choice, request.position)),
  make: (request, host) =>
    JSON.parse(mhfe.makePassword(request.kind, request.count, request.rolls, host.random)),
  wordHints: (request) => JSON.parse(mhfe.wordHints("eff", request.typed)),
};
// The wallet module's operations in the package's worker, with its self-check, whose full tier
// tries the worker's crypto.getRandomValues too.
"use strict";

const WALLET_OPERATIONS = {
  parameters: () => JSON.parse(mhfe.walletParameters()),
  packageVersion: () => mhfe.packageVersion(),
  selfCheck: (request, host) =>
    host.selfCheck(request.tier, (onStart, onResult) =>
      mhfe.selfCheckWallet(request.tier, request.skip, host.random, onStart, onResult),
    ),
  walletCheck: (request) => mhfe.walletCheck(request.phrase, request.passphrase),
  fingerprint: (request) => mhfe.walletFingerprint(request.phrase, request.passphrase),
  describeAddress: (request) =>
    JSON.parse(
      mhfe.describeAddress(request.address, request.coin, request.path, request.scanGap ?? 0),
    ),
  wordHints: (request) => JSON.parse(mhfe.wordHints("bip39", request.typed)),
  describeDraw: (request) =>
    JSON.parse(
      mhfe.describeDraw(
        request.chosenWords,
        Uint32Array.from(request.places),
        request.neverUse,
        request.walletCheck,
      ),
    ),
  drawPhrase: (request, host) =>
    JSON.parse(
      mhfe.drawPhrase(
        request.passphrase,
        request.passphraseRepeat,
        request.chosenWords,
        Uint32Array.from(request.places),
        request.neverUse,
        request.walletCheck,
        host.random,
        (draws) => host.post("draws", draws),
      ),
    ),
};
// The end of the package's worker: it serves the operations of every module, by module and name.
"use strict";

serveOperations(mhfe, {
  core: CORE_OPERATIONS,
  repair: REPAIR_OPERATIONS,
  passwords: PASSWORD_OPERATIONS,
  wallet: WALLET_OPERATIONS,
});
