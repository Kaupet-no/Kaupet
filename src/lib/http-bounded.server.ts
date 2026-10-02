export class HttpDeadlineError extends Error {
  constructor() {
    super("HTTP request deadline exceeded");
    this.name = "HttpDeadlineError";
  }
}

export class HttpResponseTooLargeError extends Error {
  constructor() {
    super("HTTP response exceeded its size limit");
    this.name = "HttpResponseTooLargeError";
  }
}

export async function withHttpDeadline<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new HttpDeadlineError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      expired,
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

export function cancelResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

export async function readResponseBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new HttpResponseTooLargeError();
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new HttpDeadlineError();
      let onAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new HttpDeadlineError());
        signal.addEventListener("abort", onAbort, { once: true });
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), aborted]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) throw new HttpResponseTooLargeError();
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A pending read can remain locked when a nonstandard stream ignores cancellation.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
