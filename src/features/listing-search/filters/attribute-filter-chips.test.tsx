// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SEARCH_RADIUS_KM } from "@/lib/advanced-search-value";
import { AttributeFilterChips } from "./attribute-filter-chips";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AttributeFilterChips: sted/radius", () => {
  it("viser standardradius 10 km når søket ikke har lokasjon", () => {
    // Radix Slider trenger ResizeObserver, som jsdom ikke har.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(
      <AttributeFilterChips
        filters={[]}
        values={{}}
        onChange={vi.fn()}
        layout="card"
        onLocationChange={vi.fn()}
        onPriceChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sted/ }));

    // Konkret verdi: fanger utilsiktet endring av standarden.
    expect(DEFAULT_SEARCH_RADIUS_KM).toBe(10);
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("10");
    expect(screen.getByText("10 km", { selector: "span.font-display" })).toBeTruthy();
  });
});

describe("AttributeFilterChips: flervalg – skjermlesertilstand (KG-36-F01)", () => {
  it("eksponerer valg som avkrysningsbokser med antall i navnet, og filtrerer på søk", () => {
    const onChange = vi.fn();
    render(
      <AttributeFilterChips
        filters={[
          {
            id: "f-fuel",
            category_id: "c-bil",
            key: "fuel_type",
            label_nb: "Drivstoff",
            type: "select",
            unit: null,
            options: [
              { value: "diesel", label_nb: "Diesel" },
              { value: "el", label_nb: "Elektrisitet" },
            ],
            sort_order: 0,
            is_primary: true,
            depends_on_key: null,
            depends_on_value: null,
            depends_on_not_value: null,
            is_optional: false,
          },
        ]}
        values={{ fuel_type: { kind: "multiselect", values: ["el"] } }}
        counts={{ fuel_type: { diesel: 98 } }}
        onChange={onChange}
        layout="card"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Drivstoff|Elektrisitet/ }));

    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Diesel (98)" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(
      screen.getByRole("checkbox", { name: "Elektrisitet" }).getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("checkbox", { name: "Diesel (98)" }));
    expect(onChange).toHaveBeenCalledWith("fuel_type", {
      kind: "multiselect",
      values: ["el", "diesel"],
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "elek" } });
    expect(screen.queryByRole("checkbox", { name: "Diesel (98)" })).toBeNull();
  });
});
