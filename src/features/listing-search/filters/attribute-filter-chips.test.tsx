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
