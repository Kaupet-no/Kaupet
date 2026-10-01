// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingFlow } from "./onboarding-flow";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  permission: "default" as NotificationPermission,
  enableOnThisDevice: vi.fn().mockResolvedValue(undefined),
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/auth">{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}));
vi.mock("@marsidev/react-turnstile", () => ({ Turnstile: () => null }));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));
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
  mocks.permission = "default";
  mocks.enableOnThisDevice.mockClear();
  mocks.signInWithPassword.mockClear();
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
  it("gir utlogget bruker innlogging som eget, siste kort med hopp over", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    try {
      render(<OnboardingFlow onComplete={onComplete} />);

      expect(screen.getByRole("button", { name: "Gå til kort 2" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Gå til kort 3" })).toBeNull();

      // Innloggingen er ikke tilgjengelig før siste kort
      expect(screen.queryByRole("button", { name: "Hopp over" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Logg inn" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Kom i gang" }));
      expect(screen.getByRole("button", { name: "Logg inn" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Slå på varsler" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Hopp over" }));
      vi.runAllTimers();
      expect(onComplete).toHaveBeenCalled();
      expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aktiverer siste kort når brukeren sveiper i stedet for å trykke", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);

    const lastCard = screen.getByText("Hopp over").closest("[inert]");
    expect(lastCard).toBeTruthy();

    const scroller = lastCard!.parentElement!;
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 400 });
    scroller.scrollLeft = 400;
    fireEvent.scroll(scroller);

    expect(screen.getByRole("button", { name: "Hopp over" })).toBeTruthy();
    expect(screen.getByText("Hopp over").closest("[inert]")).toBeNull();
  });

  it("logger inn fra siste kort og blir stående der etterpå", async () => {
    const { rerender } = render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 2" }));

    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: " kari@eksempel.no " } });
    fireEvent.change(screen.getByLabelText("Passord"), { target: { value: "hemmelig" } });
    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));

    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "kari@eksempel.no",
        password: "hemmelig",
        options: { captchaToken: undefined },
      }),
    );

    mocks.user = { id: "user-1" };
    rerender(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.getByText("Du er logget inn")).toBeTruthy();
    // Innlogget nå: push-tilbudet kommer som neste kort.
    expect(screen.getByRole("button", { name: "Neste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gå til kort 3" })).toBeTruthy();
  });

  it("lar innlogget bruker uten push-tilbud fullføre onboarding fra velkomstkortet", () => {
    vi.useFakeTimers();
    mocks.user = { id: "user-1" };
    mocks.permission = "denied";
    const onComplete = vi.fn();
    try {
      render(<OnboardingFlow onComplete={onComplete} />);

      expect(screen.queryByRole("button", { name: "Gå til kort 2" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Kom i gang" }));
      vi.runAllTimers();
      expect(onComplete).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("viser de tre løftene på velkomstkortet", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.getByText("Gratis å legge ut annonser")).toBeTruthy();
    expect(screen.getByText("Ingen sporing av brukeraktivitet")).toBeTruthy();
    expect(screen.getByText("100% åpen kildekode")).toBeTruthy();
  });

  it("nevner alle varseltypene og ber bare om push etter eksplisitt handling", async () => {
    mocks.user = { id: "user-1" };

    render(<OnboardingFlow onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 2" }));

    expect(screen.getByText(/lagret søk.*melding.*favoritt/)).toBeTruthy();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Slå på varsler" }));

    // Uten type: brukerens eksisterende valg for alle tre typene gjelder.
    await waitFor(() => expect(mocks.enableOnThisDevice).toHaveBeenCalledWith());
  });

  it("lar eksisterende restore håndtere allerede gitt tillatelse stille", () => {
    mocks.user = { id: "user-1" };
    mocks.permission = "granted";

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Slå på varsler" })).toBeNull();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("spør ikke på nytt når varslingstillatelsen er avslått", () => {
    mocks.user = { id: "user-1" };
    mocks.permission = "denied";

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Slå på varsler" })).toBeNull();
    expect(mocks.enableOnThisDevice).not.toHaveBeenCalled();
  });

  it("eksponerer og aktiverer bare gjeldende kort", () => {
    mocks.user = { id: "user-1" };

    render(<OnboardingFlow onComplete={vi.fn()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Kom i gang" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Slå på varsler" })).toBeNull();
    expect(
      screen.getByText("Vil du ha varsler?").closest("[aria-hidden='true']")?.hasAttribute("inert"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Gå til kort 2" }));

    expect(screen.getByRole("button", { name: "Slå på varsler" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kom i gang" })).toBeNull();
    expect(
      screen.getByText("Velkommen til").closest("[aria-hidden='true']")?.hasAttribute("inert"),
    ).toBe(true);
  });
});
