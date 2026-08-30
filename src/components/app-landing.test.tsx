// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppLanding } from "./app-landing";

const openPanel = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-form-factor", () => ({ useFormFactor: () => "phone" }));
vi.mock("@/features/listing-search/search-panel/search-panel-context", () => ({
  useSearchPanel: () => ({
    openPanel,
    savedLocation: { lat: null, lng: null, radius: 25, label: "" },
  }),
}));
vi.mock("@/components/animated-search-placeholder", () => ({
  AnimatedSearchPlaceholder: () => null,
}));
vi.mock("@/components/app-hero-logo", () => ({ AppHeroLogo: () => null }));
vi.mock("@/components/kaupet-code-dialog", () => ({ KaupetCodeDialog: () => null }));

beforeEach(() => openPanel.mockReset());
afterEach(cleanup);

describe("AppLanding", () => {
  it("åpner søk, lokasjon og kategorier gjennom samme panel", () => {
    render(<AppLanding />);

    fireEvent.click(screen.getByRole("button", { name: "Åpne søk i annonser" }));
    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" }));
    fireEvent.click(screen.getByRole("button", { name: "Alle kategorier" }));

    expect(openPanel.mock.calls).toEqual([["query"], ["location"], ["categories"]]);
  });
});
