// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (l: { pathname: string }) => string }) => select(location),
}));
vi.mock("@/lib/auth-link-error", () => ({
  authLinkError: () => null,
  initialAuthLinkError: "Lenken er ugyldig.",
}));
import { AuthLinkErrorBanner } from "./auth-link-error-banner";

afterEach(() => {
  cleanup();
  location.pathname = "/";
});

it("viser feilen bare på siden lenken åpnet, og ikke igjen etter navigasjon", () => {
  const { rerender } = render(<AuthLinkErrorBanner />);
  expect(screen.getByRole("alert").textContent).toContain("Lenken er ugyldig.");
  location.pathname = "/sok";
  rerender(<AuthLinkErrorBanner />);
  expect(screen.queryByRole("alert")).toBeNull();
  location.pathname = "/";
  rerender(<AuthLinkErrorBanner />);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("kan lukkes", () => {
  render(<AuthLinkErrorBanner />);
  act(() => fireEvent.click(screen.getByRole("button", { name: "Lukk meldingen" })));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["/bekreft-epost", "/bedriftsinvitasjon", "/tilbakestill-passord"])(
  "viker for sidens egen lenkefeil på %s",
  (pathname) => {
    window.history.replaceState(null, "", pathname);
    location.pathname = pathname;
    render(<AuthLinkErrorBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    window.history.replaceState(null, "", "/");
  },
);
