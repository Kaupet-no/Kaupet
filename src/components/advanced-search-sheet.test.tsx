// @vitest-environment jsdom

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryPicker } from "./advanced-search-sheet";

const categories = [
  { id: "electronics", slug: "elektronikk", name_nb: "Elektronikk", parent_id: null },
  { id: "tv", slug: "tv-og-lyd", name_nb: "TV og lyd", parent_id: "electronics" },
  { id: "televisions", slug: "tv", name_nb: "TV", parent_id: "tv" },
];

describe("CategoryPicker", () => {
  it("bruker native drill-down uten ankret underkategori-dropdown", () => {
    const onChange = vi.fn();
    render(
      <CategoryPicker categories={categories} selected={[]} onChange={onChange} variant="icons" />,
    );

    expect(screen.getByRole("textbox", { name: "Søk i kategorier" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Elektronikk" }));
    expect(screen.getByRole("button", { name: "TV og lyd" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TV og lyd" }));
    expect(screen.getByRole("button", { name: "TV" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TV" }));

    expect(onChange).toHaveBeenCalledWith(["tv"]);
  });

  it("viser valgt kategori semantisk og lar brukeren fjerne den", () => {
    const onChange = vi.fn();
    function ControlledPicker() {
      const [selected, setSelected] = useState(["tv"]);
      return (
        <CategoryPicker
          categories={categories}
          selected={selected}
          onChange={(next) => {
            onChange(next);
            setSelected(next);
          }}
          variant="icons"
        />
      );
    }

    render(<ControlledPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Fjern TV" }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByLabelText("Valgte kategorier")).toBeNull();
  });
});
