// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppLanding } from "./app-landing";

const openPanel = vi.fn();
const navigate = vi.fn();
const submitSearch = vi.hoisted(() => vi.fn());
vi.mock("@/features/listing-search/submit-search", () => ({ submitSearch }));

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
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/listing-card", () => ({ ListingCard: () => null }));
vi.mock("@/components/new-listing-dialog", () => ({ NewListingDialog: () => null }));
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

beforeEach(() => {
  openPanel.mockReset();
  submitSearch.mockReset();
});
afterEach(() => {
  cleanup();
  queryMocks.data = [];
  queryMocks.isError = false;
  queryMocks.refetch.mockReset();
});

describe("AppLanding", () => {
  it("åpner lokasjon og kategorier gjennom søkepanelet", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" }));
    fireEvent.click(screen.getByRole("button", { name: "Alle kategorier" }));

    expect(openPanel.mock.calls).toEqual([["location"], ["categories"]]);
  });

  it("søker direkte fra søkefeltet uten å åpne panelet", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    fireEvent.change(input, { target: { value: " sykkel " } });
    fireEvent.submit(input);

    expect(openPanel).not.toHaveBeenCalled();
    expect(submitSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "sykkel" }));
  });

  it("viser 'Prøv igjen' i stedet for et evigvarende skjelett når populære annonser feiler", () => {
    queryMocks.data = undefined;
    queryMocks.isError = true;

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
  });

  it("avslutter den vertikale listen med en lenke til alle annonser", () => {
    queryMocks.data = [{ listing_id: "a", title: "Sykkel", views_last_week: 0 }];

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Vis alle annonser" }).getAttribute("href")).toBe(
      "/annonser",
    );
  });
});
