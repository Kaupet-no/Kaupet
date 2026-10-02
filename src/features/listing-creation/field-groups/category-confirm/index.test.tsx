// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { CategoryConfirm } from ".";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

const BIL_OG_MC_ID = "bil-og-mc";
const BIL_ID = "bil";
const MC_ID = "mc";
const SKO_ID = "sko";

const categories = [
  { id: BIL_OG_MC_ID, parent_id: null, name_nb: "Bil og MC" },
  { id: BIL_ID, parent_id: BIL_OG_MC_ID, name_nb: "Bil" },
  { id: MC_ID, parent_id: BIL_OG_MC_ID, name_nb: "Motorsykkel" },
  { id: SKO_ID, parent_id: null, name_nb: "Sko" },
];

function props(overrides: Partial<WizardSharedProps>): WizardSharedProps {
  return {
    categories,
    categoryId: "",
    categorySuggestionLoading: false,
    applyCategorySuggestion: vi.fn(),
    onCategorySelect: vi.fn(),
    bilOgMcCategoryId: BIL_OG_MC_ID,
    categorySuggestions: [],
    ...overrides,
  } as unknown as WizardSharedProps;
}

describe("CategoryConfirm", () => {
  it("viser eksplisitt status og manuell fallback mens kategori lastes", () => {
    render(<CategoryConfirm {...props({ categorySuggestionLoading: true })} />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Finner passende kategori …")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Velg kategori selv" }));

    expect(screen.getByText("Velg kategori")).toBeTruthy();
  });

  it("viser alle kandidater også når begge er kjøretøy", () => {
    const applyCategorySuggestion = vi.fn();
    render(
      <CategoryConfirm
        {...props({
          applyCategorySuggestion,
          categorySuggestions: [
            { category_id: BIL_ID, parent_id: BIL_OG_MC_ID, name_nb: "Bil", parent_name_nb: null },
            {
              category_id: MC_ID,
              parent_id: BIL_OG_MC_ID,
              name_nb: "Motorsykkel",
              parent_name_nb: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Bruk «Bil»" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bruk «Motorsykkel»" }));
    expect(applyCategorySuggestion).toHaveBeenCalledWith(MC_ID);
  });

  it("viser bilde- og tittelforslag samlet uten duplikater", () => {
    const onCategorySelect = vi.fn();
    const shoe = { category_id: SKO_ID, parent_id: null, name_nb: "Sko", parent_name_nb: null };
    render(
      <CategoryConfirm
        {...props({
          onCategorySelect,
          photoCategorySuggestions: [shoe],
          categorySuggestions: [
            shoe,
            { category_id: BIL_ID, parent_id: BIL_OG_MC_ID, name_nb: "Bil", parent_name_nb: null },
          ],
        })}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Bruk «Sko»" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Bruk «Bil»" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bruk «Sko»" }));
    expect(onCategorySelect).toHaveBeenCalledWith(SKO_ID, SKO_ID);
  });

  it("keeps the per-name question for a non-vehicle suggestion", () => {
    render(
      <CategoryConfirm
        {...props({
          categorySuggestions: [
            { category_id: SKO_ID, parent_id: null, name_nb: "Sko", parent_name_nb: null },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("Denne annonsen blir opprettet i kategori Sko. Er det riktig?"),
    ).toBeTruthy();
  });

  it("keeps the 'X eller Y' question when only some suggestions are vehicle leaves", () => {
    render(
      <CategoryConfirm
        {...props({
          categorySuggestions: [
            { category_id: BIL_ID, parent_id: BIL_OG_MC_ID, name_nb: "Bil", parent_name_nb: null },
            { category_id: SKO_ID, parent_id: null, name_nb: "Sko", parent_name_nb: null },
          ],
        })}
      />,
    );

    expect(screen.getByText("Velg kategorien som passer best for annonsen.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Velg en annen kategori" })).toBeTruthy();
  });
});
