// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchSummaryPill } from "./search-summary-pill";

vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));
afterEach(cleanup);

describe("SearchSummaryPill", () => {
  it("skiller query- og filterhandlingen og viser aktivt filterantall", () => {
    const onOpenQuery = vi.fn();
    const onOpenFilters = vi.fn();
    render(
      <SearchSummaryPill
        q="sykkel"
        filterCount={2}
        onOpenQuery={onOpenQuery}
        onOpenFilters={onOpenFilters}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sykkel/ }));
    fireEvent.click(screen.getByRole("button", { name: /2 filtre aktive/ }));

    expect(onOpenQuery).toHaveBeenCalledOnce();
    expect(onOpenFilters).toHaveBeenCalledOnce();
  });

  it("viser søkeregler ved søket uten å telle dem som filtre", () => {
    const onOpenRules = vi.fn();
    render(
      <SearchSummaryPill
        q="lampe"
        filterCount={0}
        searchRuleCount={2}
        onOpenQuery={() => {}}
        onOpenRules={onOpenRules}
        onOpenFilters={() => {}}
      />,
    );

    const rules = screen.getByRole("button", { name: "Søkeregler, egne regler aktive" });
    expect(rules.className).toContain("bg-primary");
    fireEvent.click(rules);
    expect(onOpenRules).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Filtrer" })).toBeTruthy();
  });

  it("lar standard søkeregler stå uten fyll", () => {
    render(
      <SearchSummaryPill
        q="lampe"
        filterCount={0}
        onOpenQuery={() => {}}
        onOpenRules={() => {}}
        onOpenFilters={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Søkeregler" }).className).not.toContain(
      "bg-primary",
    );
  });
});
