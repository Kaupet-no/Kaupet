// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

const lookupBusinessOrganizationMock = vi.fn();
const bindBusinessSignupEmailMock = vi.fn();
const signUpMock = vi.fn();
const resendMock = vi.fn();
const onAuthenticatedMock = vi.fn();

vi.mock("@/lib/business.functions", () => ({
  lookupBusinessOrganization: (...args: unknown[]) => lookupBusinessOrganizationMock(...args),
  bindBusinessSignupEmail: (...args: unknown[]) => bindBusinessSignupEmailMock(...args),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
      resend: (...args: unknown[]) => resendMock(...args),
    },
  },
}));
vi.mock("@/lib/native", () => ({ isNative: () => false }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn() }));
vi.mock("@marsidev/react-turnstile", () => ({ Turnstile: () => null }));

import { BusinessSignupFlow } from "./business-signup-flow";

const organization = {
  signupToken: "11111111-1111-4111-8111-111111111111",
  organizationNumber: "974760673",
  legalName: "REGISTERENHETEN I BRØNNØYSUND",
  postalCode: "8901",
  city: "BRØNNØYSUND",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function lookup() {
  fireEvent.change(screen.getByLabelText("Organisasjonsnummer"), {
    target: { value: "974 760 673" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Søk" }));
}

async function reachProfile() {
  lookup();
  await screen.findByRole("heading", { name: "Bekreft bedriften" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Bekreft bedriften og fullmakt" }));
  fireEvent.click(screen.getByRole("button", { name: "Fortsett" }));
  await screen.findByRole("heading", { name: "Opprett profilen din" });
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  lookupBusinessOrganizationMock.mockReset().mockResolvedValue(organization);
  bindBusinessSignupEmailMock.mockReset().mockResolvedValue({ email: "kari@example.com" });
  signUpMock.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  resendMock.mockReset().mockResolvedValue({ error: null });
  onAuthenticatedMock.mockReset().mockResolvedValue(undefined);
});

describe("BusinessSignupFlow", () => {
  it("starts at step one with an accessible organization-number field", () => {
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);

    expect(screen.getByRole("heading", { name: "Finn bedriften din" })).toBeTruthy();
    expect(screen.getByLabelText("Organisasjonsnummer").getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByLabelText("Steg 1 av 3")).toBeTruthy();
    expect(screen.queryByText("Opprett profilen din")).toBeNull();
  });

  it("rejects invalid check digits before making a server lookup", () => {
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);
    fireEvent.change(screen.getByLabelText("Organisasjonsnummer"), {
      target: { value: "974 760 674" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Søk" }));

    expect(screen.getByRole("alert").textContent).toContain("kontrollsiffer");
    expect(lookupBusinessOrganizationMock).not.toHaveBeenCalled();
  });

  it("shows lookup loading status and then requires explicit mandate confirmation", async () => {
    let resolvePromise!: (value: typeof organization) => void;
    const lookupPromise = new Promise<typeof organization>((resolve) => {
      resolvePromise = resolve;
    });
    const resolveLookup = (value: typeof organization) => resolvePromise(value);
    lookupBusinessOrganizationMock.mockReturnValueOnce(lookupPromise);
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);
    lookup();

    expect(screen.getByRole("status").textContent).toContain("Søker i Brønnøysundregistrene");
    expect((screen.getByRole("button", { name: "Søk" }) as HTMLButtonElement).disabled).toBe(true);
    resolveLookup(organization);
    await screen.findByRole("heading", { name: "Bekreft bedriften" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Bekreft bedriften" }),
      ),
    );

    expect(screen.getByText("REGISTERENHETEN I BRØNNØYSUND")).toBeTruthy();
    expect(screen.getByText("974 760 673")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Fortsett" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/har fullmakt til å opprette konto/)).toBeTruthy();
  });

  it("viser duplicatefeil med maskert kontaktperson og supportadresse", async () => {
    lookupBusinessOrganizationMock.mockRejectedValueOnce(
      new Error(
        "Denne bedriften er allerede registrert på Kaupet. Bedriftens kontaktperson er ka***@ex***.com. Du kan også kontakte support på kontakt@kaupet.no.",
      ),
    );
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);
    lookup();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Denne bedriften er allerede registrert på Kaupet.",
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain("ka***@ex***.com");
    expect(screen.getByRole("alert").textContent).toContain("kontakt@kaupet.no");
    expect(screen.getByRole("alert").textContent).not.toContain("Kari.Nordmann@example.com");
    expect(screen.getByRole("heading", { name: "Finn bedriften din" })).toBeTruthy();
  });

  it("binds email before signup, stores business metadata, and supports resend", async () => {
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);
    await reachProfile();
    expect(screen.getByRole("link", { name: "brukervilkårene" }).getAttribute("href")).toBe(
      "/vilkar",
    );
    expect(screen.getByRole("link", { name: "personvernerklæringen" }).getAttribute("href")).toBe(
      "/personvern",
    );

    fireEvent.change(screen.getByLabelText("Navn"), { target: { value: "Kari Nordmann" } });
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "KARI@example.com" } });
    fireEvent.change(screen.getByLabelText("Passord"), { target: { value: "hemmelig123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /brukervilkårene/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opprett bedriftskonto" }));

    await screen.findByRole("heading", { name: "Sjekk e-posten din" });
    expect(bindBusinessSignupEmailMock).toHaveBeenCalledWith({
      data: { signupToken: organization.signupToken, email: "kari@example.com" },
    });
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "KARI@example.com",
        options: expect.objectContaining({
          emailRedirectTo: `${window.location.origin}/bekreft-epost`,
          data: expect.objectContaining({
            display_name: "Kari Nordmann",
            terms_accepted_version: "1.0",
            business_signup_token: organization.signupToken,
            business_terms_accepted_version: "1.0",
          }),
        }),
      }),
    );

    const resendButton = screen.getByRole("button", { name: "Send bekreftelses-e-post på nytt" });
    fireEvent.click(resendButton);
    await waitFor(() =>
      expect(resendMock).toHaveBeenCalledWith({
        type: "signup",
        email: "KARI@example.com",
        options: { emailRedirectTo: `${window.location.origin}/bekreft-epost` },
      }),
    );
    expect((resendButton as HTMLButtonElement).disabled).toBe(true);
    expect(resendButton.textContent).toContain("5:00");

    fireEvent.click(resendButton);
    expect(resendMock).toHaveBeenCalledTimes(1);
  });
  it("går videre når signup returnerer en aktiv sesjon", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });
    render(<BusinessSignupFlow onAuthenticated={onAuthenticatedMock} />);
    await reachProfile();

    fireEvent.change(screen.getByLabelText("Navn"), { target: { value: "Kari Nordmann" } });
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "KARI2@example.com" } });
    fireEvent.change(screen.getByLabelText("Passord"), { target: { value: "hemmelig123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /brukervilkårene/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opprett bedriftskonto" }));

    await waitFor(() => expect(onAuthenticatedMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Sjekk e-posten din" })).toBeNull();
  });
});
