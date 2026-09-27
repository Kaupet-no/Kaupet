// @vitest-environment jsdom
//
// Filnavnet har "-"-prefiks med vilje: TanStack Start plukker opp alt under
// src/routes/ som rutefiler, og uten prefikset advarer dev-serveren om at
// denne fila ikke eksporterer en Route. Vitest sitt glob (src/**/*.test.tsx)
// treffer den fortsatt.

import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: {} as { opprett?: boolean },
  native: true,
  user: null as { id: string } | null,
  authLoading: false,
}));

vi.mock("@tanstack/react-router", () => ({
  // `LandingPage` isn't exported from index.tsx — exporting it breaks
  // TanStack Start's automatic route code-splitting (confirmed by `bun run
  // build` dropping "/" from the preload manifest entirely). It's reached
  // here the same way the router reaches it: via `Route.options.component`.
  createFileRoute: () => (options: unknown) => ({
    useSearch: () => mocks.search,
    options,
  }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, ...props }: { children?: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => mocks.native }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-form-factor", () => ({
  useFormFactor: () => "phone",
  useIsDesktop: () => false,
  useIsNarrow: () => true,
}));
vi.mock("@/features/listing-search/search-panel/search-panel-context", () => ({
  useSearchPanel: () => ({
    openPanel: vi.fn(),
    savedLocation: { lat: null, lng: null, radius: 25, label: "" },
  }),
}));
vi.mock("@/components/animated-search-placeholder", () => ({
  AnimatedSearchPlaceholder: () => null,
}));
vi.mock("@/components/app-hero-logo", () => ({ AppHeroLogo: () => null }));
vi.mock("@/components/kaupet-code-dialog", () => ({
  KaupetCodeDialog: () => null,
  KaupetCodeForm: () => null,
}));
vi.mock("@/lib/category-suggestion.functions", () => ({
  prefetchCategorySuggestion: vi.fn(),
}));

import { Route } from "./index";

const LandingPage = Route.options.component as ComponentType;

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.search = {};
  mocks.native = true;
  mocks.user = null;
  mocks.authLoading = false;
  localStorage.setItem("kaupet_onboarding_completed_v1", "true");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Se "opprett"-kommentaren i index.tsx: en direktelenke til /ny-annonse uten
// utkast/type redirecter hit med ?opprett=1, og typevelgeren skal åpnes med
// en gang — likt på web og native (docs/TESTSTRATEGI.md M4).
describe("LandingPage (native-skallet)", () => {
  it("åpner typevelgeren når ?opprett er satt og bruker er innlogget", () => {
    mocks.search = { opprett: true };
    mocks.user = { id: "user-1" };

    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Hva vil du opprette?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Jeg vil selge/ })).toBeTruthy();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", search: {}, replace: true });
  });

  it("åpner ikke typevelgeren uten ?opprett", () => {
    mocks.user = { id: "user-1" };

    render(<LandingPage />);

    expect(screen.queryByRole("heading", { name: "Hva vil du opprette?" })).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("åpner typevelgeren når ?opprett er satt for utlogget bruker også", () => {
    mocks.search = { opprett: true };
    mocks.user = null;

    render(<LandingPage />);

    // Gjestedraft (2026-09-06): utloggede får samme velger, ikke /auth.
    expect(screen.getByRole("heading", { name: "Hva vil du opprette?" })).toBeTruthy();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", search: {}, replace: true });
  });
});
