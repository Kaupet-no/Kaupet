import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  geocodeNorwayAddress,
  geocodeStreetAddress,
  lookupPostalCode,
  reverseGeocodeAddress,
  searchPlaces,
} from "./geocode.server";

const oslo = {
  stedsnummer: 307915,
  skrivemåte: "Oslo",
  navneobjekttype: "By",
  stedstatus: "aktiv",
  navnestatus: "hovednavn",
  skrivemåtestatus: "godkjent og prioritert",
  kommuner: [{ kommunenavn: "Oslo" }],
  fylker: [{ fylkesnavn: "Oslo" }],
  representasjonspunkt: { nord: 59.91273, øst: 10.74609 },
};
const address = {
  poststed: "OSLO",
  postnummer: "0152",
  kommunenavn: "OSLO",
  representasjonspunkt: { lat: 59.91, lon: 10.75 },
};
const fetchMock = vi.fn();
function respond(payload: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(payload)));
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

// Provider parser/integration unit tests: actual Kartverket field names, with mocked HTTP.
describe("Kartverket geocoding", () => {
  it("prioriterer eksakt bynavn og normaliserer nord/øst", async () => {
    respond({
      navn: [
        { ...oslo, stedsnummer: 509924, skrivemåte: "Oslo fylke", navneobjekttype: "Fylke" },
        oslo,
      ],
    });
    expect(await searchPlaces("Oslo", 1)).toEqual([
      { id: "307915", label: "Oslo", lat: 59.91273, lng: 10.74609 },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe("/stedsnavn/v1/navn");
    expect(url.searchParams.get("utkoordsys")).toBe("4258");
    expect(init.cf.cacheTtlByStatus).toEqual({ "200": 86400, "400-599": -1 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("utelater historiske steder, duplikater og ugyldige koordinater", async () => {
    respond({
      navn: [
        { ...oslo, stedstatus: "relikt" },
        { ...oslo, stedsnummer: 2, representasjonspunkt: { nord: 91, øst: 10 } },
        oslo,
        oslo,
      ],
    });
    expect(await searchPlaces("Oslo", 6)).toHaveLength(1);
  });
  it("bevarer norske tegn og skiller like navn med kommune og fylke", async () => {
    respond({
      navn: [
        {
          ...oslo,
          skrivemåte: "Ås",
          kommuner: [{ kommunenavn: "Ås" }],
          fylker: [{ fylkesnavn: "Akershus" }],
        },
      ],
    });
    expect((await searchPlaces("Ås", 6))[0].label).toBe("Ås, Akershus");
    expect(fetchMock.mock.calls[0][0].searchParams.get("sok")).toBe("Ås");
  });
  it("postnummersøk bruker adresse-API og tallkoordinater", async () => {
    respond({ adresser: [address] });
    expect(await searchPlaces("0152", 6)).toEqual([
      { id: "postal-0152", label: "0152 OSLO", lat: 59.91, lng: 10.75 },
    ]);
    expect(fetchMock.mock.calls[0][0].searchParams.get("postnummer")).toBe("0152");
  });
  it("tomt postnummer gir ingen nettverkskall", async () => {
    expect(await lookupPostalCode("")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("postboks/ukjent postnummer uten adresser gir null", async () => {
    respond({ adresser: [] });
    expect(await lookupPostalCode("0001")).toBeNull();
  });
  it("nærhetssøk begrenses til 1 km og beholder punktet i spørringen", async () => {
    respond({ adresser: [address] });
    expect(await reverseGeocodeAddress({ lat: 59.91, lng: 10.75 })).toEqual({
      city: "OSLO",
      postal_code: "0152",
    });
    const url = fetchMock.mock.calls[0][0];
    expect(url.pathname).toBe("/adresser/v1/punktsok");
    expect(url.searchParams.get("radius")).toBe("1000");
    expect(url.searchParams.get("lat")).toBe("59.91");
  });
  it("ingen nærliggende adresse gir ingen sted eller postnummer", async () => {
    respond({ adresser: [] });
    expect(await reverseGeocodeAddress({ lat: 70, lng: 20 })).toEqual({
      city: null,
      postal_code: null,
    });
  });
  it("geokoder by når postnummer mangler treff", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"adresser":[]}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ navn: [oslo] })));
    expect(await geocodeNorwayAddress({ postal_code: "0001", city: "Oslo" })).toEqual({
      lat: 59.91273,
      lng: 10.74609,
    });
  });
  it("gateadresser bruker adresse-API via serveren", async () => {
    respond({ adresser: [address] });
    expect(
      await geocodeStreetAddress({ address_line: "Prinsens gate 1A", postal_code: "0152" }),
    ).toEqual({ lat: 59.91, lng: 10.75 });
    expect(fetchMock.mock.calls[0][0].searchParams.get("sok")).toBe("Prinsens gate 1A");
  });
  it.each([
    null,
    {},
    { navn: "feil" },
    { navn: [{ ...oslo, representasjonspunkt: { nord: "59", øst: 10 } }] },
  ])("avviser ugyldige leverandørsvar %j", async (payload) => {
    respond(payload);
    await expect(searchPlaces("Oslo", 6)).rejects.toThrow();
  });
  it("HTTP-feil gir tjenestefeil, ikke tomme treff", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(searchPlaces("Oslo", 6)).rejects.toThrow("Kunne ikke hente");
  });
});
