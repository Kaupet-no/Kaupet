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
  it("skjuler presise søkevalg til brukeren åpner dem og beholder handlingene", () => {
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

    expect(queryByRole("button", { name: "Minst ett" })).toBeNull();

    fireEvent.click(getByRole("button", { name: "Presist søk" }));
    fireEvent.click(getByRole("button", { name: "Minst ett" }));
    fireEvent.click(getByRole("button", { name: /Legg til søkelinje/ }));

    expect(onQModeChange).toHaveBeenCalledWith("any");
    expect(onExtraGroupsChange).toHaveBeenCalledWith([
      expect.objectContaining({ exclude: false, terms: [] }),
    ]);
  });
});
