export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/** Measures a cloned request stream so chunked requests and dishonest
 * Content-Length headers cannot bypass the Worker request-size boundary. */
export async function requestBodyExceedsLimit(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<boolean> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return true;
  if (!request.body) return false;

  let clone: Request;
  try {
    clone = request.clone();
  } catch {
    // Body already consumed/locked upstream (e.g. by the server function
    // dispatcher). The declared-length check above already ran.
    return false;
  }
  const reader = clone.body?.getReader();
  if (!reader) return false;

  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      received += value.byteLength;
      if (received > maxBytes) {
        void reader.cancel("request body exceeds configured limit");
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
