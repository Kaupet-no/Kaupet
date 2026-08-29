// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { BoatFactsGroup } from ".";
import { CategoryAttributes } from "../category-attributes";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ handler: () => vi.fn() }),
  }),
  useServerFn: () => vi.fn(),
}));
vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: ({
    filterKeys,
    required,
  }: {
    filterKeys?: readonly string[];
    required?: boolean;
  }) => (
    <div
      data-testid={`attribute-fields-${filterKeys?.join("-") ?? "all"}`}
      data-required={required ? "true" : "false"}
    />
  ),
  useAllCategoryFilters: () => ({ data: [] }),
}));

const categories = [{ id: "boat", parent_id: null, name_nb: "Båter" }];

function props(overrides: Partial<WizardSharedProps> = {}): WizardSharedProps {
  return {
    native: false,
    register: vi.fn(() => ({})) as unknown as WizardSharedProps["register"],
    showMileage: false,
    behavior: { showGenericAttributes: true } as WizardSharedProps["behavior"],
    errors: {},
    touchedFields: {},
    subtitle: "",
    description: "",
    categoryId: "boat",
    categories,
    attributes: {},
    onAttributesChange: vi.fn(),
    attributesTouched: false,
    genericAttributesActive: true,
    boatFactsActive: true,
    vehicleAttributeHiddenKeys: [],
    extraFieldError: null,
    categoryLabel: "Båter",
    title: "",
    titleExample: null,
    condition: "good",
    isFree: false,
    canShip: "pickup",
    priceNok: "",
    postalCode: "",
    city: "",
    knownIssues: "",
    noKnownIssues: false,
    maintenanceHistory: "",
    categorySuggestions: [],
    categorySuggestionLoading: false,
    categoryTouchedManually: false,
    applyCategorySuggestion: vi.fn(),
    setSuggestionDismissed: vi.fn(),
    setCategorySuggestions: vi.fn(),
    setCategoryPickerOpen: vi.fn(),
    onCategorySelect: vi.fn(),
    images: [],
    setImages: vi.fn(),
    uploadProgress: null,
    keywordsFetching: false,
    keywordSuggestions: [],
    appendTagToDescription: vi.fn(),
    ...overrides,
  } as unknown as WizardSharedProps;
}

afterEach(() => cleanup());

describe("BoatFactsGroup", () => {
  it("viser fire progressive seksjoner med bare Grunnleggende åpen først", () => {
    render(<BoatFactsGroup {...props()} />);

    expect(screen.getByTestId("boat-facts-basic").getAttribute("open")).not.toBeNull();
    expect(screen.getByTestId("boat-facts-motor").getAttribute("open")).toBeNull();
    expect(screen.getByTestId("boat-facts-more").getAttribute("open")).toBeNull();
    expect(screen.getByTestId("boat-facts-description").getAttribute("open")).toBeNull();
    expect(screen.getByText("Grunnleggende")).toBeTruthy();
    expect(screen.getByText("Motor og kapasitet")).toBeTruthy();
    expect(screen.getByText("Flere opplysninger")).toBeTruthy();
    expect(screen.getAllByText("Beskrivelse").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Merke/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/Modell/)).toHaveLength(1);
    for (const field of screen.getAllByTestId(/^attribute-fields-/)) {
      expect(field.getAttribute("data-required")).toBe("true");
    }
  });

  it("lar boat-facts eie kategoriattributtene uten å spørre generic attributes på nytt", () => {
    render(
      <CategoryAttributes
        {...props({
          genericAttributesActive: true,
          errors: {},
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /Båter/ })).toBeTruthy();
    expect(screen.queryByTestId(/^attribute-fields-/)).toBeNull();
  });
});
