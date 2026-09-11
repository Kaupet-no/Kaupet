import { describe, expect, it } from "vitest";

import { validateLocation } from "./location-form";

describe("validateLocation", () => {
  it("gir norsk melding per tomt felt", () => {
    expect(validateLocation({ name: "", addressLine: "", postalCode: "", city: "" })).toEqual({
      name: "Navn må fylles ut.",
      addressLine: "Gateadresse må fylles ut.",
      postalCode: "Postnummer må fylles ut.",
      city: "Poststed må fylles ut.",
    });
  });

  it("krever fire siffer i postnummer", () => {
    const errors = validateLocation({
      name: "Oslo butikk",
      addressLine: "Storgata 1",
      postalCode: "12a",
      city: "Oslo",
    });
    expect(errors).toEqual({ postalCode: "Postnummeret må være fire siffer." });
  });

  it("krever samtykke til fakturering og vilkår for nye lokasjoner", () => {
    const form = {
      name: "Oslo butikk",
      addressLine: "Storgata 1",
      postalCode: "0001",
      city: "Oslo",
    };
    expect(validateLocation(form, { requireConsent: true, accepted: false })).toEqual({
      terms: "Du må godta faktureringen og brukervilkårene for å opprette lokasjonen.",
    });
    expect(validateLocation(form, { requireConsent: true, accepted: true })).toEqual({});
    // Redigering av eksisterende lokasjon utløser ingen ny fakturering.
    expect(validateLocation(form, { requireConsent: false, accepted: false })).toEqual({});
  });

  it("godtar utfylt skjema med mellomrom rundt verdiene", () => {
    expect(
      validateLocation({
        name: " Oslo butikk ",
        addressLine: " Storgata 1 ",
        postalCode: " 0001 ",
        city: " Oslo ",
      }),
    ).toEqual({});
  });
});
