import { defined } from "./defined.js";

const TYPED_ARRAY = defined(Reflect.getPrototypeOf(Uint8Array.prototype));
const ARRAY_NAME = defined(
  defined(Reflect.getOwnPropertyDescriptor(TYPED_ARRAY, Symbol.toStringTag)).get,
);
const BYTE_LENGTH = defined(
  defined(Reflect.getOwnPropertyDescriptor(TYPED_ARRAY, "byteLength")).get,
);
// oxlint-disable-next-line typescript/unbound-method -- Reflect.apply binds the admitted storage as this.
const VALUES = Uint8Array.prototype.values;

/** Admits real, attached byte arrays across realms, without trusting prototypes or own getters. */
export class ByteArray {
  /** The intrinsic byte length, or undefined for a wrong kind, spoofed or detached array. */
  static length(value: unknown): number | undefined {
    if (!ArrayBuffer.isView(value)) return undefined;
    try {
      if (ARRAY_NAME.call(value) !== "Uint8Array") return undefined;
      // Creating the intrinsic iterator validates attachment without reading or copying bytes.
      Reflect.apply(VALUES, value, []);
      // The intrinsic getter on the admitted storage returns its numeric length, not an own field.
      return BYTE_LENGTH.call(value) as number;
    } catch {
      return undefined;
    }
  }

  /** Whether a value has attached Uint8Array storage, including Buffer and subarray views. */
  static is(value: unknown): value is Uint8Array {
    return ByteArray.length(value) !== undefined;
  }
}
