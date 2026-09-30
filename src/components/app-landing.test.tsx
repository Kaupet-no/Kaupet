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
// Formatfaktoren styres herfra: telefonen har fastlåst hero med fade ved
// scroll, nettbrettet vanlig flyt (se AppLanding).
const formFactorMocks = vi.hoisted(() => ({ factor: "phone" as "phone" | "tablet" }));
// Logoen scroller av via useScrollPinnedOffset (parallaks-fart og fade);
// både offset og faden styres herfra — AppLanding eier bare kombinasjonen
// av festing, fade, fokus og tastatur.
const pinMocks = vi.hoisted(() => ({ offset: 0, opacity: 1 }));
vi.mock("@/hooks/use-scroll-pinned-offset", () => ({
  useScrollPinnedOffset: () => ({ offset: pinMocks.offset, opacity: pinMocks.opacity }),
}));
// Tastaturets synlighet styres herfra: AppLanding må slippe feltfokus når
// tastaturet lukkes uten at feltet blur-es av seg selv (Androids
// tilbake-tast, iOS sin scroll-avvisning).
const keyboardMocks = vi.hoisted(() => ({ visible: false }));
vi.mock("@/hooks/use-keyboard-visible", () => ({
  useKeyboardVisible: () => keyboardMocks.visible,
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
  useFormFactor: () => formFactorMocks.factor,
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
vi.mock("@/components/kaupet-code-dialog", () => ({
  KaupetCodeDialog: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="kaupet-code-trigger">{trigger}</div>
  ),
}));
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
  pinMocks.opacity = 1;
  formFactorMocks.factor = "phone";
  keyboardMocks.visible = false;
});
afterEach(() => {
  cleanup();
  // Rect-spier i konflikt-testene må rives ned selv om en assertasjon
  // feiler før mockRestore(), ellers lekker stubben til påfølgende tester.
  vi.restoreAllMocks();
  queryMocks.data = [];
  queryMocks.isError = false;
  queryMocks.refetch.mockReset();
  sessionStorage.removeItem("kaupet_last_search");
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

    // Heroen ligger alltid over innholdet (z-20): forslagsvinduet må aldri
    // dekkes av annonsekort, og logoen fader ut foran «Populært nå»-
    // bakgrunnen. Bunnnaven (z-50) ligger fortsatt øverst.
    expect(hero.className).toContain("z-20");
    expect(hero.className).not.toContain("z-0");

    expect(screen.queryByText("forslag")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByText("forslag")).toBeTruthy();
    expect(hero.className).toContain("z-20");
    fireEvent.blur(input);
    expect(screen.queryByText("forslag")).toBeNull();
    expect(hero.className).toContain("z-20");
  });

  it("slipper feltfokus når tastaturet lukkes uten at feltet blur-es", () => {
    const view = render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    const hero = screen.getByTestId("home-hero");

    // Ekte fokus (setter document.activeElement, som på native) med
    // tastaturet oppe: forslag vises og heroen ligger over innholdet.
    act(() => input.focus());
    keyboardMocks.visible = true;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(screen.getByText("forslag")).toBeTruthy();
    expect(hero.className).toContain("z-20");

    // Tastaturet lukkes (f.eks. Androids tilbake-tast) mens DOM-fokus
    // fortsatt ligger i feltet: AppLanding må da blur-e feltet, ellers
    // står heroen stille «aktiv» med åpent forslagslag.
    keyboardMocks.visible = false;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(screen.queryByText("forslag")).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it("har Kaupet-kode-knappen som egen hero-del under kategorivelgeren, i stil med «Vis alle annonser»", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    // Knappen er en egen hero-del, ikke en del av kategorivelgeren — den
    // fader derfor ut tidligere enn velgeren (egen, kortere målt vei til
    // innholdet), og ligger under den med luft.
    const rail = screen.getByTestId("home-category-rail");
    const codePart = screen.getByTestId("home-kaupet-code");
    const codeButton = screen.getByRole("button", { name: "Har du en Kaupet-kode?" });
    expect(codePart.contains(codeButton)).toBe(true);
    expect(rail.contains(codePart)).toBe(false);
    expect(codePart.className).toContain("mt-8");
    expect(codePart.previousElementSibling).toBe(rail);
    // Samme stil som «Vis alle annonser»-knappen — vannrett sentrert.
    expect(codeButton.className).toContain("h-12");
    expect(codeButton.className).toContain("rounded-full");
    expect(codeButton.className).toContain("px-6");
    expect(codeButton.className).toContain("outline");
    expect(codeButton.className).toContain("mx-auto");
  });

  it("holder fast flisbredde og etikett inne i flisen, slik at tekst aldri overlapper naboflisen", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    // Overlappingsrotårsaken: i items-center-kolonnen får etikett-spennet
    // innholdsbredde (lengste ordet) og raget ut over flisen — w-full låser
    // det til flisbredden, der orddeling/korting kan virke. Fast flisbredde
    // (w-16) står ved like.
    const tile = screen.getByRole("button", { name: "Velg lokasjon: Hele Norge" });
    expect(tile.className).toContain(" w-16 ");
    const label = screen.getByText("Hele Norge");
    expect(label.className).toContain("w-full");
    expect(label.className).toContain("line-clamp-2");
    expect(label.className).toContain("hyphens-auto");
    // Passer alle flisene på skjermen, sentreres raden (safe center holder
    // venstrejustering når den flyter over). Tailwind v4 genererer ikke
    // justify-[safe_center], derfor en ekte klasse fra styles.css.
    expect(screen.getByRole("group", { name: "Kategorier" }).className).toContain(
      "category-rail-scroll",
    );
  });

  it("søker direkte fra søkefeltet uten å åpne panelet", () => {
    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    fireEvent.change(input, { target: { value: " sykkel " } });
    fireEvent.submit(input);

    expect(openPanel).not.toHaveBeenCalled();
    expect(submitSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "sykkel" }));
  });

  it("viser «Fortsett der du slapp» før «Populært nå»", () => {
    // ResumeSearch trenger enten lagrede søk eller et siste søk i økten.
    sessionStorage.setItem(
      "kaupet_last_search",
      JSON.stringify({ search: { q: "sykkel" }, label: "sykkel i Oslo" }),
    );
    queryMocks.data = [{ listing_id: "a", title: "Sykkel", views_last_week: 0 }];

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    const resume = screen.getByRole("heading", { name: "Fortsett der du slapp" });
    const popular = screen.getByRole("heading", { name: "Nye annonser" });
    expect(resume.compareDocumentPosition(popular) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(logo.getAttribute("style")).toContain("opacity: 1");
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

    // Innholdet har tatt igjen logoen og glir opp over den: logoen toner
    // ut i takt med dekningen (her styrt av mocken), ikke ved å endre fart.
    pinMocks.opacity = 0.4;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(logo.getAttribute("style")).toContain("translateY(-120px)");
    expect(logo.getAttribute("style")).toContain("opacity: 0.4");

    // Er søk og velger uttonet, men logoen fortsatt synlig, holdes heroen
    // åpen — logoen er fremdeles operabelig. Det helt skjulte
    // søkefeltet er derimot ikke aktivt: ingen pekere, fokus eller rolle.
    fireEvent.blur(input);
    fadeMocks.opacity = 0;
    pinMocks.offset = 0;
    pinMocks.opacity = 1;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(false);
    expect(hero.hasAttribute("inert")).toBe(false);
    expect(rail.getAttribute("style")).toContain("pointer-events: none");
    expect(searchPart.getAttribute("style")).toContain("pointer-events: none");
    expect(searchPart.hasAttribute("inert")).toBe(true);
    expect(searchPart.hasAttribute("aria-hidden")).toBe(true);

    // Først når også logoen er uttonet bak innholdet, er hele heroen skjult.
    pinMocks.offset = -900;
    pinMocks.opacity = 0;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(true);
    expect(hero.hasAttribute("inert")).toBe(true);
    expect(searchPart.getAttribute("style")).toContain("opacity: 0");
    expect(rail.getAttribute("style")).toContain("opacity: 0");
    expect(logo.getAttribute("style")).toContain("opacity: 0");
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

  it("nettbrett: hero i vanlig flyt uten fade, og populære annonser rett under kategorivelgeren", () => {
    formFactorMocks.factor = "tablet";
    queryMocks.data = [{ listing_id: "a", title: "Sykkel", views_last_week: 0 }];
    sessionStorage.setItem(
      "kaupet_last_search",
      JSON.stringify({ search: { q: "sykkel" }, label: "sykkel i Oslo" }),
    );
    const view = render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    // Ingen fastlåst hero: verken fixed, pekerkoll eller parallaks på
    // logoen, og ingen viewport-reserverende spacer — men nøyaktig
    // mobilens plassering: hero-blokken fyller første skjermbilde med
    // elementene midtstilt.
    const hero = screen.getByTestId("home-hero");
    const logo = screen.getByTestId("home-hero-logo");
    expect(hero.className).not.toContain("fixed");
    expect(hero.className).not.toContain("pointer-events-none");
    expect(hero.className).toContain("min-h-dvh");
    expect(hero.className).toContain("items-center");
    expect(logo.getAttribute("style")).toBeNull();
    expect(document.querySelector(".h-dvh")).toBeNull();

    // «Fortsett der du slapp» ligger låst til bunnen av heroen (synlig
    // nederst på skjermen uten å scrolle) — og bare der, ikke i flyten
    // under også.
    const pin = screen.getByTestId("home-resume-pin");
    expect(pin.className).toContain("absolute");
    expect(pin.className).toContain("bottom-3");
    expect(hero.contains(pin)).toBe(true);
    expect(screen.getAllByRole("heading", { name: "Fortsett der du slapp" })).toHaveLength(1);

    // Kategorivelgeren går over hele sidebredden på nettbrett: kolonnen er
    // fullbredde (ingen max-w-xl), så velgerens egne negative margerer
    // bringer den helt ut til kantene.
    const rail = screen.getByTestId("home-category-rail");
    expect(rail.parentElement?.className).not.toContain("max-w-xl");
    expect(screen.getByTestId("home-hero-search").className).toContain("max-w-xl");

    // Scroll skal ikke røre heroen: fade- og festemockene er avslått på
    // nettbrett, og heroen skjules aldri.
    fadeMocks.opacity = 0;
    pinMocks.offset = -900;
    pinMocks.opacity = 0;
    view.rerender(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);
    expect(hero.hasAttribute("aria-hidden")).toBe(false);
    expect(hero.hasAttribute("inert")).toBe(false);
    expect(logo.getAttribute("style")).toBeNull();

    // «Populært nå»/«Nye annonser» ligger i flyten etter heroen og hentes
    // umiddelbart — ikke først etter scroll (POPULAR_LOAD_AFTER_...).
    expect(screen.getByRole("heading", { name: /Populært nå|Nye annonser/ })).toBeTruthy();
    expect(lastPopularCall()?.enabled).toBe(true);
  });

  it("nettbrett: flytter «Fortsett der du slapp» ned i flyten når den ville kollidert med kodeknappen", () => {
    formFactorMocks.factor = "tablet";
    sessionStorage.setItem(
      "kaupet_last_search",
      JSON.stringify({ search: { q: "sykkel" }, label: "sykkel i Oslo" }),
    );
    // jsdom har ingen layout, så rekt-målingene stubbes: kodeknappens bunn
    // ligger nær viewporten (700 av 768) og seksjonen er 100 px høy —
    // mindre rom enn seksjonen trenger, altså konflikt.
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ bottom: 700, height: 100 } as DOMRect);

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    // Konflikten flytter seksjonen ut av hero-pin og ned i innholdsflyten
    // — bare én seksjon, aldri begge plasseringene.
    expect(screen.queryByTestId("home-resume-pin")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Fortsett der du slapp" })).toHaveLength(1);

    rectSpy.mockRestore();
  });

  it("nettbrett: konfliktmålingen er uavhengig av scrollposisjon", () => {
    formFactorMocks.factor = "tablet";
    sessionStorage.setItem(
      "kaupet_last_search",
      JSON.stringify({ search: { q: "sykkel" }, label: "sykkel i Oslo" }),
    );
    // Brukeren har scrollet: kodeknappen er godt over viewporten
    // (rect.bottom = -2000, scrollY = 2100), men i dokumentkoordinater
    // står den 100 px ned — og en 700 px høy seksjon får ikke plass i det
    // som er igjen av skjermhøyde. Med viewport-koordinater ville
    // målingen gitt «godt med rom» og seksjonen blitt værende i pin.
    Object.defineProperty(window, "scrollY", { value: 2100, configurable: true, writable: true });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ bottom: -2000, height: 700 } as DOMRect);

    render(<AppLanding adPickerOpen={false} onAdPickerOpenChange={vi.fn()} />);

    expect(screen.queryByTestId("home-resume-pin")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Fortsett der du slapp" })).toHaveLength(1);

    rectSpy.mockRestore();
  });

  it("gir Kaupet-kode-knappen kortest fade-lengde, deretter kategorivelgeren, deretter søkefeltet", () => {
    // Kaupet-kode-knappen ligger nederst i heroen og møter innholdet først.
    const distances = heroFadeDistances({ search: 359, rail: 487, code: 540 }, 700);
    expect(distances.code).toBeLessThan(distances.rail);
    expect(distances.rail).toBeLessThan(distances.search);
    // Hver del er helt uttonet 48 px før innholdet når den.
    expect(distances.code).toBe(700 - 540 - 48);
    expect(distances.rail).toBe(700 - 487 - 48);
    expect(distances.search).toBe(700 - 359 - 48);
  });

  it("holder en skikkelig fade-lengde på lave skjermer, med rekkefølgen i behold", () => {
    // Smalt rom til innholdet (lav skjerm): målt lengde er bitteliten, så
    // per-dels-minimumene slår inn — og rekkefølgen (kodeknappen forsvinner
    // først) gjelder fremdeles.
    const distances = heroFadeDistances({ search: 600, rail: 620, code: 625 }, 630);
    expect(distances.code).toBe(100);
    expect(distances.rail).toBe(140);
    expect(distances.search).toBe(260);
    expect(distances.code).toBeLessThan(distances.rail);
    expect(distances.rail).toBeLessThan(distances.search);
  });
});
