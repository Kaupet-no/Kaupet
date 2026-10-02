// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./search-bar";
import type { TermGroup } from "@/lib/term-groups";

vi.mock("@/features/listing-search/use-search-suggestions", () => ({
  useSearchSuggestions: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-default-search-examples", () => ({
  useDefaultSearchExamples: () => [],
}));

afterEach(cleanup);

describe("SearchBar", () => {
  it("viser Waypoints-knappen i mobilfeltet uten tall og markerer egne regler med fyll", () => {
    const onOpenRules = vi.fn();
    const onSubmitQ = vi.fn();
    const { container, getByRole, rerender } = render(
      <SearchBar
        q="lampe"
        onQChange={() => {}}
        onSubmitQ={onSubmitQ}
        qMode="all"
        onQModeChange={() => {}}
        onOpenRules={onOpenRules}
      />,
    );
    expect(getByRole("button", { name: "Søkeregler" }).className).not.toContain("bg-primary");
    const searchButton = getByRole("button", { name: "Søk" });
    expect(searchButton.className).toContain("size-12");
    expect(container.querySelectorAll("svg.lucide-search")).toHaveLength(1);
    fireEvent.click(searchButton);
    expect(onSubmitQ).toHaveBeenCalledOnce();
    fireEvent.click(getByRole("button", { name: "Søkeregler" }));
    expect(onOpenRules).toHaveBeenCalledOnce();

    rerender(
      <SearchBar
        q="lampe"
        onQChange={() => {}}
        onSubmitQ={onSubmitQ}
        qMode="all"
        onQModeChange={() => {}}
        onOpenRules={onOpenRules}
        rulesActive
      />,
    );
    expect(getByRole("button", { name: "Søkeregler, egne regler aktive" }).className).toContain(
      "bg-primary",
    );
  });
  it("viser ordvalget i søkefeltet og en tom regel når søkebyggeren åpnes", () => {
    const onQModeChange = vi.fn();
    const onExtraGroupsChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <SearchBar
        q=""
        onQChange={() => {}}
        onSubmitQ={() => {}}
        qMode="all"
        onQModeChange={onQModeChange}
        showQMode
        extraGroups={[]}
        onExtraGroupsChange={onExtraGroupsChange}
      />,
    );

    const mode = getByRole("combobox", { name: "Søkeord" });
    expect(mode.textContent).toContain("Alle ordene");
    fireEvent.keyDown(mode, { key: "ArrowDown" });
    fireEvent.click(getByRole("option", { name: "Minst ett ord" }));

    fireEvent.click(getByRole("button", { name: "Legg til flere søkeregler" }));
    expect(
      getByRole("button", { name: "Legg til flere søkeregler" }).getAttribute("data-state"),
    ).toBe("open");
    expect(getByRole("textbox", { name: "Skal inneholde" })).toBeTruthy();
    expect(getByRole("textbox", { name: "Kan inneholde" })).toBeTruthy();
    expect(getByRole("textbox", { name: "Skal ikke inneholde" })).toBeTruthy();
    expect(queryByRole("button", { name: "Legg til regel" })).toBeNull();
    expect(onExtraGroupsChange).not.toHaveBeenCalled();
    const words = getByRole("textbox", { name: "Skal ikke inneholde" });
    fireEvent.change(words, {
      target: { value: "messing, bronse tre" },
    });
    expect((words as HTMLInputElement).value).toBe("messing, bronse tre");
    fireEvent.blur(words);

    expect(onQModeChange).toHaveBeenCalledWith("any");
    expect(onExtraGroupsChange).toHaveBeenCalledWith([
      expect.objectContaining({ exclude: true, mode: "any", terms: ["messing", "bronse", "tre"] }),
    ]);
  });

  it("viser aktive søkeregler automatisk under søkefeltet", () => {
    const { getByRole } = render(
      <SearchBar
        q="vintage lampe"
        onQChange={() => {}}
        onSubmitQ={() => {}}
        qMode="any"
        onQModeChange={() => {}}
        showQMode
        extraGroups={[{ id: "exclude", mode: "any", exclude: true, terms: ["kopi"] }]}
        onExtraGroupsChange={() => {}}
      />,
    );

    expect(
      getByRole("button", { name: "Legg til flere søkeregler (1)" }).getAttribute("data-state"),
    ).toBe("open");
    expect((getByRole("textbox", { name: "Kan inneholde" }) as HTMLInputElement).value).toBe(
      "vintage lampe",
    );
    expect((getByRole("textbox", { name: "Skal ikke inneholde" }) as HTMLInputElement).value).toBe(
      "kopi",
    );
    expect((getByRole("textbox", { name: "Søk i annonser" }) as HTMLInputElement).value).toContain(
      "Skal ikke inneholde: kopi",
    );
  });

  it("viser bare gjenværende søkeord som primærregel", () => {
    const { queryByText, getByRole } = render(
      <SearchBar
        q="lampe"
        onQChange={() => {}}
        onSubmitQ={() => {}}
        qMode="all"
        onQModeChange={() => {}}
        showQMode
        extraGroups={[]}
        onExtraGroupsChange={() => {}}
        filterSuggestions={[{ id: "price", label: "Pris: under 3000", onSelect: () => {} }]}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Legg til flere søkeregler" }));
    expect((getByRole("textbox", { name: "Skal inneholde" }) as HTMLInputElement).value).toBe(
      "lampe",
    );
    expect(queryByText(/under 3000/)).toBeNull();
  });
  it("samler like regler og viser endringene i søkefeltet etter Enter", () => {
    const onSubmitQ = vi.fn();
    function Search() {
      const [q, setQ] = useState("gul grønn");
      const [groups, setGroups] = useState<TermGroup[]>([
        { id: "one", mode: "any", exclude: false, terms: ["blå"] },
        { id: "two", mode: "any", exclude: false, terms: ["rød"] },
      ]);
      return (
        <SearchBar
          q={q}
          onQChange={setQ}
          onSubmitQ={onSubmitQ}
          qMode="any"
          onQModeChange={() => {}}
          showQMode
          extraGroups={groups}
          onExtraGroupsChange={setGroups}
        />
      );
    }
    const { getByRole, getAllByRole } = render(<Search />);
    expect((getByRole("textbox", { name: "Kan inneholde" }) as HTMLInputElement).value).toBe(
      "gul grønn blå rød",
    );
    expect(getAllByRole("textbox", { name: "Kan inneholde" })).toHaveLength(1);
    fireEvent.change(getByRole("textbox", { name: "Kan inneholde" }), {
      target: { value: "gul, svart" },
    });
    fireEvent.keyDown(getByRole("textbox", { name: "Kan inneholde" }), { key: "Enter" });
    expect((getByRole("textbox", { name: "Søk i annonser" }) as HTMLInputElement).value).toBe(
      "gul svart",
    );
    expect(onSubmitQ).toHaveBeenCalledOnce();
  });
  it("beholder andre regler når søketeksten endres", () => {
    function Search() {
      const [q, setQ] = useState("gul");
      const [groups, setGroups] = useState<TermGroup[]>([
        { id: "exclude", mode: "any", exclude: true, terms: ["kopi"] },
      ]);
      return (
        <SearchBar
          q={q}
          onQChange={setQ}
          onSubmitQ={() => {}}
          qMode="all"
          onQModeChange={() => {}}
          showQMode
          extraGroups={groups}
          onExtraGroupsChange={setGroups}
        />
      );
    }
    const { getByRole } = render(<Search />);
    const query = getByRole("textbox", { name: "Søk i annonser" }) as HTMLInputElement;
    fireEvent.focus(query);
    fireEvent.change(query, { target: { value: "grønn" } });
    fireEvent.submit(query.form!);
    expect(query.value).toContain("Skal ikke inneholde: kopi");
    expect((getByRole("textbox", { name: "Skal ikke inneholde" }) as HTMLInputElement).value).toBe(
      "kopi",
    );
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
