import { describe, expect, it } from "vitest";

import { requestBodyExceedsLimit } from "./request-size.server";

describe("requestBodyExceedsLimit", () => {
  it("accepts bodies at the configured limit", async () => {
    const request = new Request("https://kaupet.no/api", {
      method: "POST",
      body: new Uint8Array(8),
    });
    await expect(requestBodyExceedsLimit(request, 8)).resolves.toBe(false);
  });

  it("rejects an oversized declared Content-Length without reading the body", async () => {
    const request = new Request("https://kaupet.no/api", {
      method: "POST",
      headers: { "content-length": "9" },
      body: new Uint8Array(1),
    });
    await expect(requestBodyExceedsLimit(request, 8)).resolves.toBe(true);
  });

  it("rejects an oversized stream even when Content-Length understates it", async () => {
    const request = new Request("https://kaupet.no/api", {
      method: "POST",
      headers: { "content-length": "1" },
      body: new Uint8Array(9),
    });
    await expect(requestBodyExceedsLimit(request, 8)).resolves.toBe(true);
  });
});
