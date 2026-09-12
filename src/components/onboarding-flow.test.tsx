// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingFlow } from "./onboarding-flow";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  searches: [] as { notify: boolean }[],
  permission: "default" as NotificationPermission,
  enableOnThisDevice: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.searches }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/auth">{children}</a>,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));
vi.mock("@/hooks/use-push-status", () => ({
  usePushStatus: () => ({
    loading: false,
    supported: true,
    permission: mocks.permission,
    enableOnThisDevice: mocks.enableOnThisDevice,
  }),
}));
vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));
vi.mock("@/lib/native-offline", () => ({ setBackOverride: vi.fn() }));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: vi.fn() }));
vi.mock("@/components/ui/fullscreen-overlay", () => ({
  FullscreenOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  FullscreenOverlayContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mocks.user = null;
  mocks.authLoading = false;
  mocks.searches = [];
  mocks.permission = "default";
  mocks.enableOnThisDevice.mockClear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

describe("OnboardingFlow", () => {
  it("gir utlogget bruker 3 kort, med utforsk/logg inn-knapper først på siste", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: `Gå til kort ${1}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gå til kort 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gå til kort 4" })).toBeNull();

    // Knappene for å fullføre onboarding vises ikke før siste kort
    expect(screen.queryByRole("button", { name: "Utforsk Kaupet" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kom i gang" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 3" }));

    expect(screen.getByRole("button", { name: "Utforsk Kaupet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Logg inn og hent lagrede søk" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ja, varsle meg" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Utforsk Kaupet" }));
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("lar innlogget bruker uten push-tilbud fullføre onboarding fra siste kort", () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [];

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Gå til kort 4" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 3" }));

    // Siste kort for innlogget bruker uten push-tilbud: chevronen fullfører direkte.
    expect(screen.getByRole("button", { name: "Kom i gang" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kom i gang" }));
  });

  it("utsetter push når innlogget bruker ikke har varslende lagrede søk", () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [{ notify: false }];

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Ja, varsle meg" })).toBeNull();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("viser konkret antall og ber bare om push etter eksplisitt handling", async () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [{ notify: true }, { notify: false }, { notify: true }, { notify: true }];

    render(<OnboardingFlow onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 4" }));

    expect(screen.getByText(/Du har 3 lagrede søk med varsling/)).toBeTruthy();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ja, varsle meg" }));

    await waitFor(() => expect(mocks.enableOnThisDevice).toHaveBeenCalledWith("saved_searches"));
  });

  it("lar eksisterende restore håndtere allerede gitt tillatelse stille", () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [{ notify: true }];
    mocks.permission = "granted";

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Ja, varsle meg" })).toBeNull();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("spør ikke på nytt når varslingstillatelsen er avslått", () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [{ notify: true }];
    mocks.permission = "denied";

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Ja, varsle meg" })).toBeNull();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("eksponerer og aktiverer bare gjeldende kort", () => {
    mocks.user = { id: "user-1" };
    mocks.searches = [{ notify: true }];

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Kom i gang" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ja, varsle meg" })).toBeNull();
    expect(
      screen
        .getByText("Få beskjed om nye treff")
        .closest("[aria-hidden='true']")
        ?.hasAttribute("inert"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 4" }));

    expect(screen.getByRole("button", { name: "Ja, varsle meg" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kom i gang" })).toBeNull();
    expect(
      screen
        .getByText("Finn, kjøp og selg brukt")
        .closest("[aria-hidden='true']")
        ?.hasAttribute("inert"),
    ).toBe(true);
  });
});
