import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpDeadlineError, readResponseBytes, withHttpDeadline } from "@/lib/http-bounded.server";

describe("HTTP deadlines", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts and cancels a body reader that never finishes, then clears its timer", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    let signal!: AbortSignal;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel: cancelled,
      }),
    );
    const pending = withHttpDeadline(15_000, (requestSignal) => {
      signal = requestSignal;
      return readResponseBytes(response, 20 * 1024 * 1024, requestSignal);
    });

    await Promise.resolve();
    await Promise.resolve();
    const rejected = expect(pending).rejects.toBeInstanceOf(HttpDeadlineError);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer after success and failure", async () => {
    vi.useFakeTimers();
    await expect(withHttpDeadline(15_000, async () => "ok")).resolves.toBe("ok");
    await expect(
      withHttpDeadline(15_000, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
