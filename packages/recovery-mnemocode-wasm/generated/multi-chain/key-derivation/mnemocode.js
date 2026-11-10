/* @ts-self-types="./mnemocode.d.ts" */

/**
 * What a written backup was found to be.
 */
export class BackupFinding {
    static __wrap(ptr) {
        const obj = Object.create(BackupFinding.prototype);
        obj.__wbg_ptr = ptr;
        BackupFindingFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BackupFindingFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_backupfinding_free(ptr, 0);
    }
    /**
     * The verdict's line.
     * @returns {string}
     */
    get message() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.backupfinding_message(retptr, this.__wbg_ptr);
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
    /**
     * What was left out on the way, one line each.
     * @returns {string[]}
     */
    get notes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.backupfinding_notes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The places of the finding, from 1.
     * @returns {Uint32Array}
     */
    get places() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.backupfinding_places(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * "restores", "differs", "unreadable" or "unchecked".
     * @returns {string}
     */
    get verdict() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.backupfinding_verdict(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) BackupFinding.prototype[Symbol.dispose] = BackupFinding.prototype.free;

/**
 * One design of this file.
 */
export class CardDesign {
    static __wrap(ptr) {
        const obj = Object.create(CardDesign.prototype);
        obj.__wbg_ptr = ptr;
        CardDesignFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CardDesignFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_carddesign_free(ptr, 0);
    }
    /**
     * What it draws.
     * @returns {string}
     */
    get description() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddesign_description(retptr, this.__wbg_ptr);
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
    /**
     * Whether it draws separate cards as well as sheets.
     * @returns {boolean}
     */
    get drawsSeparateCards() {
        const ret = wasm.carddesign_drawsSeparateCards(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Its id, as a page names it.
     * @returns {string}
     */
    get id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddesign_id(retptr, this.__wbg_ptr);
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
    /**
     * Its name.
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddesign_name(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) CardDesign.prototype[Symbol.dispose] = CardDesign.prototype.free;

/**
 * Drawn documents, each a PDF or images of its pages when a page asks for them.
 */
export class CardDocuments {
    static __wrap(ptr) {
        const obj = Object.create(CardDocuments.prototype);
        obj.__wbg_ptr = ptr;
        CardDocumentsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CardDocumentsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_carddocuments_free(ptr, 0);
    }
    /**
     * How many documents there are.
     * @returns {number}
     */
    get count() {
        const ret = wasm.carddocuments_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The page `page` of the document at `at`, as an image in `format`: png or jpg.
     * @param {number} at
     * @param {number} page
     * @param {string} format
     * @returns {Uint8Array}
     */
    image(at, page, format) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(format, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.carddocuments_image(retptr, this.__wbg_ptr, at, page, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v2 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The name of the document at `at`.
     * @param {number} at
     * @returns {string}
     */
    name(at) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddocuments_name(retptr, this.__wbg_ptr, at);
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
     * How many pages the document at `at` has.
     * @param {number} at
     * @returns {number}
     */
    pageCount(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddocuments_pageCount(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The document at `at` as a PDF file.
     * @param {number} at
     * @returns {Uint8Array}
     */
    pdf(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carddocuments_pdf(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) CardDocuments.prototype[Symbol.dispose] = CardDocuments.prototype.free;

/**
 * The page, the design and the details of the cards of one export, all public; what is left out is
 * invented with the browser's randomness when the cards are planned.
 */
export class CardExport {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CardExportFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cardexport_free(ptr, 0);
    }
    /**
     * The cards of the backup `codes`, written in the form `form` and masked in `mode`, planned
     * once for every file of the export, so that each shows the same cards.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @returns {CardPlan}
     */
    backup(codes, form, mode) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cardexport_backup(retptr, this.__wbg_ptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CardPlan.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The cards of the design `template`, on the page `page_size` turned to `orientation`, each
     * the default where it is left out, with a QR code on a sheet where `card_qr` says so. A size
     * or a turn of none is refused here.
     * @param {string | null | undefined} template
     * @param {string | null | undefined} page_size
     * @param {string | null | undefined} orientation
     * @param {boolean} card_qr
     */
    constructor(template, page_size, orientation, card_qr) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            var ptr0 = isLikeNone(template) ? 0 : passStringToWasm0(template, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(page_size) ? 0 : passStringToWasm0(page_size, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            var ptr2 = isLikeNone(orientation) ? 0 : passStringToWasm0(orientation, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len2 = WASM_VECTOR_LEN;
            wasm.cardexport_new(retptr, ptr0, len0, ptr1, len1, ptr2, len2, card_qr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            CardExportFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Sample cards of a random phrase of `words` words (0: the default), of this design or of
     * `every` design.
     * @param {number} words
     * @param {boolean} every
     * @returns {CardDocuments}
     */
    preview(words, every) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cardexport_preview(retptr, this.__wbg_ptr, words, every);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CardDocuments.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The `value` of the person's detail `field`: name, role, company, email, phone, website or
     * location.
     * @param {string} field
     * @param {string} value
     */
    setDetail(field, value) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(field, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(value, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.cardexport_setDetail(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
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
     * Choose a contact in the sheet QR and the exact backup record in its filler bytes.
     * @param {boolean} enabled
     */
    setHiddenQr(enabled) {
        wasm.cardexport_setHiddenQr(this.__wbg_ptr, enabled);
    }
    /**
     * The text `part` of the design: studioName, slogan, subtitle, footer or referenceLabel; "-"
     * hides its line.
     * @param {string} part
     * @param {string} value
     */
    setText(part, value) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(part, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(value, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.cardexport_setText(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
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
     * The title of the sheet, in place of the studio name.
     * @param {string} title
     */
    setTitle(title) {
        const ptr0 = passStringToWasm0(title, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.cardexport_setTitle(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * The cards of `records`, shares as written, in `format` and the layout `layout`, the
     * default where it is left out.
     * @param {any[]} records
     * @param {any} format
     * @param {any} layout
     * @returns {ShareCards}
     */
    shares(records, format, layout) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(records, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.cardexport_shares(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(format), addHeapObject(layout));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ShareCards.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Takes the details left out from `session`, so that this export repeats what it chose.
     * @param {CardSession} session
     */
    useSession(session) {
        _assertClass(session, CardSession);
        wasm.cardexport_useSession(this.__wbg_ptr, session.__wbg_ptr);
    }
}
if (Symbol.dispose) CardExport.prototype[Symbol.dispose] = CardExport.prototype.free;

/**
 * The cards of a backup, planned once: its sheets and its separate cards show the same cards.
 */
export class CardPlan {
    static __wrap(ptr) {
        const obj = Object.create(CardPlan.prototype);
        obj.__wbg_ptr = ptr;
        CardPlanFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CardPlanFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cardplan_free(ptr, 0);
    }
    /**
     * The separate cards: a document for each.
     * @returns {CardDocuments}
     */
    separate() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cardplan_separate(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CardDocuments.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The sheets: one document.
     * @returns {CardDocuments}
     */
    sheets() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cardplan_sheets(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CardDocuments.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) CardPlan.prototype[Symbol.dispose] = CardPlan.prototype.free;

/**
 * The details that a working session invented: one person, and one employer for each sector, kept
 * across exports until the page frees it.
 */
export class CardSession {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CardSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cardsession_free(ptr, 0);
    }
    /**
     * A session with nothing chosen yet.
     */
    constructor() {
        const ret = wasm.cardsession_new();
        this.__wbg_ptr = ret;
        CardSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) CardSession.prototype[Symbol.dispose] = CardSession.prototype.free;

/**
 * The phrases that decoded codes give.
 */
export class DecodedBackup {
    static __wrap(ptr) {
        const obj = Object.create(DecodedBackup.prototype);
        obj.__wbg_ptr = ptr;
        DecodedBackupFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecodedBackupFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decodedbackup_free(ptr, 0);
    }
    /**
     * Whether the phrase at `at` keeps the BIP39 checksum.
     * @param {number} at
     * @returns {boolean}
     */
    checksumValid(at) {
        const ret = wasm.decodedbackup_checksumValid(this.__wbg_ptr, at);
        return ret !== 0;
    }
    /**
     * How many phrases: more than one only for a record with a replaced last word.
     * @returns {number}
     */
    get count() {
        const ret = wasm.decodedbackup_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The master fingerprint of the codes read as a phrase, where they are one.
     * @returns {string | undefined}
     */
    get encodedFingerprint() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.decodedbackup_encodedFingerprint(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The phrase at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    phrase(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.decodedbackup_phrase(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) DecodedBackup.prototype[Symbol.dispose] = DecodedBackup.prototype.free;

/**
 * A seed phrase encoded as a backup: its codes and its record, which hold the phrase masked or in
 * another form, and both fingerprints. The page frees it once the codes are shown or saved.
 */
export class EncodedBackup {
    static __wrap(ptr) {
        const obj = Object.create(EncodedBackup.prototype);
        obj.__wbg_ptr = ptr;
        EncodedBackupFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EncodedBackupFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_encodedbackup_free(ptr, 0);
    }
    /**
     * The codes, as the form writes them.
     * @returns {string}
     */
    codes() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.encodedbackup_codes(retptr, this.__wbg_ptr);
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
     * `phrase` encoded in `form` (its name, as `--format` takes it) with `mode` and `dates`, the
     * dates typed as a line of them (undefined: none); with `validLastWord`, the Original
     * Seedshift's checksum-valid last word. Refused as the library refuses the phrase, the dates,
     * the form and the mode, and for a phrase or dates that are not text.
     * @param {any} phrase
     * @param {any} dates
     * @param {any} form
     * @param {any} mode
     * @param {boolean} valid_last_word
     * @returns {EncodedBackup}
     */
    static encode(phrase, dates, form, mode, valid_last_word) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.encodedbackup_encode(retptr, addHeapObject(phrase), addHeapObject(dates), addHeapObject(form), addHeapObject(mode), valid_last_word);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return EncodedBackup.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The master fingerprint of the codes read as a phrase, where they are a valid BIP39 phrase;
     * undefined for the Original Seedshift's, which are one only by chance.
     * @returns {string | undefined}
     */
    encodedFingerprint() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.encodedbackup_encodedFingerprint(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the Original Seedshift's valid last word differs from the mode's own.
     * @returns {boolean}
     */
    get lastWordChanged() {
        const ret = wasm.encodedbackup_lastWordChanged(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * The master fingerprint of the original phrase, with an empty BIP39 passphrase.
     * @returns {string}
     */
    get originalFingerprint() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.encodedbackup_originalFingerprint(retptr, this.__wbg_ptr);
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
    /**
     * The MNC1 record, which names the mode and the form.
     * @returns {string}
     */
    record() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.encodedbackup_record(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) EncodedBackup.prototype[Symbol.dispose] = EncodedBackup.prototype.free;

/**
 * The way through a page to the seed phrase, told by the page, for the sheet for heirs. Its steps
 * are written with {dates}, which the sheet fills in, or leaves out where no dates are asked.
 */
export class HeirPage {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HeirPageFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_heirpage_free(ptr, 0);
    }
    /**
     * The sheet for an encoded backup of `words` words in `form`, masked in `mode` with `dates`
     * dates.
     * @param {string} form
     * @param {number} words
     * @param {string} mode
     * @param {number} dates
     * @returns {Uint8Array}
     */
    encodedSheet(form, words, mode, dates) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(form, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(mode, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.heirpage_encodedSheet(retptr, this.__wbg_ptr, ptr0, len0, words, ptr1, len1, dates);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v3 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v3;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A route: the line under the title, the one address that the sheet prints, the steps that
     * open the page, those that lead to the phrase, what to do with an unclear digit of a date,
     * and the size of the sheet, the default where it is left out.
     * @param {string} subtitle
     * @param {string} address
     * @param {string[]} start
     * @param {string[]} steps
     * @param {string | null} [date_digit_help]
     * @param {string | null} [size]
     */
    constructor(subtitle, address, start, steps, date_digit_help, size) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(subtitle, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArrayJsValueToWasm0(start, wasm.__wbindgen_export);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passArrayJsValueToWasm0(steps, wasm.__wbindgen_export);
            const len3 = WASM_VECTOR_LEN;
            var ptr4 = isLikeNone(date_digit_help) ? 0 : passStringToWasm0(date_digit_help, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len4 = WASM_VECTOR_LEN;
            var ptr5 = isLikeNone(size) ? 0 : passStringToWasm0(size, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len5 = WASM_VECTOR_LEN;
            wasm.heirpage_new(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            HeirPageFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The sheet for `count` shares in `format` of which `threshold` restore the phrase, each with
     * `codes` codes on its cards (NaN: not said).
     * @param {string} format
     * @param {number} threshold
     * @param {number} count
     * @param {number} codes
     * @param {string} mode
     * @param {number} dates
     * @returns {Uint8Array}
     */
    sharesSheet(format, threshold, count, codes, mode, dates) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(format, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(mode, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.heirpage_sharesSheet(retptr, this.__wbg_ptr, ptr0, len0, threshold, count, codes, ptr1, len1, dates);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v3 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v3;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) HeirPage.prototype[Symbol.dispose] = HeirPage.prototype.free;

/**
 * The checksum-valid phrases that an exact legacy Seedshift phrase gives, one for each last word.
 */
export class LegacyLastWords {
    static __wrap(ptr) {
        const obj = Object.create(LegacyLastWords.prototype);
        obj.__wbg_ptr = ptr;
        LegacyLastWordsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LegacyLastWordsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_legacylastwords_free(ptr, 0);
    }
    /**
     * How many there are.
     * @returns {number}
     */
    get count() {
        const ret = wasm.legacylastwords_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether the phrase at `at` keeps the entropy of the old last word.
     * @param {number} at
     * @returns {boolean}
     */
    keepsEntropy(at) {
        const ret = wasm.legacylastwords_keepsEntropy(this.__wbg_ptr, at);
        return ret !== 0;
    }
    /**
     * The phrase at `at`; none past the last.
     * @param {number} at
     * @returns {string | undefined}
     */
    phrase(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.legacylastwords_phrase(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) LegacyLastWords.prototype[Symbol.dispose] = LegacyLastWords.prototype.free;

/**
 * Codes marked with ?, with what a page says of them before it searches.
 */
export class MarkedCodes {
    static __wrap(ptr) {
        const obj = Object.create(MarkedCodes.prototype);
        obj.__wbg_ptr = ptr;
        MarkedCodesFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MarkedCodesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_markedcodes_free(ptr, 0);
    }
    /**
     * What to say where the candidates are too many to list; none where a list holds them.
     * @returns {string | undefined}
     */
    get many() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_many(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the dates of these codes are needed: they were masked.
     * @returns {boolean}
     */
    get needsDates() {
        const ret = wasm.markedcodes_needsDates(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * How the question of the ways is put.
     * @returns {string}
     */
    get question() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_question(retptr, this.__wbg_ptr);
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
    /**
     * Reads the marked `codes` in `form` and `mode`.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @returns {MarkedCodes}
     */
    static read(codes, form, mode) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_read(retptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return MarkedCodes.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What cannot be read, and how many candidates that leaves.
     * @returns {string}
     */
    get unreadable() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_unreadable(retptr, this.__wbg_ptr);
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
     * The way at `at` of those offered, in order; the search itself refuses a way that does not
     * fit.
     * @param {number} at
     * @returns {MarkedWay | undefined}
     */
    way(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_way(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 === 0 ? undefined : MarkedWay.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many ways are offered.
     * @returns {number}
     */
    get ways() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedcodes_ways(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) MarkedCodes.prototype[Symbol.dispose] = MarkedCodes.prototype.free;

/**
 * A way to tell the right codes.
 */
export class MarkedWay {
    static __wrap(ptr) {
        const obj = Object.create(MarkedWay.prototype);
        obj.__wbg_ptr = ptr;
        MarkedWayFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MarkedWayFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_markedway_free(ptr, 0);
    }
    /**
     * Its name in a list of choices.
     * @returns {string}
     */
    get label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedway_label(retptr, this.__wbg_ptr);
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
    /**
     * What it needs or does, shown beside its label.
     * @returns {string}
     */
    get note() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedway_note(retptr, this.__wbg_ptr);
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
    /**
     * Which it is: "encoded", for `markedByFingerprint`, or "wallet" or "list", for
     * `markedSearch`.
     * @returns {string}
     */
    get way() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.markedway_way(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) MarkedWay.prototype[Symbol.dispose] = MarkedWay.prototype.free;

/**
 * A candidate list read from its MNCL bytes, one candidate on request.
 */
export class OpenedCandidateList {
    static __wrap(ptr) {
        const obj = Object.create(OpenedCandidateList.prototype);
        obj.__wbg_ptr = ptr;
        OpenedCandidateListFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OpenedCandidateListFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_openedcandidatelist_free(ptr, 0);
    }
    /**
     * How many candidates it holds.
     * @returns {number}
     */
    get count() {
        const ret = wasm.openedcandidatelist_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The BIP39 passphrase that the candidate at `at` is checked with; refused past the last.
     * @param {number} at
     * @returns {string}
     */
    passphrase(at) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.openedcandidatelist_passphrase(retptr, this.__wbg_ptr, at);
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
     * Which passphrases it holds: "none", "list" (one for all) or "records" (their own).
     * @returns {string}
     */
    get passphrases() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.openedcandidatelist_passphrases(retptr, this.__wbg_ptr);
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
    /**
     * The phrase of the candidate at `at`, a whole number from 0; refused past the last.
     * @param {number} at
     * @returns {string}
     */
    phrase(at) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.openedcandidatelist_phrase(retptr, this.__wbg_ptr, at);
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
     * The list in `bytes`; refused as the library refuses a damaged or foreign list.
     * @param {Uint8Array} bytes
     * @returns {OpenedCandidateList}
     */
    static read(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.openedcandidatelist_read(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return OpenedCandidateList.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) OpenedCandidateList.prototype[Symbol.dispose] = OpenedCandidateList.prototype.free;

/**
 * The modules of a QR symbol, without its quiet zone, which a page draws itself.
 */
export class QrMatrix {
    static __wrap(ptr) {
        const obj = Object.create(QrMatrix.prototype);
        obj.__wbg_ptr = ptr;
        QrMatrixFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QrMatrixFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_qrmatrix_free(ptr, 0);
    }
    /**
     * Whether the module at `row` and `column`, each a whole number from 0, is dark: never one
     * outside the matrix.
     * @param {number} row
     * @param {number} column
     * @returns {boolean}
     */
    isDark(row, column) {
        const ret = wasm.qrmatrix_isDark(this.__wbg_ptr, row, column);
        return ret !== 0;
    }
    /**
     * The matrix of `payload` at level M, read back before it is given out.
     * @param {any} payload
     * @returns {QrMatrix}
     */
    static of(payload) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.qrmatrix_of(retptr, addHeapObject(payload));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return QrMatrix.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The modules on a side.
     * @returns {number}
     */
    get size() {
        const ret = wasm.qrmatrix_size(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) QrMatrix.prototype[Symbol.dispose] = QrMatrix.prototype.free;

/**
 * The phrase of an old backup, to be confirmed before it is encoded again.
 */
export class ReEncoding {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ReEncodingFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_reencoding_free(ptr, 0);
    }
    /**
     * The person recognises the phrase.
     */
    confirmByPerson() {
        wasm.reencoding_confirmByPerson(this.__wbg_ptr);
    }
    /**
     * Compares the phrase with the wallet of `recovery`; whether it matched, which confirms it.
     * @param {Recovery} recovery
     * @returns {boolean}
     */
    confirmByWallet(recovery) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(recovery, Recovery);
            wasm.reencoding_confirmByWallet(retptr, this.__wbg_ptr, recovery.__wbg_ptr);
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
    /**
     * What is said of the confirmation, by the way it came: fingerprint, key or address.
     * @param {any} by
     * @returns {string}
     */
    confirmationLine(by) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.reencoding_confirmationLine(retptr, this.__wbg_ptr, addHeapObject(by));
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
     * The phrase, once it is confirmed; refused before.
     * @returns {string}
     */
    confirmedPhrase() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.reencoding_confirmedPhrase(retptr, this.__wbg_ptr);
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
     * The phrase that `codes`, written in `form` and masked in `mode`, give with `dates`; for the
     * Original Seedshift with a valid last word, the one that ends with `last_word`.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @param {any} dates
     * @param {any} last_word
     */
    constructor(codes, form, mode, dates, last_word) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.reencoding_new(retptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode), addHeapObject(dates), addHeapObject(last_word));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            ReEncodingFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The phrase, for the person to recognise.
     * @returns {string}
     */
    phrase() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.reencoding_phrase(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) ReEncoding.prototype[Symbol.dispose] = ReEncoding.prototype.free;

/**
 * A backup as given, before its dates.
 */
export class ReadBackup {
    static __wrap(ptr) {
        const obj = Object.create(ReadBackup.prototype);
        obj.__wbg_ptr = ptr;
        ReadBackupFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ReadBackupFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_readbackup_free(ptr, 0);
    }
    /**
     * The codes in `form`, read as `mode` holds them, with their master fingerprint where they
     * are a valid phrase, and decoded under `dates`.
     * @param {any} form
     * @param {any} mode
     * @param {any} dates
     * @returns {DecodedBackup}
     */
    decode(form, mode, dates) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_decode(retptr, this.__wbg_ptr, addHeapObject(form), addHeapObject(mode), addHeapObject(dates));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return DecodedBackup.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What the record says against `given`.
     * @param {any} given
     * @returns {string | undefined}
     */
    formConflict(given) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_formConflict(retptr, this.__wbg_ptr, addHeapObject(given));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The forms that fit the codes, by name.
     * @param {any} given
     * @returns {string[]}
     */
    forms(given) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_forms(retptr, this.__wbg_ptr, addHeapObject(given));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the backup holds a record header.
     * @returns {boolean}
     */
    get hasRecord() {
        const ret = wasm.readbackup_hasRecord(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * The codes marked with ? in `form`, as `mode` holds them: about how many candidates they
     * leave.
     * @param {any} form
     * @param {any} mode
     * @returns {number}
     */
    markedCandidates(form, mode) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_markedCandidates(retptr, this.__wbg_ptr, addHeapObject(form), addHeapObject(mode));
            var r0 = getDataViewMemory0().getFloat64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return r0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The forms that fit codes marked with ?.
     * @param {any} given
     * @returns {string[]}
     */
    markedForms(given) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_markedForms(retptr, this.__wbg_ptr, addHeapObject(given));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether some codes are marked with ?.
     * @returns {boolean}
     */
    get marked() {
        const ret = wasm.readbackup_marked(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * What the record says against `given`.
     * @param {any} given
     * @returns {string | undefined}
     */
    modeConflict(given) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_modeConflict(retptr, this.__wbg_ptr, addHeapObject(given));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The mode the record or `given` names.
     * @param {any} given
     * @returns {string | undefined}
     */
    mode(given) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_mode(retptr, this.__wbg_ptr, addHeapObject(given));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reads `backup`, codes or a record; `share_reader` names where the page reads Shamir shares,
     * and `words` (NaN: all) says how many words the phrase has, of codes that end with decoys.
     * @param {any} backup
     * @param {boolean} seedshift_only
     * @param {any} share_reader
     * @param {number} words
     * @returns {ReadBackup}
     */
    static read(backup, seedshift_only, share_reader, words) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.readbackup_read(retptr, addHeapObject(backup), seedshift_only, addHeapObject(share_reader), words);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ReadBackup.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) ReadBackup.prototype[Symbol.dispose] = ReadBackup.prototype.free;

/**
 * The wallet that the searches compare with, if any; [`Recovery::without_wallet`], or
 * `WalletEvidence.recovery` with its BIP39 passphrase.
 */
export class Recovery {
    static __wrap(ptr) {
        const obj = Object.create(Recovery.prototype);
        obj.__wbg_ptr = ptr;
        RecoveryFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RecoveryFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_recovery_free(ptr, 0);
    }
    /**
     * The search of the forgotten digits of `dates` of the backup `codes`, read in `form` and
     * `mode`; `max_shown` and `keep` (NaN: the defaults) say what it keeps.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @param {any} dates
     * @param {number} max_shown
     * @param {number} keep
     * @returns {RecoverySearch}
     */
    dateSearch(codes, form, mode, dates, max_shown, keep) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recovery_dateSearch(retptr, this.__wbg_ptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode), addHeapObject(dates), max_shown, keep);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The search of the marked `codes` by their encoded `fingerprint`.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @param {any} fingerprint
     * @returns {RecoverySearch}
     */
    markedByFingerprint(codes, form, mode, fingerprint) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recovery_markedByFingerprint(retptr, this.__wbg_ptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode), addHeapObject(fingerprint));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The search of the marked `codes`: by the wallet with `dates`, which may hold ?, or with `list`
     * every candidate under complete `dates`, with its fingerprint.
     * @param {any} codes
     * @param {any} form
     * @param {any} mode
     * @param {any} dates
     * @param {boolean} list
     * @returns {RecoverySearch}
     */
    markedSearch(codes, form, mode, dates, list) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recovery_markedSearch(retptr, this.__wbg_ptr, addHeapObject(codes), addHeapObject(form), addHeapObject(mode), addHeapObject(dates), list);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * As [`Recovery::restore_shares`], writing damaged shares again as sskr-export does, the phrase
     * never given: each share in `format`, or in its own where it is undefined; "shares" holds
     * them, or "variants" every set that fits where nothing tells which is the person's.
     * @param {any[]} shares
     * @param {any} mode
     * @param {any} dates
     * @param {any} decode_entry
     * @param {any} format
     * @returns {RecoverySearch}
     */
    repairShares(shares, mode, dates, decode_entry, format) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(shares, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.recovery_repairShares(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(mode), addHeapObject(dates), addHeapObject(decode_entry), addHeapObject(format));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The restore of `shares` as typed, each in any form, in `mode` with `dates`, which may hold
     * ?, by the limits set. `decode_entry` names where the page reads an encoded phrase. The page
     * calls `begin`, then steps it.
     * @param {any[]} shares
     * @param {any} mode
     * @param {any} dates
     * @param {any} decode_entry
     * @returns {RecoverySearch}
     */
    restoreShares(shares, mode, dates, decode_entry) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(shares, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.recovery_restoreShares(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(mode), addHeapObject(dates), addHeapObject(decode_entry));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What a restore of shares goes by: `keep` date matches for a list, the share combinations and
     * the date combinations it tries without a question (NaN: the defaults), and whether the
     * person said yes to the long search that its question announced.
     * @param {number} keep
     * @param {number} most_tries
     * @param {number} most_dates
     * @param {boolean} confirmed
     */
    setRestoreLimits(keep, most_tries, most_dates, confirmed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recovery_setRestoreLimits(retptr, this.__wbg_ptr, keep, most_tries, most_dates, confirmed);
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
     * The searches compared with no wallet.
     * @returns {Recovery}
     */
    static withoutWallet() {
        const ret = wasm.recovery_withoutWallet();
        return Recovery.__wrap(ret);
    }
    /**
     * The search of the words `phrase` marks; with `missing`, of a word missing at any place.
     * @param {any} phrase
     * @param {boolean} missing
     * @param {number} max_shown
     * @param {number} keep
     * @returns {RecoverySearch}
     */
    wordSearch(phrase, missing, max_shown, keep) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recovery_wordSearch(retptr, this.__wbg_ptr, addHeapObject(phrase), missing, max_shown, keep);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RecoverySearch.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) Recovery.prototype[Symbol.dispose] = Recovery.prototype.free;

/**
 * A search that the page steps: it times each part of the public pace sample, asks what
 * `question` says where it must, and calls `step` until it gives false.
 */
export class RecoverySearch {
    static __wrap(ptr) {
        const obj = Object.create(RecoverySearch.prototype);
        obj.__wbg_ptr = ptr;
        RecoverySearchFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RecoverySearchFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_recoverysearch_free(ptr, 0);
    }
    /**
     * Reads the shares of a restore and settles its search, from the `seconds` each part of the
     * sample took; nothing for another search.
     * @param {Float64Array} seconds
     */
    begin(seconds) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayF64ToWasm0(seconds, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.recoverysearch_begin(retptr, this.__wbg_ptr, ptr0, len0);
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
     * What it found.
     * @returns {SearchResult}
     */
    finish() {
        try {
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recoverysearch_finish(retptr, ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return SearchResult.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many parts its public pace sample has.
     * @returns {number}
     */
    get paceParts() {
        const ret = wasm.recoverysearch_paceParts(this.__wbg_ptr);
        return ret;
    }
    /**
     * Runs part `part` of the sample, for the page to time.
     * @param {number} part
     */
    paceSample(part) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recoverysearch_paceSample(retptr, this.__wbg_ptr, part);
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
     * What is said before a date or marked-code search, from the `seconds` each part took and the
     * person's `limit` (NaN: twelve hours); none for another search.
     * @param {Float64Array} seconds
     * @param {number} limit
     * @returns {SearchQuestion | undefined}
     */
    plan(seconds, limit) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayF64ToWasm0(seconds, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.recoverysearch_plan(retptr, this.__wbg_ptr, ptr0, len0, limit);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 === 0 ? undefined : SearchQuestion.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Tries at most `work` candidates.
     * @param {number} work
     * @returns {SearchProgress}
     */
    step(work) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recoverysearch_step(retptr, this.__wbg_ptr, work);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return SearchProgress.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) RecoverySearch.prototype[Symbol.dispose] = RecoverySearch.prototype.free;

/**
 * The files of the recovery set: the word lists and the guide for reading a backup by hand.
 */
export class RecoverySet {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RecoverySetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_recoveryset_free(ptr, 0);
    }
    /**
     * The bytes of the file at `at`; none past the last.
     * @param {number} at
     * @returns {Uint8Array | undefined}
     */
    bytes(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recoveryset_bytes(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many files it holds.
     * @returns {number}
     */
    get count() {
        const ret = wasm.recoveryset_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The name of the file at `at`; none past the last.
     * @param {number} at
     * @returns {string | undefined}
     */
    name(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.recoveryset_name(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The set.
     */
    constructor() {
        const ret = wasm.recoveryset_new();
        this.__wbg_ptr = ret;
        RecoverySetFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) RecoverySet.prototype[Symbol.dispose] = RecoverySet.prototype.free;

/**
 * The phrase that shares restore, with what checked it and what a repair filled in.
 */
export class RestoredShares {
    static __wrap(ptr) {
        const obj = Object.create(RestoredShares.prototype);
        obj.__wbg_ptr = ptr;
        RestoredSharesFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RestoredSharesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_restoredshares_free(ptr, 0);
    }
    /**
     * Whether every share took part, every element is settled, and a digest checked the phrase.
     * @returns {boolean}
     */
    get checked() {
        const ret = wasm.restoredshares_checked(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Groups of the set that restore the phrase.
     * @returns {number}
     */
    get groupThreshold() {
        const ret = wasm.restoredshares_groupThreshold(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The phrase the shares hold: for a Seedshift backup, the masked phrase.
     * @returns {string}
     */
    phrase() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.restoredshares_phrase(retptr, this.__wbg_ptr);
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
    /**
     * What a repair filled in, share by share, then the notes on guesses and on correcting the
     * written copy.
     * @returns {string[]}
     */
    repairLines() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.restoredshares_repairLines(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Restores the one phrase `shares` hold, each in any form, with elements marked with ? where
     * unreadable; every share is checked against it. A repair that needs a long search, or that
     * more than one phrase passes, is refused here; the assessment of marked shares runs at once,
     * until the recovery binding steps it as a host steps a search.
     * @param {any[]} shares
     * @returns {RestoredShares}
     */
    static restore(shares) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(shares, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.restoredshares_restore(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RestoredShares.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The shares, as read or repaired, each written in its own form, in the order given.
     * @returns {string[]}
     */
    shares() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.restoredshares_shares(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The warning for shares that took no part, or for a phrase no digest checked.
     * @returns {string | undefined}
     */
    uncheckedNote() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.restoredshares_uncheckedNote(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Words of the phrase.
     * @returns {number}
     */
    get wordCount() {
        const ret = wasm.restoredshares_wordCount(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) RestoredShares.prototype[Symbol.dispose] = RestoredShares.prototype.free;

/**
 * How far a search has come.
 */
export class SearchProgress {
    static __wrap(ptr) {
        const obj = Object.create(SearchProgress.prototype);
        obj.__wbg_ptr = ptr;
        SearchProgressFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SearchProgressFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_searchprogress_free(ptr, 0);
    }
    /**
     * Tries made so far.
     * @returns {number}
     */
    get checked() {
        const ret = wasm.searchprogress_checked(this.__wbg_ptr);
        return ret;
    }
    /**
     * What passed its own check so far.
     * @returns {number}
     */
    get found() {
        const ret = wasm.searchprogress_found(this.__wbg_ptr);
        return ret;
    }
    /**
     * What the wallet matched so far.
     * @returns {number}
     */
    get matched() {
        const ret = wasm.searchprogress_matched(this.__wbg_ptr);
        return ret;
    }
    /**
     * Whether it has more to try.
     * @returns {boolean}
     */
    get running() {
        const ret = wasm.searchprogress_running(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Tries in all, where the search knows them.
     * @returns {number | undefined}
     */
    get total() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchprogress_total(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) SearchProgress.prototype[Symbol.dispose] = SearchProgress.prototype.free;

/**
 * The size of a search and what is said of it before it starts.
 */
export class SearchQuestion {
    static __wrap(ptr) {
        const obj = Object.create(SearchQuestion.prototype);
        obj.__wbg_ptr = ptr;
        SearchQuestionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SearchQuestionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_searchquestion_free(ptr, 0);
    }
    /**
     * Whether it is asked for first.
     * @returns {boolean}
     */
    get ask() {
        const ret = wasm.searchquestion_ask(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * What it tries, for a notice.
     * @returns {string}
     */
    get notice() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchquestion_notice(retptr, this.__wbg_ptr);
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
    /**
     * What to ask.
     * @returns {string}
     */
    get question() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchquestion_question(retptr, this.__wbg_ptr);
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
    /**
     * Whether its time is said.
     * @returns {boolean}
     */
    get tell() {
        const ret = wasm.searchquestion_tell(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) SearchQuestion.prototype[Symbol.dispose] = SearchQuestion.prototype.free;

/**
 * What a search found, one row for each phrase or candidate.
 */
export class SearchResult {
    static __wrap(ptr) {
        const obj = Object.create(SearchResult.prototype);
        obj.__wbg_ptr = ptr;
        SearchResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SearchResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_searchresult_free(ptr, 0);
    }
    /**
     * The candidates kept as a list's bytes for `protectList`, each with the BIP39 `passphrase`, if
     * any; none where it kept none. Refused for a passphrase longer than a list takes.
     * @param {any} passphrase
     * @returns {Uint8Array | undefined}
     */
    candidateList(passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_candidateList(retptr, this.__wbg_ptr, addHeapObject(passphrase));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The codes of the row at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    codes(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_codes(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many candidates a search counted.
     * @returns {number}
     */
    get count() {
        const ret = wasm.searchresult_count(this.__wbg_ptr);
        return ret;
    }
    /**
     * The dates of the row at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    dates(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_dates(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The fingerprint of the row at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    fingerprint(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_fingerprint(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The form that the share of the row at `at` is written in.
     * @param {number} at
     * @returns {string | undefined}
     */
    format(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_format(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What kind of result: "dates", "words", "found", "list", "none", "several", "trouble",
     * "question", "few", "phrases", "shares", "variants" or "stopped".
     * @returns {string}
     */
    get kind() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_kind(retptr, this.__wbg_ptr);
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
    /**
     * The lines of a report, said before the phrases.
     * @returns {string[]}
     */
    get lines() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_lines(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the search found more candidates than a list keeps, so that no list holds them all.
     * @returns {boolean}
     */
    get listFull() {
        const ret = wasm.searchresult_listFull(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Where the wallet matched the row at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    matchedAt(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_matchedAt(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many the wallet matched.
     * @returns {number}
     */
    get matched() {
        const ret = wasm.searchresult_matched(this.__wbg_ptr);
        return ret;
    }
    /**
     * What the result says: its trouble, its question or why nothing fits.
     * @returns {string | undefined}
     */
    get message() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_message(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The notes said with the phrases.
     * @returns {string[]}
     */
    get notes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_notes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The number of the candidate of the row at `at`, from 1, or the place of its share.
     * @param {number} at
     * @returns {number | undefined}
     */
    number(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_number(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many other sets of codes and dates give the phrase found, which no wallet tells apart.
     * @returns {number | undefined}
     */
    get others() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_others(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The phrase of the row at `at`.
     * @param {number} at
     * @returns {string | undefined}
     */
    phrase(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_phrase(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The share of the row at `at` as an SSKR UR record.
     * @param {number} at
     * @returns {string | undefined}
     */
    record(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_record(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What a repair filled in of the row at `at`, a line for each share.
     * @param {number} at
     * @returns {string[] | undefined}
     */
    repairs(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_repairs(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getArrayJsValueFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 4, 4);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many rows it holds.
     * @returns {number}
     */
    get rows() {
        const ret = wasm.searchresult_rows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Which set of "variants" the share of the row at `at` belongs to, from 0.
     * @param {number} at
     * @returns {number | undefined}
     */
    set(at) {
        const ret = wasm.searchresult_set(this.__wbg_ptr, at);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The share of the row at `at`, written again in its form.
     * @param {number} at
     * @returns {string | undefined}
     */
    share(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_share(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the page stopped the search, so that the result is partial.
     * @returns {boolean}
     */
    get stopped() {
        const ret = wasm.searchresult_stopped(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * What the wallet check said of its matches.
     * @returns {string | undefined}
     */
    get warning() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.searchresult_warning(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) SearchResult.prototype[Symbol.dispose] = SearchResult.prototype.free;

/**
 * The Discovery Scanner's one-time key for a session; only its recipient leaves the WebAssembly,
 * and `wipe()` or `free()` wipes the key.
 */
export class SessionIdentity {
    static __wrap(ptr) {
        const obj = Object.create(SessionIdentity.prototype);
        obj.__wbg_ptr = ptr;
        SessionIdentityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionIdentityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sessionidentity_free(ptr, 0);
    }
    /**
     * A new key from the browser's randomness, once the gate is open.
     * @returns {SessionIdentity}
     */
    static create() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.sessionidentity_create(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return SessionIdentity.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The candidate list in the age `file`, opened with this key; refused for a file of another
     * lock or shape, one this key does not open, a damaged one, and once the key is wiped.
     * @param {Uint8Array} file
     * @returns {Uint8Array}
     */
    decrypt(file) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(file, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.sessionidentity_decrypt(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v2 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Its recipient, age1…, which the writer of a list encrypts to; refused once wiped.
     * @returns {string}
     */
    get recipient() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.sessionidentity_recipient(retptr, this.__wbg_ptr);
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
     * Wipes the key now, as `free()` does, and leaves an object that refuses every use.
     */
    wipe() {
        wasm.sessionidentity_wipe(this.__wbg_ptr);
    }
}
if (Symbol.dispose) SessionIdentity.prototype[Symbol.dispose] = SessionIdentity.prototype.free;

/**
 * The cards of a set of shares, planned once.
 */
export class ShareCards {
    static __wrap(ptr) {
        const obj = Object.create(ShareCards.prototype);
        obj.__wbg_ptr = ptr;
        ShareCardsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ShareCardsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sharecards_free(ptr, 0);
    }
    /**
     * How many shares the set holds.
     * @returns {number}
     */
    get count() {
        const ret = wasm.sharecards_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The documents of the share at `at`, from 0.
     * @param {number} at
     * @returns {CardDocuments}
     */
    documents(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.sharecards_documents(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CardDocuments.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The QR code that the sheets of the share at `at` print, as its text; none on separate
     * cards.
     * @param {number} at
     * @returns {string | undefined}
     */
    qrPayload(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.sharecards_qrPayload(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) ShareCards.prototype[Symbol.dispose] = ShareCards.prototype.free;

/**
 * The shares of one split, each written in one form, in member order.
 */
export class SplitShares {
    static __wrap(ptr) {
        const obj = Object.create(SplitShares.prototype);
        obj.__wbg_ptr = ptr;
        SplitSharesFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SplitSharesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_splitshares_free(ptr, 0);
    }
    /**
     * The note the shares are kept with, saved as `packaging` ("file", "folder", "files",
     * "folders" or "pages").
     * @param {any} packaging
     * @returns {string}
     */
    keepingNote(packaging) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.splitshares_keepingNote(retptr, this.__wbg_ptr, addHeapObject(packaging));
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
     * The shares, each written in the form chosen, in member order.
     * @returns {string[]}
     */
    shares() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.splitshares_shares(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * `phrase` masked in `mode` with `dates` (a typed line of them; undefined: none) and split
     * into `count` shares, `threshold` of them needed, written in `format` (a share form's name);
     * every new split is restored, each share checked, before it is given out.
     * @param {any} phrase
     * @param {any} dates
     * @param {any} mode
     * @param {number} threshold
     * @param {number} count
     * @param {any} format
     * @returns {SplitShares}
     */
    static split(phrase, dates, mode, threshold, count, format) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.splitshares_split(retptr, addHeapObject(phrase), addHeapObject(dates), addHeapObject(mode), threshold, count, addHeapObject(format));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return SplitShares.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) SplitShares.prototype[Symbol.dispose] = SplitShares.prototype.free;

/**
 * Clean input owners for one new threshold generation; incomplete groups export no files.
 */
export class StegoCarrierSet {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoCarrierSetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegocarrierset_free(ptr, 0);
    }
    /**
     * Moves a completed analysis into the group without another file copy or
     * password stretch. Admission failure retains the analysis for the host.
     * @param {StegoJob} job
     */
    addAnalyzed(job) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(job, StegoJob);
            wasm.stegocarrierset_addAnalyzed(retptr, this.__wbg_ptr, job.__wbg_ptr);
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
     * Admits aggregate source bytes before copying this input into Rust.
     * Each member holds its share as the original message of its file.
     * @param {Uint8Array} file
     * @param {any} password
     */
    add(file, password) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(file, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.stegocarrierset_add(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(password));
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
     * Common guaranteed payload bytes after envelope overhead. No value means
     * at least one input was not analyzed; it does not mean zero capacity.
     * @param {any} selected_density
     * @returns {number | undefined}
     */
    capacityBytes(selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocarrierset_capacityBytes(retptr, this.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getFloat64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return r0 === Number.MAX_SAFE_INTEGER ? undefined : r0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Starts an empty selection of original carriers.
     * @param {any} selected_density
     */
    constructor(selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocarrierset_new(retptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            StegoCarrierSetFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Changes the requested profile without discarding admitted analyses. The
     * exact contents are checked against common capacity when `start` is called.
     * @param {any} selected_density
     */
    selectDensity(selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocarrierset_selectDensity(retptr, this.__wbg_ptr, addHeapObject(selected_density));
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
     * Consumes the inputs and contents; the core validates the requested quorum.
     * @param {StegoContent} content
     * @param {any} needed
     * @returns {StegoJob}
     */
    start(content, needed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(content, StegoContent);
            wasm.stegocarrierset_start(retptr, this.__wbg_ptr, content.__wbg_ptr, addHeapObject(needed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) StegoCarrierSet.prototype[Symbol.dispose] = StegoCarrierSet.prototype.free;

/**
 * A typed hidden message in an owning wiped buffer; `free()` releases it.
 */
export class StegoContent {
    static __wrap(ptr) {
        const obj = Object.create(StegoContent.prototype);
        obj.__wbg_ptr = ptr;
        StegoContentFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoContentFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegocontent_free(ptr, 0);
    }
    /**
     * MNC1 text for a compact backup; the host must promptly clear its JS copy.
     * @returns {string | undefined}
     */
    backupRecord() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocontent_backupRecord(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Packs an existing MNC1 backup without changing any legacy checksum bits.
     * @param {any} record
     * @returns {StegoContent}
     */
    static backup(record) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocontent_backup(retptr, addHeapObject(record));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoContent.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Required files for a threshold envelope, or zero for ordinary contents.
     * @returns {number}
     */
    filesNeeded() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocontent_filesNeeded(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Opaque bytes, or no value for a compact backup or a threshold envelope.
     * @returns {Uint8Array | undefined}
     */
    opaqueBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegocontent_opaqueBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v1;
            if (r0 !== 0) {
                v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Nonempty exact bytes, including arbitrary binary files; never normalized.
     * @param {Uint8Array} bytes
     * @returns {StegoContent}
     */
    static opaque(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.stegocontent_opaque(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoContent.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Releases the contents now; subsequent uses are refused.
     */
    wipe() {
        wasm.stegocontent_wipe(this.__wbg_ptr);
    }
}
if (Symbol.dispose) StegoContent.prototype[Symbol.dispose] = StegoContent.prototype.free;

/**
 * One carrier and normalized password: the original message's, or a decoy's or set
 * member's where the call says so. Opening finds the password's record by itself.
 */
export class StegoInput {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoInputFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegoinput_free(ptr, 0);
    }
    /**
     * Checks a proposed decoy password without consuming the input or changing either password.
     * Use only on the private creation screen. hideWithDecoy repeats core admission before
     * consuming inputs; this method is feedback, not an authorization token.
     * @param {any} decoy
     * @returns {StegoPasswordComparison}
     */
    compareDecoyPassword(decoy) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegoinput_compareDecoyPassword(retptr, this.__wbg_ptr, addHeapObject(decoy));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoPasswordComparison.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Metadata condition codes from the admitted input, before a job takes it.
     * @returns {string[]}
     */
    metadataNotices() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegoinput_metadataNotices(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The host checks aggregate file sizes before constructing a group. Its
     * other JS/Blob copies are outside the library's 512MiB managed budget.
     * @param {Uint8Array} file
     * @param {any} password
     */
    constructor(file, password) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(file, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.stegoinput_new(retptr, ptr0, len0, addHeapObject(password));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            StegoInputFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) StegoInput.prototype[Symbol.dispose] = StegoInput.prototype.free;

/**
 * An owned stepped operation. Use a worker: Argon2 is one blocking 128MiB step.
 * `free()` or `cancel()` drops all passwords and incomplete results.
 */
export class StegoJob {
    static __wrap(ptr) {
        const obj = Object.create(StegoJob.prototype);
        obj.__wbg_ptr = ptr;
        StegoJobFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoJobFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegojob_free(ptr, 0);
    }
    /**
     * Analyzes a new password for a record of `role` without searching old records:
     * undefined or "original" for the original message alone, "decoy", or
     * "original-behind-decoy". For a decoy pair, analyze both roles with their own
     * passwords and take the smaller space. On completion `status` is "analyzed" and
     * capacities become available; only an "original" analysis can `encodeAnalyzed`.
     * @param {StegoInput} input
     * @param {any} role
     * @returns {StegoJob}
     */
    static analyze(input, role) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(input, StegoInput);
            wasm.stegojob_analyze(retptr, input.__wbg_ptr, addHeapObject(role));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Copies one candidate to JS for a Blob. This alone does not verify the Blob.
     * @param {any} file_index
     * @returns {Uint8Array}
     */
    bytes(file_index) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_bytes(retptr, this.__wbg_ptr, addHeapObject(file_index));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Drops unfinished state and results; subsequent steps return "cancelled".
     */
    cancel() {
        wasm.stegojob_cancel(this.__wbg_ptr);
    }
    /**
     * Guaranteed ordinary-message bytes for this exact file, password and role.
     * Zero means no supported bucket; an unfinished or consumed analysis throws.
     * @param {any} selected_density
     * @returns {number}
     */
    capacityBytes(selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_capacityBytes(retptr, this.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reuses the analyzed key and source. A decoy-pair analysis, an invalid density or
     * insufficient space retains both owners; success consumes this analysis and the contents.
     * @param {StegoContent} content
     * @param {any} selected_density
     * @returns {StegoJob}
     */
    encodeAnalyzed(content, selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(content, StegoContent);
            wasm.stegojob_encodeAnalyzed(retptr, this.__wbg_ptr, content.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Number of fully verified candidates; none leave an incomplete group.
     * @returns {number}
     */
    get fileCount() {
        const ret = wasm.stegojob_fileCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Metadata outcomes for one verified candidate; this does not verify a saved Blob.
     * @param {any} file_index
     * @returns {string[]}
     */
    fileMetadataNotices(file_index) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_fileMetadataNotices(retptr, this.__wbg_ptr, addHeapObject(file_index));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Creates the original message and a decoy together in a clean source, at one
     * density. Passwords must pass pair admission; the decoy opens what looks like a file with
     * one record. Verify the saved bytes with each password.
     * @param {StegoInput} input
     * @param {StegoContent} content
     * @param {any} decoy_password
     * @param {StegoContent} decoy
     * @param {any} selected_density
     * @returns {StegoJob}
     */
    static hideWithDecoy(input, content, decoy_password, decoy, selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(input, StegoInput);
            _assertClass(content, StegoContent);
            _assertClass(decoy, StegoContent);
            wasm.stegojob_hideWithDecoy(retptr, input.__wbg_ptr, content.__wbg_ptr, addHeapObject(decoy_password), decoy.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Creates the original message alone in a clean source; old records are not
     * searched. The smallest fitting bucket is automatic.
     * @param {StegoInput} input
     * @param {StegoContent} content
     * @param {any} selected_density
     * @returns {StegoJob}
     */
    static hide(input, content, selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(input, StegoInput);
            _assertClass(content, StegoContent);
            wasm.stegojob_hide(retptr, input.__wbg_ptr, content.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Opens the record of this password, the original message or a decoy, without
     * telling which. No-record never means empty.
     * @param {StegoInput} input
     * @returns {StegoJob}
     */
    static open(input) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(input, StegoInput);
            wasm.stegojob_open(retptr, input.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Stable outcome or "working". Stage strings from `step()` are progress only.
     * @returns {string}
     */
    get status() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_status(retptr, this.__wbg_ptr);
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
    /**
     * Performs one bounded step; a refusal drops the working job immediately.
     * @returns {string}
     */
    step() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_step(retptr, this.__wbg_ptr);
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
     * Takes an authenticated content owner, including a threshold envelope.
     * @returns {StegoContent}
     */
    takeContent() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_takeContent(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoContent.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Guaranteed ordinary-message bytes after threshold-envelope overhead.
     * @param {any} selected_density
     * @returns {number}
     */
    thresholdCapacityBytes(selected_density) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegojob_thresholdCapacityBytes(retptr, this.__wbg_ptr, addHeapObject(selected_density));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Reopens the exact final Blob bytes with their password. Other retained
     * candidate files are counted before the ordinary saved-byte verifier starts.
     * @param {any} file_index
     * @param {Uint8Array} saved
     * @param {any} password
     * @returns {StegoJob}
     */
    verifySaved(file_index, saved, password) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(saved, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.stegojob_verifySaved(retptr, this.__wbg_ptr, addHeapObject(file_index), ptr0, len0, addHeapObject(password));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return StegoJob.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) StegoJob.prototype[Symbol.dispose] = StegoJob.prototype.free;

/**
 * Public bounds for admission before a page reads large file buffers.
 */
export class StegoParameters {
    static __wrap(ptr) {
        const obj = Object.create(StegoParameters.prototype);
        obj.__wbg_ptr = ptr;
        StegoParametersFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoParametersFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegoparameters_free(ptr, 0);
    }
    /**
     * Names of available embedding densities, least to most dense. Higher is
     * not a security guarantee; callers must request a profile explicitly.
     * @returns {string[]}
     */
    get densities() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegoparameters_densities(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Largest single input file, in bytes.
     * @returns {number}
     */
    get inputBytes() {
        const ret = wasm.stegoparameters_inputBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Fixed Argon2 workspace size, in bytes.
     * @returns {number}
     */
    get kdfMemoryBytes() {
        const ret = wasm.stegoparameters_kdfMemoryBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The browser-managed buffer budget, excluding JS copies.
     * @returns {number}
     */
    get memoryBytes() {
        const ret = wasm.stegoparameters_memoryBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Largest ordinary payload, in bytes; a carrier may hold less.
     * @returns {number}
     */
    get messageBytes() {
        const ret = wasm.stegoparameters_messageBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Payload input bytes admitted before the browser creates large buffers.
     * This is a host-memory bound, not a limit on the record representation.
     * @returns {number}
     */
    get messageInputBytes() {
        const ret = wasm.stegoparameters_messageInputBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Heuristic minimum OSA difference for new decoy pairs; not password strength.
     * @returns {number}
     */
    get passwordDifferencePercent() {
        const ret = wasm.stegoparameters_passwordDifferencePercent(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Largest raw UTF-8 password input before NFKD.
     * @returns {number}
     */
    get passwordInputBytes() {
        const ret = wasm.stegoparameters_passwordInputBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Minimum normalized UTF-8 password length, not an entropy estimate.
     * @returns {number}
     */
    get passwordMinBytes() {
        const ret = wasm.stegoparameters_passwordMinBytes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Largest primary image area, in pixels, subject to memory admission.
     * @returns {number}
     */
    get pixels() {
        const ret = wasm.stegoparameters_pixels(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) StegoParameters.prototype[Symbol.dispose] = StegoParameters.prototype.free;

/**
 * Private admission feedback, not strength. Hosts must not log or persist its fields.
 */
export class StegoPasswordComparison {
    static __wrap(ptr) {
        const obj = Object.create(StegoPasswordComparison.prototype);
        obj.__wbg_ptr = ptr;
        StegoPasswordComparisonFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoPasswordComparisonFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegopasswordcomparison_free(ptr, 0);
    }
    /**
     * Whether the full creation policy accepts the pair, including derivation checks.
     * @returns {boolean}
     */
    get accepted() {
        const ret = wasm.stegopasswordcomparison_accepted(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Scalar count of the longer normalized input, the percentage denominator.
     * @returns {number}
     */
    get comparedCharacters() {
        const ret = wasm.stegopasswordcomparison_comparedCharacters(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * OSA difference rounded down to a whole percentage, not an entropy estimate.
     * @returns {number}
     */
    get differencePercent() {
        const ret = wasm.stegopasswordcomparison_differencePercent(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Unicode-scalar OSA edits between the normalized inputs.
     * @returns {number}
     */
    get editDistance() {
        const ret = wasm.stegopasswordcomparison_editDistance(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Stable refusal code for this pair, or undefined when accepted.
     * @returns {string | undefined}
     */
    get refusalCode() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegopasswordcomparison_refusalCode(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) StegoPasswordComparison.prototype[Symbol.dispose] = StegoPasswordComparison.prototype.free;

/**
 * Authenticated records opened from separate files. Recovery rejects duplicate
 * members and mixed generations through the established threshold validator.
 */
export class StegoRecoverySet {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StegoRecoverySetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stegorecoveryset_free(ptr, 0);
    }
    /**
     * Consumes one opened threshold record in a wiped owner.
     * @param {StegoContent} content
     */
    add(content) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(content, StegoContent);
            wasm.stegorecoveryset_add(retptr, this.__wbg_ptr, content.__wbg_ptr);
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
     * Required count from the authenticated first member; zero before any input.
     * @returns {number}
     */
    filesNeeded() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegorecoveryset_filesNeeded(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Starts an empty recovery selection; add authenticated envelopes only.
     */
    constructor() {
        const ret = wasm.stegorecoveryset_new();
        this.__wbg_ptr = ret;
        StegoRecoverySetFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Compatible but insufficient inputs return no value; malformed or mixed
     * inputs and an empty selection throw a refusal. A recovered content owner must be freed promptly.
     * @returns {StegoContent | undefined}
     */
    recover() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stegorecoveryset_recover(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 === 0 ? undefined : StegoContent.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Drops every owned share and its encrypted payload.
     */
    wipe() {
        wasm.stegorecoveryset_wipe(this.__wbg_ptr);
    }
}
if (Symbol.dispose) StegoRecoverySet.prototype[Symbol.dispose] = StegoRecoverySet.prototype.free;

/**
 * A legend line read back.
 */
export class StitchLegend {
    static __wrap(ptr) {
        const obj = Object.create(StitchLegend.prototype);
        obj.__wbg_ptr = ptr;
        StitchLegendFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StitchLegendFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stitchlegend_free(ptr, 0);
    }
    /**
     * The row, from 1, that did not fit and was read as the only change of it that gives a phrase,
     * for the page to ask the person to check it; undefined where the line read as it is.
     * @returns {number | undefined}
     */
    get correctedRow() {
        const ret = wasm.stitchlegend_correctedRow(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The record of the phrase: `MNC1:seedshift:indexes:…`, which the recovery part decodes with
     * the dates, or `MNC1:direct:indexes:…` for a legend made with `--mode direct`.
     * @returns {string}
     */
    record() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchlegend_record(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) StitchLegend.prototype[Symbol.dispose] = StitchLegend.prototype.free;

/**
 * A pattern whose legend holds a phrase, and how near it looks to its picture.
 */
export class StitchPattern {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StitchPatternFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stitchpattern_free(ptr, 0);
    }
    /**
     * The stitches down.
     * @returns {number}
     */
    get height() {
        const ret = wasm.stitchpattern_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The legend as a person types it back: each row's symbol number, a colon and its stitches.
     * @returns {string}
     */
    legend() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchpattern_legend(retptr, this.__wbg_ptr);
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
     * The stitches moved to set the counts.
     * @returns {number}
     */
    get moved() {
        const ret = wasm.stitchpattern_moved(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * `phrase`, masked with `dates` (a typed line of them) by MnemoCode Seedshift, hidden in the
     * legend of a pattern of `picture`, a PNG, JPEG or WebP file, `stitchesAcross` wide (0: 200).
     * `mode`, which a page may leave out, is "seedshift" or "direct" for the phrase itself, with
     * no dates: anyone who knows the public format reads it from the legend. Refused as the
     * library refuses the mode, the phrase, the dates, the picture and the width, and where the
     * picture has too few colors to hold the phrase.
     * @param {any} phrase
     * @param {any} dates
     * @param {Uint8Array} picture
     * @param {number} stitches_across
     * @param {string | null} [mode]
     */
    constructor(phrase, dates, picture, stitches_across, mode) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(picture, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(mode) ? 0 : passStringToWasm0(mode, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            wasm.stitchpattern_new(retptr, addHeapObject(phrase), addHeapObject(dates), ptr0, len0, stitches_across, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            StitchPatternFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The pattern as a PDF dressed as a bought one: a cover, the floss key and the chart in colour,
     * for `fabric`, as `stitch --fabric` names it ("14" or "linen-28"), 14-count Aida where a page
     * leaves it out. The key page keeps the legend line, which [`read_stitch_pdf`] reads back.
     * @param {string | null} [fabric]
     * @returns {Uint8Array}
     */
    pdf(fabric) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            var ptr0 = isLikeNone(fabric) ? 0 : passStringToWasm0(fabric, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len0 = WASM_VECTOR_LEN;
            wasm.stitchpattern_pdf(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v2 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The rows of the legend.
     * @returns {number}
     */
    get rows() {
        const ret = wasm.stitchpattern_rows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * How far the pattern is from the picture, seen from a little distance: the mean CIELAB
     * difference of the two, each blurred.
     * @returns {number}
     */
    get seenDifference() {
        const ret = wasm.stitchpattern_seenDifference(this.__wbg_ptr);
        return ret;
    }
    /**
     * The stitches across.
     * @returns {number}
     */
    get width() {
        const ret = wasm.stitchpattern_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) StitchPattern.prototype[Symbol.dispose] = StitchPattern.prototype.free;

/**
 * How large a pattern of a picture may be on a fabric, as the menu offers it: the sheets from A6 to
 * A2 that hold the picture, each with the stitches it takes there, and the widths the picture
 * allows. The picture is no secret.
 */
export class StitchSizes {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StitchSizesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stitchsizes_free(ptr, 0);
    }
    /**
     * The stitches across the picture takes in the sheet at `at`; none past the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    across(at) {
        const ret = wasm.stitchsizes_across(this.__wbg_ptr, at);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The centimetres across that the stitches of the sheet at `at` take on the fabric; none past
     * the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    centimetresAcross(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchsizes_centimetresAcross(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The centimetres down that the stitches of the sheet at `at` take on the fabric; none past
     * the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    centimetresDown(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchsizes_centimetresDown(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * How many sheets hold the picture.
     * @returns {number}
     */
    get count() {
        const ret = wasm.stitchsizes_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The stitches across from which a photograph looks real, for the page to say why it selects
     * [`StitchSizes::first`].
     * @returns {number}
     */
    get detailedFrom() {
        const ret = wasm.stitchsizes_detailedFrom(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The stitches down the picture takes in the sheet at `at`; none past the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    down(at) {
        const ret = wasm.stitchsizes_down(this.__wbg_ptr, at);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The fewest stitches across the picture may have.
     * @returns {number}
     */
    get fewestAcross() {
        const ret = wasm.stitchsizes_fewestAcross(this.__wbg_ptr);
        return ret;
    }
    /**
     * The fewest centimetres across that a width typed in them may have, rounded up.
     * @returns {number}
     */
    get fewestCentimetres() {
        const ret = wasm.stitchsizes_fewestCentimetres(this.__wbg_ptr);
        return ret;
    }
    /**
     * The place of the sheet a page selects first: the smallest that gives [`DETAILED_ACROSS`]
     * stitches across, else the largest; none where no sheet holds the picture.
     * @returns {number | undefined}
     */
    get first() {
        const ret = wasm.stitchsizes_first(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The long side of the sheet at `at`, in millimetres; none past the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    longSide(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchsizes_longSide(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The most stitches across the picture may have.
     * @returns {number}
     */
    get mostAcross() {
        const ret = wasm.stitchsizes_mostAcross(this.__wbg_ptr);
        return ret;
    }
    /**
     * The most centimetres across that a width typed in them may have, rounded down.
     * @returns {number}
     */
    get mostCentimetres() {
        const ret = wasm.stitchsizes_mostCentimetres(this.__wbg_ptr);
        return ret;
    }
    /**
     * The name of the sheet at `at`, smallest first, as "A4"; none past the last.
     * @param {number} at
     * @returns {string | undefined}
     */
    name(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchsizes_name(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The sizes of `picture`, a PNG, JPEG or WebP file, on `fabric` ("14" or "linen-28"; 14-count
     * Aida where a page leaves it out). Refused as the library refuses the picture and the fabric.
     * @param {Uint8Array} picture
     * @param {string | null} [fabric]
     */
    constructor(picture, fabric) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(picture, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(fabric) ? 0 : passStringToWasm0(fabric, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            wasm.stitchsizes_new(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            StitchSizesFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The short side of the sheet at `at`, in millimetres; none past the last.
     * @param {number} at
     * @returns {number | undefined}
     */
    shortSide(at) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.stitchsizes_shortSide(retptr, this.__wbg_ptr, at);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getFloat64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : r2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The stitches across of a width of `centimetres` that a person typed; none where it is no
     * number above 0 or its stitches are not within the widths the picture allows.
     * @param {number} centimetres
     * @returns {number | undefined}
     */
    typedWidth(centimetres) {
        const ret = wasm.stitchsizes_typedWidth(this.__wbg_ptr, centimetres);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
}
if (Symbol.dispose) StitchSizes.prototype[Symbol.dispose] = StitchSizes.prototype.free;

/**
 * What shows below a line being typed, and what Tab adds to it.
 */
export class TypedHint {
    static __wrap(ptr) {
        const obj = Object.create(TypedHint.prototype);
        obj.__wbg_ptr = ptr;
        TypedHintFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypedHintFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typedhint_free(ptr, 0);
    }
    /**
     * The letters that Tab adds.
     * @returns {string}
     */
    get letters() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.typedhint_letters(retptr, this.__wbg_ptr);
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
    /**
     * How many words begin with them, or that none does, as a person reads it.
     * @returns {string | undefined}
     */
    get said() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.typedhint_said(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether one word is left, so that the word ends and a space follows.
     * @returns {boolean}
     */
    get wordEnds() {
        const ret = wasm.typedhint_wordEnds(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * The words that begin with the letters typed, in list order.
     * @returns {string[]}
     */
    get words() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.typedhint_words(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) TypedHint.prototype[Symbol.dispose] = TypedHint.prototype.free;

/**
 * What a comparison found.
 */
export class WalletCheck {
    static __wrap(ptr) {
        const obj = Object.create(WalletCheck.prototype);
        obj.__wbg_ptr = ptr;
        WalletCheckFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletCheckFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_walletcheck_free(ptr, 0);
    }
    /**
     * What the matching key gives, as the evidence writes it; undefined where nothing matched.
     * @returns {string | undefined}
     */
    get derived() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletcheck_derived(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Whether the wallet matched.
     * @returns {boolean}
     */
    get matched() {
        const ret = wasm.walletcheck_matched(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * The path of the key, m for the master key.
     * @returns {string | undefined}
     */
    get path() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletcheck_path(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * What the match is worth, for a fingerprint.
     * @returns {string | undefined}
     */
    get warning() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletcheck_warning(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1);
                wasm.__wbindgen_export4(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) WalletCheck.prototype[Symbol.dispose] = WalletCheck.prototype.free;

/**
 * The evidence of a wallet, checked when it was made.
 */
export class WalletEvidence {
    static __wrap(ptr) {
        const obj = Object.create(WalletEvidence.prototype);
        obj.__wbg_ptr = ptr;
        WalletEvidenceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletEvidenceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_walletevidence_free(ptr, 0);
    }
    /**
     * An account's extended public key at `account`, under the address profile its SLIP-132 form
     * names, or every profile for an xpub or a tpub.
     * @param {string} text
     * @param {string} network_name
     * @param {number} account
     * @returns {WalletEvidence}
     */
    static accountKey(text, network_name, account) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(network_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.walletevidence_accountKey(retptr, ptr0, len0, ptr1, len1, account);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A Bitcoin address at `place`, under the address profile its type names.
     * @param {string} text
     * @param {WalletPlace} place
     * @returns {WalletEvidence}
     */
    static bitcoinAddress(text, place) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(place, WalletPlace);
            wasm.walletevidence_bitcoinAddress(retptr, ptr0, len0, place.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The evidence compared with the keys of `phrase` and its BIP39 `passphrase` (undefined:
     * empty). Both are read inside the call, so that a freed evidence is refused before either
     * is copied.
     * @param {any} phrase
     * @param {any} passphrase
     * @returns {WalletCheck}
     */
    check(phrase, passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletevidence_check(retptr, this.__wbg_ptr, addHeapObject(phrase), addHeapObject(passphrase));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletCheck.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * An address at its place: of the coin named `coin`, or with `coin` empty, of every coin of
     * this build whose form it has, each on its own paths.
     * @param {string} coin
     * @param {string} text
     * @param {number} account
     * @param {number} branch
     * @param {number} index
     * @param {number} count
     * @returns {WalletEvidence}
     */
    static coinAddress(coin, text, account, branch, index, count) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(coin, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.walletevidence_coinAddress(retptr, ptr0, len0, ptr1, len1, account, branch, index, count);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The ids of the coins an address was read as, in the order of [`walletCoins`]; empty for
     * other evidence.
     * @returns {string[]}
     */
    get coins() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletevidence_coins(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A master fingerprint, eight hexadecimal digits.
     * @param {string} text
     * @returns {WalletEvidence}
     */
    static masterFingerprint(text) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.walletevidence_masterFingerprint(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A master extended public key of `network`, which every coin shares.
     * @param {string} text
     * @param {string} network_name
     * @returns {WalletEvidence}
     */
    static masterKey(text, network_name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(network_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            wasm.walletevidence_masterKey(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * A compressed public key at `place`, under every address profile.
     * @param {string} text
     * @param {WalletPlace} place
     * @returns {WalletEvidence}
     */
    static publicKey(text, place) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(place, WalletPlace);
            wasm.walletevidence_publicKey(retptr, ptr0, len0, place.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The searches of recovery compared with this wallet and its BIP39 `passphrase` (undefined:
     * empty).
     * @param {any} passphrase
     * @returns {Recovery}
     */
    recovery(passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletevidence_recovery(retptr, this.__wbg_ptr, addHeapObject(passphrase));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return Recovery.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * The key of a WIF, a private key, under every address profile: only its public key is
     * kept. The place crosses as a name and numbers, never as a `WalletPlace`: no class crosses
     * beside a secret.
     * @param {any} key
     * @param {any} network_name
     * @param {number} account
     * @param {number} branch
     * @param {number} index
     * @param {number} count
     * @returns {WalletEvidence}
     */
    static wif(key, network_name, account, branch, index, count) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletevidence_wif(retptr, addHeapObject(key), addHeapObject(network_name), account, branch, index, count);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalletEvidence.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) WalletEvidence.prototype[Symbol.dispose] = WalletEvidence.prototype.free;

/**
 * Where a Bitcoin key is looked for: the network, the place of the first key and how many addresses
 * from it are compared, checked when it is made. A WIF, which is secret, takes these as numbers and
 * a name instead: no class crosses beside a secret.
 */
export class WalletPlace {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletPlaceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_walletplace_free(ptr, 0);
    }
    /**
     * Its network, by name.
     * @returns {string}
     */
    get network() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walletplace_network(retptr, this.__wbg_ptr);
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
    /**
     * The place on `network`, from `account`, `branch` and `index`, compared with `count`
     * addresses (NaN: the scan's default).
     * @param {string} network_name
     * @param {number} account
     * @param {number} branch
     * @param {number} index
     * @param {number} count
     */
    constructor(network_name, account, branch, index, count) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(network_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.walletplace_new(retptr, ptr0, len0, account, branch, index, count);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0;
            WalletPlaceFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) WalletPlace.prototype[Symbol.dispose] = WalletPlace.prototype.free;

/**
 * A row of the word table.
 */
export class WordRow {
    static __wrap(ptr) {
        const obj = Object.create(WordRow.prototype);
        obj.__wbg_ptr = ptr;
        WordRowFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WordRowFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wordrow_free(ptr, 0);
    }
    /**
     * The English word.
     * @returns {string}
     */
    get english() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wordrow_english(retptr, this.__wbg_ptr);
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
    /**
     * The word number, from 1.
     * @returns {number}
     */
    get index() {
        const ret = wasm.wordrow_index(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The Unicode code.
     * @returns {string}
     */
    get unicodeHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wordrow_unicodeHex(retptr, this.__wbg_ptr);
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
}
if (Symbol.dispose) WordRow.prototype[Symbol.dispose] = WordRow.prototype.free;

/**
 * The lock of the candidate file that begins with `head`, its first 64 KiB or more: "X25519" for
 * a Scanner's key, "scrypt" for a passphrase; refused where it is no list. A page asks it before
 * it asks for a key or a passphrase.
 * @param {Uint8Array} head
 * @returns {string}
 */
export function candidateFileLock(head) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(head, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.candidateFileLock(retptr, ptr0, len0);
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

/**
 * The design at `at`, from 0; none past the last.
 * @param {number} at
 * @returns {CardDesign | undefined}
 */
export function cardDesign(at) {
    const ret = wasm.cardDesign(at);
    return ret === 0 ? undefined : CardDesign.__wrap(ret);
}

/**
 * How many designs this file holds.
 * @returns {number}
 */
export function cardDesignCount() {
    const ret = wasm.cardDesignCount();
    return ret >>> 0;
}

/**
 * The check of the backup written down as `backup` and `written_dates` against the result of
 * `phrase` in `form` and `mode` under `dates`.
 * @param {any} phrase
 * @param {any} form
 * @param {any} mode
 * @param {any} dates
 * @param {any} backup
 * @param {any} written_dates
 * @returns {BackupFinding}
 */
export function checkBackup(phrase, form, mode, dates, backup, written_dates) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.checkBackup(retptr, addHeapObject(phrase), addHeapObject(form), addHeapObject(mode), addHeapObject(dates), addHeapObject(backup), addHeapObject(written_dates));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return BackupFinding.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Refuses a candidate file of `size` bytes larger than any list's, before it is read.
 * @param {number} size
 */
export function checkCandidateFileSize(size) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.checkCandidateFileSize(retptr, size);
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
 * The check of the shares written down as `backup` against the split of `phrase` in `mode`, with
 * `threshold` shares needed; `decode_entry` names where the page reads an encoded phrase.
 * @param {any} phrase
 * @param {any} mode
 * @param {number} threshold
 * @param {any} dates
 * @param {any} decode_entry
 * @param {any} backup
 * @param {any} written_dates
 * @returns {BackupFinding}
 */
export function checkShareBackup(phrase, mode, threshold, dates, decode_entry, backup, written_dates) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.checkShareBackup(retptr, addHeapObject(phrase), addHeapObject(mode), threshold, addHeapObject(dates), addHeapObject(decode_entry), addHeapObject(backup), addHeapObject(written_dates));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return BackupFinding.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Refuses a share QR code whose `payload` holds another share than the cards print: the share of
 * `colors` or, where the cards print them, of `labels` (undefined: the colors alone).
 * @param {any} colors
 * @param {any} payload
 * @param {any} labels
 */
export function checkShareQr(colors, payload, labels) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.checkShareQr(retptr, addHeapObject(colors), addHeapObject(payload), addHeapObject(labels));
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
 * Checks metadata sizes before a page materializes File/Blob ArrayBuffers.
 * Parsed plans and actual working buffers are admitted separately by core.
 * @param {Float64Array} sizes
 */
export function checkStegoFileSizes(sizes) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(sizes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.checkStegoFileSizes(retptr, ptr0, len0);
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
 * Checks a payload File size before creating its ArrayBuffer or WASM copy.
 * @param {number} bytes
 */
export function checkStegoMessageSize(bytes) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.checkStegoMessageSize(retptr, bytes);
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
 * The candidate list in the age `file`, opened with `passphrase`.
 * @param {Uint8Array} file
 * @param {any} passphrase
 * @returns {Uint8Array}
 */
export function decryptWithPassphrase(file, passphrase) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(file, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.decryptWithPassphrase(retptr, ptr0, len0, addHeapObject(passphrase));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * A PNG with visible text for ordinary scanners and an exact hidden UTF-8 record.
 * @param {any} visible
 * @param {any} record
 * @returns {Uint8Array}
 */
export function hiddenQrPng(visible, record) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.hiddenQrPng(retptr, addHeapObject(visible), addHeapObject(record));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        var v1 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Whether `text`, given for the words of a phrase, is codes.
 * @param {any} backup
 * @returns {boolean}
 */
export function isCodes(backup) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.isCodes(retptr, addHeapObject(backup));
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

/**
 * The replacements of the last word of `phrase`, an exact legacy Seedshift phrase: the phrases, not
 * wallets, as `recover-word --legacy-valid-last-word` lists them.
 * @param {any} phrase
 * @returns {LegacyLastWords}
 */
export function legacyLastWords(phrase) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.legacyLastWords(retptr, addHeapObject(phrase));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return LegacyLastWords.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The form that typed `codes` most likely is, by its name; refused for codes that are not text.
 * @param {any} codes
 * @returns {string}
 */
export function likelyForm(codes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.likelyForm(retptr, addHeapObject(codes));
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
 * The master fingerprint of `phrase` with the BIP39 `passphrase` (undefined: empty), eight
 * hexadecimal digits.
 * @param {any} phrase
 * @param {any} passphrase
 * @returns {string}
 */
export function masterFingerprint(phrase, passphrase) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.masterFingerprint(retptr, addHeapObject(phrase), addHeapObject(passphrase));
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
 * The codes of one share on its cards in `format`, before the decoys, for the sheet for heirs;
 * none in a form without cards.
 * @param {any} record
 * @param {any} format
 * @returns {number | undefined}
 */
export function ownShareCards(record, format) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.ownShareCards(retptr, addHeapObject(record), addHeapObject(format));
        var r0 = getDataViewMemory0().getFloat64(retptr + 8 * 0, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        return r0 === Number.MAX_SAFE_INTEGER ? undefined : r0;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The file of `list` protected as `kind` says: "key" encrypts it to the Scanner's recipient in
 * `secret`, "passphrase" under the passphrase in `secret` (at least 12 characters), and "none",
 * only on the person's explicit request, leaves it in the open (`secret` undefined).
 * @param {Uint8Array} list
 * @param {any} kind
 * @param {any} secret
 * @returns {Uint8Array}
 */
export function protectList(list, kind, secret) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(list, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.protectList(retptr, ptr0, len0, addHeapObject(kind), addHeapObject(secret));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The PNG image of `payload`, 720 pixels with the quiet zone of four modules, read back first.
 * @param {any} payload
 * @returns {Uint8Array}
 */
export function qrPng(payload) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.qrPng(retptr, addHeapObject(payload));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        var v1 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * A hidden record from a PNG, refused when its format or check is invalid.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function readHiddenQrPng(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.readHiddenQrPng(retptr, ptr0, len0);
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

/**
 * The text of the QR code in the PNG file `bytes`, admitted and read as the library reads it.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function readQrPng(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.readQrPng(retptr, ptr0, len0);
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

/**
 * The legend line `line` read back; undefined where the text is no legend line, such as codes or a
 * record. Refused for a line that is no legend, or that reads as no phrase or as more than one.
 * @param {any} line
 * @returns {StitchLegend | undefined}
 */
export function readStitchLegend(line) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.readStitchLegend(retptr, addHeapObject(line));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return r0 === 0 ? undefined : StitchLegend.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The legend line that the PDF `pdf` of a pattern keeps, read back as [`read_stitch_legend`]
 * reads a typed one; undefined where the PDF keeps none, as when another program saved it again,
 * and the page asks for the legend typed from the key instead.
 * @param {Uint8Array} pdf
 * @returns {StitchLegend | undefined}
 */
export function readStitchPdf(pdf) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(pdf, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.readStitchPdf(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return r0 === 0 ? undefined : StitchLegend.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The candidates part's known answers: the startup cases, or with `full` every case, scrypt's
 * among them.
 * @param {boolean} full
 */
export function selfCheckCandidates(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckCandidates(retptr, full);
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
 * The cards' known answers: the startup cases, or with `full` every case and a sheet of each
 * family.
 * @param {boolean} full
 */
export function selfCheckCards(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckCards(retptr, full);
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
 * The embroidery part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckEmbroidery(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckEmbroidery(retptr, full);
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
 * The phrase part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckPhrase(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckPhrase(retptr, full);
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
 * The QR part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckQr(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckQr(retptr, full);
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
 * The recovery part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckRecovery(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckRecovery(retptr, full);
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
 * The shares part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckSskr(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckSskr(retptr, full);
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
 * The wallet part's known answers: the startup cases, or with `full` every case.
 * @param {boolean} full
 */
export function selfCheckWallet(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.selfCheckWallet(retptr, full);
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
 * The form `share` is written in, by its name.
 * @param {any} share
 * @returns {string}
 */
export function shareForm(share) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.shareForm(retptr, addHeapObject(share));
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
 * What the text `text` given for the codes is: "share", "either", or undefined for neither.
 * @param {any} backup
 * @returns {string | undefined}
 */
export function shareKind(backup) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.shareKind(retptr, addHeapObject(backup));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        if (r3) {
            throw takeObject(r2);
        }
        let v1;
        if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1);
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
        }
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Reads bounds without constructing a secret or loading a carrier.
 * @returns {StegoParameters}
 */
export function stegoParameters() {
    const ret = wasm.stegoParameters();
    return StegoParameters.__wrap(ret);
}

/**
 * Runs the feature's startup cases, or includes its full Argon2 reference.
 * @param {boolean} full
 */
export function stegoSelfCheck(full) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.stegoSelfCheck(retptr, full);
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
 * The ids of the coins this build holds.
 * @returns {string[]}
 */
export function walletCoins() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.walletCoins(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayJsValueFromWasm0(r0, r1);
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The hint below `line`, the text before the cursor, of a seed phrase; with `codes`, of codes in
 * any form, which have words only where the line so far is English words.
 * @param {any} line
 * @param {boolean} codes
 * @returns {TypedHint}
 */
export function wordHint(line, codes) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.wordHint(retptr, addHeapObject(line), codes);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return TypedHint.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The row of `value`, read as `kind` says: word, index or unicode.
 * @param {any} kind
 * @param {any} value
 * @returns {WordRow}
 */
export function wordLookup(kind, value) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.wordLookup(retptr, addHeapObject(kind), addHeapObject(value));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return WordRow.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * The numbered list in `format`, as `table --format` names it.
 * @param {string} format
 * @returns {string}
 */
export function wordTable(format) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.wordTable(retptr, ptr0, len0);
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

/**
 * `share`, in any form, written in `format`.
 * @param {any} share
 * @param {any} format
 * @returns {string}
 */
export function writeShare(share, format) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.writeShare(retptr, addHeapObject(share), addHeapObject(format));
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
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = getObject(arg0) === getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
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
        __wbg_defineProperty_af3c40b79455b005: function(arg0, arg1, arg2, arg3) {
            const ret = Object.defineProperty(getObject(arg0), getStringFromWasm0(arg1, arg2), getObject(arg3));
            return addHeapObject(ret);
        },
        __wbg_getRandomValues_436a51d0629d84e1: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_new_326a53335b5742d6: function(arg0, arg1) {
            const ret = new RangeError(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_51ab822ed52292a7: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_674f04dfa229da29: function(arg0, arg1) {
            const ret = new TypeError(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_parse_5d50bd5ab8f57306: function(arg0, arg1) {
            const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./mnemocode_bg.js": import0,
    };
}

const BackupFindingFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_backupfinding_free(ptr, 1));
const CardDesignFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_carddesign_free(ptr, 1));
const CardDocumentsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_carddocuments_free(ptr, 1));
const CardExportFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cardexport_free(ptr, 1));
const CardPlanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cardplan_free(ptr, 1));
const CardSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cardsession_free(ptr, 1));
const DecodedBackupFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decodedbackup_free(ptr, 1));
const EncodedBackupFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_encodedbackup_free(ptr, 1));
const HeirPageFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_heirpage_free(ptr, 1));
const LegacyLastWordsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_legacylastwords_free(ptr, 1));
const MarkedCodesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_markedcodes_free(ptr, 1));
const MarkedWayFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_markedway_free(ptr, 1));
const OpenedCandidateListFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_openedcandidatelist_free(ptr, 1));
const QrMatrixFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_qrmatrix_free(ptr, 1));
const ReEncodingFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_reencoding_free(ptr, 1));
const ReadBackupFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_readbackup_free(ptr, 1));
const RecoveryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_recovery_free(ptr, 1));
const RecoverySearchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_recoverysearch_free(ptr, 1));
const RecoverySetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_recoveryset_free(ptr, 1));
const RestoredSharesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_restoredshares_free(ptr, 1));
const SearchProgressFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_searchprogress_free(ptr, 1));
const SearchQuestionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_searchquestion_free(ptr, 1));
const SearchResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_searchresult_free(ptr, 1));
const SessionIdentityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sessionidentity_free(ptr, 1));
const ShareCardsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sharecards_free(ptr, 1));
const SplitSharesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_splitshares_free(ptr, 1));
const StegoCarrierSetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegocarrierset_free(ptr, 1));
const StegoContentFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegocontent_free(ptr, 1));
const StegoInputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegoinput_free(ptr, 1));
const StegoJobFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegojob_free(ptr, 1));
const StegoParametersFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegoparameters_free(ptr, 1));
const StegoPasswordComparisonFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegopasswordcomparison_free(ptr, 1));
const StegoRecoverySetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stegorecoveryset_free(ptr, 1));
const StitchLegendFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stitchlegend_free(ptr, 1));
const StitchPatternFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stitchpattern_free(ptr, 1));
const StitchSizesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stitchsizes_free(ptr, 1));
const TypedHintFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typedhint_free(ptr, 1));
const WalletCheckFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_walletcheck_free(ptr, 1));
const WalletEvidenceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_walletevidence_free(ptr, 1));
const WalletPlaceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_walletplace_free(ptr, 1));
const WordRowFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wordrow_free(ptr, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(takeObject(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
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

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
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

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
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
    cachedFloat64ArrayMemory0 = null;
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

export { initSync };
