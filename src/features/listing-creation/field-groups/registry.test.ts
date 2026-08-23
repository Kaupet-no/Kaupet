import { expect, it } from "vitest";

import { FIELD_GROUP_REGISTRY } from "./registry";

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
