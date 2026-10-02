// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CategoryAttributes } from ".";
import type { WizardSharedProps } from "../types";

vi.mock("@/components/attribute-fields", () => ({
  AttributeFields: () => null,
  useAllCategoryFilters: () => ({
    data: [
      {
        category_id: "grill",
        key: "fuel_type",
        label_nb: "Brenseltype",
        type: "select",
        sort_order: 0,
      },
      {
        category_id: "vehicle",
        key: "fuel_type",
        label_nb: "Drivstoff",
        type: "select",
        sort_order: 0,
      },
    ],
  }),
}));
afterEach(cleanup);

it("bruker valgt kategoris feltnavn i bekreftelsen av bildeforslag", async () => {
  render(
    <CategoryAttributes
      {...({
        errors: {},
        touchedFields: {},
        categoryId: "grill",
        categorySlug: "grill",
        categories: [
          { id: "grill", parent_id: null },
          { id: "vehicle", parent_id: null },
        ],
        attributes: {},
        behavior: { showGenericAttributes: true },
        photoAttributesAvailable: true,
        onAttributesChange: vi.fn(),
        requestPhotoAttributeSuggestions: vi.fn(async () => [{ key: "fuel_type", value: "gas" }]),
      } as unknown as WizardSharedProps)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Foreslå detaljer fra bildene" }));
  expect(
    await screen.findByText("Kaupet fylte ut Brenseltype fra bildene. Sjekk at det stemmer."),
  ).toBeTruthy();
  expect(screen.queryByText(/Drivstoff/)).toBeNull();
});
