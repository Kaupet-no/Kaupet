// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppLanding } from "./app-landing";
import { heroFadeDistances } from "@/components/hero-fade-distances";

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
// Logoen scroller av via useScrollPinnedOffset; offseten styres herfra
// (app-landing eier bare kombinasjonen av festing, fade, fokus og tastatur).
const pinMocks = vi.hoisted(() => ({ offset: 0 }));
vi.mock("@/hooks/use-scroll-pinned-offset", () => ({
  useScrollPinnedOffset: () => pinMocks.offset,
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
  pinMocks.offset = 0;
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

    // Kategorivelgeren ligger i heroen under søkefeltet — det finnes bare én.
    const rail = screen.getByRole("group", { name: "Kategorier" });
    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" }));

    expect(rail.firstElementChild?.getAttribute("aria-label")).toBe("Velg lokasjon: Hele Norge");
    expect(openPanel.mock.calls).toEqual([["location"]]);
  });

  it("viser forslag bare mens søkefeltet har fokus", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    const hero = screen.getByTestId("home-hero");
    expect(hero.className).toContain("z-0");

    expect(screen.queryByText("forslag")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByText("forslag")).toBeTruthy();
    // Forslagsvinduet ligger i heroen: mens det er åpent må heroen ligge
    // over innholdet (z-10), ellers kan et annonsekort ved delvis scroll
    // dekke vinduet. Bunnnaven (z-50) ligger fortsatt øverst.
    expect(hero.className).toContain("z-20");
    fireEvent.blur(input);
    expect(screen.queryByText("forslag")).toBeNull();
    expect(hero.className).toContain("z-0");
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

  it("toner ut søk og kategorivelger med scroll, mens logoen fester til den scroller av", () => {
    const view = render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    const hero = screen.getByTestId("home-hero");
    const logo = screen.getByTestId("home-hero-logo");
    const searchPart = screen.getByTestId("home-hero-search");
    const rail = screen.getByTestId("home-category-rail");
    expect(searchPart.getAttribute("style")).toContain("opacity: 1");
    expect(rail.getAttribute("style")).toContain("opacity: 1");
    // Logoen fader ikke: den står fast (translateY 0) til den scroller av.
    expect(logo.getAttribute("style")).toContain("translateY(0px)");
    expect(logo.getAttribute("style")).not.toContain("opacity");
    expect(hero.hasAttribute("inert")).toBe(false);
    expect(searchPart.hasAttribute("inert")).toBe(false);

    // Søk og velger følger scrollen (i nettleseren med hver sin målte
    // fade-lengde; mocken her leverer én felles verdi).
    fadeMocks.opacity = 0.4;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(searchPart.getAttribute("style")).toContain("opacity: 0.4");
    expect(rail.getAttribute("style")).toContain("opacity: 0.4");
    expect(logo.getAttribute("style")).toContain("translateY(0px)");

    // Fokus i søkefeltet overstyrer fade-en: feltet skal aldri tones ut
    // mens brukeren skriver og tastaturet er oppe. Logo og kategorivelger
    // følger fortsatt scrollen.
    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    fireEvent.focus(input);
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(searchPart.getAttribute("style")).toContain("opacity: 1");
    expect(rail.getAttribute("style")).toContain("opacity: 0.4");

    // Logoen scroller av etter festepunktet, i egen takt — uansett fade.
    pinMocks.offset = -120;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(logo.getAttribute("style")).toContain("translateY(-120px)");

    // Er søk og velger uttonet, men logoen fortsatt hjemme, holdes heroen
    // åpen — logoen er fremdeles synlig og operabelig. Det helt skjulte
    // søkefeltet er derimot ikke aktivt: ingen pekere, fokus eller rolle.
    fireEvent.blur(input);
    fadeMocks.opacity = 0;
    pinMocks.offset = 0;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(false);
    expect(hero.hasAttribute("inert")).toBe(false);
    expect(rail.getAttribute("style")).toContain("pointer-events: none");
    expect(searchPart.getAttribute("style")).toContain("pointer-events: none");
    expect(searchPart.hasAttribute("inert")).toBe(true);
    expect(searchPart.hasAttribute("aria-hidden")).toBe(true);

    // Først når også logoen er scrollet ut av syne, er hele heroen skjult.
    pinMocks.offset = -900;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(true);
    expect(hero.hasAttribute("inert")).toBe(true);
    expect(searchPart.getAttribute("style")).toContain("opacity: 0");
    expect(rail.getAttribute("style")).toContain("opacity: 0");
  });

  it("viser heroens kategorivelger fullt ved swipe, og toner tilbake etter 3 s inaktivitet", () => {
    vi.useFakeTimers();
    try {
      const view = render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      const hero = screen.getByTestId("home-hero");
      const rail = screen.getByTestId("home-category-rail");

      fadeMocks.opacity = 0.3;
      view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      expect(rail.getAttribute("style")).toContain("opacity: 0.3");

      // Sveip (peker ned → opp) i heroens kategorivelger: full synlighet og
      // pekere, uansett hvor langt siden er scrollet.
      fireEvent.pointerDown(rail);
      fireEvent.pointerUp(rail);
      view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      expect(rail.getAttribute("style")).toContain("opacity: 1");
      expect(rail.getAttribute("style")).toContain("pointer-events: auto");
      expect(hero.hasAttribute("inert")).toBe(false);

      // Vertikal sidescroll er ny aktivitet et annet sted: velgeren går med
      // en gang tilbake til scroll-faden, slik at den forsvinner fortest.
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      expect(rail.getAttribute("style")).toContain("opacity: 0.3");

      // Uten sidescroll gjør 3 s uten nye sveip det samme.
      fireEvent.pointerDown(rail);
      fireEvent.pointerUp(rail);
      view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      expect(rail.getAttribute("style")).toContain("opacity: 1");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
      expect(rail.getAttribute("style")).toContain("opacity: 0.3");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gir kategorivelgeren kortest fade-lengde, deretter søkefeltet", () => {
    // Kategorivelgeren ligger nederst i heroen og møter innholdet først.
    const distances = heroFadeDistances({ search: 359, rail: 487 }, 700);
    expect(distances.rail).toBeLessThan(distances.search);
    // Hver del er helt uttonet 48 px før innholdet når den.
    expect(distances.rail).toBe(700 - 487 - 48);
    expect(distances.search).toBe(700 - 359 - 48);
  });

  it("holder en skikkelig fade-lengde på lave skjermer, med rekkefølgen i behold", () => {
    // Smalt rom til innholdet (lav skjerm): målt lengde er bitteliten, så
    // per-dels-minimumene slår inn — og velgeren fader fremdeles først.
    const distances = heroFadeDistances({ search: 600, rail: 620 }, 630);
    expect(distances.rail).toBe(140);
    expect(distances.search).toBe(260);
    expect(distances.rail).toBeLessThan(distances.search);
  });
});
