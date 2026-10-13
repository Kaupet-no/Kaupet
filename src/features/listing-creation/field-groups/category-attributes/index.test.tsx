// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function props(overrides: Partial<Record<string, unknown>>) {
  return {
    errors: {},
    touchedFields: {},
    categoryId: "grill",
    categorySlug: "grill",
    categories: [{ id: "grill", parent_id: null }],
    attributes: {},
    behavior: { showGenericAttributes: true },
    photoAttributesAvailable: true,
    onAttributesChange: vi.fn(),
    requestPhotoAttributeSuggestions: vi.fn(async () => []),
    ...overrides,
  } as unknown as WizardSharedProps;
}

// KG-19-F01: sent forslag bygde på øyeblikksbildet fra før svaret og overskrev manuelle verdier.
it("sent forslag overskriver ikke et felt brukeren fylte mens svaret ventet", async () => {
  let resolve!: (value: { key: string; value: string }[]) => void;
  const request = vi.fn(
    () =>
      new Promise<{ key: string; value: string }[]>((r) => {
        resolve = r;
      }),
  );
  const onAttributesChange = vi.fn();
  const { rerender } = render(
    <CategoryAttributes
      {...props({ requestPhotoAttributeSuggestions: request, onAttributesChange })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Foreslå detaljer fra bildene" }));
  rerender(
    <CategoryAttributes
      {...props({
        requestPhotoAttributeSuggestions: request,
        onAttributesChange,
        attributes: { color: "blue" },
      })}
    />,
  );
  await act(async () =>
    resolve([
      { key: "color", value: "red" },
      { key: "fuel_type", value: "gas" },
    ]),
  );
  await waitFor(() => expect(onAttributesChange).toHaveBeenCalled());
  expect(onAttributesChange).toHaveBeenLastCalledWith({ color: "blue", fuel_type: "gas" });
});

it("Angre beholder et foreslått felt som brukeren har endret", async () => {
  const onAttributesChange = vi.fn();
  const request = vi.fn(async () => [
    { key: "color", value: "red" },
    { key: "fuel_type", value: "gas" },
  ]);
  const { rerender } = render(
    <CategoryAttributes
      {...props({ requestPhotoAttributeSuggestions: request, onAttributesChange })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Foreslå detaljer fra bildene" }));
  await screen.findByRole("button", { name: "Angre" });
  rerender(
    <CategoryAttributes
      {...props({
        requestPhotoAttributeSuggestions: request,
        onAttributesChange,
        attributes: { color: "red", fuel_type: "diesel" },
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Angre" }));
  expect(onAttributesChange).toHaveBeenLastCalledWith({ fuel_type: "diesel" });
});
