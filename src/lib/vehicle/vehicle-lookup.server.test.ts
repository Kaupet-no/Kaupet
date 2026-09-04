import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupVehicle } from "./vehicle-lookup.server";

function mockSvvResponse(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kjoretoydataListe: [
            {
              kjoretoyId: { kjennemerke: "TEST123" },
              forstegangsregistrering: { registrertForstegangNorgeDato: "2018-03-08" },
              godkjenning: {
                forstegangsGodkjenning: { forstegangRegistrertDato: "2018-03-08" },
                tekniskGodkjenning: {
                  tekniskeData: {
                    karosseriOgLasteplan: {
                      karosseritype: {
                        kodeVerdi: "BB",
                        kodeNavn: "Integrert førerhus (BB)",
                      },
                    },
                    tilhengerkopling: { kopling: [] },
                    vekter: {
                      tillattTilhengervektMedBrems: 2500,
                      tillattTilhengervektUtenBrems: 750,
                      tillattVertikalKoplingslast: 100,
                    },
                  },
                },
              },
              ...overrides,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

beforeEach(() => {
  vi.stubEnv("STATENS_VEGVESEN_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("lookupVehicle", () => {
  it("henter karosseri, hengervekt og norsk førstegangsgodkjenning fra SVV-responsen", async () => {
    mockSvvResponse();

    const result = await lookupVehicle("TEST123");

    expect(result).toMatchObject({
      body_type_code: "BB",
      body_type_hint: "Integrert førerhus (BB)",
      body_type: "varebil",
      max_tow_weight_kg: 2500,
      tow_hitch: true,
      imported_used: false,
    });
  });

  it("registrerer 0 i hengervekt når SVV mangler hengerfeste eksplisitt", async () => {
    mockSvvResponse({
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            tilhengerkopling: { kopling: [] },
            vekter: {},
          },
        },
      },
    });

    const result = await lookupVehicle("TEST123");

    expect(result.max_tow_weight_kg).toBe(0);
    expect(result.tow_hitch).toBe(false);
  });

  it("beholder ukjent hengerfeste som null når SVV ikke oppgir koblingsdata", async () => {
    mockSvvResponse({
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            vekter: {},
          },
        },
      },
    });

    const result = await lookupVehicle("TEST123");

    expect(result.max_tow_weight_kg).toBeNull();
    expect(result.tow_hitch).toBeNull();
  });
});
