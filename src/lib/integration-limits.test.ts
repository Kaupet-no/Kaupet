import { describe, expect, it } from "vitest";

import {
  formatLimit,
  INTEGRATION_LIMIT_LABELS_NB,
  INTEGRATION_LIMITS,
  newListingsPerDayLimitMessage,
} from "./integration-limits";

describe("integration-limits", () => {
  it("har de avtalte grensetallene", () => {
    expect(INTEGRATION_LIMITS.apiKey).toEqual({
      readPerHour: 300,
      writePerHour: 120,
      batchPerHour: 10,
      maxActiveKeysPerOrganization: 2,
      maxLifetimeDays: 365,
      lifetimeOptionsDays: [30, 90, 180, 365],
      defaultLifetimeDays: 90,
    });
    expect(INTEGRATION_LIMITS.organization).toEqual({
      newListingsPerDay: 1000,
      newImagesPerDay: 2000,
    });
    expect(INTEGRATION_LIMITS.maxBatchRows).toBe(500);
    expect(INTEGRATION_LIMITS.listingRenewalDays).toBe(30);
  });

  it("standardvarigheten er blant de tilbudte alternativene, og maks er det høyeste alternativet", () => {
    expect(INTEGRATION_LIMITS.apiKey.lifetimeOptionsDays).toContain(
      INTEGRATION_LIMITS.apiKey.defaultLifetimeDays,
    );
    expect(Math.max(...INTEGRATION_LIMITS.apiKey.lifetimeOptionsDays)).toBe(
      INTEGRATION_LIMITS.apiKey.maxLifetimeDays,
    );
  });

  it("har norske etiketter og forklaringer for hver grense", () => {
    for (const entry of Object.values(INTEGRATION_LIMIT_LABELS_NB)) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("formatLimit formaterer med norsk tallformat og enhet", () => {
    expect(formatLimit(1000, "nye annonser")).toBe("1 000 nye annonser");
    expect(formatLimit(300, "")).toBe("300");
  });

  it("newListingsPerDayLimitMessage gir den avtalte kundeteksten", () => {
    expect(newListingsPerDayLimitMessage()).toBe(
      "Dagens grense på 1 000 nye annonser er nådd. Eksisterende annonser kan fortsatt oppdateres; prøv igjen i morgen.",
    );
  });
});
