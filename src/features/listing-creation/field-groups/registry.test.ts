import { expect, it } from "vitest";

import {
  DEFAULT_FIELD_GROUPS,
  resolveWizardPages,
} from "@/features/listing-creation/category-flows";
import { FIELD_GROUP_REGISTRY, fieldGroupsForKeys, pageLabel } from "./registry";

it("klassifiserer alle feltgrupper etter publiseringsformål", () => {
  expect(
    Object.fromEntries(
      Object.entries(FIELD_GROUP_REGISTRY).map(([key, group]) => [key, group.classification]),
    ),
  ).toEqual({
    "category-select": "requiredToPublish",
    "category-confirm": "requiredToPublish",
    photos: "recommendedForTrust",
    title: "requiredToPublish",
    "vehicle-registration": "requiredToPublish",
    "vehicle-360": "optionalEnhancement",
    "category-attributes": "requiredToPublish",
    condition: "requiredToPublish",
    price: "recommendedForTrust",
    "vehicle-facts": "requiredToPublish",
    "vehicle-price": "recommendedForTrust",
    "boat-facts": "requiredToPublish",
    "vehicle-condition": "requiredToPublish",
    "vehicle-equipment": "optionalEnhancement",
    "description-keywords": "requiredToPublish",
    delivery: "requiredToPublish",
    location: "recommendedForTrust",
    "review-publish": "requiredToPublish",
  });
});

it("gir innholdssidene de fire delte oppgavenavnene", () => {
  const pages = resolveWizardPages(DEFAULT_FIELD_GROUPS, { native: false });

  expect(pages.map((keys) => pageLabel(fieldGroupsForKeys(keys)))).toEqual([
    "Vis frem",
    "Gjør søkbar",
    "Gjør handelen enkel",
    "Se over",
  ]);
  expect(pages[1]).toContain("category-attributes");
  expect(pages.findIndex((keys) => keys.includes("category-attributes"))).toBeLessThan(
    pages.findIndex((keys) => keys.includes("review-publish")),
  );
});

it("bevarer egne etiketter for strukturelle solosider", () => {
  expect(pageLabel(fieldGroupsForKeys(["category-confirm"]))).toBe("Kategori");
  expect(pageLabel(fieldGroupsForKeys(["vehicle-registration"]))).toBe("Registreringsnummer");
});
