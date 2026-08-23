// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppLanding } from "./app-landing";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => true }));
vi.mock("@/hooks/use-form-factor", () => ({ useFormFactor: () => "phone" }));
vi.mock("@/hooks/use-saved-location", () => ({
  useSavedLocation: () => [{ lat: null, lng: null, radius: 20, label: "" }, vi.fn()],
}));
vi.mock("@/components/animated-search-placeholder", () => ({
  AnimatedSearchPlaceholder: () => null,
}));
vi.mock("@/components/app-hero-logo", () => ({ AppHeroLogo: () => null }));
vi.mock("@/components/kaupet-code-dialog", () => ({ KaupetCodeDialog: () => null }));
vi.mock("@/components/ui/native-sheet", () => ({ NativeSheet: () => null }));
vi.mock("@/components/location-filter", () => ({
  LocationPicker: () => (
    <label>
      Sted
      <input />
    </label>
  ),
  RadiusPicker: () => null,
}));

afterEach(cleanup);

describe("AppLanding", () => {
  it("åpner lokasjonsvalget som en navngitt dialog i native bunn-sheet", async () => {
    const { baseElement } = render(<AppLanding />);

    fireEvent.click(screen.getByRole("button", { name: "Velg lokasjon: Hvor som helst" }));

    expect(await screen.findByRole("dialog", { name: "Velg sted" })).toBeTruthy();
    expect(baseElement.querySelector("[data-vaul-drawer]")).not.toBeNull();
  });
});
