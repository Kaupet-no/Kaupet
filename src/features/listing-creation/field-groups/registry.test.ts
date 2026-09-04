import { expect, it } from "vitest";

import { getCategoryBehavior } from "@/lib/category-behavior";
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
    price: "requiredToPublish",
    "vehicle-facts": "requiredToPublish",
    "vehicle-price": "requiredToPublish",
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

it.each(["price", "vehicle-price"])("krever pris for ikke-gratis annonser i %s", (groupKey) => {
  const validate = FIELD_GROUP_REGISTRY[groupKey].validateExtra;

  expect(validate?.({ isFree: false, priceNok: "" } as never)).toEqual({
    field: "price_nok",
    message: "Oppgi en pris før annonsen publiseres.",
  });
  expect(validate?.({ isFree: true, priceNok: "" } as never)).toBeNull();
  expect(validate?.({ isFree: false, priceNok: 0 } as never)).toBeNull();
});

it("blokkerer kjøretøyfakta når en påkrevd teknisk opplysning mangler", () => {
  const validate = FIELD_GROUP_REGISTRY["vehicle-facts"].validateExtra;

  expect(
    validate?.({
      showMileage: false,
      categories: [{ id: "bil", slug: "bil" }],
      categoryId: "bil",
      attributes: { drive_type: "forhjulsdrift" },
      missingFilters: [{ key: "fuel_type", label_nb: "Drivstoff" }],
    } as never),
  ).toEqual({
    field: "fuel_type",
    message: "Fyll inn drivstoff før du går videre.",
  });
});

it("unntar sylindre og motorkode fra kjøretøyets påkrevde filterfelt", () => {
  expect(getCategoryBehavior("bil").requiredFilterExclusions).toEqual(["cylinders", "engine_code"]);
});

it("krever leveringsmetode når kategorien krever det", () => {
  const validate = FIELD_GROUP_REGISTRY.delivery.validateExtra;

  expect(
    validate?.({ behavior: { requiresDeliveryMethod: true }, canShip: null } as never),
  ).toEqual({
    field: "can_ship",
    message: "Velg en leveringsmetode før du går videre.",
  });
  expect(
    validate?.({ behavior: { requiresDeliveryMethod: true }, canShip: "pickup" } as never),
  ).toBeNull();
  expect(
    validate?.({ behavior: { requiresDeliveryMethod: false }, canShip: null } as never),
  ).toBeNull();
});
