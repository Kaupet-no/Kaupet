import { describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/category-filters";

import {
  DEFAULT_FIELD_GROUPS,
  DEFAULT_MODULES,
  effectiveFlowForCategory,
  resolveWizardPages,
  toStoredFieldGroupKeys,
  type CategoryFlowRow,
} from "./category-flows";

const cats: CategoryNode[] = [
  { id: "vehicles", parent_id: null },
  { id: "cars", parent_id: "vehicles" },
  { id: "other", parent_id: null },
];
const byId = new Map(cats.map((c) => [c.id, c]));

function row(partial: Partial<CategoryFlowRow> & { category_id: string }): CategoryFlowRow {
  return {
    id: partial.category_id,
    field_groups: DEFAULT_FIELD_GROUPS,
    modules: DEFAULT_MODULES,
    sort_order: 0,
    ...partial,
  };
}

describe("effectiveFlowForCategory", () => {
  it("returns the default flow for a null category", () => {
    expect(effectiveFlowForCategory(null, [], byId)).toEqual({
      fieldGroups: ["category-select", ...DEFAULT_FIELD_GROUPS],
      modules: DEFAULT_MODULES,
    });
  });

  it("returns the default flow when no category in the chain has a row", () => {
    expect(effectiveFlowForCategory("cars", [], byId)).toEqual({
      fieldGroups: ["category-select", ...DEFAULT_FIELD_GROUPS],
      modules: DEFAULT_MODULES,
    });
  });

  it("uses the category's own row when present", () => {
    const flows = [row({ category_id: "cars", modules: ["vehicle-lookup", "generic-attributes"] })];
    expect(effectiveFlowForCategory("cars", flows, byId).modules).toEqual([
      "vehicle-lookup",
      "generic-attributes",
    ]);
  });

  it("inherits the nearest ancestor's row when the category itself has none", () => {
    const flows = [
      row({ category_id: "vehicles", modules: ["vehicle-lookup", "generic-attributes"] }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).modules).toEqual([
      "vehicle-lookup",
      "generic-attributes",
    ]);
  });

  it("does not inherit a flow from an unrelated category", () => {
    const flows = [row({ category_id: "other", modules: ["vehicle-lookup"] })];
    expect(effectiveFlowForCategory("cars", flows, byId).modules).toEqual(DEFAULT_MODULES);
  });

  it("lets a child row override an inherited parent row wholesale (no merging)", () => {
    const flows = [
      row({ category_id: "vehicles", modules: ["vehicle-lookup", "generic-attributes"] }),
      row({ category_id: "cars", modules: ["generic-attributes"] }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).modules).toEqual(["generic-attributes"]);
  });

  it("normalizes legacy compound field groups from stored rows", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: ["title-photos", "category-attributes", "review-publish"],
      }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "title",
      "category-attributes",
      "review-publish",
    ]);
  });

  it("keeps the legacy database format when saving atomic field groups", () => {
    expect(toStoredFieldGroupKeys(DEFAULT_FIELD_GROUPS)).toEqual([
      "title-photos",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery-location",
      "review-publish",
    ]);
  });

  it("omits generic title and delivery cards from vehicle flows", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: [
          "vehicle-registration",
          "title-photos",
          "vehicle-facts",
          "delivery-location",
          "review-publish",
        ],
      }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).fieldGroups).toEqual([
      "category-select",
      "vehicle-registration",
      "photos",
      "vehicle-facts",
      "location",
      "review-publish",
    ]);
  });

  it("orders vehicle description between facts and condition", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: [
          "vehicle-registration",
          "title-photos",
          "vehicle-facts",
          "vehicle-condition",
          "description-keywords",
          "vehicle-equipment",
          "delivery-location",
          "review-publish",
        ],
      }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).fieldGroups).toEqual([
      "category-select",
      "vehicle-registration",
      "photos",
      "vehicle-facts",
      "description-keywords",
      "vehicle-condition",
      "vehicle-equipment",
      "location",
      "review-publish",
    ]);
  });
});

describe("resolveWizardPages", () => {
  const flowWithCategorySelect = ["category-select", ...DEFAULT_FIELD_GROUPS];

  it("reproduces today's web split for the default flow (chunks of 4, ends pinned)", () => {
    expect(resolveWizardPages(flowWithCategorySelect, { native: false })).toEqual([
      ["category-select"],
      ["photos", "title", "category-attributes", "condition", "price"],
      ["description-keywords"],
      ["delivery", "location", "review-publish"],
    ]);
  });

  it("gives every atomic field group its own native page", () => {
    expect(resolveWizardPages(flowWithCategorySelect, { native: true })).toEqual([
      ["category-select"],
      ["photos"],
      ["title"],
      ["category-attributes"],
      ["condition"],
      ["price"],
      ["description-keywords"],
      ["delivery"],
      ["location"],
      ["review-publish"],
    ]);
  });

  it("produces fewer, smaller pages for a category with fewer groups", () => {
    const groups = ["photos", "title", "category-attributes", "review-publish"];
    expect(resolveWizardPages(groups, { native: false })).toEqual([
      ["photos", "title", "category-attributes"],
      ["review-publish"],
    ]);
    expect(resolveWizardPages(groups, { native: true })).toEqual([
      ["photos"],
      ["title"],
      ["category-attributes"],
      ["review-publish"],
    ]);
  });

  it("handles an empty field-group list", () => {
    expect(resolveWizardPages([], { native: false })).toEqual([]);
    expect(resolveWizardPages([], { native: true })).toEqual([]);
  });

  it("solo-pages vehicle-registration and vehicle-confirm wherever they land in the array", () => {
    const groups = [
      "category-select",
      "vehicle-registration",
      "vehicle-confirm",
      "category-attributes",
      "photos",
      "title",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ];
    expect(resolveWizardPages(groups, { native: false })).toEqual([
      ["category-select"],
      ["vehicle-registration"],
      ["vehicle-confirm"],
      ["category-attributes", "photos", "title", "condition", "price"],
      ["description-keywords"],
      ["delivery", "location", "review-publish"],
    ]);
    expect(resolveWizardPages(groups, { native: true })).toEqual([
      ["category-select"],
      ["vehicle-registration"],
      ["vehicle-confirm"],
      ["category-attributes"],
      ["photos"],
      ["title"],
      ["condition"],
      ["price"],
      ["description-keywords"],
      ["delivery"],
      ["location"],
      ["review-publish"],
    ]);
  });
});
