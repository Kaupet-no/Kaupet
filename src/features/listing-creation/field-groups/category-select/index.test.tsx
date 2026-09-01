// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import type { WizardSharedProps } from "../types";
import { CategorySelect } from ".";

vi.mock("@/components/category-picker", () => ({
  CategoryPicker: () => <div>Kategorivelger</div>,
}));

vi.mock("@/components/category-suggestion-dialog", () => ({
  CategorySuggestionDialog: () => <button type="button">Savner du en kategori?</button>,
}));

function props(native: boolean): WizardSharedProps {
  return {
    native,
    errors: {},
    categories: [],
    categoryId: "",
    onCategorySelect: vi.fn(),
    categorySuggestions: [],
    categoryTouchedManually: false,
    applyCategorySuggestion: vi.fn(),
    setSuggestionDismissed: vi.fn(),
    setCategorySuggestion: vi.fn(),
    bilOgMcCategoryId: null,
  } as unknown as WizardSharedProps;
}

describe("CategorySelect", () => {
  it("viser kategorivalg og kategoriforslag på første native kort", () => {
    render(<CategorySelect {...props(true)} />);

    expect(screen.queryByTestId("listing-title-input")).toBeNull();
    expect(screen.queryByText("Bruk forslag")).toBeNull();
    expect(screen.getByText("Kategorivelger")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Savner du en kategori?" })).toBeTruthy();
  });

  it("viser kategoriforslag også når kategorien velges manuelt på web", () => {
    render(<CategorySelect {...props(false)} />);

    expect(screen.getByRole("button", { name: "Savner du en kategori?" })).toBeTruthy();
  });
});
