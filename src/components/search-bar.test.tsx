// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./search-bar";

vi.mock("@/features/listing-search/use-search-suggestions", () => ({
  useSearchSuggestions: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-default-search-examples", () => ({
  useDefaultSearchExamples: () => [],
}));

afterEach(cleanup);

describe("SearchBar", () => {
  it("skjuler flere søkevalg til brukeren åpner dem og beholder handlingene", () => {
    const onQModeChange = vi.fn();
    const onExtraGroupsChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <SearchBar
        q=""
        onQChange={() => {}}
        onSubmitQ={() => {}}
        qMode="all"
        onQModeChange={onQModeChange}
        extraGroups={[]}
        onExtraGroupsChange={onExtraGroupsChange}
      />,
    );

    expect(queryByRole("button", { name: "Minst ett ord" })).toBeNull();

    fireEvent.click(getByRole("button", { name: "Flere søkevalg" }));
    fireEvent.click(getByRole("button", { name: "Minst ett ord" }));
    fireEvent.click(getByRole("button", { name: /Legg til regel/ }));

    expect(onQModeChange).toHaveBeenCalledWith("any");
    expect(onExtraGroupsChange).toHaveBeenCalledWith([
      expect.objectContaining({ exclude: false, terms: [] }),
    ]);
  });
  it("viser søk kategori og filter som separate forslagstyper", () => {
    const onSubmitQ = vi.fn();
    const onCategorySelect = vi.fn();
    const onFilterSelect = vi.fn();
    const { getByRole, getByText } = render(
      <SearchBar
        q="iPhone"
        onQChange={() => {}}
        onSubmitQ={onSubmitQ}
        qMode="all"
        onQModeChange={() => {}}
        categorySuggestion={{ label: "Begrens søket til Elektronikk", onSelect: onCategorySelect }}
        filterSuggestions={[{ id: "price", label: "Pris: opptil 3 000", onSelect: onFilterSelect }]}
      />,
    );

    fireEvent.focus(getByRole("textbox", { name: "Søk i annonser" }));

    expect(getByRole("listbox", { name: "Søkeforslag" })).toBeTruthy();
    expect(getByText("Søk etter")).toBeTruthy();
    expect(getByText("Kategori")).toBeTruthy();
    expect(getByText("Filter")).toBeTruthy();
    fireEvent.click(getByRole("option", { name: "Søk etter «iPhone»" }));

    expect(onSubmitQ).toHaveBeenCalledOnce();
    expect(onCategorySelect).not.toHaveBeenCalled();
    expect(onFilterSelect).not.toHaveBeenCalled();
  });
});
