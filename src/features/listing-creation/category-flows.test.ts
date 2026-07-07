import { describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/category-filters";

import {
  DEFAULT_FIELD_GROUPS,
  DEFAULT_MODULES,
  effectiveFlowForCategory,
  resolveWizardPages,
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

  it("returns custom field_groups from a row unchanged", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: ["title-photos", "category-attributes", "review-publish"],
      }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).fieldGroups).toEqual([
      "category-select",
      "title-photos",
      "category-attributes",
      "review-publish",
    ]);
  });
});

describe("resolveWizardPages", () => {
  const flowWithCategorySelect = ["category-select", ...DEFAULT_FIELD_GROUPS];

  it("reproduces today's web split for the default flow (chunks of 4, ends pinned)", () => {
    expect(resolveWizardPages(flowWithCategorySelect, { native: false })).toEqual([
      ["category-select"],
      ["title-photos", "category-attributes", "condition", "price"],
      ["description-keywords"],
      ["delivery-location", "review-publish"],
    ]);
  });

  it("reproduces today's native split for the default flow (chunks of 3, ends pinned)", () => {
    expect(resolveWizardPages(flowWithCategorySelect, { native: true })).toEqual([
      ["category-select"],
      ["title-photos", "category-attributes", "condition"],
      ["price", "description-keywords"],
      ["delivery-location"],
      ["review-publish"],
    ]);
  });

  it("produces fewer, smaller pages for a category with fewer groups", () => {
    const groups = ["title-photos", "category-attributes", "review-publish"];
    expect(resolveWizardPages(groups, { native: false })).toEqual([
      ["title-photos", "category-attributes"],
      ["review-publish"],
    ]);
    expect(resolveWizardPages(groups, { native: true })).toEqual([
      ["title-photos", "category-attributes"],
      ["review-publish"],
    ]);
  });

  it("handles an empty field-group list", () => {
    expect(resolveWizardPages([], { native: false })).toEqual([]);
    expect(resolveWizardPages([], { native: true })).toEqual([]);
  });
});
