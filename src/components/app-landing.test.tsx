// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppLanding } from "./app-landing";

const openPanel = vi.fn();

const queryMocks = vi.hoisted(() => ({
  data: [] as unknown[] | undefined,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: queryMocks.data,
    isError: queryMocks.isError,
    refetch: queryMocks.refetch,
  }),
}));
vi.mock("@/hooks/use-form-factor", () => ({
  useFormFactor: () => "phone",
  useIsDesktop: () => false,
  useIsNarrow: () => true,
}));
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
afterEach(() => {
  cleanup();
  queryMocks.data = [];
  queryMocks.isError = false;
  queryMocks.refetch.mockReset();
});

describe("AppLanding", () => {
  it("åpner søk, lokasjon og kategorier gjennom samme panel", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Åpne søk i annonser" }));
    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" }));
    fireEvent.click(screen.getByRole("button", { name: "Alle kategorier" }));

    expect(openPanel.mock.calls).toEqual([["query"], ["location"], ["categories"]]);
  });

  it("viser 'Prøv igjen' i stedet for et evigvarende skjelett når populære annonser feiler", () => {
    queryMocks.data = undefined;
    queryMocks.isError = true;

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
  });
});
