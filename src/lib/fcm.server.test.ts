import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const serviceAccount = {
  project_id: "kaupet-test",
  client_email: "test@kaupet.invalid",
  private_key: "-----BEGIN PRIVATE KEY-----\nAQ==\n-----END PRIVATE KEY-----",
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify(serviceAccount));
  vi.stubGlobal("crypto", {
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      sign: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer),
    },
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function send(onInvalidToken = vi.fn().mockResolvedValue(undefined)) {
  const { sendFcmNotifications } = await import("@/lib/fcm.server");
  await sendFcmNotifications({
    tokens: [{ id: "sub-1", fcm_token: "mock-device-token" }],
    title: "Tittel",
    body: "Melding",
    url: "/varsler",
    onInvalidToken,
  });
  return onInvalidToken;
}

describe("FCM bounded HTTP requests", () => {
  it("uses manual redirects and still removes invalid tokens", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "mock-access", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), { status: 404 }),
      );
    const onInvalidToken = await send();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[1].redirect)).toEqual(["manual", "manual"]);
    expect(onInvalidToken).toHaveBeenCalledWith("sub-1");
  });

  it("times out an OAuth request that ignores AbortSignal", async () => {
    vi.useFakeTimers();
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    fetchMock.mockImplementationOnce(() => {
      requestStarted();
      return new Promise(() => {});
    });
    const pending = send();
    await started;
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("times out while reading a stalled FCM reply", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "mock-access", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1]));
            },
          }),
          { status: 500 },
        ),
      );
    const onInvalidToken = vi.fn().mockResolvedValue(undefined);
    const pending = send(onInvalidToken);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;

    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(onInvalidToken).not.toHaveBeenCalled();
  });

  it("bounds oversized OAuth and FCM error bodies", async () => {
    const cancelledOAuth = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1024 + 1));
          },
          cancel: cancelledOAuth,
        }),
        { status: 200 },
      ),
    );
    await send();
    expect(cancelledOAuth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.resetModules();
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "mock-access", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(16 * 1024 + 1), { status: 400 }));
    const onInvalidToken = await send();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onInvalidToken).not.toHaveBeenCalled();
  });
});
