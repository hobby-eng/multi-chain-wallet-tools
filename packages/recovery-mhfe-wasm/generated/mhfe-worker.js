let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * The rehearsal check; returns only whether the recovery matches the reference.
     *
     * `reference_kind` is "address", "fingerprint" or "words"; `reference` is the address, the
     * eight hex digits or the word count; `path` is empty for the standard path search.
     * @param {string} container
     * @param {Uint8Array} password_utf8
     * @param {number} pim
     * @param {number} memory_level
     * @param {string} reference_kind
     * @param {string} reference
     * @param {string} path
     * @param {Uint8Array} passphrase_utf8
     * @param {any} argon2
     * @param {Function} on_round
     * @returns {boolean}
     */
    function check(container, password_utf8, pim, memory_level, reference_kind, reference, path, passphrase_utf8, argon2, on_round) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(reference_kind, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(reference, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len3 = WASM_VECTOR_LEN;
            const ptr4 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len4 = WASM_VECTOR_LEN;
            const ptr5 = passArray8ToWasm0(passphrase_utf8, wasm.__wbindgen_export);
            const len5 = WASM_VECTOR_LEN;
            wasm.check(retptr, ptr0, len0, ptr1, len1, pim, memory_level, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, addHeapObject(argon2), addBorrowedObject(on_round));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    exports.check = check;

    /**
     * Checks a container and returns it with every word written out.
     * @param {string} container
     * @returns {string}
     */
    function checkContainer(container) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.checkContainer(retptr, ptr0, len0);
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
    exports.checkContainer = checkContainer;

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
     * Checks an original phrase before anything runs; returns its word count.
     * @param {string} phrase
     * @returns {number}
     */
    function checkPhrase(phrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.checkPhrase(retptr, ptr0, len0);
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
    exports.checkPhrase = checkPhrase;

    /**
     * Recovers the phrase. `words` is 0 for automatic detection, otherwise the chosen length.
     * Returns JSON: `{ kind, candidates: [{ words, verified, phrase }] }`.
     * @param {string} container
     * @param {Uint8Array} password_utf8
     * @param {number} pim
     * @param {number} memory_level
     * @param {number} words
     * @param {any} argon2
     * @param {Function} on_round
     * @returns {string}
     */
    function decrypt(container, password_utf8, pim, memory_level, words, argon2, on_round) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(container, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.decrypt(retptr, ptr0, len0, ptr1, len1, pim, memory_level, words, addHeapObject(argon2), addBorrowedObject(on_round));
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
            wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
        }
    }
    exports.decrypt = decrypt;

    /**
     * Encrypts `phrase` and returns the 24-word container once its check has passed.
     *
     * After the first twelve rounds `on_unverified` receives the container, so that a page can
     * show it, marked as not yet verified, while the check runs.
     * @param {string} phrase
     * @param {Uint8Array} password_utf8
     * @param {number} pim
     * @param {number} memory_level
     * @param {any} argon2
     * @param {Function} on_round
     * @param {Function} on_unverified
     * @returns {string}
     */
    function encrypt(phrase, password_utf8, pim, memory_level, argon2, on_round, on_unverified) {
        let deferred4_0;
        let deferred4_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(password_utf8, wasm.__wbindgen_export);
            const len1 = WASM_VECTOR_LEN;
            wasm.encrypt(retptr, ptr0, len0, ptr1, len1, pim, memory_level, addHeapObject(argon2), addBorrowedObject(on_round), addBorrowedObject(on_unverified));
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
    exports.encrypt = encrypt;

    /**
     * The lengths other than the phrase's own that automatic detection would also accept after
     * recovery: almost always empty. When not, the page should tell the user to note the word count
     * and to choose it during recovery.
     * @param {string} phrase
     * @returns {Uint32Array}
     */
    function otherDetectedLengths(phrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.otherDetectedLengths(retptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v2 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 4, 4);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    exports.otherDetectedLengths = otherDetectedLengths;

    /**
     * Checks an original phrase and returns it with every word written out.
     * @param {string} phrase
     * @returns {string}
     */
    function readPhrase(phrase) {
        let deferred3_0;
        let deferred3_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.readPhrase(retptr, ptr0, len0);
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
    exports.readPhrase = readPhrase;

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
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_Error_67e7344beaa85059: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return addHeapObject(ret);
            },
            __wbg___wbindgen_string_get_92ab86bb19cbc12f: function(arg0, arg1) {
                const obj = getObject(arg1);
                const ret = typeof(obj) === 'string' ? obj : undefined;
                var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                var len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_call_6bcf8d3e20937e46: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_call_7bbd9cceba9949ad: function() { return handleError(function (arg0, arg1, arg2, arg3) {
                const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
                return addHeapObject(ret);
            }, arguments); },
            __wbg_derive_b259485fb9a652e1: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
                getObject(arg0).derive(getArrayU8FromWasm0(arg1, arg2), getArrayU8FromWasm0(arg3, arg4), arg5 >>> 0, arg6 >>> 0, getArrayU8FromWasm0(arg7, arg8));
            }, arguments); },
            __wbg_get_989d0a1309644f2b: function() { return handleError(function (arg0, arg1) {
                const ret = Reflect.get(getObject(arg0), getObject(arg1));
                return addHeapObject(ret);
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
            __wbindgen_object_drop_ref: function(arg0) {
                takeObject(arg0);
            },
        };
        return {
            __proto__: null,
            "./mhfe_core_bg.js": import0,
        };
    }

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
// joined into mhfe-worker.js by scripts/build-wasm.sh, and the Node.js tests load the same file.
'use strict';

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
          throw new Error('MEMORY_ALLOCATION_FAILED: the browser could not provide memory');
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
          throw new Error('MEMORY_ALLOCATION_FAILED: the browser could not provide the Argon2 memory');
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
  };
}

function wipeAndFree(module, heap, pointer, length) {
  if (pointer !== 0) {
    heap.fill(0, pointer, pointer + length);
    module._free(pointer);
  }
}
// MHFE worker: runs exactly one operation, after which the client terminates it. Terminating
// the worker frees all of its memory, including the Argon2 memory, which WebAssembly can grow but
// never shrink.
//
// The client builds this worker from one Blob that holds, in this order: one Emscripten build of
// the reference Argon2 code (argon2-mt.js or argon2-st.js), the Rust core's wasm-bindgen glue,
// web/argon2-engine.js and this file; dist/mhfe-worker.js is the last three joined. Under the
// tools' Content-Security-Policy a worker may not load any further script, so everything arrives
// in that one Blob.
'use strict';

self.onmessage = async (event) => {
  const request = event.data;
  try {
    wasm_bindgen.initSync({ module: request.coreWasm });
    const result = READING_OPERATIONS.has(request.operation)
      ? readWords(request)
      : runOperation(request, argon2Engine(await loadArgon2(request.argon2Script)), onRound);
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', error: describeError(error) });
  } finally {
    // The Rust core has its own copies, which it wipes; these are the copies in this worker.
    request.password?.fill(0);
    request.passphrase?.fill(0);
  }
};

/** Operations that only read words; they need no Argon2 build. */
const READING_OPERATIONS = new Set(['readPhrase', 'readContainer']);

function onRound(round, rounds) {
  self.postMessage({ type: 'progress', round, rounds });
}

/** The container before its check; the result message comes only after the check passed. */
function onUnverified(container) {
  self.postMessage({ type: 'unverified', container });
}

function readWords(request) {
  if (request.operation === 'readPhrase') {
    const phrase = wasm_bindgen.readPhrase(request.phrase);
    const otherLengths = Array.from(wasm_bindgen.otherDetectedLengths(phrase));
    return { phrase, words: phrase.split(' ').length, otherLengths };
  }
  return { container: wasm_bindgen.checkContainer(request.container) };
}

/** Starts the Argon2 build that was placed in front of this file. */
function loadArgon2(threadedScript) {
  if (typeof createArgon2Mt === 'function') {
    // Without cross-origin isolation the threaded build cannot share its memory with its lane
    // workers, and its start-up would wait forever instead of failing, so refuse it here.
    if (self.crossOriginIsolated !== true) {
      throw new Error('INTERNAL_ERROR: the threaded Argon2 build needs a cross-origin isolated page');
    }
    // The lane workers run this same Argon2 script, which the CSP allows only from a Blob.
    return createArgon2Mt({ mainScriptUrlOrBlob: threadedScript });
  }
  return createArgon2St();
}

function runOperation(request, argon2, onRound) {
  const { pim, memoryLevel } = request;
  switch (request.operation) {
    case 'encrypt':
      return {
        container: wasm_bindgen.encrypt(request.phrase, request.password, pim, memoryLevel, argon2, onRound, onUnverified),
      };
    case 'decrypt':
      return JSON.parse(
        wasm_bindgen.decrypt(request.container, request.password, pim, memoryLevel, request.words, argon2, onRound),
      );
    case 'check':
      return {
        matches: wasm_bindgen.check(
          request.container,
          request.password,
          pim,
          memoryLevel,
          request.referenceKind,
          request.reference,
          request.path,
          request.passphrase,
          argon2,
          onRound,
        ),
      };
    default:
      throw new Error(`INVALID_REQUEST: unknown operation ${String(request.operation)}`);
  }
}

/** Errors from the Rust core read "CODE: message". */
function describeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]+): (.*)$/su.exec(text);
  return match === null ? { code: 'INTERNAL_ERROR', message: text } : { code: match[1], message: match[2] };
}
