let wasm;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}
/**
 * Validates the canonical raw FullViewingKey encoding without network access.
 * The caller's byte buffer is overwritten before return on success or error.
 * @param {Uint8Array} full_viewing_key
 */
export function validate_full_viewing_key(full_viewing_key) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(full_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        wasm.validate_full_viewing_key(retptr, ptr0, len0, addHeapObject(full_viewing_key));
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
 * Validates the canonical raw IncomingViewingKey encoding without network access.
 * The caller's byte buffer is overwritten before return on success or error.
 * @param {Uint8Array} incoming_viewing_key
 */
export function validate_incoming_viewing_key(incoming_viewing_key) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(incoming_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        wasm.validate_incoming_viewing_key(retptr, ptr0, len0, addHeapObject(incoming_viewing_key));
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
 * Validates the fixed-width raw OutgoingViewingKey encoding.
 * Every 32-byte value is a valid OVK; the caller's buffer is still overwritten.
 * @param {Uint8Array} outgoing_viewing_key
 */
export function validate_outgoing_viewing_key(outgoing_viewing_key) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(outgoing_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        wasm.validate_outgoing_viewing_key(retptr, ptr0, len0, addHeapObject(outgoing_viewing_key));
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
 * Trial-decrypts one fixed-width page returned by Dash Platform DAPI.
 *
 * `full_viewing_key` is overwritten before this function returns, including
 * on validation errors. The returned JSON contains only matched incoming or
 * outgoing notes; it never contains spending authority.
 * @param {Uint8Array} full_viewing_key
 * @param {bigint} start_position
 * @param {Uint8Array} cmx
 * @param {Uint8Array} nullifiers
 * @param {Uint8Array} cv_net
 * @param {Uint8Array} encrypted_notes
 * @returns {string}
 */
export function scan_shielded_batch_json(full_viewing_key, start_position, cmx, nullifiers, cv_net, encrypted_notes) {
    let deferred7_0;
    let deferred7_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(full_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(cmx, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(nullifiers, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(cv_net, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(encrypted_notes, wasm.__wbindgen_export_0);
        const len4 = WASM_VECTOR_LEN;
        wasm.scan_shielded_batch_json(retptr, ptr0, len0, addHeapObject(full_viewing_key), start_position, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
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
        wasm.__wbindgen_export_1(deferred7_0, deferred7_1, 1);
    }
}

/**
 * Trial-decrypts incoming notes with a 64-byte raw IncomingViewingKey.
 *
 * This deliberately omits outgoing recovery and note-nullifier derivation,
 * which are cryptographically unavailable without the FullViewingKey.
 * `incoming_viewing_key` is overwritten before return on success or error.
 * @param {Uint8Array} incoming_viewing_key
 * @param {bigint} start_position
 * @param {Uint8Array} cmx
 * @param {Uint8Array} nullifiers
 * @param {Uint8Array} cv_net
 * @param {Uint8Array} encrypted_notes
 * @returns {string}
 */
export function scan_shielded_incoming_batch_json(incoming_viewing_key, start_position, cmx, nullifiers, cv_net, encrypted_notes) {
    let deferred7_0;
    let deferred7_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(incoming_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(cmx, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(nullifiers, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(cv_net, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(encrypted_notes, wasm.__wbindgen_export_0);
        const len4 = WASM_VECTOR_LEN;
        wasm.scan_shielded_incoming_batch_json(retptr, ptr0, len0, addHeapObject(incoming_viewing_key), start_position, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
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
        wasm.__wbindgen_export_1(deferred7_0, deferred7_1, 1);
    }
}

/**
 * Recovers outgoing notes with a 32-byte raw OutgoingViewingKey.
 *
 * This deliberately omits incoming recovery, balance, and spent detection.
 * `outgoing_viewing_key` is overwritten before return on success or error.
 * @param {Uint8Array} outgoing_viewing_key
 * @param {bigint} start_position
 * @param {Uint8Array} cmx
 * @param {Uint8Array} nullifiers
 * @param {Uint8Array} cv_net
 * @param {Uint8Array} encrypted_notes
 * @returns {string}
 */
export function scan_shielded_outgoing_batch_json(outgoing_viewing_key, start_position, cmx, nullifiers, cv_net, encrypted_notes) {
    let deferred7_0;
    let deferred7_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(outgoing_viewing_key, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(cmx, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(nullifiers, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(cv_net, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(encrypted_notes, wasm.__wbindgen_export_0);
        const len4 = WASM_VECTOR_LEN;
        wasm.scan_shielded_outgoing_batch_json(retptr, ptr0, len0, addHeapObject(outgoing_viewing_key), start_position, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
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
        wasm.__wbindgen_export_1(deferred7_0, deferred7_1, 1);
    }
}

/**
 * Derives one Dash Orchard account and a sequential address batch.
 *
 * The returned JSON only contains official raw encodings. Dash-specific
 * Bech32m display encoding is applied and independently vector-tested in TS.
 * @param {Uint8Array} seed
 * @param {number} coin_type
 * @param {number} account
 * @param {number} start
 * @param {number} count
 * @returns {string}
 */
export function derive_shielded_json(seed, coin_type, account, start, count) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(seed, wasm.__wbindgen_export_0);
        var len0 = WASM_VECTOR_LEN;
        wasm.derive_shielded_json(retptr, ptr0, len0, addHeapObject(seed), coin_type, account, start, count);
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
        wasm.__wbindgen_export_1(deferred3_0, deferred3_1, 1);
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_copy_to_typed_array = function(arg0, arg1, arg2) {
        new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength).set(getArrayU8FromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    initSync.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;



    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
