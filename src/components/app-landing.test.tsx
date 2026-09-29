// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  calls: [] as Array<{ queryKey?: unknown[]; enabled?: boolean }>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[]; enabled?: boolean }) => {
    queryMocks.calls.push(options);
    return {
      data: queryMocks.data,
      isError: queryMocks.isError,
      refetch: queryMocks.refetch,
    };
  },
}));
// Fade-verdien styres herfra (app-landing eier bare kombinasjonen av fade,
// fokus og tastatur); useScrollFadeOpacity har sin egen oppførsel i nettleser.
const fadeMocks = vi.hoisted(() => ({ opacity: 1 }));
vi.mock("@/hooks/use-scroll-fade-opacity", () => ({
  useScrollFadeOpacity: () => fadeMocks.opacity,
}));
vi.mock("@/hooks/use-keyboard-visible", () => ({
  useKeyboardVisible: () => false,
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
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/features/listing-search/search-suggestions-layer", () => ({
  SearchSuggestionsLayer: () => <div>forslag</div>,
}));

beforeEach(() => {
  openPanel.mockReset();
  submitSearch.mockReset();
  queryMocks.calls = [];
  fadeMocks.opacity = 1;
});
afterEach(() => {
  cleanup();
  queryMocks.data = [];
  queryMocks.isError = false;
  queryMocks.refetch.mockReset();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});

/** Siste kall mot useQuery for populære annonser (appen bruker flere queries). */
function lastPopularCall() {
  const calls = queryMocks.calls.filter(
    (c) => (c.queryKey as unknown[] | undefined)?.[0] === "popular-listings-last-week",
  );
  return calls[calls.length - 1];
}

describe("AppLanding", () => {
  it("åpner lokasjon gjennom søkepanelet som første valg i kategoriraden", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    const row = screen.getByRole("group", { name: "Kategorier" });
    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" }));

    expect(row.firstElementChild?.getAttribute("aria-label")).toBe("Velg lokasjon: Hele Norge");
    expect(openPanel.mock.calls).toEqual([["location"]]);
  });

  it("viser forslag bare mens søkefeltet har fokus", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });

    expect(screen.queryByText("forslag")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByText("forslag")).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByText("forslag")).toBeNull();
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

  it("henter ikke populære annonser før brukeren har scrollet", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    expect(lastPopularCall()?.enabled).toBe(false);

    act(() => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });

    expect(lastPopularCall()?.enabled).toBe(true);
  });

  it("toner ut heroen med scroll, men holder søkefeltet fullt synlig mens det er i fokus", () => {
    const view = render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    const hero = screen.getByTestId("home-hero");
    expect(hero.getAttribute("style")).toContain("opacity: 1");
    expect(hero.hasAttribute("inert")).toBe(false);

    fadeMocks.opacity = 0.4;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.getAttribute("style")).toContain("opacity: 0.4");

    // Fokus i søkefeltet overstyrer fade-en: feltet skal aldri tones ut
    // mens brukeren skriver og tastaturet er oppe.
    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    fireEvent.focus(input);
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.getAttribute("style")).toContain("opacity: 1");

    // Helt uttonet hero er usynlig, utenfor tab-rekkefølgen og uten pekere.
    fireEvent.blur(input);
    fadeMocks.opacity = 0;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(true);
    expect(hero.hasAttribute("inert")).toBe(true);
  });
});
