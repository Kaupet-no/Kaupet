import { describe, expect, it } from "vitest";

describe("GET /api/v1/openapi.json", () => {
  it("svarer med det gyldige OpenAPI-dokumentet uten å kreve auth", async () => {
    const { Route } = await import("./openapi[.]json");
    const request = new Request("http://localhost/api/v1/openapi.json");
    // @ts-expect-error server handlers er tilgjengelig i praksis
    const res = await Route.options.server.handlers.GET({ request });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toHaveProperty("/listings/{externalRef}");
  });
});
