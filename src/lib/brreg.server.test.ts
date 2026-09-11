import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOrganizationFromBrreg } from "./brreg.server";

const unavailable = "Vi fikk ikke kontakt med Brønnøysundregistrene. Prøv igjen senere.";
const notFound = "Fant ingen bedrift med dette organisasjonsnummeret.";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchOrganizationFromBrreg", () => {
  it("maps the legal name and business address and makes no real network call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        navn: " REGISTERENHETEN I BRØNNØYSUND ",
        forretningsadresse: { postnummer: "8901", poststed: "BRØNNØYSUND" },
      }),
    );

    await expect(fetchOrganizationFromBrreg("974 760 673", fetchImpl)).resolves.toEqual({
      organizationNumber: "974760673",
      legalName: "REGISTERENHETEN I BRØNNØYSUND",
      visitingAddress: { addressLine: null, postalCode: "8901", city: "BRØNNØYSUND" },
      billingAddress: { addressLine: null, postalCode: "8901", city: "BRØNNØYSUND" },
      postalCode: "8901",
      city: "BRØNNØYSUND",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://data.brreg.no/enhetsregisteret/api/enheter/974760673",
    );
  });

  it("falls back to postadresse when forretningsadresse is unusable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        navn: "Eksempel AS",
        forretningsadresse: { postnummer: "12", poststed: "" },
        postadresse: { postnummer: "0123", poststed: " Oslo " },
      }),
    );

    await expect(fetchOrganizationFromBrreg("123456785", fetchImpl)).resolves.toMatchObject({
      postalCode: "0123",
      city: "Oslo",
    });
  });

  it("returns null address fields when neither address is usable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ navn: "Eksempel AS" }));
    await expect(fetchOrganizationFromBrreg("123456785", fetchImpl)).resolves.toMatchObject({
      postalCode: null,
      city: null,
    });
  });

  it("maps 404 to the not-found error", async () => {
    await expect(
      fetchOrganizationFromBrreg("974760673", vi.fn().mockResolvedValue(response({}, 404))),
    ).rejects.toThrow(notFound);
  });

  it.each([429, 500, 503])("maps HTTP %s to the unavailable error", async (status) => {
    await expect(
      fetchOrganizationFromBrreg("974760673", vi.fn().mockResolvedValue(response({}, status))),
    ).rejects.toThrow(unavailable);
  });

  it("maps invalid JSON to the unavailable error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid json")),
    });
    await expect(fetchOrganizationFromBrreg("974760673", fetchImpl)).rejects.toThrow(unavailable);
  });

  it("maps timeout/abort to the unavailable error", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "AbortError")),
          );
        }),
    );

    const pending = fetchOrganizationFromBrreg("974760673", fetchImpl);
    const assertion = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });
});
