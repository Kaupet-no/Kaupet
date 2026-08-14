// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { CategorySelect } from ".";

vi.mock("@/components/category-picker", () => ({
  CategoryPicker: () => <div>Kategorivelger</div>,
}));

function props(native: boolean): WizardSharedProps {
  return {
    native,
    errors: {},
    categories: [],
    categoryId: "",
    onCategorySelect: vi.fn(),
    categorySuggestion: { id: "bike", name_nb: "Sykkel", parent_name_nb: null },
    categoryTouchedManually: false,
    applyCategorySuggestion: vi.fn(),
    setSuggestionDismissed: vi.fn(),
    setCategorySuggestion: vi.fn(),
    bilOgMcCategoryId: null,
  } as unknown as WizardSharedProps;
}

describe("CategorySelect", () => {
  it("viser bare kategorivalg på første native kort", () => {
    render(<CategorySelect {...props(true)} />);

    expect(screen.queryByTestId("listing-title-input")).toBeNull();
    expect(screen.queryByText("Bruk forslag")).toBeNull();
    expect(screen.getByText("Kategorivelger")).toBeTruthy();
  });
});
