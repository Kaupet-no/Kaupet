// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchSummaryPill } from "./search-summary-pill";

vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));

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
});
