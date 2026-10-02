import { afterEach, describe, expect, it, vi } from "vitest";

import { Route } from "./csp-report";

async function post(body: BodyInit | null, headers?: HeadersInit) {
  // @ts-expect-error server handlers are callable in tests
  return Route.options.server.handlers.POST({
    request: new Request("https://kaupet.no/api/public/csp-report", {
      method: "POST",
      headers,
      body,
      duplex: body instanceof ReadableStream ? "half" : undefined,
    } as RequestInit & { duplex?: "half" }),
  });
}

describe("POST /api/public/csp-report", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects an oversized streamed body without Content-Length", async () => {
    const bytes = new Uint8Array(32_769);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const response = await post(body);
    expect(response.status).toBe(413);
  });

  it("logs only allowlisted directives and URL categories", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private-token-123";
    const response = await post(
      JSON.stringify({
        "csp-report": {
          "violated-directive": "script-src https:",
          "blocked-uri": `https://private.${secret}.example/path?token=${secret}`,
          "document-uri": `https://kaupet.no/private/path?token=${secret}`,
          "source-file": `https://kaupet.no/private.js?token=${secret}`,
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(log.mock.calls[0]?.[1]).toContain('"directive":"script-src"');
    expect(log.mock.calls[0]?.[1]).toContain('"blocked":"external"');
    expect(log.mock.calls[0]?.[1]).toContain('"document":"same-origin"');
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
});
