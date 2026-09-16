// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { CategoryPicker } from "./category-picker";

const categories = [
  { id: "friluft", name_nb: "Sport og friluft", parent_id: null },
  { id: "sykkel-parent", name_nb: "Sykkel", parent_id: "friluft" },
  { id: "sykkel-leaf", name_nb: "Sykkel", parent_id: "sykkel-parent" },
  { id: "sykkeldeler", name_nb: "Sykkeldeler", parent_id: "sykkel-parent" },
];

function setup() {
  return render(
    <CategoryPicker
      open
      onOpenChange={vi.fn()}
      categories={categories}
      selectedId=""
      onSelect={vi.fn()}
      inline
    />,
  );
}

describe("CategoryPicker", () => {
  it("merker hovedkategorien med underkategorier i søketreff, ikke bladkategorien", () => {
    setup();

    fireEvent.change(screen.getByTestId("category-search-input"), {
      target: { value: "sykkel" },
    });

    const tiles = screen.getAllByTestId("category-tile");
    // "Sport og friluft / Sykkel" (mellomnivå, har underkategorier "Sykkel" og
    // "Sykkeldeler") og "Sport og friluft / Sykkel / Sykkel" (bladkategori) er
    // nesten identiske etiketter — kun hovedkategorien skal ha merket.
    const parentTile = tiles.find(
      (t) =>
        t.getAttribute("data-category-name") === "Sykkel" &&
        t.textContent?.includes("Hovedkategori"),
    );
    const leafTile = tiles.find(
      (t) =>
        t.getAttribute("data-category-name") === "Sykkel" &&
        !t.textContent?.includes("Hovedkategori"),
    );

    expect(parentTile).toBeTruthy();
    expect(leafTile).toBeTruthy();
    expect(parentTile).not.toBe(leafTile);
  });

  it("viser ikke merket for en bladkategori uten underkategorier", () => {
    setup();

    fireEvent.change(screen.getByTestId("category-search-input"), {
      target: { value: "sykkeldeler" },
    });

    const tile = screen.getByTestId("category-tile");
    expect(tile.textContent).not.toContain("Hovedkategori");
  });
});
