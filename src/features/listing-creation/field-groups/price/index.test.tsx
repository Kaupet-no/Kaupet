// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { Price } from ".";

afterEach(() => cleanup());

function baseProps(overrides: Partial<WizardSharedProps> = {}) {
  return {
    register: vi.fn(() => ({
      name: "price_nok",
      ref: vi.fn(),
      onChange: vi.fn(),
      onBlur: vi.fn(),
    })),
    errors: {},
    touchedFields: {},
    isFree: false,
    setValue: vi.fn(),
    priceNok: "",
    wtbMatch: null,
    isVehicle: false,
    vehicleClassification: null,
    vehicleLookupResult: null,
    attributes: {},
    onAttributesChange: vi.fn(),
    lockedFree: undefined,
    similarListings: undefined,
    ...overrides,
  } as unknown as WizardSharedProps;
}

describe("Price", () => {
  it("viser ikke '0' som verdi eller placeholder når feltet er tomt", () => {
    render(<Price {...baseProps()} />);

    const input = screen.getByLabelText(/Pris/) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("");
  });

  it("viser lignende-pris-hint kun ved minst 3 datapunkter", () => {
    const listings = (n: number[]) =>
      n.map((price_nok, i) => ({
        id: String(i),
        title: `Annonse ${i}`,
        price_nok,
        is_free: false,
        city: null,
        category_slug: null,
        attributes: null,
      }));

    const { rerender } = render(
      <Price {...baseProps({ similarListings: listings([1000, 1200]) })} />,
    );
    expect(screen.queryByText(/Lignende til salgs for/)).toBeNull();

    rerender(
      <Price {...baseProps({ similarListings: listings([1000, 1200, 2400, 2000, 1500]) })} />,
    );
    expect(screen.getByText("Lignende til salgs for 1 200–2 000 kr")).toBeTruthy();
  });
});
