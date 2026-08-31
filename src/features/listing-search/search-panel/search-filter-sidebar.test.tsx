// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { priceBoundsForMax } from "@/lib/filter-range-bounds";
import { SearchFilterSidebar } from "./search-filter-sidebar";
vi.mock("@/components/ui/native-sheet", () => ({
  NativeSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) => (open ? <div aria-label={title}>{children}</div> : null),
}));
vi.mock("@/components/advanced-search-sheet", () => ({
  CategoryPicker: () => <div>kategorivelger</div>,
}));
vi.mock("@/lib/native", () => ({
  isNative: () => false,
  checkLocationPermission: async () => "prompt",
}));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: () => {} }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
// LocationPicker spør om posisjonstillatelse ved mount; jsdom har ingen.
Object.defineProperty(navigator, "permissions", {
  configurable: true,
  value: { query: async () => ({ state: "prompt", addEventListener: () => {} }) },
});

afterEach(cleanup);

describe("SearchFilterSidebar", () => {
  /** Sidekolonnen har ikke «Vis annonser»-knapp — endringer må gjelde med én
   * gang, ellers blir filtrene stående uten vei ut. */
  it("bruker et valg umiddelbart i stedet for å samle opp et utkast", () => {
    const onApply = vi.fn();
    const { getByLabelText } = render(
      <SearchFilterSidebar
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply,
        }}
        categories={[]}
      />,
    );

    fireEvent.click(getByLabelText("Som ny"));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].value.conditions).toEqual(["like_new"]);
  });

  it("nullstiller alt fra ett sted når noe er aktivt", () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <SearchFilterSidebar
        results={{
          applied: {
            value: { ...defaultAdvancedSearchValue(), conditions: ["like_new"] },
            attributes: {},
          },
          onApply,
        }}
        categories={[]}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Nullstill" }));

    expect(onApply.mock.calls[0][0]).toEqual({
      value: defaultAdvancedSearchValue(),
      attributes: {},
    });
  });

  it("viser høyeste pris fra treffene i prisfilteret", () => {
    const { getByText } = render(
      <SearchFilterSidebar
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply: vi.fn(),
          availablePriceMax: 42_500,
        }}
        categories={[]}
      />,
    );

    expect(getByText("0 kr – 43 000 kr+")).toBeTruthy();
  });
});

describe("priceBoundsForMax", () => {
  it("tilpasser maksimum til billige og dyre treff uten å runde ned", () => {
    expect(priceBoundsForMax(48_250).max).toBe(49_000);
    expect(priceBoundsForMax(1_250_001).max).toBe(1_251_000);
  });

  it("bevarer aktive verdier og gir en brukbar fallback uten pris", () => {
    expect(priceBoundsForMax(null, { min: 25_000, max: 50_000 }).max).toBe(50_000);
    expect(priceBoundsForMax(null).max).toBe(1_000);
  });
});
