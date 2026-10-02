// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RangeFilterField } from "./range-filter-field";

// Radix' størrelsesmåling i jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
// Radix' slider fanger pekeren ved berøring; jsdom har ikke API-et.
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

afterEach(cleanup);

const bounds = { min: 0, max: 10_000, step: 100, unit: "kr" };

describe("RangeFilterField i skuffen", () => {
  it("viser fordelingen først ved berøring, utenfor layouten", () => {
    const { container } = render(
      <RangeFilterField
        label="Pris"
        variant="sheet"
        bounds={bounds}
        value={{}}
        onChange={vi.fn()}
        histogram={[1, 3, 2]}
        revealHistogramOnDrag
      />,
    );
    const graph = container.querySelector('[aria-hidden="true"].absolute');

    // Absolutt plassert: å vise den kan ikke flytte slideren.
    expect(graph).not.toBeNull();
    expect(graph!.className).toContain("scale-y-0");

    fireEvent.pointerDown(container.querySelector("[data-orientation]")!);
    expect(graph!.className).toContain("scale-y-100");
  });

  it("viser fordelingen med en gang når den ikke venter på berøring", () => {
    const { container } = render(
      <RangeFilterField
        label="Pris"
        variant="sheet"
        bounds={bounds}
        value={{}}
        onChange={vi.fn()}
        histogram={[1, 3, 2]}
      />,
    );
    expect(container.querySelector('[aria-hidden="true"].absolute')).toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(3);
  });
});
