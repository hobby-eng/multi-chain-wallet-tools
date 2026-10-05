/**
 * Reads an untrusted JSON response body under a byte ceiling. The body is consumed as a stream and
 * cancelled as soon as more bytes than the ceiling have arrived, so an oversized or hostile
 * response is never buffered whole. A declared Content-Length above the ceiling is rejected early,
 * but it is never trusted as the actual size.
 */
export async function readBoundedJson(
  response: Response,
  signal: AbortSignal | undefined,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("Invalid provider response size limit.");
  signal?.throwIfAborted();
  const tooLarge = () =>
    new Error(`Provider response exceeds the size limit (safety limit: ${maximumBytes} bytes).`);
  const declared = response.headers.get("content-length");
  // More than ten digits cannot be a safe size below any supported ceiling.
  if (
    declared !== null &&
    /^[0-9]+$/u.test(declared) &&
    (declared.length > 10 || Number(declared) > maximumBytes)
  ) {
    void response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (response.body === null) throw new Error("Provider returned an empty JSON response.");
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Provider returned malformed JSON.");
  }
}
