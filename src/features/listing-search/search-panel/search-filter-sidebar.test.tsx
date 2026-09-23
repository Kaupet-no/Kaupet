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
  CategorySlugPicker: () => <div>kategorivelger</div>,
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
  it("fjerner kategori og tilhørende attributter fra oppsummeringen", () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <SearchFilterSidebar
        results={{
          applied: {
            value: { ...defaultAdvancedSearchValue(), categories: ["bil"] },
            attributes: { make: { kind: "multiselect", values: ["volvo"] } },
          },
          onApply,
        }}
        categories={[{ id: "1", slug: "bil", name_nb: "Bil", parent_id: null }]}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Fjern Bil" }));

    expect(onApply.mock.calls[0][0].value.categories).toEqual([]);
    expect(onApply.mock.calls[0][0].attributes).toEqual({});
  });

  it("lar brukeren fjerne et aktivt prisfilter fra oppsummeringen", () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <SearchFilterSidebar
        results={{
          applied: {
            value: { ...defaultAdvancedSearchValue(), max: 250_000 },
            attributes: {},
          },
          onApply,
        }}
        categories={[]}
      />,
    );

    fireEvent.click(getByRole("button", { name: /Fjern Maks 250/ }));

    expect(onApply.mock.calls[0][0].value.max).toBeNull();
  });

  /** Sidekolonnen har ikke «Vis annonser»-knapp — endringer må gjelde med én
   * gang, ellers blir filtrene stående uten vei ut. */
  it("bruker et valg umiddelbart i stedet for å samle opp et utkast", () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <SearchFilterSidebar
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply,
        }}
        categories={[]}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Som ny" }));

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

  it("holder søkeregler ved søkefeltet og bevarer dem når desktop-filtre nullstilles", () => {
    const onApply = vi.fn();
    const rule = { id: "exclude", mode: "any" as const, exclude: true, terms: ["kopi"] };
    const { getByRole, container } = render(
      <SearchFilterSidebar
        results={{
          applied: {
            value: {
              ...defaultAdvancedSearchValue(),
              terms: ["vintage", "lampe"],
              qMode: "any",
              extraGroups: [rule],
              categories: ["bil"],
            },
            attributes: {},
          },
          onApply,
        }}
        categories={[{ id: "1", slug: "bil", name_nb: "Bil", parent_id: null }]}
      />,
    );

    fireEvent.mouseDown(getByRole("tab", { name: "Mer" }), { button: 0 });
    expect(container.querySelector('[data-section="search"]')).toBeNull();
    fireEvent.click(getByRole("button", { name: "Nullstill" }));

    expect(onApply.mock.calls[0][0].value).toEqual(
      expect.objectContaining({
        terms: ["vintage", "lampe"],
        qMode: "any",
        extraGroups: [rule],
        categories: [],
      }),
    );
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

  it("holder panelet under headeren og ruller bare filterfeltene", () => {
    const { getByRole } = render(
      <SearchFilterSidebar
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply: vi.fn(),
        }}
        categories={[]}
        onSaveSearch={vi.fn()}
      />,
    );
    const sidebar = getByRole("complementary", { name: "Filtrer annonser" });
    const saveButton = getByRole("button", { name: "Lagre søk" });
    expect(sidebar.className).toContain("top-[calc(var(--site-header-h)+0.75rem)]");
    expect(sidebar.className).toContain("max-h-[calc(100dvh-var(--site-header-h)-1.5rem)]");
    sidebar.style.top = "85px";
    sidebar.getBoundingClientRect = () => ({ top: -50 }) as DOMRect;
    sidebar.parentElement!.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect;
    window.dispatchEvent(new Event("scroll"));
    expect(sidebar.style.maxHeight).toBe("303px");
    expect(saveButton.parentElement?.parentElement).toBe(sidebar);
    const filterFields = getByRole("tabpanel");
    expect(filterFields.className).toContain("overflow-y-auto");
    expect(sidebar.firstElementChild?.className).not.toContain("overflow-y-auto");
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
