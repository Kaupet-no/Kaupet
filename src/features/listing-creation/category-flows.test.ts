import { describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/category-filters";

import {
  DEFAULT_FIELD_GROUPS,
  DEFAULT_MODULES,
  effectiveFlowForCategory,
  resolveWizardPages,
  withRuntimeFieldGroups,
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

  it("deduplicates repeated field groups, keeping the first occurrence", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: [
          "photos",
          "category-attributes",
          "title-photos",
          "description-keywords",
          "review-publish",
        ],
      }),
    ];
    expect(effectiveFlowForCategory("cars", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "category-attributes",
      "title",
      "description-keywords",
      "review-publish",
    ]);
  });

  it("hoists photos first and drops title when entered from the landing screen", () => {
    expect(effectiveFlowForCategory(null, [], byId, true).fieldGroups).toEqual([
      "photos",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ]);
  });

  it("keeps photos first in a vehicle flow entered from the landing screen", () => {
    const flows = [
      row({
        category_id: "cars",
        field_groups: [
          "vehicle-registration",
          "category-attributes",
          "title-photos",
          "vehicle-facts",
          "vehicle-condition",
          "description-keywords",
          "delivery-location",
          "review-publish",
        ],
      }),
    ];
    // The images step must stay step 1 both before and after the flow swap at
    // category-confirm — otherwise it reappears mid-vehicle-flow.
    expect(effectiveFlowForCategory("cars", flows, byId, true).fieldGroups).toEqual([
      "photos",
      "vehicle-registration",
      "category-attributes",
      "vehicle-facts",
      "vehicle-condition",
      "location",
      "review-publish",
    ]);
  });

  it("drops description-keywords, and pins equipment right after facts (before condition)", () => {
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
      "vehicle-equipment",
      "vehicle-condition",
      "location",
      "review-publish",
    ]);
  });
});

describe("resolveWizardPages", () => {
  const flowWithCategorySelect = ["category-select", ...DEFAULT_FIELD_GROUPS];

  it("bruker de samme fire oppgavesidene på web og native", () => {
    const expected = [
      ["category-select"],
      ["photos", "title"],
      ["category-attributes", "description-keywords"],
      ["condition", "price", "delivery", "location"],
      ["review-publish"],
    ];
    expect(resolveWizardPages(flowWithCategorySelect, { native: false })).toEqual(expected);
    expect(resolveWizardPages(flowWithCategorySelect, { native: true })).toEqual(expected);
  });

  it("produces fewer, smaller pages for a category with fewer groups", () => {
    const groups = ["photos", "title", "category-attributes", "review-publish"];
    const expected = [["photos", "title"], ["category-attributes"], ["review-publish"]];
    expect(resolveWizardPages(groups, { native: false })).toEqual(expected);
    expect(resolveWizardPages(groups, { native: true })).toEqual(expected);
  });

  it("handles an empty field-group list", () => {
    expect(resolveWizardPages([], { native: false })).toEqual([]);
    expect(resolveWizardPages([], { native: true })).toEqual([]);
  });

  it.each(["bil med oppslag", "uregistrert kjøretøy"])(
    "holder 360° utenfor Bil og MC-minimumsflyten for %s",
    () => {
      const groups = [
        "category-select",
        "vehicle-registration",
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
        ["category-attributes", "photos", "title", "condition", "price"],
        ["description-keywords"],
        ["delivery", "location", "review-publish"],
      ]);
      expect(resolveWizardPages(groups, { native: true })).toEqual([
        ["category-select"],
        ["vehicle-registration"],
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
    },
  );

  it("beholder første kategoriside etter bekreftelse når påkrevde attributter finnes", () => {
    const beforeConfirmation = [
      "photos",
      "category-confirm",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ];
    const afterConfirmation = beforeConfirmation.filter((key) => key !== "category-confirm");

    for (const native of [false, true]) {
      expect(resolveWizardPages(beforeConfirmation, { native })).toEqual([
        ["photos"],
        ["category-confirm"],
        ["category-attributes", "description-keywords"],
        ["condition", "price", "delivery", "location"],
        ["review-publish"],
      ]);
      expect(resolveWizardPages(afterConfirmation, { native })[1]).toEqual([
        "category-attributes",
        "description-keywords",
      ]);
    }
  });

  it("grupperer båtflyten i de samme oppgavene på web og native", () => {
    const groups = [
      "photos",
      "boat-facts",
      "category-attributes",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ];

    const expected = [
      ["photos"],
      ["boat-facts", "category-attributes", "description-keywords"],
      ["delivery", "location"],
      ["review-publish"],
    ];
    expect(resolveWizardPages(groups, { native: false })).toEqual(expected);
    expect(resolveWizardPages(groups, { native: true })).toEqual(expected);
  });
  it("holder registrering, fakta, tilstand og pris som stabile kjøretøysider", () => {
    const groups = [
      "photos",
      "vehicle-registration",
      "vehicle-facts",
      "vehicle-condition",
      "vehicle-price",
      "review-publish",
    ];
    const forceBreakBeforeKeys = new Set(["vehicle-facts", "vehicle-condition"]);
    const expected = [
      ["photos"],
      ["vehicle-registration"],
      ["vehicle-facts"],
      ["vehicle-condition"],
      ["vehicle-price"],
      ["review-publish"],
    ];

    expect(resolveWizardPages(groups, { native: false, forceBreakBeforeKeys })).toEqual(expected);
    expect(resolveWizardPages(groups, { native: true, forceBreakBeforeKeys })).toEqual(expected);
  });
});
describe("withRuntimeFieldGroups", () => {
  const landingFlow = ["photos", "category-attributes", "description-keywords", "review-publish"];
  const vehicleFlow = [
    "photos",
    "vehicle-registration",
    "category-attributes",
    "vehicle-facts",
    "review-publish",
  ];

  it("puts category-confirm right after photos while the suggestion is unconfirmed", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: true })).toEqual([
      "photos",
      "category-confirm",
      "category-attributes",
      "description-keywords",
      "review-publish",
    ]);
  });

  it("drops category-confirm once the category is confirmed", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: false })).toEqual(
      landingFlow,
    );
  });

  it("holder 360° utenfor minimumsflyten og legger pris rett før publisering", () => {
    expect(withRuntimeFieldGroups(vehicleFlow, { showCategoryConfirm: false })).toEqual([
      "photos",
      "vehicle-registration",
      "category-attributes",
      "vehicle-facts",
      "vehicle-price",
      "review-publish",
    ]);
  });

  it("never adds vehicle steps to a non-vehicle flow", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: false })).toEqual(
      landingFlow,
    );
  });

  it("keeps photos as step 1 across the flow swap at category-confirm", () => {
    // Bilder skal aldri spørres om to ganger: siden begge arrayene starter
    // på photos, peker stegindeksen på samme side før og etter byttet.
    const before = withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: true });
    const after = withRuntimeFieldGroups(vehicleFlow, { showCategoryConfirm: false });
    expect(before[0]).toBe("photos");
    expect(after[0]).toBe("photos");
    expect(after.filter((k) => k === "photos")).toHaveLength(1);
  });
});
