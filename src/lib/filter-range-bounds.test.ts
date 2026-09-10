import { describe, expect, it } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { boundsForFilter } from "@/lib/filter-range-bounds";

const filter = (key: string, label_nb: string, unit: string | null) =>
  ({ key, label_nb, unit }) as Pick<CategoryFilter, "key" | "unit" | "label_nb">;

describe("boundsForFilter", () => {
  it("gir sykkelrammen en skala folk kan bruke", () => {
    // Uten en egen skala falt feltet til DEFAULT_BOUNDS og ga en slider fra
    // 0 til 10 000 cm — hundre meter ramme.
    expect(boundsForFilter(filter("frame_size_cm", "Rammestørrelse", "cm"))).toMatchObject({
      min: 30,
      max: 75,
    });
  });

  it("faller tilbake på cm-skalaen for dimensjonsfelt uten egen skala", () => {
    expect(boundsForFilter(filter("depth_cm", "Dybde", "cm"))).toMatchObject({ min: 0, max: 300 });
  });

  it("lar label-skalaen vinne over nøkkel- og enhetsskalaen", () => {
    // "seats" brukes både om en personbil og en buss; label-oppslaget er det
    // som skiller dem, og må sjekkes først.
    expect(boundsForFilter(filter("seats", "Antall seter", null))).toMatchObject({
      min: 0,
      max: 16,
    });
  });

  it("beholder enheten i resultatet", () => {
    expect(boundsForFilter(filter("mileage_km", "Kilometerstand", "km")).unit).toBe("km");
    expect(boundsForFilter(filter("seats", "Sitteplasser", null)).unit).toBeUndefined();
  });
});
